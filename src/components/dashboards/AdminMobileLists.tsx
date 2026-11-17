import React from 'react';
import { Application, Office, UserProfile } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { NominationReferenceButton } from '../nomination/NominationFormViewerModal';
import { getEvaluatorProgress } from '../../lib/evaluatorAssignments';

const actionClass = 'min-h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';
const deleteClass = 'min-h-11 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50';
const listClass = 'divide-y divide-slate-200 dark:divide-slate-800 xl:hidden';

function Details({ fields }: { fields: [string, React.ReactNode][] }) {
  return <dl className="space-y-2 text-sm">
    {fields.map(([label, value]) => <div key={label} className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-slate-800 dark:text-slate-200">{value || '—'}</dd>
    </div>)}
  </dl>;
}

export function AdminMobileApplications({ applications, role, isSaving, onTrack, onAudit, onDownload, onDelete }: {
  applications: Application[]; role: UserProfile['role']; isSaving: boolean;
  onTrack: (application: Application) => void; onAudit: (application: Application) => void;
  onDownload: (application: Application) => void; onDelete: (application: Application) => void;
}) {
  return <div className={listClass} data-mobile-list="applications">
    {!applications.length && <p className="p-6 text-center text-sm text-slate-500">No applications matched your filter criteria.</p>}
    {applications.map(application => {
      const progress = getEvaluatorProgress(application);
      return <article key={application.id} className="min-w-0 space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <NominationReferenceButton applicationId={application.id} referenceNumber={application.application_number} userRole={role} />
          <StatusBadge status={application.status} size="sm" />
        </div>
        <div><h4 className="break-words text-base font-bold text-slate-900">{application.nominee_name}</h4><p className="break-words text-sm text-slate-500">{application.position_title}</p></div>
        <Details fields={[
          ['Office', application.office_name], ['Award', application.award_name],
          ['Score', application.final_weighted_score == null ? 'Pending' : `${application.final_weighted_score}%`],
        ]} />
        {progress.assignedCount > 0 && <p className="text-sm text-slate-500">{progress.completedCount} of {progress.assignedCount} evaluations completed</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={actionClass} onClick={() => onTrack(application)}>Track stage</button>
          <button type="button" className={actionClass} onClick={() => onAudit(application)}>Audit trail</button>
          <button type="button" className={actionClass} onClick={() => onDownload(application)}>Download PDF</button>
          <button type="button" className={deleteClass} disabled={isSaving} onClick={() => onDelete(application)}>Delete nomination</button>
        </div>
      </article>;
    })}
  </div>;
}

export function AdminMobileOffices({ offices, isSaving, getDependencies, onEdit, onDelete }: {
  offices: Office[]; isSaving: boolean;
  getDependencies: (officeId: string) => { profiles: number; applications: number };
  onEdit: (office: Office) => void; onDelete: (office: Office) => void;
}) {
  return <div className={listClass} data-mobile-list="offices">
    {!offices.length && <p className="p-6 text-center text-sm text-slate-500">No offices to display.</p>}
    {offices.map(office => {
      const dependencies = getDependencies(office.id);
      const inUse = dependencies.profiles > 0 || dependencies.applications > 0;
      return <article key={office.id} className="min-w-0 space-y-4 p-4">
        <div><p className="text-sm font-bold text-blue-600">{office.code}</p><h4 className="mt-1 break-words text-base font-bold text-slate-900 dark:text-white">{office.name}</h4></div>
        <Details fields={[
          ['Department head', office.head_name], ['Designation', office.head_title], ['Status', office.is_active ? 'Active' : 'Inactive'],
        ]} />
        {inUse && <p className="text-sm text-slate-500">Linked to {dependencies.profiles} user account(s) and {dependencies.applications} nomination(s). Remove these links before deleting this office.</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={actionClass} onClick={() => onEdit(office)}>Edit office</button>
          <button type="button" className={deleteClass} disabled={inUse || isSaving} onClick={() => onDelete(office)}>Delete office</button>
        </div>
      </article>;
    })}
  </div>;
}

export function AdminMobileUsers({ users, currentUserId, isSaving, onEdit, onDelete }: {
  users: UserProfile[]; currentUserId: string; isSaving: boolean;
  onEdit: (user: UserProfile) => void; onDelete: (user: UserProfile) => void;
}) {
  return <div className={listClass} data-mobile-list="users">
    {!users.length && <p className="p-6 text-center text-sm text-slate-500">No user accounts to display.</p>}
    {users.map(user => <article key={user.id} className="min-w-0 space-y-4 p-4">
      <div><h4 className="break-words text-base font-bold text-slate-900 dark:text-white">{user.full_name}</h4><p className="mt-1 break-all text-sm text-slate-500">{user.email}</p></div>
      <Details fields={[
        ['Assigned role', user.role.replace(/_/g, ' ')], ['Assigned offices', user.office_names?.join(', ') || user.office_name || 'Unassigned'],
      ]} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={actionClass} onClick={() => onEdit(user)}>Change role</button>
        <button type="button" className={deleteClass} disabled={user.id === currentUserId || isSaving} onClick={() => onDelete(user)}>Delete user</button>
      </div>
      {user.id === currentUserId && <p className="text-xs text-slate-500">You cannot delete your own account.</p>}
    </article>)}
  </div>;
}
