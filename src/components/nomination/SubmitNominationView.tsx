import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Plus, RefreshCw, X } from 'lucide-react';
import { Application, Award, Office, UserProfile } from '../../types';
import { praiseService } from '../../lib/supabase';
import { showToast } from '../../lib/toast';
import { NominationWizard } from './NominationWizard';
import { NominationActionModal } from './NominationActionModal';
import { NomineeTrackingModal } from './NomineeTrackingModal';
import { NominationQueueCards } from './NominationQueueCards';

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
  const [isWizardSubmitting, setIsWizardSubmitting] = useState(false);
  const [resubmitApp, setResubmitApp] = useState<Application | null>(null);
  const [trackingAppId, setTrackingAppId] = useState<string | null>(null);
  const [replacementFiles, setReplacementFiles] = useState<Record<string, File>>({});
  const [resubmissionNote, setResubmissionNote] = useState('');
  const [resubmitError, setResubmitError] = useState('');
  const [isResubmitting, setIsResubmitting] = useState(false);

  const filedApplications = useMemo(() => applications
    .filter(application => application.nominator_id === currentUser.id && application.status !== 'Draft')
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()),
  [applications, currentUser.id]);

  const trackingApp = filedApplications.find(application => application.id === trackingAppId) || null;
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
        <NominationQueueCards applications={visibleApplications} onOpen={application => setTrackingAppId(application.id)} actionLabel={application => ['Returned for Revision', 'Incomplete'].includes(application.status) ? 'Review changes' : 'View nomination'} />
        {visibleApplications.length === 0 && <p className="p-8 text-center text-sm text-slate-500 sm:hidden">No nominations filed from this account.</p>}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[680px] text-left">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Reference No.</th>
                <th className="px-4 py-3">Nominee</th>
                <th className="px-4 py-3">Award</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleApplications.map(application => {
                const canResubmit = application.status === 'Returned for Revision'
                  || application.status === 'Incomplete'
                  || (application.status === 'Not Approved' && application.endorsement?.decision === 'Rejected');
                return (
                  <tr key={application.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-4 font-mono text-xs font-bold text-blue-700"><button type="button" onClick={() => setTrackingAppId(application.id)} className="break-words text-left hover:underline focus-visible:outline-2 focus-visible:outline-blue-600" aria-label={"View nomination " + application.application_number}>{application.application_number}</button></td>
                    <td className="px-4 py-4">
                      <p className="text-xs font-bold text-slate-900">{application.nominee_name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{application.office_name}</p>
                    </td>
                    <td className="px-4 py-4 text-xs font-medium text-slate-700">{application.award_name}</td>
                    <td className="px-4 py-4 text-xs text-slate-600">{application.processing_stage}</td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Processing</span>
                      {canResubmit && (
                        <button
                          type="button"
                          onClick={() => openResubmission(application)}
                          className="mt-2 flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100"
                        >
                          <RefreshCw size={13} />
                          Correct & Resubmit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibleApplications.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-14 text-center">
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
              disabled={isWizardSubmitting}
              className="absolute right-3 top-3 z-10 rounded-full bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
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
              onSubmissionStateChange={setIsWizardSubmitting}
            />
          </div>
        </div>
      )}

      {trackingApp && (
        <NomineeTrackingModal
          application={trackingApp}
          onClose={() => setTrackingAppId(null)}
          onCorrect={() => { setTrackingAppId(null); openResubmission(trackingApp); }}
        />
      )}

      {resubmitApp && (
        <NominationActionModal
          application={resubmitApp}
          title="Correct and resubmit nomination"
          task="Replace rejected documents and describe the corrections requested by the reviewer."
          tabs={[{ id: 'corrections', label: 'Required corrections' }]}
          activeTab="corrections"
          onTabChange={() => undefined}
          onClose={closeResubmission}
          footer={<>
            <button type="button" disabled={isResubmitting} onClick={closeResubmission} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button>
            <button type="button" disabled={isResubmitting} onClick={() => void handleResubmit()} className="min-h-11 w-full rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto">
              {isResubmitting ? 'Resubmitting...' : 'Resubmit nomination'}
            </button>
          </>}
        >
          <div className="space-y-5">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-base font-bold text-amber-950">Requested changes</h3>
              <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-amber-900">{resubmitApp.required_action || resubmitApp.remarks || 'Please complete the requested corrections.'}</p>
            </div>
            {(resubmitApp.documents || []).filter(document => document.status === 'Rejected' || document.status === 'Missing').map(document => (
              <div key={document.id} className="border-b border-slate-200 pb-4">
                <p className="break-words text-sm font-semibold text-slate-900">{document.document_name}</p>
                <p className="mt-1 break-words text-sm text-red-700">{document.verification_remarks || 'This document needs replacement.'}</p>
                <label className="mt-3 block text-sm font-semibold text-slate-900" htmlFor={'replacement-' + document.id}>Choose replacement</label>
                <p className="mt-1 text-xs text-slate-500">Accepted formats: PDF, DOCX, JPG, JPEG, PNG. Maximum file size: 10 MB.</p>
                <input id={'replacement-' + document.id} type="file" accept=".pdf,.docx,.jpg,.jpeg,.png" disabled={isResubmitting} onChange={event => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (!/\.(pdf|docx|jpe?g|png)$/i.test(file.name)) {
                    setResubmitError('Unsupported file type. Please upload a PDF, DOCX, JPG, JPEG, or PNG file.');
                    event.target.value = '';
                    return;
                  }
                  if (file.size === 0 || file.size > 10 * 1024 * 1024) {
                    setResubmitError(file.size === 0 ? 'The selected attachment is empty.' : 'File is too large. Maximum file size is 10 MB.');
                    event.target.value = '';
                    return;
                  }
                  setResubmitError('');
                  setReplacementFiles(current => ({ ...current, [document.id]: file }));
                }} className="mt-2 block w-full min-w-0 text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:text-sm file:font-semibold file:text-blue-700" />
                {replacementFiles[document.id] && <p className="mt-2 break-words text-sm text-green-700">Selected: {replacementFiles[document.id].name}</p>}
              </div>
            ))}
            <div>
              <label htmlFor="resubmission-note" className="block text-sm font-semibold text-slate-900">Correction note</label>
              <textarea id="resubmission-note" rows={4} value={resubmissionNote} onChange={event => setResubmissionNote(event.target.value)} className="mt-2 min-h-28 w-full rounded-lg border border-slate-300 p-3 text-sm leading-6 focus:outline-2 focus:outline-blue-600" />
            </div>
            {resubmitError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{resubmitError}</p>}
          </div>
        </NominationActionModal>
      )}

    </div>
  );
};
