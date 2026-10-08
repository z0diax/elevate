import React, { useEffect, useState } from 'react';
import { Application } from '../../types';
import { praiseService } from '../../lib/api';
import { SignaturePreview, SignatureStrokes } from './SignaturePad';
import { NominationFieldGrid } from './NominationFormPresentation';

export const NominationIdentitySummary: React.FC<{ application: Application }> = ({ application }) => <div className="mt-1 space-y-1 text-xs font-normal text-slate-500">
  {application.nominator_name && <p className="break-words">Nominator: {application.nominator_name} / {application.nominating_office}</p>}
  {application.nomination_origin && <span className="inline-flex rounded-full bg-blue-50 px-2 py-1 text-blue-700">{application.nomination_origin}</span>}
</div>;

const NominationSignatureDetails: React.FC<{ application: Application }> = ({ application }) => {
  const [signature, setSignature] = useState<{ strokes: SignatureStrokes; signed_at: string; sha256: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setSignature(null); setError('');
    if (application.signature_signed_at) void praiseService.getNominationSignature(application.id).then(value => { if (!cancelled) setSignature(value); }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load signature.'); });
    return () => { cancelled = true; };
  }, [application.id, application.signature_signed_at]);
  return <>
    {signature && <><SignaturePreview strokes={signature.strokes} /><p className="mt-2 text-xs leading-5 text-slate-500">Signed: {signature.signed_at} (server time). Original signature retained on resubmission.</p></>}
    {application.signature_signed_at && !signature && !error && <p role="status" className="text-sm text-slate-500">Loading recorded signature…</p>}
    {!application.signature_signed_at && <p className="text-sm text-slate-500">No electronic signature recorded.</p>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </>;
};

export const NominationIdentityDetails: React.FC<{ application: Application; showMissing?: boolean; presentation?: 'workflow' | 'document' }> = ({ application, showMissing = false, presentation = 'workflow' }) => {
  if (!application.nominator_name && !showMissing) return null;
  if (presentation === 'document') return <div className="space-y-4">
    <NominationFieldGrid fields={[
      ['Full name', application.nominator_name], ['Position', application.nominator_position], ['Office / Department', application.nominating_office],
    ]} />
    <div className="border-l-2 border-amber-300 bg-slate-50 px-4 py-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Electronic signature</p>
      <div className="max-w-sm"><NominationSignatureDetails application={application} /></div>
    </div>
  </div>;
  return <section className="space-y-3 border-t border-slate-100 pt-5 text-sm">
    <h3 className="font-bold text-slate-950">Nominator Information</h3>
    <p className="safe-long-text">{application.nominator_name || 'Name not recorded'} / {application.nominator_position || 'Position not recorded'}</p>
    <p className="safe-long-text">Office: {application.nominating_office || 'Not recorded'}</p>
    <p>Classification: {application.nomination_origin || 'Not recorded (historical nomination)'}</p>
    <p className="safe-long-text">Account used: {application.submission_account_name || application.nominator_id || 'Not recorded'} {application.submission_account_role ? `(${application.submission_account_role})` : '(role not recorded)'}</p>
    <NominationSignatureDetails application={application} />
  </section>;
};
