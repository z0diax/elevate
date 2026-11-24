import React, { useEffect, useState } from 'react';
import { WrappingSelect } from '../common/WrappingSelect';
import { AlertCircle, ArrowLeft, Building2, Mail, ShieldCheck, UserPlus, UserRound } from 'lucide-react';
import { APP_LOGO_URL, APP_NAME } from '../../lib/branding';
import { praiseService } from '../../lib/api';
import { Office } from '../../types';
import { AuthPasswordField } from './AuthPasswordField';

interface NomineeSignupScreenProps {
  errorMessage?: string;
  isSubmitting: boolean;
  onSignup: (fullName: string, email: string, password: string, officeId: string) => Promise<void>;
  onNavigateToLogin: () => void;
}

export const NomineeSignupScreen: React.FC<NomineeSignupScreenProps> = ({
  errorMessage,
  isSubmitting,
  onSignup,
  onNavigateToLogin,
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [officeId, setOfficeId] = useState('');
  const [offices, setOffices] = useState<Pick<Office, 'id' | 'name'>[]>([]);
  const [isLoadingOffices, setIsLoadingOffices] = useState(true);
  const [officesError, setOfficesError] = useState('');
  const [officeLoadAttempt, setOfficeLoadAttempt] = useState(0);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setIsLoadingOffices(true);
    setOfficesError('');
    praiseService.getNomineeRegistrationOffices()
      .then(availableOffices => {
        if (!cancelled) setOffices(availableOffices);
      })
      .catch(() => {
        if (!cancelled) setOfficesError('Unable to load offices. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingOffices(false);
      });
    return () => { cancelled = true; };
  }, [officeLoadAttempt]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setLocalError('Complete all required fields to create your account.');
      return;
    }

    if (isLoadingOffices || officesError || !offices.some(office => office.id === officeId)) {
      setLocalError('Select your office to create your account.');
      return;
    }

    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    setLocalError('');
    try {
      await onSignup(fullName.trim(), email.trim(), password, officeId);
    } catch {
      // The parent displays the registration error through errorMessage.
    }
  };

  return (
    <div className="auth-shell min-h-dvh bg-slate-950 text-white flex items-start justify-center px-3 sm:px-6 lg:items-center">
      <div className="w-full max-w-5xl grid lg:grid-cols-[1.15fr_0.85fr] overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="relative hidden lg:block p-8 sm:p-10 lg:p-12 bg-linear-to-br from-slate-950 via-slate-900 to-blue-950">
          <div className="absolute inset-0 opacity-40 pointer-events-none bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.28),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.2),_transparent_42%)]" />
          <div className="relative space-y-6">
            <div className="flex h-20 w-20 items-center justify-center">
              <img src={APP_LOGO_URL} alt={`${APP_NAME} logo`} className="app-logo-outlined h-full w-full object-contain" />
            </div>
            <span className="inline-flex items-center rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-blue-200">
              Nominee Registration
            </span>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Join the Tacloban PRAISE Program</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
                Create a nominee account to submit nominations and follow their progress through the PRAISE workflow.
              </p>
            </div>
            <div className="pt-8 flex items-center gap-2 text-sm text-slate-400">
              <ShieldCheck size={15} />
              <span>City Government of Tacloban</span>
            </div>
          </div>
        </div>

        <div className="min-w-0 p-5 sm:p-10 lg:p-12 bg-white text-slate-900">
          <div className="max-w-sm mx-auto">
            <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-4 lg:hidden">
              <img src={APP_LOGO_URL} alt="" className="h-12 w-12 shrink-0 object-contain" />
              <p className="min-w-0 text-sm font-bold text-slate-900">{APP_NAME}</p>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-blue-700">Create Account</p>
              <h2 className="text-2xl font-bold">Nominee Sign Up</h2>
              <p className="text-sm text-slate-500">This registration creates a nominee account only.</p>
            </div>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Full name</span>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 focus-within:border-blue-500 focus-within:bg-white">
                  <UserRound size={16} className="text-slate-400" />
                  <input type="text" autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Your full name" />
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Email address</span>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 focus-within:border-blue-500 focus-within:bg-white">
                  <Mail size={16} className="text-slate-400" />
                  <input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="name@example.com" />
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Office</span>
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-blue-500 focus-within:bg-white">
                  <Building2 size={16} className="shrink-0 text-slate-400" />
                  <WrappingSelect
                    name="office_id"
                    required
                    value={officeId}
                    displayValue={offices.find(office => office.id === officeId)?.name || (isLoadingOffices ? 'Loading offices...' : 'Select your office')}
                    onChange={event => setOfficeId(event.target.value)}
                    disabled={isSubmitting || isLoadingOffices || !!officesError || !offices.length}
                    aria-describedby={officesError || (!isLoadingOffices && !offices.length) ? 'signup-office-status' : undefined}
                  >
                    <option value="" disabled>{isLoadingOffices ? 'Loading offices...' : 'Select your office'}</option>
                    {offices.map(office => <option key={office.id} value={office.id}>{office.name}</option>)}
                  </WrappingSelect>
                </div>
              </label>
              {officesError ? (
                <div id="signup-office-status" role="alert" className="text-sm text-red-700">
                  {officesError}{' '}
                  <button type="button" onClick={() => setOfficeLoadAttempt(attempt => attempt + 1)} className="font-semibold underline">Retry</button>
                </div>
              ) : !isLoadingOffices && !offices.length && (
                <p id="signup-office-status" role="status" className="text-sm text-slate-500">No offices are available. Please contact the administrator.</p>
              )}

              <AuthPasswordField
                label="Password"
                autoComplete="new-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />

              <AuthPasswordField
                label="Confirm password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                placeholder="Re-enter password"
              />

              {(localError || errorMessage) && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{localError || errorMessage}</span>
                </div>
              )}

              <button type="submit" disabled={isSubmitting || isLoadingOffices || !!officesError || !offices.length} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70 inline-flex items-center justify-center gap-2">
                <UserPlus size={16} />
                <span>{isSubmitting ? 'Creating account...' : 'Create nominee account'}</span>
              </button>
            </form>

            <button type="button" onClick={onNavigateToLogin} className="mt-5 w-full inline-flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer">
              <ArrowLeft size={14} />
              <span>Back to sign in</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
