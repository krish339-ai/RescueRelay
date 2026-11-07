import test from "node:test";
import assert from "node:assert/strict";
import { changedFields, editedWindow, localDate } from "../src/form-values.ts";
import { api, ApiFailure } from "../src/api.ts";

test("notes-only patches do not resend unchanged assignment constraints", () => {
  const original = {
    notes: "Call the desk",
    capacityKg: 40,
    available: true,
    location: { label: "Kitchen", lat: 40, lng: -74 },
  };
  assert.deepEqual(
    changedFields(original, { ...original, notes: "Call the loading desk" }),
    { notes: "Call the loading desk" },
  );
});
test("unchanged datetime-local windows retain original seconds and milliseconds", () => {
  const window = {
    start: "2026-10-30T14:20:33.123Z",
    end: "2026-10-30T16:20:44.567Z",
  };
  const f = new FormData();
  f.set("windowStart", localDate(window.start));
  f.set("windowEnd", localDate(window.end));
  assert.deepEqual(editedWindow(f, "window", window), window);
  assert.deepEqual(
    changedFields(
      { availability: window },
      { availability: editedWindow(f, "window", window) },
    ),
    {},
  );
});
test("actual eligibility edits remain in the explicit patch", () => {
  assert.deepEqual(
    changedFields(
      { available: true, capacityKg: 40 },
      { available: false, capacityKg: 50 },
    ),
    { available: false, capacityKg: 50 },
  );
});
test("authenticated API reads use a bearer header, no-store, and a bounded signal", async () => {
  const original = globalThis.fetch;
  let received: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    received = init;
    return new Response(JSON.stringify({ version: 4 }), { status: 200 });
  };
  try {
    assert.deepEqual(await api("/snapshot", "test-memory-token"), {
      version: 4,
    });
    assert.equal(received?.method, "GET");
    assert.equal(received?.cache, "no-store");
    assert.deepEqual(received?.headers, {
      Authorization: "Bearer test-memory-token",
    });
    assert.ok(received?.signal);
  } finally {
    globalThis.fetch = original;
  }
});
test("mutations preserve the caller version and idempotency key without automatic retries", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  let body = "";
  globalThis.fetch = async (_input, init) => {
    calls++;
    body = String(init?.body);
    return new Response(
      JSON.stringify({ error: "State changed", code: "STALE_VERSION" }),
      { status: 409 },
    );
  };
  try {
    await assert.rejects(
      () =>
        api("/plans/p1/apply", "token", {
          expectedVersion: 8,
          idempotencyKey: "approved-once",
        }),
      (e: unknown) => e instanceof ApiFailure && e.code === "STALE_VERSION",
    );
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(body), {
      expectedVersion: 8,
      idempotencyKey: "approved-once",
    });
  } finally {
    globalThis.fetch = original;
  }
});
test("validation errors include useful field messages, not a generic dead end", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: "Invalid request data.",
        code: "VALIDATION_ERROR",
        details: [
          { path: "pickupWindow", message: "Window end must be after start." },
        ],
      }),
      { status: 400 },
    );
  try {
    await assert.rejects(
      () => api("/donations", "token", {}),
      /pickupWindow: Window end must be after start/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
