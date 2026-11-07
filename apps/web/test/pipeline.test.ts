import { acceptanceLabel } from "../src/pipeline";
import test from "node:test";
import assert from "node:assert/strict";
import type { RecoveryPlan, Rescue, Snapshot } from "@rescuerelay/shared";
import { approvalPlan, buildPipeline, pipelineLane, PIPELINE_LANES } from "../src/pipeline.ts";

const at = "2026-10-30T20:00:00Z";
const rescue = (overrides: Partial<Rescue> = {}): Rescue => ({
  id: "rescue-a", donationId: "offer-a", recipientId: "recipient-a", volunteerId: null,
  status: "needs_recovery", deliveryWindow: { start: at, end: "2026-10-30T22:00:00Z" },
  createdAt: at, updatedAt: at, ...overrides,
});
const plan = (overrides: Partial<RecoveryPlan> = {}): RecoveryPlan => ({
  id: "plan-a", orgId: "org-a", baseVersion: 7, status: "ready", createdAt: at,
  expiresAt: "2026-10-30T20:10:00Z", incidentIds: ["rescue-a"], summary: "Review coverage",
  explanationMode: "offline-bounded", candidates: [], citations: [], trace: [], warnings: [], escalations: [],
  replacements: [{ rescueId: "rescue-a", volunteerId: "volunteer-a", pickupEta: at, deliveryEta: at, travelMinutes: 10 }],
  ...overrides,
});
// These functions deliberately depend only on the snapshot fields shown here.
const snapshot = (rescues: Rescue[], plans: RecoveryPlan[] = []): Snapshot => ({
  rescues, plans, version: 7, serverTime: at,
}) as Snapshot;

test("every rescue occupies exactly one lane including terminal and escalated records", () => {
  const rescues = [
    rescue({ id: "recovery" }), rescue({ id: "escalated", status: "escalated", custodyHeld: true }),
    rescue({ id: "rescue-a" }),
    rescue({ id: "acceptance", status: "assigned", volunteerId: "v1" }),
    rescue({ id: "assigned", status: "assigned", volunteerId: "v2", acceptedAt: at }),
    rescue({ id: "transit", status: "picked_up", volunteerId: "v3" }),
    rescue({ id: "completed", status: "delivered", recipientConfirmedAt: at }),
    rescue({ id: "cancelled", status: "cancelled" }),
    rescue({ id: "unassigned", status: "assigned" }),
  ];
  const lanes = buildPipeline(snapshot(rescues, [plan()]));
  const all = PIPELINE_LANES.flatMap((lane) => lanes[lane]);
  assert.equal(all.length, rescues.length);
  assert.equal(new Set(all.map((r) => r.id)).size, rescues.length);
  assert.deepEqual(lanes.recovery.map((r) => r.id), ["recovery", "escalated", "unassigned"]);
  assert.deepEqual(lanes.approval.map((r) => r.id), ["rescue-a"]);
  for (const lane of ["acceptance", "assigned", "transit", "completed", "cancelled"] as const)
    assert.deepEqual(lanes[lane].map((r) => r.id), [lane]);
});

test("approval requires current ready unexpired matching replacement evidence", () => {
  const r = rescue();
  assert.equal(pipelineLane(r, snapshot([r], [plan()])), "approval");
  for (const invalid of [
    plan({ status: "infeasible" }), plan({ status: "applied" }), plan({ baseVersion: 6 }),
    plan({ expiresAt: at }), plan({ expiresAt: "2026-10-30T19:59:59Z" }),
    plan({ expiresAt: "invalid" }), plan({ incidentIds: [] }), plan({ replacements: [] }),
    plan({ replacements: [{ ...plan().replacements[0], rescueId: "other" }] }),
  ]) {
    assert.equal(approvalPlan(r, snapshot([r], [invalid])), undefined);
    assert.equal(pipelineLane(r, snapshot([r], [invalid])), "recovery");
  }
  assert.equal(pipelineLane(r, { ...snapshot([r], [plan()]), serverTime: "invalid" }), "recovery");
});

test("plans do not override actual custody, escalation or terminal status", () => {
  for (const [status, expected] of [
    ["escalated", "recovery"], ["picked_up", "transit"], ["delivered", "completed"], ["cancelled", "cancelled"],
  ] as const) {
    const r = rescue({ status, acceptedAt: at, custodyHeld: true });
    assert.equal(pipelineLane(r, snapshot([r], [plan()])), expected);
    assert.equal(approvalPlan(r, snapshot([r], [plan()])), undefined);
  }
});

test("acceptance requires a real assigned volunteer and no recorded acceptance", () => {
  const s = snapshot([]);
  assert.equal(pipelineLane(rescue({ status: "assigned", volunteerId: "v" }), s), "acceptance");
  assert.equal(pipelineLane(rescue({ status: "assigned", volunteerId: "v", acceptedAt: at }), s), "assigned");
  assert.equal(pipelineLane(rescue({ status: "assigned", acceptedAt: at }), s), "recovery");
  assert.equal(pipelineLane(rescue({ volunteerId: "v" }), s), "recovery");
});

test("empty and role-filtered snapshots do not fabricate records or mutate input", () => {
  assert.ok(Object.values(buildPipeline(snapshot([]))).every((lane) => lane.length === 0));
  const r = Object.freeze(rescue({ status: "assigned", volunteerId: "my-volunteer" }));
  const s = snapshot([r]);
  const before = JSON.stringify(s);
  assert.deepEqual(buildPipeline(s).acceptance, [r]);
  assert.equal(JSON.stringify(s), before);
});

 test("terminal and transit records never imply pending assignment acceptance", () => {
   for (const status of ["delivered", "cancelled", "picked_up", "escalated", "needs_recovery"] as const) {
     assert.equal(acceptanceLabel({ status } as Rescue), "");
   }
   assert.equal(acceptanceLabel({status: "assigned"} as Rescue), " · not yet accepted");
   assert.equal(acceptanceLabel({status: "assigned", acceptedAt: "2026-10-30T20:00:00Z"} as Rescue), " · accepted");
 });
