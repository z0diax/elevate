import React, { useState } from 'react';
import { Application } from '../../types';
import { praiseService } from '../../lib/supabase';
import { DocumentViewerModal } from '../common/DocumentViewerModal';
import { NominationActionModal } from './NominationActionModal';
import { NominationDetails, NominationDocuments, NominationHistory } from './NominationReadOnlySections';

interface NomineeTrackingModalProps {
  application: Application;
  onClose: () => void;
  onCorrect?: () => void;
}

export const NomineeTrackingModal: React.FC<NomineeTrackingModalProps> = ({ application, onClose, onCorrect }) => {
  const [activeTab, setActiveTab] = useState('status');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const needsCorrection = application.status === 'Returned for Revision'
    || application.status === 'Incomplete'
    || (application.status === 'Not Approved' && application.endorsement?.decision === 'Rejected');
  const selectedDoc = application.documents?.find(document => document.id === selectedDocId) || null;

  return (
    <>
      <NominationActionModal
        application={application}
        title={needsCorrection ? 'Action required' : 'Your nomination'}
        task={needsCorrection ? 'Review the requested corrections and resubmit your nomination.' : 'No action is currently required from you.'}
        tabs={[{ id: 'status', label: 'Status' }, { id: 'documents', label: 'Documents' }, { id: 'details', label: 'Nomination details' }, { id: 'history', label: 'History' }]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onClose={onClose}
        footer={needsCorrection && onCorrect ? <button type="button" onClick={onCorrect} className="min-h-11 w-full rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto">Review required changes</button> : undefined}
      >
        {activeTab === 'status' && <section className="space-y-4">
          <div className={'rounded-xl p-5 ' + (needsCorrection ? 'border border-amber-200 bg-amber-50' : 'bg-slate-50')}>
            <h3 className="text-base font-bold text-slate-950">{needsCorrection ? 'Corrections requested' : 'Nomination in progress'}</h3>
            <p className="mt-2 break-words text-sm leading-6 text-slate-700">{needsCorrection
              ? application.required_action || application.remarks || 'Please review the requested corrections.'
              : 'Your nomination is currently at the ' + application.processing_stage + ' stage. No action is required from you.'}</p>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold text-slate-600">Reference</dt><dd className="mt-1 break-words text-slate-900">{application.application_number}</dd></div>
            <div><dt className="font-semibold text-slate-600">Award</dt><dd className="mt-1 break-words text-slate-900">{application.award_name}</dd></div>
          </dl>
        </section>}
        {activeTab === 'documents' && <NominationDocuments application={application} onOpen={setSelectedDocId} />}
        {activeTab === 'details' && <NominationDetails application={application} />}
        {activeTab === 'history' && <NominationHistory logs={praiseService.getAuditLogsForApplication(application.id)} />}
      </NominationActionModal>
      {selectedDoc && <DocumentViewerModal isOpen={true} onClose={() => setSelectedDocId(null)} document={selectedDoc} nomineeName={application.nominee_name} applicationNumber={application.application_number} userRole="NOMINEE" />}
    </>
  );
};
