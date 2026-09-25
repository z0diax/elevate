import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ApplicationDocument, UserRole } from '../../types';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCheck,
  FileText,
  User,
  X,
  XCircle,
} from 'lucide-react';

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: ApplicationDocument | null;
  nomineeName?: string;
  applicationNumber?: string;
  userRole: UserRole;
  onVerify?: (status: 'Verified' | 'Rejected', remarks: string) => void;
  onHeadReview?: (status: 'Head Approved' | 'Head Rejected', remarks: string) => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  isOpen,
  onClose,
  document,
  nomineeName,
  applicationNumber,
  userRole,
  onVerify,
  onHeadReview,
}) => {
  const [remarks, setRemarks] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key === 'Tab' && dialogRef.current) {
        const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled])'));
        if (!controls.length) return;
        if (event.shiftKey && window.document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1].focus(); }
        else if (!event.shiftKey && window.document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0].focus(); }
      }
    };
    window.document.addEventListener('keydown', onKeyDown);
    return () => { window.document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [isOpen]);

  const canVerify = (userRole === 'SECRETARIAT' || userRole === 'ADMINISTRATOR') && !!onVerify;
  const canHeadReview = userRole === 'HEAD_OF_OFFICE' && !!onHeadReview;

  useEffect(() => {
    if (!document) {
      setRemarks('');
      setErrorMsg('');
      return;
    }

    setRemarks(document.verification_remarks || '');
    setErrorMsg('');
  }, [document]);

  const fileUrl = document?.file_url || '';
  const previewUrl = fileUrl ? `${fileUrl}${fileUrl.includes('?') ? '&' : '?'}preview=1` : '';
  const previewMode = useMemo(() => {
    if (!fileUrl) return 'none';
    if (document?.file_type === 'image/jpeg' || document?.file_type === 'image/png') {
      return 'image';
    }
    if (document?.file_type === 'application/pdf') {
      return 'pdf';
    }
    return 'download';
  }, [document?.file_type, fileUrl]);

  if (!isOpen || !document) {
    return null;
  }

  const handleAction = (status: 'Verified' | 'Rejected' | 'Head Approved' | 'Head Rejected') => {
    if ((status === 'Rejected' || status === 'Head Rejected') && !remarks.trim()) {
      setErrorMsg('Mandatory: Please provide a clear explanation before rejecting this document.');
      return;
    }

    setErrorMsg('');
    if (status === 'Head Approved' || status === 'Head Rejected') {
      onHeadReview?.(status, remarks.trim() || 'Document inspected and approved by the Head of Office.');
      return;
    }
    onVerify?.(status, remarks.trim() || (status === 'Verified' ? 'Document verified and compliant with PRAISE requirements.' : 'Document returned for compliance.'));
  };

  return (
    <div
      id="document-viewer-modal-backdrop"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs sm:p-4"
    >
      <div
        id="document-viewer-modal-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-viewer-title"
        className="flex h-dvh max-h-dvh w-screen min-w-0 flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:w-full sm:max-w-4xl sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white sm:px-6 sm:py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-blue-600 rounded-md">
              <FileText size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 id="document-viewer-title" className="break-words text-sm font-bold">{document.document_name}</h3>
              <p className="break-words text-xs text-slate-300">
                {[applicationNumber, nomineeName].filter(Boolean).join(' • ')}
              </p>
            </div>
          </div>

          <button
            id="close-doc-viewer-btn"
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close document viewer"
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                document.status === 'Verified' || document.status === 'Head Approved'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : document.status === 'Rejected' || document.status === 'Head Rejected'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {document.status === 'Verified' || document.status === 'Head Approved' ? <CheckCircle2 size={18} /> : <FileCheck size={18} />}
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Verification Status</p>
                <p className="text-xs font-bold text-slate-900">{document.status}</p>
              </div>
            </div>

            <div className="text-xs text-slate-500 space-y-1">
              <div className="flex items-center gap-1.5">
                <Calendar size={12} />
                <span>Uploaded: {new Date(document.uploaded_at || Date.now()).toLocaleDateString('en-PH')}</span>
              </div>
              {document.verified_by && (
                <div className="flex items-center gap-1.5">
                  <User size={12} />
                  <span>By: {document.verified_by}</span>
                </div>
              )}
            </div>
          </div>

          {document.verification_remarks && (
            <div className="p-3.5 bg-blue-50 rounded-xl border border-blue-200">
              <p className="text-xs font-bold text-blue-900 flex items-center gap-1.5 mb-1">
                <AlertCircle size={14} />
                <span>Existing Review Remarks</span>
              </p>
              <p className="safe-long-text text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{document.verification_remarks}</p>
            </div>
          )}

          <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="break-words text-sm font-bold text-slate-900">{document.document_name}</h4>
                <p className="text-xs text-slate-500 mt-1">{document.file_type || 'Uploaded document'}</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={(previewMode === 'pdf' || previewMode === 'image' ? previewUrl : fileUrl) || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md shadow-xs transition-colors ${
                    fileUrl
                      ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                      : 'bg-slate-200 text-slate-500 cursor-not-allowed pointer-events-none'
                  }`}
                >
                  <ExternalLink size={14} />
                  <span>Open File</span>
                </a>

                <a
                  href={fileUrl || '#'}
                  download={document.document_name}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md border transition-colors ${
                    fileUrl
                      ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-800 cursor-pointer'
                      : 'bg-slate-200 border-slate-200 text-slate-500 cursor-not-allowed pointer-events-none'
                  }`}
                >
                  <Download size={14} />
                  <span>Download</span>
                </a>
              </div>
            </div>

            {previewMode === 'image' && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <img
                  src={previewUrl}
                  alt={document.document_name}
                  className="max-h-[42dvh] w-full bg-white object-contain sm:max-h-[60vh]"
                />
              </div>
            )}

            {previewMode === 'pdf' && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <iframe
                  src={previewUrl}
                  title={document.document_name}
                  className="h-[42dvh] w-full sm:h-[60vh]"
                />
              </div>
            )}

            {previewMode === 'download' && (
              <div className="p-8 border-2 border-dashed border-slate-200 rounded-xl text-center bg-white">
                <FileText size={40} className="mx-auto text-blue-600 mb-2 opacity-80" />
                <p className="text-sm font-semibold text-slate-900">Preview is not available for this file type.</p>
                <p className="text-xs text-slate-500 mt-1">
                  Open or download the attachment to inspect the uploaded document.
                </p>
              </div>
            )}

            {previewMode === 'none' && (
              <div className="p-8 border-2 border-dashed border-slate-200 rounded-xl text-center bg-white">
                <FileText size={40} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-semibold text-slate-900">No stored file URL was found for this document.</p>
                <p className="text-xs text-slate-500 mt-1">
                  Ask the uploader to submit the file again.
                </p>
              </div>
            )}
          </div>

          {(canVerify || canHeadReview) && (
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <label className="block text-sm font-semibold text-slate-800">
                {canHeadReview ? 'Head of Office Inspection Remarks:' : 'Secretariat Verification Remarks / Compliance Notes:'}
              </label>
              <textarea
                value={remarks}
                onChange={event => setRemarks(event.target.value)}
                placeholder="Enter validation remarks or specific deficiency notes if returning this document..."
                rows={3}
                className="safe-long-text w-full min-w-0 max-w-full rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />

              {errorMsg && (
                <p className="text-xs font-medium text-red-600 flex items-center gap-1">
                  <AlertCircle size={13} />
                  <span>{errorMsg}</span>
                </p>
              )}

              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  id="reject-doc-btn"
                  onClick={() => handleAction(canHeadReview ? 'Head Rejected' : 'Rejected')}
                  className="flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
                >
                  <XCircle size={14} />
                  <span>{canHeadReview ? 'Reject / Return for Correction' : 'Reject / Require Compliance'}</span>
                </button>
                <button
                  id="verify-doc-btn"
                  onClick={() => handleAction(canHeadReview ? 'Head Approved' : 'Verified')}
                  className="flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-green-600 px-4 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-green-700"
                >
                  <CheckCircle2 size={14} />
                  <span>{canHeadReview ? 'Approve for Endorsement' : 'Verify as Compliant'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
          <button
            onClick={onClose}
            className="min-h-11 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-slate-800"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
