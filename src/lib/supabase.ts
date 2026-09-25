import {
  Application,
  ApplicationDocument,
  ApplicationHistory,
  ApplicationStatus,
  Award,
  CertificateTemplateSettings,
  Evaluation,
  EvaluationCriterionScore,
  InAppNotification,
  Office,
  ProcessingStage,
  UserProfile,
  UserRole,
} from '../types';
import {
  DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS,
  normalizeCertificateTemplateSettings,
} from './certificateTemplate';
import { getAppBasePath, getDefaultXamppApiUrl, resolveProjectUrl } from './mysqlService';

export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
export const isSupabaseConfigured = false;
export const supabase = null;
export const SUPABASE_SQL_SCHEMA = '-- Supabase integration is not enabled for this deployment.';

type ApiEnvelope<T> = {
  status: 'success' | 'error';
  message: string;
  data: T;
  timestamp: string;
};

type DashboardSnapshot = {
  currentUser: UserProfile;
  users: UserProfile[];
  applications: Application[];
  awards: Award[];
  offices: Office[];
  auditLogs: ApplicationHistory[];
  notifications: InAppNotification[];
  certificateTemplateSettings: CertificateTemplateSettings;
};

type CreateUserPayload = Omit<UserProfile, 'id' | 'created_at'> & {
  password: string;
  is_active?: boolean;
  must_change_password?: boolean;
};

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

const API_BASE = getDefaultXamppApiUrl().replace(/\/$/, '');

let cachedUsers: UserProfile[] = [];
let cachedAwards: Award[] = [];
let cachedOffices: Office[] = [];
let cachedApplications: Application[] = [];
let cachedAuditLogs: ApplicationHistory[] = [];
let cachedNotifications: InAppNotification[] = [];
let cachedCertificateTemplateSettings: CertificateTemplateSettings = DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS;
let currentUser: UserProfile | null = null;

function clearCaches() {
  cachedUsers = [];
  cachedAwards = [];
  cachedOffices = [];
  cachedApplications = [];
  cachedAuditLogs = [];
  cachedNotifications = [];
  cachedCertificateTemplateSettings = DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS;
  currentUser = null;
}

