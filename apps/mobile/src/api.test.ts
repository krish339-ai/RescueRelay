import test from 'node:test';
import assert from 'node:assert/strict';
import { conflictMessage, createApiClient, normalizeApiUrl, RequestError } from './api';
import { actionForRescue, canApprove } from './domain';
import type { Rescue, RecoveryPlan } from '@rescuerelay/shared';

test('configuration requires an explicit http(s) endpoint, never credentials', () => {
  assert.equal(normalizeApiUrl(undefined), null);
  assert.equal(normalizeApiUrl('same-origin'), null);
  assert.equal(normalizeApiUrl('same-origin', 'https://preview.example'), 'https://preview.example/api');
  assert.equal(normalizeApiUrl('ftp://example.com'), null);
  assert.equal(normalizeApiUrl('https://user:secret@example.com/api'), null);
  assert.equal(normalizeApiUrl(' http://10.0.2.2:4000/api/ '), 'http://10.0.2.2:4000/api');
});
test('authenticated mutation sends the expected version once', async () => {
  let calls = 0;
  const client = createApiClient('http://test/api', async (url, init) => {
    calls++; assert.equal(url, 'http://test/api/rescues/r-1/status');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer private-token');
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(init?.body as string), { expectedVersion: 4, status: 'picked_up' });
    return new Response(JSON.stringify({ version: 5 }), { status: 200 });
  });
  assert.deepEqual(await client('/rescues/r-1/status', 'private-token', { expectedVersion: 4, status: 'picked_up' }), { version: 5 });
  assert.equal(calls, 1);
});
test('stale mutations surface a conflict without automatic replay', async () => {
  let calls = 0;
  const client = createApiClient('http://test/api', async () => { calls++; return new Response(JSON.stringify({ error: 'Review the latest state.', code: 'STALE_VERSION' }), { status: 409 }); });
  await assert.rejects(client('/plans/p-1/apply', 'token', { expectedVersion: 3 }), (error) => error instanceof RequestError && error.code === 'STALE_VERSION' && error.status === 409);
  assert.equal(calls, 1);
});
test('network failures do not claim that mutations failed or succeeded', async () => {
  const client = createApiClient('http://test/api', async () => { throw new TypeError('network'); });
  await assert.rejects(client('/rescue', 'token', {}), /may have reached the server/);
});
test('request timeout is bounded and does not replay', async () => {
  const client = createApiClient('http://test/api', async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort')))), 5);
  await assert.rejects(client('/snapshot'), /did not respond in time/);
});
test('role actions do not enable invalid backward transitions', () => {
  const rescue = { status: 'assigned' } as Rescue;
  assert.equal(actionForRescue(rescue, 'volunteer'), 'accept');
  assert.equal(actionForRescue({ ...rescue, acceptedAt: '2026-01-01' }, 'volunteer'), 'pickup');
  assert.equal(actionForRescue(rescue, 'recipient'), null);
  assert.equal(actionForRescue({ ...rescue, status: 'picked_up' }, 'volunteer'), 'deliver');
  assert.equal(actionForRescue({ ...rescue, status: 'delivered' }, 'recipient'), 'confirm');
  assert.equal(actionForRescue({ ...rescue, status: 'delivered', recipientConfirmedAt: '2026-01-01' }, 'recipient'), null);
});
test('approval is disabled for stale, expired, applied, or empty plans', () => {
  const plan = { status: 'ready', baseVersion: 5, expiresAt: new Date(2000).toISOString(), replacements: [{}] } as RecoveryPlan;
  assert.equal(canApprove(plan, 5, 1000), true);
  assert.equal(canApprove(plan, 6, 1000), false);
  assert.equal(canApprove(plan, 5, 3000), false);
  assert.equal(canApprove({ ...plan, status: 'applied' }, 5, 1000), false);
  assert.equal(canApprove({ ...plan, replacements: [] }, 5, 1000), false);
});

test('conflict feedback distinguishes stale evidence from active-custody policy blocks', () => {
  const policy = new RequestError('Resolve the active assignment first.', 409, 'ACTIVE_COMMITMENT');
  assert.equal(conflictMessage(policy), policy.message);
  assert.match(conflictMessage(new RequestError('Stale', 409, 'STALE_VERSION')), /Nothing was automatically replayed/);
});
