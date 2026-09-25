import React from 'react';
import { Application } from '../../types';

interface NominationQueueCardsProps {
  applications: Application[];
  onOpen: (application: Application) => void;
  actionLabel: (application: Application) => string;
}

export const NominationQueueCards: React.FC<NominationQueueCardsProps> = ({ applications, onOpen, actionLabel }) => (
  <div className="divide-y divide-slate-100 sm:hidden">
    {applications.map(application => (
      <article key={application.id} className="min-w-0 space-y-2 p-4">
        <p className="break-words font-mono text-xs font-semibold text-blue-700">{application.application_number}</p>
        <h3 className="break-words text-sm font-bold text-slate-950">{application.nominee_name}</h3>
        <p className="break-words text-sm leading-5 text-slate-600">{application.award_name}</p>
        <p className="break-words text-xs text-slate-500">{application.processing_stage} · {application.status}</p>
        <button type="button" onClick={() => onOpen(application)} className="min-h-11 w-full rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-blue-600">
          {actionLabel(application)}
        </button>
      </article>
    ))}
  </div>
);
