import React, { useId } from 'react';

export const NominationTabPanel: React.FC<{
  tabIdPrefix: string;
  tab: string;
  activeTab: string;
  children: React.ReactNode;
}> = ({ tabIdPrefix, tab, activeTab, children }) => <div role="tabpanel" id={`${tabIdPrefix}-panel-${tab}`} aria-labelledby={`${tabIdPrefix}-tab-${tab}`} hidden={activeTab !== tab} tabIndex={0} className="space-y-6 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">
  {children}
</div>;

export const NominationFieldGrid: React.FC<{
  fields: [string, string | number | undefined][];
  columns?: 2 | 3;
}> = ({ fields, columns = 2 }) => <dl className={`grid grid-cols-1 gap-x-5 text-sm min-[360px]:grid-cols-2 sm:gap-x-6 ${columns === 3 ? 'lg:grid-cols-3' : ''}`}>
  {fields.map(([label, value]) => <div key={label} className="min-w-0 border-b border-slate-100 py-3">
    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className={`safe-long-text mt-1.5 whitespace-pre-wrap leading-6 ${value ? 'font-medium text-slate-900' : 'text-slate-500'}`}>{value || 'Not recorded'}</dd>
  </div>)}
</dl>;

export const NominationFormSection: React.FC<{
  number: string;
  title: string;
  children: React.ReactNode;
}> = ({ number, title, children }) => {
  const headingId = useId();
  return <section aria-labelledby={headingId} className="min-w-0 border-t border-slate-200 pt-6 first:border-t-0 first:pt-0 sm:pt-7">
    <div className="mb-4 flex items-center gap-3">
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-md border-b-2 border-amber-400 bg-slate-900 font-mono text-xs font-semibold text-white">{number}</span>
      <h3 id={headingId} className="text-base font-bold tracking-tight text-slate-900">{title}</h3>
    </div>
    {children}
  </section>;
};
