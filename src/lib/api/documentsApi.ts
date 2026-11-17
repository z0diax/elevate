import { ApplicationDocument } from '../../types';
import { uploadFile } from './fileUpload';
import { normalizeDocument } from './normalizers';
import { loadApplications, loadAuditLogs, loadNotifications, state } from './state';

export const documentsApi = {
  async uploadApplicationDocument(applicationId: string, file: File, documentName: string, requirementId?: string, documentId?: string, refreshAfterUpload = true): Promise<ApplicationDocument> {
    const fields: Record<string, string> = { application_id: applicationId, document_name: documentName };
    if (requirementId) {
      fields.requirement_id = requirementId;
    }
    if (documentId) {
      fields.document_id = documentId;
    }

    const document = normalizeDocument(await uploadFile<any>('documents.php', 'file', file, fields));

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
