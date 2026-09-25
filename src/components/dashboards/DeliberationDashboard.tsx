import React, { useEffect, useMemo, useState } from 'react';
import { Application, Award, UserProfile } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { DocumentViewerModal } from '../common/DocumentViewerModal';
import { NominationActionModal } from '../nomination/NominationActionModal';
import { NominationDetails, NominationDocuments, NominationHistory } from '../nomination/NominationReadOnlySections';
import { NominationQueueCards } from '../nomination/NominationQueueCards';
import { praiseService } from '../../lib/supabase';
import { showToast } from '../../lib/toast';
import { pdfGenerator } from '../../lib/pdfGenerator';
import { Download, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

interface DeliberationDashboardProps {
  applications: Application[];
  users: UserProfile[];
  awards: Award[];
  currentUser: UserProfile;
  onRefreshData: () => void | Promise<void>;
}

const DELIBERATION_STATUSES = new Set([
  'For Evaluation',
  'Under Evaluation',
  'Evaluation Completed',
  'For Deliberation',
  'Approved',
  'Awarded',
  'Not Approved',
]);

export const DeliberationDashboard: React.FC<DeliberationDashboardProps> = ({
  applications,
  users,
  awards,
  currentUser,
  onRefreshData,
}) => {
  const [selectedAwardFilter, setSelectedAwardFilter] = useState('ALL');
  const [selectedAppId, setSelectedAppId] = useState('');
  const [resolutionRemarks, setResolutionRemarks] = useState('');
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [activeTab, setActiveTab] = useState('decision');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const deliberationApps = useMemo(() => applications
    .filter(application => DELIBERATION_STATUSES.has(application.status))
    .filter(application => selectedAwardFilter === 'ALL' || application.award_id === selectedAwardFilter)
    .sort((left, right) => (right.final_weighted_score || 0) - (left.final_weighted_score || 0)), [applications, selectedAwardFilter]);

  useEffect(() => {
    if (!deliberationApps.length) {
      setSelectedAppId('');
      return;
    }

    if (!deliberationApps.some(application => application.id === selectedAppId)) {
      setSelectedAppId(deliberationApps[0].id);
    }
  }, [deliberationApps, selectedAppId]);

  const selectedApp = deliberationApps.find(application => application.id === selectedAppId) || deliberationApps[0];
  const selectedAward = awards.find(award => award.id === selectedApp?.award_id);
  const isDecisionRecorded = Boolean(selectedApp?.deliberation_decision);
  const assignedIds = [...new Set(selectedApp?.assigned_evaluators || [])];
  const submittedById = new Map(
    (selectedApp?.evaluations || [])
      .filter(evaluation => evaluation.is_submitted && assignedIds.includes(evaluation.evaluator_id))
      .sort((left, right) => (left.submitted_at || '').localeCompare(right.submitted_at || ''))
      .map(evaluation => [evaluation.evaluator_id, evaluation] as const)
  );
  const submittedCount = assignedIds.filter(id => submittedById.has(id)).length;
  const pendingCount = assignedIds.length - submittedCount;
  const evaluationsComplete = assignedIds.length > 0 && pendingCount === 0;
  const provisionalAverage = submittedCount > 0
    ? assignedIds.reduce((sum, id) => sum + (submittedById.get(id)?.weighted_percentage || 0), 0) / submittedCount
    : null;
  const hasQualifyingScore = (application: Application) => {
    const award = awards.find(item => item.id === application.award_id);
    return award !== undefined
      && application.processing_stage !== 'Evaluation'
      && application.final_weighted_score !== undefined
      && application.final_weighted_score !== null
      && application.final_weighted_score >= award.min_qualifying_score;
  };
  const selectedQualifies = selectedApp ? hasQualifyingScore(selectedApp) : false;

  async function handleApprove() {
    if (!selectedApp || !hasQualifyingScore(selectedApp)) {
      return;
    }

    setIsBusy(true);
    try {
      await praiseService.approveApplication(
        selectedApp.id,
        resolutionRemarks.trim() || 'Approved by the PRAISE Committee based on the consolidated evaluation results.'
      );
      showToast(`${selectedApp.application_number} approved by the committee.`);
      setResolutionRemarks('');
      await onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to approve the application.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDisapprove() {
    if (!selectedApp) {
      return;
    }

    if (!resolutionRemarks.trim()) {
      alert('Please specify the justification for non-approval.');
      return;
    }

    setIsBusy(true);
    try {
      await praiseService.disapproveApplication(selectedApp.id, resolutionRemarks.trim());
      showToast(`${selectedApp.application_number} marked as not approved.`);
      setResolutionRemarks('');
      await onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to disapprove the application.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleConferAward(application: Application) {
    if (!hasQualifyingScore(application)) {
      return;
    }
    setIsBusy(true);
    try {
      await praiseService.conferAward(
        application.id,
        resolutionRemarks.trim() || 'Conferred PRAISE Award with plaque of recognition and approved incentive.'
      );
      showToast(`Award conferred for ${application.application_number}.`);
      await onRefreshData();
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.5 },
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to confer the award.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div id="deliberation-dashboard-container" className="space-y-6">
      <div className="bg-slate-900 rounded-xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-blue-400" />
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
              City Government of Tacloban PRAISE Committee
            </span>
          </div>
          <h2 className="text-xl font-bold text-white mt-0.5">Deliberation & Ranking Board</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Review consolidated evaluator scores, record committee resolutions, and confer awards to approved nominees.
          </p>
        </div>

        <button
          onClick={() => pdfGenerator.generateEvaluationMatrixReport(deliberationApps.filter(application => application.processing_stage !== 'Evaluation'))}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
        >
          <Download size={14} />
          <span>Official Ranking Matrix</span>
        </button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedAwardFilter('ALL')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
            selectedAwardFilter === 'ALL'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          All Award Categories ({deliberationApps.length})
        </button>

        {awards.map(award => (
          <button
            key={award.id}
            onClick={() => setSelectedAwardFilter(award.id)}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              selectedAwardFilter === award.id
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {award.name}
          </button>
        ))}
      </div>

      <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider px-1">
            Ranked Nominees Matrix ({deliberationApps.length})
          </h3>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <NominationQueueCards applications={deliberationApps} onOpen={application => { setSelectedAppId(application.id); setActiveTab('decision'); setIsDetailsModalOpen(true); }} actionLabel={application => application.processing_stage === 'Deliberation' ? 'Open committee review' : 'View results'} />
            {deliberationApps.length === 0 && <p className="p-8 text-center text-sm text-slate-500 sm:hidden">No nominations are ready for evaluation monitoring.</p>}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-3.5 py-3">Rank</th>
                    <th className="px-3.5 py-3">Nominee</th>
                    <th className="px-3.5 py-3">Office</th>
                    <th className="px-3.5 py-3 text-center">Score</th>
                    <th className="px-3.5 py-3">Status</th>
                    <th className="px-3.5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deliberationApps.map((application, index) => {
                    const isSelected = application.id === selectedApp?.id;
                    const award = awards.find(item => item.id === application.award_id);
                    const qualifies = hasQualifyingScore(application);

                    return (
                      <tr
                        key={application.id}
                        onClick={() => {
                          setSelectedAppId(application.id);
                          setActiveTab('decision');
                          setIsDetailsModalOpen(true);
                        }}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50/70 font-medium' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-3.5 py-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                            index === 0 && application.processing_stage !== 'Evaluation' ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {application.processing_stage === 'Evaluation' ? '—' : index + 1}
                          </span>
                        </td>
                        <td className="px-3.5 py-3">
                          <p className="font-bold text-slate-900">{application.nominee_name}</p>
                          <p className="text-[11px] text-slate-500">{application.award_name}</p>
                        </td>
                        <td className="px-3.5 py-3 text-slate-600">{application.office_name}</td>
                        <td className="px-3.5 py-3 text-center font-bold font-mono text-sm">
                          {application.processing_stage !== 'Evaluation' && application.final_weighted_score !== undefined && application.final_weighted_score !== null
                            ? <span className={qualifies ? 'text-green-700' : 'text-red-700'}>{application.final_weighted_score}%</span>
                            : <span className="text-slate-400">N/A</span>}
                          {award && <p className="text-[10px] font-normal text-slate-500">Minimum {award.min_qualifying_score}%</p>}
                        </td>
                        <td className="px-3.5 py-3">
                          <StatusBadge status={application.status} size="sm" />
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                setSelectedAppId(application.id);
                                setActiveTab('decision');
                          setIsDetailsModalOpen(true);
                              }}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold rounded-md border border-blue-200 cursor-pointer"
                            >
                              View Details
                            </button>
                            {application.status === 'Approved' && (
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                void handleConferAward(application);
                              }}
                              disabled={isBusy || !qualifies}
                              title={!qualifies ? 'Score is below the qualifying standard or unavailable.' : undefined}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 text-[11px] font-bold rounded-md shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              Confer Award
                            </button>
                            )}
                            {application.status === 'Awarded' && (
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                pdfGenerator.generateAwardCertificate(application, awards.find(award => award.id === application.award_id));
                              }}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold rounded-md inline-flex items-center gap-1 cursor-pointer border border-blue-200"
                            >
                              <Download size={12} />
                              <span>Certificate</span>
                            </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
      </div>

      {selectedApp && isDetailsModalOpen && (
        <NominationActionModal
          application={selectedApp}
          title={selectedApp.processing_stage === 'Evaluation' ? 'Evaluation monitoring' : 'PRAISE committee deliberation'}
          task={selectedApp.processing_stage === 'Deliberation' && !isDecisionRecorded
            ? 'Review the final evaluator score and record the committee resolution.'
            : selectedApp.processing_stage === 'Evaluation'
              ? 'Monitor evaluator submissions before the committee decision.'
              : 'Review the recorded decision and nomination progress.'}
          tabs={[{ id: 'decision', label: 'Decision' }, { id: 'results', label: 'Evaluator results' }, { id: 'details', label: 'Details & evidence' }, { id: 'history', label: 'History' }]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onClose={() => setIsDetailsModalOpen(false)}
          footer={selectedApp.processing_stage === 'Deliberation' && evaluationsComplete && !isDecisionRecorded ? (
            <>
              <button type="button" onClick={() => void handleDisapprove()} disabled={isBusy} className="min-h-11 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Not approved</button>
              <button type="button" onClick={() => void handleApprove()} disabled={isBusy || !selectedQualifies} className="min-h-11 w-full rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto">Approve nomination</button>
            </>
          ) : selectedApp.status === 'Approved' ? (
            <button type="button" onClick={() => void handleConferAward(selectedApp)} disabled={isBusy || !selectedQualifies} className="min-h-11 w-full rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto">Confer award</button>
          ) : undefined}
        >
          {activeTab === 'decision' && (
            <div className="space-y-5">
              <section className="rounded-xl bg-slate-50 p-4 sm:p-5">
                <p className="text-sm font-semibold text-slate-600">{evaluationsComplete ? 'Final evaluator score' : 'Evaluation in progress'}</p>
                <p className="mt-1 text-3xl font-bold text-slate-950">{evaluationsComplete && selectedApp.final_weighted_score != null ? selectedApp.final_weighted_score.toFixed(2) + '%' : '?'}</p>
                <p className="mt-2 text-sm text-slate-600">{submittedCount} of {assignedIds.length} evaluators submitted.
                  {!evaluationsComplete && provisionalAverage !== null ? ' Provisional average: ' + provisionalAverage.toFixed(2) + '%.' : ''}
                </p>
                {selectedAward && <p className="mt-1 text-xs text-slate-500">Minimum qualifying score: {selectedAward.min_qualifying_score}%</p>}
              </section>
              {selectedApp.processing_stage === 'Deliberation' && !isDecisionRecorded && (
                <div>
                  <h3 className="text-base font-bold text-slate-950">Committee resolution</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">Review the evaluator results before recording a decision. Approval requires a qualifying score.</p>
                  <label htmlFor="resolution-remarks" className="mt-4 block text-sm font-semibold text-slate-900">Resolution notes</label>
                  <textarea id="resolution-remarks" rows={5} value={resolutionRemarks} onChange={event => setResolutionRemarks(event.target.value)} className="mt-2 min-h-32 w-full rounded-lg border border-slate-300 p-3 text-sm leading-6 focus:outline-2 focus:outline-blue-600" />
                  {!selectedQualifies && <p className="mt-2 text-sm text-amber-700">This nomination does not meet the qualifying score for approval.</p>}
                </div>
              )}
              {isDecisionRecorded && <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                <p className="font-bold">Decision recorded: {selectedApp.deliberation_decision}</p>
                {selectedApp.deliberation_remarks && <p className="mt-2 break-words whitespace-pre-wrap leading-6">{selectedApp.deliberation_remarks}</p>}
              </div>}
              {selectedApp.processing_stage === 'Evaluation' && <p className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">The committee decision becomes available when all assigned evaluators submit their scores.</p>}
              {selectedApp.status === 'Awarded' && (
                <button type="button" onClick={() => pdfGenerator.generateAwardCertificate(selectedApp, selectedAward)} className="min-h-11 rounded-lg border border-blue-200 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50">Generate award certificate</button>
              )}
            </div>
          )}
          {activeTab === 'results' && (
            <section>
              <h3 className="text-base font-bold text-slate-950">Evaluator submissions</h3>
              <p className="mt-1 text-sm text-slate-600">{submittedCount} submitted ? {pendingCount} pending</p>
              <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {assignedIds.map(id => {
                  const evaluation = submittedById.get(id);
                  return (
                    <div key={id} className="min-w-0 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="break-words text-sm font-semibold text-slate-900">{users.find(user => user.id === id)?.full_name || evaluation?.evaluator_name || id}</p>
                        <span className={'text-sm font-semibold ' + (evaluation ? 'text-green-700' : 'text-slate-500')}>{evaluation ? evaluation.weighted_percentage.toFixed(2) + '%' : 'Pending'}</span>
                      </div>
                      {evaluation?.general_remarks && <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-slate-600">{evaluation.general_remarks}</p>}
                      {evaluation?.scores?.length ? <details className="mt-2 text-sm text-slate-600"><summary className="cursor-pointer font-semibold text-blue-700">View score breakdown</summary><ul className="mt-2 space-y-1">{evaluation.scores.map(score => <li key={score.id} className="flex justify-between gap-3"><span className="break-words">{score.criterion_name}</span><span className="shrink-0">{score.weighted_score?.toFixed(2) ?? '?'} / {score.weight_percentage}</span></li>)}</ul></details> : null}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {activeTab === 'details' && <div className="space-y-8"><NominationDetails application={selectedApp} /><NominationDocuments application={selectedApp} onOpen={setSelectedDocId} /></div>}
          {activeTab === 'history' && <NominationHistory logs={praiseService.getAuditLogsForApplication(selectedApp.id)} />}
        </NominationActionModal>
      )}

      {selectedApp && selectedDocId && (
        <DocumentViewerModal
          isOpen={true}
          onClose={() => setSelectedDocId(null)}
          document={(selectedApp.documents || []).find(document => document.id === selectedDocId)!}
          nomineeName={selectedApp.nominee_name}
          applicationNumber={selectedApp.application_number}
          userRole={currentUser.role}
        />
      )}

    </div>
  );
};
