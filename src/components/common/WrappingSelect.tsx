import React from 'react';
import { ChevronDown } from 'lucide-react';

// Let the browser handle the picker and keyboard input while the visible value wraps.
export function WrappingSelect({ className = '', displayValue, children, ...props }: React.ComponentPropsWithoutRef<'select'> & { displayValue: string }) {
  return (
    <span className={`relative flex min-h-11 min-w-0 items-center gap-2 rounded-md px-2.5 py-2 focus-within:ring-2 focus-within:ring-blue-500 sm:min-h-9 ${className}`}>
      <span aria-hidden="true" className="safe-long-text flex-1 text-sm leading-snug">{displayValue}</span>
      <ChevronDown aria-hidden="true" size={15} className="shrink-0" />
      <select {...props} className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default">
        {children}
      </select>
    </span>
  );
}
