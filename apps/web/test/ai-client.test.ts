import test from "node:test";
import assert from "node:assert/strict";
import type { AiCapability, AiConsentManifest } from "@rescuerelay/shared";
import {
  capabilityLabel,
  consentIsStale,
  encodeAiFile,
  MAX_AI_FILE_BYTES,
  safeExternalUrl,
} from "../src/ai-values.ts";
import { api, ApiFailure } from "../src/api.ts";
const capability: AiCapability = {
  provider: "fireworks",
  label: "Fireworks",
  enabled: false,
  configured: false,
  available: false,
  liveTested: false,
  requiredEnv: ["FIREWORKS_API_KEY"],
  missingEnv: ["FIREWORKS_API_KEY"],
  operations: ["investigate"],
  note: "Never live-tested.",
};
const consent: AiConsentManifest = {
  consentId: "once-only",
  operation: "policy_search",
  expiresAt: "2026-10-30T19:00:00Z",
  expectedVersion: 3,
  payloadSha256: "a".repeat(64),
  providers: [],
  dataCategories: ["policy_query"],
  payloadPreview: { query: "capacity" },
  maximumRequests: 0,
  retentionNotice: "Local-only",
  requiresExplicitConfirmation: true,
  executionMode: "local-only",
  executionAvailable: true,
};
test("configured does not mean enabled, available, or live-tested", () => {
  assert.equal(
    capabilityLabel({ ...capability, configured: true }, false),
    "Disabled",
  );
  assert.equal(
    capabilityLabel({ ...capability, enabled: true }, true),
    "Settings missing",
  );
  assert.equal(
    capabilityLabel({ ...capability, enabled: true, configured: true }, false),
    "External calls off",
  );
  assert.equal(
    capabilityLabel(
      { ...capability, enabled: true, configured: true, available: true },
      true,
    ),
    "Available with consent",
  );
});
test("consent is invalidated by either version change or expiration", () => {
  const now = Date.parse("2026-10-30T18:00:00Z");
  assert.equal(consentIsStale(consent, 3, now), false);
  assert.equal(consentIsStale(consent, 4, now), true);
  assert.equal(consentIsStale(consent, 3, Date.parse(consent.expiresAt)), true);
});
test("external source links reject executable and non-web schemes", () => {
  assert.equal(safeExternalUrl("javascript:alert(1)"), undefined);
  assert.equal(safeExternalUrl("data:text/html,hello"), undefined);
  assert.equal(safeExternalUrl("file:///etc/passwd"), undefined);
  assert.equal(
    safeExternalUrl("https://example.org/reference"),
    "https://example.org/reference",
  );
});
test("file preparation preserves exact bytes in canonical base64", async () => {
  const file = new File(["Reviewed reference\n"], "reference.txt", {
    type: "text/plain",
  });
  const encoded = await encodeAiFile(file);
  assert.equal(
    Buffer.from(encoded, "base64").toString(),
    "Reviewed reference\n",
  );
  assert.equal(encoded, Buffer.from("Reviewed reference\n").toString("base64"));
});
test("oversized files are rejected before their contents are read", async () => {
  let read = false;
  const fake = {
    size: MAX_AI_FILE_BYTES + 1,
    arrayBuffer: async () => {
      read = true;
      return new ArrayBuffer(0);
    },
  } as File;
  await assert.rejects(() => encodeAiFile(fake), /no larger than 2 MiB/);
  assert.equal(read, false);
});
test("empty upload is rejected locally", async () => {
  await assert.rejects(
    () => encodeAiFile(new File([], "empty.txt")),
    /non-empty/,
  );
});
test("one-use external operation errors are not automatically replayed", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  let sent: unknown;
  globalThis.fetch = async (_input, init) => {
    calls++;
    sent = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        error: "Consent already consumed.",
        code: "CONSENT_CONSUMED",
      }),
      { status: 409 },
    );
  };
  try {
    const body = {
      operation: "investigate",
      input: { provider: "fireworks", rescueIds: ["r-1"] },
      expectedVersion: 3,
      consentId: "once-only",
    };
    await assert.rejects(
      () => api("/ai/operations", "memory-token", body),
      (e: unknown) => e instanceof ApiFailure && e.code === "CONSENT_CONSUMED",
    );
    assert.equal(calls, 1);
    assert.deepEqual(sent, body);
  } finally {
    globalThis.fetch = original;
  }
});

