import { seedState, type OrgState } from "./state.js";
import { generatePlan } from "./planner.js";
const organization = {
  id: "eval",
  name: "Synthetic evaluation only",
  demo: true,
  createdAt: new Date().toISOString(),
};
const cases: {
  name: string;
  expected: "ready" | "infeasible";
  prepare: (s: OrgState) => void;
  scenario?: "baseline" | "no_capacity" | "tight_window";
}[] = [
  { name: "baseline_recovery", expected: "ready", prepare: () => {} },
  {
    name: "insufficient_vehicle_capacity",
    expected: "infeasible",
    scenario: "no_capacity",
    prepare: () => {},
  },
  {
    name: "pickup_window_too_short",
    expected: "infeasible",
    scenario: "tight_window",
    prepare: () => {},
  },
  {
    name: "unsupported_cold_chain",
    expected: "infeasible",
    prepare: (s) => {
      s.donations[0]!.category = "chilled";
    },
  },
  {
    name: "unsealed_packaging",
    expected: "infeasible",
    prepare: (s) => {
      s.donations[0]!.sealed = false;
    },
  },
  {
    name: "recipient_category_rejection",
    expected: "infeasible",
    prepare: (s) => {
      s.recipients[0]!.acceptedCategories = ["frozen"];
    },
  },
  {
    name: "recipient_daily_capacity",
    expected: "infeasible",
    prepare: (s) => {
      s.recipients[0]!.capacityKg = 80;
    },
  },
  {
    name: "recipient_closed",
    expected: "infeasible",
    prepare: (s) => {
      s.recipients[0]!.openingWindow.end = new Date(
        Date.now() + 5 * 60000,
      ).toISOString();
    },
  },
  {
    name: "all_volunteers_unavailable",
    expected: "infeasible",
    prepare: (s) => {
      s.volunteers.forEach((v) => (v.available = false));
    },
  },
  {
    name: "training_evidence_missing",
    expected: "infeasible",
    prepare: (s) => {
      s.volunteers.forEach((v) => (v.trained = false));
    },
  },
  {
    name: "availability_ends_before_delivery",
    expected: "infeasible",
    prepare: (s) => {
      s.volunteers.forEach(
        (v) =>
          (v.availability.end = new Date(
            Date.now() + 10 * 60000,
          ).toISOString()),
      );
    },
  },
  {
    name: "fallback_distance_adapter",
    expected: "ready",
    prepare: (s) => {
      s.organization.demo = false;
    },
  },
];
let passed = 0;
const results = cases.map((c) => {
  const s = seedState({ ...organization }, c.scenario);
  c.prepare(s);
  const before = JSON.stringify(s),
    plan = generatePlan(s);
  const noMutation = JSON.stringify(s) === before;
  const allSelectedFeasible = plan.replacements.every((r) =>
    plan.candidates.some(
      (c) =>
        c.rescueId === r.rescueId &&
        c.volunteerId === r.volunteerId &&
        c.feasible,
    ),
  );
  const evidence = plan.citations.every((c) =>
    s.policies.some((p) => p.id === c.policyId && p.text === c.excerpt),
  );
  const pass =
    plan.status === c.expected && noMutation && allSelectedFeasible && evidence;
  if (pass) passed++;
  return {
    scenario: c.name,
    expected: c.expected,
    actual: plan.status,
    passed: pass,
    selected: plan.replacements.length,
    policyCitations: plan.citations.length,
    toolSteps: plan.trace.length,
  };
});
console.log(
  JSON.stringify(
    {
      benchmark: "RescueRelay synthetic offline constraint evaluation",
      providerCalls: 0,
      passed,
      total: cases.length,
      results,
      limitations:
        "Synthetic cases, not field effectiveness or food-safety validation.",
    },
    null,
    2,
  ),
);
if (passed !== cases.length) process.exitCode = 1;
