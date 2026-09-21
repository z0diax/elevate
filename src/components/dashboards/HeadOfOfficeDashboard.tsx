import React, { useEffect, useMemo, useState } from 'react';
import { Application, Award, UserProfile } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { StageProgressTracker } from '../common/StageProgressTracker';
import { AuditTrailModal } from '../common/AuditTrailModal';
import { praiseService } from '../../lib/supabase';
import { pdfGenerator } from '../../lib/pdfGenerator';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Download,
  FileCheck,
  FileText,
  History,
  RotateCcw,
  UserCheck,
  XCircle,
} from 'lucide-react';

interface HeadOfOfficeDashboardProps {
  applications: Application[];
  currentUser: UserProfile;
  awards: Award[];
  onRefreshData: () => void | Promise<void>;
  onNavigateToNomination: () => void;
}

export const HeadOfOfficeDashboard: React.FC<HeadOfOfficeDashboardProps> = ({
  applications,
  currentUser,
  awards,
  onRefreshData,
  onNavigateToNomination,
}) => {
  const officeApplications = useMemo(() => applications.filter(application =>
    !currentUser.office_id ||
    application.office_id === currentUser.office_id ||
    application.office_name === currentUser.office_name
  ), [applications, currentUser.office_id, currentUser.office_name]);

  const [selectedAppId, setSelectedAppId] = useState<string>(officeApplications[0]?.id || '');
  const [remarks, setRemarks] = useState('');
  const [actionError, setActionError] = useState('');
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!officeApplications.length) {
      setSelectedAppId('');
      return;
    }

    if (!officeApplications.some(application => application.id === selectedAppId)) {
      setSelectedAppId(officeApplications[0].id);
    }
  }, [officeApplications, selectedAppId]);

  const selectedApp = officeApplications.find(application => application.id === selectedAppId) || officeApplications[0];
  const selectedAward = awards.find(award => award.id === selectedApp?.award_id);

  const pendingEndorsementCount = officeApplications.filter(application =>
    application.status === 'Submitted' || application.status === 'For Endorsement' || application.status === 'Returned for Revision'
  ).length;

  async function handleEndorse() {
    if (!selectedApp) {
      return;
    }

    setIsBusy(true);
    try {
      await praiseService.endorseApplication(
        selectedApp.id,
        remarks.trim() || `Officially endorsed by ${currentUser.full_name}, ${currentUser.position_title || 'Head of Office'}.`,
        'Endorsed'
      );
      setRemarks('');
      setActionError('');
      await onRefreshData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to endorse the application.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReturn() {
    if (!selectedApp) {
      return;
    }

    if (!remarks.trim()) {
      setActionError('Mandatory: Please state the specific revision instructions.');
      return;
    }

    setIsBusy(true);
    try {
      await praiseService.endorseApplication(selectedApp.id, remarks.trim(), 'Returned for Revision');
      setRemarks('');
      setActionError('');
      await onRefreshData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to return the application for revision.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReject() {
    if (!selectedApp) {
      return;
    }

    if (!remarks.trim()) {
      setActionError('Mandatory: Please provide formal reasons for non-endorsement.');
      return;
    }

    setIsBusy(true);
    try {
      await praiseService.endorseApplication(
        selectedApp.id,
        `Head of Office non-endorsement: ${remarks.trim()}`,
        'Rejected'
      );
      setRemarks('');
      setActionError('');
      await onRefreshData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to record the non-endorsement decision.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div id="head-of-office-dashboard-container" className="space-y-6">
      <div className="bg-slate-900 rounded-xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-blue-400" />
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
              {currentUser.office_name || 'Department Endorsement Portal'}
            </span>
          </div>
          <h2 className="text-xl font-bold text-white mt-0.5">Head of Office Endorsement Desk</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Review office nominations and record the official endorsement decision before Secretariat processing begins.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-lg text-center">
            <p className="text-[10px] text-slate-400 uppercase font-bold">Pending Endorsement</p>
            <p className="text-xl font-bold text-amber-400">{pendingEndorsementCount}</p>
          </div>
          <button
            onClick={onNavigateToNomination}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors cursor-pointer"
          >
            Nominate Staff Member
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider px-1">
            Office Nominations ({officeApplications.length})
          </h3>

          <div className="space-y-2 max-h-[75vh] overflow-y-auto pr-1">
            {officeApplications.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-400 shadow-xs">
                <FileText size={32} className="mx-auto mb-2 opacity-30 text-slate-400" />
                <p className="text-xs font-semibold">No active nominations in your office.</p>
              </div>
            ) : (
              officeApplications.map(application => {
                const isSelected = application.id === selectedApp?.id;
                return (
                  <div
                    key={application.id}
                    id={`head-app-card-${application.id}`}
                    onClick={() => setSelectedAppId(application.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-500 shadow-2xs'
                        : 'bg-white border-slate-200 hover:bg-slate-50 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[11px] font-bold text-blue-600">
                        {application.application_number}
                      </span>
                      <StatusBadge status={application.status} size="sm" />
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 truncate">{application.nominee_name}</h4>
                    <p className="text-[11px] text-slate-500 truncate">{application.position_title}</p>

                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <span className="text-slate-600 font-medium truncate max-w-[170px]">
                        {application.award_name}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {selectedApp ? (
          <div className="lg:col-span-8 space-y-6">
            <StageProgressTracker
              currentStage={selectedApp.processing_stage}
              currentStatus={selectedApp.status}
            />

            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">{selectedApp.nominee_name}</h3>
                    <StatusBadge status={selectedApp.status} size="sm" />
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {[selectedApp.position_title, selectedApp.employment_category, selectedApp.division_section || selectedApp.office_name].filter(Boolean).join(' • ')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsAuditModalOpen(true)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <History size={14} />
                    <span>Audit Trail</span>
                  </button>
                  <button
                    onClick={() => pdfGenerator.generateApplicationSummary(selectedApp, selectedAward)}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Download size={14} />
                    <span>Summary Dossier</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <h4 className="font-bold text-slate-900">Nominator Justification:</h4>
                  <p className="mt-1 p-3 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 leading-relaxed">
                    {selectedApp.justification}
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-slate-900">Key Accomplishments & Concrete Impact:</h4>
                  <p className="mt-1 p-3 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 leading-relaxed">
                    {selectedApp.accomplishments}
                  </p>
                </div>

                {selectedApp.supporting_narrative && (
                  <div>
                    <h4 className="font-bold text-slate-900">Supporting Narrative / Acts of Integrity:</h4>
                    <p className="mt-1 p-3 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 leading-relaxed">
                      {selectedApp.supporting_narrative}
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <FileCheck size={14} className="text-blue-600" />
                  <span>Attached Documentary Submissions ({selectedApp.documents?.length || 0})</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(selectedApp.documents || []).map(document => (
                    <div key={document.id} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                      <span className="truncate pr-2 font-medium text-slate-800">{document.document_name}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                        document.status === 'Verified'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {document.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserCheck size={16} className="text-blue-600" />
                <span>Official Endorsement Decision</span>
              </h4>

              {actionError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Endorsement Remarks / Recommendation:
                </label>
                <textarea
                  rows={3}
                  placeholder="Enter endorsement justification, affirmations of character, or revision instructions..."
                  value={remarks}
                  onChange={event => setRemarks(event.target.value)}
                  className="w-full text-xs p-3 rounded-md border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    id="head-return-btn"
                    onClick={() => void handleReturn()}
                    disabled={isBusy}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <RotateCcw size={14} />
                    <span>Return for Revision</span>
                  </button>
                  <button
                    id="head-reject-btn"
                    onClick={() => void handleReject()}
                    disabled={isBusy}
                    className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <XCircle size={14} />
                    <span>Decline Endorsement</span>
                  </button>
                </div>

                <button
                  id="head-endorse-btn"
                  onClick={() => void handleEndorse()}
                  disabled={isBusy}
                  className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <CheckCircle2 size={16} />
                  <span>Officially Endorse to Secretariat</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-8 bg-white p-12 text-center rounded-xl border border-slate-200 text-slate-400">
            No application selected.
          </div>
        )}
      </div>

      {selectedApp && (
        <AuditTrailModal
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
          historyLogs={praiseService.getAuditLogsForApplication(selectedApp.id)}
          applicationNumber={selectedApp.application_number}
          nomineeName={selectedApp.nominee_name}
        />
      )}
    </div>
  );
};
