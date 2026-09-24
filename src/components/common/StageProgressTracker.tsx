import React from 'react';
import { ApplicationStatus, ProcessingStage } from '../../types';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface StageProgressTrackerProps {
  currentStage: ProcessingStage;
  currentStatus: ApplicationStatus;
  isTerminalRejection?: boolean;
}

const STAGES: { stage: ProcessingStage; label: string; description: string }[] = [
  { stage: 'Submitted', label: 'Nomination submitted', description: 'Filed by the nominator' },
  { stage: 'Endorsement', label: 'Office endorsement', description: 'Head of Office reviews the nomination' },
  { stage: 'Document Verification', label: 'Document verification', description: 'Secretariat checks the attachments' },
  { stage: 'Evaluation', label: 'Evaluator scoring', description: 'Assigned evaluators score the criteria' },
  { stage: 'Deliberation', label: 'Committee deliberation', description: 'Committee reviews the evaluation results' },
  { stage: 'Final Decision', label: 'Final decision', description: 'Secretariat records the committee decision' },
  { stage: 'Awarded', label: 'Award conferred', description: 'Approved award is formally issued' },
];

export const StageProgressTracker: React.FC<StageProgressTrackerProps> = ({
  currentStage,
  currentStatus,
  isTerminalRejection = false,
}) => {
  const stageIndex = Math.max(0, STAGES.findIndex(item => item.stage === currentStage));
  const isRejected = currentStatus === 'Not Approved' || isTerminalRejection;
  const currentStep = STAGES[stageIndex];

  return (
    <section id="stage-progress-tracker" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5" aria-label="Nomination progress">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nomination progress</p>
          <h4 className="mt-1 text-base font-bold leading-snug text-slate-900">
            Stage {stageIndex + 1} of {STAGES.length}: {currentStep.label}
          </h4>
        </div>
        <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
          isRejected ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-700'
        }`}>
          {isRejected ? 'Not approved' : currentStatus === 'Awarded' ? 'Awarded' : currentStatus === 'Approved' ? 'Decision recorded' : 'In progress'}
        </span>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={stageIndex + 1} aria-valuemin={1} aria-valuemax={STAGES.length} aria-label="Processing stage">
        <div className={`h-full rounded-full ${isRejected ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${((stageIndex + 1) / STAGES.length) * 100}%` }} />
      </div>

      <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {STAGES.map((item, index) => {
          const completed = index < stageIndex;
          const current = index === stageIndex;
          const stateLabel = completed ? 'Complete' : current ? (isRejected ? 'Not approved' : 'Current') : isRejected ? 'Not reached' : 'Upcoming';

          return (
            <li
              key={item.stage}
              id={`stage-step-${index + 1}`}
              aria-current={current ? 'step' : undefined}
              className={`flex min-w-0 items-start gap-3 rounded-lg border p-3 ${
                current
                  ? isRejected ? 'border-red-200 bg-red-50' : 'border-blue-300 bg-blue-50'
                  : completed ? 'border-green-100 bg-green-50/50' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                completed ? 'bg-green-600 text-white' : current ? isRejected ? 'bg-red-600 text-white' : 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-500'
              }`}>
                {completed ? <CheckCircle2 size={15} /> : current && isRejected ? <AlertCircle size={15} /> : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <span className={`text-xs font-bold leading-4 ${current ? isRejected ? 'text-red-900' : 'text-blue-900' : completed ? 'text-slate-800' : 'text-slate-600'}`}>
                    {item.label}
                  </span>
                  <span className={`text-[10px] font-semibold ${current ? isRejected ? 'text-red-700' : 'text-blue-700' : completed ? 'text-green-700' : 'text-slate-500'}`}>
                    {stateLabel}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{item.description}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
