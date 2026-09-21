import React, { useEffect, useMemo, useState } from 'react';
import { Application, Award, UserProfile } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { StageProgressTracker } from '../common/StageProgressTracker';
import { AuditTrailModal } from '../common/AuditTrailModal';
import { DocumentViewerModal } from '../common/DocumentViewerModal';
import { praiseService } from '../../lib/supabase';
import { pdfGenerator } from '../../lib/pdfGenerator';
import {
  AlertCircle,
  Clock,
  Download,
  FileCheck2,
  FolderOpen,
  History,
  Plus,
  Sparkles,
  Upload,
} from 'lucide-react';

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

  const [selectedAppId, setSelectedAppId] = useState<string>(myApplications[0]?.id || '');
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);

  useEffect(() => {
    if (!myApplications.length) {
      setSelectedAppId('');
      return;
    }

    if (!myApplications.some(application => application.id === selectedAppId)) {
      setSelectedAppId(myApplications[0].id);
    }
  }, [myApplications, selectedAppId]);

  const selectedApp = myApplications.find(application => application.id === selectedAppId) || myApplications[0];
  const selectedAward = awards.find(award => award.id === selectedApp?.award_id);
  const selectedDoc = selectedApp?.documents?.find(document => document.id === selectedDocId) || null;
  const rejectedDocs = (selectedApp?.documents || []).filter(document => document.status === 'Rejected');

  async function handleReuploadDoc(docId: string, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedApp) {
      return;
    }

    setUploadingDocId(docId);
    try {
      await praiseService.reuploadDocument(selectedApp.id, docId, file, file.name);
      await onRefreshData();
      alert(`File "${file.name}" uploaded successfully. The Secretariat has been notified for re-verification.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to upload the replacement document.');
    } finally {
      setUploadingDocId(null);
      event.target.value = '';
    }
  }

  return (
    <div id="nominee-dashboard-container" className="space-y-6">
      <div className="bg-slate-900 rounded-xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
            City of Tacloban Employee Portal
          </span>
          <h2 className="text-xl font-bold text-white mt-0.5">My PRAISE Nominations & Stage Tracker</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Track real workflow status, respond to document compliance requests, and download nomination outputs.
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider px-1">
            My Nominations ({myApplications.length})
          </h3>

          <div className="space-y-2 max-h-[75vh] overflow-y-auto pr-1">
            {myApplications.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-400 shadow-xs">
                <FolderOpen size={32} className="mx-auto mb-2 opacity-30 text-slate-400" />
                <p className="text-xs font-semibold">You have no active nominations filed.</p>
                <button
                  onClick={onNavigateToNomination}
                  className="mt-3 text-xs text-blue-600 font-bold hover:underline"
                >
                  Start a nomination
                </button>
              </div>
            ) : (
              myApplications.map(application => {
                const isSelected = application.id === selectedApp?.id;

                return (
                  <div
                    key={application.id}
                    id={`nominee-app-card-${application.id}`}
                    onClick={() => setSelectedAppId(application.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
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

                    <h4 className="text-xs font-bold text-slate-900 truncate">{application.award_name}</h4>
                    <p className="text-[11px] text-slate-500 truncate">
                      Nominee: <strong className="font-semibold text-slate-700">{application.nominee_name}</strong>
                    </p>

                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <span className="text-blue-600 font-medium">
                        Stage: {application.processing_stage}
                      </span>
                      <span className="text-slate-400">
                        {new Date(application.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
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
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">{selectedApp.nominee_name}</h3>
                    <StatusBadge status={selectedApp.status} size="sm" />
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {[selectedApp.position_title, selectedApp.office_name, selectedApp.barangay].filter(Boolean).join(' • ')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id="nominee-audit-btn"
                    onClick={() => setIsAuditModalOpen(true)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <History size={14} />
                    <span>View Status History</span>
                  </button>

                  <button
                    onClick={() => pdfGenerator.generateApplicationSummary(selectedApp, selectedAward)}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Download size={14} />
                    <span>Download Form A-1</span>
                  </button>
                </div>
              </div>

              {selectedApp.status === 'Awarded' && (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500 text-slate-950 rounded-lg">
                      <Sparkles size={24} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-amber-950">Congratulations! Official Award Conferred</h4>
                      <p className="text-xs text-amber-800">Honored with the City of Tacloban PRAISE Excellence Recognition.</p>
                    </div>
                  </div>

                  <button
                    onClick={() => pdfGenerator.generateAwardCertificate(selectedApp, selectedAward)}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-md inline-flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0"
                  >
                    <Download size={14} />
                    <span>Download Official Certificate</span>
                  </button>
                </div>
              )}

              <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-200 flex items-start gap-3">
                <Clock size={18} className="text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-blue-900">Current Next Step & Directive</h4>
                  <p className="text-xs text-slate-700 mt-0.5">
                    {selectedApp.required_action || 'No pending action at this stage.'}
                  </p>
                </div>
              </div>

              {rejectedDocs.length > 0 && (
                <div className="p-4 bg-red-50 rounded-xl border border-red-200 space-y-3">
                  <div className="flex items-center gap-2 text-red-900 font-bold text-xs">
                    <AlertCircle size={16} />
                    <span>Action Required: Non-compliant documents returned by the Secretariat</span>
                  </div>

                  <div className="space-y-2">
                    {rejectedDocs.map(document => (
                      <div
                        key={document.id}
                        className="p-3 bg-white rounded-lg border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div>
                          <p className="text-xs font-bold text-slate-900">{document.document_name}</p>
                          <p className="text-[11px] text-red-600 mt-0.5">
                            Reason: {document.verification_remarks || 'Document deficiency noted.'}
                          </p>
                        </div>

                        <label className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 cursor-pointer shrink-0 disabled:cursor-not-allowed disabled:opacity-70">
                          <Upload size={13} />
                          <span>{uploadingDocId === document.id ? 'Uploading...' : 'Re-upload Compliant File'}</span>
                          <input
                            type="file"
                            accept=".pdf,.docx,.doc,.jpg,.jpeg,.png"
                            onChange={(event) => void handleReuploadDoc(document.id, event)}
                            className="hidden"
                            disabled={uploadingDocId === document.id}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileCheck2 size={14} className="text-blue-600" />
                  <span>Submitted Documentary Attachments ({(selectedApp.documents || []).length})</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(selectedApp.documents || []).map(document => (
                    <div
                      key={document.id}
                      onClick={() => setSelectedDocId(document.id)}
                      className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs cursor-pointer hover:bg-slate-100"
                    >
                      <span className="truncate pr-2 font-medium text-slate-800">{document.document_name}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0 ${
                        document.status === 'Verified'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : document.status === 'Rejected'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {document.status}
                      </span>
                    </div>
                  ))}
                </div>
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

      {selectedDoc && selectedApp && (
        <DocumentViewerModal
          isOpen={!!selectedDoc}
          onClose={() => setSelectedDocId(null)}
          document={selectedDoc}
          nomineeName={selectedApp.nominee_name}
          applicationNumber={selectedApp.application_number}
          userRole={currentUser.role}
        />
      )}
    </div>
  );
};
