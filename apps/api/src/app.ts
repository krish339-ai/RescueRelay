import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { z, ZodError } from "zod";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import type { PlanResponse, Role, Snapshot, User } from "@rescuerelay/shared";
import { AppError, assert, fail } from "./errors.js";
import { Store } from "./store.js";
import { addDonation } from "./domain.js";
import { registerAiRoutes } from "./ai/routes.js";
import type { AiOptions } from "./ai/service.js";
import {
  audit,
  id,
  notify,
  nowIso,
  seedState,
  type OrgState,
} from "./state.js";
import { snapshot } from "./snapshot.js";
import { evaluateCandidate, generatePlan } from "./planner.js";
import {
  investigateWithProvider,
  OpenAIInvestigationProvider,
  type InvestigationProvider,
} from "./provider.js";
import { donationCsv, encodeCsv, validateCsv } from "./csv.js";
import {
  accountFields,
  category,
  donationFields,
  donorFields,
  location,
  parse,
  recipientFields,
  text,
  version,
  volunteerFields,
  window,
} from "./schemas.js";
declare module "fastify" {
  interface FastifyRequest {
    user: User;
    token: string;
  }
}
export interface AppOptions {
  ai?: AiOptions;
  databasePath?: string;
  demoMode?: boolean;
  allowLanDemo?: boolean;
  origins?: string[];
  logger?: boolean;
  rateLimit?: boolean;
  provider?: InvestigationProvider;
  staticRoot?: string;
}
export async function createApp(options: AppOptions = {}) {
  const store = new Store(options.databasePath ?? ":memory:");
  const demo = options.demoMode ?? false;
  // Environment credentials must never activate the legacy ungated path.
  // Explicit injection is retained only for in-process testing/custom local providers.
  const provider = options.provider;
  const app = Fastify({
    logger: options.logger
      ? {
          redact: [
            "req.headers.authorization",
            "req.body.password",
            'res.headers["set-cookie"]',
          ],
        }
      : false,
    bodyLimit: 256 * 1024,
    trustProxy: false,
  });
  app.decorateRequest("user", null as unknown as User);
  app.decorateRequest("token", "");
  await app.register(cors, {
    origin: options.origins ?? [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
    credentials: false,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  });
  if (options.rateLimit !== false)
    await app.register(rateLimit, { max: 240, timeWindow: "1 minute" });
  app.addHook("onClose", async () => store.close());
  app.addHook("onSend", async (_req, reply, payload) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "no-store")
      .header("Referrer-Policy", "no-referrer");
    return payload;
  });
  const publicPaths = new Set([
    "/api/health",
    "/api/config",
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/demo",
  ]);
  app.addHook("onRequest", async (req) => {
    if (
      req.method === "OPTIONS" ||
      !req.url.startsWith("/api/") ||
      publicPaths.has(req.url.split("?")[0]!)
    )
      return;
    const auth = req.headers.authorization;
    assert(
      auth && /^Bearer [A-Za-z0-9_-]{43}$/.test(auth),
      401,
      "UNAUTHENTICATED",
      "Sign in to continue.",
    );
    req.token = auth.slice(7);
    req.user = store.authenticate(req.token);
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError)
      return reply.status(400).send({
        error: "Invalid request data.",
        code: "VALIDATION_ERROR",
        details: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    if (error instanceof AppError)
      return reply.status(error.status).send({
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      });
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500)
      return reply.status(status).send({
        error:
          status === 429
            ? "Too many requests. Please wait and retry."
            : "Request rejected.",
        code: status === 429 ? "RATE_LIMITED" : "BAD_REQUEST",
      });
    req.log.error({ err: error }, "Request failed");
    return reply.status(500).send({
      error: "Unexpected server error. No partial changes were saved.",
      code: "INTERNAL_ERROR",
    });
  });
  const coordinator = (req: FastifyRequest) =>
    assert(
      req.user.role === "coordinator",
      403,
      "FORBIDDEN",
      "Coordinator permission is required.",
    );
  const routeId = (req: FastifyRequest) =>
    parse(z.object({ id: text() }).strict(), req.params).id;
  const read = (req: FastifyRequest) => store.read(req.user.orgId);
  const view = (state: OrgState, req: FastifyRequest): Snapshot =>
    snapshot(state, req.user, !!provider);
  const change = (
    req: FastifyRequest,
    expected: number,
    fn: (state: OrgState) => void,
  ) => view(store.mutate(req.user.orgId, expected, fn).state, req);
  const rescueFor = (s: OrgState, rid: string) => {
    const r = s.rescues.find((r) => r.id === rid);
    assert(r, 404, "NOT_FOUND", "Rescue not found.");
    return r;
  };
  const activeCommitment = (r: ReturnType<typeof rescueFor>) =>
    ["assigned", "picked_up"].includes(r.status) || r.custodyHeld === true;
  const canOperate = (req: FastifyRequest, r: ReturnType<typeof rescueFor>) =>
    assert(
      req.user.role === "coordinator" ||
        (req.user.role === "volunteer" &&
          r.volunteerId === req.user.volunteerId),
      403,
      "FORBIDDEN",
      "Only the assigned volunteer or a coordinator can change this rescue.",
    );
  app.get("/api/health", async () => ({ status: "ok", version: "0.1.0" }));
  app.get("/api/config", async () => ({
    demoMode: demo,
    providerConfigured: !!provider,
  }));
  const authConfig = {
    config: { rateLimit: { max: 12, timeWindow: "1 minute" } },
  };
  app.post("/api/auth/register", authConfig, async (req) =>
    store.createOrganization(
      parse(
        z.object({ ...accountFields, organizationName: text() }).strict(),
        req.body,
      ),
    ),
  );
  app.post("/api/auth/login", authConfig, async (req) => {
    const b = parse(
      z
        .object({
          email: z.email().max(254),
          password: z.string().min(1).max(128),
        })
        .strict(),
      req.body,
    );
    return store.login(b.email, b.password);
  });
  app.post("/api/auth/demo", authConfig, async (req) => {
    assert(demo, 404, "NOT_FOUND", "Demo mode is disabled.");
    assert(
      options.allowLanDemo ||
        ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip),
      403,
      "LOCAL_ONLY",
      "Demo access is restricted to the local computer.",
    );
    const b = parse(
      z
        .object({ role: z.enum(["coordinator", "volunteer", "recipient"]) })
        .strict(),
      req.body,
    );
    return store.demoSession(b.role);
  });
  app.post("/api/auth/logout", async (req) => {
    store.logout(req.token);
    return { ok: true };
  });
  app.get("/api/snapshot", async (req) => view(read(req), req));
  app.post("/api/users", async (req) => {
    coordinator(req);
    const b = parse(
      z
        .object({
          ...accountFields,
          role: z.enum(["coordinator", "volunteer", "recipient"]),
          volunteerId: text().optional(),
          recipientId: text().optional(),
        })
        .strict(),
      req.body,
    );
    let user!: User;
    const state = read(req);
    store.mutate(req.user.orgId, state.version, (s) => {
      if (b.role === "volunteer")
        assert(
          b.volunteerId && s.volunteers.some((v) => v.id === b.volunteerId),
          422,
          "INVALID_LINK",
          "A volunteer account requires a volunteer in this organization.",
        );
      else
        assert(
          !b.volunteerId,
          422,
          "INVALID_LINK",
          "Only volunteer accounts may link a volunteer.",
        );
      if (b.role === "recipient")
        assert(
          b.recipientId && s.recipients.some((r) => r.id === b.recipientId),
          422,
          "INVALID_LINK",
          "A recipient account requires a recipient in this organization.",
        );
      else
        assert(
          !b.recipientId,
          422,
          "INVALID_LINK",
          "Only recipient accounts may link a recipient.",
        );
      user = store.insertUser(req.user.orgId, b);
      audit(s, req.user, "user.created", user.id, `Created ${b.role} account.`);
    });
    return { user };
  });
  app.post("/api/donors", async (req) => {
    coordinator(req);
    const b = parse(
      z.object({ ...version, ...donorFields }).strict(),
      req.body,
    );
    return change(req, b.expectedVersion, (s) => {
      const { expectedVersion, ...fields } = b;
      const donor = { id: id("donor"), ...fields };
      s.donors.push(donor);
      audit(s, req.user, "donor.created", donor.id, donor.name);
    });
  });
  app.patch("/api/donors/:id", async (req) => {
    coordinator(req);
    const rid = routeId(req);
    const b = parse(
      z.object(donorFields).partial().extend(version).strict(),
      req.body,
    );
    return change(req, b.expectedVersion, (s) => {
      const entity = s.donors.find((d) => d.id === rid);
      assert(entity, 404, "NOT_FOUND", "Donor not found.");
      const { expectedVersion, ...fields } = b;
      if (b.location)
        assert(
          !s.rescues.some(
            (r) =>
              activeCommitment(r) &&
              s.donations.find((d) => d.id === r.donationId)?.donorId === rid,
          ),
          409,
          "ACTIVE_COMMITMENT",
          "Donor location cannot change while an active rescue depends on it. Resolve the assignment first.",
        );
      Object.assign(entity, fields);
      audit(
        s,
        req.user,
        "donor.updated",
        rid,
        "Donor details updated; previous proposals are stale.",
      );
    });
  });
  app.post("/api/recipients", async (req) => {
    coordinator(req);
    const b = parse(
      z.object({ ...version, ...recipientFields }).strict(),
      req.body,
    );
    return change(req, b.expectedVersion, (s) => {
      const { expectedVersion, ...fields } = b;
      const recipient = { id: id("rec"), ...fields };
      s.recipients.push(recipient);
      audit(s, req.user, "recipient.created", recipient.id, recipient.name);
    });
  });
  app.patch("/api/recipients/:id", async (req) => {
    const rid = routeId(req);
    assert(
      req.user.role === "coordinator" ||
        (req.user.role === "recipient" && req.user.recipientId === rid),
      403,
      "FORBIDDEN",
      "You cannot change this recipient.",
    );
    const b = parse(
      z
        .object({
          capacityKg: recipientFields.capacityKg.optional(),
          openingWindow: window.optional(),
          acceptedCategories: z.array(category).min(1).max(4).optional(),
          notes: z.string().max(1000).optional(),
          ...version,
        })
        .strict(),
      req.body,
    );
    return change(req, b.expectedVersion, (s) => {
      const entity = s.recipients.find((r) => r.id === rid);
      assert(entity, 404, "NOT_FOUND", "Recipient not found.");
      const { expectedVersion, ...fields } = b;
      if (b.capacityKg !== undefined || b.openingWindow || b.acceptedCategories)
        assert(
          !s.rescues.some((r) => r.recipientId === rid && activeCommitment(r)),
          409,
          "ACTIVE_COMMITMENT",
          "Receiving constraints cannot change while an active rescue depends on them. Resolve the assignment first.",
        );
      Object.assign(entity, fields);
      audit(
        s,
        req.user,
        "recipient.updated",
        rid,
        "Receiving policy updated; existing assignments must be reviewed and prior proposals are stale.",
      );
      notify(s, {
        kind: "status",
        title: "Receiving policy changed",
        body: "Review active rescues against the updated receiving constraints.",
        audience: "coordinator",
      });
    });
  });
  app.post("/api/volunteers", async (req) => {
    coordinator(req);
    const b = parse(
      z.object({ ...version, ...volunteerFields }).strict(),
      req.body,
    );
    return change(req, b.expectedVersion, (s) => {
      const { expectedVersion, ...fields } = b;
      const volunteer = { id: id("v"), ...fields };
      s.volunteers.push(volunteer);
      audit(s, req.user, "volunteer.created", volunteer.id, volunteer.name);
    });
  });
  app.patch("/api/volunteers/:id", async (req) => {
    const rid = routeId(req);
    assert(
      req.user.role === "coordinator" ||
        (req.user.role === "volunteer" && req.user.volunteerId === rid),
      403,
      "FORBIDDEN",
      "You cannot change this volunteer.",
    );
    const schema = z
      .object({
        available: z.boolean().optional(),
        capacityKg: volunteerFields.capacityKg.optional(),
        availability: window.optional(),
        location: location.optional(),
        trained: z.boolean().optional(),
        vehicle: text().optional(),
        notes: z.string().max(1000).optional(),
        ...version,
      })
      .strict();
    const b = parse(schema, req.body);
    if (req.user.role !== "coordinator")
      assert(
        b.capacityKg === undefined &&
          b.trained === undefined &&
          b.vehicle === undefined &&
          b.notes === undefined,
        403,
        "FORBIDDEN",
        "Only a coordinator may change capacity, training, vehicle or notes.",
      );
    return change(req, b.expectedVersion, (s) => {
      const v = s.volunteers.find((v) => v.id === rid);
      assert(v, 404, "NOT_FOUND", "Volunteer not found.");
      const { expectedVersion, ...fields } = b;
      if (Object.keys(fields).some((k) => k !== "notes"))
        assert(
          !s.rescues.some((r) => r.volunteerId === rid && activeCommitment(r)),
          409,
          "ACTIVE_COMMITMENT",
          "Eligibility cannot change while a rescue is active or food remains in custody. Cancel before pickup or resolve custody first.",
        );
      Object.assign(v, fields);
      audit(
        s,
        req.user,
        "volunteer.updated",
        rid,
        "Volunteer availability or profile updated. Existing assignments are not silently cancelled.",
      );
    });
  });
  app.post("/api/donations", async (req) => {
    coordinator(req);
    const b = parse(
      z.object({ ...version, ...donationFields }).strict(),
      req.body,
    );
    return change(req, b.expectedVersion, (state) => {
      const { expectedVersion, ...fields } = b;
      addDonation(state, req.user, fields);
    });
  });
  app.post("/api/rescues", async (req) => {
    coordinator(req);
    const b = parse(
      z
        .object({
          ...version,
          donationId: text(),
          recipientId: text(),
          deliveryWindow: window,
          volunteerId: text().optional(),
        })
        .strict(),
      req.body,
    );
    return change(req, b.expectedVersion, (s) => {
      assert(
        s.donations.some((d) => d.id === b.donationId) &&
          s.recipients.some((r) => r.id === b.recipientId),
        422,
        "INVALID_LINK",
        "Donation and recipient must belong to your organization.",
      );
      assert(
        !s.rescues.some(
          (r) => r.donationId === b.donationId && r.status !== "cancelled",
        ),
        409,
        "DUPLICATE_RESCUE",
        "This donation already has a non-cancelled rescue.",
      );
      const rescue: ReturnType<typeof rescueFor> = {
        id: id("r"),
        donationId: b.donationId,
        recipientId: b.recipientId,
        deliveryWindow: b.deliveryWindow,
        volunteerId: b.volunteerId ?? null,
        status: b.volunteerId ? "assigned" : "needs_recovery",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      s.rescues.push(rescue);
      if (b.volunteerId) {
        const v = s.volunteers.find((v) => v.id === b.volunteerId);
        assert(
          v,
          422,
          "INVALID_LINK",
          "Volunteer must belong to your organization.",
        );
        const candidate = evaluateCandidate(s, rescue, v);
        assert(
          candidate.feasible,
          422,
          "CONSTRAINT_VIOLATION",
          "Initial assignment does not satisfy constraints.",
        );
        rescue.pickupEta = candidate.pickupEta;
        rescue.deliveryEta = candidate.deliveryEta;
        notify(s, {
          kind: "assignment",
          title: "New rescue awaiting acceptance",
          body: "Review your rescue details and accept before pickup.",
          audience: "volunteer",
          volunteerId: v.id,
        });
      }
      audit(s, req.user, "rescue.created", rescue.id, "Rescue created.");
    });
  });
  app.post("/api/rescues/:id/accept", async (req) => {
    const rid = routeId(req);
    const b = parse(z.object(version).strict(), req.body);
    return change(req, b.expectedVersion, (s) => {
      const r = rescueFor(s, rid);
      canOperate(req, r);
      assert(
        r.status === "assigned" && r.volunteerId,
        422,
        "INVALID_STATE",
        "Only an assigned rescue can be accepted.",
      );
      assert(
        !r.acceptedAt,
        409,
        "ALREADY_ACCEPTED",
        "This rescue was already accepted.",
      );
      r.acceptedAt = nowIso();
      r.updatedAt = nowIso();
      audit(
        s,
        req.user,
        "rescue.accepted",
        rid,
        "Volunteer acceptance recorded.",
      );
      notify(s, {
        kind: "status",
        title: "Volunteer accepted rescue",
        body: `Rescue ${rid} was accepted.`,
        audience: "coordinator",
      });
    });
  });
  app.post("/api/rescues/:id/cancel", async (req) => {
    const rid = routeId(req);
    const b = parse(
      z.object({ ...version, reason: text(1000) }).strict(),
      req.body,
    );
    return change(req, b.expectedVersion, (s) => {
      const r = rescueFor(s, rid);
      canOperate(req, r);
      assert(
        ["assigned", "picked_up"].includes(r.status),
        422,
        "INVALID_STATE",
        "Only active assignments can be cancelled.",
      );
      const custody = r.status === "picked_up";
      const original = r.volunteerId!;
      r.status = custody ? "escalated" : "needs_recovery";
      r.custodyHeld = custody;
      r.cancellationReason = b.reason;
      if (!custody) {
        r.volunteerId = null;
        delete r.acceptedAt;
        delete r.pickupEta;
        delete r.deliveryEta;
      }
      r.updatedAt = nowIso();
      const v = s.volunteers.find((v) => v.id === original);
      if (v) v.available = false;
      audit(s, req.user, "volunteer.cancelled", rid, b.reason);
      notify(s, {
        kind: custody ? "escalation" : "recovery",
        title: custody
          ? "Chain of custody needs human attention"
          : "Volunteer cancelled before pickup",
        body: custody
          ? "Food was already picked up. Contact the holder and receiving team; this app will not automatically reassign."
          : `Rescue ${rid} needs a recovery proposal. Reason: ${b.reason}`,
        audience: "coordinator",
      });
      notify(s, {
        kind: custody ? "escalation" : "status",
        title: "Your cancellation was recorded",
        body: custody
          ? "The coordinator must resolve the food already in your custody. Do not treat this as a transfer of responsibility."
          : "The assignment was released for coordinator recovery. Your availability is now off until you update it.",
        audience: "volunteer",
        volunteerId: original,
      });
      notify(s, {
        kind: custody ? "escalation" : "recovery",
        title: "Rescue coverage needs attention",
        body: "The coordinator is reviewing an interruption. No replacement or revised arrival time is confirmed yet.",
        audience: "recipient",
        recipientId: r.recipientId,
      });
    });
  });
  app.post("/api/rescues/:id/status", async (req) => {
    const rid = routeId(req);
    const b = parse(
      z
        .object({ ...version, status: z.enum(["picked_up", "delivered"]) })
        .strict(),
      req.body,
    );
    return change(req, b.expectedVersion, (s) => {
      const r = rescueFor(s, rid);
      canOperate(req, r);
      assert(
        (r.status === "assigned" && b.status === "picked_up") ||
          (r.status === "picked_up" && b.status === "delivered"),
        422,
        "INVALID_TRANSITION",
        "Status must proceed assigned → picked up → delivered.",
      );
      assert(
        r.acceptedAt,
        422,
        "ACCEPTANCE_REQUIRED",
        "Volunteer acceptance must be recorded before pickup.",
      );
      r.status = b.status;
      r.custodyHeld = b.status === "picked_up";
      r.updatedAt = nowIso();
      audit(
        s,
        req.user,
        `rescue.${b.status}`,
        rid,
        `Status reported by ${req.user.role}; not independent physical verification.`,
      );
      notify(s, {
        kind: "status",
        title:
          b.status === "delivered" ? "Delivery reported" : "Pickup reported",
        body: `Rescue ${rid}: ${b.status.replace("_", " ")}.`,
        audience: "recipient",
        recipientId: r.recipientId,
      });
    });
  });
  app.post("/api/rescues/:id/confirm", async (req) => {
    const rid = routeId(req);
    const b = parse(z.object(version).strict(), req.body);
    return change(req, b.expectedVersion, (s) => {
      const r = rescueFor(s, rid);
      assert(
        req.user.role === "coordinator" ||
          (req.user.role === "recipient" &&
            req.user.recipientId === r.recipientId),
        403,
        "FORBIDDEN",
        "Only the receiving recipient or a coordinator may acknowledge delivery.",
      );
      assert(
        r.status === "delivered",
        422,
        "INVALID_STATE",
        "Delivery must be reported first.",
      );
      assert(
        !r.recipientConfirmedAt,
        409,
        "ALREADY_CONFIRMED",
        "Delivery already acknowledged.",
      );
      r.recipientConfirmedAt = nowIso();
      r.updatedAt = nowIso();
      audit(
        s,
        req.user,
        "recipient.confirmed",
        rid,
        "Recipient acknowledgment recorded; not a food-safety certification.",
      );
    });
  });
  app.post("/api/rescues/:id/escalate", async (req) => {
    coordinator(req);
    const rid = routeId(req);
    const b = parse(
      z.object({ ...version, reason: text(1000) }).strict(),
      req.body,
    );
    return change(req, b.expectedVersion, (s) => {
      const r = rescueFor(s, rid);
      assert(
        ["needs_recovery", "assigned", "picked_up"].includes(r.status),
        422,
        "INVALID_STATE",
        "This rescue cannot be escalated from its current status.",
      );
      r.custodyHeld = r.status === "picked_up" || r.custodyHeld === true;
      r.status = "escalated";
      r.updatedAt = nowIso();
      audit(s, req.user, "rescue.escalated", rid, b.reason);
      notify(s, {
        kind: "escalation",
        title: "Human escalation recorded",
        body: b.reason,
        audience: "coordinator",
      });
    });
  });
  app.post("/api/rescues/:id/resolve", async (req) => {
    coordinator(req);
    const rid = routeId(req);
    const b = parse(
      z
        .object({
          ...version,
          resolution: z.enum(["resume_recovery", "delivered", "cancelled"]),
          reason: text(1000),
        })
        .strict(),
      req.body,
    );
    return change(req, b.expectedVersion, (s) => {
      const r = rescueFor(s, rid);
      assert(
        r.status === "escalated",
        422,
        "INVALID_STATE",
        "Only an escalated rescue can be resolved.",
      );
      if (b.resolution === "resume_recovery") {
        assert(
          !r.custodyHeld,
          422,
          "CUSTODY_HELD",
          "Food custody must be resolved by a person; automatic recovery is prohibited after pickup.",
        );
        r.status = "needs_recovery";
        r.volunteerId = null;
        delete r.acceptedAt;
        delete r.pickupEta;
        delete r.deliveryEta;
      } else {
        r.status = b.resolution;
        r.custodyHeld = false;
      }
      r.updatedAt = nowIso();
      audit(
        s,
        req.user,
        "escalation.resolved",
        rid,
        `${b.resolution}: ${b.reason}. Coordinator-reported disposition, not independent verification.`,
      );
      notify(s, {
        kind: "status",
        title: "Escalation disposition recorded",
        body: `Rescue ${rid}: ${b.resolution.replace("_", " ")}. ${b.reason}`,
        audience: "coordinator",
      });
    });
  });
  app.post("/api/plans/generate", async (req): Promise<PlanResponse> => {
    coordinator(req);
    const b = parse(
      z
        .object({
          ...version,
          rescueIds: z.array(text()).min(1).max(50).optional(),
          mode: z.enum(["offline", "provider"]).optional(),
        })
        .strict(),
      req.body,
    );
    const current = read(req);
    assert(
      current.version === b.expectedVersion,
      409,
      "STALE_VERSION",
      "State changed. Refresh and review before planning.",
    );
    let plan;
    if (b.mode === "provider") {
      assert(
        provider,
        503,
        "CONSENT_REQUIRED",
        "External investigation requires the AI workspace consent workflow. Offline mode remains available.",
      );
      plan = await investigateWithProvider(current, b.rescueIds, provider);
    } else plan = generatePlan(current, b.rescueIds);
    const result = store.mutate(req.user.orgId, b.expectedVersion, (s) => {
      s.plans.unshift(plan);
      s.plans = s.plans.slice(0, 50);
      audit(
        s,
        req.user,
        "plan.generated",
        plan.id,
        `${plan.explanationMode}; ${plan.status}; nothing assigned.`,
      );
    });
    return { plan, snapshot: view(result.state, req) };
  });
  app.post("/api/plans/:id/apply", async (req): Promise<PlanResponse> => {
    coordinator(req);
    const rid = routeId(req);
    const b = parse(
      z
        .object({
          ...version,
          idempotencyKey: z
            .string()
            .min(8)
            .max(100)
            .regex(/^[\w-]+$/),
        })
        .strict(),
      req.body,
    );
    const result = store.mutate(
      req.user.orgId,
      b.expectedVersion,
      (s) => {
        const plan = s.plans.find((p) => p.id === rid);
        assert(plan, 404, "NOT_FOUND", "Plan not found.");
        assert(
          plan.status === "ready",
          422,
          "PLAN_NOT_READY",
          "Only a feasible, unapplied plan can be approved.",
        );
        assert(
          plan.baseVersion === s.version,
          409,
          "STALE_PLAN",
          "Plan evidence is stale. Generate and review a new proposal.",
        );
        assert(
          Date.parse(plan.expiresAt) > Date.now(),
          409,
          "PLAN_EXPIRED",
          "Plan expired. Generate a fresh proposal.",
        );
        const reserved = new Set<string>();
        for (const replacement of plan.replacements) {
          const r = rescueFor(s, replacement.rescueId);
          assert(
            r.status === "needs_recovery",
            409,
            "STALE_PLAN",
            "A rescue no longer needs recovery.",
          );
          const v = s.volunteers.find((v) => v.id === replacement.volunteerId);
          assert(v, 422, "CONSTRAINT_VIOLATION", "Volunteer no longer exists.");
          const c = evaluateCandidate(s, r, v, Date.now(), reserved);
          assert(
            c.feasible,
            409,
            "CONSTRAINT_CHANGED",
            "Current constraints no longer permit this assignment. Generate a new proposal.",
          );
          reserved.add(v.id);
          r.volunteerId = v.id;
          r.status = "assigned";
          r.pickupEta = c.pickupEta;
          r.deliveryEta = c.deliveryEta;
          r.updatedAt = nowIso();
          delete r.acceptedAt;
          notify(s, {
            kind: "assignment",
            title: "Recovery assignment awaiting your acceptance",
            body: `Review rescue ${r.id}, then accept or cancel. No pickup is assumed.`,
            audience: "volunteer",
            volunteerId: v.id,
          });
          notify(s, {
            kind: "status",
            title: "Replacement volunteer reserved",
            body: `Rescue ${r.id} has coordinator-approved coverage, awaiting volunteer acceptance.`,
            audience: "recipient",
            recipientId: r.recipientId,
          });
        }
        plan.status = "applied";
        plan.appliedAt = nowIso();
        audit(
          s,
          req.user,
          "plan.applied",
          plan.id,
          `Coordinator approved ${plan.replacements.length} replacement(s), pending volunteer acceptance.`,
        );
        return plan;
      },
      {
        actorId: req.user.id,
        key: b.idempotencyKey,
        fingerprint: JSON.stringify({
          route: rid,
          expectedVersion: b.expectedVersion,
        }),
      },
    );
    return { plan: result.result, snapshot: view(result.state, req) };
  });
  app.post("/api/plans/:id/explain", async () =>
    fail(
      410,
      "USE_INVESTIGATION",
      "Provider investigation requires explicit AI consent. Prepare and review POST /api/ai/consents with operation=investigate, then submit POST /api/ai/operations with the matching consentId. Recovery approval remains separate.",
    ),
  );
  app.post("/api/notifications/:id/read", async (req) => {
    const rid = routeId(req);
    const b = parse(z.object(version).strict(), req.body);
    return change(req, b.expectedVersion, (s) => {
      const n = s.notifications.find((n) => n.id === rid);
      assert(
        n &&
          n.audience === req.user.role &&
          (!n.volunteerId || n.volunteerId === req.user.volunteerId) &&
          (!n.recipientId || n.recipientId === req.user.recipientId),
        404,
        "NOT_FOUND",
        "Notification not found.",
      );
      n.read = true;
    });
  });
  app.post("/api/demo/reset", async (req) => {
    coordinator(req);
    const b = parse(
      z
        .object({
          ...version,
          scenario: z
            .enum(["baseline", "no_capacity", "tight_window"])
            .default("baseline"),
        })
        .strict(),
      req.body,
    );
    return change(req, b.expectedVersion, (s) => {
      assert(
        demo && s.organization.demo,
        403,
        "DEMO_ONLY",
        "Only a local demo organization can reset scenarios.",
      );
      const previousVersion = s.version;
      Object.assign(s, seedState(s.organization, b.scenario));
      s.version = previousVersion;
      audit(
        s,
        req.user,
        "scenario.reset",
        s.organization.id,
        `Reset to synthetic ${b.scenario} scenario.`,
      );
    });
  });
  app.post("/api/imports/donations/validate", async (req) => {
    coordinator(req);
    const b = parse(
      z.object({ csv: z.string().min(1).max(200000) }).strict(),
      req.body,
    );
    return validateCsv(read(req), b.csv);
  });
  app.post("/api/imports/donations", async (req) => {
    coordinator(req);
    const b = parse(
      z.object({ ...version, csv: z.string().min(1).max(200000) }).strict(),
      req.body,
    );
    return change(req, b.expectedVersion, (s) => {
      const result = validateCsv(s, b.csv);
      assert(
        result.valid,
        422,
        "CSV_INVALID",
        "CSV validation failed; no rows were imported.",
      );
      for (const row of result.preview)
        s.donations.push({
          id: id("d"),
          donorId: row.donorId,
          description: row.description,
          category: "shelf_stable",
          sealed: true,
          weightKg: row.weightKg,
          servings: row.servings,
          handlingNotes:
            "Imported as sealed shelf-stable goods. Coordinator must verify the source description and packaging.",
          pickupWindow: { start: row.pickupStart, end: row.pickupEnd },
          createdAt: nowIso(),
        });
      audit(
        s,
        req.user,
        "donations.imported",
        s.organization.id,
        `${result.rows} rows imported atomically as sealed shelf-stable donations.`,
      );
    });
  });
  app.get("/api/exports/donations.csv", async (req, reply) => {
    coordinator(req);
    return reply
      .type("text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        'attachment; filename="rescuerelay-donations.csv"',
      )
      .send(donationCsv(read(req)));
  });
  app.get("/api/exports/audit.csv", async (req, reply) => {
    coordinator(req);
    const s = read(req);
    return reply
      .type("text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        'attachment; filename="rescuerelay-audit.csv"',
      )
      .send(
        encodeCsv([
          ["id", "at", "actorId", "action", "entityId", "detail"],
          ...s.audit.map((a) => [
            a.id,
            a.at,
            a.actorId,
            a.action,
            a.entityId,
            a.detail,
          ]),
        ]),
      );
  });
  registerAiRoutes(app, store, options.ai);
  if (options.staticRoot) {
    const root = resolve(options.staticRoot);
    const mime: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".webmanifest": "application/manifest+json",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".ico": "image/x-icon",
      ".woff2": "font/woff2",
      ".txt": "text/plain; charset=utf-8",
    };
    app.get("/*", async (req, reply) => {
      if (req.url.split("?")[0] === "/api" || req.url.startsWith("/api/"))
        return reply
          .status(404)
          .send({ error: "API route not found.", code: "NOT_FOUND" });
      let pathname: string;
      try {
        pathname = decodeURIComponent(req.url.split("?")[0]!);
      } catch {
        return reply
          .status(400)
          .send({ error: "Invalid path.", code: "BAD_PATH" });
      }
      assert(
        !pathname.includes("\\") && !pathname.includes("\0"),
        400,
        "BAD_PATH",
        "Invalid path.",
      );
      let file = resolve(root, "." + pathname);
      assert(
        file === root || file.startsWith(root + sep),
        403,
        "FORBIDDEN",
        "Path is outside the static client root.",
      );
      try {
        const entry = await stat(file);
        if (!entry.isFile()) file = resolve(root, "index.html");
      } catch {
        if (extname(pathname))
          return reply
            .status(404)
            .send({ error: "Static asset not found.", code: "NOT_FOUND" });
        file = resolve(root, "index.html");
      }
      try {
        await stat(file);
      } catch {
        return reply.status(503).send({
          error:
            "Web build is missing. Run npm run build -w @rescuerelay/web before npm start.",
          code: "WEB_NOT_BUILT",
        });
      }
      const canonical = await realpath(file);
      assert(
        canonical === root || canonical.startsWith(root + sep),
        403,
        "FORBIDDEN",
        "Static symlinks cannot leave the client root.",
      );
      reply.header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
      );
      return reply
        .type(mime[extname(file)] ?? "application/octet-stream")
        .send(createReadStream(file));
    });
  }
  return { app, store };
}
