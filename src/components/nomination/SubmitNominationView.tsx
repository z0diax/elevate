import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, FileText, Plus, RefreshCw, Upload, X } from 'lucide-react';
import { Application, Award, Office, UserProfile } from '../../types';
import { praiseService } from '../../lib/supabase';
import { showToast } from '../../lib/toast';
import { StatusBadge } from '../common/StatusBadge';
import { NominationWizard } from './NominationWizard';

interface SubmitNominationViewProps {
  applications: Application[];
  awards: Award[];
  offices: Office[];
  currentUser: UserProfile;
  onRefreshData: () => void | Promise<void>;
  openFormRequested?: boolean;
  onOpenFormRequestHandled?: () => void;
}

const PAGE_SIZE = 10;

export const SubmitNominationView: React.FC<SubmitNominationViewProps> = ({
  applications,
  awards,
  offices,
  currentUser,
  onRefreshData,
  openFormRequested = false,
  onOpenFormRequestHandled,
}) => {
  const [page, setPage] = useState(1);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [resubmitApp, setResubmitApp] = useState<Application | null>(null);
  const [replacementFiles, setReplacementFiles] = useState<Record<string, File>>({});
  const [resubmissionNote, setResubmissionNote] = useState('');
  const [resubmitError, setResubmitError] = useState('');
  const [isResubmitting, setIsResubmitting] = useState(false);

  const filedApplications = useMemo(() => applications
    .filter(application => application.nominator_id === currentUser.id)
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()),
  [applications, currentUser.id]);

  const totalPages = Math.max(1, Math.ceil(filedApplications.length / PAGE_SIZE));
  const visibleApplications = filedApplications.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!openFormRequested) return;
    setIsWizardOpen(true);
    onOpenFormRequestHandled?.();
  }, [onOpenFormRequestHandled, openFormRequested]);

  const openResubmission = (application: Application) => {
    setResubmitApp(application);
    setReplacementFiles({});
    setResubmissionNote('');
    setResubmitError('');
  };

  const closeResubmission = () => {
    if (isResubmitting) return;
    setResubmitApp(null);
    setReplacementFiles({});
    setResubmissionNote('');
    setResubmitError('');
  };

  const handleResubmit = async () => {
    if (!resubmitApp) return;

    const correctionDocuments = (resubmitApp.documents || []).filter(document =>
      document.status === 'Rejected' || document.status === 'Missing'
    );
    const missingReplacement = correctionDocuments.find(document => !replacementFiles[document.id]);
    if (missingReplacement) {
      setResubmitError(`Please replace "${missingReplacement.document_name}" before resubmitting.`);
      return;
    }
    if (correctionDocuments.length === 0 && !resubmissionNote.trim()) {
      setResubmitError('Describe the corrections you completed before resubmitting.');
      return;
    }

    setIsResubmitting(true);
    setResubmitError('');
    try {
      for (const document of correctionDocuments) {
        const file = replacementFiles[document.id];
        await praiseService.reuploadDocument(resubmitApp.id, document.id, file, document.document_name);
      }
      await praiseService.resubmitApplication(
        resubmitApp.id,
        resubmissionNote.trim() || 'Rejected documents replaced and requested corrections completed.'
      );
      showToast(`${resubmitApp.application_number} resubmitted successfully.`);
      await onRefreshData();
      setResubmitApp(null);
      setReplacementFiles({});
      setResubmissionNote('');
    } catch (error) {
      setResubmitError(error instanceof Error ? error.message : 'Unable to resubmit the nomination.');
    } finally {
      setIsResubmitting(false);
    }
  };

  return (
    <div id="submit-nomination-view" className="space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Submitted Nominations</h2>
          <p className="mt-1 text-xs text-slate-500">
            View nominations filed from your account and respond to returned applications.
          </p>
        </div>
        <button
          id="open-nomination-modal-btn"
          type="button"
          onClick={() => setIsWizardOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-blue-700"
        >
          <Plus size={16} />
          New Nomination
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Reference No.</th>
                <th className="px-4 py-3">Nominee</th>
                <th className="px-4 py-3">Award</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Required Action</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleApplications.map(application => {
                const canResubmit = application.status === 'Returned for Revision'
                  || application.status === 'Incomplete'
                  || (application.status === 'Not Approved' && application.endorsement?.decision === 'Rejected');
                return (
                  <tr key={application.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-4 font-mono text-xs font-bold text-blue-700">{application.application_number}</td>
                    <td className="px-4 py-4">
                      <p className="text-xs font-bold text-slate-900">{application.nominee_name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{application.office_name}</p>
                    </td>
                    <td className="px-4 py-4 text-xs font-medium text-slate-700">{application.award_name}</td>
                    <td className="px-4 py-4 text-xs text-slate-600">{application.processing_stage}</td>
                    <td className="px-4 py-4"><StatusBadge status={application.status} size="sm" /></td>
                    <td className="max-w-xs px-4 py-4 text-xs text-slate-600">
                      {application.required_action || 'No action required from the filer.'}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {canResubmit ? (
                        <button
                          type="button"
                          onClick={() => openResubmission(application)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100"
                        >
                          <RefreshCw size={13} />
                          Correct & Resubmit
                        </button>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-400">No action needed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibleApplications.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-14 text-center">
                    <FileText size={32} className="mx-auto text-slate-300" />
                    <p className="mt-2 text-sm font-semibold text-slate-600">No nominations filed from this account</p>
                    <p className="mt-1 text-xs text-slate-400">Select New Nomination to create your first entry.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500">
            {filedApplications.length === 0
              ? '0 records'
              : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, filedApplications.length)} of ${filedApplications.length}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous page"
              disabled={page === 1}
              onClick={() => setPage(current => Math.max(1, current - 1))}
              className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="min-w-16 text-center text-xs font-semibold text-slate-700">{page} / {totalPages}</span>
            <button
              type="button"
              aria-label="Next page"
              disabled={page === totalPages}
              onClick={() => setPage(current => Math.min(totalPages, current + 1))}
              className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {isWizardOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6">
          <div className="relative my-auto w-full max-w-5xl">
            <button
              type="button"
              aria-label="Close nomination form"
              onClick={() => setIsWizardOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-full bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              <X size={17} />
            </button>
            <NominationWizard
              awards={awards}
              offices={offices}
              currentUser={currentUser}
              onNominationComplete={async () => {
                await onRefreshData();
                setIsWizardOpen(false);
              }}
              onCancel={() => setIsWizardOpen(false)}
            />
          </div>
        </div>
      )}

      {resubmitApp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between bg-slate-900 px-5 py-4 text-white">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">{resubmitApp.application_number}</p>
                <h3 className="mt-0.5 text-base font-bold">Correct and Resubmit Nomination</h3>
              </div>
              <button type="button" onClick={closeResubmission} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-2 text-amber-900">
                  <AlertCircle size={17} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold">Action requested by the reviewer</p>
                    <p className="mt-1 text-xs leading-relaxed">{resubmitApp.required_action || resubmitApp.remarks || 'Please complete the requested corrections.'}</p>
                  </div>
                </div>
              </div>

              {(resubmitApp.documents || []).some(document => document.status === 'Rejected' || document.status === 'Missing') && (
                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">Required document replacements</h4>
                    <p className="mt-1 text-xs text-slate-500">Every rejected or missing file must be replaced before resubmission.</p>
                  </div>
                  {(resubmitApp.documents || [])
                    .filter(document => document.status === 'Rejected' || document.status === 'Missing')
                    .map(document => (
                      <div key={document.id} className="rounded-lg border border-red-200 bg-red-50/50 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-bold text-slate-900">{document.document_name}</p>
                            <p className="mt-1 text-[11px] text-red-700">{document.verification_remarks || `Document marked ${document.status.toLowerCase()}.`}</p>
                            {replacementFiles[document.id] && (
                              <p className="mt-1 text-[11px] font-semibold text-green-700">Selected: {replacementFiles[document.id].name}</p>
                            )}
                          </div>
                          <label className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                            <Upload size={13} />
                            Choose replacement
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                              className="hidden"
                              onChange={event => {
                                const file = event.target.files?.[0];
                                if (file) setReplacementFiles(current => ({ ...current, [document.id]: file }));
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              <div>
                <label htmlFor="resubmission-note" className="block text-xs font-bold text-slate-800">Correction note</label>
                <textarea
                  id="resubmission-note"
                  rows={4}
                  value={resubmissionNote}
                  onChange={event => setResubmissionNote(event.target.value)}
                  placeholder="Describe the corrections made and any information the reviewer should check."
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {resubmitError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {resubmitError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button type="button" disabled={isResubmitting} onClick={closeResubmission} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50">
                Cancel
              </button>
              <button
                type="button"
                disabled={isResubmitting}
                onClick={() => void handleResubmit()}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={14} className={isResubmitting ? 'animate-spin' : ''} />
                {isResubmitting ? 'Resubmitting...' : 'Resubmit Application'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
