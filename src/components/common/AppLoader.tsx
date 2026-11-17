import { APP_LOGO_URL, APP_NAME } from '../../lib/branding';

interface AppLoaderProps {
  message?: string;
  overlay?: boolean;
}

export function AppLoader({ message = 'Preparing your workspace...', overlay = false }: AppLoaderProps) {
  return (
    <div
      className={overlay
        ? 'fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-6 backdrop-blur-sm'
        : 'app-loader-screen flex min-h-dvh items-center justify-center bg-slate-950 p-6'}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className={`w-full max-w-sm text-center text-white ${overlay ? 'rounded-3xl border border-slate-700/60 bg-slate-950 p-8 shadow-2xl' : 'py-10'}`}>
        <div className="relative mx-auto mb-8 flex h-32 w-32 items-center justify-center" aria-hidden="true">
          <div className="absolute inset-0 rounded-full border border-blue-300/15" />
          <div className="app-loader-orbit absolute inset-0 rounded-full border-2 border-transparent border-t-blue-400 border-r-blue-400/40" />
          <div className="absolute inset-3 rounded-full border border-blue-300/10 bg-blue-400/5" />
          <img src={APP_LOGO_URL} alt="" className="app-logo-outlined relative h-20 w-20 object-contain" />
          <span className="absolute bottom-0 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.5)]" />
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-blue-300">City Government of Tacloban</p>
        <h1 className="mt-3 text-xl font-bold leading-snug tracking-tight sm:text-2xl">{APP_NAME}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{message}</p>

        <div className="mx-auto mt-7 h-1 w-40 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
          <div className="app-loader-progress h-full w-1/2 rounded-full bg-linear-to-r from-blue-500 to-blue-300" />
        </div>
        <p className="mt-7 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">Service. Excellence. Recognition.</p>
      </div>
    </div>
  );
}
