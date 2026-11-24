import React from 'react';
import { createRoot } from 'react-dom/client';
import { SubmitNominationView } from '../src/components/nomination/SubmitNominationView';
import { praiseService } from '../src/lib/api';
import { pdfGenerator } from '../src/lib/pdfGenerator';
import { Application } from '../src/types';

const user = { id: 'jack-account', full_name: 'Jack Doe', email: 'jack@example.invalid', role: 'NOMINEE' as const, office_id: 'hr', office_name: 'HRMDO', position_title: 'Staff', contact_number: '09000000000' };
const offices = [ { id: 'hr', name: 'Human Resource Management and Development Office', code: 'HR', head_name: 'HR Head', head_title: 'Head', is_active: true }, { id: 'cad', name: 'City Assessment and Development Management Office', code: 'CAD', head_name: 'CAD Head', head_title: 'Head', is_active: true }, { id: 'old', name: 'Inactive Office', code: 'OLD', head_name: '', head_title: '', is_active: false } ];
let application: Application;
let signature: number[][][] = [];
const browserState = { submissions: 0, finalized: 0, uploads: [] as string[], strokes: [] as number[][][] };
(window as any).nominationBrowser = browserState;
praiseService.getApplications = () => [];
praiseService.submitNomination = async payload => {
  browserState.submissions++;
  application = { ...payload, id: 'browser-app', application_number: 'PRAISE-2026-BROWSER', award_year: 2026, nominator_id: user.id, nominee_id: payload.self_nomination ? user.id : undefined, nominee_name: payload.self_nomination ? user.full_name : payload.nominee_name, nomination_origin: payload.self_nomination ? 'Self-Nominated' : 'Nominated by Others', office_name: offices.find(office => office.id === payload.office_id)!.name, nominating_office: offices.find(office => office.id === payload.nominating_office_id)!.name, submission_account_name: user.full_name, submission_account_role: user.role, status: 'Draft', processing_stage: 'Submitted', date_of_nomination: '2026-10-08', created_at: '2026-10-08', updated_at: '2026-10-08', documents: [] };
  return application;
};
praiseService.uploadApplicationDocument = async (applicationId, file, documentName, requirementId) => {
  browserState.uploads.push(file.name);
  return { id: 'fixture-document', application_id: applicationId, requirement_id: requirementId, document_name: documentName, file_name: file.name, file_type: file.type, file_url: '', status: 'Submitted', uploaded_at: '2026-10-08' };
};
praiseService.finalizeNomination = async (_id, _requirements, strokes, confirmed) => {
  if (!confirmed || !strokes.length) throw new Error('Signature required.');
  signature = strokes; browserState.strokes = strokes; browserState.finalized++;
  application = { ...application, status: 'For Endorsement', processing_stage: 'Endorsement', signature_signed_at: '2026-10-08 10:30:00' };
  return application;
};
const browserFetch = window.fetch.bind(window);
window.fetch = async (input, init) => String(input).startsWith('blob:') ? browserFetch(input, init) : new Response(JSON.stringify({ status: 'success', data: { strokes: signature, signed_at: '2026-10-08 10:30:00', signed_snapshot: application } }), { headers: { 'Content-Type': 'application/json' } });
(window as any).generateNominationPdf = () => pdfGenerator.generateApplicationSummary(application);
const commonAward = { award_year: 2026, min_qualifying_score: 85, is_active: true };
const awards = [
  { ...commonAward, id: 'other-award', name: 'Service Excellence', code: 'SE', description: 'Service excellence award.' },
  { ...commonAward, id: 'award', name: 'Best Administrative Staff for Records Management and Community Support', code: 'BAS', description: 'Recognizes exemplary accuracy, responsiveness, efficiency, and professionalism in records management and administrative support.', remarks: 'Submit ten copies of the supporting documents to the PRAISE Secretariat.', document_requirements: [{ id: 'requirement', award_id: 'award', document_name: 'Records management evidence and endorsement from the department', description: '', is_mandatory: true }] },
];
createRoot(document.getElementById('root')!).render(<SubmitNominationView applications={[]} currentUser={user} offices={offices} awards={awards} onRefreshData={() => {}} />);
