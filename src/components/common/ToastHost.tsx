import React, { useEffect, useState } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { ToastMessage, subscribeToasts } from '../../lib/toast';

const AUTO_DISMISS_MS = 4500;

export const ToastHost: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => subscribeToasts(toast => {
    setToasts(current => [...current, toast]);
    window.setTimeout(() => {
      setToasts(current => current.filter(item => item.id !== toast.id));
    }, AUTO_DISMISS_MS);
  }), []);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,24rem)] flex-col gap-3" aria-live="polite">
      {toasts.map(toast => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        const Icon = isSuccess ? CheckCircle2 : isError ? XCircle : Info;
        const colorClass = isSuccess
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : isError
            ? 'border-red-200 bg-red-50 text-red-900'
            : 'border-blue-200 bg-blue-50 text-blue-900';

        return (
          <div key={toast.id} className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-lg ${colorClass}`} role="status">
            <Icon size={19} className="mt-0.5 shrink-0" />
            <p className="min-w-0 flex-1 text-sm font-medium leading-5 break-words">{toast.message}</p>
            <button
              type="button"
              onClick={() => setToasts(current => current.filter(item => item.id !== toast.id))}
              className="shrink-0 rounded-md p-0.5 opacity-70 hover:bg-black/5 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
