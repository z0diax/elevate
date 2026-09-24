import React, { useMemo } from 'react';
import { Application, Award, UserProfile } from '../../types';
import { FolderOpen, Plus } from 'lucide-react';

interface NomineeDashboardProps {
  applications: Application[];
  awards: Award[];
  currentUser: UserProfile;
  onRefreshData: () => void | Promise<void>;
  onNavigateToNomination: () => void;
}

export const NomineeDashboard: React.FC<NomineeDashboardProps> = ({
  applications,
  awards,
  currentUser,
  onRefreshData,
  onNavigateToNomination,
}) => {
  const myApplications = useMemo(() => applications.filter(application =>
    application.nominee_id === currentUser.id ||
    application.nominator_id === currentUser.id ||
    application.email.toLowerCase() === currentUser.email.toLowerCase() ||
    application.nominee_name.trim().toLowerCase() === currentUser.full_name.trim().toLowerCase() ||
    application.nominator_name.trim().toLowerCase() === currentUser.full_name.trim().toLowerCase()
  ), [applications, currentUser.email, currentUser.full_name, currentUser.id]);

  return (
    <div id="nominee-dashboard-container" className="space-y-6">
      <div className="bg-slate-900 rounded-xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
            City of Tacloban Employee Portal
          </span>
                  <h2 className="text-xl font-bold text-white mt-0.5">My PRAISE Nominations</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                    Monitor nominations submitted by you without exposing confidential evaluation or award decisions.
          </p>
        </div>

        <button
          id="nominee-new-nomination-btn"
          onClick={onNavigateToNomination}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors cursor-pointer inline-flex items-center gap-2"
        >
          <Plus size={16} />
          <span>Submit New Nomination</span>
        </button>
      </div>

      <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider px-1">
            My Nominations ({myApplications.length})
          </h3>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            {myApplications.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <FolderOpen size={32} className="mx-auto mb-2 opacity-30 text-slate-400" />
                <p className="text-xs font-semibold">You have no nominations filed yet.</p>
                <button
                  onClick={onNavigateToNomination}
                  className="mt-3 text-xs text-blue-600 font-bold hover:underline"
                >
                  Start a nomination
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Name</th>
                      <th className="px-5 py-3">Office</th>
                      <th className="px-5 py-3">Award applied</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {myApplications.map(application => (
                      <tr key={application.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 font-semibold text-slate-900">{application.nominee_name}</td>
                        <td className="px-5 py-4 text-slate-600">{application.office_name}</td>
                        <td className="px-5 py-4 font-medium text-slate-700">{application.award_name}</td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            Processing
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
      </div>
    </div>
  );
};
