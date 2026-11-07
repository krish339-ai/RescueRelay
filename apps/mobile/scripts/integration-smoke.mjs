/** Runs the real mobile transport against the real API in-process, with an isolated in-memory DB. */
import assert from 'node:assert/strict';
import { createApp } from '../../api/src/app.ts';
import { createApiClient, RequestError } from '../src/api.ts';
import { actionForRescue, canApprove } from '../src/domain.ts';
const { app } = await createApp({ databasePath: ':memory:', demoMode: true, rateLimit: false });
const client = createApiClient('http://local-test/api', async (url, init) => {
  const result = await app.inject({ method: init?.method ?? 'GET', url: new URL(url).pathname, headers: init?.headers, payload: init?.body });
  return new Response(result.payload, { status: result.statusCode, headers: { 'Content-Type': 'application/json' } });
});
const log = message => console.log(`PASS ${message}`);
try {
  await assert.rejects(client('/snapshot'), error => error instanceof RequestError && error.status === 401);
  const coordinator = await client('/auth/demo', null, { role: 'coordinator' });
  let snapshot = await client('/snapshot', coordinator.token);
  const proposed = await client('/plans/generate', coordinator.token, { expectedVersion: snapshot.version });
  assert.ok(proposed.plan.citations.length && proposed.plan.trace.length && proposed.plan.candidates.length);
  assert.equal(canApprove(proposed.plan, proposed.snapshot.version), true);
  const approval = { expectedVersion: proposed.snapshot.version, idempotencyKey: 'mobile-integration-approval-1' };
  const applied = await client(`/plans/${proposed.plan.id}/apply`, coordinator.token, approval);
  assert.equal(applied.plan.status, 'applied');
  const replay = await client(`/plans/${proposed.plan.id}/apply`, coordinator.token, approval);
  assert.equal(replay.snapshot.version, applied.snapshot.version);
  log('real recovery evidence, explicit versioned approval, idempotent replay');

  const volunteer = await client('/auth/demo', null, { role: 'volunteer' });
  let volunteerState = await client('/snapshot', volunteer.token);
  assert.equal(volunteerState.plans.length, 0); assert.equal(volunteerState.audit.length, 0);
  assert.ok(volunteerState.rescues.every(r => r.volunteerId === volunteer.user.volunteerId));
  const job = volunteerState.rescues.find(r => r.status === 'assigned'); assert.ok(job);
  assert.equal(actionForRescue(job, 'volunteer'), 'accept');
  volunteerState = await client(`/rescues/${job.id}/accept`, volunteer.token, { expectedVersion: volunteerState.version });
  assert.ok(volunteerState.rescues.find(r => r.id === job.id).acceptedAt);
  volunteerState = await client(`/rescues/${job.id}/status`, volunteer.token, { expectedVersion: volunteerState.version, status: 'picked_up' });
  volunteerState = await client(`/rescues/${job.id}/status`, volunteer.token, { expectedVersion: volunteerState.version, status: 'delivered' });
  assert.equal(volunteerState.rescues.find(r => r.id === job.id).status, 'delivered');
  log('volunteer filtered reads, accept, pickup, delivery');

  const recipient = await client('/auth/demo', null, { role: 'recipient' });
  snapshot = await client('/snapshot', coordinator.token);
  const incoming = snapshot.rescues.find(r => r.recipientId === recipient.user.recipientId && r.status === 'assigned'); assert.ok(incoming);
  snapshot = await client(`/rescues/${incoming.id}/accept`, coordinator.token, { expectedVersion: snapshot.version });
  snapshot = await client(`/rescues/${incoming.id}/status`, coordinator.token, { expectedVersion: snapshot.version, status: 'picked_up' });
  snapshot = await client(`/rescues/${incoming.id}/status`, coordinator.token, { expectedVersion: snapshot.version, status: 'delivered' });
  let recipientState = await client('/snapshot', recipient.token);
  assert.ok(recipientState.rescues.every(r => r.recipientId === recipient.user.recipientId));
  recipientState = await client(`/rescues/${incoming.id}/confirm`, recipient.token, { expectedVersion: recipientState.version });
  assert.ok(recipientState.rescues.find(r => r.id === incoming.id).recipientConfirmedAt);
  log('recipient filtered reads and delivery receipt');

  snapshot = await client('/snapshot', coordinator.token);
  snapshot = await client('/demo/reset', coordinator.token, { expectedVersion: snapshot.version, scenario: 'baseline' });
  volunteerState = await client('/snapshot', volunteer.token);
  const cancelled = volunteerState.rescues.find(r => r.status === 'assigned'); assert.ok(cancelled);
  await client(`/rescues/${cancelled.id}/cancel`, volunteer.token, { expectedVersion: volunteerState.version, reason: 'Synthetic integration: vehicle unavailable' });
  snapshot = await client('/snapshot', coordinator.token);
  assert.equal(snapshot.rescues.find(r => r.id === cancelled.id).status, 'needs_recovery');
  await assert.rejects(client('/plans/generate', coordinator.token, { expectedVersion: snapshot.version - 1 }), error => error instanceof RequestError && error.status === 409);
  await client('/auth/logout', volunteer.token, {});
  await assert.rejects(client('/snapshot', volunteer.token), error => error instanceof RequestError && error.status === 401);
  log('cancellation recovery, stale-version rejection, session revocation');
  console.log('Mobile transport integration: all checks passed. No network or real-world dispatch.');
} finally { await app.close(); }
await import('./ai-integration.mjs');
