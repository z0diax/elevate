import React, { useEffect, useMemo, useState } from 'react';
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
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  isOpen,
  onClose,
  document,
  nomineeName,
  applicationNumber,
  userRole,
  onVerify,
}) => {
  const [remarks, setRemarks] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const canVerify = (userRole === 'SECRETARIAT' || userRole === 'ADMINISTRATOR') && !!onVerify;

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
  const previewMode = useMemo(() => {
    if (!fileUrl) return 'none';
    if (document?.file_type?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(fileUrl)) {
      return 'image';
    }
    if (document?.file_type === 'application/pdf' || /\.pdf($|\?)/i.test(fileUrl)) {
      return 'pdf';
    }
    return 'download';
  }, [document?.file_type, fileUrl]);

  if (!isOpen || !document) {
    return null;
  }

  const handleAction = (status: 'Verified' | 'Rejected') => {
    if (status === 'Rejected' && !remarks.trim()) {
      setErrorMsg('Mandatory: Please provide a clear explanation before rejecting this document.');
      return;
    }

    setErrorMsg('');
    onVerify?.(
      status,
      remarks.trim() || (status === 'Verified' ? 'Document verified and compliant with PRAISE requirements.' : 'Document returned for compliance.')
    );
  };

  return (
    <div
      id="document-viewer-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
    >
      <div
        id="document-viewer-modal-dialog"
        className="bg-white rounded-xl max-w-4xl w-full max-h-[calc(100dvh-1.5rem)] overflow-y-auto shadow-2xl border border-slate-200 my-4 sm:my-8"
      >
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-blue-600 rounded-md">
              <FileText size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate max-w-xl">{document.document_name}</h3>
              <p className="text-xs text-slate-300 truncate">
                {[applicationNumber, nomineeName].filter(Boolean).join(' • ')}
              </p>
            </div>
          </div>

          <button
            id="close-doc-viewer-btn"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                document.status === 'Verified'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : document.status === 'Rejected'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {document.status === 'Verified' ? <CheckCircle2 size={18} /> : <FileCheck size={18} />}
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
              <p className="text-xs text-slate-700 leading-relaxed">{document.verification_remarks}</p>
            </div>
          )}

          <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">{document.document_name}</h4>
                <p className="text-xs text-slate-500 mt-1">{document.file_type || 'Uploaded document'}</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={fileUrl || '#'}
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
                  src={fileUrl}
                  alt={document.document_name}
                  className="max-h-[60vh] w-full object-contain bg-white"
                />
              </div>
            )}

            {previewMode === 'pdf' && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <iframe
                  src={fileUrl}
                  title={document.document_name}
                  className="h-[60vh] w-full"
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

          {canVerify && (
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <label className="block text-xs font-bold text-slate-800">
                Secretariat Verification Remarks / Compliance Notes:
              </label>
              <textarea
                value={remarks}
                onChange={event => setRemarks(event.target.value)}
                placeholder="Enter validation remarks or specific deficiency notes if returning this document..."
                rows={3}
                className="w-full text-xs p-3 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />

              {errorMsg && (
                <p className="text-xs font-medium text-red-600 flex items-center gap-1">
                  <AlertCircle size={13} />
                  <span>{errorMsg}</span>
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  id="reject-doc-btn"
                  onClick={() => handleAction('Rejected')}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <XCircle size={14} />
                  <span>Reject / Require Compliance</span>
                </button>
                <button
                  id="verify-doc-btn"
                  onClick={() => handleAction('Verified')}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-md flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <CheckCircle2 size={14} />
                  <span>Verify as Compliant</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md transition-colors cursor-pointer shadow-xs"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
