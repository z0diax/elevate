import React, { useEffect, useMemo, useState } from 'react';
import { Application, Award, UserProfile } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { AuditTrailModal } from '../common/AuditTrailModal';
import { praiseService } from '../../lib/supabase';
import { showToast } from '../../lib/toast';
import { pdfGenerator } from '../../lib/pdfGenerator';
import {
  Award as AwardIcon,
  CheckCircle2,
  Download,
  History,
  Scale,
  Sparkles,
  XCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface DeliberationDashboardProps {
  applications: Application[];
  awards: Award[];
  currentUser: UserProfile;
  onRefreshData: () => void | Promise<void>;
}

const DELIBERATION_STATUSES = new Set([
  'Evaluation Completed',
  'For Deliberation',
  'Approved',
  'Awarded',
  'Not Approved',
]);

export const DeliberationDashboard: React.FC<DeliberationDashboardProps> = ({
  applications,
  awards,
  currentUser,
  onRefreshData,
}) => {
  const [selectedAwardFilter, setSelectedAwardFilter] = useState('ALL');
  const [selectedAppId, setSelectedAppId] = useState('');
  const [resolutionRemarks, setResolutionRemarks] = useState('');
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

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
  const hasQualifyingScore = (application: Application) => {
    const award = awards.find(item => item.id === application.award_id);
    return award !== undefined
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
          onClick={() => pdfGenerator.generateEvaluationMatrixReport(deliberationApps)}
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
            <div className="overflow-x-auto">
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
                          setIsDetailsModalOpen(true);
                        }}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50/70 font-medium' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-3.5 py-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                            index === 0 ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {index + 1}
                          </span>
                        </td>
                        <td className="px-3.5 py-3">
                          <p className="font-bold text-slate-900">{application.nominee_name}</p>
                          <p className="text-[11px] text-slate-500">{application.award_name}</p>
                        </td>
                        <td className="px-3.5 py-3 text-slate-600">{application.office_name}</td>
                        <td className="px-3.5 py-3 text-center font-bold font-mono text-sm">
                          {application.final_weighted_score !== undefined && application.final_weighted_score !== null
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

      {selectedApp && isDetailsModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="deliberation-details-title">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-900 px-5 py-4 text-white sm:px-7">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-300">Nomination details & committee review</p>
                  <h4 id="deliberation-details-title" className="mt-1 text-lg font-bold tracking-tight">{selectedApp.nominee_name}</h4>
                  <p className="mt-1 text-xs text-slate-300">
                    {[selectedApp.position_title, selectedApp.office_name].filter(Boolean).join(' • ')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedApp.status} size="md" />
                  <button
                    onClick={() => setIsDetailsModalOpen(false)}
                    className="rounded-lg border border-slate-600 px-2.5 py-1 text-lg leading-none text-slate-300 hover:bg-slate-700 hover:text-white"
                    aria-label="Close nomination details"
                  >
                    ×
                  </button>
                </div>
              </div>

            <div className="overflow-y-auto">
              <div className="space-y-5 p-5 sm:p-7">
              <div className="flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Award category</p>
                  <p className="mt-1 text-base font-bold text-slate-900">{selectedAward?.name || selectedApp.award_name}</p>
                </div>
                <button
                  onClick={() => setIsAuditModalOpen(true)}
                  className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:self-auto"
                >
                  <History size={14} />
                  <span>Audit Trail</span>
                </button>
              </div>

              <div className={`rounded-lg border p-3 text-xs font-semibold ${selectedQualifies ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                {selectedApp.final_weighted_score === undefined || selectedApp.final_weighted_score === null
                  ? 'A completed evaluation score is required before this nomination can be approved or awarded.'
                  : selectedAward
                    ? `Final score: ${selectedApp.final_weighted_score}%. Minimum qualifying score: ${selectedAward.min_qualifying_score}%. ${selectedQualifies ? 'Qualifies for an award.' : 'Below the qualifying standard; this nomination cannot be approved or awarded.'}`
                    : 'The award qualifying standard is unavailable. This nomination cannot be approved or awarded.'}
              </div>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-1 rounded-full bg-blue-600" />
                  <h5 className="text-sm font-bold tracking-tight text-slate-900">Nomination summary</h5>
                </div>
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nominee</p>
                    <p className="mt-1 font-semibold text-slate-800">{selectedApp.nominee_name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Position / office</p>
                    <p className="mt-1 font-semibold text-slate-800">{[selectedApp.position_title, selectedApp.office_name].filter(Boolean).join(' • ')}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2">
                    <p className="text-xs font-bold text-slate-800">Justification & merits</p>
                    <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedApp.justification}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2">
                    <p className="text-xs font-bold text-slate-800">Accomplishments & public impact</p>
                    <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedApp.accomplishments}</p>
                  </div>
                  {selectedApp.supporting_narrative && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2">
                      <p className="text-xs font-bold text-slate-800">Supporting narrative</p>
                      <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedApp.supporting_narrative}</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h5 className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
                  <Scale size={14} className="text-blue-600" />
                  <span>Evaluator assessments</span>
                  </h5>
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold text-blue-700">{(selectedApp.evaluations || []).length} submitted</span>
                </div>

                <div className="space-y-3">
                  {(selectedApp.evaluations || []).map(evaluation => (
                    <div key={evaluation.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Evaluator</p>
                          <p className="mt-1 text-sm font-bold text-slate-900">{evaluation.evaluator_name}</p>
                        </div>
                        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-right">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Weighted score</p>
                          <p className="mt-0.5 font-mono text-base font-bold text-emerald-700">{evaluation.total_score || evaluation.weighted_percentage}%</p>
                        </div>
                      </div>
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Evaluator remarks</p>
                        <p className="safe-long-text mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                          <span className="safe-long-text block whitespace-pre-wrap">{evaluation.general_remarks || 'No remarks submitted.'}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div>
                  <h5 className="text-sm font-bold tracking-tight text-slate-900">Committee decision</h5>
                  <p className="mt-1 text-xs text-slate-500">Record the rationale and final resolution for this nomination.</p>
                </div>
                <label className="block text-xs font-bold text-slate-700">
                  Resolution notes / deliberation minutes
                </label>
                <textarea
                  rows={3}
                  placeholder="Record the committee action, rationale, and final resolution."
                  value={isDecisionRecorded ? (selectedApp.deliberation_remarks || '') : resolutionRemarks}
                  onChange={event => setResolutionRemarks(event.target.value)}
                  readOnly={isDecisionRecorded}
                  className="safe-long-text min-h-28 w-full min-w-0 max-w-full resize-y rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm leading-6 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 read-only:cursor-default"
                />

                {isDecisionRecorded ? (
                  <p className="rounded-lg bg-slate-50 p-3 text-xs font-semibold text-slate-600">
                    Committee decision recorded: {selectedApp.deliberation_decision}. This decision cannot be changed.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-3">
                    <button
                      id="disapprove-btn"
                      onClick={() => void handleDisapprove()}
                      disabled={isBusy}
                      className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <XCircle size={14} />
                      <span>Disapprove</span>
                    </button>

                    <button
                      id="approve-btn"
                      onClick={() => void handleApprove()}
                      disabled={isBusy || !selectedQualifies}
                      title={!selectedQualifies ? 'Score is below the qualifying standard or unavailable.' : undefined}
                      className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <CheckCircle2 size={14} />
                      <span>Approve for Award</span>
                    </button>
                  </div>
                )}
              </section>

              {selectedApp.status === 'Awarded' && (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-center space-y-2">
                  <div className="flex items-center justify-center gap-1.5 text-amber-900 font-bold text-xs">
                    <AwardIcon size={16} />
                    <span>Official Award Conferred</span>
                  </div>
                  <button
                    onClick={() => pdfGenerator.generateAwardCertificate(selectedApp, selectedAward)}
                    className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-md shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Download size={14} />
                    <span>Generate Certificate</span>
                  </button>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      ) : null}

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
