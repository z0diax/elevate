export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

const TOAST_EVENT = 'praise-toast';

export function showToast(message: string, type: ToastType = 'success') {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<ToastMessage>(TOAST_EVENT, {
    detail: {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      message,
    },
  }));
}

export function subscribeToasts(listener: (toast: ToastMessage) => void) {
  const handler = (event: Event) => {
    listener((event as CustomEvent<ToastMessage>).detail);
  };

  window.addEventListener(TOAST_EVENT, handler);
  return () => window.removeEventListener(TOAST_EVENT, handler);
}
