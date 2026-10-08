import React, { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Application } from '../../types';
import { StageProgressTracker } from '../common/StageProgressTracker';
import { StatusBadge } from '../common/StatusBadge';
import { APP_LOGO_URL } from '../../lib/branding';

export interface NominationTab {
  id: string;
  label: string;
}

interface NominationActionModalProps {
  application?: Application;
  title: string;
  task?: string;
  tabs: NominationTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  presentation?: 'workflow' | 'document';
  tabIdPrefix?: string;
}

const STAGE_LABELS: Record<Application['processing_stage'], string> = {
  Submitted: 'Nomination submitted',
  Endorsement: 'Office endorsement',
  'Document Verification': 'Document verification',
  Evaluation: 'Evaluator scoring',
  Deliberation: 'Committee deliberation',
  'Final Decision': 'Final decision',
  Awarded: 'Award conferred',
};

const STAGE_ORDER = Object.keys(STAGE_LABELS) as Application['processing_stage'][];

export const NominationActionModal: React.FC<NominationActionModalProps> = ({
  application, title, task, tabs, activeTab, onTabChange, onClose, footer, children, presentation = 'workflow', tabIdPrefix,
}) => {
  const titleId = useId();
  const tabPrefix = tabIdPrefix || titleId;
  const contentRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [showWorkflow, setShowWorkflow] = useState(false);
  const stageNumber = application ? Math.max(1, STAGE_ORDER.indexOf(application.processing_stage) + 1) : 1;
  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0; }, [activeTab]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.getElementById('document-viewer-modal-dialog')) return;
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key === 'Tab' && dialogRef.current) {
        const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), a[href], summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(control => control.getClientRects().length > 0);
        if (!controls.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 sm:p-4 lg:p-6" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex h-dvh max-h-dvh w-screen min-w-0 flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[90dvh] sm:w-full sm:max-w-5xl sm:rounded-2xl ${presentation === 'document' ? 'sm:h-[85dvh]' : 'sm:h-auto'}`}
      >
        <header className={`z-10 shrink-0 px-4 py-4 sm:px-6 sm:py-5 ${presentation === 'document' ? 'border-b-2 border-amber-400/80 bg-slate-900 text-white' : 'border-b border-slate-200 bg-white'}`}>
          <div className="flex min-w-0 items-start justify-between gap-4">
            {presentation === 'document' ? <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <img src={APP_LOGO_URL} alt="PRAISE" className="hidden size-12 shrink-0 rounded-lg bg-white object-contain p-1 sm:block" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-200">City Government of Tacloban · HRMDO PRAISE</p>
                <h2 id={titleId} className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
                {application?.award_name && <p className="safe-long-text mt-1 text-sm font-medium leading-5 text-slate-200">{application.award_name}</p>}
                {application && <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="safe-long-text font-mono text-xs text-slate-200">{application.application_number || 'Reference not recorded'}</span>
                  <StatusBadge status={application.status} size="sm" />
                </div>}
              </div>
            </div> : <div className="min-w-0">
              <p id={titleId} className="text-xs font-semibold text-blue-700">{title}</p>
              {application && <><h2 className="mt-1 break-words text-lg font-bold leading-tight text-slate-950 sm:text-xl">{application.nominee_name}</h2>
              <p className="mt-1 break-words text-xs leading-5 text-slate-600 sm:text-sm">
                {application.application_number} <span aria-hidden="true">·</span> {application.award_name}
              </p></>}
            </div>}
            <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close nomination" className={`flex size-11 shrink-0 items-center justify-center rounded-lg border focus-visible:outline-2 focus-visible:outline-offset-2 ${presentation === 'document' ? 'border-slate-600 text-slate-200 hover:bg-slate-800 focus-visible:outline-amber-200' : 'border-slate-200 text-slate-600 hover:bg-slate-100 focus-visible:outline-blue-600'}`}>
              <X size={19} />
            </button>
          </div>
        </header>

        {application && presentation === 'workflow' && <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900">Stage {stageNumber} of {STAGE_ORDER.length}: {STAGE_LABELS[application.processing_stage]}</p>
              {task && <p className="mt-0.5 break-words text-xs leading-5 text-slate-600 sm:text-sm">{task}</p>}
            </div>
            <button type="button" onClick={() => setShowWorkflow(value => !value)} aria-expanded={showWorkflow} className="min-h-10 rounded-lg px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600">
              {showWorkflow ? 'Hide workflow' : 'View full workflow'}
            </button>
          </div>
        </div>}

        {tabs.length > 0 && <nav aria-label="Nomination sections" className="shrink-0 overflow-x-auto border-b border-slate-200 bg-white px-4 sm:px-6">
          <div role="tablist" className="flex min-w-max gap-5">
            {tabs.map(tab => (
              <button key={tab.id} id={`${tabPrefix}-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={presentation === 'document' ? `${tabPrefix}-panel-${tab.id}` : `${tabPrefix}-panel`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => onTabChange(tab.id)} onKeyDown={event => {
                const index = tabs.findIndex(item => item.id === tab.id);
                const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
                if (target < 0) return;
                event.preventDefault();
                onTabChange(tabs[target].id);
                const button = document.getElementById(`${tabPrefix}-tab-${tabs[target].id}`);
                button?.focus({ preventScroll: true });
                button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }} className={`min-h-12 border-b-2 px-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-blue-600 ${activeTab === tab.id ? presentation === 'document' ? 'border-amber-500 text-slate-900' : 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </nav>}

        <main ref={contentRef} id={presentation === 'workflow' ? `${tabPrefix}-panel` : undefined} role={tabs.length && presentation === 'workflow' ? 'tabpanel' : undefined} aria-labelledby={tabs.length && presentation === 'workflow' ? `${tabPrefix}-tab-${activeTab}` : undefined} className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-5 pb-8 sm:px-6 sm:py-6 ${presentation === 'document' ? 'bg-slate-100' : 'bg-white'}`}>
          <div className="mx-auto w-full min-w-0 max-w-4xl space-y-5">
            {showWorkflow && application && <StageProgressTracker currentStage={application.processing_stage} currentStatus={application.status} />}
            {children}
          </div>
        </main>

        {footer && <footer className="z-10 shrink-0 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_18px_rgba(15,23,42,0.06)] sm:px-6">
          <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-end gap-2 sm:gap-3">{footer}</div>
        </footer>}
      </div>
    </div>
  );
};
