import React, { useState } from 'react';
import { Application, UserRole } from '../../types';
import { praiseService } from '../../lib/api';
import { DocumentViewerModal } from '../common/DocumentViewerModal';
import { RevisionInstructions } from './NominationRevisionControls';
import { NominationActionModal } from './NominationActionModal';
import { NominationDetails, NominationDocuments, NominationHistory } from './NominationReadOnlySections';

interface NomineeTrackingModalProps {
  application: Application;
  onClose: () => void;
  onCorrect?: () => void;
  onRevise?: () => void;
  userRole?: UserRole;
}

export const NomineeTrackingModal: React.FC<NomineeTrackingModalProps> = ({ application, onClose, onCorrect, onRevise, userRole = 'NOMINEE' }) => {
  const [activeTab, setActiveTab] = useState('status');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const needsCorrection = Boolean(onCorrect || onRevise);
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
        footer={needsCorrection ? <button type="button" onClick={onRevise || onCorrect} className="min-h-11 w-full rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto">{onRevise ? 'Edit Nomination' : 'Review required changes'}</button> : undefined}
      >
        {activeTab === 'status' && <section className="space-y-4">
          <RevisionInstructions application={application} />
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
      {selectedDoc && <DocumentViewerModal isOpen={true} onClose={() => setSelectedDocId(null)} document={selectedDoc} nomineeName={application.nominee_name} applicationNumber={application.application_number} userRole={userRole} />}
    </>
  );
};
