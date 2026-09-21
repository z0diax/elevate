import React, { useCallback, useEffect, useState } from 'react';
import { Application, ApplicationHistory, Award, CertificateTemplateSettings, InAppNotification, Office, UserProfile } from './types';
import { DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS } from './lib/certificateTemplate';
import { pdfGenerator } from './lib/pdfGenerator';
import { praiseService } from './lib/supabase';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { NominationWizard } from './components/nomination/NominationWizard';
import { AdminDashboard } from './components/dashboards/AdminDashboard';
import { SecretariatDashboard } from './components/dashboards/SecretariatDashboard';
import { HeadOfOfficeDashboard } from './components/dashboards/HeadOfOfficeDashboard';
import { EvaluatorDashboard } from './components/dashboards/EvaluatorDashboard';
import { DeliberationDashboard } from './components/dashboards/DeliberationDashboard';
import { NomineeDashboard } from './components/dashboards/NomineeDashboard';
import { ReportsView } from './components/reports/ReportsView';
import { CertificateTemplateView } from './components/reports/CertificateTemplateView';
import { AuditLogsView } from './components/audit/AuditLogsView';
import { AwardsCatalogView } from './components/awards/AwardsCatalogView';
import { LoginScreen } from './components/auth/LoginScreen';
import { NomineeSignupScreen } from './components/auth/NomineeSignupScreen';

const DESKTOP_BREAKPOINT = 1024;
const SIDEBAR_STORAGE_KEY = 'praise-sidebar-open';

function getPublicAuthRoute(): 'login' | 'signup' {
  return typeof window !== 'undefined' && window.location.hash === '#/signup' ? 'signup' : 'login';
}

function defaultTabForRole(user: UserProfile): string {
  switch (user.role) {
    case 'ADMINISTRATOR':
      return 'dashboard';
    case 'SECRETARIAT':
      return 'secretariat-workbench';
    case 'HEAD_OF_OFFICE':
      return 'endorsements';
    case 'EVALUATOR':
      return 'evaluator-queue';
    case 'NOMINEE':
      return 'my-applications';
    default:
      return 'dashboard';
  }
}

