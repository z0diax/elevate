import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString } from 'pdf-lib';
import { buildNominationPdf } from '../src/lib/nominationPdf';
import { Application } from '../src/types';

const application: Application = {
  id: 'pdf-fixture', application_number: 'PRAISE-2026-PDF', award_id: 'award', award_name: 'Best Frontliner', award_year: 2026,
  nominee_name: 'Jane Doe', employee_id: 'EMP-42', position_title: 'Administrative Officer', office_id: 'office', office_name: 'Test Office',
  employment_category: 'Permanent', contact_number: '09000000000', email: 'jane@example.invalid',
  nomination_type: 'Individual', nomination_origin: 'Nominated by Others', nominator_id: 'user', nominator_name: 'Original Nominator',
  nominator_position: 'Department Head', nominating_office: 'Test Nominating Office', submission_account_name: 'Filing Account', submission_account_role: 'NOMINEE',
  justification: 'Improved public services through timely and accurate support.', accomplishments: 'Reduced processing time by 30%.', supporting_narrative: 'Evidence supplied with the nomination.',
  date_of_nomination: '2026-11-18', status: 'For Endorsement', processing_stage: 'Endorsement', created_at: '2026-11-18 10:00:00', updated_at: '2026-11-19 10:00:00',
  signature_signed_at: '2026-11-18 10:30:00',
};
const signature = { strokes: [[[0.1, 0.6], [0.3, 0.2], [0.4, 0.8], [0.7, 0.3], [0.9, 0.5]]], signed_at: application.signature_signed_at!, sha256: 'a'.repeat(64), signed_snapshot: application };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlV8AAAAASUVORK5CYII=', 'base64');

function pageContent(pdf: PDFDocument) {
  return pdf.getPages().map(page => {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map(ref => pdf.context.lookup(ref)) : [contents];
    return streams.map(stream => stream instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1') : '').join('\n');
  }).join('\n');
}
function embeddedFiles(pdf: PDFDocument) {
  const names = pdf.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict).lookup(PDFName.of('Names'), PDFArray);
  const result: { name: string; bytes: Buffer }[] = [];
  for (let index = 0; index < names.size(); index += 2) {
    const spec = names.lookup(index + 1, PDFDict);
    const stream = spec.lookup(PDFName.of('EF'), PDFDict).lookup(PDFName.of('F'));
    assert.ok(stream instanceof PDFRawStream);
    const name = names.lookup(index);
    assert.ok(name instanceof PDFString || name instanceof PDFHexString);
    result.push({ name: name.decodeText(), bytes: Buffer.from(decodePDFRawStream(stream).decode()) });
  }
  return result;
}

test('signed form includes PDF/image pages and every original file, including Word', async () => {
  const source = new jsPDF(); source.text('ATTACHED PDF EVIDENCE', 20, 30); source.addPage(); source.text('SECOND EVIDENCE PAGE', 20, 30);
  const originalPdf = Buffer.from(source.output('arraybuffer'));
  const word = Buffer.from('PK synthetic Word attachment bytes');
  const documents = [
    { mime: 'application/pdf', bytes: originalPdf, name: 'Evidence PDF' },
    { mime: 'image/png', bytes: png, name: 'Evidence image' },
    { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: word, name: 'Evidence Word' },
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(init?.credentials, 'include');
    const file = documents[Number(String(input).slice(-1))];
    return new Response(file.bytes, { headers: { 'Content-Type': file.mime } });
  };
  try {
    const bytes = await buildNominationPdf({ ...application, documents: documents.map((file, index) => ({
      id: String(index), application_id: application.id, document_name: file.name, file_url: `/download/${index}`, file_type: file.mime, status: 'Verified', uploaded_at: '2026-11-18',
    })) }, [], 'ADMINISTRATOR', signature);
    const pdf = await PDFDocument.load(bytes);
    const content = pageContent(pdf);
    assert.match(content, /NOMINATOR ELECTRONIC SIGNATURE/);
    assert.match(content, /Original Nominator/); assert.match(content, /2026-11-18 10:30:00/);
    assert.match(content, /Ordinary document corrections are recorded separately/);
    assert.match(content, /ATTACHED PDF EVIDENCE/); assert.match(content, /SECOND EVIDENCE PAGE/);
    assert.ok(pdf.getPageCount() >= 6);
    const files = embeddedFiles(pdf);
    assert.equal(files.length, 3);
    documents.forEach((file, index) => assert.deepEqual(files[index].bytes, file.bytes, 'original attachment bytes retained'));
    assert.match(files[2].name, /\.docx$/);
    mkdirSync('tmp/pdfs', { recursive: true }); writeFileSync('tmp/pdfs/nomination-signed.pdf', bytes);
  } finally { globalThis.fetch = originalFetch; }
});

