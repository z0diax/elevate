import React from 'react';
import { Application, ApplicationDocument, Award, NominationRevisionDraft } from '../../types';

export function RevisionAttachmentList({ application, award, draft, disabled, onUpload, onRemove }: {
  application: Application;
  award?: Award;
  draft: NominationRevisionDraft;
  disabled: boolean;
  onUpload?: (requirementId: string, file: File) => void;
  onRemove?: (requirementId: string) => void;
}) {
  const requirements = award?.document_requirements || [];
  const byRequirement = new Map((application.documents || []).map(document => [document.requirement_id, document]));
  const canEdit = draft.request.scope !== 'details';
  const otherDocuments = application.documents?.filter(document => !requirements.some(requirement => requirement.id === document.requirement_id));
  const documentInfo = (document: ApplicationDocument) => <div className="space-y-1 text-xs text-slate-600">
    <p className="break-words">{document.file_name || document.document_name} · {document.file_type || 'File'} · {((document.file_size || 0) / (1024 * 1024)).toFixed(2)} MB</p>
    <p>{document.status} · Uploaded {new Date(document.uploaded_at).toLocaleDateString('en-PH')}</p>
    {document.verification_remarks && <p className="whitespace-pre-wrap">{document.verification_remarks}</p>}
    {document.file_url && <div className="flex gap-4">
      {['application/pdf', 'image/jpeg', 'image/png'].includes(document.file_type || '') && <a href={`${document.file_url}${document.file_url.includes('?') ? '&' : '?'}preview=1`} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">Preview</a>}
      <a href={document.file_url} className="font-semibold text-blue-700 underline">Download</a>
    </div>}
  </div>;
  return <div className="space-y-3">
    {!requirements.length && !otherDocuments?.length && <p className="text-sm text-slate-600">This award has no supporting attachment requirements.</p>}
    {requirements.map(requirement => {
      const original = byRequirement.get(requirement.id);
      const staged = draft.attachments[requirement.id];
      const document = staged === undefined ? original : staged;
      const state = staged === null ? 'Marked for removal' : staged ? original ? 'Replacement staged' : 'New attachment staged'
        : document?.file_url ? 'Existing attachment' : requirement.is_mandatory ? 'Missing required attachment' : 'Optional attachment';
      return <article key={requirement.id} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h4 className="text-sm font-semibold text-slate-900">{requirement.document_name}{requirement.is_mandatory && ' (required)'}</h4>
        <p className="text-xs font-semibold text-amber-900">{state}</p>
        {document && documentInfo(document)}
        {canEdit && onUpload && <div className="flex flex-wrap items-center gap-3 pt-1">
          <label className="text-xs font-semibold text-slate-800">
            {document?.file_url ? 'Replace Attachment' : 'Upload Attachment'}
            <input type="file" disabled={disabled} accept=".pdf,.docx,.jpg,.jpeg,.png"
              className="mt-1 block max-w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-blue-700 file:px-3 file:py-2 file:font-semibold file:text-white"
              onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onUpload(requirement.id, file); }} />
          </label>
          {!requirement.is_mandatory && onRemove && document?.file_url && <button type="button" disabled={disabled}
            className="min-h-10 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 disabled:opacity-50"
            onClick={() => onRemove(requirement.id)}>Remove Attachment</button>}
        </div>}
      </article>;
    })}
    {otherDocuments?.map(document => {
      const key = `document:${document.id}`;
      const legacy = award?.id === application.award_id && !document.requirement_id;
      const removed = draft.attachments[key] === null;
      return <article key={document.id} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-sm font-semibold">{document.document_name}</h4>
      <p className="text-xs text-amber-900">{removed ? 'Marked for removal' : legacy
        ? 'Existing attachment without a linked requirement'
        : canEdit ? 'Previous award attachment. It will be archived on resubmission.' : 'This award change requires authorization to change attachments.'}</p>
      {documentInfo(document)}
      {legacy && !removed && canEdit && onRemove && <button type="button" disabled={disabled}
        className="min-h-10 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 disabled:opacity-50"
        onClick={() => onRemove(key)}>Remove Attachment</button>}
    </article>;
    })}
  </div>;
}
