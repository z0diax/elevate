import React, { useEffect, useMemo, useState } from 'react';
import { Application, Award, AwardEvaluationRoute, UserProfile } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { NominationActionModal } from '../nomination/NominationActionModal';
import { NominationDetails, NominationDocuments, NominationHistory } from '../nomination/NominationReadOnlySections';
import { NominationQueueCards } from '../nomination/NominationQueueCards';
import { DocumentViewerModal } from '../common/DocumentViewerModal';
import { praiseService } from '../../lib/supabase';
import { showToast } from '../../lib/toast';

interface SecretariatDashboardProps {
  applications: Application[];
  evaluators: UserProfile[];
  awards: Award[];
  currentUser: UserProfile;
  onRefreshData: () => void | Promise<void>;
}

const WORKBENCH_STATUSES = new Set(['Endorsed', 'For Verification', 'Incomplete', 'Verified']);

export const SecretariatDashboard: React.FC<SecretariatDashboardProps> = ({
  applications,
  evaluators,
  awards,
  currentUser,
  onRefreshData,
}) => {
  const workbenchApplications = useMemo(() => applications.filter(application =>
    ['Document Verification', 'Evaluation', 'Deliberation', 'Final Decision', 'Awarded'].includes(application.processing_stage)
  ), [applications]);

  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('documents');
  const [routingRemarks, setRoutingRemarks] = useState('');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [isReturning, setIsReturning] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [routingSuccess, setRoutingSuccess] = useState('');
  const [awardRoute, setAwardRoute] = useState<AwardEvaluationRoute | null>(null);

  useEffect(() => {
    if (selectedAppId && !workbenchApplications.some(application => application.id === selectedAppId)) {
      setSelectedAppId('');
    }
  }, [selectedAppId, workbenchApplications]);

  const selectedApp = workbenchApplications.find(application => application.id === selectedAppId);
  const canProcessVerification = selectedApp?.processing_stage === 'Document Verification'
    && WORKBENCH_STATUSES.has(selectedApp.status);
  const selectedAward = awards.find(award => award.id === selectedApp?.award_id);
  useEffect(() => {
    let active = true;
    setAwardRoute(null);
    if (selectedApp?.status === 'Verified' && selectedApp.award_id) {
      void praiseService.getAwardEvaluationRoute(selectedApp.award_id).then(route => {
        if (active) setAwardRoute(route);
      }).catch(() => { if (active) setAwardRoute(null); });
    }
    return () => { active = false; };
  }, [selectedApp?.award_id, selectedApp?.status]);
  const selectedDoc = selectedApp?.documents?.find(document => document.id === selectedDocId) || null;

  const allDocs = selectedApp?.documents || [];
  const verifiedDocsCount = allDocs.filter(document => document.status === 'Verified').length;
  const allDocsVerified = allDocs.length > 0 && verifiedDocsCount === allDocs.length;

  async function handleVerifyDocument(docId: string, status: 'Verified' | 'Rejected', remarks: string) {
    if (!selectedApp || !canProcessVerification) {
      return;
    }

    setIsBusy(true);
    try {
      await praiseService.verifyDocument(selectedApp.id, docId, status, remarks);
      showToast(`Document marked ${status.toLowerCase()}.`);
      await onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update document verification.');
    } finally {
      setIsBusy(false);
      setSelectedDocId(null);
    }
  }

  async function handleMarkApplicationVerified() {
    if (!selectedApp || !canProcessVerification) {
      return;
    }

    setIsBusy(true);
    try {
      await praiseService.markApplicationVerified(
        selectedApp.id,
        'All mandatory documentary requirements verified and authenticated by Secretariat.'
      );
      showToast('All documents verified. The application is ready for evaluator routing.');
      await onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to mark the application as verified.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReturnApplication() {
    if (!selectedApp || !canProcessVerification) {
      return;
    }

    if (!returnRemarks.trim()) {
      alert('Please provide specific remarks before returning this application.');
      return;
    }

    setIsBusy(true);
    try {
      await praiseService.returnApplicationForRevision(selectedApp.id, returnRemarks.trim());
      showToast('Application returned to the filer for revision.');
      setIsReturning(false);
      setReturnRemarks('');
      await onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to return the application for revision.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRouteToEvaluators() {
    if (!selectedApp || !canProcessVerification) {
      return;
    }

    if (!allDocsVerified && selectedApp.status !== 'Verified') {
      alert('All submitted documents must be verified before routing this application to evaluators.');
      return;
    }

    setIsBusy(true);
    try {
      await praiseService.routeToEvaluators(selectedApp.id, routingRemarks.trim());
      showToast(`${selectedApp.application_number} forwarded to the award's configured evaluators.`);
      setRoutingRemarks('');
      setRoutingSuccess(`${selectedApp.application_number} was forwarded to the award's configured evaluators and remains available for tracking.`);
      await onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to route the application to evaluators.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div id="secretariat-workbench-container" className="space-y-6">
    {routingSuccess && (
      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700" role="status">
        {routingSuccess}
      </div>
    )}
      <div className="bg-slate-900 rounded-xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Secretariat Processing Workbench</span>
          <h2 className="text-xl font-bold text-white mt-0.5">Document Compliance & Evaluator Routing</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Verify documentary submissions, record compliance remarks, and route qualified applications to evaluators.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-800 border border-slate-700 px-4 py-2.5 rounded-lg text-center">
            <p className="text-[10px] text-slate-400 uppercase font-bold">In Verification</p>
            <p className="text-xl font-bold text-amber-400">
              {workbenchApplications.filter(application => application.processing_stage === 'Document Verification' && ['Endorsed', 'For Verification', 'Incomplete'].includes(application.status)).length}
            </p>
          </div>
          <div className="bg-slate-800 border border-slate-700 px-4 py-2.5 rounded-lg text-center">
            <p className="text-[10px] text-slate-400 uppercase font-bold">Ready for Routing</p>
            <p className="text-xl font-bold text-green-400">
              {workbenchApplications.filter(application => application.processing_stage === 'Document Verification' && application.status === 'Verified').length}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Assigned Nominations ({workbenchApplications.length})
            </h3>
            <span className="text-[11px] text-slate-500 font-medium">
              {workbenchApplications.some(application => application.processing_stage === 'Document Verification' && WORKBENCH_STATUSES.has(application.status)) ? 'Open a nomination to review or track it' : 'No applications awaiting verification'}
            </span>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            {workbenchApplications.length > 0 && <NominationQueueCards applications={workbenchApplications} onOpen={application => { setActiveTab('documents'); setSelectedAppId(application.id); }} actionLabel={application => application.processing_stage === 'Document Verification' && WORKBENCH_STATUSES.has(application.status) ? 'Open review' : 'View nomination'} />}
            {workbenchApplications.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <p>No nominations have reached Secretariat processing yet.</p>
                <p className="mt-2 text-xs text-slate-500">
                  Nominations requiring committee decisions are listed under <strong className="font-semibold text-slate-700">PRAISE Deliberation</strong>.
                </p>
              </div>
            ) : (
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Reference</th>
                      <th className="px-5 py-3">Nominee</th>
                      <th className="px-5 py-3">Office</th>
                      <th className="px-5 py-3">Award applied</th>
                      <th className="px-5 py-3">Stage</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {workbenchApplications.map(application => (
                      <tr key={application.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 font-mono text-xs font-bold text-blue-600">{application.application_number}</td>
                        <td className="px-5 py-4 font-semibold text-slate-900">{application.nominee_name}</td>
                        <td className="px-5 py-4 text-slate-600">{application.office_name}</td>
                        <td className="px-5 py-4 font-medium text-slate-700">{application.award_name}</td>
                        <td className="px-5 py-4 text-xs text-slate-600">{application.processing_stage}</td>
                        <td className="px-5 py-4"><StatusBadge status={application.status} size="sm" />
                          {!!application.evaluator_assignments?.length && <div className="mt-1 text-[11px] text-slate-500" title={application.evaluator_assignments.map(assignment => `${assignment.evaluator_name || assignment.evaluator_id}: ${assignment.status}`).join('\n')}>
                            {application.evaluator_assignments.filter(assignment => assignment.status === 'Completed').length} of {application.evaluator_assignments.filter(assignment => assignment.status !== 'Reassigned').length} evaluations completed
                          </div>}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button type="button" onClick={() => { setActiveTab('documents'); setSelectedAppId(application.id); }} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                            {application.processing_stage === 'Document Verification' && WORKBENCH_STATUSES.has(application.status) ? 'Open review' : 'View nomination'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {selectedApp && (
          <NominationActionModal
            application={selectedApp}
            title={canProcessVerification ? (selectedApp.status === 'Verified' ? 'Ready for evaluation' : 'Document verification') : 'Nomination tracking'}
            task={canProcessVerification
              ? selectedApp.status === 'Verified'
                ? 'All documents are verified. Forward this nomination to the evaluator panel.'
                : 'Review each submitted document and record its verification result.'
              : 'This nomination remains available for tracking.'}
            tabs={[{ id: 'documents', label: 'Documents' }, { id: 'details', label: 'Nomination details' }, { id: 'history', label: 'History' }]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onClose={() => setSelectedAppId('')}
            footer={canProcessVerification ? (
              <>
                <button type="button" onClick={() => { setActiveTab('documents'); setIsReturning(value => !value); }} disabled={isBusy} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Return for compliance</button>
                {selectedApp.status === 'Verified' ? (
                  <button type="button" onClick={() => void handleRouteToEvaluators()} disabled={isBusy || !awardRoute?.is_active || awardRoute.evaluators.length !== awardRoute.required_evaluators} className="min-h-11 w-full rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto">Forward to evaluators</button>
                ) : (
                  <button type="button" onClick={() => void handleMarkApplicationVerified()} disabled={isBusy || !allDocsVerified} className="min-h-11 w-full rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto">Mark application verified</button>
                )}
              </>
            ) : undefined}
          >
            {activeTab === 'documents' && (
              <div className="space-y-5">
                {canProcessVerification ? (
                  <div>
                    <h3 className="text-base font-bold text-slate-950">{selectedApp.status === 'Verified' ? 'Your task: Route to evaluators' : 'Your task: Verify documents'}</h3>
                    <p className="mt-1 text-sm text-slate-600">{verifiedDocsCount} of {allDocs.length} documents verified.</p>
                  </div>
                ) : <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">This nomination is at the {selectedApp.processing_stage} stage. Verification controls are no longer available.</p>}
                <NominationDocuments application={selectedApp} onOpen={setSelectedDocId} actionLabel={() => canProcessVerification ? 'Review' : 'View'} />
                {canProcessVerification && selectedApp.status === 'Verified' && (
                  <section className="border-t border-slate-100 pt-5">
                    <h3 className="text-base font-bold text-slate-950">Evaluator panel</h3>
                    <p className="mt-1 text-sm text-slate-600">{awardRoute?.is_active ? `${awardRoute.required_evaluators} configured evaluator(s) will receive this nomination.` : 'Evaluation routing has not been configured or enabled for this award. Ask an Administrator to configure it.'}</p>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {awardRoute?.evaluators.map(member => <li key={member.id} className="break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{member.full_name}</li>)}
                    </ul>
                    <label htmlFor="routing-remarks" className="mt-4 block text-sm font-semibold text-slate-900">Routing instructions (optional)</label>
                    <input id="routing-remarks" type="text" value={routingRemarks} onChange={event => setRoutingRemarks(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:outline-2 focus:outline-blue-600" />
                  </section>
                )}
                {canProcessVerification && isReturning && (
                  <section className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <label htmlFor="return-remarks" className="block text-sm font-semibold text-red-900">Required correction instructions</label>
                    <textarea id="return-remarks" rows={3} value={returnRemarks} onChange={event => setReturnRemarks(event.target.value)} className="mt-2 min-h-24 w-full rounded-lg border border-red-200 p-3 text-sm focus:outline-2 focus:outline-red-600" />
                    <div className="mt-3 flex justify-end gap-2">
                      <button type="button" onClick={() => setIsReturning(false)} className="min-h-11 px-3 text-sm font-semibold text-slate-600">Cancel</button>
                      <button type="button" onClick={() => void handleReturnApplication()} disabled={isBusy} className="min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50">Send return notice</button>
                    </div>
                  </section>
                )}
              </div>
            )}
            {activeTab === 'details' && <NominationDetails application={selectedApp} />}
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
          onVerify={canProcessVerification ? (status, remarks) => void handleVerifyDocument(selectedDoc.id, status, remarks) : undefined}
        />
      )}

    </div>
  );
};
