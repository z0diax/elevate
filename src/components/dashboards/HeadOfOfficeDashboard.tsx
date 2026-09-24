import React, { useEffect, useMemo, useState } from 'react';
import { Application, ApplicationDocument, Award, UserProfile } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { AuditTrailModal } from '../common/AuditTrailModal';
import { DocumentViewerModal } from '../common/DocumentViewerModal';
import { praiseService } from '../../lib/supabase';
import { showToast } from '../../lib/toast';
import { pdfGenerator } from '../../lib/pdfGenerator';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Download,
  FileCheck,
  FileText,
  History,
  RotateCcw,
  UserCheck,
  XCircle,
} from 'lucide-react';

interface HeadOfOfficeDashboardProps {
  applications: Application[];
  currentUser: UserProfile;
  awards: Award[];
  onRefreshData: () => void | Promise<void>;
  onNavigateToNomination: () => void;
}

const isHeadReviewed = (status: string) => ['head approved', 'head rejected'].includes(status.trim().toLowerCase());

export const HeadOfOfficeDashboard: React.FC<HeadOfOfficeDashboardProps> = ({
  applications,
  currentUser,
  awards,
  onRefreshData,
  onNavigateToNomination,
}) => {
  const officeApplications = useMemo(() => applications.filter(application =>
    !currentUser.office_id ||
    application.office_id === currentUser.office_id ||
    application.office_name === currentUser.office_name
  ), [applications, currentUser.office_id, currentUser.office_name]);

  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [remarks, setRemarks] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  useEffect(() => {
    if (!officeApplications.length) {
      setSelectedAppId('');
      return;
    }

    if (selectedAppId && !officeApplications.some(application => application.id === selectedAppId)) {
      setSelectedAppId('');
    }
  }, [officeApplications, selectedAppId]);

  const selectedApp = officeApplications.find(application => application.id === selectedAppId);
  const selectedAward = awards.find(award => award.id === selectedApp?.award_id);
  const selectedDoc = selectedApp?.documents?.find(document => document.id === selectedDocId) || null;
  const allDocumentsHeadApproved = Boolean(selectedApp?.documents?.length)
    && selectedApp?.documents?.every(document => document.status.trim().toLowerCase() === 'head approved');
  const canProcessEndorsement = selectedApp?.processing_stage === 'Endorsement'
    && ['For Endorsement', 'Submitted', 'Returned for Revision'].includes(selectedApp.status);

  const pendingEndorsementCount = officeApplications.filter(application =>
    application.status === 'Submitted' || application.status === 'For Endorsement' || application.status === 'Returned for Revision'
  ).length;

  async function handleEndorse() {
    if (!selectedApp) {
      return;
    }

    if (!allDocumentsHeadApproved) {
      setActionError('Inspect and approve every attached document before endorsing this nomination.');
      return;
    }

    setIsBusy(true);
    try {
      await praiseService.endorseApplication(
        selectedApp.id,
        remarks.trim() || `Officially endorsed by ${currentUser.full_name}, ${currentUser.position_title || 'Head of Office'}.`,
        'Endorsed'
      );
      showToast(`Nomination ${selectedApp.application_number} endorsed and sent to Secretariat.`);
      setRemarks('');
      setActionError('');
      setActionSuccess(`Nomination ${selectedApp.application_number} was endorsed and routed to Secretariat for document verification.`);
      await onRefreshData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to endorse the application.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDocumentReview(documentId: string, status: 'Head Approved' | 'Head Rejected', reviewRemarks: string) {
    const document = selectedApp?.documents?.find(item => item.id === documentId);
    if (!selectedApp || !canProcessEndorsement || !document || isBusy
      || isHeadReviewed(document.status)) return;
    setIsBusy(true);
    try {
      await praiseService.inspectDocumentForEndorsement(selectedApp.id, documentId, status, reviewRemarks);
      showToast(`Document ${status === 'Head Approved' ? 'approved' : 'rejected'}.`);
      setSelectedDocId(null);
      setActionError('');
      await onRefreshData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to record the document inspection.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReturn() {
    if (!selectedApp) {
      return;
    }

    if (!remarks.trim()) {
      setActionError('Mandatory: Please state the specific revision instructions.');
      return;
    }

    setIsBusy(true);
    try {
      await praiseService.endorseApplication(selectedApp.id, remarks.trim(), 'Returned for Revision');
      showToast(`Nomination ${selectedApp.application_number} returned for revision.`);
      setRemarks('');
      setActionError('');
      setActionSuccess(`Nomination ${selectedApp.application_number} was returned to the filer for revision.`);
      await onRefreshData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to return the application for revision.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReject() {
    if (!selectedApp) {
      return;
    }

    if (!remarks.trim()) {
      setActionError('Mandatory: Please provide formal reasons for non-endorsement.');
      return;
    }

    setIsBusy(true);
    try {
      await praiseService.endorseApplication(
        selectedApp.id,
        `Head of Office non-endorsement: ${remarks.trim()}`,
        'Rejected'
      );
      showToast(`Nomination ${selectedApp.application_number} was declined.`);
      setRemarks('');
      setActionError('');
      setActionSuccess(`Nomination ${selectedApp.application_number} was declined and recorded in the audit trail.`);
      await onRefreshData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to record the non-endorsement decision.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div id="head-of-office-dashboard-container" className="space-y-6">
      <div className="bg-slate-900 rounded-xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-blue-400" />
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
              {currentUser.office_name || 'Department Endorsement Portal'}
            </span>
          </div>
          <h2 className="text-xl font-bold text-white mt-0.5">Head of Office Endorsement Desk</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Review office nominations and record the official endorsement decision before Secretariat processing begins.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-lg text-center">
            <p className="text-[10px] text-slate-400 uppercase font-bold">Pending Endorsement</p>
            <p className="text-xl font-bold text-amber-400">{pendingEndorsementCount}</p>
          </div>
          <button
            onClick={onNavigateToNomination}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors cursor-pointer"
          >
            Nominate Staff Member
          </button>
        </div>
      </div>

      <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider px-1">
            Office Nominations ({officeApplications.length})
          </h3>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            {officeApplications.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <FileText size={32} className="mx-auto mb-2 opacity-30 text-slate-400" />
                <p className="text-xs font-semibold">No active nominations in your office.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Reference</th>
                      <th className="px-5 py-3">Nominee</th>
                      <th className="px-5 py-3">Award applied</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {officeApplications.map(application => (
                      <tr key={application.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 font-mono text-xs font-bold text-blue-600">{application.application_number}</td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-900">{application.nominee_name}</p>
                          <p className="text-xs text-slate-500">{application.position_title}</p>
                        </td>
                        <td className="px-5 py-4 font-medium text-slate-700">{application.award_name}</td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            Processing
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedAppId(application.id)}
                            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            Review nomination
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        {selectedApp ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6">
            <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-900 px-5 py-4 text-white sm:px-7">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Office endorsement review</p>
                <h3 className="mt-1 text-lg font-bold">{selectedApp.nominee_name}</h3>
                <p className="mt-1 text-xs text-slate-300">{selectedApp.application_number} • {selectedApp.award_name}</p>
              </div>
              <button type="button" onClick={() => setSelectedAppId('')} className="rounded-lg border border-slate-600 px-2.5 py-1 text-lg leading-none text-slate-300 hover:bg-slate-700 hover:text-white" aria-label="Close review modal">×</button>
            </div>
            <div className="min-w-0 overflow-x-hidden overflow-y-auto p-4 sm:p-6">
            <div className="space-y-6">

            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">{selectedApp.nominee_name}</h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {[selectedApp.position_title, selectedApp.employment_category, selectedApp.division_section || selectedApp.office_name].filter(Boolean).join(' • ')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsAuditModalOpen(true)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <History size={14} />
                    <span>Audit Trail</span>
                  </button>
                  <button
                    onClick={() => pdfGenerator.generateApplicationSummary(selectedApp, selectedAward)}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Download size={14} />
                    <span>Summary Dossier</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <h4 className="font-bold text-slate-900">Nominator Justification:</h4>
                  <p className="safe-long-text mt-1 max-w-full overflow-hidden whitespace-pre-wrap p-3 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 leading-relaxed">
                    {selectedApp.justification}
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-slate-900">Key Accomplishments & Concrete Impact:</h4>
                  <p className="safe-long-text mt-1 max-w-full overflow-hidden whitespace-pre-wrap p-3 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 leading-relaxed">
                    {selectedApp.accomplishments}
                  </p>
                </div>

                {selectedApp.supporting_narrative && (
                  <div>
                    <h4 className="font-bold text-slate-900">Supporting Narrative / Acts of Integrity:</h4>
                    <p className="safe-long-text mt-1 max-w-full overflow-hidden whitespace-pre-wrap p-3 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 leading-relaxed">
                      {selectedApp.supporting_narrative}
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <FileCheck size={14} className="text-blue-600" />
                  <span>Attached Documentary Submissions ({selectedApp.documents?.length || 0})</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(selectedApp.documents || []).map((document: ApplicationDocument) => (
                    <div key={document.id} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                      <div className="min-w-0">
                        <span className="block line-clamp-2 min-h-[2rem] font-semibold leading-4 text-slate-800" title={document.document_name}>
                          {document.document_name}
                        </span>
                        {document.verification_remarks ? (
                          <span className="mt-1 block line-clamp-2 min-h-[1.75rem] text-[10px] leading-3.5 text-slate-500" title={document.verification_remarks}>
                           {document.verification_remarks}
                          </span>
                        ) : (
                          <span className="mt-1 block min-h-[1.75rem] text-[10px] leading-3.5 text-slate-400">
                           No inspection remarks yet
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2">
                        <span className={`inline-flex min-h-6 items-center text-[10px] font-bold px-2 py-1 rounded border ${
                          document.status.trim().toLowerCase() === 'head approved'
                           ? 'bg-green-50 text-green-700 border-green-200'
                           : document.status.trim().toLowerCase() === 'head rejected'
                             ? 'bg-red-50 text-red-700 border-red-200'
                             : document.status === 'Submitted'
                               ? 'bg-blue-50 text-blue-700 border-blue-200'
                               : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {document.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedDocId(document.id)}
                          className="rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-blue-700 hover:bg-blue-50"
                        >
                          {canProcessEndorsement && !isHeadReviewed(document.status)
                            ? 'Inspect & Approve'
                            : 'Inspect'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserCheck size={16} className="text-blue-600" />
                <span>Official Endorsement Decision</span>
              </h4>

              {actionError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}
              {actionSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 flex items-center gap-2">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>{actionSuccess}</span>
                </div>
              )}

              {canProcessEndorsement ? <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Endorsement Remarks / Recommendation:
                </label>
                <textarea
                  rows={3}
                  placeholder="Enter endorsement justification, affirmations of character, or revision instructions..."
                  value={remarks}
                  onChange={event => setRemarks(event.target.value)}
                  className="safe-long-text w-full min-w-0 max-w-full text-xs p-3 rounded-md border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div> : (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  This phase is complete. The nomination has been routed to the next assigned personnel:
                  <span className="font-semibold"> Secretariat / Administrator</span>.
                </div>
              )}

              {canProcessEndorsement && <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    id="head-return-btn"
                    onClick={() => void handleReturn()}
                    disabled={isBusy}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <RotateCcw size={14} />
                    <span>Return for Revision</span>
                  </button>
                  <button
                    id="head-reject-btn"
                    onClick={() => void handleReject()}
                    disabled={isBusy}
                    className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <XCircle size={14} />
                    <span>Decline Endorsement</span>
                  </button>
                </div>

                <button
                  id="head-endorse-btn"
                  onClick={() => void handleEndorse()}
                  disabled={isBusy || !allDocumentsHeadApproved}
                  className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <CheckCircle2 size={16} />
                  <span>{allDocumentsHeadApproved ? 'Officially Endorse to Secretariat' : 'Approve Documents Before Endorsing'}</span>
                </button>
              </div>}
            </div>
          </div>
          </div>
            </div>
          </div>
        ) : null}
      </div>

      {selectedApp && (
        <AuditTrailModal
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
          historyLogs={praiseService.getAuditLogsForApplication(selectedApp.id)}
          applicationNumber={selectedApp.application_number}
          nomineeName={selectedApp.nominee_name}
        />
      )}

      {selectedDoc && selectedApp && (
        <DocumentViewerModal
          isOpen={!!selectedDoc}
          onClose={() => setSelectedDocId(null)}
          document={selectedDoc}
          nomineeName={selectedApp.nominee_name}
          applicationNumber={selectedApp.application_number}
          userRole={currentUser.role}
          onHeadReview={canProcessEndorsement && !isBusy && !isHeadReviewed(selectedDoc.status)
            ? (status, reviewRemarks) => void handleDocumentReview(selectedDoc.id, status, reviewRemarks)
            : undefined}
        />
      )}
    </div>
  );
};
