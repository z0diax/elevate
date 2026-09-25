import React from 'react';
import { Application, ApplicationHistory } from '../../types';

export const NominationDetails: React.FC<{ application: Application }> = ({ application }) => (
  <section className="space-y-6 text-sm text-slate-700">
    <div>
      <h3 className="text-base font-bold text-slate-950">Nominee and award</h3>
      <p className="mt-1 break-words leading-6">{[application.position_title, application.employment_category, application.office_name].filter(Boolean).join(' · ')}</p>
      <p className="mt-1 break-words leading-6">{application.award_name}</p>
    </div>
    {[
      ['Justification and merits', application.justification],
      ['Accomplishments and public impact', application.accomplishments],
      ['Supporting narrative', application.supporting_narrative],
    ].filter(([, value]) => Boolean(value)).map(([heading, value]) => (
      <div key={heading} className="border-t border-slate-100 pt-5">
        <h3 className="font-bold text-slate-950">{heading}</h3>
        <p className="mt-2 min-w-0 break-words whitespace-pre-wrap leading-7">{value}</p>
      </div>
    ))}
  </section>
);

export const NominationDocuments: React.FC<{
  application: Application;
  onOpen: (documentId: string) => void;
  actionLabel?: (status: string) => string;
}> = ({ application, onOpen, actionLabel }) => (
  <section>
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-base font-bold text-slate-950">Supporting documents</h3>
      <span className="text-xs text-slate-500">{application.documents?.length || 0} attached</span>
    </div>
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
      {(application.documents || []).map(document => (
        <div key={document.id} className="flex min-w-0 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold leading-5 text-slate-900">{document.document_name}</p>
            <p className="mt-1 text-xs text-slate-600">{document.status}{document.file_type ? ` · ${document.file_type}` : ''}</p>
            {document.verification_remarks && <p className="mt-1 break-words text-xs leading-5 text-slate-500">{document.verification_remarks}</p>}
          </div>
          <button type="button" onClick={() => onOpen(document.id)} className="min-h-11 shrink-0 self-start rounded-lg border border-blue-200 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600 sm:self-auto">
            {actionLabel?.(document.status) || 'View document'}
          </button>
        </div>
      ))}
      {!application.documents?.length && <p className="p-4 text-sm text-slate-500">No documents attached.</p>}
    </div>
  </section>
);

export const NominationHistory: React.FC<{ logs: ApplicationHistory[] }> = ({ logs }) => (
  <section>
    <h3 className="mb-4 text-base font-bold text-slate-950">Nomination history</h3>
    <ol className="space-y-0 border-l-2 border-slate-200 pl-5">
      {logs.map(log => (
        <li key={log.id} className="relative pb-5 last:pb-0">
          <span className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-white bg-blue-600" />
          <p className="break-words text-sm font-semibold text-slate-900">{log.action}</p>
          <p className="mt-1 text-xs text-slate-500">{new Date(log.created_at).toLocaleString('en-PH')} · {log.user_name}</p>
          {log.remarks && <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-slate-700">{log.remarks}</p>}
        </li>
      ))}
      {!logs.length && <li className="text-sm text-slate-500">No history is available yet.</li>}
    </ol>
  </section>
);
