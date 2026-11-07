import type {
  Candidate,
  Citation,
  Location,
  RecoveryPlan,
  Rescue,
  ToolTrace,
  Volunteer,
} from "@rescuerelay/shared";
import { assert } from "./errors.js";
import { id, nowIso, type OrgState } from "./state.js";
const minute = 60000;
const tokens = (text: string) =>
  new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
/** Local lexical + exact-phrase retrieval. Citations are taken from persisted policy text, never invented. */
export function retrievePolicies(s: OrgState, query: string): Citation[] {
  const q = tokens(query);
  return s.policies
    .map((p) => {
      const terms = tokens(`${p.title} ${p.text}`);
      let score = 0;
      for (const word of q)
        if (terms.has(word)) score += word.length > 5 ? 2 : 1;
      if (query.includes(p.scope)) score += 5;
      return {
        policyId: p.id,
        title: p.title,
        excerpt: p.text,
        score,
        source: p.source,
        version: p.version,
      };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
const routeMatrix: Record<string, number> = {
  "v-jordan:donor-harbor": 8,
  "v-priya:donor-harbor": 17,
  "v-maya:donor-harbor": 12,
  "v-sam:donor-harbor": 14,
  "v-alex:donor-harbor": 13,
  "donor-harbor:rec-maple": 14,
  "donor-orchard:rec-river": 12,
  "v-jordan:donor-orchard": 14,
  "v-priya:donor-orchard": 21,
};
function haversine(a: Location, b: Location) {
  const r = (x: number) => (x * Math.PI) / 180;
  const dlat = r(b.lat - a.lat),
    dlng = r(b.lng - a.lng);
  const v =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(1 - v));
}
export function travelMinutes(
  fromId: string,
  toId: string,
  from: Location,
  to: Location,
  demo: boolean,
): { minutes: number; source: "synthetic-matrix" | "distance-estimate" } {
  const known = demo ? routeMatrix[`${fromId}:${toId}`] : undefined;
  return known !== undefined
    ? { minutes: known, source: "synthetic-matrix" }
    : {
        minutes: Math.max(
          5,
          Math.ceil(((haversine(from, to) * 1.4) / 25) * 60 + 4),
        ),
        source: "distance-estimate",
      };
}
export function evaluateCandidate(
  s: OrgState,
  rescue: Rescue,
  v: Volunteer,
  at = Date.now(),
  reserved = new Set<string>(),
): Candidate {
  const d = s.donations.find((x) => x.id === rescue.donationId)!;
  const donor = s.donors.find((x) => x.id === d?.donorId)!;
  const recipient = s.recipients.find((x) => x.id === rescue.recipientId)!;
  assert(
    d && donor && recipient,
    422,
    "MISSING_EVIDENCE",
    "Donation, donor or recipient information is missing.",
  );
  const first = travelMinutes(
      v.id,
      donor.id,
      v.location,
      donor.location,
      s.organization.demo,
    ),
    second = travelMinutes(
      donor.id,
      recipient.id,
      donor.location,
      recipient.location,
      s.organization.demo,
    );
  const depart = Math.max(at, Date.parse(v.availability.start));
  const pickup = Math.max(
    depart + first.minutes * minute,
    Date.parse(d.pickupWindow.start),
  );
  const pickupDone = pickup + 10 * minute;
  const delivery = Math.max(
    pickupDone + second.minutes * minute,
    Date.parse(rescue.deliveryWindow.start),
    Date.parse(recipient.openingWindow.start),
  );
  const done = delivery + 10 * minute;
  const day = new Date(delivery).toISOString().slice(0, 10),
    dayStart = Date.parse(`${day}T00:00:00Z`),
    dayEnd = dayStart + 24 * 60 * minute;
  const dailyWeight = s.rescues
    .filter(
      (r) =>
        r.recipientId === recipient.id &&
        r.status !== "cancelled" &&
        (r.status === "delivered"
          ? new Date(r.updatedAt).toISOString().slice(0, 10) === day
          : Date.parse(r.deliveryWindow.start) < dayEnd &&
            Date.parse(r.deliveryWindow.end) >= dayStart),
    )
    .reduce(
      (sum, r) =>
        sum + (s.donations.find((x) => x.id === r.donationId)?.weightKg ?? 0),
      0,
    );
  const checks = [
    {
      rule: "supported_handling",
      passed: d.category === "shelf_stable" && d.sealed,
      detail:
        "Only sealed shelf-stable goods are supported; no cold-chain certification.",
    },
    {
      rule: "available",
      passed: v.available,
      detail: v.available
        ? "Volunteer is marked available."
        : "Volunteer is unavailable.",
    },
    {
      rule: "trained",
      passed: v.trained,
      detail: v.trained
        ? "Coordinator-recorded training is present."
        : "Training evidence is missing.",
    },
    {
      rule: "vehicle_capacity",
      passed: v.capacityKg >= d.weightKg,
      detail: `Vehicle ${v.capacityKg} kg; donation ${d.weightKg} kg.`,
    },
    {
      rule: "no_active_assignment",
      passed:
        !reserved.has(v.id) &&
        !s.rescues.some(
          (r) =>
            r.id !== rescue.id &&
            r.volunteerId === v.id &&
            (["assigned", "picked_up"].includes(r.status) ||
              r.custodyHeld === true),
        ),
      detail:
        "Conservative rule: one active rescue per volunteer; no overlapping assignments.",
    },
    {
      rule: "recipient_acceptance",
      passed: recipient.acceptedCategories.includes(d.category),
      detail: `Recipient accepted categories: ${recipient.acceptedCategories.join(", ")}.`,
    },
    {
      rule: "recipient_capacity",
      passed: dailyWeight <= recipient.capacityKg,
      detail: `Reserved plus delivered today: ${dailyWeight} / ${recipient.capacityKg} kg.`,
    },
    {
      rule: "pickup_window",
      passed: pickupDone + 5 * minute <= Date.parse(d.pickupWindow.end),
      detail: `Pickup service completes ${new Date(pickupDone).toISOString()}, with five-minute closing buffer required.`,
    },
    {
      rule: "delivery_window",
      passed:
        done + 5 * minute <= Date.parse(rescue.deliveryWindow.end) &&
        done + 5 * minute <= Date.parse(recipient.openingWindow.end),
      detail: `Delivery service completes ${new Date(done).toISOString()} within both receiving windows plus five-minute buffer.`,
    },
    {
      rule: "availability_window",
      passed: done <= Date.parse(v.availability.end),
      detail: `Volunteer availability ends ${v.availability.end}.`,
    },
  ];
  const feasible = checks.every((c) => c.passed);
  const travel = first.minutes + second.minutes;
  return {
    rescueId: rescue.id,
    volunteerId: v.id,
    volunteerName: v.name,
    feasible,
    score: feasible
      ? Math.max(
          0,
          100 - travel - Math.round((v.capacityKg - d.weightKg) * 0.05),
        )
      : 0,
    pickupEta: new Date(pickup).toISOString(),
    deliveryEta: new Date(delivery).toISOString(),
    travelMinutes: travel,
    routeSource:
      first.source === "synthetic-matrix" &&
      second.source === "synthetic-matrix"
        ? "synthetic-matrix"
        : "distance-estimate",
    checks,
    reasons: checks.filter((c) => !c.passed).map((c) => c.detail),
  };
}
/** State-driven bounded agent. Tools selected from incident evidence; hard constraints always run outside narration. */
export function generatePlan(
  s: OrgState,
  rescueIds?: string[],
  at = Date.now(),
): RecoveryPlan {
  const trace: ToolTrace[] = [];
  const step = (tool: ToolTrace["tool"], reason: string, result: string) =>
    trace.push({ step: trace.length + 1, tool, reason, result, at: nowIso() });
  const incidents = rescueIds
    ? s.rescues.filter((r) => rescueIds.includes(r.id))
    : s.rescues.filter((r) => r.status === "needs_recovery");
  assert(
    incidents.length > 0,
    422,
    "NO_INCIDENTS",
    "No recovery incident is available.",
  );
  assert(
    incidents.length <= 50,
    422,
    "INVESTIGATION_LIMIT",
    "Select at most 50 recovery incidents per bounded investigation.",
  );
  assert(
    !rescueIds || incidents.length === new Set(rescueIds).size,
    404,
    "NOT_FOUND",
    "One or more rescues were not found.",
  );
  assert(
    incidents.every((r) => r.status === "needs_recovery"),
    422,
    "INVALID_STATE",
    "Only rescues awaiting recovery can be planned.",
  );
  step(
    "inspect_incident",
    "Determine status, handling evidence, urgency and missing assignment.",
    `${incidents.length} rescue(s) need recovery; human approval remains required.`,
  );
  const query = incidents
    .map((r) => {
      const d = s.donations.find((d) => d.id === r.donationId);
      return `${d?.category ?? "unknown handling"} ${d?.sealed ? "sealed" : "unknown packaging"} volunteer capacity recipient opening routing approval`;
    })
    .join(" ");
  const citations = retrievePolicies(s, query);
  step(
    "retrieve_policy",
    "Choose persisted handling, capacity, receiving, routing and approval policies from incident evidence.",
    `Retrieved ${citations.length} cited local policy passages using token and phrase overlap.`,
  );
  const candidates: Candidate[] = [],
    replacements: RecoveryPlan["replacements"] = [],
    escalations: string[] = [];
  for (const rescue of [...incidents].sort(
    (a, b) =>
      Date.parse(
        s.donations.find((d) => d.id === a.donationId)!.pickupWindow.end,
      ) -
      Date.parse(
        s.donations.find((d) => d.id === b.donationId)!.pickupWindow.end,
      ),
  )) {
    const donation = s.donations.find((d) => d.id === rescue.donationId);
    if (!donation || !donation.sealed || donation.category !== "shelf_stable") {
      escalations.push(
        `${rescue.id}: handling evidence is unsupported or incomplete. A qualified person must review.`,
      );
      step(
        "escalate",
        "Handling boundary blocks route search.",
        `${rescue.id}: no candidate assignment attempted.`,
      );
      continue;
    }
    const volunteers = s.volunteers;
    step(
      "find_volunteers",
      "Handling is supported; find available capacity and training evidence.",
      `${volunteers.length} volunteer records considered for ${rescue.id}.`,
    );
    if (!volunteers.length) {
      escalations.push(`${rescue.id}: no volunteer records available.`);
      step(
        "escalate",
        "No volunteer evidence exists.",
        `${rescue.id}: coordinator must contact alternatives outside this app.`,
      );
      continue;
    }
    step(
      "estimate_routes",
      "Volunteer records exist; obtain labeled travel estimates with service buffers.",
      `${rescue.id}: synthetic matrix where available, otherwise conservative distance estimate; never live traffic.`,
    );
    const list = volunteers
      .map((v) => evaluateCandidate(s, rescue, v, at))
      .sort((a, b) => b.score - a.score || a.travelMinutes - b.travelMinutes);
    candidates.push(...list);
    const feasible = list.filter((c) => c.feasible);
    step(
      "check_constraints",
      "Separate non-negotiable handling, capacity, availability and receiving rules from candidate ranking.",
      `${rescue.id}: ${feasible.length}/${list.length} candidates satisfy every hard constraint.`,
    );
    if (!feasible.length) {
      escalations.push(
        `${rescue.id}: no candidate satisfies all constraints. Contact a coordinator to verify alternatives; do not relax handling or receiving windows automatically.`,
      );
      step(
        "escalate",
        "No feasible volunteer survives hard constraints.",
        `${rescue.id}: no dispatch or replacement was applied.`,
      );
    }
  }
  // Exact maximum bipartite matching under the conservative one-active-rescue rule.
  // Augmenting paths reassign earlier choices when a later incident needs a scarce driver.
  // Preference order favors local score; this is NOT a claim of global minimum travel.
  const matched = new Map<string, string>();
  const adjacency = new Map(
    incidents.map((r) => [
      r.id,
      candidates
        .filter((c) => c.rescueId === r.id && c.feasible)
        .sort((a, b) => b.score - a.score || a.travelMinutes - b.travelMinutes),
    ]),
  );
  const augment = (rescueId: string, visited: Set<string>): boolean => {
    for (const c of adjacency.get(rescueId) ?? []) {
      if (visited.has(c.volunteerId)) continue;
      visited.add(c.volunteerId);
      const prior = matched.get(c.volunteerId);
      if (!prior || augment(prior, visited)) {
        matched.set(c.volunteerId, rescueId);
        return true;
      }
    }
    return false;
  };
  for (const r of [...incidents].sort(
    (a, b) =>
      (adjacency.get(a.id)?.length ?? 0) - (adjacency.get(b.id)?.length ?? 0),
  ))
    augment(r.id, new Set());
  for (const [volunteerId, rescueId] of matched) {
    const c = candidates.find(
      (c) => c.rescueId === rescueId && c.volunteerId === volunteerId,
    )!;
    replacements.push({
      rescueId,
      volunteerId,
      pickupEta: c.pickupEta,
      deliveryEta: c.deliveryEta,
      travelMinutes: c.travelMinutes,
    });
    step(
      "rank_candidates",
      "Find maximum feasible one-to-one matching, preferring locally ranked candidates; do not claim global route optimality.",
      `${rescueId}: recommend ${c.volunteerName}; score ${c.score}/100, estimated travel ${c.travelMinutes} minutes.`,
    );
  }
  if (
    replacements.length < incidents.length &&
    incidents.every((r) => (adjacency.get(r.id)?.length ?? 0) > 0)
  ) {
    escalations.push(
      "Available candidates cannot cover every incident without assigning one volunteer to more than one active rescue.",
    );
    step(
      "escalate",
      "Maximum matching cannot cover every incident under the one-active-rescue constraint.",
      "No complete replacement plan may be approved.",
    );
  }
  const ready = replacements.length === incidents.length;
  step(
    "compose_explanation",
    "Explain evidence and rejected alternatives without inventing live model output.",
    ready
      ? `${replacements.length} proposed replacement(s), waiting for coordinator approval.`
      : "At least one incident is infeasible. This proposal cannot be applied.",
  );
  return {
    id: id("plan"),
    orgId: s.organization.id,
    baseVersion: s.version + 1,
    status: ready ? "ready" : "infeasible",
    createdAt: new Date(at).toISOString(),
    expiresAt: new Date(at + 10 * minute).toISOString(),
    incidentIds: incidents.map((r) => r.id),
    summary: ready
      ? `${replacements.length} rescue${replacements.length > 1 ? "s can" : " can"} recover with feasible volunteer coverage. Review estimated routes, policy evidence and rejection reasons before approval.`
      : "No complete safe assignment is available under the current configured constraints. Escalate for human review.",
    explanationMode: "offline-bounded",
    candidates,
    replacements,
    citations,
    trace,
    warnings: [
      "Travel times are synthetic or distance-based estimates, not live traffic.",
      "In-app notifications only: nobody has been contacted.",
      "Configured handling checks do not certify food safety.",
    ],
    escalations,
  };
}
