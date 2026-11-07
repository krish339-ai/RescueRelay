/** Mobile consent controller + real API; all vendor I/O is a local mock. No sockets or keys. */
import assert from 'node:assert/strict';
import { createApp } from '../../api/src/app.ts';
import { loadAiSettings } from '../../api/src/ai/config.ts';
import { createApiClient, RequestError } from '../src/api.ts';
import { createInvestigationFlow } from '../src/ai.ts';
import { canApprove } from '../src/domain.ts';
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const createClient = app => createApiClient('http://local-test/api', async (url, init) => {
  const response = await app.inject({ method: init?.method ?? 'GET', url: new URL(url).pathname, headers: init?.headers, payload: init?.body });
  return new Response(response.payload, { status: response.statusCode, headers: { 'Content-Type': 'application/json' } });
});
let disabledCalls = 0;
const disabled = await createApp({ databasePath: ':memory:', demoMode: true, rateLimit: false, ai: { settings: loadAiSettings({}), fetch: async () => { disabledCalls++; throw new Error('Forbidden external call'); } } });
try {
  const client = createClient(disabled.app); const flow = createInvestigationFlow(client);
  const coordinator = await client('/auth/demo', null, { role: 'coordinator' }); const snapshot = await client('/snapshot', coordinator.token);
  const caps = await client('/ai/capabilities', coordinator.token);
  assert.equal(caps.externalCallsEnabled, false); assert.ok(caps.providers.every(provider => !provider.enabled && !provider.configured && !provider.liveTested));
  const consent = await flow.prepare(coordinator.token, { provider: 'fireworks', rescueIds: ['r-101'], usePinecone: true, trace: true }, snapshot.version);
  assert.equal(consent.manifest.executionAvailable, false); assert.deepEqual(consent.manifest.providers, ['fireworks', 'pinecone', 'langsmith']);
  await assert.rejects(flow.execute(consent, coordinator.token, snapshot.version, true), error => error instanceof RequestError && error.code === 'ADAPTER_UNAVAILABLE');
  assert.equal(disabledCalls, 0);
  const volunteer = await client('/auth/demo', null, { role: 'volunteer' });
  await assert.rejects(client('/ai/capabilities', volunteer.token), error => error instanceof RequestError && error.status === 403);
  console.log('PASS native AI status/preview default OFF, no egress, role guard');
} finally { await disabled.app.close(); }

