import test from 'node:test';
import assert from 'node:assert/strict';
import type { AiConsentManifest } from '@rescuerelay/shared';
import { createInvestigationFlow, type InvestigationInput } from './ai';
import { createApiClient, RequestError } from './api';

const manifest: AiConsentManifest = { consentId: 'synthetic-consent', operation: 'investigate', expiresAt: new Date(2000).toISOString(), expectedVersion: 7, payloadSha256: 'a'.repeat(64), providers: ['fireworks', 'pinecone', 'langsmith'], dataCategories: ['Scoped operational data'], payloadPreview: { provider: 'fireworks' }, maximumRequests: 12, retentionNotice: 'Vendor terms apply; no verified credit cap.', requiresExplicitConfirmation: true, executionMode: 'external', executionAvailable: true };
function fixture(options: { available?: boolean; fail?: 'timeout' | 'http'; invalid?: boolean } = {}) {
  const calls: { path: string; body: any }[] = [];
  let now = 1000;
  const request = createApiClient('https://local.test/api', async (url, init) => {
    const path = new URL(String(url)).pathname; calls.push({ path, body: JSON.parse(init?.body as string) });
    if (path.endsWith('/consents')) return new Response(JSON.stringify({ ...manifest, executionAvailable: options.available ?? true, ...(options.invalid ? { operation: 'policy_search' } : {}) }));
    if (options.fail === 'timeout') return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort'))));
    if (options.fail === 'http') return new Response(JSON.stringify({ error: 'Already consumed', code: 'CONSENT_INVALID' }), { status: 403 });
    return new Response(JSON.stringify({ snapshot: { version: 8 }, summary: 'Proposal only.', warnings: [] }));
  }, 5);
  return { flow: createInvestigationFlow(request, () => now), calls, advance: () => { now = 3000; } };
}
test('AI consent preparation sends only the local preview request, never an operation', async () => {
  const f = fixture();
  const consent = await f.flow.prepare('session', { provider: 'fireworks', usePinecone: true, trace: true }, 7);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].path, '/api/ai/consents');
  assert.deepEqual(consent.manifest.providers, ['fireworks', 'pinecone', 'langsmith']);
  await assert.rejects(f.flow.execute(consent, 'session', 7, false), error => error instanceof RequestError && error.code === 'CONFIRMATION_REQUIRED');
  assert.equal(f.calls.length, 1);
});
test('AI explicit confirmation sends captured exact payload once despite later form edits', async () => {
  const f = fixture(); const input: InvestigationInput = { provider: 'fireworks', rescueIds: ['r-101'], trace: true };
  const consent = await f.flow.prepare('session', input, 7);
  input.provider = 'openai'; input.rescueIds!.push('r-other'); input.trace = false;
  await f.flow.execute(consent, 'session', 7, true);
  assert.deepEqual(f.calls[1].body, { operation: 'investigate', input: { provider: 'fireworks', rescueIds: ['r-101'], trace: true }, expectedVersion: 7, consentId: manifest.consentId });
  await assert.rejects(f.flow.execute(consent, 'session', 7, true), /No request was repeated/);
  assert.equal(f.calls.length, 2);
});
for (const failure of ['timeout', 'http'] as const) test(`AI ${failure} never automatically retries or reuses consumed consent`, async () => {
  const f = fixture({ fail: failure }); const consent = await f.flow.prepare('session', { provider: 'fireworks' }, 7);
  await assert.rejects(f.flow.execute(consent, 'session', 7, true));
  await assert.rejects(f.flow.execute(consent, 'session', 7, true), /No request was repeated/);
  assert.equal(f.calls.filter(call => call.path.endsWith('/operations')).length, 1);
});
for (const condition of ['expired', 'stale', 'session', 'disabled', 'discarded', 'cleared'] as const) test(`AI ${condition} consent is blocked before an operation request`, async () => {
  const f = fixture({ available: condition !== 'disabled' }); const consent = await f.flow.prepare('session', { provider: 'fireworks' }, 7);
  if (condition === 'expired') f.advance();
  if (condition === 'discarded') f.flow.discard(consent);
  if (condition === 'cleared') f.flow.clear();
  await assert.rejects(f.flow.execute(consent, condition === 'session' ? 'other-session' : 'session', condition === 'stale' ? 8 : 7, true));
  assert.equal(f.calls.length, 1);
});
test('AI malformed consent does not become executable', async () => {
  const f = fixture({ invalid: true });
  await assert.rejects(f.flow.prepare('session', { provider: 'fireworks' }, 7), /invalid consent preview/);
  assert.equal(f.calls.length, 1);
});
