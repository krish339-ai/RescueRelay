import type {
  AuditEvent,
  Donation,
  Donor,
  Notification,
  Organization,
  Policy,
  Recipient,
  RecoveryPlan,
  Rescue,
  User,
  Volunteer,
} from "@rescuerelay/shared";
import { randomUUID } from "node:crypto";
export interface OrgState {
  ai?: import("./ai/state.js").AiState;
  version: number;
  organization: Organization;
  donors: Donor[];
  recipients: Recipient[];
  volunteers: Volunteer[];
  donations: Donation[];
  rescues: Rescue[];
  plans: RecoveryPlan[];
  policies: Policy[];
  audit: AuditEvent[];
  notifications: Notification[];
}
export const id = (prefix: string) => `${prefix}-${randomUUID()}`;
export const nowIso = () => new Date().toISOString();
export function audit(
  s: OrgState,
  user: User,
  action: string,
  entityId: string,
  detail: string,
) {
  s.audit.unshift({
    id: id("audit"),
    at: nowIso(),
    actorId: user.id,
    action,
    entityId,
    detail,
  });
}
export function notify(
  s: OrgState,
  n: Omit<Notification, "id" | "at" | "read" | "channel">,
) {
  s.notifications.unshift({
    ...n,
    id: id("notice"),
    at: nowIso(),
    read: false,
    channel: "in_app_only",
  });
}
export const POLICIES: Policy[] = [
  {
    id: "POL-HANDLING-01",
    title: "Initial handling boundary",
    version: "1.0",
    scope: "handling",
    source:
      "RescueRelay configured demonstration policy, not regulatory certification",
    text: "Only sealed shelf-stable goods are supported. Chilled, frozen, prepared, opened or uncertain-handling food must not be assigned by this workflow. A coordinator must verify the description, packaging and handling requirements before rescue.",
  },
  {
    id: "POL-VOLUNTEER-01",
    title: "Volunteer eligibility and capacity",
    version: "1.0",
    scope: "volunteer",
    source: "RescueRelay configured operational policy",
    text: "A replacement volunteer must be marked available, trained and have vehicle capacity at least equal to the donation weight. Availability must cover travel, pickup service and delivery service. A volunteer with an active assignment is not eligible for another concurrent rescue.",
  },
  {
    id: "POL-RECIPIENT-01",
    title: "Recipient acceptance and receiving window",
    version: "1.0",
    scope: "recipient",
    source: "RescueRelay configured operational policy",
    text: "The recipient must accept the food category and have enough remaining daily receiving capacity for all non-cancelled rescues, including delivered donations. Delivery must finish within both the rescue delivery window and the recipient opening window.",
  },
  {
    id: "POL-ROUTE-01",
    title: "Estimated routes and service buffer",
    version: "1.0",
    scope: "routing",
    source: "RescueRelay synthetic route adapter assumptions",
    text: "Route times are illustrative synthetic matrix or distance estimates, not live traffic or navigation. Add ten minutes for pickup and ten for delivery service. A five-minute planning safety buffer is required before pickup and delivery window closing. Recheck estimates and local conditions before approving.",
  },
  {
    id: "POL-APPROVAL-01",
    title: "Human approval and stale evidence",
    version: "1.0",
    scope: "approval",
    source: "RescueRelay configured approval policy",
    text: "No recovery assignment is applied without coordinator approval. A proposal expires after ten minutes and must match the current organization state version. Revalidate all constraints at approval. Never replace an already-picked-up rescue automatically: escalate chain-of-custody interruption to a person.",
  },
];
export function emptyState(org: Organization): OrgState {
  return {
    version: 1,
    organization: org,
    donors: [],
    recipients: [],
    volunteers: [],
    donations: [],
    rescues: [],
    plans: [],
    policies: structuredClone(POLICIES),
    audit: [],
    notifications: [],
  };
}
export function seedState(
  org: Organization,
  scenario: "baseline" | "no_capacity" | "tight_window" = "baseline",
): OrgState {
  const s = emptyState(org);
  const base = Date.now();
  const at = (minutes: number) =>
    new Date(base + minutes * 60000).toISOString();
  const loc = (label: string, lat: number, lng: number) => ({
    label,
    lat,
    lng,
  });
  s.donors = [
    {
      id: "donor-harbor",
      name: "Harbor Market",
      location: loc("12 Harbor Lane · synthetic", 40.44, -79.995),
      contact: "Synthetic contact — no messages sent",
      notes: "Sealed pantry goods only. Loading at rear door.",
    },
    {
      id: "donor-orchard",
      name: "Orchard Pantry",
      location: loc("8 Orchard Street · synthetic", 40.455, -79.98),
      contact: "Synthetic contact — no messages sent",
      notes: "Boxes ready at service desk.",
    },
  ];
  s.recipients = [
    {
      id: "rec-maple",
      name: "Maple Community Kitchen",
      location: loc("26 Maple Avenue · synthetic", 40.425, -79.975),
      contact: "Synthetic receiving desk",
      acceptedCategories: ["shelf_stable"],
      capacityKg: 250,
      openingWindow: { start: at(-60), end: at(240) },
      notes:
        "Receives intact shelf-stable packaging; reception closes at displayed time.",
    },
    {
      id: "rec-river",
      name: "Riverside Neighbors",
      location: loc("4 River Walk · synthetic", 40.47, -79.96),
      contact: "Synthetic receiving desk",
      acceptedCategories: ["shelf_stable"],
      capacityKg: 180,
      openingWindow: { start: at(-60), end: at(240) },
      notes: "Call the real receiving team outside this demo before operating.",
    },
  ];
  s.volunteers = [
    {
      id: "v-alex",
      name: "Alex Morgan",
      vehicle: "Hatchback",
      capacityKg: 80,
      available: false,
      availability: { start: at(-60), end: at(240) },
      location: loc("North district · synthetic", 40.46, -79.99),
      trained: true,
      notes: "Original volunteer cancelled.",
    },
    {
      id: "v-maya",
      name: "Maya Chen",
      vehicle: "Cargo van",
      capacityKg: 120,
      available: true,
      availability: { start: at(-60), end: at(240) },
      location: loc("East district · synthetic", 40.445, -79.975),
      trained: true,
      notes: "Assigned to pantry delivery.",
    },
    {
      id: "v-jordan",
      name: "Jordan Ellis",
      vehicle: "Station wagon",
      capacityKg: scenario === "no_capacity" ? 10 : 90,
      available: true,
      availability: { start: at(-60), end: at(240) },
      location: loc("Central district · synthetic", 40.438, -79.99),
      trained: true,
      notes: "Available backup volunteer.",
    },
    {
      id: "v-sam",
      name: "Sam Rivera",
      vehicle: "Compact car",
      capacityKg: 20,
      available: true,
      availability: { start: at(-60), end: at(180) },
      location: loc("West district · synthetic", 40.448, -80.01),
      trained: true,
      notes: "Small capacity; useful rejection example.",
    },
    {
      id: "v-priya",
      name: "Priya Shah",
      vehicle: "Minivan",
      capacityKg: scenario === "no_capacity" ? 15 : 100,
      available: true,
      availability: { start: at(-60), end: at(240) },
      location: loc("South district · synthetic", 40.41, -79.98),
      trained: true,
      notes: "Second recovery option.",
    },
  ];
  s.donations = [
    {
      id: "d-101",
      donorId: "donor-harbor",
      description: "Sealed rice, lentils and canned vegetables",
      category: "shelf_stable",
      weightKg: 64,
      servings: 160,
      sealed: true,
      handlingNotes:
        "Dry intact retail packaging. Synthetic example, not a safety assessment.",
      pickupWindow: {
        start: at(-5),
        end: at(scenario === "tight_window" ? 4 : 65),
      },
      createdAt: at(-45),
    },
    {
      id: "d-102",
      donorId: "donor-orchard",
      description: "Boxed cereal and sealed pantry staples",
      category: "shelf_stable",
      weightKg: 38,
      servings: 95,
      sealed: true,
      handlingNotes: "Keep boxes dry and intact.",
      pickupWindow: { start: at(0), end: at(100) },
      createdAt: at(-30),
    },
    {
      id: "d-103",
      donorId: "donor-harbor",
      description: "Sealed pasta and canned beans",
      category: "shelf_stable",
      weightKg: 26,
      servings: 65,
      sealed: true,
      handlingNotes: "Synthetic completed rescue.",
      pickupWindow: { start: at(-120), end: at(-60) },
      createdAt: at(-150),
    },
  ];
  s.rescues = [
    {
      id: "r-101",
      donationId: "d-101",
      recipientId: "rec-maple",
      volunteerId: null,
      status: "needs_recovery",
      deliveryWindow: { start: at(0), end: at(115) },
      cancellationReason:
        "Synthetic scenario: original volunteer reported a vehicle problem before pickup.",
      createdAt: at(-40),
      updatedAt: at(-3),
    },
    {
      id: "r-102",
      donationId: "d-102",
      recipientId: "rec-river",
      volunteerId: "v-maya",
      status: "assigned",
      deliveryWindow: { start: at(10), end: at(150) },
      pickupEta: at(25),
      deliveryEta: at(52),
      createdAt: at(-25),
      updatedAt: at(-25),
    },
    {
      id: "r-103",
      donationId: "d-103",
      recipientId: "rec-maple",
      volunteerId: "v-alex",
      status: "delivered",
      deliveryWindow: { start: at(-100), end: at(-10) },
      pickupEta: at(-90),
      deliveryEta: at(-65),
      recipientConfirmedAt: at(-60),
      createdAt: at(-140),
      updatedAt: at(-65),
    },
  ];
  const actor: User = {
    id: "system",
    orgId: org.id,
    name: "Synthetic scenario",
    email: "",
    role: "coordinator",
  };
  audit(
    s,
    actor,
    "scenario.seed",
    org.id,
    `Synthetic ${scenario} scenario created. No real rescue or recipient action occurred.`,
  );
  audit(
    s,
    actor,
    "volunteer.cancelled",
    "r-101",
    "Synthetic vehicle problem before pickup; awaiting coordinator recovery.",
  );
  notify(s, {
    kind: "recovery",
    title: "A rescue needs a new volunteer",
    body: "Harbor Market → Maple Community Kitchen. Review a recovery proposal before assigning.",
    audience: "coordinator",
  });
  notify(s, {
    kind: "assignment",
    title: "Your pantry rescue is scheduled",
    body: "Orchard Pantry → Riverside Neighbors. This is a synthetic practice assignment.",
    audience: "volunteer",
    volunteerId: "v-maya",
  });
  return s;
}
