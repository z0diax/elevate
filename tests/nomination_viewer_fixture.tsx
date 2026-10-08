import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdminDashboard } from '../src/components/dashboards/AdminDashboard';
import { SecretariatDashboard } from '../src/components/dashboards/SecretariatDashboard';
import { HeadOfOfficeDashboard } from '../src/components/dashboards/HeadOfOfficeDashboard';
import { EvaluatorDashboard } from '../src/components/dashboards/EvaluatorDashboard';
import { NomineeDashboard } from '../src/components/dashboards/NomineeDashboard';
import { DeliberationDashboard } from '../src/components/dashboards/DeliberationDashboard';
import { SubmitNominationView } from '../src/components/nomination/SubmitNominationView';
import { praiseService } from '../src/lib/api';
import { NominationFormViewerModal } from '../src/components/nomination/NominationFormViewerModal';
import { Application, UserRole } from '../src/types';

const state = { calls: 0, corrections: 0, fail: false, legacy: false, signed: false, signatureFail: false, longIdentity: false, status: 'For Evaluation' as Application['status'], stage: 'Evaluation' as Application['processing_stage'], role: 'NOMINEE' as UserRole };
const root = createRoot(document.getElementById('root')!);
const app: Application = {
  id: 'viewer-record', application_number: 'PRAISE-VIEWER', award_id: 'award', award_name: 'Service Award', award_year: 2026,
  nominee_id: 'user', nominee_name: 'Nominee Record', employee_id: 'EMP-42', position_title: 'Officer', office_id: 'office', office_name: 'Test Office',
  employment_category: 'Permanent', email: 'nominee@example.invalid', contact_number: '09000000000', nomination_type: 'Individual',
  nominator_id: 'user', nominator_name: 'Original Nominator', nominator_position: 'Staff', nominating_office: 'Nominating Office',
  nomination_origin: 'Nominated by Others', submission_account_name: 'Filing Account', submission_account_role: 'NOMINEE', justification: 'Long narrative\n' + 'evidence'.repeat(2000),
  accomplishments: 'Public impact', supporting_narrative: 'Background', date_of_nomination: '2026-10-08', status: 'For Evaluation', processing_stage: 'Evaluation',
  created_at: '2026-10-08 10:00:00', updated_at: '2026-10-08 11:00:00',
  evaluator_assignments: [{ id: 'assignment', application_id: 'viewer-record', evaluator_id: 'user', route_id: null, completed_at: null, sequence_no: 1, status: 'Pending', assigned_at: '2026-10-08' }],
  documents: [{ id: 'doc', application_id: 'viewer-record', document_name: 'Evidence image', file_url: '/preview.png', file_type: 'image/png', status: 'Verified', uploaded_at: '2026-10-08' }, { id: 'pdf-doc', application_id: 'viewer-record', document_name: 'Evidence PDF', file_url: '/preview.pdf', file_type: 'application/pdf', status: 'Submitted', uploaded_at: '2026-10-08' }],
};
const history = [{ id: 'history', application_id: app.id, user_id: 'user', user_name: 'Filing Account', user_role: 'NOMINEE' as const, action: 'Nomination Submitted', new_status: 'Submitted' as const, created_at: '2026-10-08 10:30:00' }];
praiseService.getNominationForm = async id => {
  state.calls++;
  await new Promise(ok => setTimeout(ok, 150));
  if (state.fail) throw Error('Access denied for this nomination.');
  if (![app.id, 'viewer-other'].includes(id)) throw Error('Wrong nomination ID');
  const latest = { ...app, id, application_number: id === app.id ? app.application_number : 'PRAISE-OTHER', remarks: 'Latest authorized record', nominee_name: id === app.id ? 'Latest Nominee Record' : 'Other Nominee Record', status: state.status, processing_stage: state.stage, signature_signed_at: state.signed ? '2026-10-08 10:30:00' : undefined };
  if (state.longIdentity) Object.assign(latest, { office_name: 'GovernmentOffice'.repeat(40), nominator_name: 'LongNominatorName'.repeat(40), nominating_office: 'NominatingDepartment'.repeat(40) });
  if (state.legacy) Object.assign(latest, { nominator_name: '', justification: '', accomplishments: '', supporting_narrative: '', employee_id: undefined, created_at: '', updated_at: '', documents: [] });
  if (state.role === 'EVALUATOR') Object.assign(latest, { nominator_name: '', nominator_id: '', nominator_position: '', nominating_office: '', submission_account_name: undefined, submission_account_role: undefined, signature_signed_at: undefined });
  return { application: latest, history: state.legacy ? [] : history };
};
praiseService.getAuditLogsForApplication = () => history;
praiseService.getNominationSignature = async () => {
  if (state.signatureFail) throw Error('Recorded signature could not be loaded.');
  return { strokes: [[[0.1, 0.2], [0.4, 0.7], [0.7, 0.3]]], signed_at: '2026-10-08 10:30:00', sha256: 'synthetic-test-digest', signed_snapshot: app };
};

const render = (role: UserRole, screen = '') => {
  state.role = role;
  const currentUser = { id: 'user', full_name: 'Account', email: 'account@example.invalid', role, office_id: 'office', office_name: 'Test Office' };
  const shared = { applications: [{ ...app, status: state.status, processing_stage: state.stage }], currentUser, awards: [{ id: 'award', name: 'Service Award', code: 'TEST', description: '', award_year: 2026, is_active: true, min_qualifying_score: 85 }], onRefreshData: () => {}, onNavigateToNomination: () => {} };
  const component = screen === 'deliberation' ? <DeliberationDashboard {...shared} users={[]} />
    : screen === 'submission' ? <SubmitNominationView {...shared} offices={[]} />
    : role === 'ADMINISTRATOR' ? <AdminDashboard {...shared} users={[]} offices={[]} initialSubTab="overview" onSelectAdminSection={() => {}} />
    : role === 'SECRETARIAT' ? <SecretariatDashboard {...shared} evaluators={[]} />
    : role === 'HEAD_OF_OFFICE' ? <HeadOfOfficeDashboard {...shared} />
    : role === 'EVALUATOR' ? <EvaluatorDashboard {...shared} />
    : <NomineeDashboard {...shared} onNavigateToCorrections={() => { state.corrections++; }} />;
  root.render(<React.Fragment key={role + screen}>{component}</React.Fragment>);
};
(window as any).viewerTest = { state, render, mountViewer: (applicationId: string) => root.render(<NominationFormViewerModal applicationId={applicationId} userRole="NOMINEE" onClose={() => render('NOMINEE')} />) };
render('NOMINEE');
