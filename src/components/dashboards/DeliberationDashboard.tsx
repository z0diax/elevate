import React, { useEffect, useMemo, useState } from 'react';
import { Application, Award, UserProfile } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { AuditTrailModal } from '../common/AuditTrailModal';
import { praiseService } from '../../lib/supabase';
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

  async function handleApprove() {
    if (!selectedApp) {
      return;
    }

    setIsBusy(true);
    try {
      await praiseService.approveApplication(
        selectedApp.id,
        resolutionRemarks.trim() || 'Approved by the PRAISE Committee based on the consolidated evaluation results.'
      );
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
      setResolutionRemarks('');
      await onRefreshData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to disapprove the application.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleConferAward(application: Application) {
    setIsBusy(true);
    try {
      await praiseService.conferAward(
        application.id,
        resolutionRemarks.trim() || 'Conferred PRAISE Award with plaque of recognition and approved incentive.'
      );
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`${selectedApp ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-3`}>
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

                    return (
                      <tr
                        key={application.id}
                        onClick={() => setSelectedAppId(application.id)}
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
                            ? <span className="text-green-700">{application.final_weighted_score}%</span>
                            : <span className="text-slate-400">N/A</span>}
                        </td>
                        <td className="px-3.5 py-3">
                          <StatusBadge status={application.status} size="sm" />
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          {application.status === 'Approved' && (
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                void handleConferAward(application);
                              }}
                              disabled={isBusy}
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {selectedApp ? (
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-base font-bold text-slate-900">{selectedApp.nominee_name}</h4>
                  <p className="text-xs text-slate-500">
                    {[selectedApp.position_title, selectedApp.office_name].filter(Boolean).join(' • ')}
                  </p>
                </div>
                <StatusBadge status={selectedApp.status} size="md" />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">Award Category</p>
                  <p className="text-sm font-bold text-blue-700">{selectedAward?.name || selectedApp.award_name}</p>
                </div>
                <button
                  onClick={() => setIsAuditModalOpen(true)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <History size={14} />
                  <span>Audit Trail</span>
                </button>
              </div>

              <div>
                <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Scale size={14} className="text-blue-600" />
                  <span>Evaluator Assessments ({(selectedApp.evaluations || []).length})</span>
                </h5>

                <div className="space-y-2">
                  {(selectedApp.evaluations || []).map(evaluation => (
                    <div key={evaluation.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-slate-900">{evaluation.evaluator_name}</span>
                        <span className="font-mono font-bold text-green-700">{evaluation.total_score || evaluation.weighted_percentage}%</span>
                      </div>
                      <p className="text-[11px] text-slate-600 italic">
                        "{evaluation.general_remarks || 'No remarks submitted.'}"
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-3">
                <label className="block text-xs font-bold text-slate-900">
                  PRAISE Committee Resolution Notes / Deliberation Minutes:
                </label>
                <textarea
                  rows={3}
                  placeholder="Record the committee action, rationale, and final resolution."
                  value={isDecisionRecorded ? (selectedApp.deliberation_remarks || '') : resolutionRemarks}
                  onChange={event => setResolutionRemarks(event.target.value)}
                  readOnly={isDecisionRecorded}
                  className="w-full text-xs p-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden read-only:cursor-default"
                />

                {isDecisionRecorded ? (
                  <p className="pt-2 text-xs font-semibold text-slate-500">
                    Committee decision recorded: {selectedApp.deliberation_decision}. This decision cannot be changed.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
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
                      disabled={isBusy}
                      className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <CheckCircle2 size={14} />
                      <span>Approve for Award</span>
                    </button>
                  </div>
                )}
              </div>

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
    </div>
  );
};
