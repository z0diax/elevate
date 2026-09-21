import React, { useState } from 'react';
import { AlertCircle, LockKeyhole, LogIn, Mail, ShieldCheck } from 'lucide-react';

interface LoginScreenProps {
  errorMessage?: string;
  isSubmitting: boolean;
  onLogin: (email: string, password: string) => Promise<void>;
  onNavigateToSignup: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  errorMessage,
  isSubmitting,
  onLogin,
  onNavigateToSignup,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setLocalError('Email and password are required.');
      return;
    }

    setLocalError('');
    await onLogin(email.trim(), password);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-5xl grid lg:grid-cols-[1.15fr_0.85fr] overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="relative p-8 sm:p-10 lg:p-12 bg-linear-to-br from-slate-950 via-slate-900 to-blue-950">
          <div className="absolute inset-0 opacity-40 pointer-events-none bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.28),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.2),_transparent_42%)]" />

          <div className="relative space-y-6">
            <div className="space-y-3">
              <span className="inline-flex items-center rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-blue-200">
                Secure Access
              </span>

              <div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                  Tacloban PRAISE Management System
                </h1>
                <p className="mt-3 max-w-2xl text-sm text-slate-300 leading-relaxed">
                  Official workflow and records platform for the City Government of Tacloban PRAISE program.
                </p>
              </div>
            </div>

            <div className="pt-8">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <ShieldCheck size={15} />
                <span>City Government of Tacloban</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 sm:p-10 lg:p-12 bg-white text-slate-900">
          <div className="max-w-sm mx-auto">
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-blue-700">Sign In</p>
              <h2 className="text-2xl font-bold">System Access</h2>
              <p className="text-sm text-slate-500">
                Enter your registered email address and password to continue.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Email address</span>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 focus-within:border-blue-500 focus-within:bg-white">
                  <Mail size={16} className="text-slate-400" />
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                    placeholder="name@tacloban.gov.ph"
                  />
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Password</span>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 focus-within:border-blue-500 focus-within:bg-white">
                  <LockKeyhole size={16} className="text-slate-400" />
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                    placeholder="Enter password"
                  />
                </div>
              </label>

              {(localError || errorMessage) && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{localError || errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 inline-flex items-center justify-center gap-2"
              >
                <LogIn size={16} />
                <span>{isSubmitting ? 'Signing in...' : 'Sign in to PRAISE'}</span>
              </button>
            </form>

            <div className="mt-5 border-t border-slate-100 pt-5 text-center">
              <p className="text-xs text-slate-500">New nominee?</p>
              <button type="button" onClick={onNavigateToSignup} className="mt-1 text-xs font-bold text-blue-700 hover:text-blue-800 cursor-pointer">
                Create a nominee account
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
