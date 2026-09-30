import { Application, ApplicationStatus, ProcessingStage } from '../../types';
import { apiRequest } from './client';
import { normalizeApplication } from './normalizers';
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

export const applicationsApi = {
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
    const { nominator_id: _nominatorId, nominator_name: _nominatorName, nominator_position: _nominatorPosition, nominating_office: _nominatingOffice, office_name: _officeName, ...payload } = data;
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

  async finalizeNomination(appId: string, expectedRequirementIds: string[]): Promise<Application> {
    const application = normalizeApplication(await apiRequest<any>(`applications.php?action=finalize_submission&id=${encodeURIComponent(appId)}`, {
      method: 'PUT',
      body: JSON.stringify({ expected_requirement_ids: expectedRequirementIds }),
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
