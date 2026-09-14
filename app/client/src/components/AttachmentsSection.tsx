import { useEffect, useRef, useState } from 'react';
import type { Attachment } from '../types';
import { uploadAttachments, deleteAttachment, attachmentFileUrl } from '../api';
import { FileIcon, ChevronLeftIcon, ChevronRightIcon, PlayIcon } from './icons';
import { ConfirmDialog } from './ConfirmDialog';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp4,.mov,.avi,.txt,.csv,.zip';

// Types the browser can render inline - everything else (docx/xlsx/zip/etc)
// has no in-page preview, so those just download in place instead of opening
// the popup. Mirrors the server's isInlineViewable() allow-list.
const PREVIEWABLE_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'video/mp4', 'video/quicktime']);

function isImage(contentType: string): boolean {
  return contentType.startsWith('image/');
}

function isVideo(contentType: string): boolean {
  return contentType.startsWith('video/');
}

function isPdf(contentType: string): boolean {
  return contentType === 'application/pdf';
}

function isPreviewable(contentType: string): boolean {
  return PREVIEWABLE_CONTENT_TYPES.has(contentType);
}

function AttachmentPreviewModal({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const url = attachmentFileUrl(attachment.id);

  return (
    <div className="attachment-modal-backdrop" onClick={onClose}>
      <div className="attachment-modal-content" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="attachment-modal-close" onClick={onClose} aria-label="Close preview">
          &times;
        </button>
        {isImage(attachment.contentType) && <img src={url} alt={attachment.fileName} />}
        {isVideo(attachment.contentType) && <video src={url} controls autoPlay />}
        {isPdf(attachment.contentType) && <iframe src={url} title={attachment.fileName} />}
      </div>
    </div>
  );
}

interface AttachmentsSectionProps {
  leadId: number;
  attachments: Attachment[];
  onChanged: () => void;
}

export function AttachmentsSection({ leadId, attachments, onChanged }: AttachmentsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Attachment | null>(null);

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    setUploading(true);
    setError(null);
    try {
      await uploadAttachments(leadId, Array.from(fileList));
      onChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteAttachment(pendingDelete.id);
      onChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPendingDelete(null);
    }
  }

  function scroll(direction: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  return (
    <section className="detail-section attachments-section">
      <h2>Files</h2>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="attachment-upload-row">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(e) => handleFilesSelected(e.target.files)}
          disabled={uploading}
        />
        {uploading && <span className="hint-text">Uploading...</span>}
      </div>

      {!attachments.length && <p className="empty-state">No files attached yet.</p>}

      {!!attachments.length && (
        <div className="attachment-carousel">
          <button type="button" className="attachment-carousel-arrow attachment-carousel-arrow-left" onClick={() => scroll(-1)} aria-label="Scroll left">
            <ChevronLeftIcon />
          </button>

          <div className="attachment-carousel-track" ref={trackRef}>
            {attachments.map((a) => {
              const thumb = (
                <>
                  {isImage(a.contentType) && <img src={attachmentFileUrl(a.id)} alt={a.fileName} />}
                  {isVideo(a.contentType) && (
                    <>
                      <video muted playsInline preload="metadata" src={`${attachmentFileUrl(a.id)}#t=0.5`} />
                      <span className="attachment-card-play"><PlayIcon /></span>
                    </>
                  )}
                  {!isImage(a.contentType) && !isVideo(a.contentType) && (
                    <span className="attachment-card-icon"><FileIcon /></span>
                  )}
                </>
              );
              return (
                <div key={a.id} className="attachment-card" title={a.fileName}>
                  {isPreviewable(a.contentType) ? (
                    <button type="button" className="attachment-card-link" onClick={() => setPreview(a)}>
                      {thumb}
                    </button>
                  ) : (
                    <a href={attachmentFileUrl(a.id)} className="attachment-card-link">
                      {thumb}
                    </a>
                  )}
                  <button type="button" className="attachment-card-delete" onClick={() => setPendingDelete(a)} aria-label="Delete file" title="Delete">
                    &times;
                  </button>
                </div>
              );
            })}
          </div>

          <button type="button" className="attachment-carousel-arrow attachment-carousel-arrow-right" onClick={() => scroll(1)} aria-label="Scroll right">
            <ChevronRightIcon />
          </button>
        </div>
      )}

      {preview && <AttachmentPreviewModal attachment={preview} onClose={() => setPreview(null)} />}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete file"
          message={`Delete "${pendingDelete.fileName}"? This cannot be undone from the UI.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