test('evaluator export excludes private identity and signature even if passed unredacted data', async () => {
  const pdf = await PDFDocument.load(await buildNominationPdf(application, [], 'EVALUATOR', signature));
  const content = pageContent(pdf);
  assert.match(content, /Restricted during scoring/);
  for (const secret of ['Original Nominator', 'Filing Account', 'Test Nominating Office', 'NOMINATOR ELECTRONIC SIGNATURE', signature.sha256]) assert.ok(!content.includes(secret));
});

test('versioned PDF separates ordinary replacement bytes from signed attachment bytes', async () => {
  const originalFetch = globalThis.fetch;
  const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const original = Buffer.from('PK synthetic signed evidence');
  const replacement = Buffer.from('PK synthetic ordinary correction');
  globalThis.fetch = async input => new Response(String(input) === '/signed' ? original : replacement);
  try {
    const record: Application = { ...application, nomination_version: 2, documents: [{
      id: 'doc', application_id: application.id, document_name: 'Evidence', file_url: '/current',
      file_type: mime, status: 'Verified', uploaded_at: '2026-11-24',
    }] };
    const signed = {
      ...signature, version_number: 2, sha256: 'b'.repeat(64),
      signed_snapshot: { ...record, signing_account: { id: 'user', name: 'Verified Filing Account', role: 'NOMINEE' } },
      documents: [{ id: 'doc', document_name: 'Evidence', file_url: '/signed', file_type: mime, matches_official: false, sha256: 'c'.repeat(64) }],
    };
    const pdf = await PDFDocument.load(await buildNominationPdf(record, [], 'ADMINISTRATOR', signed));
    const content = pageContent(pdf);
    assert.match(content, /Signature covers nomination version 2/);
    assert.match(content, /Verified Filing Account/);
    assert.match(content, /Current file is outside the signed snapshot/);
    assert.deepEqual(embeddedFiles(pdf).map(file => file.bytes), [replacement, original]);
    const evaluator = await PDFDocument.load(await buildNominationPdf(record, [], 'EVALUATOR', signed));
    assert.deepEqual(embeddedFiles(evaluator).map(file => file.bytes), [replacement]);
    assert.doesNotMatch(pageContent(evaluator), /SIGNED ATTACHMENT RECORD|Verified Filing Account/);
  } finally { globalThis.fetch = originalFetch; }
});

test('missing recorded signature and unavailable attachment fail instead of silently omitting them', async () => {
  await assert.rejects(buildNominationPdf(application, [], 'ADMINISTRATOR'), /recorded signature/);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Denied', { status: 403 });
  try {
    await assert.rejects(buildNominationPdf({ ...application, documents: [{ id: 'doc', application_id: application.id, document_name: 'Required evidence', file_url: '/denied', file_type: 'application/pdf', status: 'Submitted', uploaded_at: '' }] }, [], 'ADMINISTRATOR', signature), /Unable to include attachment "Required evidence"/);
  } finally { globalThis.fetch = originalFetch; }
});

test('unsigned legacy form supports long narratives across pages and missing dates', async () => {
  const bytes = await buildNominationPdf({ ...application, signature_signed_at: undefined, created_at: '', updated_at: '', justification: 'Long public service narrative. '.repeat(500) + 'END OF NARRATIVE', accomplishments: 'evidence'.repeat(2000) }, [], 'NOMINEE');
  const pdf = await PDFDocument.load(bytes);
  const content = pageContent(pdf);
  mkdirSync('tmp/pdfs', { recursive: true });
  writeFileSync('tmp/pdfs/nomination-long.pdf', bytes);
  assert.ok(pdf.getPageCount() > 5);
  const text = Array.from(content.matchAll(/\(([^()]*)\)\s*Tj/g), match => match[1])
    .filter(line => !/^(CITY GOVERNMENT OF TACLOBAN|NOMINATION FORM|Form page \d+|04  NOMINATION DETAILS)/.test(line)).join(' ');
  assert.ok(text.includes('END OF NARRATIVE'), 'last narrative words survive page breaks');
  assert.match(content, /No electronic signature recorded/); assert.match(content, /No documents attached/);
  assert.ok(!content.includes('Invalid Date'));
});

test('unpreviewable PDF remains embedded with an explanatory page', async () => {
  const originalFetch = globalThis.fetch;
  const source = Buffer.from('unpreviewable original PDF');
  globalThis.fetch = async () => new Response(source);
  try {
    const pdf = await PDFDocument.load(await buildNominationPdf({ ...application, documents: [{ id: 'doc', application_id: application.id, document_name: 'Protected PDF', file_url: '/protected', file_type: 'application/pdf', status: 'Submitted', uploaded_at: '' }] }, [], 'ADMINISTRATOR', signature));
    assert.match(pageContent(pdf), /Preview unavailable/);
    assert.deepEqual(embeddedFiles(pdf)[0].bytes, source);
  } finally { globalThis.fetch = originalFetch; }
});
