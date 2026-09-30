import {
  Application, ApplicationHistory, Award, CertificateTemplateSettings,
  InAppNotification, Office, UserProfile,
} from '../../types';
import { DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS } from '../certificateTemplate';
import { isAssignedEvaluator } from '../evaluatorAssignments';
import { apiRequest, clearCsrfToken, rememberCsrfToken, setUnauthorizedHandler } from './client';
import {
  normalizeApplication, normalizeAuditLog, normalizeAward,
  normalizeNotification, normalizeOffice, normalizeStoredCertificateTemplateSettings,
  normalizeUser,
} from './normalizers';

export const state = {
  cachedUsers: [] as UserProfile[],
  cachedAwards: [] as Award[],
  cachedOffices: [] as Office[],
  cachedApplications: [] as Application[],
  cachedAuditLogs: [] as ApplicationHistory[],
  cachedNotifications: [] as InAppNotification[],
  cachedCertificateTemplateSettings: DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS as CertificateTemplateSettings,
  currentUser: null as UserProfile | null,
};

export function clearCaches(): void {
  state.cachedUsers = [];
  state.cachedAwards = [];
  state.cachedOffices = [];
  state.cachedApplications = [];
  state.cachedAuditLogs = [];
  state.cachedNotifications = [];
  state.cachedCertificateTemplateSettings = DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS;
  state.currentUser = null;
  clearCsrfToken();
}
setUnauthorizedHandler(clearCaches);

export async function fetchCurrentSessionUser(): Promise<UserProfile | null> {
  const user = await apiRequest<any | null>('auth.php?action=current');
  rememberCsrfToken(user);
  state.currentUser = user ? normalizeUser(user) : null;
  return state.currentUser;
}

export async function loadUsers(): Promise<UserProfile[]> {
  const users = await apiRequest<any[]>('auth.php');
  state.cachedUsers = users.map(normalizeUser);
  return state.cachedUsers;
}

export async function loadApplications(): Promise<Application[]> {
  const applications = await apiRequest<any[]>('applications.php');
  state.cachedApplications = applications.map(normalizeApplication);
  return state.cachedApplications;
}

export async function loadAwards(): Promise<Award[]> {
  const awards = await apiRequest<any[]>('awards.php');
  state.cachedAwards = awards.map(normalizeAward);
  return state.cachedAwards;
}

export async function loadOffices(): Promise<Office[]> {
  const offices = await apiRequest<any[]>('offices.php');
  state.cachedOffices = offices.map(normalizeOffice);
  return state.cachedOffices;
}

export async function loadAuditLogs(user?: UserProfile | null, applications?: Application[]): Promise<ApplicationHistory[]> {
  const activeUser = user || state.currentUser;

  if (activeUser?.role === 'NOMINEE' || activeUser?.role === 'HEAD_OF_OFFICE' || activeUser?.role === 'EVALUATOR') {
    const relatedApplications = (applications || state.cachedApplications).filter(application =>
      application.nominee_id === activeUser.id ||
      (activeUser.role === 'EVALUATOR' && isAssignedEvaluator(application, activeUser.id)) ||
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

    state.cachedAuditLogs = Array.from(uniqueLogs.values()).sort((left, right) =>
      right.created_at.localeCompare(left.created_at)
    );
    return state.cachedAuditLogs;
  }

  const logs = await apiRequest<any[]>('audit_logs.php');
  state.cachedAuditLogs = logs.map(normalizeAuditLog);
  return state.cachedAuditLogs;
}

export async function loadNotifications(user?: UserProfile | null): Promise<InAppNotification[]> {
  const activeUser = user || state.currentUser;
  if (!activeUser) {
    state.cachedNotifications = [];
    return [];
  }

  const params = new URLSearchParams({
    user_id: activeUser.id,
    role: activeUser.role,
  });
  const notifications = await apiRequest<any[]>(`notifications.php?${params.toString()}`);
  state.cachedNotifications = notifications.map(normalizeNotification);
  return state.cachedNotifications;
}

export async function loadCertificateTemplateSettings(): Promise<CertificateTemplateSettings> {
  const settings = await apiRequest<any>('report_settings.php');
  state.cachedCertificateTemplateSettings = normalizeStoredCertificateTemplateSettings(settings);
  return state.cachedCertificateTemplateSettings;
}

export function sortedUsers(users: UserProfile[]) {
  return [...users].sort((left, right) => left.full_name.localeCompare(right.full_name));
}

