import React, { useEffect, useMemo, useState } from 'react';
import { Application, Award, UserProfile } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { StageProgressTracker } from '../common/StageProgressTracker';
import { DocumentViewerModal } from '../common/DocumentViewerModal';
import { praiseService } from '../../lib/supabase';
import { showToast } from '../../lib/toast';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileCheck,
  FileText,
  Lock,
  Percent,
  Scale,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface EvaluatorDashboardProps {
  applications: Application[];
  awards: Award[];
  currentUser: UserProfile;
  onRefreshData: () => void | Promise<void>;
}

type CriterionInput = {
  raw_score: number;
  remarks: string;
};

export const EvaluatorDashboard: React.FC<EvaluatorDashboardProps> = ({
  applications,
  awards,
  currentUser,
  onRefreshData,
}) => {
  const assignedApplications = useMemo(() => applications.filter(application => {
    const isAssigned = application.assigned_evaluators?.includes(currentUser.id);
    const isEvaluationStatus = ['For Evaluation', 'Under Evaluation', 'Evaluation Completed'].includes(application.status);
    return isAssigned || isEvaluationStatus;
  }), [applications, currentUser.id]);

  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [criterionScores, setCriterionScores] = useState<Record<string, CriterionInput>>({});
  const [generalRemarks, setGeneralRemarks] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (selectedAppId && !assignedApplications.some(application => application.id === selectedAppId)) {
      setSelectedAppId('');
    }
  }, [assignedApplications, selectedAppId]);

  const selectedApp = assignedApplications.find(application => application.id === selectedAppId);
  const selectedAward = awards.find(award => award.id === selectedApp?.award_id) || null;
  const selectedDoc = selectedApp?.documents?.find(document => document.id === selectedDocId) || null;
  const existingEvaluation = selectedApp?.evaluations?.find(evaluation => evaluation.evaluator_id === currentUser.id);

  useEffect(() => {
    if (!selectedAward) {
      setCriterionScores({});
      setGeneralRemarks('');
      setIsLocked(false);
      return;
    }

    if (existingEvaluation) {
      const nextScores: Record<string, CriterionInput> = {};
      existingEvaluation.scores.forEach(score => {
        nextScores[score.criterion_id] = {
          raw_score: score.raw_score ?? score.score ?? 0,
          remarks: score.evaluator_remarks || score.remarks || '',
        };
      });
      setCriterionScores(nextScores);
      setGeneralRemarks(existingEvaluation.general_remarks || '');
      setIsLocked(Boolean(existingEvaluation.is_submitted));
      return;
    }

    const nextScores: Record<string, CriterionInput> = {};
    (selectedAward.criteria || []).forEach(criterion => {
      nextScores[criterion.id] = {
        raw_score: criterion.max_score || 100,
        remarks: '',
      };
    });
    setCriterionScores(nextScores);
    setGeneralRemarks('');
    setIsLocked(false);
  }, [existingEvaluation, selectedAward, selectedApp?.id]);

  function calculateWeightedScore() {
    if (!selectedAward?.criteria?.length) {
      return 0;
    }

    const total = selectedAward.criteria.reduce((sum, criterion) => {
      const current = criterionScores[criterion.id];
      const raw = Number(current?.raw_score ?? 0);
      const max = Number(criterion.max_score || 100);
      const weight = Number(criterion.weight_percentage || 0);
      return sum + (max > 0 ? (raw / max) * weight : 0);
    }, 0);

    return Number(total.toFixed(2));
  }

  const currentTotalScore = calculateWeightedScore();
  const meetsMinScore = currentTotalScore >= (selectedAward?.min_qualifying_score || 85);

  function handleScoreChange(criterionId: string, rawScore: number, maxScore: number) {
    if (isLocked) {
      return;
    }

    const clamped = Math.max(0, Math.min(rawScore, maxScore || 100));
    setCriterionScores(previous => ({
      ...previous,
      [criterionId]: {
        ...previous[criterionId],
        raw_score: clamped,
      },
    }));
  }

  function handleRemarksChange(criterionId: string, remarks: string) {
    if (isLocked) {
      return;
    }

    setCriterionScores(previous => ({
      ...previous,
      [criterionId]: {
        ...previous[criterionId],
        remarks,
      },
    }));
  }

  async function handleSubmitEvaluation() {
    if (!selectedApp || !selectedAward) {
      return;
    }

    for (const criterion of selectedAward.criteria || []) {
      const value = criterionScores[criterion.id];
      if (!value || Number.isNaN(value.raw_score)) {
        setErrorMsg(`Please enter a valid score for "${criterion.criterion_name}".`);
        return;
      }
    }

    if (!generalRemarks.trim()) {
      setErrorMsg('Please write a summary assessment before submitting.');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    try {
      await praiseService.submitEvaluation({
        application_id: selectedApp.id,
        evaluator_id: currentUser.id,
        evaluator_name: currentUser.full_name,
        evaluator_position: currentUser.position_title || 'PRAISE Committee Member',
        scores: (selectedAward.criteria || []).map(criterion => {
          const current = criterionScores[criterion.id];
          const raw = Number(current?.raw_score ?? 0);
          const max = Number(criterion.max_score || 100);
          const weighted = max > 0 ? Number((((raw / max) * criterion.weight_percentage)).toFixed(2)) : 0;

          return {
            criterion_id: criterion.id,
            criterion_name: criterion.criterion_name,
            raw_score: raw,
            max_score: criterion.max_score,
            weight_percentage: criterion.weight_percentage,
            weighted_score: weighted,
            evaluator_remarks: current?.remarks || '',
          };
        }),
        general_remarks: generalRemarks.trim(),
      });
      showToast(`Evaluation for ${selectedApp.application_number} submitted successfully.`);

      setIsLocked(true);
      await onRefreshData();

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
      });
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Failed to submit the evaluation.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div id="evaluator-dashboard-container" className="space-y-6">
      <div className="bg-slate-900 rounded-xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Scale size={16} className="text-blue-400" />
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
              City of Tacloban PRAISE Assessment Board
            </span>
          </div>
          <h2 className="text-xl font-bold text-white mt-0.5">Evaluator Scoring Workbench</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Review verified documents, score the nomination against the award criteria, and submit your assessment to the committee.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-lg text-center">
            <p className="text-[10px] text-slate-400 uppercase font-bold">Assigned Nominees</p>
            <p className="text-xl font-bold text-white">{assignedApplications.length}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider px-1">
            Assigned Nominees ({assignedApplications.length})
          </h3>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            {assignedApplications.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Scale size={32} className="mx-auto mb-2 opacity-30 text-slate-400" />
                <p className="text-xs font-semibold">No active applications currently assigned to your queue.</p>
              </div>
            ) : (
              assignedApplications.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Reference</th>
                        <th className="px-5 py-3">Nominee</th>
                        <th className="px-5 py-3">Office</th>
                        <th className="px-5 py-3">Award applied</th>
                        <th className="px-5 py-3">Assessment</th>
                        <th className="px-5 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
              {assignedApplications.map(application => {
                const hasMyEval = application.evaluations?.some(evaluation => evaluation.evaluator_id === currentUser.id && evaluation.is_submitted);

                return (
                  <tr
                    key={application.id}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-5 py-4 font-mono text-xs font-bold text-blue-600">{application.application_number}</td>
                    <td className="px-5 py-4 font-semibold text-slate-900">{application.nominee_name}</td>
                    <td className="px-5 py-4 text-slate-600">{application.office_name}</td>
                    <td className="px-5 py-4 font-medium text-slate-700">{application.award_name}</td>
                    <td className="px-5 py-4">
                      {hasMyEval ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-1 text-[10px] font-bold text-green-700">
                          <CheckCircle2 size={11} /> Scored
                        </span>
                      ) : <StatusBadge status={application.status} size="sm" />}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button type="button" onClick={() => setSelectedAppId(application.id)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                        Open assessment
                      </button>
                    </td>
                  </tr>
                );
              })
                    }</tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </div>

        {selectedApp && selectedAward ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6">
            <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-900 px-5 py-4 text-white sm:px-7">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Evaluator assessment</p>
                <h3 className="mt-1 text-lg font-bold">{selectedApp.nominee_name}</h3>
                <p className="mt-1 text-xs text-slate-300">{selectedApp.application_number} • {selectedAward.name}</p>
              </div>
              <button type="button" onClick={() => setSelectedAppId('')} className="rounded-lg border border-slate-600 px-2.5 py-1 text-lg leading-none text-slate-300 hover:bg-slate-700 hover:text-white" aria-label="Close assessment modal">×</button>
            </div>
            <div className="min-w-0 overflow-x-hidden overflow-y-auto p-4 sm:p-6">
            <div className="space-y-6">
            <StageProgressTracker
              currentStage={selectedApp.processing_stage}
              currentStatus={selectedApp.status}
            />

            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{selectedApp.nominee_name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {[selectedApp.position_title, selectedApp.employment_category, selectedApp.office_name].filter(Boolean).join(' • ')}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase">Award Category</span>
                  <p className="text-xs font-bold text-blue-600">{selectedAward.name}</p>
                </div>
              </div>

              <div className="text-xs space-y-3">
                <div>
                  <span className="font-bold text-slate-900">Accomplishments & Public Impact:</span>
                  <p className="safe-long-text mt-1 max-w-full overflow-hidden whitespace-pre-wrap p-3 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 leading-relaxed">
                    {selectedApp.accomplishments}
                  </p>
                </div>
                <div>
                  <span className="font-bold text-slate-900">Justification Narrative:</span>
                  <p className="safe-long-text mt-1 max-w-full overflow-hidden whitespace-pre-wrap p-3 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 leading-relaxed">
                    {selectedApp.justification}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <FileCheck size={14} className="text-blue-600" />
                  <span>Authenticated Documents for Assessment ({selectedApp.documents?.length || 0})</span>
                </h4>
                <div className="flex flex-wrap gap-2">
                  {(selectedApp.documents || []).map(document => (
                    <button
                      key={document.id}
                      onClick={() => setSelectedDocId(document.id)}
                      className="px-3 py-1.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <FileText size={13} className="text-blue-600" />
                      <span className="truncate max-w-[160px]">{document.document_name}</span>
                      <ExternalLink size={11} className="text-slate-400" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Scale size={16} className="text-blue-600" />
                    <span>Official Criteria Scoring Matrix</span>
                  </h4>
                  <p className="text-xs text-slate-500">
                    Award Qualifying Standard: Minimum <strong>{selectedAward.min_qualifying_score}%</strong>
                  </p>
                </div>

                <div className={`px-4 py-2 rounded-lg border text-center ${
                  meetsMinScore ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                }`}>
                  <p className="text-[10px] uppercase font-bold text-slate-500">Computed Weighted Score</p>
                  <p className={`text-2xl font-bold font-mono ${meetsMinScore ? 'text-green-700' : 'text-amber-700'}`}>
                    {currentTotalScore}%
                  </p>
                  <span className={`text-[10px] font-bold ${meetsMinScore ? 'text-green-800' : 'text-amber-800'}`}>
                    {meetsMinScore ? 'Meets qualifying standard' : 'Below qualifying standard'}
                  </span>
                </div>
              </div>

              {isLocked && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-xs text-green-800">
                  <Lock size={15} />
                  <span>
                    Your assessment has been submitted{existingEvaluation?.submitted_at ? ` on ${new Date(existingEvaluation.submitted_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}.
                  </span>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-xs text-red-700">
                  <AlertCircle size={15} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-4">
                {(selectedAward.criteria || []).map((criterion, index) => {
                  const current = criterionScores[criterion.id] || { raw_score: 0, remarks: '' };
                  const weighted = Number((((current.raw_score || 0) / (criterion.max_score || 100)) * criterion.weight_percentage).toFixed(2));

                  return (
                    <div
                      key={criterion.id}
                      id={`criterion-block-${index}`}
                      className="p-4 rounded-lg border border-slate-200 bg-slate-50/70 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                              {index + 1}
                            </span>
                            <h5 className="text-xs font-bold text-slate-900">{criterion.criterion_name}</h5>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 pl-7">{criterion.criterion_description}</p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                            Weight: {criterion.weight_percentage}%
                          </span>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block">Weighted:</span>
                            <span className="text-xs font-bold font-mono text-green-700">{weighted}%</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200 items-center">
                        <div className="sm:col-span-1">
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Score (0-{criterion.max_score || 100}):
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              max={criterion.max_score || 100}
                              disabled={isLocked}
                              value={current.raw_score}
                              onChange={event => handleScoreChange(criterion.id, Number(event.target.value), criterion.max_score || 100)}
                              className="w-full text-xs font-bold font-mono p-2 rounded-md border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                            />
                            <Percent size={13} className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
                          </div>
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Criterion Evaluation Notes / Evidence Cited:
                          </label>
                          <input
                            type="text"
                            disabled={isLocked}
                            placeholder="State specific outputs, ratings, or observations..."
                            value={current.remarks}
                            onChange={event => handleRemarksChange(criterion.id, event.target.value)}
                            className="w-full text-xs p-2 rounded-md border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2 pt-2">
                <label className="block text-xs font-bold text-slate-900">
                  Evaluator General Remarks & Recommendation:
                </label>
                <textarea
                  rows={3}
                  disabled={isLocked}
                  placeholder="Enter overarching feedback, commendations, and recommendation."
                  value={generalRemarks}
                  onChange={event => setGeneralRemarks(event.target.value)}
                  className="safe-long-text w-full min-w-0 max-w-full text-xs p-3 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                />
              </div>

              {!isLocked ? (
                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <button
                    id="submit-evaluation-btn"
                    onClick={() => void handleSubmitEvaluation()}
                    disabled={isSubmitting}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <CheckCircle2 size={16} />
                    <span>{isSubmitting ? 'Submitting...' : `Officially Submit Evaluation (${currentTotalScore}%)`}</span>
                  </button>
                </div>
              ) : (
                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setIsLocked(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md cursor-pointer"
                  >
                    Edit and resubmit
                  </button>
                </div>
              )}
            </div>
          </div>
          </div>
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
        />
      )}
    </div>
  );
};
