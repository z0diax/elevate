import React, { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Application, ApplicationHistory, UserRole } from '../../types';
import { praiseService } from '../../lib/api';
import { DocumentViewerModal } from '../common/DocumentViewerModal';
import { NominationActionModal } from './NominationActionModal';
import { NominationDetails, NominationDocuments, NominationHistory } from './NominationReadOnlySections';
import { NominationIdentityDetails } from './NominationIdentity';
import { NominationFieldGrid, NominationFormSection, NominationTabPanel } from './NominationFormPresentation';
import { StageProgressTracker } from '../common/StageProgressTracker';

const recordedDate = (value?: string, dateOnly = false) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Not recorded';
  return dateOnly ? new Date(value).toLocaleDateString('en-PH') : new Date(value).toLocaleString('en-PH');
};

const FORM_TABS = [{ id: 'overview', label: 'Overview' }, { id: 'people', label: 'Details' }, { id: 'justification', label: 'Justification' }, { id: 'documents', label: 'Documents' }, { id: 'submission', label: 'Submission' }];

export const NominationFormViewerModal: React.FC<{
  applicationId: string;
  userRole: UserRole;
  onClose: () => void;
}> = ({ applicationId, userRole, onClose }) => {
  const tabIdPrefix = useId();
  const [tabSelection, setTabSelection] = useState({ applicationId, tab: 'overview' });
  const activeTab = tabSelection.applicationId === applicationId ? tabSelection.tab : 'overview';
  const [record, setRecord] = useState<{ application: Application; history: ApplicationHistory[] } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [documentId, setDocumentId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setRecord(null); setError(''); setDocumentId(null);
    setTabSelection({ applicationId, tab: 'overview' });
    void praiseService.getNominationForm(applicationId).then(result => {
      if (!cancelled) setRecord(result);
    }).catch(reason => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load nomination.');
    });
    return () => { cancelled = true; };
  }, [applicationId, attempt]);
  const application = record?.application.id === applicationId ? record.application : undefined;
  const selectedDocument = application?.documents?.find(document => document.id === documentId);
  const submitted = record?.history.filter(log => log.action === 'Nomination Submitted')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];

  return createPortal(<div onClick={event => event.stopPropagation()}>
    <NominationActionModal presentation="document" application={application} title="Nomination Form" task="Read-only nomination record" tabs={application ? FORM_TABS : []} tabIdPrefix={tabIdPrefix} activeTab={activeTab} onTabChange={tab => setTabSelection({ applicationId, tab })} onClose={onClose}>
      {!record && !error && <p role="status" className="py-10 text-center text-sm text-slate-600">Loading nomination form…</p>}
      {error && <div role="alert" className="space-y-3 rounded-xl bg-red-50 p-5 text-sm text-red-800">
        <p>{error}</p>
        <button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-11 rounded-lg border border-red-200 px-4 font-semibold focus-visible:outline-2">Try again</button>
      </div>}
      {application && <div className="safe-long-text space-y-6 rounded-xl border border-slate-200 bg-white p-4 sm:space-y-7 sm:p-7 lg:p-8">
        <NominationTabPanel tabIdPrefix={tabIdPrefix} activeTab={activeTab} tab="overview">
        <section aria-label="Nomination Overview">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Nomination Overview</h3>
              <p className="safe-long-text mt-2 text-lg font-bold leading-7 text-slate-900">{application.award_name || 'Award not recorded'}</p>
            </div>
            <span className="rounded-md border border-slate-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Read-only record</span>
          </div>
          <NominationFieldGrid columns={3} fields={[
            ['Award category', undefined], ['Award year', application.award_year], ['Current status', application.status],
            ['Nomination classification', application.nomination_origin], ['Nomination type', application.nomination_type],
            ['Nomination date', recordedDate(application.date_of_nomination, true)], ['Processing stage', application.processing_stage], ['Submitted', recordedDate(submitted?.created_at)], ['Last updated', recordedDate(application.updated_at)],
          ]} />
          <div className="mt-5 border-t border-slate-200 pt-4">
            <h4 className="text-sm font-semibold text-slate-900">Nominee summary</h4>
            <NominationFieldGrid fields={[
              ['Full name', application.nominee_name], ['Office / Department', application.office_name], ['Position', application.position_title], ['Employment category', application.employment_category],
            ]} />
          </div>
          {(application.required_action || application.remarks) && <div className="mt-4 space-y-2 border-l-2 border-amber-300 bg-amber-50/60 px-4 py-3 text-sm leading-6 text-slate-700">
            {application.required_action && <p className="safe-long-text"><span className="font-semibold text-slate-900">Required action: </span>{application.required_action}</p>}
            {application.remarks && <p className="safe-long-text whitespace-pre-wrap"><span className="font-semibold text-slate-900">Remarks: </span>{application.remarks}</p>}
          </div>}
          <details className="mt-4 text-sm">
            <summary className="w-fit cursor-pointer rounded-sm text-xs font-semibold text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">View full workflow</summary>
            <div className="mt-3"><StageProgressTracker currentStage={application.processing_stage} currentStatus={application.status} /></div>
          </details>
        </section>
        </NominationTabPanel>
        <NominationTabPanel tabIdPrefix={tabIdPrefix} activeTab={activeTab} tab="people">
        <NominationFormSection number="01" title="Nominee Information">
          <NominationFieldGrid columns={3} fields={[
            ['Full name', application.nominee_name], ['Office / Department', application.office_name],
            ['Employee ID', application.employee_id], ['Position', application.position_title],
            ['Employment category', application.employment_category], ['Division / Section', application.division_section],
            ['Contact number', application.contact_number], ['Email', application.email], ['Barangay', application.barangay],
          ]} />
        </NominationFormSection>
        <NominationFormSection number="02" title="Nominator Information">
          {userRole === 'EVALUATOR' ? <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">Nominator identity, submission account, and signature are restricted during scoring.</p>
            : <NominationIdentityDetails application={application} showMissing presentation="document" />}
        </NominationFormSection>
        </NominationTabPanel>
        <NominationTabPanel tabIdPrefix={tabIdPrefix} activeTab={activeTab} tab="justification">
        <NominationFormSection number="03" title="Nomination Details">
          <NominationDetails application={application} includeIdentity={false} presentation="document" />
          {!application.justification && !application.accomplishments && !application.supporting_narrative && <p className="text-sm text-slate-500">No nomination narrative recorded.</p>}
        </NominationFormSection>
        </NominationTabPanel>
        <NominationTabPanel tabIdPrefix={tabIdPrefix} activeTab={activeTab} tab="documents">
        <NominationFormSection number="04" title="Supporting Documents">
          <NominationDocuments application={application} onOpen={setDocumentId} presentation="document" />
        </NominationFormSection>
        </NominationTabPanel>
        <NominationTabPanel tabIdPrefix={tabIdPrefix} activeTab={activeTab} tab="submission">
        <NominationFormSection number="05" title="Submission Information">
          <NominationFieldGrid fields={[
            ['Account used to submit', userRole === 'EVALUATOR' ? 'Restricted during scoring' : application.submission_account_name || application.nominator_id],
            ['Submission account role', userRole === 'EVALUATOR' ? 'Restricted during scoring' : application.submission_account_role?.replaceAll('_', ' ')],
            ['Submission date and time', recordedDate(submitted?.created_at)],
            ['Record created', recordedDate(application.created_at)], ['Last updated', recordedDate(application.updated_at)],
            ['Electronic signature recorded at', userRole === 'EVALUATOR' ? 'Restricted during scoring' : recordedDate(application.signature_signed_at)],
          ]} />
          <div className="mt-6"><NominationHistory logs={record!.history} presentation="document" /></div>
        </NominationFormSection>
        </NominationTabPanel>
        <p className="border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-500">City Government of Tacloban · Program on Awards and Incentives for Service Excellence</p>
      </div>}
    </NominationActionModal>
    {selectedDocument && application && <DocumentViewerModal isOpen onClose={() => setDocumentId(null)} document={selectedDocument} nomineeName={application.nominee_name} applicationNumber={application.application_number} userRole={userRole} />}
  </div>, document.body);
};

export const NominationReferenceButton: React.FC<{ applicationId: string; referenceNumber: string; userRole: UserRole }> = ({ applicationId, referenceNumber, userRole }) => {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" aria-haspopup="dialog" aria-label={`View nomination form ${referenceNumber}`} onClick={event => { event.stopPropagation(); setOpen(true); }} className="whitespace-nowrap rounded-sm text-left font-mono text-xs font-semibold leading-5 text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 hover:decoration-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{referenceNumber || 'Reference not recorded'}</button>
    {open && <NominationFormViewerModal applicationId={applicationId} userRole={userRole} onClose={() => setOpen(false)} />}
  </>;
};
