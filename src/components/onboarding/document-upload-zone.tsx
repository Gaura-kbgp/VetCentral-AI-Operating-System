'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileText, Upload, X, Download, Check, AlertCircle, Loader2, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DocumentUploadZoneProps {
  docId: string;
  docName: string;
  docType: string;
  status: 'pending' | 'uploaded' | 'verified' | 'rejected';
  currentUrl?: string | null;
  ocrText?: string | null;
  rejectionReason?: string | null;
  isEmployee: boolean;
  recordId: string;
  onUploadSuccess?: () => void;
  onDeleteSuccess?: () => void;
}

export function DocumentUploadZone({
  docId,
  docName,
  docType,
  status,
  currentUrl,
  ocrText,
  rejectionReason,
  isEmployee,
  recordId,
  onUploadSuccess,
  onDeleteSuccess,
}: DocumentUploadZoneProps) {
  const [uploading, setUploading] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  const [rejectionForm, setRejectionForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0) {
      toast.error(`File rejected: ${rejectedFiles[0].errors[0].message}`);
      return;
    }

    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('docId', docId);
    formData.append('recordId', recordId);

    try {
      const res = await fetch('/api/v1/onboarding/documents', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Upload failed');
        return;
      }

      toast.success('Document uploaded successfully');
      onUploadSuccess?.();
    } catch (e) {
      toast.error('Upload failed');
      console.error(e);
    } finally {
      setUploading(false);
    }
  }, [docId, recordId, onUploadSuccess]);

  const handleDelete = async () => {
    if (!confirm('Remove this file?')) return;
    setUploading(true);

    try {
      const res = await fetch(`/api/v1/onboarding/documents?docId=${docId}&recordId=${recordId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        toast.error('Delete failed');
        return;
      }

      toast.success('File removed');
      onDeleteSuccess?.();
    } catch (e) {
      toast.error('Delete failed');
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  const statusConfig = {
    pending: { label: 'Not Submitted', color: 'text-gray-500', bg: 'bg-gray-50' },
    uploaded: { label: 'Waiting for Review', color: 'text-amber-600', bg: 'bg-amber-50' },
    verified: { label: 'Approved', color: 'text-green-600', bg: 'bg-green-50' },
    rejected: { label: 'Needs Revision', color: 'text-red-600', bg: 'bg-red-50' },
  };

  const cfg = statusConfig[status];

  return (
    <div className={cn('rounded-2xl border-2 p-4', cfg.bg, status === 'rejected' ? 'border-red-200' : 'border-gray-200')}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1">
          <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-gray-900">{docName}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full', cfg.color, cfg.bg === 'bg-gray-50' ? 'bg-gray-100' : 'bg-white/60')}>
                {cfg.label}
              </span>
              <span className="text-[10px] text-gray-400">{docType}</span>
            </div>
          </div>
        </div>
        {status === 'verified' && <Check className="h-5 w-5 text-green-600 shrink-0" />}
      </div>

      {rejectionReason && (
        <div className="mb-3 p-2 bg-red-100/50 rounded-lg border border-red-200">
          <p className="text-[11px] text-red-700">
            <span className="font-bold">Revision needed:</span> {rejectionReason}
          </p>
        </div>
      )}

      {status === 'pending' && isEmployee && (
        (() => {
          const { getRootProps, getInputProps, isDragActive } = useDropzone({
            onDrop,
            accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'application/msword': ['.doc'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
            disabled: uploading,
          });
          return (
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
                isDragActive ? 'border-teal-400 bg-teal-50' : 'border-gray-300 hover:border-teal-300',
                uploading && 'opacity-50 cursor-not-allowed'
              )}
            >
              <input {...getInputProps()} />
              {uploading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-teal-500 mx-auto mb-2" />
                  <p className="text-[12px] text-gray-600">Uploading...</p>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                  <p className="text-[12px] font-medium text-gray-700">Drag file here or click to browse</p>
                  <p className="text-[10px] text-gray-500 mt-1">PDF, JPG, PNG, DOC, DOCX (max 15 MB)</p>
                </>
              )}
            </div>
          );
        })()
      )}

      {status === 'uploaded' && isEmployee && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-200">
            <FileText className="h-4 w-4 text-gray-400 shrink-0" />
            <span className="text-[11px] text-gray-600 flex-1 truncate">File uploaded • Awaiting HR review</span>
            <button onClick={handleDelete} disabled={uploading} className="text-red-500 hover:text-red-600 p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {status === 'rejected' && isEmployee && (
        (() => {
          const { getRootProps, getInputProps, isDragActive } = useDropzone({
            onDrop,
            accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'application/msword': ['.doc'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
            disabled: uploading,
          });
          return (
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
                isDragActive ? 'border-teal-400 bg-teal-50' : 'border-red-300 hover:border-red-400',
                uploading && 'opacity-50 cursor-not-allowed'
              )}
            >
              <input {...getInputProps()} />
              {uploading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-teal-500 mx-auto mb-2" />
                  <p className="text-[12px] text-gray-600">Uploading...</p>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-red-400 mx-auto mb-2" />
                  <p className="text-[12px] font-medium text-gray-700">Re-upload with corrections</p>
                  <p className="text-[10px] text-gray-500 mt-1">PDF, JPG, PNG, DOC, DOCX (max 15 MB)</p>
                </>
              )}
            </div>
          );
        })()
      )}

      {status === 'verified' && currentUrl && (
        <div className="flex items-center gap-2">
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-[12px] font-medium transition-colors"
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>
      )}

      {/* HR view */}
      {!isEmployee && status === 'uploaded' && (
        <div className="space-y-3">
          {currentUrl && (
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-[12px] font-medium w-full justify-center transition-colors"
            >
              <Download className="h-4 w-4" />
              Download File
            </a>
          )}

          {ocrText && (
            <button
              onClick={() => setShowOcr(!showOcr)}
              className="w-full flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-[12px] font-medium transition-colors"
            >
              <Eye className="h-4 w-4" />
              {showOcr ? 'Hide' : 'View'} Extracted Text
            </button>
          )}

          {showOcr && ocrText && (
            <div className="p-2 bg-white rounded-lg border border-gray-200 max-h-32 overflow-y-auto">
              <p className="text-[11px] text-gray-600 whitespace-pre-wrap">{ocrText.slice(0, 500)}{ocrText.length > 500 ? '...' : ''}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={async () => {
                setApproving(true);
                try {
                  const res = await fetch('/api/v1/onboarding/documents/approve', { method: 'POST', body: JSON.stringify({ docId }) });
                  if (res.ok) { toast.success('Document approved'); onUploadSuccess?.(); }
                  else toast.error('Approval failed');
                } finally { setApproving(false); }
              }}
              disabled={approving}
              className="h-9 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 text-[12px] font-bold transition-colors disabled:opacity-60"
            >
              {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : 'Approve'}
            </button>
            <button
              onClick={() => setRejectionForm(!rejectionForm)}
              className="h-9 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-[12px] font-bold transition-colors"
            >
              Reject
            </button>
          </div>

          {rejectionForm && (
            <div className="space-y-2 p-2 bg-red-50 rounded-lg border border-red-200">
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Reason for rejection…"
                className="w-full h-16 px-2 py-1 rounded border border-red-200 text-[11px] focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
              />
              <div className="flex gap-1">
                <button
                  onClick={() => setRejectionForm(false)}
                  className="flex-1 h-7 rounded text-[11px] border border-red-200 text-red-600 hover:bg-red-100"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!rejectReason.trim()) { toast.error('Please enter a reason'); return; }
                    setRejecting(true);
                    try {
                      const res = await fetch('/api/v1/onboarding/documents/reject', {
                        method: 'POST',
                        body: JSON.stringify({ docId, reason: rejectReason }),
                      });
                      if (res.ok) { toast.success('Document rejected'); onUploadSuccess?.(); setRejectionForm(false); }
                      else toast.error('Rejection failed');
                    } finally { setRejecting(false); }
                  }}
                  disabled={rejecting}
                  className="flex-1 h-7 rounded bg-red-600 text-white text-[11px] font-bold hover:bg-red-700 disabled:opacity-60"
                >
                  {rejecting ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : 'Send'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!isEmployee && status === 'verified' && (
        <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg border border-green-200">
          <Check className="h-4 w-4 text-green-600 shrink-0" />
          <p className="text-[11px] text-green-700 flex-1">Approved by HR</p>
          {currentUrl && (
            <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700">
              <Download className="h-4 w-4" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
