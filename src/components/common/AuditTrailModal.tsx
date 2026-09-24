import React from 'react';
import { ApplicationHistory } from '../../types';
import { StatusBadge } from './StatusBadge';
import { History, X, User, Calendar } from 'lucide-react';

interface AuditTrailModalProps {
  isOpen: boolean;
  onClose: () => void;
  historyLogs: ApplicationHistory[];
  applicationNumber?: string;
  nomineeName?: string;
}

export const AuditTrailModal: React.FC<AuditTrailModalProps> = ({
  isOpen,
  onClose,
  historyLogs,
  applicationNumber,
  nomineeName
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="audit-trail-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
    >
      <div
        id="audit-trail-modal-dialog"
        className="bg-white rounded-xl max-w-3xl w-full max-h-[calc(100dvh-1.5rem)] overflow-y-auto shadow-2xl border border-slate-200 my-4 sm:my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-md">
              <History size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold">PRAISE Official Audit Trail & History Log</h3>
              <p className="text-xs text-slate-300">
                {applicationNumber
                  ? `Immutable activity timeline for ${applicationNumber} (${nomineeName || ''})`
                  : 'System-wide event and status transaction history'}
              </p>
            </div>
          </div>
          <button
            id="close-audit-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Timeline Body */}
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {historyLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <History size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm font-semibold">No audit records logged yet.</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-slate-200 ml-4 space-y-5">
              {historyLogs.map((log, index) => (
                <div key={log.id || index} id={`audit-log-entry-${index}`} className="relative pl-6">
                  {/* Node Dot */}
                  <div className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-xs" />

                  {/* Log Content Card */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          {log.action}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700">
                          {log.user_role}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <Calendar size={12} />
                        <span>
                          {new Date(log.created_at).toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>

                    {/* User and Actor */}
                    <div className="flex items-center gap-2 text-xs text-slate-600 mb-2">
                      <User size={12} className="text-slate-400" />
                      <span>
                        Action performed by: <strong className="font-semibold text-slate-900">{log.user_name}</strong>
                      </span>
                    </div>

                    {/* Status transition if present */}
                    {log.new_status && (
                      <div className="flex items-center gap-2 text-xs my-2 pt-2 border-t border-slate-200">
                        {log.previous_status && (
                          <>
                            <span className="text-slate-500">From:</span>
                            <StatusBadge status={log.previous_status} size="sm" />
                            <span className="text-slate-400">→</span>
                          </>
                        )}
                        <span className="text-slate-500">Status set to:</span>
                        <StatusBadge status={log.new_status} size="sm" />
                      </div>
                    )}

                    {/* Remarks */}
                    {log.remarks && (
                      <div className="mt-2 text-xs text-slate-700 bg-white p-2.5 rounded-md border border-slate-200">
                        <span className="font-semibold text-slate-900">Remarks: </span>
                        <span className="safe-long-text block whitespace-pre-wrap">{log.remarks}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            id="close-audit-modal-bottom-btn"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md transition-colors cursor-pointer shadow-xs"
          >
            Close Timeline
          </button>
        </div>
      </div>
    </div>
  );
};
