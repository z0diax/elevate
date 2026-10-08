import React from 'react';
import { createRoot } from 'react-dom/client';
import { NominationWizard } from '../src/components/nomination/NominationWizard';
import { praiseService } from '../src/lib/api';
import { pdfGenerator } from '../src/lib/pdfGenerator';
import { Application } from '../src/types';

const user = { id: 'jack-account', full_name: 'Jack Doe', email: 'jack@example.invalid', role: 'NOMINEE' as const, office_id: 'hr', office_name: 'HRMDO', position_title: 'Staff', contact_number: '09000000000' };
const offices = [ { id: 'hr', name: 'HRMDO', code: 'HR', head_name: 'HR Head', head_title: 'Head', is_active: true }, { id: 'cad', name: 'CADMO', code: 'CAD', head_name: 'CAD Head', head_title: 'Head', is_active: true }, { id: 'old', name: 'Inactive Office', code: 'OLD', head_name: '', head_title: '', is_active: false } ];
let application: Application;
let signature: number[][][] = [];
const browserState = { submissions: 0, finalized: 0, strokes: [] as number[][][] };
(window as any).nominationBrowser = browserState;
praiseService.getApplications = () => [];
praiseService.submitNomination = async payload => {
  browserState.submissions++;
  application = { ...payload, id: 'browser-app', application_number: 'PRAISE-2026-BROWSER', award_year: 2026, nominator_id: user.id, nominee_id: payload.self_nomination ? user.id : undefined, nominee_name: payload.self_nomination ? user.full_name : payload.nominee_name, nomination_origin: payload.self_nomination ? 'Self-Nominated' : 'Nominated by Others', office_name: offices.find(office => office.id === payload.office_id)!.name, nominating_office: offices.find(office => office.id === payload.nominating_office_id)!.name, submission_account_name: user.full_name, submission_account_role: user.role, status: 'Draft', processing_stage: 'Submitted', date_of_nomination: '2026-10-08', created_at: '2026-10-08', updated_at: '2026-10-08', documents: [] };
  return application;
};
praiseService.finalizeNomination = async (_id, _requirements, strokes, confirmed) => {
  if (!confirmed || !strokes.length) throw new Error('Signature required.');
  signature = strokes; browserState.strokes = strokes; browserState.finalized++;
  application = { ...application, status: 'For Endorsement', processing_stage: 'Endorsement', signature_signed_at: '2026-10-08 10:30:00' };
  return application;
};
window.fetch = async () => new Response(JSON.stringify({ status: 'success', data: { strokes: signature, signed_at: '2026-10-08 10:30:00', signed_snapshot: application } }), { headers: { 'Content-Type': 'application/json' } });
(window as any).generateNominationPdf = () => pdfGenerator.generateApplicationSummary(application);
createRoot(document.getElementById('root')!).render(<NominationWizard currentUser={user} offices={offices} awards={[{ id: 'award', name: 'Test Award', code: 'TEST', description: 'Test award', award_year: 2026, min_qualifying_score: 85, is_active: true, document_requirements: [] }]} onCancel={() => {}} onNominationComplete={() => {}} />);
