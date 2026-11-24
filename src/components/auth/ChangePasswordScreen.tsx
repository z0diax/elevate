import React, { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { APP_LOGO_URL, APP_NAME } from '../../lib/branding';

interface ChangePasswordScreenProps {
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

function PasswordField({ label, ...inputProps }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> & { label: string }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">{label}</label>
      <div className="relative mt-1">
        <input {...inputProps} id={id} type={visible ? 'text' : 'password'} className="w-full rounded-lg border border-slate-300 p-3 pr-12" />
        <button
          type="button"
          onClick={() => setVisible(previous => !previous)}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export const ChangePasswordScreen: React.FC<ChangePasswordScreenProps> = ({ onChangePassword, onLogout }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentPassword || newPassword.length < 8 || newPassword !== confirmation || newPassword === currentPassword) {
      setError('Enter your current password and a different new password of at least 8 characters, then confirm it.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await onChangePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change password.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return <div className="auth-shell min-h-dvh bg-slate-950 px-3 sm:px-6 flex items-center justify-center">
    <div className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-8 shadow-2xl">
      <img src={APP_LOGO_URL} alt={`${APP_NAME} logo`} className="h-14 w-14 object-contain" />
      <h1 className="mt-5 text-2xl font-bold text-slate-900">Set your personal password</h1>
      <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-slate-700">
        <p className="font-semibold text-blue-900">Welcome! Complete your account setup</p>
        <p className="mt-2">Your administrator created your account and provided a temporary password. On your first sign-in, you must replace it with a password of your own to help keep your account secure.</p>
        <p className="mt-2">This is a required setup step. After saving your new password, you can continue to your dashboard. Use your new password for future sign-ins.</p>
      </div>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <PasswordField label="Current password" autoComplete="current-password" aria-describedby="current-password-help" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required />
        <p id="current-password-help" className="text-xs leading-5 text-slate-500">Enter the temporary password your administrator gave you—the same one you just used to sign in.</p>
        <PasswordField label="New password" autoComplete="new-password" aria-describedby="new-password-help" minLength={8} value={newPassword} onChange={event => setNewPassword(event.target.value)} required />
        <p id="new-password-help" className="text-xs leading-5 text-slate-500">Choose a password with at least 8 characters that is different from your temporary password. Keep it private.</p>
        <PasswordField label="Confirm new password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required />
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={isSubmitting} className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white disabled:opacity-50">{isSubmitting ? 'Updating...' : 'Change password and continue'}</button>
      </form>
      <p className="mt-4 text-xs leading-5 text-slate-500">If you do not know your temporary password, contact the administrator who created your account.</p>
      <button type="button" onClick={() => { void onLogout().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not sign out.')); }} disabled={isSubmitting} className="mt-4 w-full text-sm font-semibold text-slate-600 disabled:opacity-50">Sign out</button>
    </div>
  </div>;
};
