import React from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import { Application } from '../../types';

export function NominationArchiveButton({ application, busy, onToggle }: {
  application: Application;
  busy: boolean;
  onToggle: (application: Application) => void;
}) {
  const archived = Boolean(application.archived_at);
  const label = archived ? 'Restore nomination' : 'Archive nomination';
  const unavailable = archived ? '' : application.status === 'Draft' ? 'Draft nominations cannot be archived.'
    : application.revision_active ? 'Complete or cancel the active revision before archiving.' : '';
  const Icon = archived ? ArchiveRestore : Archive;

  return (
    <button type="button" aria-label={`${label} ${application.application_number}`}
      title={unavailable || label} disabled={busy || Boolean(unavailable)} onClick={() => onToggle(application)}
      className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 xl:size-8 xl:min-h-0 xl:shrink-0 xl:p-0">
      <Icon size={16} className="shrink-0" aria-hidden="true" />
      <span className="xl:sr-only">{label}</span>
    </button>
  );
}
