import React, { useState } from 'react';
import { AlertCircle, ArrowLeft, LockKeyhole, Mail, ShieldCheck, UserPlus, UserRound } from 'lucide-react';

interface NomineeSignupScreenProps {
  errorMessage?: string;
  isSubmitting: boolean;
  onSignup: (fullName: string, email: string, password: string) => Promise<void>;
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
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setLocalError('Complete all required fields to create your account.');
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
    await onSignup(fullName.trim(), email.trim(), password);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-5xl grid lg:grid-cols-[1.15fr_0.85fr] overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="relative p-8 sm:p-10 lg:p-12 bg-linear-to-br from-slate-950 via-slate-900 to-blue-950">
          <div className="absolute inset-0 opacity-40 pointer-events-none bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.28),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.2),_transparent_42%)]" />
          <div className="relative space-y-6">
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

        <div className="p-8 sm:p-10 lg:p-12 bg-white text-slate-900">
          <div className="max-w-sm mx-auto">
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
                <span className="text-xs font-semibold text-slate-700">Password</span>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 focus-within:border-blue-500 focus-within:bg-white">
                  <LockKeyhole size={16} className="text-slate-400" />
                  <input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="At least 8 characters" />
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Confirm password</span>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 focus-within:border-blue-500 focus-within:bg-white">
                  <LockKeyhole size={16} className="text-slate-400" />
                  <input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Re-enter password" />
                </div>
              </label>

              {(localError || errorMessage) && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{localError || errorMessage}</span>
                </div>
              )}

              <button type="submit" disabled={isSubmitting} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70 inline-flex items-center justify-center gap-2">
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
