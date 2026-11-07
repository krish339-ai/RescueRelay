import type { RecoveryPlan, Rescue, Snapshot } from "@rescuerelay/shared";

export const PIPELINE_LANES = [
  "recovery", "approval", "acceptance", "assigned", "transit", "completed", "cancelled",
] as const;
export type PipelineLane = (typeof PIPELINE_LANES)[number];

/** A reviewable proposal as of the last successful snapshot, not permission to apply it.
 * The server rechecks wall-clock expiry, version and all assignment constraints on approval.
 * Keeping snapshot time here makes refreshes deterministic and never invents a live status.
 */
export function approvalPlan(rescue: Rescue, snapshot: Snapshot): RecoveryPlan | undefined {
  if (rescue.status !== "needs_recovery") return undefined;
  const observedAt = Date.parse(snapshot.serverTime);
  return snapshot.plans.find((plan) =>
    plan.status === "ready" &&
    plan.baseVersion === snapshot.version &&
    Date.parse(plan.expiresAt) > observedAt &&
    plan.incidentIds.includes(rescue.id) &&
    plan.replacements.some((replacement) => replacement.rescueId === rescue.id),
  );
}

/** Each stored state has exactly one display lane; no mutation or authorization occurs here. */
export function pipelineLane(rescue: Rescue, snapshot: Snapshot): PipelineLane {
  switch (rescue.status) {
    case "needs_recovery": return approvalPlan(rescue, snapshot) ? "approval" : "recovery";
    case "escalated": return "recovery";
    case "assigned":
      if (!rescue.volunteerId) return "recovery";
      return rescue.acceptedAt ? "assigned" : "acceptance";
    case "picked_up": return "transit";
    case "delivered": return "completed";
    case "cancelled": return "cancelled";
  }
}

export function buildPipeline(snapshot: Snapshot): Record<PipelineLane, Rescue[]> {
  const lanes: Record<PipelineLane, Rescue[]> = {
    recovery: [], approval: [], acceptance: [], assigned: [], transit: [], completed: [], cancelled: [],
  };
  for (const rescue of snapshot.rescues) lanes[pipelineLane(rescue, snapshot)].push(rescue);
  return lanes;
}

/** Missing historic acceptance timestamps must not imply a pending terminal assignment. */
export function acceptanceLabel(rescue: Rescue): string {
  return rescue.status === "assigned" ? (rescue.acceptedAt ? " · accepted" : " · not yet accepted") : "";
}
