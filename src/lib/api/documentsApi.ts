import { ApplicationDocument } from '../../types';
import { apiRequest } from './client';
import { normalizeDocument } from './normalizers';
import { loadApplications, loadAuditLogs, loadNotifications, state } from './state';

export const documentsApi = {
  async uploadApplicationDocument(applicationId: string, file: File, documentName: string, requirementId?: string, documentId?: string, refreshAfterUpload = true): Promise<ApplicationDocument> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('application_id', applicationId);
    formData.append('document_name', documentName);
    if (requirementId) {
      formData.append('requirement_id', requirementId);
    }
    if (documentId) {
      formData.append('document_id', documentId);
    }

    const document = normalizeDocument(await apiRequest<any>('documents.php', {
      method: 'POST',
      body: formData,
    }));

    if (refreshAfterUpload) {
      try {
        await loadApplications();
        await loadAuditLogs();
        if (state.currentUser) {
          await loadNotifications(state.currentUser);
        }
      } catch (error) {
        console.warn('Document saved, but the application lists could not be refreshed.', error);
      }
    }

    return document;
  },

  async uploadComplianceDoc(appId: string, reqId: string, docName: string, file: File): Promise<ApplicationDocument> {
    return this.uploadApplicationDocument(appId, file, docName, reqId);
  },

  async reuploadDocument(appId: string, docId: string, file: File, fileName?: string): Promise<ApplicationDocument> {
    return this.uploadApplicationDocument(appId, file, fileName || file.name, undefined, docId);
  },
};
