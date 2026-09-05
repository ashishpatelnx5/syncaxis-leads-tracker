import { Router, Request, Response } from 'express';
import { getPool, sql } from '../db';
import { mapFollowupRow } from '../mappers';
import { FOLLOW_UP_STATUS_OPTIONS } from '../types';

const router = Router();

// POST /api/leads/:id/followups - add a follow-up entry, optionally advancing status/next date
router.post('/leads/:id/followups', async (req: Request, res: Response) => {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId)) return res.status(400).json({ error: 'Invalid lead id' });

  const { followUpDate, followUpBy, note, newStatus, nextFollowUpDate } = req.body;
  if (!followUpDate) return res.status(400).json({ error: 'followUpDate is required' });
  if (newStatus && !FOLLOW_UP_STATUS_OPTIONS.includes(newStatus)) {
    return res.status(400).json({ error: 'Invalid newStatus' });
  }

  try {
    const pool = await getPool();

    const lead = await pool
      .request()
      .input('id', sql.Int, leadId)
      .query('SELECT Id FROM dbo.Leads WHERE Id = @id AND IsDeleted = 0');
    if (!lead.recordset.length) return res.status(404).json({ error: 'Lead not found' });

    const insertResult = await pool
      .request()
      .input('leadId', sql.Int, leadId)
      .input('followUpDate', sql.Date, followUpDate)
      .input('followUpBy', sql.NVarChar, followUpBy ?? null)
      .input('note', sql.NVarChar(sql.MAX), note ?? null)
      .query(`
        INSERT INTO dbo.Followups (LeadId, FollowUpDate, FollowUpBy, Note)
        OUTPUT INSERTED.*
        VALUES (@leadId, @followUpDate, @followUpBy, @note)
      `);

    const updateRequest = pool.request();
    updateRequest.input('id', sql.Int, leadId);
    updateRequest.input('nextFollowUpDate', sql.Date, nextFollowUpDate || null);
    if (newStatus) {
      updateRequest.input('newStatus', sql.NVarChar, newStatus);
      await updateRequest.query(
        'UPDATE dbo.Leads SET NextFollowUpDate = @nextFollowUpDate, FollowUpStatus = @newStatus, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id'
      );
    } else {
      await updateRequest.query(
        'UPDATE dbo.Leads SET NextFollowUpDate = @nextFollowUpDate, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id'
      );
    }

    res.status(201).json(mapFollowupRow(insertResult.recordset[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add follow-up' });
  }
});

// DELETE /api/followups/:id
router.delete('/followups/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid follow-up id' });

  try {
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.Followups WHERE Id = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Follow-up not found' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete follow-up' });
  }
});

export default router;
