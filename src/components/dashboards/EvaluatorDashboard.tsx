import React, { useEffect, useMemo, useState } from 'react';
import { Application, Award, UserProfile } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { NominationActionModal } from '../nomination/NominationActionModal';
import { NominationDetails, NominationDocuments } from '../nomination/NominationReadOnlySections';
import { NominationQueueCards } from '../nomination/NominationQueueCards';
import { DocumentViewerModal } from '../common/DocumentViewerModal';
import { praiseService } from '../../lib/supabase';
import { showToast } from '../../lib/toast';
import { CheckCircle2, Scale } from 'lucide-react';
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
    return application.assigned_evaluators?.includes(currentUser.id);
  }), [applications, currentUser.id]);

  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('scorecard');
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
  const canEvaluate = selectedApp?.processing_stage === 'Evaluation'
    && ['For Evaluation', 'Under Evaluation'].includes(selectedApp.status);

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

  function handleScoreChange(criterionId: string, rawScore: number, maxScore: number) {
    if (isLocked || !canEvaluate) {
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
    if (isLocked || !canEvaluate) {
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
    if (!selectedApp || !selectedAward || !canEvaluate) {
      return;
    }
    setActiveTab('scorecard');

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
            {assignedApplications.length > 0 && <NominationQueueCards applications={assignedApplications} onOpen={application => { setActiveTab('scorecard'); setSelectedAppId(application.id); }} actionLabel={application => application.processing_stage === 'Evaluation' ? 'Open assessment' : 'View assessment'} />}
            {assignedApplications.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Scale size={32} className="mx-auto mb-2 opacity-30 text-slate-400" />
                <p className="text-xs font-semibold">No nominations have been assigned to you.</p>
              </div>
            ) : (
              assignedApplications.length > 0 && (
                <div className="hidden overflow-x-auto sm:block">
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
                      <p className="mt-1 text-[10px] text-slate-500">{application.processing_stage}</p>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button type="button" onClick={() => { setActiveTab('scorecard'); setSelectedAppId(application.id); }} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                        {application.processing_stage === 'Evaluation' ? 'Open assessment' : 'View assessment'}
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

        {selectedApp && selectedAward && (
          <NominationActionModal
            application={selectedApp}
            title={canEvaluate ? 'Evaluator assessment' : 'Assigned nomination'}
            task={canEvaluate && !isLocked
              ? 'Score this nomination against the configured award criteria.'
              : isLocked ? 'Your score has been submitted and is available to review.' : 'This nomination is available to view.'}
            tabs={[{ id: 'scorecard', label: 'Scorecard' }, { id: 'evidence', label: 'Evidence' }, { id: 'details', label: 'Nomination details' }]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onClose={() => setSelectedAppId('')}
            footer={canEvaluate && !isLocked ? (
              <>
                <span className="mr-auto text-sm font-bold text-slate-900">Weighted score: {currentTotalScore.toFixed(2)}%</span>
                <button type="button" onClick={() => void handleSubmitEvaluation()} disabled={isSubmitting} className="min-h-11 w-full rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto">
                  {isSubmitting ? 'Submitting...' : 'Submit evaluation'}
                </button>
              </>
            ) : undefined}
          >
            {activeTab === 'scorecard' && (
              <div className="space-y-5">
                <section className="rounded-xl bg-slate-50 p-4">
                  <h3 className="text-base font-bold text-slate-950">{isLocked ? 'Score submitted' : canEvaluate ? 'Your task: Score the criteria' : 'Assessment status'}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {selectedApp.assigned_evaluators?.filter(id => selectedApp.evaluations?.some(evaluation => evaluation.evaluator_id === id && evaluation.is_submitted)).length || 0} of {selectedApp.assigned_evaluators?.length || 0} assigned evaluators submitted.
                    {existingEvaluation?.submitted_at ? ' Your score was submitted on ' + new Date(existingEvaluation.submitted_at).toLocaleDateString('en-PH') + '.' : ''}
                  </p>
                </section>
                {errorMsg && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p>}
                {(selectedAward.criteria || []).map((criterion, index) => {
                  const current = criterionScores[criterion.id] || { raw_score: 0, remarks: '' };
                  const max = criterion.max_score || 100;
                  const weighted = Number(((current.raw_score / max) * criterion.weight_percentage).toFixed(2));
                  return (
                    <section key={criterion.id} className="border-b border-slate-200 pb-5 last:border-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="break-words text-base font-bold text-slate-900">{index + 1}. {criterion.criterion_name}</h3>
                          <p className="mt-1 break-words text-sm leading-6 text-slate-600">{criterion.criterion_description}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Weight {criterion.weight_percentage}%</span>
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                        <div>
                          <label htmlFor={'score-' + criterion.id} className="block text-sm font-semibold text-slate-800">Score out of {max}</label>
                          <input id={'score-' + criterion.id} type="number" min={0} max={max} value={current.raw_score} disabled={isLocked || !canEvaluate} onChange={event => handleScoreChange(criterion.id, Number(event.target.value), max)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold focus:outline-2 focus:outline-blue-600 disabled:bg-slate-50" />
                        </div>
                        <div>
                          <label htmlFor={'remarks-' + criterion.id} className="block text-sm font-semibold text-slate-800">Evidence and remarks</label>
                          <input id={'remarks-' + criterion.id} type="text" value={current.remarks} disabled={isLocked || !canEvaluate} onChange={event => handleRemarksChange(criterion.id, event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:outline-2 focus:outline-blue-600 disabled:bg-slate-50" />
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">Weighted contribution: <strong className="text-slate-900">{weighted.toFixed(2)} / {criterion.weight_percentage}</strong></p>
                    </section>
                  );
                })}
                <section className="rounded-xl bg-slate-50 p-4">
                  <h3 className="text-base font-bold text-slate-950">Score summary</h3>
                  <dl className="mt-3 space-y-2">
                    {(selectedAward.criteria || []).map(criterion => {
                      const value = criterionScores[criterion.id]?.raw_score || 0;
                      const score = (value / (criterion.max_score || 100)) * criterion.weight_percentage;
                      return <div key={criterion.id} className="flex justify-between gap-3 text-sm"><dt className="break-words text-slate-600">{criterion.criterion_name}</dt><dd className="shrink-0 font-semibold text-slate-900">{score.toFixed(2)} / {criterion.weight_percentage}</dd></div>;
                    })}
                    <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-950"><dt>Weighted total</dt><dd>{currentTotalScore.toFixed(2)}%</dd></div>
                  </dl>
                  <p className="mt-2 text-xs text-slate-600">Minimum qualifying standard: {selectedAward.min_qualifying_score}%. Evaluators submit scores; the committee makes the final decision.</p>
                </section>
                <div>
                  <label htmlFor="general-assessment" className="block text-sm font-semibold text-slate-900">General assessment and recommendation</label>
                  <textarea id="general-assessment" rows={4} value={generalRemarks} disabled={isLocked || !canEvaluate} onChange={event => setGeneralRemarks(event.target.value)} className="mt-2 min-h-28 w-full rounded-lg border border-slate-300 p-3 text-sm leading-6 focus:outline-2 focus:outline-blue-600 disabled:bg-slate-50" />
                </div>
              </div>
            )}
            {activeTab === 'evidence' && <NominationDocuments application={selectedApp} onOpen={setSelectedDocId} />}
            {activeTab === 'details' && <NominationDetails application={selectedApp} />}
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
        />
      )}
    </div>
  );
};
