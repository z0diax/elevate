import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readdirSync, readFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const database = process.env.TEST_DB_NAME?.trim();
if (!database || !/^[a-zA-Z0-9_]*_test(?:_[a-zA-Z0-9_]+)?$/.test(database) || database === 'tacloban_praise_db') {
  console.error('Set TEST_DB_NAME to an existing, empty, dedicated *_test MySQL database.');
  process.exit(2);
}
const run = randomBytes(8).toString('hex');
const id = name => `test-${run}-${name}`;
const password = randomBytes(24).toString('base64url');
const storage = mkdtempSync(join(tmpdir(), `praise-${run}-`));
const env = { ...process.env, DB_NAME: database, TEST_DB_NAME: database, TEST_RUN_ID: run, TEST_PASSWORD: password, PRIVATE_UPLOAD_DIR: storage };
let server;
let setupComplete = false;
let serverErrors = '';
let failed = 0;
let checks = 0;
const sessions = new Map();

function php(...args) {
  const result = spawnSync('php', args, { cwd: root, env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `php exited ${result.status}`).trim());
  return result.stdout.trim();
}
async function freePort() {
  const socket = createServer();
  await new Promise((ok, fail) => socket.once('error', fail).listen(0, '127.0.0.1', ok));
  const port = socket.address().port;
  await new Promise(ok => socket.close(ok));
  return port;
}
async function ready(url) {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${url}/api/health.php`)).status !== 0) return; } catch { /* starting */ }
    await new Promise(ok => setTimeout(ok, 100));
  }
  throw new Error('PHP test server did not start.');
}
let base;
async function request(path, { method = 'GET', actor, json, form, csrf = 'valid' } = {}) {
  const session = actor ? sessions.get(actor) : undefined;
  const headers = {};
  if (session?.cookie) headers.cookie = session.cookie;
  if (session?.csrf && csrf === 'valid') headers['X-CSRF-Token'] = session.csrf;
  if (csrf === 'wrong') headers['X-CSRF-Token'] = 'incorrect-token';
  let body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const response = await fetch(base + path, { method, headers, body, redirect: 'manual' });
  const raw = Buffer.from(await response.arrayBuffer());
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (actor && cookie && !cookie.endsWith('=')) sessions.set(actor, { ...session, cookie });
  let data;
  try { data = JSON.parse(raw.toString('utf8')); } catch { data = null; }
  return { status: response.status, data, raw, headers: response.headers };
}
function expect(response, status, message) {
  assert.equal(response.status, status, `${message}: HTTP ${response.status}, ${response.data?.message ?? response.raw.toString('utf8').slice(0, 200)}`);
  return response.data?.data;
}
async function test(name, body) {
  try { await body(); console.log(`PASS — ${name}`); checks++; }
  catch (error) { console.error(`FAIL — ${name}: ${error.message}`); failed++; }
}
async function login(name) {
  const response = await request('/api/auth.php?action=login', { method: 'POST', actor: name, json: { email: `${name}-${run}@example.invalid`, password } });
  const user = expect(response, 200, `${name} login`);
  assert.equal(user.id, id(name));
  assert.ok(user.csrf_token);
  assert.ok(!('password_hash' in user));
  sessions.set(name, { ...sessions.get(name), csrf: user.csrf_token });
  return user;
}
async function action(app, name, actor, data = {}) {
  return request(`/api/applications.php?action=${name}&id=${encodeURIComponent(app)}`, { method: 'PUT', actor, json: data });
}
async function createNomination(actor = 'filer') {
  const body = { award_id: id('award-one'), office_id: id('office-one'), nominee_name: 'Synthetic Test Nominee',
    justification: 'Synthetic test nomination', accomplishments: 'Synthetic test accomplishments',
    supporting_narrative: 'Synthetic test narrative', submission_id: randomUUID() };
  return expect(await request('/api/applications.php', { method: 'POST', actor, json: body }), 201, 'create nomination');
}
function makeForm(app, filename, bytes, requirement = id('requirement-one'), documentId = '') {
  const form = new FormData();
  form.set('application_id', app); form.set('requirement_id', requirement);
  form.set('document_id', documentId); form.set('document_name', filename);
  form.set('file', new Blob([bytes]), filename);
  return form;
}
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64');
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAVEAEBAAAAAAAAAAAAAAAAAAABAP/aAAwDAQACEAMQAAABlAD/xAAVEAEBAAAAAAAAAAAAAAAAAAABAP/aAAgBAQABBQJf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFhABAQEAAAAAAAAAAAAAAAAAAQAR/9oACAEBAAY/AhJH/8QAFhABAQEAAAAAAAAAAAAAAAAAAQAR/9oACAEBAAE/IYhH/9k=', 'base64');
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); }
  return (value ^ 0xffffffff) >>> 0;
}
function zipFiles(files) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const filename = Buffer.from(name), body = Buffer.from(text), crc = crc32(body);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(body.length, 18); header.writeUInt32LE(body.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, body);
    const record = Buffer.alloc(46); record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6);
    record.writeUInt32LE(crc, 16); record.writeUInt32LE(body.length, 20); record.writeUInt32LE(body.length, 24);
    record.writeUInt16LE(filename.length, 28); record.writeUInt32LE(offset, 42); central.push(record, filename);
    offset += header.length + filename.length + body.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
const docx = zipFiles({
  '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  'word/document.xml': '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>',
});

async function main() {
  console.log(php('tests/integration_db.php', 'setup'));
  setupComplete = true;
  const port = await freePort(); base = `http://127.0.0.1:${port}`;
  server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root], { cwd: root, env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  server.stderr.on('data', chunk => { serverErrors = (serverErrors + chunk.toString()).slice(-8000); });
  await ready(base);

  await test('invalid and disabled credentials use a generic error', async () => {
    for (const name of ['filer', 'inactive']) {
      const result = await request('/api/auth.php?action=login', { method: 'POST', json: { email: `${name}-${run}@example.invalid`, password: name === 'filer' ? 'wrong-password' : password } });
      expect(result, 401, 'invalid login'); assert.equal(result.data.message, 'Invalid credentials.');
    }
  });
  await test('login creates a session and logout invalidates it', async () => {
    const before = await request('/api/auth.php?action=current', { actor: 'filer' });
    assert.equal(before.data.data, null);
    const anonymousCookie = sessions.get('filer')?.cookie;
    await login('filer');
    assert.notEqual(sessions.get('filer')?.cookie, anonymousCookie, 'session ID should rotate at login');
    expect(await request('/api/auth.php?action=current', { actor: 'filer' }), 200, 'current session');
    expect(await request('/api/auth.php?action=logout', { actor: 'filer', method: 'POST' }), 200, 'logout');
    assert.equal((await request('/api/auth.php?action=current', { actor: 'filer' })).data.data, null);
    await login('filer');
  });
  for (const name of ['admin', 'secretary', 'head', 'other-head', 'other-filer', 'A', 'B', 'C', 'D', 'E', 'F']) await login(name);
  await test('a disabled existing session loses protected access', async () => {
    expect(await request('/api/auth.php', { method: 'PUT', actor: 'admin', json: { id: id('inactive'), is_active: true } }), 200, 'enable test account');
    await login('inactive');
    expect(await request('/api/auth.php', { method: 'PUT', actor: 'admin', json: { id: id('inactive'), is_active: false } }), 200, 'disable test account');
    expect(await request('/api/applications.php', { actor: 'inactive' }), 401, 'disabled session');
  });
  await test('CSRF rejects missing and incorrect tokens but accepts valid token', async () => {
    for (const csrf of ['missing', 'wrong']) expect(await request('/api/applications.php', { method: 'POST', actor: 'filer', csrf, json: {} }), 403, csrf);
    expect(await request('/api/applications.php', { method: 'POST', actor: 'filer', json: {} }), 400, 'valid CSRF reached validation');
    expect(await request('/api/auth.php?action=current', { actor: 'filer' }), 200, 'GET remains available');
  });
  await test('route configuration enforces role, count, distinct and active evaluators', async () => {
    const path = `/api/award_routes.php?award_id=${id('award-one')}`;
    const route = ids => ({ required_evaluators: 3, evaluator_ids: ids.map(id), is_active: true });
    expect(await request(path, { method: 'PUT', actor: 'secretary', json: route(['A', 'B', 'C']) }), 403, 'secretary route edit');
    for (const ids of [['A', 'A', 'B'], ['A', 'B'], ['A', 'B', 'inactive'], ['A', 'B', 'head']])
      expect(await request(path, { method: 'PUT', actor: 'admin', json: route(ids) }), 400, 'invalid route');
    expect(await request(path, { method: 'PUT', actor: 'admin', json: route(['A', 'B', 'C']) }), 200, 'save route');
    const saved = expect(await request(path, { actor: 'secretary' }), 200, 'read route');
    assert.deepEqual(saved.evaluators.map(x => x.evaluator_id), ['A', 'B', 'C'].map(id));
  });
  await test('PDF, DOCX, JPG, JPEG and PNG uploads use private storage', async () => {
    const app = await createNomination();
    for (const [name, bytes] of [['pdf', pdf], ['docx', docx], ['jpg', jpeg], ['jpeg', jpeg], ['png', png]]) {
      const uploaded = expect(await request('/api/documents.php', { method: 'POST', actor: 'filer', form: makeForm(app.id, `synthetic.${name}`, bytes, '') }), 201, `${name} upload`);
      assert.ok(uploaded.file_url?.includes('api/documents.php?action=download'));
      const retrieved = await request(`/api/documents.php?action=download&id=${uploaded.id}`, { actor: 'filer' });
      assert.equal(retrieved.status, 200); assert.deepEqual(retrieved.raw, bytes);
    }
    expect(await request(`/api/applications.php?id=${app.id}`, { actor: 'admin', method: 'DELETE', json: {} }), 200, 'delete format fixture');
  });
  let first, firstDoc, second;
  await test('draft creation, ownership and required attachment', async () => {
    expect(await request('/api/applications.php', { method: 'POST', actor: 'filer', json: {} }), 400, 'invalid nomination');
    first = await createNomination();
    assert.equal(first.status, 'Draft'); assert.equal(first.processing_stage, 'Submitted'); assert.equal(first.nominator_id, id('filer'));
    assert.equal(first.award_id, id('award-one'));
    expect(await request(`/api/applications.php?id=${first.id}`, { actor: 'other-filer' }), 403, 'other filer draft');
    expect(await action(first.id, 'finalize_submission', 'filer', { expected_requirement_ids: [id('requirement-one')] }), 409, 'missing attachment');
    expect(await action(first.id, 'assign_evaluators', 'secretary'), 409, 'draft routing');
  });
  await test('upload validation rejects unsafe or unrelated documents', async () => {
    const variants = [
      ['bad.txt', pdf, 400], ['wrong.pdf', png, 400], ['fake.pdf', Buffer.from('%PDF-'), 400],
      ['invalid.docx', Buffer.from('not a docx'), 400], ['invalid.png', Buffer.from('not an image'), 400],
    ];
    for (const [name, bytes, status] of variants) expect(await request('/api/documents.php', { method: 'POST', actor: 'filer', form: makeForm(first.id, name, bytes) }), status, name);
    expect(await request('/api/documents.php', { method: 'POST', actor: 'filer', form: makeForm(first.id, 'test.pdf', pdf, 'bad-id') }), 400, 'invalid requirement');
    expect(await request('/api/documents.php', { method: 'POST', actor: 'filer', form: makeForm(first.id, 'test.pdf', pdf, id('requirement-two')) }), 400, 'other award requirement');
    expect(await request('/api/documents.php', { method: 'POST', actor: 'other-filer', form: makeForm(first.id, 'test.pdf', pdf) }), 403, 'other filer upload');
    expect(await request('/api/documents.php', { method: 'POST', actor: 'filer', form: makeForm(first.id, 'oversized.pdf', Buffer.alloc(10 * 1024 * 1024 + 1, 65)) }), 413, 'oversized upload');
  });
  await test('PDF upload, authorized download and replacement', async () => {
    firstDoc = expect(await request('/api/documents.php', { method: 'POST', actor: 'filer', form: makeForm(first.id, 'synthetic.pdf', pdf) }), 201, 'PDF upload');
    const docId = firstDoc.id;
    const download = await request(`/api/documents.php?action=download&id=${docId}`, { actor: 'filer' });
    assert.equal(download.status, 200); assert.deepEqual(download.raw, pdf);
    expect(await request(`/api/documents.php?action=download&id=${docId}`, { actor: 'other-filer' }), 404, 'unrelated download');
    expect(await request(`/api/documents.php?action=download&id=${docId}`), 401, 'anonymous download');
    const fileCount = readdirSync(storage).length;
    const replaced = expect(await request('/api/documents.php', { method: 'POST', actor: 'filer', form: makeForm(first.id, 'replacement.pdf', pdf, id('requirement-one'), docId) }), 201, 'replace document');
    assert.equal(replaced.id, docId);
    assert.equal(readdirSync(storage).length, fileCount, 'replacement should remove the old file');
    assert.equal((await request(`/api/documents.php?action=download&id=${docId}&preview=1`, { actor: 'filer' })).headers.get('content-disposition')?.startsWith('inline'), true);
    assert.match(readFileSync(join(root, 'uploads', '.htaccess'), 'utf8'), /Require all denied/);
  });
  await test('submission and office endorsement enforce stage and role', async () => {
    const submitted = expect(await action(first.id, 'finalize_submission', 'filer', { expected_requirement_ids: [id('requirement-one')] }), 200, 'submit');
    assert.equal(submitted.status, 'For Endorsement'); assert.equal(submitted.processing_stage, 'Endorsement');
    expect(await action(first.id, 'assign_evaluators', 'secretary'), 409, 'unendorsed route');
    expect(await action(first.id, 'endorse', 'other-head', { decision: 'Endorsed' }), 403, 'other office');
    expect(await action(first.id, 'endorse', 'filer', { decision: 'Endorsed' }), 403, 'filer endorse');
    expect(await action(first.id, 'endorse', 'head', { decision: 'Endorsed' }), 409, 'must inspect document');
    expect(await action(first.id, 'inspect_document', 'head', { document_id: firstDoc.id, status: 'Head Approved' }), 200, 'inspect');
    const endorsed = expect(await action(first.id, 'endorse', 'head', { decision: 'Endorsed' }), 200, 'endorse');
    assert.equal(endorsed.processing_stage, 'Document Verification');
    expect(await action(first.id, 'endorse', 'head', { decision: 'Endorsed' }), 409, 'duplicate endorsement');
  });
  await test('rejected document requires revision and preserves the reason', async () => {
    const app = await createNomination();
    const doc = expect(await request('/api/documents.php', { method: 'POST', actor: 'filer', form: makeForm(app.id, 'revision.pdf', pdf) }), 201, 'revision fixture document');
    expect(await action(app.id, 'finalize_submission', 'filer', { expected_requirement_ids: [id('requirement-one')] }), 200, 'submit revision fixture');
    expect(await action(app.id, 'inspect_document', 'head', { document_id: doc.id, status: 'Head Approved' }), 200, 'head inspect');
    expect(await action(app.id, 'endorse', 'head', { decision: 'Endorsed' }), 200, 'endorse revision fixture');
    const incomplete = expect(await action(app.id, 'verify_document', 'secretary', { document_id: doc.id, status: 'Rejected', remarks: 'Synthetic correction required' }), 200, 'reject document');
    assert.equal(incomplete.status, 'Incomplete');
    expect(await action(app.id, 'assign_evaluators', 'secretary'), 409, 'incomplete routing');
    expect(await action(app.id, 'resubmit', 'filer'), 409, 'unreplaced document');
    expect(await request('/api/documents.php', { method: 'POST', actor: 'filer', form: makeForm(app.id, 'corrected.pdf', pdf, id('requirement-one'), doc.id) }), 201, 'replace rejected document');
    const resubmitted = expect(await action(app.id, 'resubmit', 'filer', { remarks: 'Synthetic correction completed' }), 200, 'resubmit');
    assert.equal(resubmitted.status, 'For Verification');
    const returned = expect(await action(app.id, 'return_for_revision', 'secretary', { remarks: 'Second synthetic revision' }), 200, 'return');
    assert.equal(returned.status, 'Returned for Revision'); assert.equal(returned.remarks, 'Second synthetic revision');
    expect(await action(app.id, 'return_for_revision', 'filer', { remarks: 'Unauthorized' }), 403, 'filer return');
    expect(await request(`/api/applications.php?id=${app.id}`, { actor: 'admin', method: 'DELETE', json: {} }), 200, 'delete revision fixture');
  });
  await test('verification and initial assignment create a three-person snapshot', async () => {
    expect(await action(first.id, 'assign_evaluators', 'secretary'), 409, 'unverified route');
    expect(await action(first.id, 'verify_document', 'filer', { document_id: firstDoc.id, status: 'Verified' }), 403, 'filer verification');
    const verified = expect(await action(first.id, 'verify_document', 'secretary', { document_id: firstDoc.id, status: 'Verified' }), 200, 'verify');
    assert.equal(verified.status, 'Verified');
    const assigned = expect(await action(first.id, 'assign_evaluators', 'secretary'), 200, 'assign');
    assert.equal(assigned.status, 'For Evaluation');
    assert.deepEqual(assigned.evaluator_assignments.map(x => [x.evaluator_id, x.status]), ['A', 'B', 'C'].map(x => [id(x), 'Pending']));
    expect(await request(`/api/applications.php?id=${first.id}`, { actor: 'D' }), 403, 'unassigned evaluator view');
    expect(await request(`/api/applications.php?id=${first.id}`, { actor: 'A' }), 200, 'assigned evaluator view');
    assert.equal((await request(`/api/documents.php?action=download&id=${firstDoc.id}`, { actor: 'A' })).status, 200);
    expect(await request(`/api/documents.php?action=download&id=${firstDoc.id}`, { actor: 'D' }), 404, 'unassigned evaluator document');
  });
  await test('route edits affect future nominations only', async () => {
    const path = `/api/award_routes.php?award_id=${id('award-one')}`;
    expect(await request(path, { method: 'PUT', actor: 'admin', json: { required_evaluators: 3, evaluator_ids: ['D', 'E', 'F'].map(id), is_active: true } }), 200, 'edit route');
    const old = expect(await request(`/api/applications.php?id=${first.id}`, { actor: 'admin' }), 200, 'old nomination');
    assert.deepEqual(old.evaluator_assignments.map(x => x.evaluator_id), ['A', 'B', 'C'].map(id));
    second = await createNomination();
    const document = expect(await request('/api/documents.php', { method: 'POST', actor: 'filer', form: makeForm(second.id, 'second.pdf', pdf) }), 201, 'second document');
    expect(await action(second.id, 'finalize_submission', 'filer', { expected_requirement_ids: [id('requirement-one')] }), 200, 'second submit');
    expect(await action(second.id, 'inspect_document', 'head', { document_id: document.id, status: 'Head Approved' }), 200, 'second inspect');
    expect(await action(second.id, 'endorse', 'head', { decision: 'Endorsed' }), 200, 'second endorse');
    expect(await action(second.id, 'verify_document', 'secretary', { document_id: document.id, status: 'Verified' }), 200, 'second verify');
    const assigned = expect(await action(second.id, 'assign_evaluators', 'secretary'), 200, 'second assign');
    assert.deepEqual(assigned.evaluator_assignments.map(x => x.evaluator_id), ['D', 'E', 'F'].map(id));
  });
  await test('reassignment preserves history, active count and access', async () => {
    expect(await request('/api/evaluations.php?action=start', { actor: 'B', method: 'POST', json: { application_id: first.id } }), 200, 'start B');
    expect(await action(first.id, 'reassign_evaluator', 'secretary', { old_evaluator_id: id('C'), new_evaluator_id: id('D') }), 403, 'non-admin reassignment');
    const changed = expect(await action(first.id, 'reassign_evaluator', 'admin', { old_evaluator_id: id('C'), new_evaluator_id: id('D') }), 200, 'reassign C');
    assert.deepEqual(Object.fromEntries(changed.evaluator_assignments.map(x => [x.evaluator_id, x.status])),
      Object.fromEntries([['A', 'Pending'], ['B', 'In Progress'], ['C', 'Reassigned'], ['D', 'Pending']].map(([name, status]) => [id(name), status])));
    assert.equal(changed.evaluator_assignments.filter(x => x.status !== 'Reassigned').length, 3);
    expect(await request(`/api/applications.php?id=${first.id}`, { actor: 'C' }), 403, 'old evaluator view');
    expect(await request(`/api/applications.php?id=${first.id}`, { actor: 'D' }), 200, 'new evaluator view');
    assert.equal((await request(`/api/documents.php?action=download&id=${firstDoc.id}`, { actor: 'D' })).status, 200);
    expect(await request(`/api/documents.php?action=download&id=${firstDoc.id}`, { actor: 'C' }), 404, 'old evaluator document');
    assert.equal((await request('/api/applications.php', { actor: 'C' })).data.data.some(x => x.id === first.id), false);
    assert.equal((await request('/api/applications.php', { actor: 'D' })).data.data.some(x => x.id === first.id), true);
    expect(await request('/api/evaluations.php?action=start', { actor: 'C', method: 'POST', json: { application_id: first.id } }), 403, 'old evaluator start');
    expect(await action(first.id, 'return_for_revision', 'C', { remarks: 'test' }), 403, 'old evaluator return');
    const route = expect(await request(`/api/award_routes.php?award_id=${id('award-one')}`, { actor: 'admin' }), 200, 'route unchanged');
    assert.deepEqual(route.evaluators.map(x => x.evaluator_id), ['D', 'E', 'F'].map(id));
  });
  await test('only an active assigned evaluator may return an evaluation nomination', async () => {
    expect(await action(second.id, 'return_for_revision', 'A', { remarks: 'Not assigned' }), 403, 'unassigned evaluator return');
    const returned = expect(await action(second.id, 'return_for_revision', 'D', { remarks: 'Synthetic evaluator revision' }), 200, 'active evaluator return');
    assert.equal(returned.status, 'Returned for Revision');
    assert.equal(returned.remarks, 'Synthetic evaluator revision');
    expect(await request(`/api/applications.php?id=${second.id}`, { actor: 'admin', method: 'DELETE', json: {} }), 200, 'delete returned nomination');
  });
  await test('scoring completes only after every active evaluator submits', async () => {
    const submit = async (actor, score) => request('/api/evaluations.php', { actor, method: 'POST', json: { application_id: first.id, scores: [{ criterion_id: id('criterion-one'), score }], general_remarks: 'Synthetic test evaluation' } });
    expect(await action(first.id, 'deliberation', 'secretary', { decision: 'Approved' }), 409, 'early decision');
    for (const [name, score] of [['A', 90], ['B', 80]]) {
      expect(await submit(name, score), 201, `submit ${name}`);
      const app = expect(await request(`/api/applications.php?id=${first.id}`, { actor: 'admin' }), 200, 'progress');
      assert.equal(app.status, 'Under Evaluation'); assert.equal(app.final_weighted_score, null);
    }
    expect(await submit('A', 90), 409, 'duplicate completed submission');
    expect(await action(first.id, 'reassign_evaluator', 'admin', { old_evaluator_id: id('A'), new_evaluator_id: id('E') }), 409, 'completed reassignment');
    expect(await submit('D', 85), 201, 'replacement evaluation');
    const app = expect(await request(`/api/applications.php?id=${first.id}`, { actor: 'admin' }), 200, 'completion');
    assert.equal(app.status, 'Evaluation Completed'); assert.equal(app.processing_stage, 'Deliberation');
    assert.equal(app.final_weighted_score, 85);
    assert.equal(app.evaluations.length, 3);
  });
  await test('qualification boundary, final decision, export and deletion', async () => {
    expect(await action(first.id, 'deliberation', 'filer', { decision: 'Approved' }), 403, 'filer decision');
    const approved = expect(await action(first.id, 'deliberation', 'secretary', { decision: 'Approved', remarks: 'Synthetic approval' }), 200, 'approve at threshold');
    assert.equal(approved.status, 'Approved'); assert.equal(approved.processing_stage, 'Final Decision');
    expect(await action(first.id, 'deliberation', 'secretary', { decision: 'Approved' }), 409, 'duplicate decision');
    const awarded = expect(await action(first.id, 'deliberation', 'secretary', { decision: 'Approved', award_now: true }), 200, 'confer award');
    assert.equal(awarded.status, 'Awarded'); assert.equal(awarded.processing_stage, 'Awarded');
    expect(await request('/api/export.php?format=json', { actor: 'secretary' }), 403, 'non-admin export');
    const exported = await request('/api/export.php?format=json', { actor: 'admin' });
    assert.equal(exported.status, 200);
    assert.ok(!('password_hash' in exported.data.profiles[0]));
    assert.ok(!exported.raw.toString('utf8').includes('"password_hash"'));
    expect(await request(`/api/applications.php?id=${first.id}`, { actor: 'secretary', method: 'DELETE', json: {} }), 403, 'non-admin deletion');
    expect(await request(`/api/applications.php?id=${first.id}`, { actor: 'admin', method: 'DELETE', json: {} }), 200, 'admin deletion');
    expect(await request(`/api/documents.php?action=download&id=${firstDoc.id}`, { actor: 'admin' }), 404, 'deleted document');
  });
  await test('below-threshold score blocks approval; above threshold allows it', async () => {
    async function evaluated(score) {
      const app = await createNomination();
      const doc = expect(await request('/api/documents.php', { method: 'POST', actor: 'filer', form: makeForm(app.id, 'threshold.pdf', pdf) }), 201, 'threshold upload');
      expect(await action(app.id, 'finalize_submission', 'filer', { expected_requirement_ids: [id('requirement-one')] }), 200, 'threshold submit');
      expect(await action(app.id, 'inspect_document', 'head', { document_id: doc.id, status: 'Head Approved' }), 200, 'threshold inspect');
      expect(await action(app.id, 'endorse', 'head', { decision: 'Endorsed' }), 200, 'threshold endorse');
      expect(await action(app.id, 'verify_document', 'secretary', { document_id: doc.id, status: 'Verified' }), 200, 'threshold verify');
      expect(await action(app.id, 'assign_evaluators', 'secretary'), 200, 'threshold assign');
      for (const actor of ['D', 'E', 'F']) expect(await request('/api/evaluations.php', { actor, method: 'POST', json: { application_id: app.id, scores: [{ criterion_id: id('criterion-one'), score }], general_remarks: 'Synthetic threshold test' } }), 201, 'threshold score');
      return app.id;
    }
    const below = await evaluated(84);
    expect(await action(below, 'deliberation', 'secretary', { decision: 'Approved' }), 409, 'below minimum');
    assert.equal(expect(await action(below, 'deliberation', 'secretary', { decision: 'Not Approved' }), 200, 'reject below minimum').status, 'Not Approved');
    const above = await evaluated(86);
    assert.equal(expect(await action(above, 'deliberation', 'secretary', { decision: 'Approved' }), 200, 'approve above minimum').status, 'Approved');
  });
}

try { await main(); }
catch (error) { failed++; console.error(`FAIL — integration setup or workflow: ${error.message}`); }
finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise(ok => server.once('exit', ok)); server.kill(); await stopped;
  }
  if (setupComplete) try { console.log(php('tests/integration_db.php', 'cleanup')); } catch (error) { failed++; console.error(`FAIL — database cleanup: ${error.message}`); }
  const created = readdirSync(storage);
  for (const name of created) rmSync(join(storage, name), { force: true });
  rmdirSync(storage);
  console.log(`${checks} integration groups passed; ${failed} failed.`);
  if (failed && serverErrors) console.error(serverErrors.split('\n').filter(line => /error|exception|fatal/i.test(line)).slice(-8).join('\n'));
  if (failed) process.exitCode = 1;
}
