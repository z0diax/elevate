import React from 'react';
import { NominationIdentityDetails } from './NominationIdentity';
import { Application, ApplicationHistory } from '../../types';
import { FileText, Download } from 'lucide-react';

export const NominationDetails: React.FC<{ application: Application; includeIdentity?: boolean; presentation?: 'workflow' | 'document' }> = ({ application, includeIdentity = true, presentation = 'workflow' }) => (
  <section className="space-y-6 text-sm text-slate-700">
    {presentation === 'workflow' && <div>
      <h3 className="text-base font-bold text-slate-950">Nominee and award</h3>
      <p className="mt-1 break-words leading-6">{[application.position_title, application.employment_category, application.office_name].filter(Boolean).join(' · ')}</p>
      <p className="mt-1 break-words leading-6">{application.award_name}</p>
    </div>}
    {includeIdentity && <NominationIdentityDetails application={application} />}
    {[
      ['Justification and merits', application.justification],
      ['Accomplishments and public impact', application.accomplishments],
      ['Supporting narrative', application.supporting_narrative],
    ].filter(([, value]) => Boolean(value)).map(([heading, value]) => (
      <div key={heading} className={presentation === 'document' ? 'border-l-2 border-slate-200 pl-4 sm:pl-5' : 'border-t border-slate-100 pt-5'}>
        {presentation === 'document' ? <h4 className="text-sm font-semibold text-slate-900">{heading}</h4> : <h3 className="font-bold text-slate-950">{heading}</h3>}
        <p className={`mt-2 min-w-0 break-words whitespace-pre-wrap leading-7 ${presentation === 'document' ? 'max-w-prose' : ''}`}>{value}</p>
      </div>
    ))}
  </section>
);

export const NominationDocuments: React.FC<{
  application: Application;
  onOpen: (documentId: string) => void;
  actionLabel?: (status: string) => string;
  presentation?: 'workflow' | 'document';
}> = ({ application, onOpen, actionLabel, presentation = 'workflow' }) => (
  <section>
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      {presentation === 'workflow' ? <h3 className="text-base font-bold text-slate-950">Supporting documents</h3> : <p className="text-xs text-slate-500">Attachments submitted with this nomination</p>}
      <span className="text-xs text-slate-500">{application.documents?.length || 0} attached</span>
    </div>
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
      {(application.documents || []).map(document => (
        <div key={document.id} className={`flex min-w-0 flex-col px-4 sm:flex-row sm:justify-between ${presentation === 'document' ? 'gap-3 py-4 sm:items-start' : 'gap-2 py-3 sm:items-center'}`}>
          <div className="flex min-w-0 items-start gap-3">
            {presentation === 'document' && <FileText aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-slate-500" />}
            <div className="min-w-0">
            <p className="break-words text-sm font-semibold leading-5 text-slate-900">{document.document_name}</p>
            <p className="mt-1 text-xs text-slate-600"><span className={presentation === 'document' ? `inline-flex rounded-md border px-2 py-0.5 font-semibold ${['Verified', 'Head Approved'].includes(document.status) ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : ['Rejected', 'Head Rejected'].includes(document.status) ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-slate-50 text-slate-600'}` : 'font-semibold'}>{document.status}</span>{document.file_type ? ` · ${document.file_type}` : ''}</p>
            <p className="mt-1 text-xs text-slate-500">Submission: {document.file_url ? 'File attached' : 'No file recorded'} · Uploaded: {document.uploaded_at ? document.uploaded_at : 'Not recorded'}</p>
            {document.verified_at && <p className="mt-1 text-xs text-slate-500">Reviewed: {document.verified_at}</p>}
            {document.verification_remarks && <p className="mt-1 break-words text-xs leading-5 text-slate-500">{document.verification_remarks}</p>}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button type="button" disabled={!document.file_url} onClick={() => onOpen(document.id)} className="min-h-11 shrink-0 self-start rounded-lg border border-blue-200 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-600 sm:self-auto">
            {actionLabel?.(document.status) || 'View document'}
          </button>
          {presentation === 'document' && document.file_url && <a href={document.file_url} download={document.document_name} aria-label={`Download ${document.document_name}`} className="flex size-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600"><Download aria-hidden="true" size={16} /></a>}
          </div>
        </div>
      ))}
      {!application.documents?.length && <p className="p-4 text-sm text-slate-500">No documents attached.</p>}
    </div>
  </section>
);

export const NominationHistory: React.FC<{ logs: ApplicationHistory[]; presentation?: 'workflow' | 'document' }> = ({ logs, presentation = 'workflow' }) => (
  <section>
    {presentation === 'document' ? <h4 className="mb-4 text-sm font-semibold text-slate-900">Nomination history</h4> : <h3 className="mb-4 text-base font-bold text-slate-950">Nomination history</h3>}
    <ol className="space-y-0 border-l-2 border-slate-200 pl-5">
      {logs.map(log => (
        <li key={log.id} className="relative pb-5 last:pb-0">
          <span className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-white bg-blue-600" />
          <p className="break-words text-sm font-semibold text-slate-900">{log.action}</p>
          <p className="mt-1 text-xs text-slate-500">{log.created_at && !Number.isNaN(new Date(log.created_at).getTime()) ? new Date(log.created_at).toLocaleString('en-PH') : 'Date not recorded'} · {log.user_name || 'Account not recorded'}</p>
          {log.remarks && <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-slate-700">{log.remarks}</p>}
        </li>
      ))}
      {!logs.length && <li className="text-sm text-slate-500">No history is available yet.</li>}
    </ol>
  </section>
);
