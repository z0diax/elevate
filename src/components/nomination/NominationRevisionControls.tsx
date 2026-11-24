import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FilePenLine, FileX } from 'lucide-react';
import { Application, NominationRevisionScope } from '../../types';
import { praiseService } from '../../lib/api';
import { showToast } from '../../lib/toast';
import { NominationActionModal } from './NominationActionModal';
import { NominationFieldGrid } from './NominationFormPresentation';
import { WrappingSelect } from '../common/WrappingSelect';

export const revisionScopes: Record<NominationRevisionScope, string> = {
  details: 'Nomination Details Only',
  attachments: 'Supporting Attachments Only',
  both: 'Nomination Details and Supporting Attachments',
};

export function RevisionIndicator({ application }: { application: Application }) {
  const status = application.revision_request?.status;
  const label = application.revision_active
    ? status === 'In Progress' ? 'Revision In Progress' : 'Revision Required'
    : status === 'Completed' || (application.nomination_version || 1) > 1 ? 'Revised and Resubmitted' : '';
  return label ? <span className="block text-xs font-semibold text-amber-800">{label}</span> : null;
}

export function RevisionInstructions({ application }: { application: Application }) {
  const request = application.revision_request;
  if (!application.revision_active || !request) return null;
  return <div className="safe-long-text rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950 sm:p-4">
    <p className="font-semibold">Administrator-required revision</p>
    <p className="mt-1">{revisionScopes[request.scope]} · {new Date(request.requested_at).toLocaleString('en-PH')}</p>
    <p className="mt-2 whitespace-pre-wrap break-words">{request.instructions}</p>
  </div>;
}

export function ManageNominationRevision({ application, onRefresh }: { application: Application; onRefresh: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<NominationRevisionScope>('both');
  const [instructions, setInstructions] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (!application.can_require_revision && !application.revision_active) return null;
  const cancel = Boolean(application.revision_active);
  const label = cancel ? 'Cancel Revision Request' : 'Require Nomination Revision';
  const ActionIcon = cancel ? FileX : FilePenLine;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (!instructions.trim()) {
      setError(cancel ? 'Enter a cancellation reason.' : 'Enter revision instructions.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await praiseService.nominationRevision(application.id,
        cancel ? 'cancel_nomination_revision' : 'require_nomination_revision',
        cancel ? { revision_id: application.revision_request?.id, reason: instructions } : { scope, instructions });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update the revision request.');
      setPending(false);
      return;
    }
    setPending(false);
    setOpen(false);
    showToast(cancel ? 'Revision request cancelled.' : 'Revision request successfully issued. The original submitting user has been notified.');
    await onRefresh();
  };
  return <>
    <button type="button" aria-label={label} title={label} aria-haspopup="dialog"
      onClick={() => { setOpen(true); setInstructions(''); setError(''); setScope('both'); }}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 xl:size-8">
      <ActionIcon size={16} aria-hidden="true" />
    </button>
    {open && createPortal(<NominationActionModal application={application} title={label} onClose={() => { if (!pending) setOpen(false); }}>
      <form onSubmit={submit} className="min-w-0 space-y-4 whitespace-normal">
        <NominationFieldGrid fields={[
          ['Original submitting user', application.submission_account_name || application.nominator_name],
          ['Current status', application.status], ['Processing stage', application.processing_stage], ['Assigned office', application.office_name],
        ]} />
        {!cancel && <label className="block text-sm font-semibold text-slate-800">Revision scope
          <span className="mt-1 block rounded-lg border border-slate-300">
            <WrappingSelect value={scope} displayValue={revisionScopes[scope]} onChange={event => setScope(event.target.value as NominationRevisionScope)} disabled={pending}>
              {Object.entries(revisionScopes).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </WrappingSelect>
          </span>
        </label>}
        <label className="block text-sm font-semibold text-slate-800">{cancel ? 'Cancellation Reason' : 'Revision Instructions'}
          <textarea autoFocus required rows={4} maxLength={4000} disabled={pending} value={instructions} onChange={event => setInstructions(event.target.value)}
            placeholder={cancel ? 'Explain why the revision is being cancelled.' : 'Specify the nomination information or supporting documents that need to be corrected.'}
            className="mt-1 block w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <p className="rounded-lg bg-amber-50 p-3 text-sm leading-relaxed break-words text-amber-950">
          {cancel
            ? 'Cancelling this request discards the revision draft and restores the previous workflow state.'
            : 'Requiring a revision will return this nomination to the original submitting user for correction. Its current processing will be suspended until the revised nomination has been submitted. Previous approvals, document verifications, and evaluations may require revalidation.'}
        </p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} disabled={pending} className="min-h-11 rounded-lg border px-4 text-sm font-semibold">Cancel</button>
          <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
            {pending ? 'Saving...' : cancel ? 'Confirm Cancellation' : 'Require Revision'}
          </button>
        </div>
      </form>
    </NominationActionModal>, document.body)}
  </>;
}
