import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { seedState } from "../src/state.js";
import {
  evaluateCandidate,
  generatePlan,
  retrievePolicies,
} from "../src/planner.js";
import {
  investigateWithProvider,
  type InvestigationProvider,
  type ModelTurn,
} from "../src/provider.js";
import { encodeCsv, validateCsv } from "../src/csv.js";
const org = {
  id: "test-org",
  name: "Synthetic test org",
  demo: true,
  createdAt: new Date().toISOString(),
};
async function fixture() {
  const context = await createApp({ demoMode: true, rateLimit: false });
  const session = (
    await context.app.inject({
      method: "POST",
      url: "/api/auth/demo",
      payload: { role: "coordinator" },
    })
  ).json();
  const request = async (
    method: any,
    url: string,
    body?: unknown,
    token = session.token,
  ) =>
    context.app.inject({
      method,
      url: `/api${url}`,
      headers: { Authorization: `Bearer ${token}` },
      ...(body !== undefined ? { payload: body as any } : {}),
    });
  return { ...context, session, request };
}
test("unauthenticated access is rejected and demo is disabled by default", async () => {
  const { app } = await createApp();
  try {
    assert.equal((await app.inject({ url: "/api/snapshot" })).statusCode, 401);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/demo",
          payload: { role: "coordinator" },
        })
      ).statusCode,
      404,
    );
  } finally {
    await app.close();
  }
});
test("registration isolates organizations and passwords/sessions are hashed", async () => {
  const { app, store } = await createApp({ rateLimit: false });
  try {
    const a = (
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          name: "Owner",
          email: "a@example.test",
          password: "a-long-test-password",
          organizationName: "A",
        },
      })
    ).json();
    const b = (
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          name: "Other",
          email: "b@example.test",
          password: "another-long-password",
          organizationName: "B",
        },
      })
    ).json();
    assert.notEqual(a.organization.id, b.organization.id);
    const user = store.db
      .prepare("SELECT password_hash FROM users WHERE id=?")
      .get(a.user.id) as any;
    assert(!user.password_hash.includes("a-long-test-password"));
    const session = store.db
      .prepare("SELECT token_hash FROM sessions WHERE user_id=?")
      .get(a.user.id) as any;
    assert.notEqual(session.token_hash, a.token);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { email: "a@example.test", password: "wrong" },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: {
            email: "A@example.test",
            password: "a-long-test-password",
          },
        })
      ).statusCode,
      200,
    );
  } finally {
    await app.close();
  }
});
test("complete recovery approval is idempotent and waits for volunteer acceptance", async () => {
  const f = await fixture();
  try {
    let s = (await f.request("GET", "/snapshot")).json();
    const generated = await f.request("POST", "/plans/generate", {
      expectedVersion: s.version,
    });
    assert.equal(generated.statusCode, 200);
    const { plan, snapshot } = generated.json();
    assert.equal(plan.status, "ready");
    assert.equal(plan.baseVersion, snapshot.version);
    assert.equal(
      snapshot.rescues.find((r: any) => r.id === "r-101").status,
      "needs_recovery",
    );
    const body = {
      expectedVersion: snapshot.version,
      idempotencyKey: "approve-test-1",
    };
    const approved = (
      await f.request("POST", `/plans/${plan.id}/apply`, body)
    ).json();
    assert.equal(approved.plan.status, "applied");
    const recovered = approved.snapshot.rescues.find(
      (r: any) => r.id === "r-101",
    );
    assert.equal(recovered.status, "assigned");
    assert.equal(recovered.acceptedAt, undefined);
    const replay = (
      await f.request("POST", `/plans/${plan.id}/apply`, body)
    ).json();
    assert.equal(replay.snapshot.version, approved.snapshot.version);
    assert.equal(replay.snapshot.audit.length, approved.snapshot.audit.length);
    const changed = await f.request("POST", `/plans/${plan.id}/apply`, {
      ...body,
      expectedVersion: approved.snapshot.version,
    });
    assert.equal(changed.statusCode, 409);
    const pickup = await f.request("POST", "/rescues/r-101/status", {
      expectedVersion: approved.snapshot.version,
      status: "picked_up",
    });
    assert.equal(pickup.json().code, "ACCEPTANCE_REQUIRED");
    s = (
      await f.request("POST", "/rescues/r-101/accept", {
        expectedVersion: approved.snapshot.version,
      })
    ).json();
    s = (
      await f.request("POST", "/rescues/r-101/status", {
        expectedVersion: s.version,
        status: "picked_up",
      })
    ).json();
    assert.equal(
      s.rescues.find((r: any) => r.id === "r-101").custodyHeld,
      true,
    );
    s = (
      await f.request("POST", "/rescues/r-101/status", {
        expectedVersion: s.version,
        status: "delivered",
      })
    ).json();
    assert.equal(
      s.rescues.find((r: any) => r.id === "r-101").custodyHeld,
      false,
    );
  } finally {
    await f.app.close();
  }
});
test("parallel approval requests cannot apply two writes", async () => {
  const f = await fixture();
  try {
    const s = (await f.request("GET", "/snapshot")).json();
    const p = (
      await f.request("POST", "/plans/generate", { expectedVersion: s.version })
    ).json();
    const replies = await Promise.all(
      ["parallel-one", "parallel-two"].map((idempotencyKey) =>
        f.request("POST", `/plans/${p.plan.id}/apply`, {
          expectedVersion: p.snapshot.version,
          idempotencyKey,
        }),
      ),
    );
    assert.deepEqual(replies.map((r) => r.statusCode).sort(), [200, 409]);
    const latest = (await f.request("GET", "/snapshot")).json();
    assert.equal(
      latest.audit.filter((a: any) => a.action === "plan.applied").length,
      1,
    );
  } finally {
    await f.app.close();
  }
});
test("stale and expired plans cannot be applied", async () => {
  const f = await fixture();
  try {
    let s = (await f.request("GET", "/snapshot")).json();
    const p = (
      await f.request("POST", "/plans/generate", { expectedVersion: s.version })
    ).json();
    s = (
      await f.request("PATCH", "/volunteers/v-jordan", {
        expectedVersion: p.snapshot.version,
        available: false,
      })
    ).json();
    const result = await f.request("POST", `/plans/${p.plan.id}/apply`, {
      expectedVersion: s.version,
      idempotencyKey: "stale-approval",
    });
    assert.equal(result.json().code, "STALE_PLAN");
    const newer = (
      await f.request("POST", "/plans/generate", { expectedVersion: s.version })
    ).json();
    f.store.mutate("org-demo", newer.snapshot.version, (state) => {
      state.plans[0]!.expiresAt = "2000-01-01T00:00:00Z";
      state.plans[0]!.baseVersion = state.version + 1;
    });
    const expired = await f.request("POST", `/plans/${newer.plan.id}/apply`, {
      expectedVersion: newer.snapshot.version + 1,
      idempotencyKey: "expired-approval",
    });
    assert.equal(expired.json().code, "PLAN_EXPIRED");
  } finally {
    await f.app.close();
  }
});
test("roles cannot approve plans, view other volunteers or edit training", async () => {
  const f = await fixture();
  try {
    const vol = (
      await f.app.inject({
        method: "POST",
        url: "/api/auth/demo",
        payload: { role: "volunteer" },
      })
    ).json();
    const s = (
      await f.request("GET", "/snapshot", undefined, vol.token)
    ).json();
    assert.equal(s.volunteers.length, 1);
    assert.equal(s.plans.length, 0);
    assert.equal(s.audit.length, 0);
    assert(s.rescues.every((r: any) => r.volunteerId === "v-maya"));
    assert.equal(
      (
        await f.request(
          "POST",
          "/plans/generate",
          { expectedVersion: s.version },
          vol.token,
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await f.request(
          "PATCH",
          "/volunteers/v-maya",
          { expectedVersion: s.version, trained: true },
          vol.token,
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await f.request(
          "POST",
          "/rescues/r-101/cancel",
          { expectedVersion: s.version, reason: "Not mine" },
          vol.token,
        )
      ).statusCode,
      403,
    );
  } finally {
    await f.app.close();
  }
});
test("post-pickup cancellation retains custody and blocks automatic recovery", async () => {
  const f = await fixture();
  try {
    let s = (await f.request("GET", "/snapshot")).json();
    s = (
      await f.request("POST", "/rescues/r-102/accept", {
        expectedVersion: s.version,
      })
    ).json();
    s = (
      await f.request("POST", "/rescues/r-102/status", {
        expectedVersion: s.version,
        status: "picked_up",
      })
    ).json();
    s = (
      await f.request("POST", "/rescues/r-102/cancel", {
        expectedVersion: s.version,
        reason: "Vehicle stopped with goods on board",
      })
    ).json();
    const r = s.rescues.find((r: any) => r.id === "r-102");
    assert.equal(r.status, "escalated");
    assert.equal(r.volunteerId, "v-maya");
    assert.equal(r.custodyHeld, true);
    assert.equal(
      (
        await f.request("POST", "/rescues/r-102/resolve", {
          expectedVersion: s.version,
          resolution: "resume_recovery",
          reason: "Try another driver",
        })
      ).json().code,
      "CUSTODY_HELD",
    );
    assert.equal(
      (
        await f.request("PATCH", "/volunteers/v-maya", {
          expectedVersion: s.version,
          available: true,
        })
      ).json().code,
      "ACTIVE_COMMITMENT",
    );
    s = (
      await f.request("POST", "/rescues/r-102/resolve", {
        expectedVersion: s.version,
        resolution: "delivered",
        reason: "Coordinator verified receiving team collected goods safely",
      })
    ).json();
    assert.equal(
      s.rescues.find((r: any) => r.id === "r-102").custodyHeld,
      false,
    );
  } finally {
    await f.app.close();
  }
});
test("handling, invalid windows and active commitment changes are rejected atomically", async () => {
  const f = await fixture();
  try {
    const s = (await f.request("GET", "/snapshot")).json();
    const base = {
      expectedVersion: s.version,
      donorId: "donor-harbor",
      description: "Test",
      category: "chilled",
      weightKg: 10,
      servings: 20,
      sealed: true,
      pickupWindow: {
        start: "2030-01-01T10:00:00Z",
        end: "2030-01-01T11:00:00Z",
      },
    };
    assert.equal(
      (await f.request("POST", "/donations", base)).json().code,
      "UNSUPPORTED_HANDLING",
    );
    assert.equal(
      (
        await f.request("POST", "/donations", {
          ...base,
          category: "shelf_stable",
          pickupWindow: {
            start: "2030-01-01T12:00:00Z",
            end: "2030-01-01T11:00:00Z",
          },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await f.request("PATCH", "/recipients/rec-river", {
          expectedVersion: s.version,
          capacityKg: 1,
        })
      ).json().code,
      "ACTIVE_COMMITMENT",
    );
    assert.equal(
      (await f.request("GET", "/snapshot")).json().version,
      s.version,
    );
  } finally {
    await f.app.close();
  }
});
test("no-capacity and expired pickup scenarios escalate without assignment", () => {
  for (const scenario of ["no_capacity", "tight_window"] as const) {
    const s = seedState(org, scenario),
      p = generatePlan(s);
    assert.equal(p.status, "infeasible");
    assert.equal(p.replacements.length, 0);
    assert(p.trace.some((t) => t.tool === "escalate"));
    assert.equal(s.rescues[0]!.status, "needs_recovery");
  }
});
test("scarce-driver matching finds feasible global pairing rather than greedy false negative", () => {
  const s = seedState(org);
  s.rescues = s.rescues.filter((r) => r.id === "r-101");
  const d = structuredClone(s.donations[0]!);
  d.id = "scarce-donation";
  d.weightKg = 90;
  s.donations.push(d);
  const r = structuredClone(s.rescues[0]!);
  r.id = "scarce-rescue";
  r.donationId = d.id;
  s.rescues.push(r);
  s.recipients[0]!.capacityKg = 500;
  s.volunteers = s.volunteers.filter((v) =>
    ["v-jordan", "v-priya"].includes(v.id),
  );
  s.volunteers.find((v) => v.id === "v-jordan")!.capacityKg = 100;
  s.volunteers.find((v) => v.id === "v-priya")!.capacityKg = 70;
  const p = generatePlan(s);
  assert.equal(p.status, "ready");
  assert.equal(
    p.replacements.find((x) => x.rescueId === "scarce-rescue")!.volunteerId,
    "v-jordan",
  );
  assert.equal(new Set(p.replacements.map((x) => x.volunteerId)).size, 2);
});
test("policy retrieval returns exact persisted source excerpts", () => {
  const s = seedState(org),
    results = retrievePolicies(s, "sealed shelf_stable handling approval");
  assert(results.length > 0);
  for (const c of results) {
    const original = s.policies.find((p) => p.id === c.policyId)!;
    assert.equal(c.excerpt, original.text);
    assert.equal(c.version, original.version);
  }
});
test("agent selects escalation rather than route search for unsupported handling evidence", () => {
  const s = seedState(org);
  s.donations[0]!.sealed = false;
  const p = generatePlan(s);
  assert.equal(p.status, "infeasible");
  assert(!p.trace.some((t) => t.tool === "estimate_routes"));
  assert(p.trace.some((t) => t.tool === "escalate"));
});
test("recipient aggregate capacity and custodial assignment are hard constraints", () => {
  const s = seedState(org);
  s.recipients[0]!.capacityKg = 80;
  const v = s.volunteers.find((v) => v.id === "v-jordan")!;
  let c = evaluateCandidate(s, s.rescues[0]!, v);
  assert.equal(
    c.checks.find((c) => c.rule === "recipient_capacity")!.passed,
    false,
  );
  s.recipients[0]!.capacityKg = 500;
  s.rescues[1]!.status = "escalated";
  s.rescues[1]!.volunteerId = v.id;
  s.rescues[1]!.custodyHeld = true;
  c = evaluateCandidate(s, s.rescues[0]!, v);
  assert.equal(
    c.checks.find((c) => c.rule === "no_active_assignment")!.passed,
    false,
  );
});
class Scripted implements InvestigationProvider {
  constructor(private turns: ModelTurn[]) {}
  async next() {
    return (
      this.turns.shift() ?? {
        calls: [],
        continuation: [],
        text: "Evidence reviewed; await human approval.",
      }
    );
  }
}
const turn = (name: string, args: unknown): ModelTurn => ({
  calls: [{ id: `call-${name}`, name, arguments: JSON.stringify(args) }],
  continuation: [],
});
test("mock provider selects read-only tools then deterministic plan; no writes occur", async () => {
  const s = seedState(org);
  const p = await investigateWithProvider(
    s,
    undefined,
    new Scripted([
      turn("inspect_incident", { rescueId: "r-101" }),
      turn("retrieve_policy", { query: "handling capacity approval" }),
      turn("find_volunteers", { rescueId: "r-101" }),
      turn("check_candidates", { rescueId: "r-101" }),
    ]),
  );
  assert.equal(p.explanationMode, "provider-assisted");
  assert.equal(p.status, "ready");
  assert.equal(s.rescues[0]!.status, "needs_recovery");
  assert(p.trace.some((t) => t.reason.includes("Provider selected")));
});
test("provider rejects unsafe tools, untyped arguments and cross-incident reads", async () => {
  for (const call of [
    turn("apply_plan", {}),
    turn("inspect_incident", { rescueId: "r-101", unexpected: true }),
    turn("inspect_incident", { rescueId: "r-other-org" }),
  ])
    await assert.rejects(() =>
      investigateWithProvider(seedState(org), undefined, new Scripted([call])),
    );
});
test("provider budget and missing evidence cannot produce an approvable plan", async () => {
  const many = {
    calls: Array.from({ length: 11 }, (_, i) => ({
      id: `call${i}`,
      name: "retrieve_policy",
      arguments: '{"query":"handling"}',
    })),
    continuation: [],
  };
  await assert.rejects(
    () =>
      investigateWithProvider(seedState(org), undefined, new Scripted([many])),
    /budget/,
  );
  await assert.rejects(
    () => investigateWithProvider(seedState(org), undefined, new Scripted([])),
    /required incident/,
  );
  const p = await investigateWithProvider(
    seedState(org),
    undefined,
    new Scripted([
      turn("ask_clarification", {
        question: "Please verify packaging integrity.",
      }),
    ]),
  );
  assert.equal(p.status, "infeasible");
  assert.equal(p.replacements.length, 0);
});
test("CSV quotes, calendar dates, tenant donor IDs and spreadsheet formulas are safe", () => {
  const s = seedState(org),
    header = "donorId,description,weightKg,servings,pickupStart,pickupEnd\n";
  const valid = validateCsv(
    s,
    header +
      'donor-harbor,"Rice, beans",10,20,2030-01-01T10:00:00Z,2030-01-01T11:00:00Z',
  );
  assert(valid.valid);
  assert.equal(valid.preview[0]!.description, "Rice, beans");
  assert(
    !validateCsv(
      s,
      header +
        "donor-harbor,Rice,10,20,2027-02-30T10:00:00Z,2027-02-30T11:00:00Z",
    ).valid,
  );
  assert(
    !validateCsv(
      s,
      header +
        "other-org-donor,Rice,10,20,2030-01-01T10:00:00Z,2030-01-01T11:00:00Z",
    ).valid,
  );
  assert(encodeCsv([['=HYPERLINK("bad")', "normal"]]).includes("'=HYPERLINK"));
});
test("restart preserves approvals, opaque sessions and idempotency records", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rescuerelay-persist-")),
    path = join(dir, "state.db");
  let context = await createApp({
    databasePath: path,
    demoMode: true,
    rateLimit: false,
  });
  try {
    const session = (
      await context.app.inject({
        method: "POST",
        url: "/api/auth/demo",
        payload: { role: "coordinator" },
      })
    ).json();
    const headers = { Authorization: `Bearer ${session.token}` };
    const s = (
      await context.app.inject({ url: "/api/snapshot", headers })
    ).json();
    const p = (
      await context.app.inject({
        method: "POST",
        url: "/api/plans/generate",
        headers,
        payload: { expectedVersion: s.version },
      })
    ).json();
    const payload = {
      expectedVersion: p.snapshot.version,
      idempotencyKey: "persist-approval",
    };
    const approved = (
      await context.app.inject({
        method: "POST",
        url: `/api/plans/${p.plan.id}/apply`,
        headers,
        payload,
      })
    ).json();
    await context.app.close();
    context = await createApp({
      databasePath: path,
      demoMode: true,
      rateLimit: false,
    });
    const replay = (
      await context.app.inject({
        method: "POST",
        url: `/api/plans/${p.plan.id}/apply`,
        headers,
        payload,
      })
    ).json();
    assert.equal(replay.snapshot.version, approved.snapshot.version);
    assert.equal(replay.plan.status, "applied");
  } finally {
    await context.app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("backup and restore capture WAL state, refuse overwrite and invalidate restored sessions", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const dir = mkdtempSync(join(tmpdir(), "rescuerelay-backup-")),
    source = join(dir, "source.db"),
    backup = join(dir, "backup.db"),
    restored = join(dir, "restored.db");
  const context = await createApp({
    databasePath: source,
    demoMode: true,
    rateLimit: false,
  });
  try {
    const login = (
      await context.app.inject({
        method: "POST",
        url: "/api/auth/demo",
        payload: { role: "coordinator" },
      })
    ).json();
    const script = fileURLToPath(
      new URL("../../../scripts/database.mjs", import.meta.url),
    );
    const run = (...args: string[]) =>
      spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    assert.equal(
      run("backup", "--source", source, "--output", backup).status,
      0,
    );
    assert.equal(
      run("backup", "--source", source, "--output", backup).status,
      1,
    );
    assert.equal(run("check", "--source", backup).status, 0);
    assert.equal(
      run("restore", "--source", backup, "--output", restored).status,
      0,
    );
    const restoredContext = await createApp({
      databasePath: restored,
      rateLimit: false,
    });
    try {
      assert.equal(restoredContext.store.read("org-demo").donations.length, 3);
      assert.equal(
        (
          await restoredContext.app.inject({
            url: "/api/snapshot",
            headers: { Authorization: `Bearer ${login.token}` },
          })
        ).statusCode,
        401,
      );
    } finally {
      await restoredContext.app.close();
    }
  } finally {
    await context.app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("single-server mode serves the real client and API without path traversal or API SPA fallback", async () => {
  const { writeFileSync, mkdirSync, symlinkSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "rescuerelay-static-")),
    web = join(dir, "web");
  mkdirSync(join(web, "assets"), { recursive: true });
  writeFileSync(
    join(web, "index.html"),
    "<!doctype html><title>RescueRelay</title>",
  );
  writeFileSync(join(web, "assets", "app.js"), 'console.log("static test");');
  writeFileSync(join(dir, "private.txt"), "not public");
  // Windows file symlinks need elevated privileges; a directory junction exercises
  // the same realpath escape boundary without changing machine security settings.
  let leakUrl = "/leak.txt";
  if (process.platform === "win32") {
    mkdirSync(join(dir, "outside"));
    writeFileSync(join(dir, "outside", "private.txt"), "not public");
    symlinkSync(join(dir, "outside"), join(web, "leak"), "junction");
    leakUrl = "/leak/private.txt";
  } else {
    symlinkSync(join(dir, "private.txt"), join(web, "leak.txt"));
  }
  const { app } = await createApp({
    staticRoot: web,
    demoMode: true,
    rateLimit: false,
  });
  try {
    const page = await app.inject({ url: "/rescues" });
    assert.equal(page.statusCode, 200);
    assert(page.body.includes("RescueRelay"));
    assert(page.headers["content-security-policy"]);
    assert.equal((await app.inject({ url: "/assets/app.js" })).statusCode, 200);
    assert.equal(
      (await app.inject({ url: "/assets/missing.js" })).statusCode,
      404,
    );
    assert.equal(
      (await app.inject({ url: "/api/health" })).json().status,
      "ok",
    );
    const session = (
      await app.inject({
        method: "POST",
        url: "/api/auth/demo",
        payload: { role: "coordinator" },
      })
    ).json();
    const api = await app.inject({
      url: "/api/no-such-route",
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(api.statusCode, 404);
    assert.equal(api.json().code, "NOT_FOUND");
    const traversal = await app.inject({ url: "/%2e%2e/private.txt" });
    assert([403, 404].includes(traversal.statusCode));
    assert(!traversal.body.includes("not public"));
    assert.equal((await app.inject({ url: leakUrl })).statusCode, 403);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
