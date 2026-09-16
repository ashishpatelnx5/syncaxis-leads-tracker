import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { config } from './config';

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB per file
export const MAX_FILES_PER_UPLOAD = 10;

// Extension allow-list, doubling as the Content-Type we record/serve for each
// file - anything not listed here (executables, scripts, etc) is rejected.
const ALLOWED_EXTENSIONS: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
};

// Safe to render inline in the browser tab/preview. Deliberately excludes SVG
// (can carry embedded scripts) even though it's an image format.
const INLINE_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov']);

function extOf(fileName: string): string {
  return path.extname(fileName).toLowerCase();
}

export function isAllowedFile(originalName: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_EXTENSIONS, extOf(originalName));
}

export function contentTypeFor(originalName: string): string {
  return ALLOWED_EXTENSIONS[extOf(originalName)] || 'application/octet-stream';
}

export function isInlineViewable(originalName: string): boolean {
  return INLINE_EXTENSIONS.has(extOf(originalName));
}

// Inquiry numbers look like "SI/2627/2135" - "/" can't appear in a single path
// segment, so this doubles as the folder name and the filename prefix.
export function sanitizeForPath(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || 'unknown';
}

export function leadFolder(inquiryNumber: string): string {
  return path.join(config.uploads.dir, 'leads', sanitizeForPath(inquiryNumber));
}

// <YYYYMMDD>_<hhmmss><cc> - cc is 2 digits of centiseconds (milliseconds/10),
// giving enough resolution that files uploaded in the same batch essentially
// never collide, while staying readable.
function timestampStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const centiseconds = pad(Math.floor(d.getMilliseconds() / 10));
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${centiseconds}`;
}

// Stored filenames are <InquiryNumber>_<YYYYMMDD>_<hhmmsscc><ext> - not the
// original name - so files are identifiable by inquiry number at a glance
// even outside the folder they live in. A "(1)", "(2)", ... suffix is
// appended only if that exact name already exists, to avoid ever overwriting
// an existing file.
export function reserveFileName(folder: string, inquiryNumber: string, originalName: string): string {
  const ext = extOf(originalName);
  const base = `${sanitizeForPath(inquiryNumber)}_${timestampStamp()}`;
  let candidate = `${base}${ext}`;
  let attempt = 0;
  while (fs.existsSync(path.join(folder, candidate))) {
    attempt += 1;
    candidate = `${base} (${attempt})${ext}`;
  }
  return candidate;
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const folder = leadFolder((req as any).inquiryNumber);
    fs.mkdirSync(folder, { recursive: true });
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    const inquiryNumber = (req as any).inquiryNumber;
    const folder = leadFolder(inquiryNumber);
    cb(null, reserveFileName(folder, inquiryNumber, file.originalname));
  },
});

// Marks a file as deleted on disk without actually removing it - inserts
// "_deleted" before the extension (and a counter suffix in the rare case that
// exact name is already taken), so it's still there for recovery/audit but
// won't be confused with a live attachment if someone browses the folder.
export function reserveDeletedFileName(folder: string, storedFileName: string): string {
  const ext = extOf(storedFileName);
  const base = path.basename(storedFileName, path.extname(storedFileName));
  let candidate = `${base}_deleted${ext}`;
  let attempt = 0;
  while (fs.existsSync(path.join(folder, candidate))) {
    attempt += 1;
    candidate = `${base}_deleted (${attempt})${ext}`;
  }
  return candidate;
}

export const uploadLeadAttachments = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_FILES_PER_UPLOAD },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedFile(file.originalname)) {
      cb(new Error('One or more files have a type that is not allowed'));
      return;
    }
    cb(null, true);
  },
});
