import React, { useEffect, useMemo, useState } from 'react';
import { Application, Award, UserProfile } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { NominationActionModal } from '../nomination/NominationActionModal';
import { NominationDetails, NominationDocuments, NominationHistory } from '../nomination/NominationReadOnlySections';
import { NominationQueueCards } from '../nomination/NominationQueueCards';
import { DocumentViewerModal } from '../common/DocumentViewerModal';
import { praiseService } from '../../lib/supabase';
import { showToast } from '../../lib/toast';
import { pdfGenerator } from '../../lib/pdfGenerator';
import { Building2, FileText } from 'lucide-react';

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
    application.status !== 'Draft'
    && Boolean(currentUser.office_id)
    && application.office_id === currentUser.office_id
  ), [applications, currentUser.office_id]);

  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [remarks, setRemarks] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('review');

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
  const hasAllMandatoryDocuments = Boolean(selectedAward)
    && (selectedAward?.document_requirements || [])
      .filter(requirement => requirement.is_mandatory)
      .every(requirement => selectedApp?.documents?.some(document =>
        document.requirement_id === requirement.id && Boolean(document.file_url) && (document.file_size || 0) > 0
      ));
  const allDocumentsHeadApproved = Boolean(selectedApp?.documents?.length)
    && hasAllMandatoryDocuments
    && selectedApp?.documents?.every(document => document.status.trim().toLowerCase() === 'head approved');
  const canProcessEndorsement = selectedApp?.processing_stage === 'Endorsement'
    && ['For Endorsement', 'Submitted'].includes(selectedApp.status);

  const pendingEndorsementCount = officeApplications.filter(application =>
    application.processing_stage === 'Endorsement'
    && (application.status === 'Submitted' || application.status === 'For Endorsement')
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
            Monitor nominations from your office and record endorsement decisions when they await your review.
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
            {officeApplications.length > 0 && <NominationQueueCards applications={officeApplications} onOpen={application => { setActiveTab('review'); setSelectedAppId(application.id); }} actionLabel={application => application.processing_stage === 'Endorsement' && ['For Endorsement', 'Submitted'].includes(application.status) ? 'Review nomination' : 'View nomination'} />}
            {officeApplications.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <FileText size={32} className="mx-auto mb-2 opacity-30 text-slate-400" />
                <p className="text-xs font-semibold">
                  {currentUser.office_id ? 'No nominations found in your assigned office.' : 'No office is assigned to your account.'}
                </p>
              </div>
            ) : (
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Reference</th>
                      <th className="px-5 py-3">Nominee</th>
                      <th className="px-5 py-3">Award applied</th>
                      <th className="px-5 py-3">Stage</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Required Action</th>
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
                        <td className="px-5 py-4 text-xs text-slate-600">{application.processing_stage}</td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            Processing
                          </span>
                        </td>
                        <td className="max-w-xs px-5 py-4 text-xs text-slate-600">{application.required_action || 'No action required.'}</td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => { setActiveTab('review'); setSelectedAppId(application.id); }}
                            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            {application.processing_stage === 'Endorsement' && ['For Endorsement', 'Submitted'].includes(application.status)
                              ? 'Review nomination' : 'View nomination'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        {selectedApp && (
          <NominationActionModal
            application={selectedApp}
            title={canProcessEndorsement ? 'Office endorsement' : 'Office nomination tracking'}
            task={canProcessEndorsement
              ? 'Review the supporting documents, then record your endorsement decision.'
              : selectedApp.status === 'Returned for Revision'
                ? 'Awaiting corrections from the filer.'
                : 'This nomination remains available for tracking.'}
            tabs={[
              { id: 'review', label: canProcessEndorsement ? 'Review' : 'Status' },
              { id: 'details', label: 'Nomination details' },
              { id: 'history', label: 'History' },
            ]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onClose={() => setSelectedAppId('')}
            footer={canProcessEndorsement ? (
              <>
                <button type="button" onClick={() => { setActiveTab('review'); void handleReturn(); }} disabled={isBusy} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Return for revision</button>
                <button type="button" onClick={() => { setActiveTab('review'); void handleReject(); }} disabled={isBusy} className="min-h-11 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Decline endorsement</button>
                <button type="button" onClick={() => { setActiveTab('review'); void handleEndorse(); }} disabled={isBusy || !allDocumentsHeadApproved} className="min-h-11 w-full rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">Endorse nomination</button>
              </>
            ) : undefined}
          >
            {activeTab === 'review' && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-950">{canProcessEndorsement ? 'Your task' : 'Current status'}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{canProcessEndorsement
                      ? 'Inspect and approve each attached document before endorsing. Add remarks for a return or decline.'
                      : selectedApp.required_action || 'No action is currently required from your office.'}</p>
                  </div>
                  <StatusBadge status={selectedApp.status} size="sm" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  {selectedApp.documents?.filter(document => document.status.trim().toLowerCase() === 'head approved').length || 0} of {selectedApp.documents?.length || 0} documents approved
                </p>
                <NominationDocuments
                  application={selectedApp}
                  onOpen={setSelectedDocId}
                  actionLabel={status => canProcessEndorsement && !isHeadReviewed(status) ? 'Inspect and approve' : 'View'}
                />
                {canProcessEndorsement && (
                  <div>
                    <label htmlFor="endorsement-remarks" className="block text-sm font-semibold text-slate-900">Endorsement remarks or revision instructions</label>
                    <textarea id="endorsement-remarks" rows={3} value={remarks} onChange={event => setRemarks(event.target.value)} className="mt-2 min-h-24 w-full min-w-0 resize-y rounded-lg border border-slate-300 p-3 text-sm leading-6 text-slate-900 focus:outline-2 focus:outline-blue-600" />
                    {!allDocumentsHeadApproved && <p className="mt-2 text-sm text-amber-700">Approve every required document before endorsing.</p>}
                  </div>
                )}
                {actionError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
                {actionSuccess && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{actionSuccess}</p>}
              </div>
            )}
            {activeTab === 'details' && <div className="space-y-5">
              <button type="button" onClick={() => pdfGenerator.generateApplicationSummary(selectedApp, selectedAward)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Download summary dossier</button>
              <NominationDetails application={selectedApp} />
            </div>}
            {activeTab === 'history' && <NominationHistory logs={praiseService.getAuditLogsForApplication(selectedApp.id)} />}
          </NominationActionModal>
        )}
      </div>


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
