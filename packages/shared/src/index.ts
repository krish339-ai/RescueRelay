/** Public API contract. All timestamps are ISO 8601 UTC. All seed records are synthetic. */
export type Role = "coordinator" | "volunteer" | "recipient";
export type RescueStatus =
  | "assigned"
  | "needs_recovery"
  | "picked_up"
  | "delivered"
  | "escalated"
  | "cancelled";
export type FoodCategory = "shelf_stable" | "chilled" | "frozen" | "prepared";
export interface Location {
  label: string;
  lat: number;
  lng: number;
}
export interface Window {
  start: string;
  end: string;
}
export interface User {
  id: string;
  orgId: string;
  name: string;
  email: string;
  role: Role;
  volunteerId?: string;
  recipientId?: string;
}
export interface Organization {
  id: string;
  name: string;
  demo: boolean;
  createdAt: string;
}
export interface Donor {
  id: string;
  name: string;
  location: Location;
  contact: string;
  notes: string;
}
export interface Recipient {
  id: string;
  name: string;
  location: Location;
  contact: string;
  acceptedCategories: FoodCategory[];
  capacityKg: number;
  openingWindow: Window;
  notes: string;
}
export interface Volunteer {
  id: string;
  name: string;
  vehicle: string;
  capacityKg: number;
  available: boolean;
  availability: Window;
  location: Location;
  trained: boolean;
  notes: string;
}
export interface Donation {
  id: string;
  donorId: string;
  description: string;
  category: FoodCategory;
  weightKg: number;
  servings: number;
  sealed: boolean;
  handlingNotes: string;
  pickupWindow: Window;
  createdAt: string;
}
export interface Rescue {
  id: string;
  donationId: string;
  recipientId: string;
  volunteerId: string | null;
  status: RescueStatus;
  deliveryWindow: Window;
  pickupEta?: string;
  deliveryEta?: string;
  acceptedAt?: string;
  custodyHeld?: boolean;
  cancellationReason?: string;
  recipientConfirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}
export interface Policy {
  id: string;
  title: string;
  text: string;
  version: string;
  scope: "handling" | "volunteer" | "recipient" | "routing" | "approval";
  source: string;
}
export interface Citation {
  namespace?: string;
  authority?: "configured" | "reference_only";
  policyId: string;
  title: string;
  excerpt: string;
  score: number;
  source: string;
  version: string;
}
export interface ToolTrace {
  step: number;
  tool:
    | "inspect_incident"
    | "retrieve_policy"
    | "find_volunteers"
    | "estimate_routes"
    | "check_constraints"
    | "rank_candidates"
    | "escalate"
    | "compose_explanation";
  reason: string;
  result: string;
  at: string;
}
export interface ConstraintCheck {
  rule: string;
  passed: boolean;
  detail: string;
}
export interface Candidate {
  rescueId: string;
  volunteerId: string;
  volunteerName: string;
  feasible: boolean;
  score: number;
  pickupEta: string;
  deliveryEta: string;
  travelMinutes: number;
  routeSource: "synthetic-matrix" | "distance-estimate";
  checks: ConstraintCheck[];
  reasons: string[];
}
export interface Replacement {
  rescueId: string;
  volunteerId: string;
  pickupEta: string;
  deliveryEta: string;
  travelMinutes: number;
}
export interface RecoveryPlan {
  id: string;
  orgId: string;
  baseVersion: number;
  status: "ready" | "infeasible" | "applied";
  createdAt: string;
  expiresAt: string;
  appliedAt?: string;
  incidentIds: string[];
  summary: string;
  explanationMode: "offline-bounded" | "provider-assisted";
  candidates: Candidate[];
  replacements: Replacement[];
  citations: Citation[];
  trace: ToolTrace[];
  warnings: string[];
  escalations: string[];
}
export interface AuditEvent {
  id: string;
  at: string;
  actorId: string;
  action: string;
  entityId: string;
  detail: string;
}
export interface Notification {
  id: string;
  at: string;
  kind: "recovery" | "assignment" | "status" | "escalation";
  title: string;
  body: string;
  audience: Role;
  volunteerId?: string;
  recipientId?: string;
  read: boolean;
  channel: "in_app_only";
}
export interface Metrics {
  totalRescues: number;
  atRisk: number;
  active: number;
  delivered: number;
  recovered: number;
  potentialServings: number;
  deliveredKg: number;
  availableVolunteers: number;
}
export interface Snapshot {
  version: number;
  serverTime: string;
  organization: Organization;
  user: User;
  donors: Donor[];
  recipients: Recipient[];
  volunteers: Volunteer[];
  donations: Donation[];
  rescues: Rescue[];
  plans: RecoveryPlan[];
  policies: Policy[];
  audit: AuditEvent[];
  notifications: Notification[];
  metrics: Metrics;
  capabilities: {
    demo: boolean;
    routes: "synthetic-matrix-and-distance-estimate";
    notifications: "in_app_only";
    reasoning: "offline-bounded";
    providerConfigured: boolean;
    supportedFood: "sealed-shelf-stable-only";
  };
}
export interface SessionResponse {
  token: string;
  expiresAt: string;
  user: User;
  organization: Organization;
}
export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}
export interface VersionedMutation {
  expectedVersion: number;
}
export interface PlanResponse {
  plan: RecoveryPlan;
  snapshot: Snapshot;
}
export interface CsvValidation {
  valid: boolean;
  rows: number;
  errors: { row: number; field: string; message: string }[];
  preview: {
    description: string;
    donorId: string;
    weightKg: number;
    servings: number;
    pickupStart: string;
    pickupEnd: string;
  }[];
}
export const ROLES: Role[] = ["coordinator", "volunteer", "recipient"];
export const RESCUE_STATUS_LABELS: Record<RescueStatus, string> = {
  assigned: "Assigned",
  needs_recovery: "Needs recovery",
  picked_up: "Picked up",
  delivered: "Delivered",
  escalated: "Escalated",
  cancelled: "Cancelled",
};
export const APP_NAME = "RescueRelay";

export * from "./ai";
