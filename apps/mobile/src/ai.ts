import type { AiConsentManifest, AiOperationInput, AiOperationResponse } from '@rescuerelay/shared';
import { createApiClient, RequestError } from './api';

export type InvestigationInput = Extract<AiOperationInput, { operation: 'investigate' }>['input'];
export interface PreparedInvestigation { readonly manifest: AiConsentManifest }
type Request = ReturnType<typeof createApiClient>;

/** Local one-use guard in addition to the server's authoritative consent checks.
 * No retries, provider fallback, disk persistence, or operation during preparation.
 */
export function createInvestigationFlow(request: Request, now: () => number = Date.now, operationRequest: Request = request) {
  const pending = new Map<PreparedInvestigation, { token: string; body: { operation: 'investigate'; input: InvestigationInput; expectedVersion: number }; expires: number; available: boolean; consentId: string }>();
  return {
    async prepare(token: string, input: InvestigationInput, expectedVersion: number): Promise<PreparedInvestigation> {
      // Capture the exact values now; later form edits cannot modify the reviewed request.
      const body = { operation: 'investigate' as const, input: JSON.parse(JSON.stringify(input)) as InvestigationInput, expectedVersion };
      const manifest = await request<AiConsentManifest>('/ai/consents', token, body);
      if (manifest.operation !== body.operation || manifest.expectedVersion !== expectedVersion || manifest.requiresExplicitConfirmation !== true || !Number.isFinite(Date.parse(manifest.expiresAt))) {
        throw new RequestError('The API returned an invalid consent preview. Nothing was executed.', 502, 'INVALID_RESPONSE');
      }
      const prepared = { manifest };
      pending.set(prepared, { token, body, expires: Date.parse(manifest.expiresAt), available: manifest.executionAvailable, consentId: manifest.consentId });
      return prepared;
    },
    discard(prepared: PreparedInvestigation) { pending.delete(prepared); },
    clear() { pending.clear(); },
    async execute(prepared: PreparedInvestigation, token: string, expectedVersion: number, explicitlyConfirmed: boolean): Promise<AiOperationResponse> {
      if (!explicitlyConfirmed) throw new RequestError('Review the transfer preview and explicitly confirm before running.', 403, 'CONFIRMATION_REQUIRED');
      const saved = pending.get(prepared);
      if (!saved) throw new RequestError('This consent is no longer available. No request was repeated. Refresh and prepare a new preview if appropriate.', 403, 'CONSENT_INVALID');
      // Consume locally before any network work, including failures and uncertain timeouts.
      pending.delete(prepared);
      if (saved.token !== token) throw new RequestError('The session changed. Prepare a new consent in this session.', 403, 'CONSENT_INVALID');
      if (saved.body.expectedVersion !== expectedVersion) throw new RequestError('The workspace changed. Review a fresh consent before running.', 409, 'STALE_VERSION');
      if (saved.expires <= now()) throw new RequestError('Consent expired. Prepare and review a fresh preview.', 403, 'CONSENT_EXPIRED');
      if (!saved.available) throw new RequestError('Required integrations are disabled or unconfigured. No external call was made.', 403, 'ADAPTER_UNAVAILABLE');
      return operationRequest<AiOperationResponse>('/ai/operations', token, { ...saved.body, consentId: saved.consentId });
    },
  };
}
