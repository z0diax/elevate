import React, { useEffect, useState } from 'react';
import { Application } from '../../types';
import { praiseService } from '../../lib/api';
import { revisionScopes } from './NominationRevisionControls';

export function NominationVersionHistory({ applicationId, version, onSelect }: {
  applicationId: string;
  version?: number;
  onSelect: (version?: number) => void;
}) {
  const [history, setHistory] = useState<Awaited<ReturnType<typeof praiseService.getNominationRevisionHistory>>>();
  const [error, setError] = useState('');
  useEffect(() => {
    let ignore = false;
    void praiseService.getNominationRevisionHistory(applicationId)
      .then(value => { if (!ignore) setHistory(value); })
      .catch(reason => { if (!ignore) setError(reason instanceof Error ? reason.message : 'Unable to load revision history.'); });
    return () => { ignore = true; };
  }, [applicationId]);
  return <details className="mb-4 rounded-xl border border-slate-200 p-4" open={version !== undefined || undefined}>
    <summary className="cursor-pointer text-sm font-semibold text-blue-800">Nomination revision and version history</summary>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {!history && !error && <p role="status" className="mt-2 text-sm">Loading revision history...</p>}
    {history && <div className="mt-3 space-y-3">
      {history.versions.length > 0 && <label className="block text-sm font-semibold">Nomination version
        <select className="ml-2 rounded-lg border border-slate-300 p-2" value={version ?? ''} onChange={event => onSelect(event.target.value ? Number(event.target.value) : undefined)}>
          <option value="">Latest finalized version</option>
          {history.versions.map(number => <option key={number} value={number}>Version {number}</option>)}
        </select>
      </label>}
      {!!history.archived_attachments.length && <details className="rounded-lg bg-slate-50 p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Archived attachment versions ({history.archived_attachments.length})</summary>
        {history.archived_attachments.map(file => <div key={file.id} className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-xs">
          <p className="font-semibold">{file.document.document_name} ? {file.document.status}</p>
          <p>Archived {file.archived_at}</p>
          {file.sha256 && <p className="break-all">SHA-256 {file.sha256}</p>}
          {file.document.verification_remarks && <p className="whitespace-pre-wrap">{file.document.verification_remarks}</p>}
          {file.document.file_url && file.sha256 && <a href={file.document.file_url} className="font-semibold text-blue-700 underline">Download archived file</a>}
        </div>)}
      </details>}
      {history.requests.map(request => <details key={request.id} className="rounded-lg bg-slate-50 p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Request {request.revision_number} · {request.status} · {revisionScopes[request.scope]}</summary>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><dt className="font-semibold">Requested by</dt><dd>{request.requested_by_name} ({request.requested_by_role})</dd></div>
          <div><dt className="font-semibold">Requested at</dt><dd>{request.requested_at}</dd></div>
          <div><dt className="font-semibold">Previous workflow</dt><dd>{request.previous_status} / {request.previous_stage}</dd></div>
          {request.started_at && <div><dt className="font-semibold">Started at</dt><dd>{request.started_at}</dd></div>}
          {request.completed_at && <div><dt className="font-semibold">Completed at</dt><dd>{request.completed_at}{request.completed_by_name && ` ? ${request.completed_by_name}`}</dd></div>}
          {request.cancelled_at && <div><dt className="font-semibold">Cancelled at</dt><dd>{request.cancelled_at}{request.cancelled_by_name && ` ? ${request.cancelled_by_name}`}</dd></div>}
          {request.cancellation_reason && <div><dt className="font-semibold">Cancellation reason</dt><dd className="whitespace-pre-wrap">{request.cancellation_reason}</dd></div>}
          {request.remarks && <div><dt className="font-semibold">Resubmission remarks</dt><dd className="whitespace-pre-wrap">{request.remarks}</dd></div>}
          <div className="sm:col-span-2"><dt className="font-semibold">Revision instructions</dt><dd className="whitespace-pre-wrap break-words">{request.instructions}</dd></div>
        </dl>
      </details>)}
    </div>}
  </details>;
}

