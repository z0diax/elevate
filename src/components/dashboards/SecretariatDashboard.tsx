import React, { useEffect, useMemo, useState } from 'react';
import { Application, ApplicationDocument, Award, UserProfile } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { StageProgressTracker } from '../common/StageProgressTracker';
import { DocumentViewerModal } from '../common/DocumentViewerModal';
import { AuditTrailModal } from '../common/AuditTrailModal';
import { praiseService } from '../../lib/supabase';
import {
  FileCheck2,
  FileText,
  History,
  RotateCcw,
  Send,
  Users,
} from 'lucide-react';

interface SecretariatDashboardProps {
  applications: Application[];
  evaluators: UserProfile[];
  awards: Award[];
  currentUser: UserProfile;
  onRefreshData: () => void | Promise<void>;
}

const WORKBENCH_STATUSES = new Set([
  'Endorsed',
  'For Verification',
  'Incomplete',
  'Verified',
  'For Evaluation',
  'Under Evaluation',
  'Evaluation Completed',
]);

export const SecretariatDashboard: React.FC<SecretariatDashboardProps> = ({
  applications,
  evaluators,
  awards,
  currentUser,
  onRefreshData,
}) => {
  const workbenchApplications = useMemo(() => applications.filter(application => WORKBENCH_STATUSES.has(application.status)), [applications]);

  const [selectedAppId, setSelectedAppId] = useState<string>(workbenchApplications[0]?.id || '');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [selectedEvaluatorIds, setSelectedEvaluatorIds] = useState<string[]>([]);
  const [routingRemarks, setRoutingRemarks] = useState('');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [isReturning, setIsReturning] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!workbenchApplications.length) {
      setSelectedAppId('');
      return;
    }

    if (!workbenchApplications.some(application => application.id === selectedAppId)) {
      setSelectedAppId(workbenchApplications[0].id);
    }
  }, [selectedAppId, workbenchApplications]);

  const selectedApp = workbenchApplications.find(application => application.id === selectedAppId) || workbenchApplications[0];
  const selectedAward = awards.find(award => award.id === selectedApp?.award_id);
  const selectedDoc = selectedApp?.documents?.find(document => document.id === selectedDocId) || null;

  useEffect(() => {
    setSelectedEvaluatorIds(selectedApp?.assigned_evaluators || []);
  }, [selectedApp?.id, selectedApp?.assigned_evaluators]);

  const allDocs = selectedApp?.documents || [];
  const verifiedDocsCount = allDocs.filter(document => document.status === 'Verified').length;
  const allDocsVerified = allDocs.length > 0 && verifiedDocsCount === allDocs.length;

  async function handleVerifyDocument(docId: string, status: 'Verified' | 'Rejected', remarks: string) {
    if (!selectedApp) {
      return;
    }

    setIsBusy(true);
    try {
      await praiseService.verifyDocument(selectedApp.id, docId, status, remarks);
      await onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update document verification.');
    } finally {
      setIsBusy(false);
      setSelectedDocId(null);
    }
  }

  async function handleMarkApplicationVerified() {
    if (!selectedApp) {
      return;
    }

    setIsBusy(true);
    try {
      await praiseService.markApplicationVerified(
        selectedApp.id,
        'All mandatory documentary requirements verified and authenticated by Secretariat.'
      );
      await onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to mark the application as verified.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReturnApplication() {
    if (!selectedApp) {
      return;
    }

    if (!returnRemarks.trim()) {
      alert('Please provide specific remarks before returning this application.');
      return;
    }

    setIsBusy(true);
    try {
      await praiseService.returnApplicationForRevision(selectedApp.id, returnRemarks.trim());
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
    if (!selectedApp) {
      return;
    }

    if (!allDocsVerified && selectedApp.status !== 'Verified') {
      alert('All submitted documents must be verified before routing this application to evaluators.');
      return;
    }

    if (!selectedEvaluatorIds.length) {
      alert('Please select at least one evaluator.');
      return;
    }

    setIsBusy(true);
    try {
      await praiseService.routeToEvaluators(selectedApp.id, selectedEvaluatorIds, routingRemarks.trim());
      setRoutingRemarks('');
      await onRefreshData();
      alert(`Successfully routed ${selectedApp.nominee_name} to ${selectedEvaluatorIds.length} evaluator(s).`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to route the application to evaluators.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div id="secretariat-workbench-container" className="space-y-6">
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
              {workbenchApplications.filter(application => ['Endorsed', 'For Verification', 'Incomplete'].includes(application.status)).length}
            </p>
          </div>
          <div className="bg-slate-800 border border-slate-700 px-4 py-2.5 rounded-lg text-center">
            <p className="text-[10px] text-slate-400 uppercase font-bold">Ready for Routing</p>
            <p className="text-xl font-bold text-green-400">
              {workbenchApplications.filter(application => application.status === 'Verified').length}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`${selectedApp ? 'lg:col-span-4' : 'lg:col-span-12'} space-y-3`}>
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Verification Queue ({workbenchApplications.length})
            </h3>
            <span className="text-[11px] text-slate-500 font-medium">
              {selectedApp ? 'Select application' : 'No applications awaiting verification'}
            </span>
          </div>

          <div className="space-y-2 max-h-[75vh] overflow-y-auto pr-1">
            {workbenchApplications.length === 0 ? (
              <div className="bg-white p-12 text-center rounded-xl border border-slate-200 text-slate-400">
                No applications are currently awaiting document verification.
              </div>
            ) : workbenchApplications.map(application => {
              const isSelected = application.id === selectedApp?.id;
              return (
                <div
                  key={application.id}
                  id={`secretariat-app-card-${application.id}`}
                  onClick={() => setSelectedAppId(application.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/70 border-blue-500 shadow-2xs'
                      : 'bg-white border-slate-200 hover:bg-slate-50 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[11px] font-bold text-blue-600">
                      {application.application_number}
                    </span>
                    <StatusBadge status={application.status} size="sm" />
                  </div>

                  <h4 className="text-xs font-bold text-slate-900 truncate">{application.nominee_name}</h4>
                  <p className="text-[11px] text-slate-500 truncate">
                    {[application.position_title, application.office_name].filter(Boolean).join(' • ')}
                  </p>

                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-600 font-medium truncate max-w-[170px]">{application.award_name}</span>
                    <span className="text-slate-400 shrink-0">{application.documents?.length || 0} docs</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {selectedApp ? (
          <div className="lg:col-span-8 space-y-6">
            <StageProgressTracker
              currentStage={selectedApp.processing_stage}
              currentStatus={selectedApp.status}
            />

            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">{selectedApp.nominee_name}</h3>
                    <StatusBadge status={selectedApp.status} size="sm" />
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {[selectedApp.position_title, selectedApp.office_name, selectedApp.barangay].filter(Boolean).join(' • ')}
                  </p>
                </div>

                <button
                  id="view-audit-trail-btn"
                  onClick={() => setIsAuditModalOpen(true)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <History size={14} />
                  <span>Audit History</span>
                </button>
              </div>

              <div className="text-xs space-y-2">
                <div>
                  <span className="font-bold text-slate-900">Justification & Merits:</span>
                  <p className="text-slate-700 mt-1 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
                    {selectedApp.justification}
                  </p>
                </div>

                <div>
                  <span className="font-bold text-slate-900">Accomplishments & Public Impact:</span>
                  <p className="text-slate-700 mt-1 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
                    {selectedApp.accomplishments}
                  </p>
                </div>

                {selectedAward && (
                  <div>
                    <span className="font-bold text-slate-900">Award Category:</span>
                    <p className="text-slate-700 mt-1">{selectedAward.name}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FileCheck2 size={16} className="text-blue-600" />
                    <span>Documentary Requirements Verification Checklist</span>
                  </h4>
                  <p className="text-xs text-slate-500">
                    Progress: <strong className="text-blue-600">{verifiedDocsCount}</strong> of {allDocs.length} verified compliant
                  </p>
                </div>

                {allDocsVerified && selectedApp.status !== 'Verified' && (
                  <button
                    id="mark-app-all-verified-btn"
                    onClick={() => void handleMarkApplicationVerified()}
                    disabled={isBusy}
                    className="px-3.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Confirm All Documents Verified
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {allDocs.map((document: ApplicationDocument) => (
                  <div
                    key={document.id}
                    id={`doc-row-${document.id}`}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-blue-600 shrink-0" />
                        <span className="text-xs font-bold text-slate-900 truncate">{document.document_name}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                          document.status === 'Verified'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : document.status === 'Rejected'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {document.status}
                        </span>
                      </div>
                      {document.verification_remarks && (
                        <p className="text-[11px] text-slate-500 mt-1 pl-6">
                          Remarks: <em>{document.verification_remarks}</em>
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => setSelectedDocId(document.id)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-md inline-flex items-center gap-1 cursor-pointer shadow-xs"
                    >
                      <span>Inspect & Verify</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users size={16} className="text-blue-600" />
                  <span>Assign Evaluators & Forward for Scoring</span>
                </h4>
                <p className="text-xs text-slate-500">
                  Select evaluator accounts who will score this nomination against the configured award criteria.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {evaluators.map(evaluator => {
                  const isChecked = selectedEvaluatorIds.includes(evaluator.id);
                  return (
                    <label
                      key={evaluator.id}
                      className={`p-3 rounded-lg border flex items-center gap-3 cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-blue-50 border-blue-500'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={event => {
                          if (event.target.checked) {
                            setSelectedEvaluatorIds(previous => [...previous, evaluator.id]);
                          } else {
                            setSelectedEvaluatorIds(previous => previous.filter(id => id !== evaluator.id));
                          }
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{evaluator.full_name}</p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {[evaluator.position_title, evaluator.office_name].filter(Boolean).join(' • ')}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Routing Instructions / Special Assessment Directives:
                </label>
                <input
                  type="text"
                  placeholder="Optional instructions for the evaluator panel"
                  value={routingRemarks}
                  onChange={event => setRoutingRemarks(event.target.value)}
                  className="w-full text-xs p-2.5 rounded-md border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  id="return-for-revision-btn"
                  onClick={() => setIsReturning(previous => !previous)}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw size={14} />
                  <span>Return for Revision</span>
                </button>

                <button
                  id="forward-to-evaluators-btn"
                  onClick={() => void handleRouteToEvaluators()}
                  disabled={isBusy}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Send size={14} />
                  <span>Forward to Selected Evaluators ({selectedEvaluatorIds.length})</span>
                </button>
              </div>

              {isReturning && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-3">
                  <label className="block text-xs font-bold text-red-900">
                    Mandatory Return Remarks / Deficiency Notice:
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Specify the missing documents or clarifications required."
                    value={returnRemarks}
                    onChange={event => setReturnRemarks(event.target.value)}
                    className="w-full text-xs p-2.5 rounded-md border border-red-200 bg-white text-slate-900"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsReturning(false)}
                      className="px-3 py-1.5 text-xs text-slate-500 font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void handleReturnApplication()}
                      disabled={isBusy}
                      className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-md cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Send Return Notice
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {selectedDoc && selectedApp && (
        <DocumentViewerModal
          isOpen={!!selectedDoc}
          onClose={() => setSelectedDocId(null)}
          document={selectedDoc}
          nomineeName={selectedApp.nominee_name}
          applicationNumber={selectedApp.application_number}
          userRole={currentUser.role}
          onVerify={(status, remarks) => void handleVerifyDocument(selectedDoc.id, status, remarks)}
        />
      )}

      {selectedApp && (
        <AuditTrailModal
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
          historyLogs={praiseService.getAuditLogsForApplication(selectedApp.id)}
          applicationNumber={selectedApp.application_number}
          nomineeName={selectedApp.nominee_name}
        />
      )}
    </div>
  );
};
