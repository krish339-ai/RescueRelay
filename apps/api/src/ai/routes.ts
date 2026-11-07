import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { assert } from "../errors.js";
import { audit, id, nowIso } from "../state.js";
import { Store } from "../store.js";
import { snapshot } from "../snapshot.js";
import { donationFields, text, version } from "../schemas.js";
import { addDonation } from "../domain.js";
import { AiService, type AiOptions } from "./service.js";
import { aiState, publicDraft } from "./state.js";
import { operationSchema } from "./schemas.js";
export function registerAiRoutes(
  app: FastifyInstance,
  store: Store,
  options: AiOptions = {},
) {
  const service = new AiService(store, options);
  const coordinator = (req: FastifyRequest) =>
    assert(
      req.user.role === "coordinator",
      403,
      "FORBIDDEN",
      "Only an organization coordinator can use external AI workspace operations.",
    );
  const body = (value: unknown, execution: boolean) => {
    const outer = z
      .object({
        ...version,
        operation: z.string(),
        input: z.unknown(),
        ...(execution ? { consentId: text(100) } : {}),
      })
      .strict()
      .parse(value);
    return {
      request: operationSchema.parse({
        operation: outer.operation,
        input: outer.input,
      }),
      expectedVersion: outer.expectedVersion,
      consentId: "consentId" in outer ? (outer.consentId as string) : undefined,
    };
  };
  app.get("/api/ai/capabilities", async (req) => {
    coordinator(req);
    return service.capabilities();
  });
  app.get("/api/ai/drafts", async (req) => {
    coordinator(req);
    const a = aiState(store.read(req.user.orgId));
    return {
      receipts: a.receipts
        .filter((r) => r.ownerId === req.user.id)
        .map(({ ownerId, ...safe }) => safe),
      drafts: a.drafts
        .filter((d) => d.ownerId === req.user.id)
        .map(publicDraft),
      referencePolicies: a.referencePolicies,
      memories: a.memories
        .filter((m) => m.ownerId === req.user.id)
        .map(({ ownerId, remoteId, ...safe }) => safe),
    };
  });
  app.post("/api/ai/consents", { bodyLimit: 3 * 1024 * 1024 }, async (req) => {
    coordinator(req);
    const b = body(req.body, false);
    return service.prepare(req.user, b.request, b.expectedVersion);
  });
  app.post(
    "/api/ai/operations",
    { bodyLimit: 3 * 1024 * 1024 },
    async (req) => {
      coordinator(req);
      const b = body(req.body, true);
      return service.execute(
        req.user,
        b.request,
        b.expectedVersion,
        b.consentId!,
      );
    },
  );
  app.post("/api/ai/drafts/:id/approve", async (req) => {
    coordinator(req);
    const draftId = z.object({ id: text() }).parse(req.params).id;
    const b = z
      .object({
        ...version,
        referencePolicy: z
          .object({
            title: text(200),
            text: text(12000),
            scope: z.enum([
              "handling",
              "volunteer",
              "recipient",
              "routing",
              "approval",
            ]),
          })
          .strict()
          .optional(),
        donation: z.object(donationFields).strict().optional(),
      })
      .strict()
      .refine(
        (x) => Number(!!x.referencePolicy) + Number(!!x.donation) === 1,
        "Provide exactly one reviewed reference policy or donation.",
      )
      .parse(req.body);
    const changed = store.mutate(req.user.orgId, b.expectedVersion, (s) => {
      const d = aiState(s).drafts.find(
        (d) => d.id === draftId && d.ownerId === req.user.id,
      );
      assert(d, 404, "NOT_FOUND", "Your draft was not found.");
      assert(
        d.status === "needs_review",
        409,
        "DRAFT_NOT_REVIEWABLE",
        "Only an unreviewed completed draft may be approved.",
      );
      if (b.referencePolicy) {
        assert(
          d.kind === "reference_policy",
          422,
          "DRAFT_KIND",
          "This draft is not a reference-policy draft.",
        );
        const policy = {
          id: id("ref-policy"),
          title: b.referencePolicy.title,
          text: b.referencePolicy.text,
          scope: b.referencePolicy.scope,
          version: "1",
          source: `Human-reviewed ${d.provider} reference draft ${d.id}. Context only; never overrides configured constraints.`,
        };
        aiState(s).referencePolicies.push(policy);
        d.approvedEntityId = policy.id;
      } else {
        assert(
          d.kind === "rescue_note",
          422,
          "DRAFT_KIND",
          "This draft is not a rescue-note draft.",
        );
        d.approvedEntityId = addDonation(s, req.user, b.donation!).id;
      }
      d.status = "approved";
      d.reviewedAt = nowIso();
      d.updatedAt = nowIso();
      audit(
        s,
        req.user,
        "ai.draft.approved",
        d.id,
        `Human reviewed ${d.kind}; created ${d.approvedEntityId}. No assignment applied and configured constraints unchanged.`,
      );
    });
    return snapshot(changed.state, req.user, false);
  });
  app.post("/api/ai/drafts/:id/reject", async (req) => {
    coordinator(req);
    const draftId = z.object({ id: text() }).parse(req.params).id;
    const b = z
      .object({ ...version, reason: text(1000) })
      .strict()
      .parse(req.body);
    const changed = store.mutate(req.user.orgId, b.expectedVersion, (s) => {
      const d = aiState(s).drafts.find(
        (d) => d.id === draftId && d.ownerId === req.user.id,
      );
      assert(d, 404, "NOT_FOUND", "Your draft was not found.");
      assert(
        d.status === "needs_review",
        409,
        "DRAFT_NOT_REVIEWABLE",
        "Only a completed unreviewed draft can be rejected.",
      );
      d.status = "rejected";
      d.reviewedAt = nowIso();
      d.updatedAt = nowIso();
      audit(s, req.user, "ai.draft.rejected", d.id, b.reason);
    });
    return snapshot(changed.state, req.user, false);
  });
  return service;
}
