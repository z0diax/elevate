import React, { useId, useState } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';

type AuthPasswordFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'id' | 'className'> & {
  label: string;
};

export const AuthPasswordField: React.FC<AuthPasswordFieldProps> = ({ label, ...inputProps }) => {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-slate-700">{label}</label>
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 focus-within:border-blue-500 focus-within:bg-white">
        <LockKeyhole size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
        <input
          {...inputProps}
          id={id}
          type={visible ? 'text' : 'password'}
          className="min-w-0 w-full bg-transparent text-sm outline-none"
        />
        <button
          type="button"
          onClick={() => setVisible(previous => !previous)}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          aria-controls={id}
          className="-my-2 -mr-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
};