for (const provider of ['fireworks', 'nebius', 'openai']) {
  let vendorCalls = 0;
  const env = { AI_EXTERNAL_CALLS_ENABLED: 'true', [`${provider.toUpperCase()}_ENABLED`]: 'true', [`${provider.toUpperCase()}_API_KEY`]: 'synthetic-test-only-not-a-key', [`${provider.toUpperCase()}_MODEL`]: 'synthetic-mock-model' };
  const fixture = await createApp({ databasePath: ':memory:', demoMode: true, rateLimit: false, ai: { settings: loadAiSettings(env), fetch: async (url, init) => {
    const tools = ['inspect_incident', 'retrieve_policy', 'check_candidates']; const tool = tools[vendorCalls++];
    assert.equal(JSON.parse(init.body).model, 'synthetic-mock-model');
    const args = JSON.stringify(tool === 'retrieve_policy' ? { query: 'handling capacity approval' } : { rescueId: 'r-101' });
    if (provider === 'openai') { assert.equal(String(url), 'https://api.openai.com/v1/responses'); return json({ output: tool ? [{ type: 'function_call', call_id: `call${vendorCalls}`, name: tool, arguments: args }] : [{ type: 'message', content: [{ type: 'output_text', text: 'Mock evidence reviewed. Human approval required.' }] }] }); }
    assert.ok(String(url).endsWith('/chat/completions'));
    return json({ choices: [{ message: tool ? { content: null, tool_calls: [{ id: `call${vendorCalls}`, type: 'function', function: { name: tool, arguments: args } }] } : { content: 'Mock evidence reviewed. Human approval required.' } }] });
  } } });
  try {
    const client = createClient(fixture.app); const flow = createInvestigationFlow(client);
    const coordinator = await client('/auth/demo', null, { role: 'coordinator' }); const before = await client('/snapshot', coordinator.token);
    const input = { provider, rescueIds: ['r-101'], usePinecone: false, trace: false };
    const consent = await flow.prepare(coordinator.token, input, before.version);
    assert.equal(vendorCalls, 0); assert.equal(consent.manifest.executionAvailable, true);
    await assert.rejects(flow.execute(consent, coordinator.token, before.version, false), /explicitly confirm/); assert.equal(vendorCalls, 0);
    const result = await flow.execute(consent, coordinator.token, before.version, true);
    assert.equal(vendorCalls, 4); assert.equal(result.plan.status, 'ready'); assert.ok(result.plan.citations.length && result.plan.trace.length);
    assert.equal(result.receipt.status, 'completed'); assert.equal(result.receipt.requestCount, 4);
    const workspace = await client('/ai/drafts', coordinator.token);
    assert.equal(workspace.receipts[0].id, result.receipt.id); assert.equal(vendorCalls, 4);
    assert.equal(canApprove(result.plan, result.snapshot.version), true);
    assert.deepEqual(result.snapshot.rescues, before.rescues);
    await assert.rejects(flow.execute(consent, coordinator.token, before.version, true), /No request was repeated/);
    await assert.rejects(client('/ai/operations', coordinator.token, { operation: 'investigate', input, expectedVersion: before.version, consentId: consent.manifest.consentId }), error => error instanceof RequestError && error.code === 'CONSENT_INVALID');
    assert.equal(vendorCalls, 4);
    const applied = await client(`/plans/${result.plan.id}/apply`, coordinator.token, { expectedVersion: result.snapshot.version, idempotencyKey: `native-ai-${provider}-separate-approval` });
    assert.equal(applied.plan.status, 'applied');
    console.log(`PASS native ${provider} explicit one-use consent → mocked investigation → separate real recovery approval`);
  } finally { await fixture.app.close(); }
}

let uncertainCalls = 0;
const uncertain = await createApp({ databasePath: ':memory:', demoMode: true, rateLimit: false, ai: {
  settings: loadAiSettings({ AI_EXTERNAL_CALLS_ENABLED: 'true', FIREWORKS_ENABLED: 'true', FIREWORKS_API_KEY: 'synthetic-test-only-not-a-key', FIREWORKS_MODEL: 'synthetic-mock-model' }),
  fetch: async () => { uncertainCalls++; throw new Error('Synthetic ambiguous transport failure'); },
} });
try {
  const client = createClient(uncertain.app); const flow = createInvestigationFlow(client);
  const coordinator = await client('/auth/demo', null, { role: 'coordinator' }); const before = await client('/snapshot', coordinator.token);
  const consent = await flow.prepare(coordinator.token, { provider: 'fireworks', rescueIds: ['r-101'] }, before.version);
  await assert.rejects(flow.execute(consent, coordinator.token, before.version, true), error => error instanceof RequestError && error.code === 'EXTERNAL_OUTCOME_UNKNOWN');
  const workspace = await client('/ai/drafts', coordinator.token);
  assert.equal(workspace.receipts[0].status, 'outcome_unknown'); assert.equal(workspace.receipts[0].requestCount, 1);
  assert.match(workspace.receipts[0].guidance, /Do not automatically replay/);
  await assert.rejects(flow.execute(consent, coordinator.token, before.version, true), /No request was repeated/);
  assert.equal(uncertainCalls, 1);
  const after = await client('/snapshot', coordinator.token);
  assert.deepEqual(after.rescues, before.rescues); assert.equal(after.plans.length, before.plans.length);
  console.log('PASS native uncertain external outcome retained as a local receipt; no replay, plan or assignment');
} finally { await uncertain.app.close(); }
