import { Application, ApplicationDocument, ApplicationHistory, ApplicationStatus, Award, NominationRevisionDraft, NominationRevisionRequest, ProcessingStage } from '../../types';
import { apiRequest } from './client';
import { uploadFile } from './fileUpload';
import { resolveProjectUrl } from '../mysqlService';
import { normalizeApplication, normalizeAuditLog, normalizeAward, normalizeDocument } from './normalizers';
import { loadApplications, loadAuditLogs, loadNotifications, state } from './state';

type SubmitNominationPayload = {
  submission_id: string;
  award_id: string;
  nominee_id?: string;
  nominee_name: string;
  employee_id?: string;
  position_title: string;
  office_id: string;
  office_name: string;
  division_section?: string;
  employment_category: Application['employment_category'];
  contact_number: string;
  email: string;
  barangay?: string;
  nomination_type: 'Individual' | 'Group / Team';
  nominator_id?: string;
  nominator_name: string;
  nominator_position: string;
  nominating_office: string;
  nominating_office_id: string;
  self_nomination: boolean;
  justification: string;
  accomplishments: string;
  supporting_narrative: string;
  documents?: Array<{
    requirement_id?: string;
    document_name: string;
    file_url: string;
    file_size?: number;
    file_type?: string;
    status?: string;
  }>;
};

export function getStageFromStatus(status: ApplicationStatus): ProcessingStage {
  switch (status) {
    case 'Draft':
    case 'Submitted':
      return 'Submitted';
    case 'For Endorsement':
    case 'Returned for Revision':
      return 'Endorsement';
    case 'For Verification':
    case 'Incomplete':
    case 'Verified':
      return 'Document Verification';
    case 'For Evaluation':
    case 'Under Evaluation':
    case 'Evaluation Completed':
      return 'Evaluation';
    case 'For Deliberation':
      return 'Deliberation';
    case 'Approved':
    case 'Not Approved':
      return 'Final Decision';
    case 'Awarded':
      return 'Awarded';
    default:
      return 'Submitted';
  }
}

type NominationSignature = {
  strokes: number[][][];
  signed_at: string;
  sha256: string;
  signed_snapshot: Application & { signing_account?: { id: string; name: string; role: string } };
  version_number?: number;
  documents?: Array<Pick<ApplicationDocument, 'id' | 'document_name' | 'file_url' | 'file_size' | 'file_type'> & { sha256?: string; matches_official?: boolean }>;
};

function normalizeRevisionDraft(draft: NominationRevisionDraft): NominationRevisionDraft {
  return {
    ...draft,
    attachments: Object.fromEntries(Object.entries(draft.attachments).map(([id, document]) => [id, document && normalizeDocument(document)])),
  };
}