import { mergeScopedAiSnapshot } from "../src/ai-values.ts";
import type { Snapshot } from "@rescuerelay/shared";
const scoped = {
  version: 5,
  organization: { id: "org-a" },
  user: { id: "user-a" },
} as Snapshot;
test("late AI responses cannot cross a sign-out or role-switch boundary", () => {
  const oldResponse = { ...scoped, version: 6 };
  assert.equal(
    mergeScopedAiSnapshot(undefined, "old-token", scoped, oldResponse),
    scoped,
  );
  assert.equal(
    mergeScopedAiSnapshot("new-token", "old-token", scoped, oldResponse),
    scoped,
  );
});
test("AI snapshot merges reject foreign organization or user scopes", () => {
  assert.equal(
    mergeScopedAiSnapshot("active", "active", scoped, {
      ...scoped,
      organization: { ...scoped.organization, id: "org-b" },
    }),
    scoped,
  );
  assert.equal(
    mergeScopedAiSnapshot("active", "active", scoped, {
      ...scoped,
      user: { ...scoped.user, id: "user-b" },
    }),
    scoped,
  );
});
test("late AI snapshot responses cannot roll back a newer version", () => {
  assert.equal(
    mergeScopedAiSnapshot("active", "active", scoped, {
      ...scoped,
      version: 4,
    }),
    scoped,
  );
  const newer = { ...scoped, version: 6 };
  assert.equal(mergeScopedAiSnapshot("active", "active", scoped, newer), newer);
});

import {
  sourceDiscoveryRequest,
  policyIndexRequest,
} from "../src/ai-values.ts";
test("Keenable binds exactly one approved domain and never silently chooses Tavily", () => {
  assert.deepEqual(
    sourceDiscoveryRequest(
      "keenable",
      "public guidance",
      ["usda.gov"],
      ["usda.gov", "fda.gov"],
    ),
    {
      operation: "source_discovery",
      input: {
        provider: "keenable",
        query: "public guidance",
        domains: ["usda.gov"],
      },
    },
  );
  assert.throws(
    () =>
      sourceDiscoveryRequest(
        "keenable",
        "public guidance",
        ["usda.gov", "fda.gov"],
        ["usda.gov", "fda.gov"],
      ),
    /exactly one/,
  );
});
test("source discovery rejects unapproved and duplicate domains", () => {
  assert.throws(
    () =>
      sourceDiscoveryRequest(
        "tavily",
        "query",
        ["unapproved.example"],
        ["usda.gov"],
      ),
    /operator-approved/,
  );
  assert.throws(
    () =>
      sourceDiscoveryRequest(
        "tavily",
        "query",
        ["usda.gov", "usda.gov"],
        ["usda.gov"],
      ),
    /distinct/,
  );
});
test("policy indexing accepts only one to five distinct approved references", () => {
  assert.deepEqual(policyIndexRequest(["ref-1"], ["ref-1"]), {
    operation: "policy_index",
    input: { referenceIds: ["ref-1"] },
  });
  assert.throws(
    () => policyIndexRequest(["configured-policy-1"], ["ref-1"]),
    /hard policies/,
  );
  assert.throws(
    () => policyIndexRequest(["ref-1", "ref-1"], ["ref-1"]),
    /distinct/,
  );
  const ids = ["1", "2", "3", "4", "5", "6"];
  assert.throws(() => policyIndexRequest(ids, ids), /one to five/);
});
