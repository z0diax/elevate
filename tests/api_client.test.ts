import assert from 'node:assert/strict';
import test from 'node:test';
import { praiseService } from '../src/lib/api';

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
    assert.ok(calls.every(call => call.init.credentials === 'same-origin'));
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
