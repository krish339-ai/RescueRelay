import type { Snapshot, User } from "@rescuerelay/shared";
import type { OrgState } from "./state.js";
export function snapshot(
  s: OrgState,
  user: User,
  providerConfigured = false,
): Snapshot {
  const coordinator = user.role === "coordinator";
  const rescues = s.rescues.filter(
    (r) =>
      coordinator ||
      (user.role === "volunteer"
        ? r.volunteerId === user.volunteerId
        : r.recipientId === user.recipientId),
  );
  const donationIds = new Set(rescues.map((r) => r.donationId));
  const donations = s.donations.filter(
    (d) => coordinator || donationIds.has(d.id),
  );
  const donorIds = new Set(donations.map((d) => d.donorId));
  const recipientIds = new Set(rescues.map((r) => r.recipientId));
  const volunteers = s.volunteers.filter(
    (v) =>
      coordinator || (user.role === "volunteer" && v.id === user.volunteerId),
  );
  return {
    version: s.version,
    serverTime: new Date().toISOString(),
    organization: s.organization,
    user,
    donors: s.donors.filter((d) => coordinator || donorIds.has(d.id)),
    recipients: s.recipients.filter(
      (r) =>
        coordinator ||
        recipientIds.has(r.id) ||
        (user.role === "recipient" && r.id === user.recipientId),
    ),
    volunteers,
    donations,
    rescues,
    plans: coordinator ? s.plans : [],
    policies: s.policies,
    audit: coordinator ? s.audit : [],
    notifications: s.notifications.filter(
      (n) =>
        coordinator ||
        (n.audience === user.role &&
          (!n.volunteerId || n.volunteerId === user.volunteerId) &&
          (!n.recipientId || n.recipientId === user.recipientId)),
    ),
    metrics: {
      totalRescues: rescues.length,
      atRisk: rescues.filter((r) =>
        ["needs_recovery", "escalated"].includes(r.status),
      ).length,
      active: rescues.filter((r) =>
        ["assigned", "picked_up"].includes(r.status),
      ).length,
      delivered: rescues.filter((r) => r.status === "delivered").length,
      recovered: coordinator
        ? s.audit.filter((a) => a.action === "plan.applied").length
        : 0,
      potentialServings: donations
        .filter((d) =>
          rescues.some(
            (r) => r.donationId === d.id && r.status !== "cancelled",
          ),
        )
        .reduce((n, d) => n + d.servings, 0),
      deliveredKg: donations
        .filter((d) =>
          rescues.some(
            (r) => r.donationId === d.id && r.status === "delivered",
          ),
        )
        .reduce((n, d) => n + d.weightKg, 0),
      availableVolunteers: volunteers.filter((v) => v.available).length,
    },
    capabilities: {
      demo: s.organization.demo,
      routes: "synthetic-matrix-and-distance-estimate",
      notifications: "in_app_only",
      reasoning: "offline-bounded",
      providerConfigured,
      supportedFood: "sealed-shelf-stable-only",
    },
  };
}
