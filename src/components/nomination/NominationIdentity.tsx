import React, { useEffect, useState } from 'react';
import { Application } from '../../types';
import { praiseService } from '../../lib/api';
import { SignaturePreview, SignatureStrokes } from './SignaturePad';

export const NominationIdentitySummary: React.FC<{ application: Application }> = ({ application }) => <div className="mt-1 space-y-1 text-xs font-normal text-slate-500">
  {application.nominator_name && <p className="break-words">Nominator: {application.nominator_name} / {application.nominating_office}</p>}
  {application.nomination_origin && <span className="inline-flex rounded-full bg-blue-50 px-2 py-1 text-blue-700">{application.nomination_origin}</span>}
</div>;

export const NominationIdentityDetails: React.FC<{ application: Application }> = ({ application }) => {
  const [signature, setSignature] = useState<{ strokes: SignatureStrokes; signed_at: string; sha256: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setSignature(null); setError('');
    if (application.signature_signed_at) void praiseService.getNominationSignature(application.id).then(value => { if (!cancelled) setSignature(value); }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load signature.'); });
    return () => { cancelled = true; };
  }, [application.id, application.signature_signed_at]);
  if (!application.nominator_name) return null;
  return <section className="space-y-3 border-t border-slate-100 pt-5 text-sm">
    <h3 className="font-bold text-slate-950">Nominator Information</h3>
    <p>{application.nominator_name} / {application.nominator_position}</p>
    <p>Office: {application.nominating_office}</p>
    <p>Classification: {application.nomination_origin || 'Not recorded (historical nomination)'}</p>
    <p>Account used: {application.submission_account_name || application.nominator_id} {application.submission_account_role ? `(${application.submission_account_role})` : '(original filing account; role not recorded)'}</p>
    {signature && <><SignaturePreview strokes={signature.strokes} /><p className="text-xs text-slate-500">Signed: {signature.signed_at} (server time). Original signature retained on resubmission.</p></>}
    {!application.signature_signed_at && <p className="text-xs text-slate-500">No electronic signature recorded.</p>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </section>;
};
