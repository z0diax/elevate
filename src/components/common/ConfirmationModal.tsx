import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Archive } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'neutral';
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  tone,
  isConfirming = false,
  onConfirm,
  onCancel,
}) => {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    cancelButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isConfirming) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isConfirming, onCancel]);

  if (!isOpen) {
    return null;
  }
  const neutral = tone === 'neutral';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="Close confirmation dialog"
        disabled={isConfirming}
        onClick={onCancel}
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-[1px] cursor-default"
      />
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
        aria-describedby="confirmation-modal-message"
        className="relative w-full min-w-0 max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain wrap-anywhere rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6"
      >
        <div className="flex items-start gap-3">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${neutral ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600'}`}>
            {neutral ? <Archive size={20} /> : <AlertTriangle size={20} />}
          </div>
          <div className="min-w-0 break-words">
            <h2 id="confirmation-modal-title" className="text-base font-bold text-slate-900">{title}</h2>
            <p id="confirmation-modal-message" className="mt-1.5 text-sm leading-6 text-slate-600">{message}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className={`px-4 py-2 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 ${neutral ? 'bg-blue-700 hover:bg-blue-800' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {isConfirming ? (neutral ? 'Saving...' : 'Deleting...') : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
};
