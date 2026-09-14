import fs from 'fs';
import path from 'path';
import { Router, Request, Response, NextFunction } from 'express';
import { getPool, sql } from '../db';
import { mapAttachmentRow } from '../mappers';
import { uploadLeadAttachments, contentTypeFor, isInlineViewable, leadFolder, reserveDeletedFileName, MAX_FILE_SIZE_BYTES } from '../uploads';

const router = Router();

// Also stashes the lead's EnquiryNumber on the request - the multer storage
// callbacks (destination/filename) need it to place the file in the right
// enquiry-numbered folder, and can't look it up themselves (no DB access there).
async function ensureLeadExists(req: Request, res: Response, next: NextFunction) {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId)) return res.status(400).json({ error: 'Invalid lead id' });
  try {
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, leadId).query('SELECT EnquiryNumber FROM dbo.Leads WHERE Id = @id AND IsDeleted = 0');
    if (!result.recordset.length) return res.status(404).json({ error: 'Lead not found' });
    (req as any).enquiryNumber = result.recordset[0].EnquiryNumber;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to look up lead' });
  }
}

// GET /api/leads/:id/attachments
router.get('/leads/:id/attachments', ensureLeadExists, async (req: Request, res: Response) => {
  try {
    const leadId = Number(req.params.id);
    const pool = await getPool();
    const result = await pool
      .request()
      .input('leadId', sql.Int, leadId)
      .query('SELECT * FROM dbo.LeadAttachments WHERE LeadId = @leadId AND IsDeleted = 0 ORDER BY CreatedAt DESC');
    res.json(result.recordset.map(mapAttachmentRow));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

// POST /api/leads/:id/attachments - multipart upload, field name "files" (up to 10)
router.post(
  '/leads/:id/attachments',
  ensureLeadExists,
  (req: Request, res: Response, next: NextFunction) => {
    uploadLeadAttachments.array('files', 10)(req, res, (err: any) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: `Each file must be under ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB` });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Too many files in one upload (max 10)' });
      }
      res.status(400).json({ error: err.message || 'Upload failed' });
    });
  },
  async (req: Request, res: Response) => {
    const leadId = Number(req.params.id);
    const files = (req.files as Express.Multer.File[]) || [];

    if (!files.length) return res.status(400).json({ error: 'No files were uploaded' });

    try {
      const pool = await getPool();
      const inserted = [];
      for (const file of files) {
        const result = await pool
          .request()
          .input('leadId', sql.Int, leadId)
          .input('fileName', sql.NVarChar, file.filename)
          .input('contentType', sql.NVarChar, contentTypeFor(file.originalname))
          .input('fileSizeBytes', sql.BigInt, file.size)
          .query(`
            INSERT INTO dbo.LeadAttachments (LeadId, FileName, ContentType, FileSizeBytes)
            OUTPUT INSERTED.*
            VALUES (@leadId, @fileName, @contentType, @fileSizeBytes)
          `);
        inserted.push(mapAttachmentRow(result.recordset[0]));
      }
      res.status(201).json(inserted);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to save attachment records' });
    }
  }
);

// GET /api/attachments/:id/file - streams the file (inline for images/PDF/video, download otherwise)
router.get('/attachments/:id/file', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid attachment id' });

  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`
        SELECT A.*, L.EnquiryNumber
        FROM dbo.LeadAttachments A JOIN dbo.Leads L ON L.Id = A.LeadId
        WHERE A.Id = @id AND A.IsDeleted = 0
      `);
    if (!result.recordset.length) return res.status(404).json({ error: 'Attachment not found' });

    const row = result.recordset[0];
    const filePath = path.join(leadFolder(row.EnquiryNumber), row.FileName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File is missing on disk' });

    const disposition = isInlineViewable(row.FileName) ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(row.FileName)}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', row.ContentType);

    // Range support - required for video seeking, and for the browser trick
    // that shows a specific frame (?#t=..) as a thumbnail without playback.
    const stat = fs.statSync(filePath);
    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? parseInt(match[1], 10) : 0;
      const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`);
        return res.end();
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', String(stat.size));
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch attachment' });
  }
});

// DELETE /api/attachments/:id - soft-delete (file stays on disk, matching the
// soft-delete convention used for leads/customers elsewhere in this app)
router.delete('/attachments/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid attachment id' });

  try {
    const pool = await getPool();
    const lookup = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`
        SELECT A.FileName, L.EnquiryNumber
        FROM dbo.LeadAttachments A JOIN dbo.Leads L ON L.Id = A.LeadId
        WHERE A.Id = @id AND A.IsDeleted = 0
      `);
    if (!lookup.recordset.length) return res.status(404).json({ error: 'Attachment not found' });

    const { FileName, EnquiryNumber } = lookup.recordset[0];
    const folder = leadFolder(EnquiryNumber);
    const oldPath = path.join(folder, FileName);
    let newFileName = FileName;

    // Rename on disk to mark it deleted rather than removing it - tolerate the
    // file already being missing (e.g. moved manually) since the DB soft-delete
    // is what actually hides it from the app either way.
    if (fs.existsSync(oldPath)) {
      newFileName = reserveDeletedFileName(folder, FileName);
      fs.renameSync(oldPath, path.join(folder, newFileName));
    }

    await pool
      .request()
      .input('id', sql.Int, id)
      .input('fileName', sql.NVarChar, newFileName)
      .query('UPDATE dbo.LeadAttachments SET IsDeleted = 1, FileName = @fileName WHERE Id = @id');

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

export default router;
