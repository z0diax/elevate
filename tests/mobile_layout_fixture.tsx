import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LoginScreen } from '../src/components/auth/LoginScreen';
import { NomineeSignupScreen } from '../src/components/auth/NomineeSignupScreen';
import { ChangePasswordScreen } from '../src/components/auth/ChangePasswordScreen';
import { AdminDashboard } from '../src/components/dashboards/AdminDashboard';
import { ReportsView } from '../src/components/reports/ReportsView';
import { CertificateTemplateView } from '../src/components/reports/CertificateTemplateView';
import { AwardsCatalogView } from '../src/components/awards/AwardsCatalogView';
import { AuditLogsView } from '../src/components/audit/AuditLogsView';
import { Header } from '../src/components/common/Header';
import { Sidebar } from '../src/components/common/Sidebar';
import { Application, ApplicationHistory, Award, Office, UserProfile } from '../src/types';
import { praiseService } from '../src/lib/api';
import { DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS } from '../src/lib/certificateTemplate';

const offices: Office[] = Array.from({ length: 12 }, (_, index) => ({
  id: `office-${index}`, code: `OFF${index}`, name: index === 0 ? 'City Government Department of Community Development and Public Services' : `Test Department ${index}`,
  head_name: 'Department Head With A Long Name', head_title: 'Department Administrator', is_active: true,
}));
const currentUser: UserProfile = { id: 'admin', full_name: 'Test Administrator', email: 'administrator@example.invalid', role: 'ADMINISTRATOR' };
const users: UserProfile[] = [currentUser, { id: 'head', full_name: 'Department Head With A Long Name', email: `${'longemail'.repeat(10)}@example.invalid`, role: 'HEAD_OF_OFFICE', office_ids: ['office-0', 'office-1'], office_id: 'office-0', office_names: offices.slice(0, 2).map(office => office.name) }];
const awards: Award[] = [{ id: 'award', name: 'Outstanding Public Service Award', code: 'OPS', description: 'Award description', award_year: 2026, min_qualifying_score: 85, is_active: true, criteria: [], document_requirements: [] }];
const applications = [{ id: 'application', application_number: 'PRAISE-2026-0001', nominee_name: 'Nominee With A Long Name', position_title: 'Senior Public Services Officer', award_id: 'award', award_name: awards[0].name, office_id: offices[0].id, office_name: offices[0].name, status: 'For Endorsement', processing_stage: 'Endorsement', created_at: '2026-11-09', updated_at: '2026-11-09', documents: [], evaluations: [], evaluator_assignments: [] }] as unknown as Application[];
const noop = async () => {};
const auditRecords: ApplicationHistory[] = Array.from({ length: 101 }, (_, index) => ({
  id: `audit-${index}`, application_id: 'application', user_id: currentUser.id,
  user_name: currentUser.full_name, user_role: currentUser.role, action: 'Nomination revision authorized',
  new_status: 'Returned for Revision', created_at: '2026-11-09',
  remarks: 'Replace the incomplete attachment and verify the signed records. ' + 'GovernmentRecord2026'.repeat(10),
}));
praiseService.getNomineeRegistrationOffices = async () => offices.map(({ id, name }) => ({ id, name }));

function Fixture() {
  const view = new URLSearchParams(location.search).get('view') || 'login';
  const [section, setSection] = useState<'overview' | 'awards' | 'offices' | 'users'>(view === 'offices' || view === 'users' || view === 'awards' ? view : 'overview');
  const [menuOpen, setMenuOpen] = useState(window.matchMedia('(min-width: 1024px)').matches);
  if (view === 'login') return <LoginScreen isSubmitting={false} onLogin={async () => { Object.assign(window, { didLogin: true }); }} onNavigateToSignup={() => {}} />;
  if (view === 'signup') return <NomineeSignupScreen isSubmitting={false} onSignup={async (...payload) => { Object.assign(window, { signupPayload: payload }); }} onNavigateToLogin={() => {}} />;
  if (view === 'password') return <ChangePasswordScreen onChangePassword={noop} onLogout={noop} />;
  return <div className="min-h-screen bg-slate-50">
    <Sidebar currentTab="users-management" userRole={currentUser.role} currentUser={currentUser} isOpen={menuOpen} onClose={() => setMenuOpen(false)} onSelectTab={tab => Object.assign(window, { navigation: tab })} counts={{ pendingEndorsement: 1, pendingVerification: 0, pendingEvaluation: 0, forDeliberation: 0, myApplications: 0 }} />
    <div className={menuOpen ? "lg:pl-64" : ""}>
    <Header currentUser={currentUser} currentTab="users-management" notifications={[{ id: 'notification', user_id: currentUser.id, title: 'Test notification', message: 'A nomination is ready for review. ' + 'AdministrativeReference2026'.repeat(6), is_read: false, created_at: '2026-11-09', link_tab: 'all-applications' }]} onToggleSidebar={() => setMenuOpen(open => !open)} isSidebarOpen={menuOpen} onNavigateToTab={tab => Object.assign(window, { navigation: tab })} onLogout={noop} onMarkAllNotificationsRead={noop} onMarkNotificationRead={noop} />
    <main className="mx-auto w-full max-w-7xl p-3 sm:p-6 lg:p-8">
      {view === 'reports' ? <ReportsView applications={applications} awards={awards} offices={offices} onNavigateToCertificateTemplate={() => {}} /> :
        view === 'audit' ? <AuditLogsView logs={auditRecords} /> :
        view === 'catalog' ? <AwardsCatalogView awards={awards} onSelectAwardForNomination={() => {}} /> :
        view === 'certificate' ? <CertificateTemplateView applications={applications} awards={awards} certificateTemplateSettings={DEFAULT_CERTIFICATE_TEMPLATE_SETTINGS} onSaveCertificateTemplate={noop} onNavigateBack={() => {}} /> :
        <AdminDashboard applications={applications} awards={awards} offices={offices} users={users} currentUser={currentUser} initialSubTab={section} onRefreshData={noop} onNavigateToNomination={() => {}} onSelectAdminSection={setSection} />}
    </main>
    </div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
