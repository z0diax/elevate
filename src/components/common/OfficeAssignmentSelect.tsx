import React, { useId, useState } from 'react';
import { Office } from '../../types';

export function OfficeAssignmentSelect({ offices, value, onChange }: {
  offices: Office[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const id = useId();
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const filteredOffices = offices.filter(office =>
    office.name.toLowerCase().includes(query) || office.code.toLowerCase().includes(query)
  );
  return (
    <fieldset>
      <legend className="font-semibold mb-1 text-slate-700 dark:text-slate-200">Assigned Offices</legend>
      <label htmlFor={`${id}-search`} className="sr-only">Search offices by name or code</label>
      <input
        id={`${id}-search`}
        type="search"
        value={search}
        onChange={event => setSearch(event.target.value)}
        placeholder="Search offices by name or code..."
        className="mb-2 w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="max-h-40 overflow-y-auto rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 space-y-2" aria-describedby={`${id}-help`}>
        {filteredOffices.map(office => (
          <label key={office.id} className="flex min-h-11 items-center gap-3 text-sm text-slate-900 dark:text-slate-100 cursor-pointer sm:min-h-0 sm:gap-2 sm:text-xs">
            <input type="checkbox" checked={value.includes(office.id)}
              onChange={event => onChange(event.target.checked ? [...value, office.id] : value.filter(selected => selected !== office.id))} />
            <span>{office.name}{value[0] === office.id ? ' (Default)' : ''}</span>
          </label>
        ))}
        {!offices.length && <p className="text-slate-500">No offices available.</p>}
        {offices.length > 0 && !filteredOffices.length && <p role="status" className="text-slate-500">No offices match your search.</p>}
      </div>
      <p id={`${id}-help`} className="text-[11px] text-slate-500 mt-1">{value.length ? `${value.length} office(s) selected.` : 'Unassigned.'} Select all offices that apply. The first selected office is the default for nomination forms.</p>
      {value.length > 0 && <button type="button" onClick={() => onChange([])} className="mt-1 text-blue-600 dark:text-blue-400">Clear selection</button>}
    </fieldset>
  );
}
