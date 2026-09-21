import React, { useEffect, useMemo, useState } from 'react';
import { Search, ShieldCheck } from 'lucide-react';
import { ApplicationHistory } from '../../types';
import { StatusBadge } from '../common/StatusBadge';

interface AuditLogsViewProps {
  logs: ApplicationHistory[];
}

const ITEMS_PER_PAGE = 20;

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ logs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredLogs = useMemo(() => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();

    return logs.filter(log => {
      const matchesSearch =
        log.user_name.toLowerCase().includes(normalizedSearchTerm) ||
        log.action.toLowerCase().includes(normalizedSearchTerm) ||
        (log.remarks || '').toLowerCase().includes(normalizedSearchTerm);

      const matchesRole = roleFilter === 'ALL' || log.user_role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [logs, roleFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);
  const visibleStart = filteredLogs.length === 0 ? 0 : startIndex + 1;
  const visibleEnd = filteredLogs.length === 0 ? 0 : Math.min(endIndex, filteredLogs.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const startPage = Math.max(1, safeCurrentPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    const adjustedStartPage = Math.max(1, endPage - 4);

    return Array.from(
      { length: endPage - adjustedStartPage + 1 },
      (_, index) => adjustedStartPage + index
    );
  }, [safeCurrentPage, totalPages]);

  return (
    <div id="audit-logs-view-container" className="space-y-6">
      <div className="bg-slate-900 rounded-xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-blue-400" />
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
              Cryptographic Audit Protocol
            </span>
          </div>
          <h2 className="text-xl font-bold text-white mt-0.5">System Audit Trail & Event Ledger</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Complete immutable transaction log of all nomination filings, verifications, scoring updates, and deliberation decisions.
          </p>
        </div>

        <div className="bg-slate-800 border border-slate-700 px-4 py-2.5 rounded-lg text-center">
          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Total Logged Events</p>
          <p className="text-lg font-bold text-white mt-0.5">{logs.length}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative sm:col-span-2">
          <Search size={15} className="absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search action, actor name, remarks..."
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
          />
        </div>

        <div>
          <select
            value={roleFilter}
            onChange={event => setRoleFilter(event.target.value)}
            className="w-full text-xs p-2 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
          >
            <option value="ALL">All Roles</option>
            <option value="ADMINISTRATOR">Administrator</option>
            <option value="SECRETARIAT">Secretariat</option>
            <option value="HEAD_OF_OFFICE">Head of Office</option>
            <option value="EVALUATOR">Evaluator</option>
            <option value="NOMINEE">Nominee / Public</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-slate-500">
            Showing {visibleStart}-{visibleEnd} of {filteredLogs.length} audit records
          </p>
          <p className="text-xs text-slate-400">20 items per page</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5">Timestamp</th>
                <th className="px-4 py-3.5">Actor & Role</th>
                <th className="px-4 py-3.5">Action Executed</th>
                <th className="px-4 py-3.5">Status Transition</th>
                <th className="px-4 py-3.5">Remarks / Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedLogs.length > 0 ? (
                paginatedLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleDateString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-900">
                      <div>{log.user_name}</div>
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                        {log.user_role}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-bold text-slate-800">
                      {log.action}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {log.new_status ? (
                        <div className="flex items-center gap-1">
                          {log.previous_status && (
                            <>
                              <StatusBadge status={log.previous_status} size="sm" />
                              <span className="text-slate-400">&rarr;</span>
                            </>
                          )}
                          <StatusBadge status={log.new_status} size="sm" />
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 max-w-xs truncate">
                      {log.remarks || '-'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                    No audit log records match the current search and role filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-200 bg-white flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-500">
            Page {safeCurrentPage} of {totalPages}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
              disabled={safeCurrentPage === 1}
              className="px-3 py-1.5 rounded-md border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>

            <div className="flex items-center gap-1">
              {pageNumbers.map(pageNumber => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setCurrentPage(pageNumber)}
                  className={`min-w-8 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                    pageNumber === safeCurrentPage
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {pageNumber}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
              disabled={safeCurrentPage === totalPages}
              className="px-3 py-1.5 rounded-md border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