async function apiRequest<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}/${endpoint}`, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers || {}),
    },
    ...init,
  });

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    if (response.status === 204) {
      return undefined as T;
    }
    throw new Error(`Unexpected API response from ${endpoint}.`);
  }

  if (!response.ok || payload.status === 'error') {
    if (response.status === 401) {
      clearCaches();
    }
    throw new Error(payload.message || `Request failed for ${endpoint}.`);
  }

  return payload.data;
}

function normalizeUser(user: any): UserProfile {
  return {
    id: String(user.id),
    email: String(user.email),
    full_name: String(user.full_name),
    role: user.role as UserRole,
    office_id: user.office_id || undefined,
    office_name: user.office_name || undefined,
    position_title: user.position_title || undefined,
    employee_id: user.employee_id || undefined,
    contact_number: user.contact_number || undefined,
    barangay: user.barangay || undefined,
    created_at: user.created_at || undefined,
    is_active: user.is_active === undefined ? true : Boolean(user.is_active),
  };
}

function normalizeOffice(office: any): Office {
  return {
    id: String(office.id),
    name: String(office.name),
    code: String(office.code),
    head_name: String(office.head_name),
    head_title: String(office.head_title),
    is_active: Boolean(office.is_active),
  };
}

function normalizeCriterion(score: any): EvaluationCriterionScore {
  return {
    id: String(score.id),
    evaluation_id: String(score.evaluation_id),
    criterion_id: String(score.criterion_id),
    criterion_name: String(score.criterion_name),
    weight_percentage: Number(score.weight_percentage || 0),
    max_score: Number(score.max_score || 100),
    score: Number(score.score || 0),
    remarks: score.remarks || '',
  };
}

function normalizeEvaluation(evaluation: any): Evaluation {
  const normalizedScores = Array.isArray(evaluation.scores) ? evaluation.scores.map(normalizeCriterion) : [];
  const normalized: Evaluation = {
    id: String(evaluation.id),
    application_id: String(evaluation.application_id),
    evaluator_id: String(evaluation.evaluator_id),
    evaluator_name: String(evaluation.evaluator_name),
    evaluator_office: evaluation.evaluator_office || undefined,
    total_raw_score: Number(evaluation.total_raw_score || 0),
    weighted_percentage: Number(evaluation.weighted_percentage || evaluation.total_score || 0),
    total_score: Number(evaluation.total_score || evaluation.weighted_percentage || 0),
    general_remarks: evaluation.general_remarks || '',
    is_submitted: Boolean(evaluation.is_submitted),
    submitted_at: evaluation.submitted_at || undefined,
    reopened_at: evaluation.reopened_at || undefined,
    reopened_by: evaluation.reopened_by || undefined,
    scores: normalizedScores,
  };

  normalizedScores.forEach((score, index) => {
    (normalized.scores[index] as any).raw_score = score.score;
    (normalized.scores[index] as any).evaluator_remarks = score.remarks || '';
    (normalized.scores[index] as any).weighted_score = Number((evaluation.scores?.[index]?.weighted_score ?? 0));
  });

  return normalized;
}

function normalizeDocument(document: any): ApplicationDocument {
  return {
    id: String(document.id),
    application_id: String(document.application_id),
    requirement_id: document.requirement_id || undefined,
    document_name: String(document.document_name),
    file_url: resolveProjectUrl(String(document.file_url || '')),
    file_size: document.file_size !== null && document.file_size !== undefined ? Number(document.file_size) : undefined,
    file_type: document.file_type || undefined,
    status: document.status,
    verification_remarks: document.verification_remarks || undefined,
    verified_by: document.verified_by || undefined,
    verified_at: document.verified_at || undefined,
    uploaded_at: document.uploaded_at || new Date().toISOString(),
  };
}

function normalizeAward(award: any): Award {
  return {
    id: String(award.id),
    name: String(award.name),
    code: String(award.code),
    description: award.description || '',
    remarks: award.remarks || '',
    award_year: Number(award.award_year || new Date().getFullYear()),
    min_qualifying_score: Number(award.min_qualifying_score ?? 85),
    is_on_the_spot: Boolean(award.is_on_the_spot),
    is_active: Boolean(award.is_active),
    criteria: Array.isArray(award.criteria)
      ? award.criteria.map((criterion: any) => ({
          id: String(criterion.id),
          award_id: String(criterion.award_id),
          criterion_name: String(criterion.criterion_name),
          criterion_description: criterion.criterion_description || '',
          weight_percentage: Number(criterion.weight_percentage || 0),
          max_score: Number(criterion.max_score || 100),
        }))
      : [],
    document_requirements: Array.isArray(award.document_requirements)
      ? award.document_requirements.map((document: any) => ({
          id: String(document.id),
          award_id: String(document.award_id),
          document_name: String(document.document_name),
          description: document.description || '',
          is_mandatory: Boolean(document.is_mandatory),
        }))
      : [],
    eligibility_requirements: Array.isArray(award.eligibility_requirements)
      ? award.eligibility_requirements.map((requirement: any) => ({
          id: String(requirement.id),
          award_id: String(requirement.award_id),
          requirement_description: String(requirement.requirement_description),
          is_mandatory: Boolean(requirement.is_mandatory),
          order_index: Number(requirement.order_index || 1),
        }))
      : [],
  };
}

function normalizeApplication(application: any): Application {
  const normalized: Application = {
    id: String(application.id),
    application_number: String(application.application_number),
    award_id: String(application.award_id),
    award_name: application.award_name || undefined,
    award_year: Number(application.award_year || new Date().getFullYear()),
    nominee_id: application.nominee_id || undefined,
    nominee_name: String(application.nominee_name),
    employee_id: application.employee_id || undefined,
    position_title: String(application.position_title),
    office_id: String(application.office_id),
    office_name: String(application.office_name),
    division_section: application.division_section || undefined,
    employment_category: application.employment_category,
    contact_number: String(application.contact_number || ''),
    email: String(application.email || ''),
    barangay: application.barangay || undefined,
    nomination_type: application.nomination_type,
    nominator_id: String(application.nominator_id || ''),
    nominator_name: String(application.nominator_name || ''),
    nominator_position: String(application.nominator_position || ''),
    nominating_office: String(application.nominating_office || ''),
    justification: String(application.justification || ''),
    accomplishments: String(application.accomplishments || ''),
    supporting_narrative: String(application.supporting_narrative || ''),
    date_of_nomination: String(application.date_of_nomination || ''),
    status: application.status as ApplicationStatus,
    processing_stage: (application.processing_stage || application.stage || 'Submitted') as ProcessingStage,
    required_action: application.required_action || undefined,
    remarks: application.remarks || undefined,
    final_weighted_score: application.final_weighted_score !== null && application.final_weighted_score !== undefined
      ? Number(application.final_weighted_score)
      : undefined,
    deliberation_remarks: application.deliberation_remarks || undefined,
    deliberation_decision: application.deliberation_decision || undefined,
    deliberation_date: application.deliberation_date || undefined,
    award_date: application.award_date || undefined,
    created_at: application.created_at || new Date().toISOString(),
    updated_at: application.updated_at || new Date().toISOString(),
    documents: Array.isArray(application.documents) ? application.documents.map(normalizeDocument) : [],
    evaluations: Array.isArray(application.evaluations) ? application.evaluations.map(normalizeEvaluation) : [],
    assigned_evaluators: Array.isArray(application.assigned_evaluators) ? application.assigned_evaluators.map(String) : [],
    endorsement: application.endorsement
      ? {
          id: String(application.endorsement.id),
          application_id: String(application.endorsement.application_id),
          endorsed_by: String(application.endorsement.endorsed_by),
          endorser_title: String(application.endorsement.endorser_title),
          decision: application.endorsement.decision,
          remarks: String(application.endorsement.remarks),
          created_at: String(application.endorsement.created_at),
        }
      : undefined,
  };

  (normalized as any).stage = normalized.processing_stage;
  return normalized;
}

function normalizeAuditLog(log: any): ApplicationHistory {
  return {
    id: String(log.id),
    application_id: String(log.application_id),
    user_id: String(log.user_id || ''),
    user_name: String(log.user_name || 'System'),
    user_role: log.user_role as UserRole,
    action: String(log.action || ''),
    previous_status: log.previous_status || undefined,
    new_status: log.new_status as ApplicationStatus,
    remarks: log.remarks || undefined,
    created_at: String(log.created_at || new Date().toISOString()),
  };
}

function normalizeNotification(notification: any): InAppNotification {
  return {
    id: String(notification.id),
    user_id: notification.user_id || undefined,
    target_role: notification.target_role || undefined,
    application_id: notification.application_id || undefined,
    application_number: notification.application_number || undefined,
    title: String(notification.title || ''),
    message: String(notification.message || ''),
    is_read: Boolean(notification.is_read),
    created_at: String(notification.created_at || new Date().toISOString()),
    link_tab: notification.link_tab || undefined,
  };
}

function normalizeCertificateBackgroundUrl(pathOrUrl?: string | null): string {
  const normalized = String(pathOrUrl || '').trim();
  return normalized ? resolveProjectUrl(normalized) : '';
}

function stripProjectBasePath(pathname: string): string {
  const normalizedPathname = pathname.replace(/\/{2,}/g, '/');
  const basePath = getAppBasePath();

  if (basePath && normalizedPathname === basePath) {
    return '';
  }

  if (basePath && normalizedPathname.startsWith(`${basePath}/`)) {
    return normalizedPathname.slice(basePath.length + 1);
  }

  return normalizedPathname.replace(/^\/+/, '');
}

function toProjectRelativePath(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();

  if (!trimmed || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsedUrl = new URL(trimmed);
      if (typeof window !== 'undefined' && parsedUrl.origin === window.location.origin) {
        return stripProjectBasePath(parsedUrl.pathname);
      }
    } catch {
      return trimmed;
    }
  }

  if (trimmed.startsWith('/')) {
    return stripProjectBasePath(trimmed);
  }

  return trimmed.replace(/^\/+/, '');
}

function normalizeStoredCertificateTemplateSettings(settings: any): CertificateTemplateSettings {
  const normalized = normalizeCertificateTemplateSettings(settings);
  return {
    ...normalized,
    background_image_url: normalizeCertificateBackgroundUrl(normalized.background_image_url),
  };
}

async function fetchCurrentSessionUser(): Promise<UserProfile | null> {
  const user = await apiRequest<any | null>('auth.php?action=current');
  currentUser = user ? normalizeUser(user) : null;
  return currentUser;
}

async function loadUsers(): Promise<UserProfile[]> {
  const users = await apiRequest<any[]>('auth.php');
  cachedUsers = users.map(normalizeUser);
  return cachedUsers;
}

async function loadApplications(): Promise<Application[]> {
  const applications = await apiRequest<any[]>('applications.php');
  cachedApplications = applications.map(normalizeApplication);
  return cachedApplications;
}

async function loadAwards(): Promise<Award[]> {
  const awards = await apiRequest<any[]>('awards.php');
  cachedAwards = awards.map(normalizeAward);
  return cachedAwards;
}

async function loadOffices(): Promise<Office[]> {
  const offices = await apiRequest<any[]>('offices.php');
  cachedOffices = offices.map(normalizeOffice);
  return cachedOffices;
}

async function loadAuditLogs(user?: UserProfile | null, applications?: Application[]): Promise<ApplicationHistory[]> {
  const activeUser = user || currentUser;

  if (activeUser?.role === 'NOMINEE' || activeUser?.role === 'HEAD_OF_OFFICE') {
    const relatedApplications = (applications || cachedApplications).filter(application =>
      application.nominee_id === activeUser.id ||
      application.nominator_id === activeUser.id ||
      (activeUser.role === 'HEAD_OF_OFFICE'
        && Boolean(activeUser.office_id)
        && application.office_id === activeUser.office_id)
    );

    const logGroups = await Promise.all(
      relatedApplications.map(application =>
        apiRequest<any[]>(`audit_logs.php?application_id=${encodeURIComponent(application.id)}`)
      )
    );

    const uniqueLogs = new Map<string, ApplicationHistory>();
    logGroups.flat().map(normalizeAuditLog).forEach(log => {
      uniqueLogs.set(log.id, log);
    });

    cachedAuditLogs = Array.from(uniqueLogs.values()).sort((left, right) =>
      right.created_at.localeCompare(left.created_at)
    );
    return cachedAuditLogs;
  }

  const logs = await apiRequest<any[]>('audit_logs.php');
  cachedAuditLogs = logs.map(normalizeAuditLog);
  return cachedAuditLogs;
}

async function loadNotifications(user?: UserProfile | null): Promise<InAppNotification[]> {
  const activeUser = user || currentUser;
  if (!activeUser) {
    cachedNotifications = [];
    return [];
  }

  const params = new URLSearchParams({
    user_id: activeUser.id,
    role: activeUser.role,
  });
  const notifications = await apiRequest<any[]>(`notifications.php?${params.toString()}`);
  cachedNotifications = notifications.map(normalizeNotification);
  return cachedNotifications;
}

async function loadCertificateTemplateSettings(): Promise<CertificateTemplateSettings> {
  const settings = await apiRequest<any>('report_settings.php');
  cachedCertificateTemplateSettings = normalizeStoredCertificateTemplateSettings(settings);
  return cachedCertificateTemplateSettings;
}

function sortedUsers(users: UserProfile[]) {
  return [...users].sort((left, right) => left.full_name.localeCompare(right.full_name));
}

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

export const praiseService = {
  async bootstrap(): Promise<DashboardSnapshot | null> {
    const sessionUser = await fetchCurrentSessionUser();
    if (!sessionUser) {
      return null;
    }

    const [users, applications, awards, offices, certificateTemplateSettings] = await Promise.all([
      loadUsers(),
      loadApplications(),
      loadAwards(),
      loadOffices(),
      loadCertificateTemplateSettings(),
    ]);

    const [auditLogs, notifications] = await Promise.all([
      loadAuditLogs(sessionUser, applications),
      loadNotifications(sessionUser),
    ]);

    currentUser = users.find(user => user.id === sessionUser.id) || sessionUser;

    return {
      currentUser,
      users,
      applications,
      awards,
      offices,
      auditLogs,
      notifications,
      certificateTemplateSettings,
    };
  },

  async refresh(): Promise<DashboardSnapshot | null> {
    return this.bootstrap();
  },

  async login(email: string, password: string): Promise<UserProfile> {
    const user = normalizeUser(await apiRequest<any>('auth.php?action=login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }));
    currentUser = user;
    return user;
  },

  async registerNominee(fullName: string, email: string, password: string): Promise<UserProfile> {
    const user = normalizeUser(await apiRequest<any>('auth.php?action=register_nominee', {
      method: 'POST',
      body: JSON.stringify({ full_name: fullName, email, password }),
    }));
    currentUser = user;
    return user;
  },

  async logout(): Promise<void> {
    await apiRequest('auth.php?action=logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    clearCaches();
  },

  async getSessionUser(): Promise<UserProfile | null> {
    return fetchCurrentSessionUser();
  },

  getCurrentUser(): UserProfile | null {
    return currentUser;
  },

  getAllUsers(): UserProfile[] {
    return sortedUsers(cachedUsers);
  },

  getUsers(): UserProfile[] {
    return sortedUsers(cachedUsers);
  },

  async createUser(user: CreateUserPayload): Promise<UserProfile> {
    const createdUser = normalizeUser(await apiRequest<any>('auth.php', {
      method: 'POST',
      body: JSON.stringify(user),
    }));
    await loadUsers();
    return createdUser;
  },

  async updateUserRole(userId: string, newRole: UserRole, officeId?: string, officeName?: string, password?: string): Promise<UserProfile> {
    const updatedUser = normalizeUser(await apiRequest<any>('auth.php', {
      method: 'PUT',
      body: JSON.stringify({
        id: userId,
        role: newRole,
        office_id: officeId || null,
        office_name: officeName || null,
        password: password || undefined,
      }),
    }));
    await loadUsers();
    if (currentUser?.id === userId) {
      currentUser = updatedUser;
    }
    return updatedUser;
  },

  async deleteUser(userId: string): Promise<void> {
    await apiRequest('auth.php', {
      method: 'DELETE',
      body: JSON.stringify({ id: userId }),
    });
    await loadUsers();
  },

  getOffices(): Office[] {
    return [...cachedOffices];
  },

  async createOffice(office: Omit<Office, 'id'>): Promise<Office> {
    const createdOffice = normalizeOffice(await apiRequest<any>('offices.php', {
      method: 'POST',
      body: JSON.stringify(office),
    }));
    await loadOffices();
    return createdOffice;
  },

  async updateOffice(id: string, office: Omit<Office, 'id'>): Promise<Office> {
    const updatedOffice = normalizeOffice(await apiRequest<any>('offices.php', {
      method: 'PUT',
      body: JSON.stringify({ id, ...office }),
    }));
    await loadOffices();
    await loadUsers();
    await loadApplications();
    return updatedOffice;
  },

  async deleteOffice(id: string): Promise<void> {
    await apiRequest('offices.php', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
    await loadOffices();
  },

  getAwards(): Award[] {
    return [...cachedAwards];
  },

  getAwardById(id: string): Award | undefined {
    return cachedAwards.find(award => award.id === id);
  },

  async createAward(award: Omit<Award, 'id'>): Promise<Award> {
    const createdAward = normalizeAward(await apiRequest<any>('awards.php', {
      method: 'POST',
      body: JSON.stringify(award),
    }));
    await loadAwards();
    return createdAward;
  },

  async updateAward(id: string, updates: Partial<Award>): Promise<Award> {
    const updatedAward = normalizeAward(await apiRequest<any>('awards.php', {
      method: 'PUT',
      body: JSON.stringify({ id, ...updates }),
    }));
    await loadAwards();
    return updatedAward;
  },

  async deleteAward(id: string): Promise<void> {
    await apiRequest('awards.php', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
    await loadAwards();
  },

  getApplications(): Application[] {
    return [...cachedApplications];
  },

  getApplicationById(id: string): Application | undefined {
    return cachedApplications.find(application => application.id === id);
  },

  async submitNomination(data: SubmitNominationPayload): Promise<Application> {
    const application = normalizeApplication(await apiRequest<any>('applications.php', {
      method: 'POST',
      body: JSON.stringify(data),
    }));
    try {
      await loadApplications();
      await loadAuditLogs();
      if (currentUser) {
        await loadNotifications(currentUser);
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
    if (currentUser) {
      await loadNotifications(currentUser);
    }
  },

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
        if (currentUser) {
          await loadNotifications(currentUser);
        }
      } catch (error) {
        console.warn('Document saved, but the application lists could not be refreshed.', error);
      }
    }

    return document;
  },

  async endorseApplication(appId: string, remarks: string, decision: 'Endorsed' | 'Returned for Revision' | 'Rejected' = 'Endorsed'): Promise<Application> {
    const application = normalizeApplication(await apiRequest<any>(`applications.php?action=endorse&id=${encodeURIComponent(appId)}`, {
      method: 'PUT',
      body: JSON.stringify({
        decision,
        remarks,
        endorser_name: currentUser?.full_name,
        endorser_title: currentUser?.position_title,
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
        verified_by: currentUser?.full_name,
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

  async submitEvaluation(payload: {
    application_id: string;
    evaluator_id?: string;
    evaluator_name?: string;
    evaluator_position?: string;
    scores: Array<{
      criterion_id: string;
      criterion_name?: string;
      weight_percentage?: number;
      max_score?: number;
      raw_score?: number;
      score?: number;
      weighted_score?: number;
      remarks?: string;
      evaluator_remarks?: string;
    }>;
    general_remarks: string;
  }): Promise<void> {
    await apiRequest('evaluations.php', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        evaluator_id: payload.evaluator_id || currentUser?.id,
        evaluator_name: payload.evaluator_name || currentUser?.full_name,
        evaluator_office: currentUser?.office_name,
      }),
    });
    await loadApplications();
    await loadAuditLogs();
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
    if (currentUser) {
      await loadNotifications(currentUser);
    }
    return application;
  },

  async uploadComplianceDoc(appId: string, reqId: string, docName: string, file: File): Promise<ApplicationDocument> {
    return this.uploadApplicationDocument(appId, file, docName, reqId);
  },

  getAuditLogs(): ApplicationHistory[] {
    return [...cachedAuditLogs];
  },

  getAllAuditLogs(): ApplicationHistory[] {
    return [...cachedAuditLogs];
  },

  getAuditLogsForApplication(appId: string): ApplicationHistory[] {
    return cachedAuditLogs.filter(log => log.application_id === appId);
  },

  getNotifications(): InAppNotification[] {
    return [...cachedNotifications];
  },

  getCertificateTemplateSettings(): CertificateTemplateSettings {
    return { ...cachedCertificateTemplateSettings };
  },

  async updateCertificateTemplateSettings(
    settings: Omit<CertificateTemplateSettings, 'updated_at'>
  ): Promise<CertificateTemplateSettings> {
    const payload = {
      ...settings,
      background_image_url: toProjectRelativePath(settings.background_image_url || ''),
    };

    const updatedSettings = normalizeStoredCertificateTemplateSettings(await apiRequest<any>('report_settings.php', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }));
    cachedCertificateTemplateSettings = updatedSettings;
    return updatedSettings;
  },

  async uploadCertificateTemplateBackground(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('background_image', file);

    const payload = await apiRequest<any>('report_settings.php', {
      method: 'POST',
      body: formData,
    });

    return normalizeCertificateBackgroundUrl(payload?.background_image_url);
  },

  async getNotificationsForUser(userId: string, role: UserRole): Promise<InAppNotification[]> {
    const notifications = await apiRequest<any[]>(`notifications.php?${new URLSearchParams({ user_id: userId, role }).toString()}`);
    cachedNotifications = notifications.map(normalizeNotification);
    return cachedNotifications;
  },

  async markNotificationAsRead(id: string): Promise<void> {
    await apiRequest('notifications.php', {
      method: 'PUT',
      body: JSON.stringify({ id }),
    });
    if (currentUser) {
      await loadNotifications(currentUser);
    }
  },

  async markNotificationRead(id: string): Promise<void> {
    await this.markNotificationAsRead(id);
  },

  async markAllNotificationsAsRead(): Promise<void> {
    await apiRequest('notifications.php', {
      method: 'PUT',
      body: JSON.stringify({ mark_all_read: true }),
    });
    if (currentUser) {
      await loadNotifications(currentUser);
    }
  },

  async markAllNotificationsRead(): Promise<void> {
    await this.markAllNotificationsAsRead();
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
    if (currentUser) {
      await loadNotifications(currentUser);
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

  async reuploadDocument(appId: string, docId: string, file: File, fileName?: string): Promise<ApplicationDocument> {
    return this.uploadApplicationDocument(appId, file, fileName || file.name, undefined, docId);
  },

  async resetToInitialData(): Promise<void> {
    throw new Error('Demo reset is disabled in deployment mode.');
  },
};
