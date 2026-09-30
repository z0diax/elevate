import {
  Application, ApplicationHistory, Award, CertificateTemplateSettings,
  InAppNotification, Office, UserProfile,
} from '../types';
import { DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS } from './certificateTemplate';
import { authApi } from './api/authApi';
import { activityApi } from './api/activityApi';
import { applicationsApi } from './api/applicationsApi';
import { catalogApi } from './api/catalogApi';
import { documentsApi } from './api/documentsApi';
import { evaluationsApi } from './api/evaluationsApi';
import { reportSettingsApi } from './api/reportSettingsApi';
import {
  fetchCurrentSessionUser, loadApplications, loadAuditLogs, loadAwards,
  loadCertificateTemplateSettings, loadNotifications, loadOffices, loadUsers, state,
} from './api/state';

export { getStageFromStatus } from './api/applicationsApi';

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

// Compatibility entry point for the existing dashboards and nomination views.
export const praiseService = {
  async bootstrap(): Promise<DashboardSnapshot | null> {
    const sessionUser = await fetchCurrentSessionUser();
    if (!sessionUser) {
      return null;
    }

    if (sessionUser.must_change_password) {
      state.cachedUsers = [];
      state.cachedApplications = [];
      state.cachedAwards = [];
      state.cachedOffices = [];
      state.cachedAuditLogs = [];
      state.cachedNotifications = [];
      state.cachedCertificateTemplateSettings = DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS;
      state.currentUser = sessionUser;
      return {
        currentUser: sessionUser, users: [], applications: [], awards: [], offices: [],
        auditLogs: [], notifications: [], certificateTemplateSettings: DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS,
      };
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

    state.currentUser = users.find(user => user.id === sessionUser.id) || sessionUser;

    return {
      currentUser: state.currentUser,
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
  ...authApi,
  ...catalogApi,
  ...applicationsApi,
  ...documentsApi,
  ...evaluationsApi,
  ...activityApi,
  ...reportSettingsApi,
};