export const applicationsApi = {
  async getNominationRevisionAward(awardId: string): Promise<Award> {
    return normalizeAward(await apiRequest(`awards.php?id=${encodeURIComponent(awardId)}`));
  },
  async getNominationForm(appId: string, version?: number): Promise<{ application: Application; history: ApplicationHistory[] }> {
    const result = await apiRequest<{ application: unknown; history: unknown[] }>(`applications.php?action=form&id=${encodeURIComponent(appId)}${version ? `&version=${version}` : ''}`);
    return { application: normalizeApplication(result.application), history: result.history.map(normalizeAuditLog) };
  },
  async getNominationSignature(appId: string, version?: number): Promise<NominationSignature> {
    const signature = await apiRequest<NominationSignature>(`applications.php?action=signature&id=${encodeURIComponent(appId)}${version ? `&version=${version}` : ''}`);
    return { ...signature, documents: signature.documents?.map(document => ({ ...document, file_url: document.file_url ? resolveProjectUrl(document.file_url) : '' })) };
  },
  async getNominationRevisionHistory(appId: string): Promise<{
    requests: NominationRevisionRequest[];
    versions: number[];
    archived_attachments: Array<{ id: string; sha256?: string; archived_at: string; document: ApplicationDocument }>;
  }> {
    const history = await apiRequest<{
      requests: NominationRevisionRequest[];
      versions: number[];
      archived_attachments: Array<{ id: string; sha256?: string; archived_at: string; document: ApplicationDocument }>;
    }>(`applications.php?action=revision_history&id=${encodeURIComponent(appId)}`);
    return { ...history, archived_attachments: history.archived_attachments.map(file => ({
      ...file, document: { ...file.document, file_url: file.document.file_url ? resolveProjectUrl(file.document.file_url) : '' },
    })) };
  },
  async nominationRevision(appId: string, action: string, payload: object): Promise<{ application: Application; draft: NominationRevisionDraft | null }> {
    const result = await apiRequest<{ application: unknown; draft: NominationRevisionDraft | null }>(
      `applications.php?action=${action}&id=${encodeURIComponent(appId)}`, { method: 'PUT', body: JSON.stringify(payload) },
    );
    return { application: normalizeApplication(result.application), draft: result.draft && normalizeRevisionDraft(result.draft) };
  },
  async stageNominationRevisionFile(appId: string, draft: NominationRevisionDraft, requirementId: string, file: File): Promise<NominationRevisionDraft> {
    const result = await uploadFile<NominationRevisionDraft>('documents.php', 'file', file, {
      application_id: appId, revision_id: draft.request.id, generation: String(draft.generation),
      requirement_id: requirementId, document_name: file.name,
    });
    return normalizeRevisionDraft(result);
  },
  async beginDeliberation(appId: string): Promise<Application> {
    const application = normalizeApplication(await apiRequest<any>(`applications.php?action=begin_deliberation&id=${encodeURIComponent(appId)}`, {
      method: 'PUT', body: JSON.stringify({}),
    }));
    await loadApplications();
    await loadAuditLogs();
    return application;
  },
  getApplications(): Application[] {
    return [...state.cachedApplications];
  },

  getApplicationById(id: string): Application | undefined {
    return state.cachedApplications.find(application => application.id === id);
  },

  async submitNomination(data: SubmitNominationPayload): Promise<Application> {
    const { nominator_id: _nominatorId, nominating_office: _nominatingOffice, office_name: _officeName, ...payload } = data;
    const application = normalizeApplication(await apiRequest<any>('applications.php', {
      method: 'POST',
      body: JSON.stringify(payload),
    }));
    try {
      await loadApplications();
      await loadAuditLogs();
      if (state.currentUser) {
        await loadNotifications(state.currentUser);
      }
    } catch (error) {
      console.warn('Nomination saved, but the application lists could not be refreshed.', error);
    }
    return application;
  },

  async finalizeNomination(appId: string, expectedRequirementIds: string[], signatureStrokes: number[][][], signatureConfirmed: boolean): Promise<Application> {
    const application = normalizeApplication(await apiRequest<any>(`applications.php?action=finalize_submission&id=${encodeURIComponent(appId)}`, {
      method: 'PUT',
      body: JSON.stringify({ expected_requirement_ids: expectedRequirementIds, signature_strokes: signatureStrokes, signature_confirmed: signatureConfirmed }),
    }));
    try {
      await loadApplications();
      await loadAuditLogs();
    } catch (error) {
      console.warn('Nomination submitted, but the application lists could not be refreshed.', error);
    }
    return application;
  },

  async deleteNomination(id: string): Promise<void> {
    await apiRequest('applications.php', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
    await loadApplications();
    await loadAuditLogs();
    if (state.currentUser) {
      await loadNotifications(state.currentUser);
    }
  },

  async endorseApplication(appId: string, remarks: string, decision: 'Endorsed' | 'Returned for Revision' | 'Rejected' = 'Endorsed'): Promise<Application> {
    const application = normalizeApplication(await apiRequest<any>(`applications.php?action=endorse&id=${encodeURIComponent(appId)}`, {
      method: 'PUT',
      body: JSON.stringify({
        decision,
        remarks,
      }),
    }));
    await loadApplications();
    await loadAuditLogs();
    return application;
  },

  async verifyDocument(appId: string, docId: string, status: 'Verified' | 'Rejected', remarks: string): Promise<Application> {
    const application = normalizeApplication(await apiRequest<any>(`applications.php?action=verify_document&id=${encodeURIComponent(appId)}`, {
      method: 'PUT',
      body: JSON.stringify({
        document_id: docId,
        status,
        remarks,
      }),
    }));
    await loadApplications();
    await loadAuditLogs();
    return application;
  },

  async inspectDocumentForEndorsement(
    appId: string,
    docId: string,
    status: 'Head Approved' | 'Head Rejected',
    remarks: string
  ): Promise<Application> {
    const application = normalizeApplication(await apiRequest<any>(`applications.php?action=inspect_document&id=${encodeURIComponent(appId)}`, {
      method: 'PUT',
      body: JSON.stringify({ document_id: docId, status, remarks }),
    }));
    await loadApplications();
    await loadAuditLogs();
    return application;
  },

  async assignEvaluators(appId: string, remarks?: string): Promise<Application> {
    const application = normalizeApplication(await apiRequest<any>(`applications.php?action=assign_evaluators&id=${encodeURIComponent(appId)}`, {
      method: 'PUT',
      body: JSON.stringify({
        remarks: remarks || '',
      }),
    }));
    await loadApplications();
    await loadAuditLogs();
    return application;
  },

  async reassignEvaluator(appId: string, oldEvaluatorId: string, newEvaluatorId: string): Promise<Application> {
    const application = normalizeApplication(await apiRequest<any>(`applications.php?action=reassign_evaluator&id=${encodeURIComponent(appId)}`, {
      method: 'PUT',
      body: JSON.stringify({ old_evaluator_id: oldEvaluatorId, new_evaluator_id: newEvaluatorId }),
    }));
    try {
      await loadApplications();
      await loadAuditLogs();
    } catch (error) {
      console.warn('Evaluator was reassigned, but application lists could not be refreshed.', error);
    }
    return application;
  },

  async recordDeliberation(appId: string, decision: 'Approved' | 'Not Approved', remarks: string, awardNow = false): Promise<Application> {
    const application = normalizeApplication(await apiRequest<any>(`applications.php?action=deliberation&id=${encodeURIComponent(appId)}`, {
      method: 'PUT',
      body: JSON.stringify({
        decision,
        remarks,
        award_now: awardNow,
      }),
    }));
    await loadApplications();
    await loadAuditLogs();
    if (state.currentUser) {
      await loadNotifications(state.currentUser);
    }
    return application;
  },

  async approveApplication(appId: string, remarks?: string): Promise<Application> {
    return this.recordDeliberation(appId, 'Approved', remarks || 'Approved by the PRAISE Committee based on the consolidated evaluation results.', false);
  },

  async disapproveApplication(appId: string, remarks: string): Promise<Application> {
    return this.recordDeliberation(appId, 'Not Approved', remarks, false);
  },

  async conferAward(appId: string, remarks?: string): Promise<Application> {
    return this.recordDeliberation(appId, 'Approved', remarks || 'Award conferred by the PRAISE Committee.', true);
  },

  async returnApplicationForRevision(appId: string, remarks: string): Promise<Application> {
    const application = normalizeApplication(await apiRequest<any>(`applications.php?action=return_for_revision&id=${encodeURIComponent(appId)}`, {
      method: 'PUT',
      body: JSON.stringify({ remarks }),
    }));
    await loadApplications();
    await loadAuditLogs();
    return application;
  },

  async resubmitApplication(appId: string, remarks: string): Promise<Application> {
    const application = normalizeApplication(await apiRequest<any>(`applications.php?action=resubmit&id=${encodeURIComponent(appId)}`, {
      method: 'PUT',
      body: JSON.stringify({ remarks }),
    }));
    await loadApplications();
    await loadAuditLogs();
    if (state.currentUser) {
      await loadNotifications(state.currentUser);
    }
    return application;
  },

  async markApplicationVerified(appId: string, remarks?: string): Promise<Application> {
    const application = normalizeApplication(await apiRequest<any>(`applications.php?action=mark_verified&id=${encodeURIComponent(appId)}`, {
      method: 'PUT',
      body: JSON.stringify({ remarks }),
    }));
    await loadApplications();
    await loadAuditLogs();
    return application;
  },

  async routeToEvaluators(appId: string, remarks?: string): Promise<Application> {
    return this.assignEvaluators(appId, remarks);
  },
};
