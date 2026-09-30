import assert from 'node:assert/strict';
import test from 'node:test';
import { praiseService } from '../src/lib/api';
import { apiRequest, rememberCsrfToken } from '../src/lib/api/client';
import { clearCaches, state } from '../src/lib/api/state';

test('PHP API client keeps session credentials and CSRF on route writes', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const user = {
    id: 'test-admin', email: 'admin@example.invalid', full_name: 'Test Administrator',
    role: 'ADMINISTRATOR', csrf_token: 'synthetic-csrf-token',
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const data = url.includes('auth.php?action=login') || url.includes('auth.php?action=current')
      ? user
      : url.includes('award_routes.php?action=evaluators') ? []
      : url.includes('award_routes.php') ? { id: 'test-route' }
      : null;
    return new Response(JSON.stringify({ status: 'success', message: '', data, timestamp: '' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    assert.equal((await praiseService.login(user.email, 'synthetic-password')).id, user.id);
    assert.equal((await praiseService.getSessionUser())?.id, user.id);
    assert.equal((await praiseService.getAvailableEvaluators()).length, 0);
    assert.equal((await praiseService.getAwardEvaluationRoute('award-1'))?.id, 'test-route');
    await praiseService.saveAwardEvaluationRoute('award-1', 3, ['A', 'B', 'C'], true);
    await praiseService.logout();

    assert.equal(calls.length, 6);
    assert.ok(calls.every(call => call.init.credentials === 'include'));
    assert.equal((calls[0].init.headers as Headers).get('X-CSRF-Token'), null);
    assert.equal((calls[1].init.headers as Headers).get('X-CSRF-Token'), null);
    assert.equal((calls[4].init.headers as Headers).get('X-CSRF-Token'), user.csrf_token);
    assert.equal((calls[5].init.headers as Headers).get('X-CSRF-Token'), user.csrf_token);
    assert.deepEqual(JSON.parse(String(calls[4].init.body)), {
      required_evaluators: 3, evaluator_ids: ['A', 'B', 'C'], is_active: true,
    });
    assert.equal(praiseService.getCurrentUser(), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shared client preserves JSON, FormData, CSRF, and response errors', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify({ status: 'success', message: '', data: { ok: true }, timestamp: '' }), { status: 200 });
  };
  rememberCsrfToken({ csrf_token: 'test-token' });

  try {
    assert.deepEqual(await apiRequest<{ ok: boolean }>('health.php'), { ok: true });
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.deepEqual(await apiRequest<{ ok: boolean }>('applications.php', {
        method, body: JSON.stringify({ value: method }),
      }), { ok: true });
    }
    const form = new FormData();
    form.append('application_id', 'app-1');
    await apiRequest('documents.php', { method: 'POST', body: form });

    assert.ok(calls.every(call => call.init.credentials === 'include'));
    assert.equal((calls[0].init.headers as Headers).get('X-CSRF-Token'), null);
    assert.equal((calls[0].init.headers as Headers).get('Accept'), 'application/json');
    for (const call of calls.slice(1)) {
      assert.equal((call.init.headers as Headers).get('X-CSRF-Token'), 'test-token');
    }
    assert.deepEqual(JSON.parse(String(calls[1].init.body)), { value: 'POST' });
    assert.equal((calls[1].init.headers as Headers).get('Content-Type'), 'application/json');
    assert.equal((calls[5].init.headers as Headers).get('Content-Type'), null);
    assert.equal((calls[5].init.body as FormData).get('application_id'), 'app-1');

    globalThis.fetch = async () => new Response(JSON.stringify({ status: 'error', message: 'Invalid request.', data: [], timestamp: '' }), { status: 400 });
    await assert.rejects(apiRequest('applications.php'), /Invalid request\./);
    globalThis.fetch = async () => new Response(JSON.stringify({ status: 'error', message: 'Internal SQL detail', data: [], timestamp: '' }), { status: 500 });
    await assert.rejects(apiRequest('applications.php'), /The server could not complete the request/);
    globalThis.fetch = async () => new Response('not-json', { status: 200 });
    await assert.rejects(apiRequest('applications.php'), /unexpected response/);
    globalThis.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(apiRequest('applications.php'), /offline/);

    state.currentUser = { id: 'admin-1', role: 'ADMINISTRATOR' } as typeof state.currentUser;
    globalThis.fetch = async () => new Response(JSON.stringify({ status: 'error', message: 'Authentication required.', data: [], timestamp: '' }), { status: 401 });
    await assert.rejects(apiRequest('applications.php'), /Authentication required/);
    assert.equal(state.currentUser, null);
    globalThis.fetch = async (_input, init) => {
      assert.equal((init?.headers as Headers).get('X-CSRF-Token'), null);
      return new Response(JSON.stringify({ status: 'success', message: '', data: {}, timestamp: '' }), { status: 200 });
    };
    await apiRequest('applications.php', { method: 'POST', body: '{}' });
  } finally {
    globalThis.fetch = originalFetch;
    clearCaches();
  }
});

test('document upload uses the shared client without a JSON content type', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  let request: RequestInit | undefined;
  globalThis.window = { location: { origin: 'http://localhost', pathname: '/', href: 'http://localhost/' } } as Window & typeof globalThis;
  globalThis.fetch = async (_input, init) => {
    request = init;
    return new Response(JSON.stringify({
      status: 'success', message: '', timestamp: '',
      data: { id: 'doc-1', application_id: 'app-1', document_name: 'Evidence', file_url: 'stored.pdf', status: 'Submitted' },
    }), { status: 200 });
  };
  rememberCsrfToken({ csrf_token: 'upload-token' });
  try {
    const file = new File(['synthetic document'], 'evidence.pdf', { type: 'application/pdf' });
    const document = await praiseService.uploadApplicationDocument('app-1', file, 'Evidence', 'req-1', undefined, false);
    assert.equal(document.id, 'doc-1');
    assert.equal(document.file_url, 'http://localhost/api/documents.php?action=download&id=doc-1');
    assert.equal(request?.credentials, 'include');
    assert.equal((request?.headers as Headers).get('X-CSRF-Token'), 'upload-token');
    assert.equal((request?.headers as Headers).get('Content-Type'), null);
    assert.equal((request?.body as FormData).get('application_id'), 'app-1');
    assert.equal((request?.body as FormData).get('requirement_id'), 'req-1');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    clearCaches();
  }
});