const comparisonFields: Partial<Record<keyof Application, string>> = {
  award_name: 'Award', nominee_name: 'Nominee name', employee_id: 'Employee ID', position_title: 'Position',
  office_name: 'Office', division_section: 'Division or section', employment_category: 'Employment',
  contact_number: 'Contact number', email: 'Email', barangay: 'Barangay', nomination_type: 'Nomination type',
  nominator_name: 'Nominator name', nominator_position: 'Nominator position', nominating_office: 'Nominating office',
  justification: 'Justification', accomplishments: 'Accomplishments', supporting_narrative: 'Supporting narrative',
};

export function VersionComparison({ previous, current }: { previous: Application; current: Application }) {
  const changes = (Object.keys(comparisonFields) as (keyof Application)[]).filter(key => previous[key] !== current[key]);
  const keyFor = (document: NonNullable<Application['documents']>[number]) => document.requirement_id || document.id;
  const before = new Map(previous.documents?.map(document => [keyFor(document), document]));
  const after = new Map(current.documents?.map(document => [keyFor(document), document]));
  const attachmentChanges = [...new Set([...before.keys(), ...after.keys()])].flatMap(key => {
    const old = before.get(key), replacement = after.get(key);
    if (old?.id === replacement?.id && old?.uploaded_at === replacement?.uploaded_at) return [];
    const item = replacement || old;
    return item ? [`${old ? replacement ? 'Replaced' : 'Removed' : 'Added'}: ${item.document_name}`] : [];
  });
  return <details className="mt-4 rounded-lg border border-slate-200 p-3">
    <summary className="cursor-pointer text-sm font-semibold text-blue-800">Compare with latest finalized version</summary>
    <div className="mt-3 space-y-3 text-sm">
      {changes.map(key => <section key={key} className="rounded-lg bg-slate-50 p-3">
        <h4 className="font-semibold">{comparisonFields[key]}</h4>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          <div><dt className="text-xs font-semibold">Version {previous.nomination_version}</dt><dd className="whitespace-pre-wrap break-words">{String(previous[key] ?? '') || 'Empty'}</dd></div>
          <div><dt className="text-xs font-semibold">Version {current.nomination_version}</dt><dd className="whitespace-pre-wrap break-words">{String(current[key] ?? '') || 'Empty'}</dd></div>
        </dl>
      </section>)}
      {attachmentChanges.map(change => <p key={change}>{change}</p>)}
      {!changes.length && !attachmentChanges.length && <p>No differences in nomination details or attachments.</p>}
    </div>
  </details>;
}

export function HistoricalWorkflow({ application }: { application: Application }) {
  const workflow = application.historical_workflow;
  if (!workflow) return null;
  const fields: Record<string, [string, string[]]> = {
    endorsements: ['Endorsements', ['endorsed_by', 'decision', 'remarks', 'created_at']],
    assignments: ['Evaluator assignments', ['evaluator_id', 'status', 'assigned_at', 'completed_at']],
    evaluations: ['Evaluations', ['evaluator_name', 'weighted_percentage', 'general_remarks', 'submitted_at']],
    scores: ['Evaluation scores', ['criterion_name', 'score', 'weighted_score', 'remarks']],
    evaluation_revisions: ['Evaluator revisions', ['evaluator_id', 'revision_number', 'reason', 'created_at']],
  };
  return <section className="mt-4 space-y-3 rounded-lg border border-slate-200 p-3 text-sm">
    <h4 className="font-semibold">Workflow decisions for version {application.nomination_version}</h4>
    {Object.entries(fields).map(([key, [label, columns]]) => !!workflow[key]?.length && <details key={key} className="rounded-lg bg-slate-50 p-3">
      <summary className="cursor-pointer font-semibold">{label} ({workflow[key].length})</summary>
      {workflow[key].map((record, index) => <dl key={index} className="mt-2 grid gap-2 border-t border-slate-200 pt-2 sm:grid-cols-2">
        {columns.filter(column => record[column] != null).map(column => <div key={column}><dt className="text-xs font-semibold capitalize">{column.replaceAll('_', ' ')}</dt><dd className="whitespace-pre-wrap break-words">{String(record[column])}</dd></div>)}
      </dl>)}
    </details>)}
    {application.deliberation_decision && <p>Deliberation: {application.deliberation_decision} {application.deliberation_remarks}</p>}
  </section>;
}
