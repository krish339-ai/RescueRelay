import type { OrgState } from "../state.js";
import { evaluateCandidate } from "../planner.js";
import { aiState } from "./state.js";
import { assert } from "../errors.js";
/** Complete local evidence envelope available to read-only investigation tools. No identities or contacts. */
export function investigationEvidence(
  state: OrgState,
  ids: string[] | undefined,
  asOf: number,
) {
  const selected =
    ids ??
    state.rescues.filter((r) => r.status === "needs_recovery").map((r) => r.id);
  const incidents = state.rescues
    .filter((r) => selected.includes(r.id))
    .map((r) => {
      const d = state.donations.find((d) => d.id === r.donationId)!,
        recipient = state.recipients.find((x) => x.id === r.recipientId)!;
      return {
        id: r.id,
        status: r.status,
        category: d.category,
        sealed: d.sealed,
        weightKg: d.weightKg,
        pickupWindow: d.pickupWindow,
        deliveryWindow: r.deliveryWindow,
        acceptedCategories: recipient.acceptedCategories,
        capacityKg: recipient.capacityKg,
        openingWindow: recipient.openingWindow,
      };
    });
  const volunteers = state.volunteers.map((v) => ({
    id: v.id,
    available: v.available,
    trained: v.trained,
    capacityKg: v.capacityKg,
    availability: v.availability,
  }));
  const checks = state.rescues
    .filter((r) => selected.includes(r.id))
    .map((r) => ({
      rescueId: r.id,
      candidates: state.volunteers.map((v) => {
        const c = evaluateCandidate(state, r, v, asOf);
        return {
          volunteerId: v.id,
          feasible: c.feasible,
          score: c.score,
          travelMinutes: c.travelMinutes,
          routeSource: c.routeSource,
          checks: c.checks,
        };
      }),
    }));
  const envelope = {
    asOf: new Date(asOf).toISOString(),
    incidents,
    volunteers,
    configuredPolicies: state.policies.map((p) => ({
      policyId: p.id,
      title: p.title,
      excerpt: p.text,
      source: p.source,
      version: p.version,
    })),
    approvedReferencePolicies: aiState(state).referencePolicies.map((p) => ({
      policyId: p.id,
      title: p.title,
      excerpt: p.text,
      source: p.source,
      version: p.version,
      authority: "reference_only",
    })),
    candidateChecks: checks,
  };
  assert(
    Buffer.byteLength(JSON.stringify(envelope)) <= 64000,
    422,
    "AI_CONTEXT_LIMIT",
    "The sanitized evidence envelope exceeds 64 KiB. Select fewer incidents or use the offline planner. Byte limits are not token or spending caps.",
  );
  return envelope;
}