export default function App() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [auditLogs, setAuditLogs] = useState<ApplicationHistory[]>([]);
  const [certificateTemplateSettings, setCertificateTemplateSettings] = useState<CertificateTemplateSettings>(DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS);
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => (
    typeof window === 'undefined' ? true : window.innerWidth >= DESKTOP_BREAKPOINT
  ));
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    const savedPreference = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (savedPreference === null) {
      return window.innerWidth >= DESKTOP_BREAKPOINT;
    }

    return savedPreference === 'true';
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [publicAuthRoute, setPublicAuthRoute] = useState<'login' | 'signup'>(getPublicAuthRoute);

  const isSidebarOpen = isDesktopViewport ? isDesktopSidebarOpen : isMobileSidebarOpen;

  const applyStateFromService = useCallback((user: UserProfile | null, preserveTab: boolean) => {
    const nextCertificateTemplateSettings = praiseService.getCertificateTemplateSettings();
    setUsers(praiseService.getUsers());
    setApplications(praiseService.getApplications());
    setAwards(praiseService.getAwards());
    setOffices(praiseService.getOffices());
    setAuditLogs(praiseService.getAllAuditLogs());
    setNotifications(praiseService.getNotifications());
    setCertificateTemplateSettings(nextCertificateTemplateSettings);
    pdfGenerator.setCertificateTemplateSettings(nextCertificateTemplateSettings);
    setCurrentUser(user);
    if (user && !preserveTab) {
      setCurrentTab(defaultTabForRole(user));
    }
  }, []);

  const bootstrapSession = useCallback(async (preserveTab = false) => {
    const snapshot = await praiseService.bootstrap();
    if (!snapshot) {
      setUsers([]);
      setApplications([]);
      setAwards([]);
      setOffices([]);
      setNotifications([]);
      setAuditLogs([]);
      setCertificateTemplateSettings(DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS);
      pdfGenerator.setCertificateTemplateSettings(DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS);
      setCurrentUser(null);
      if (!preserveTab) {
        setCurrentTab('dashboard');
      }
      return;
    }

    applyStateFromService(snapshot.currentUser, preserveTab);
  }, [applyStateFromService]);

  const refreshData = useCallback(async () => {
    if (!currentUser) {
      return;
    }
    await bootstrapSession(true);
  }, [bootstrapSession, currentUser]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setIsDesktopViewport(window.innerWidth >= DESKTOP_BREAKPOINT);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isDesktopSidebarOpen));
  }, [isDesktopSidebarOpen]);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      setIsLoading(true);
      setLoginError('');
      try {
        if (!cancelled) {
          await bootstrapSession(false);
        }
      } catch (error) {
        if (!cancelled) {
          setLoginError(error instanceof Error ? error.message : 'Failed to initialize the application.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [bootstrapSession]);

  useEffect(() => {
    const handleHashChange = () => setPublicAuthRoute(getPublicAuthRoute());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigatePublicAuthRoute = useCallback((route: 'login' | 'signup') => {
    if (route === 'signup') {
      window.location.hash = '/signup';
    } else {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    setLoginError('');
    setPublicAuthRoute(route);
  }, []);

  const handleLogin = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setLoginError('');
    try {
      const user = await praiseService.login(email, password);
      await bootstrapSession(false);
      setCurrentTab(defaultTabForRole(user));
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Unable to sign in.');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [bootstrapSession]);

  const handleNomineeSignup = useCallback(async (fullName: string, email: string, password: string) => {
    setIsLoading(true);
    setLoginError('');
    try {
      const user = await praiseService.registerNominee(fullName, email, password);
      await bootstrapSession(false);
      setCurrentTab(defaultTabForRole(user));
      navigatePublicAuthRoute('login');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Unable to create the nominee account.');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [bootstrapSession, navigatePublicAuthRoute]);

  const handleLogout = useCallback(async () => {
    setIsLoading(true);
    try {
      await praiseService.logout();
      setUsers([]);
      setApplications([]);
      setAwards([]);
      setOffices([]);
      setNotifications([]);
      setAuditLogs([]);
      setCertificateTemplateSettings(DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS);
      pdfGenerator.setCertificateTemplateSettings(DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS);
      setCurrentUser(null);
      setCurrentTab('dashboard');
      setIsMobileSidebarOpen(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleMarkNotificationRead = useCallback(async (notificationId: string) => {
    await praiseService.markNotificationRead(notificationId);
    setNotifications(praiseService.getNotifications());
  }, []);

  const handleMarkAllNotificationsRead = useCallback(async () => {
    await praiseService.markAllNotificationsRead();
    setNotifications(praiseService.getNotifications());
  }, []);

  const handleSaveCertificateTemplate = useCallback(async (
    settings: Omit<CertificateTemplateSettings, 'updated_at'>
  ) => {
    const updatedSettings = await praiseService.updateCertificateTemplateSettings(settings);
    setCertificateTemplateSettings(updatedSettings);
    pdfGenerator.setCertificateTemplateSettings(updatedSettings);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    if (isDesktopViewport) {
      setIsDesktopSidebarOpen(previous => !previous);
      return;
    }

    setIsMobileSidebarOpen(previous => !previous);
  }, [isDesktopViewport]);

  const handleCloseSidebar = useCallback(() => {
    if (!isDesktopViewport) {
      setIsMobileSidebarOpen(false);
    }
  }, [isDesktopViewport]);

  const pendingEndorsementCount = applications.filter(application => {
    const isSameOffice = !currentUser?.office_id || application.office_id === currentUser.office_id;
    return (application.status === 'Submitted' || application.status === 'For Endorsement') && isSameOffice;
  }).length;

  const pendingVerificationCount = applications.filter(application =>
    application.status === 'For Verification' || application.status === 'Endorsed' || application.status === 'Submitted'
  ).length;

  const pendingEvaluationCount = applications.filter(application => {
    const isAssigned = currentUser ? application.assigned_evaluators?.includes(currentUser.id) : false;
    return application.status === 'For Evaluation' || application.status === 'Under Evaluation' || Boolean(isAssigned);
  }).length;

  const forDeliberationCount = applications.filter(application =>
    application.status === 'For Deliberation' || application.status === 'Evaluation Completed' || application.status === 'Approved'
  ).length;

  const myApplicationsCount = applications.filter(application =>
    currentUser && (
      application.nominee_id === currentUser.id ||
      application.nominator_id === currentUser.id ||
      application.nominee_name.toLowerCase() === currentUser.full_name.toLowerCase()
    )
  ).length;

  if (!currentUser) {
    if (publicAuthRoute === 'signup') {
      return (
        <NomineeSignupScreen
          errorMessage={loginError}
          isSubmitting={isLoading}
          onSignup={handleNomineeSignup}
          onNavigateToLogin={() => navigatePublicAuthRoute('login')}
        />
      );
    }

    return (
      <LoginScreen
        errorMessage={loginError}
        isSubmitting={isLoading}
        onLogin={handleLogin}
        onNavigateToSignup={() => navigatePublicAuthRoute('signup')}
      />
    );
  }

  return (
    <div id="praise-app-root" className="min-h-screen bg-slate-50 text-slate-900 flex font-sans">
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        userRole={currentUser.role}
        currentUser={currentUser}
        counts={{
          pendingEndorsement: pendingEndorsementCount,
          pendingVerification: pendingVerificationCount,
          pendingEvaluation: pendingEvaluationCount,
          forDeliberation: forDeliberationCount,
          myApplications: myApplicationsCount,
        }}
        isOpen={isSidebarOpen}
        onClose={handleCloseSidebar}
      />

      <div className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-300 ${
        isDesktopSidebarOpen ? 'lg:pl-64' : 'lg:pl-0'
      }`}>
        <Header
          currentUser={currentUser}
          currentTab={currentTab}
          notifications={notifications}
          onMarkNotificationRead={handleMarkNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          onToggleSidebar={handleToggleSidebar}
          onNavigateToTab={setCurrentTab}
          onLogout={handleLogout}
        />

        <main className="flex-1 p-3 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {(currentTab === 'dashboard' || currentTab === 'all-applications' || currentTab === 'awards-management' || currentTab === 'offices-management' || currentTab === 'users-management') && (
            <AdminDashboard
              applications={applications}
              awards={awards}
              offices={offices}
              users={users}
              currentUser={currentUser}
              initialSubTab={
                currentTab === 'awards-management'
                  ? 'awards'
                  : currentTab === 'offices-management'
                    ? 'offices'
                    : currentTab === 'users-management'
                      ? 'users'
                      : 'overview'
              }
              onRefreshData={refreshData}
              onNavigateToNomination={() => setCurrentTab('new-nomination')}
              onSelectApplication={() => setCurrentTab('secretariat-workbench')}
            />
          )}

          {(currentTab === 'secretariat-workbench' || currentTab === 'verification') && (
            <SecretariatDashboard
              applications={applications}
              evaluators={users.filter(user => user.role === 'EVALUATOR')}
              awards={awards}
              currentUser={currentUser}
              onRefreshData={refreshData}
            />
          )}

          {currentTab === 'endorsements' && (
            <HeadOfOfficeDashboard
              applications={applications}
              currentUser={currentUser}
              awards={awards}
              onRefreshData={refreshData}
              onNavigateToNomination={() => setCurrentTab('new-nomination')}
            />
          )}

          {currentTab === 'evaluator-queue' && (
            <EvaluatorDashboard
              applications={applications}
              awards={awards}
              currentUser={currentUser}
              onRefreshData={refreshData}
            />
          )}

          {currentTab === 'deliberation' && (
            <DeliberationDashboard
              applications={applications}
              awards={awards}
              currentUser={currentUser}
              onRefreshData={refreshData}
            />
          )}

          {currentTab === 'my-applications' && (
            <NomineeDashboard
              applications={applications}
              awards={awards}
              currentUser={currentUser}
              onRefreshData={refreshData}
              onNavigateToNomination={() => setCurrentTab('new-nomination')}
            />
          )}

          {currentTab === 'new-nomination' && (
            <NominationWizard
              awards={awards}
              offices={offices}
              currentUser={currentUser}
              onNominationComplete={async () => {
                await refreshData();
                setCurrentTab(currentUser.role === 'NOMINEE' ? 'my-applications' : defaultTabForRole(currentUser));
              }}
              onCancel={() => {
                setCurrentTab(currentUser.role === 'NOMINEE' ? 'my-applications' : defaultTabForRole(currentUser));
              }}
            />
          )}

          {currentTab === 'awards-catalog' && (
            <AwardsCatalogView
              awards={awards}
              onSelectAwardForNomination={() => setCurrentTab('new-nomination')}
            />
          )}

          {currentTab === 'reports' && (
            <ReportsView
              applications={applications}
              awards={awards}
              offices={offices}
              onNavigateToCertificateTemplate={() => setCurrentTab('certificate-template')}
            />
          )}

          {currentTab === 'certificate-template' && (
            <CertificateTemplateView
              applications={applications}
              awards={awards}
              certificateTemplateSettings={certificateTemplateSettings}
              onSaveCertificateTemplate={handleSaveCertificateTemplate}
              onNavigateBack={() => setCurrentTab('reports')}
            />
          )}

          {currentTab === 'audit-logs' && (
            <AuditLogsView logs={auditLogs} />
          )}
        </main>
      </div>

      {isLoading && (
        <div className="fixed inset-0 z-[70] bg-slate-950/35 backdrop-blur-[1px] pointer-events-none flex items-center justify-center">
          <div className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-2xl">
            Syncing application data...
          </div>
        </div>
      )}
    </div>
  );
}
