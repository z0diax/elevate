import React, { useState } from 'react';
import { APP_LOGO_URL, APP_NAME } from '../../lib/branding';

interface ChangePasswordScreenProps {
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onLogout: () => Promise<void>;
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

  return <div className="min-h-screen bg-slate-950 p-6 flex items-center justify-center">
    <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
      <img src={APP_LOGO_URL} alt={`${APP_NAME} logo`} className="h-14 w-14 object-contain" />
      <h1 className="mt-5 text-2xl font-bold text-slate-900">Change your password</h1>
      <p className="mt-2 text-sm text-slate-600">Your account requires a new password before you can continue.</p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block text-sm font-semibold text-slate-800">Current password
          <input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 p-3" />
        </label>
        <label className="block text-sm font-semibold text-slate-800">New password
          <input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={event => setNewPassword(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 p-3" />
        </label>
        <label className="block text-sm font-semibold text-slate-800">Confirm new password
          <input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 p-3" />
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={isSubmitting} className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white disabled:opacity-50">{isSubmitting ? 'Updating...' : 'Change password and continue'}</button>
      </form>
      <button type="button" onClick={() => { void onLogout().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not sign out.')); }} disabled={isSubmitting} className="mt-4 w-full text-sm font-semibold text-slate-600 disabled:opacity-50">Sign out</button>
    </div>
  </div>;
};
