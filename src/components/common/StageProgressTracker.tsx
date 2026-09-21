import React from 'react';
import { ProcessingStage, ApplicationStatus } from '../../types';
import { CheckCircle2, Clock, Award, AlertCircle } from 'lucide-react';

interface StageProgressTrackerProps {
  currentStage: ProcessingStage;
  currentStatus: ApplicationStatus;
  isTerminalRejection?: boolean;
}

const STAGES: { stage: ProcessingStage; label: string; description: string }[] = [
  { stage: 'Submitted', label: '1. Submitted', description: 'Nomination filed' },
  { stage: 'Endorsement', label: '2. Endorsement', description: 'Head of Office review' },
  { stage: 'Document Verification', label: '3. Doc Verification', description: 'Secretariat verification' },
  { stage: 'Evaluation', label: '4. Evaluation', description: 'Criteria scoring' },
  { stage: 'Deliberation', label: '5. Deliberation', description: 'Committee ranking' },
  { stage: 'Final Decision', label: '6. Final Decision', description: 'Resolution signed' },
  { stage: 'Awarded', label: '7. Awarded', description: 'Incentives & plaque' },
];

export const StageProgressTracker: React.FC<StageProgressTrackerProps> = ({
  currentStage,
  currentStatus,
  isTerminalRejection = false
}) => {
  const currentStageIndex = STAGES.findIndex(s => s.stage === currentStage);
  const isRejected = currentStatus === 'Not Approved' || isTerminalRejection;

  return (
    <div id="stage-progress-tracker" className="w-full bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Official PRAISE Processing Pipeline
          </h4>
          <p className="text-sm font-semibold text-slate-900 mt-0.5">
            Current Stage: <span className="text-blue-600 font-bold">{currentStage}</span>
          </p>
        </div>
        <div className="text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200 inline-flex items-center gap-1.5 self-start sm:self-auto font-medium">
          <Clock size={13} className="text-blue-600" />
          <span>Stage {currentStageIndex + 1} of 7</span>
        </div>
      </div>

      {/* Progress Bar and Steps */}
      <div className="relative">
        {/* Track Line */}
        <div className="hidden lg:block absolute top-4 left-6 right-6 h-0.5 bg-slate-200 -z-0">
          <div
            className={`h-full transition-all duration-500 ${
              isRejected ? 'bg-red-500' : 'bg-blue-600'
            }`}
            style={{
              width: `${(Math.max(0, currentStageIndex) / (STAGES.length - 1)) * 100}%`
            }}
          />
        </div>

        {/* Step Nodes Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 lg:gap-1 relative z-10">
          {STAGES.map((s, index) => {
            const isCompleted = index < currentStageIndex;
            const isCurrent = index === currentStageIndex;

            return (
              <div
                key={s.stage}
                id={`stage-step-${index + 1}`}
                className={`flex lg:flex-col items-center lg:items-center gap-2.5 lg:gap-1.5 p-2 lg:p-1 rounded-lg transition-colors ${
                  isCurrent
                    ? 'bg-blue-50/70 lg:bg-transparent'
                    : ''
                }`}
              >
                {/* Node Bubble */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-all ${
                    isCompleted
                      ? 'bg-green-600 text-white shadow-2xs'
                      : isCurrent
                      ? isRejected
                        ? 'bg-red-600 text-white ring-4 ring-red-100 shadow-xs'
                        : 'bg-blue-600 text-white ring-4 ring-blue-100 shadow-xs'
                      : 'bg-slate-100 text-slate-400 border border-slate-200'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 size={16} />
                  ) : isCurrent ? (
                    isRejected ? (
                      <AlertCircle size={16} />
                    ) : index === 6 ? (
                      <Award size={16} />
                    ) : (
                      <span>{index + 1}</span>
                    )
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>

                {/* Text Labels */}
                <div className="lg:text-center min-w-0">
                  <p
                    className={`text-xs font-semibold leading-snug truncate ${
                      isCurrent
                        ? 'text-blue-900 font-bold'
                        : isCompleted
                        ? 'text-slate-800'
                        : 'text-slate-400'
                    }`}
                  >
                    {s.label}
                  </p>
                  <p className="text-[10px] text-slate-500 leading-tight hidden lg:block mt-0.5">
                    {s.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
