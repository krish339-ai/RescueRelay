import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { loadAiSettings } from "../src/ai/config.js";
import { scopeHash, localPolicySearch } from "../src/ai/adapters.js";
import type { Fetcher } from "../src/ai/http.js";
const environment: NodeJS.ProcessEnv = {
  AI_EXTERNAL_CALLS_ENABLED: "true",
  FIREWORKS_ENABLED: "true",
  FIREWORKS_API_KEY: "mock-fireworks-key",
  FIREWORKS_MODEL: "explicit-mock-model",
  NEBIUS_ENABLED: "true",
  NEBIUS_API_KEY: "mock-nebius-key",
  NEBIUS_MODEL: "explicit-mock-model",
  OPENAI_ENABLED: "true",
  OPENAI_API_KEY: "mock-openai-key",
  OPENAI_MODEL: "explicit-mock-model",
  PINECONE_ENABLED: "true",
  PINECONE_API_KEY: "mock-pinecone-key",
  PINECONE_INDEX_HOST: "example.svc.test.pinecone.io",
  TAVILY_ENABLED: "true",
  TAVILY_API_KEY: "mock-tavily-key",
  MEM0_ENABLED: "true",
  MEM0_API_KEY: "mock-memory-key",
  LANGSMITH_ENABLED: "true",
  LANGSMITH_API_KEY: "mock-trace-key",
  LANGSMITH_PROJECT: "mock-project",
  LLAMAPARSE_ENABLED: "true",
  LLAMA_CLOUD_API_KEY: "mock-parse-key",
  LLAMAPARSE_TIER: "agentic",
  LLAMAPARSE_VERSION: "explicit-mock-version",
  ELEVENLABS_ENABLED: "true",
  ELEVENLABS_API_KEY: "mock-voice-key",
  ELEVENLABS_STT_MODEL: "scribe_v2",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
async function fixture(fetcher: Fetcher, env: NodeJS.ProcessEnv = environment) {
  let clock = Date.now();
  const c = await createApp({
    demoMode: true,
    rateLimit: false,
    ai: {
      settings: loadAiSettings(env),
      fetch: fetcher,
      now: () => clock,
      pause: async () => {},
    },
  });
  const session = (
    await c.app.inject({
      method: "POST",
      url: "/api/auth/demo",
      payload: { role: "coordinator" },
    })
  ).json();
  const request = async (
    method: any,
    url: string,
    payload?: unknown,
    token = session.token,
  ) =>
    c.app.inject({
      method,
      url: "/api" + url,
      headers: { Authorization: `Bearer ${token}` },
      ...(payload === undefined ? {} : { payload: payload as any }),
    });
  const state = async () => (await request("GET", "/snapshot")).json();
  const operation = async (operation: string, input: unknown) => {
    const s = await state();
    const b = { operation, input, expectedVersion: s.version };
    const consent = await request("POST", "/ai/consents", b);
    assert.equal(consent.statusCode, 200, consent.body);
    return request("POST", "/ai/operations", {
      ...b,
      consentId: consent.json().consentId,
    });
  };
  return {
    ...c,
    session,
    request,
    state,
    operation,
    advance: (ms: number) => (clock += ms),
  };
}
test("AI feature status and consent preview cause zero egress; disabled actions fail closed with local-only retrieval exception", async () => {
  let calls = 0;
  const f = await fixture(async () => {
    calls++;
    throw new Error("must not call");
  }, {});
  try {
    const retired = await f.request("POST", "/plans/retired-plan/explain", {});
    assert.equal(retired.statusCode, 410);
    assert.equal(retired.json().code, "USE_INVESTIGATION");
    assert.match(retired.json().error, /POST \/api\/ai\/consents/);
    assert.match(retired.json().error, /POST \/api\/ai\/operations/);
    assert.match(retired.json().error, /matching consentId/);
    assert.doesNotMatch(retired.json().error, /mode=provider/);
    const caps = (await f.request("GET", "/ai/capabilities")).json();
    assert.equal(caps.externalCallsEnabled, false);
    assert(caps.providers.every((p: any) => !p.enabled && !p.liveTested));
    const s = await f.state(),
      body = {
        operation: "investigate",
        input: { provider: "fireworks" },
        expectedVersion: s.version,
      };
    const preview = (await f.request("POST", "/ai/consents", body)).json();
    assert.equal(preview.executionAvailable, false);
    assert.equal(
      (
        await f.request("POST", "/ai/operations", {
          ...body,
          consentId: preview.consentId,
        })
      ).statusCode,
      403,
    );
    const local = await f.operation("policy_search", {
      query: "sealed shelf-stable handling",
    });
    assert.equal(local.statusCode, 200);
    assert.equal(local.json().fallback, "local-only");
    assert(local.json().citations.length > 0);
    assert.equal(calls, 0);
  } finally {
    await f.app.close();
  }
});
test("one-use consent binds actor, operation, exact payload, state version and expiry", async () => {
  let calls = 0;
  const f = await fixture(async () => {
    calls++;
    return json({ results: [] });
  });
  try {
    let s = await f.state();
    const b = {
      operation: "source_discovery",
      input: { query: "food rescue handling", domains: ["usda.gov"] },
      expectedVersion: s.version,
    };
    const c = (await f.request("POST", "/ai/consents", b)).json();
    assert.match(c.payloadSha256, /^[a-f0-9]{64}$/);
    const changed = await f.request("POST", "/ai/operations", {
      ...b,
      input: { ...b.input, query: "changed" },
      consentId: c.consentId,
    });
    assert.equal(changed.json().code, "CONSENT_MISMATCH");
    assert.equal(
      (
        await f.request("POST", "/ai/operations", {
          ...b,
          consentId: c.consentId,
        })
      ).json().code,
      "CONSENT_INVALID",
    );
    const exp = (await f.request("POST", "/ai/consents", b)).json();
    f.advance(300001);
    assert.equal(
      (
        await f.request("POST", "/ai/operations", {
          ...b,
          consentId: exp.consentId,
        })
      ).json().code,
      "CONSENT_EXPIRED",
    );
    const stale = (await f.request("POST", "/ai/consents", b)).json();
    await f.request("PATCH", "/volunteers/v-jordan", {
      expectedVersion: s.version,
      notes: "New operator context",
    });
    assert.equal(
      (
        await f.request("POST", "/ai/operations", {
          ...b,
          consentId: stale.consentId,
        })
      ).json().code,
      "STALE_VERSION",
    );
    assert.equal(calls, 0);
  } finally {
    await f.app.close();
  }
});
for (const provider of ["fireworks", "nebius"] as const)
  test(`${provider} uses Chat Completions tool messages, explicit model, bounded read-only planning and no assignment`, async () => {
    const requests: { url: string; body: any }[] = [];
    let turn = 0;
    const f = await fixture(async (url, init) => {
      const body = JSON.parse(init!.body as string);
      requests.push({ url: String(url), body });
      const tool = ["inspect_incident", "retrieve_policy", "check_candidates"][
        turn++
      ];
      if (tool)
        return json({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                reasoning_content: "Retained model protocol state.",
                tool_calls: [
                  {
                    id: `call${turn}`,
                    type: "function",
                    function: {
                      name: tool,
                      arguments: JSON.stringify(
                        tool === "retrieve_policy"
                          ? { query: "handling capacity approval" }
                          : { rescueId: "r-101" },
                      ),
                    },
                  },
                ],
              },
            },
          ],
        });
      return json({
        choices: [
          {
            message: {
              role: "assistant",
              content: "Evidence reviewed. Await coordinator approval.",
            },
          },
        ],
      });
    });
    try {
      const result = await f.operation("investigate", { provider });
      assert.equal(result.statusCode, 200, result.body);
      assert.equal(result.json().plan.status, "ready");
      assert.equal(
        result.json().snapshot.rescues.find((r: any) => r.id === "r-101")
          .status,
        "needs_recovery",
      );
      assert.equal(requests.length, 4);
      assert(
        requests.every(
          (r) =>
            r.url.endsWith("/chat/completions") &&
            r.body.model === "explicit-mock-model",
        ),
      );
      assert.equal(requests[0]!.body.tools[0].type, "function");
      assert(
        requests[1]!.body.messages.some(
          (m: any) => m.role === "tool" && m.tool_call_id === "call1",
        ),
      );
      assert(
        requests[1]!.body.messages.some(
          (m: any) => m.role === "assistant" && m.reasoning_content,
        ),
      );
      assert(!JSON.stringify(requests).includes("Maya Chen"));
      assert(!JSON.stringify(requests).includes("contact details"));
    } finally {
      await f.app.close();
    }
  });
test("Pinecone Documents retrieval uses hashed org namespace and sourced references; auth failure falls back only locally", async () => {
  let calls = 0;
  const urls: string[] = [];
  let fail = false;
  const f = await fixture(async (url, init) => {
    calls++;
    urls.push(String(url));
    if (fail) return json({ error: "mock secret that must not leak" }, 401);
    assert.equal(
      new Headers(init!.headers).get("X-Pinecone-Api-Version"),
      "2026-07",
    );
    const body = JSON.parse(init!.body as string);
    assert.equal(body.score_by[0].fields[0], "chunk_text");
    return json({
      namespace: scopeHash("org-demo"),
      matches: [
        {
          _id: "ref1",
          _score: 0.91,
          chunk_text: "Reference excerpt, not an operational override.",
          source_url: "https://www.usda.gov/example",
          title: "Official reference",
          version: "1",
        },
      ],
    });
  });
  try {
    const first = await f.operation("policy_search", {
      query: "shelf stable handling",
    });
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().citations[0].namespace, scopeHash("org-demo"));
    assert.equal(first.json().citations[0].authority, "reference_only");
    assert(
      urls[0]!.includes(
        `/namespaces/${scopeHash("org-demo")}/documents/search`,
      ),
    );
    fail = true;
    const fallback = await f.operation("policy_search", {
      query: "handling approval",
    });
    assert.equal(fallback.statusCode, 200);
    assert.equal(fallback.json().fallback, "local-only");
    assert.equal(calls, 2);
    assert(!fallback.body.includes("mock secret"));
  } finally {
    await f.app.close();
  }
});
test("Tavily source drafts require separate review and never alter authoritative configured policy", async () => {
  let body: any;
  const f = await fixture(async (_url, init) => {
    body = JSON.parse(init!.body as string);
    return json({
      results: [
        {
          title: "Official handling reference",
          url: "https://www.usda.gov/food",
          content:
            "External text is only a reference. Review with a qualified operator.",
        },
        {
          title: "Unapproved source",
          url: "https://unapproved.invalid/foo",
          content: "Do not trust this result.",
        },
        {
          title: "Unsafe link",
          url: "javascript:alert(1)",
          content: "Never a source.",
        },
      ],
    });
  });
  try {
    const before = await f.state();
    const r = await f.operation("source_discovery", {
      query: "food rescue shelf stable",
      domains: ["usda.gov"],
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(body.search_depth, "basic");
    assert.equal(body.auto_parameters, false);
    assert.equal(body.include_raw_content, false);
    assert.equal(r.json().sources.length, 1);
    const d = r.json().drafts[0];
    assert.equal(d.status, "needs_review");
    let s = r.json().snapshot;
    assert.deepEqual(s.policies, before.policies);
    const approved = await f.request("POST", `/ai/drafts/${d.id}/approve`, {
      expectedVersion: s.version,
      referencePolicy: {
        title: "Reviewed context",
        text: "Qualified operators must review all context; sealed shelf-stable boundaries remain unchanged.",
        scope: "handling",
      },
    });
    assert.equal(approved.statusCode, 200);
    assert.deepEqual(approved.json().policies, before.policies);
    const workspace = (await f.request("GET", "/ai/drafts")).json();
    assert.equal(workspace.referencePolicies.length, 1);
    assert.equal(workspace.drafts[0].status, "approved");
    assert.equal(
      (
        await f.request("POST", `/ai/drafts/${d.id}/approve`, {
          expectedVersion: approved.json().version,
          referencePolicy: {
            title: "Duplicate",
            text: "Duplicate draft should not apply.",
            scope: "handling",
          },
        })
      ).statusCode,
      409,
    );
  } finally {
    await f.app.close();
  }
});
test("Mem0 structured preference write/read/forget uses Token auth, actor namespace and local ownership filter", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  let scope = "";
  const f = await fixture(async (url, init = {}) => {
    calls.push({ url: String(url), init });
    assert.equal(
      new Headers(init.headers).get("Authorization"),
      "Token mock-memory-key",
    );
    if (String(url).includes("/add/")) {
      const b = JSON.parse(init.body as string);
      scope = b.user_id;
      assert.equal(b.infer, false);
      return json({
        results: [
          { id: "memory-one", memory: b.messages[0].content, user_id: scope },
        ],
      });
    }
    if (String(url).includes("/search/")) {
      const b = JSON.parse(init.body as string);
      assert.equal(b.filters.user_id, scope);
      return json({
        results: [
          {
            id: "memory-one",
            memory: "concise display preference",
            user_id: scope,
          },
          {
            id: "foreign",
            memory: "Other actor private content",
            user_id: "other",
          },
        ],
      });
    }
    if (init.method === "DELETE")
      return json({ message: "Memory deleted successfully!" });
    return json({
      id: "memory-one",
      user_id: scope,
      memory: "concise display preference",
    });
  });
  try {
    let r = await f.operation("preference_save", {
      preferenceType: "communication_style",
      value: "concise",
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(scope, scopeHash("org-demo", f.session.user.id));
    r = await f.operation("preference_recall", { query: "display style" });
    assert.equal(r.json().preferences.length, 1);
    assert(!r.body.includes("Other actor"));
    r = await f.operation("preference_forget", { memoryId: "memory-one" });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(
      (await f.request("GET", "/ai/drafts")).json().memories.length,
      0,
    );
    assert.equal(calls.filter((c) => c.init.method === "DELETE").length, 1);
    const state = await f.state();
    assert.equal(
      (
        await f.request("POST", "/ai/consents", {
          operation: "preference_forget",
          input: { memoryId: "unknown" },
          expectedVersion: state.version,
        })
      ).statusCode,
      404,
    );
  } finally {
    await f.app.close();
  }
});
test("LlamaParse upload and separately consented polling produce only a reference draft", async () => {
  const calls: string[] = [];
  const f = await fixture(async (url, init) => {
    calls.push(String(url));
    if (String(url).endsWith("/files")) {
      assert(init!.body instanceof FormData);
      assert.equal((init!.body as FormData).get("purpose"), "parse");
      return json({ id: "file-001" });
    }
    if (String(url).endsWith("/parse")) {
      const b = JSON.parse(init!.body as string);
      assert.deepEqual(b, {
        file_id: "file-001",
        tier: "agentic",
        version: "explicit-mock-version",
      });
      return json({ id: "job-001", status: "PENDING" });
    }
    return json({
      job: { id: "job-001", status: "COMPLETED" },
      markdown: {
        pages: [
          { markdown: "# Uploaded policy draft\nHuman review required." },
        ],
      },
    });
  });
  try {
    const upload = {
      filename: "reference.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from(
        "%PDF-1.7 mock bytes, not a real document",
      ).toString("base64"),
      title: "Uploaded reference",
    };
    const s = await f.state(),
      consent = (
        await f.request("POST", "/ai/consents", {
          operation: "document_upload",
          input: upload,
          expectedVersion: s.version,
        })
      ).json();
    assert.equal(consent.payloadPreview.fileSha256.length, 64);
    assert(!JSON.stringify(consent).includes(upload.contentBase64));
    assert.equal(calls.length, 0);
    const r = await f.request("POST", "/ai/operations", {
      operation: "document_upload",
      input: upload,
      expectedVersion: s.version,
      consentId: consent.consentId,
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().drafts[0].status, "processing");
    assert.equal(calls.length, 2);
    const polled = await f.operation("document_poll", {
      draftId: r.json().drafts[0].id,
    });
    assert.equal(polled.statusCode, 200, polled.body);
    assert.equal(polled.json().drafts[0].status, "needs_review");
    assert.equal(calls.length, 3);
    assert(calls[2]!.endsWith("/job-001?expand=markdown"));
    assert(!polled.body.includes("remoteJobId"));
  } finally {
    await f.app.close();
  }
});
test("ElevenLabs transcription is a draft; only separately reviewed supported donation fields reach domain", async () => {
  let calls = 0;
  const f = await fixture(async (url, init) => {
    calls++;
    assert.equal(String(url), "https://api.elevenlabs.io/v1/speech-to-text");
    assert.equal(
      new Headers(init!.headers).get("xi-api-key"),
      "mock-voice-key",
    );
    assert(init!.body instanceof FormData);
    assert.equal((init!.body as FormData).get("model_id"), "scribe_v2");
    assert.equal((init!.body as FormData).get("enable_logging"), null);
    return json({
      text: "Synthetic pantry offer. The transcript may be wrong; verify quantities and sealed packaging.",
    });
  });
  try {
    const wave = Buffer.from("RIFF0000WAVEfake synthetic audio");
    const r = await f.operation("voice_transcribe", {
      filename: "note.wav",
      mimeType: "audio/wav",
      contentBase64: wave.toString("base64"),
      title: "Voice offer",
    });
    assert.equal(r.statusCode, 200, r.body);
    const result = r.json(),
      d = result.drafts[0],
      s = result.snapshot;
    assert.equal(d.kind, "rescue_note");
    assert.equal(s.donations.length, 3);
    const donation = {
      donorId: "donor-harbor",
      description: "Human verified offer",
      category: "chilled",
      sealed: true,
      weightKg: 5,
      servings: 10,
      handlingNotes: "Human verified",
      pickupWindow: {
        start: "2030-01-01T10:00:00Z",
        end: "2030-01-01T11:00:00Z",
      },
    };
    assert.equal(
      (
        await f.request("POST", `/ai/drafts/${d.id}/approve`, {
          expectedVersion: s.version,
          donation,
        })
      ).json().code,
      "UNSUPPORTED_HANDLING",
    );
    const approved = await f.request("POST", `/ai/drafts/${d.id}/approve`, {
      expectedVersion: s.version,
      donation: { ...donation, category: "shelf_stable" },
    });
    assert.equal(approved.statusCode, 200, approved.body);
    assert.equal(approved.json().donations.length, 4);
    assert.equal(approved.json().rescues.length, s.rescues.length);
    assert.equal(calls, 1);
  } finally {
    await f.app.close();
  }
});
test("LangSmith trace is separately consented, redacted and nonblocking on failure", async () => {
  const traces: any[] = [];
  let turn = 0;
  const f = await fixture(async (url, init) => {
    if (String(url).includes("smith.langchain.com")) {
      traces.push(JSON.parse(init!.body as string));
      return json({ error: "do not leak mock-trace-key" }, 403);
    }
    const name = ["inspect_incident", "retrieve_policy", "check_candidates"][
      turn++
    ];
    return json({
      choices: [
        {
          message: name
            ? {
                content: null,
                tool_calls: [
                  {
                    id: `c${turn}`,
                    type: "function",
                    function: {
                      name,
                      arguments: JSON.stringify(
                        name === "retrieve_policy"
                          ? { query: "handling approval" }
                          : { rescueId: "r-101" },
                      ),
                    },
                  },
                ],
              }
            : { content: "Done." },
        },
      ],
    });
  });
  try {
    const r = await f.operation("investigate", {
      provider: "fireworks",
      trace: true,
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().plan.status, "ready");
    assert.equal(traces.length, 1);
    const encoded = JSON.stringify(traces);
    assert(
      !encoded.includes("Maya") &&
        !encoded.includes("Harbor") &&
        !encoded.includes("donation") &&
        !encoded.includes("mock-trace-key"),
    );
    assert(
      r
        .json()
        .warnings.some((w: string) =>
          w.includes("trace could not be recorded"),
        ),
    );
  } finally {
    await f.app.close();
  }
});
test("upload signature, canonical base64, mismatched preference and arbitrary source domains are rejected before calls", async () => {
  let calls = 0;
  const f = await fixture(async () => {
    calls++;
    return json({});
  });
  try {
    for (const [operation, input] of [
      [
        "voice_transcribe",
        {
          filename: "bad.wav",
          mimeType: "audio/wav",
          contentBase64: Buffer.from("not audio").toString("base64"),
          title: "Bad",
        },
      ],
      [
        "document_upload",
        {
          filename: "x.pdf",
          mimeType: "application/pdf",
          contentBase64: "Zh==",
          title: "Bad",
        },
      ],
      [
        "preference_save",
        { preferenceType: "communication_style", value: "compact" },
      ],
      ["source_discovery", { query: "q", domains: ["attacker.invalid"] }],
    ] as const) {
      const s = await f.state();
      const response = await f.request("POST", "/ai/consents", {
        operation,
        input,
        expectedVersion: s.version,
      });
      assert(response.statusCode >= 400, response.body);
    }
    assert.equal(calls, 0);
  } finally {
    await f.app.close();
  }
});
test("approved reference → separately consented Pinecone upsert → sourced retrieval stays outside authoritative constraints", async () => {
  let indexed: any[] = [];
  let writes = 0;
  const f = await fixture(async (url, init) => {
    if (String(url).includes("tavily"))
      return json({
        results: [
          {
            title: "Source",
            url: "https://www.usda.gov/example",
            content: "A source excerpt for human review.",
          },
        ],
      });
    if (String(url).endsWith("/documents/upsert")) {
      writes++;
      const body = JSON.parse(init!.body as string);
      indexed = body.documents;
      assert(
        new Headers(init!.headers).get("X-Pinecone-Api-Version") === "2026-07",
      );
      assert(String(url).includes(scopeHash("org-demo")));
      return json({ upserted_count: indexed.length }, 202);
    }
    return json({
      namespace: scopeHash("org-demo"),
      matches: indexed.map((d) => ({ ...d, _score: 0.9 })),
    });
  });
  try {
    const before = await f.state();
    const generated = (
      await f.operation("source_discovery", {
        query: "official source",
        domains: ["usda.gov"],
      })
    ).json();
    const approved = await f.request(
      "POST",
      `/ai/drafts/${generated.drafts[0].id}/approve`,
      {
        expectedVersion: generated.snapshot.version,
        referencePolicy: {
          title: "Reviewed operational context",
          text: "Only a reviewed contextual reference. ".repeat(90),
          scope: "handling",
        },
      },
    );
    assert.equal(approved.statusCode, 200);
    const ref = (await f.request("GET", "/ai/drafts")).json()
      .referencePolicies[0];
    // Approved references also remain useful without a live vector index.
    const localEvidence = localPolicySearch(f.store.read("org-demo"), "reviewed contextual reference");
    assert(localEvidence.some(c => c.policyId === ref.id && c.authority === "reference_only"));
    assert.deepEqual((await f.state()).policies, before.policies);
    let s = await f.state();
    assert.equal(
      (
        await f.request("POST", "/ai/consents", {
          operation: "policy_index",
          input: { referenceIds: ["POL-HANDLING-01"] },
          expectedVersion: s.version,
        })
      ).json().code,
      "REFERENCE_NOT_FOUND",
    );
    const body = {
      operation: "policy_index",
      input: { referenceIds: [ref.id] },
      expectedVersion: s.version,
    };
    const c = (await f.request("POST", "/ai/consents", body)).json();
    assert.equal(c.maximumRequests, 1);
    assert.equal(c.payloadPreview.namespace, scopeHash("org-demo"));
    assert(c.payloadPreview.documents.length > 1);
    assert.equal(
      c.payloadPreview.documents.map((d: any) => d.chunk_text).join(""),
      ref.text,
    );
    assert.equal(writes, 0);
    const sent = await f.request("POST", "/ai/operations", {
      ...body,
      consentId: c.consentId,
    });
    assert.equal(sent.statusCode, 200, sent.body);
    assert.equal(writes, 1);
    assert(sent.json().summary.includes("asynchronous"));
    assert.equal(sent.json().receipt.externalRecords.length, indexed.length);
    assert.equal(
      (
        await f.request("POST", "/ai/operations", {
          ...body,
          consentId: c.consentId,
        })
      ).json().code,
      "CONSENT_INVALID",
    );
    const retrieved = (
      await f.operation("policy_search", { query: "reviewed context" })
    ).json();
    assert(
      retrieved.citations.every(
        (c: any) =>
          c.authority === "reference_only" &&
          c.namespace === scopeHash("org-demo"),
      ),
    );
    assert.deepEqual(retrieved.snapshot.policies, before.policies);
  } finally {
    await f.app.close();
  }
});
test("Keenable is explicitly chosen, uses one site and snippet, filters provenance and never falls back to Tavily", async () => {
  const calls: string[] = [];
  let reject = false;
  const f = await fixture(
    async (url, init) => {
      calls.push(String(url));
      assert.equal(String(url), "https://api.keenable.ai/v1/search");
      assert.equal(
        new Headers(init!.headers).get("X-API-Key"),
        "mock-keenable-key",
      );
      const b = JSON.parse(init!.body as string);
      assert.equal(b.site, "usda.gov");
      assert.equal(b.mode, "realtime");
      assert.equal(b.max_results, 3);
      assert.equal(b.include_domains, undefined);
      if (reject) return json({ error: "do not echo secret" }, 402);
      return json({
        results: [
          {
            title: "Official result",
            url: "https://www.usda.gov/example",
            description: "",
            snippet: "Verified source snippet for review.",
          },
          {
            title: "Wrong host",
            url: "https://evil.invalid/usda.gov",
            snippet: "Must be filtered.",
          },
        ],
      });
    },
    {
      ...environment,
      KEENABLE_ENABLED: "true",
      KEENABLE_API_KEY: "mock-keenable-key",
    },
  );
  try {
    let s = await f.state();
    assert.equal(
      (
        await f.request("POST", "/ai/consents", {
          operation: "source_discovery",
          input: {
            provider: "keenable",
            query: "handling",
            domains: ["usda.gov", "fda.gov"],
          },
          expectedVersion: s.version,
        })
      ).json().code,
      "KEENABLE_SITE_LIMIT",
    );
    const r = await f.operation("source_discovery", {
      provider: "keenable",
      query: "handling",
      domains: ["usda.gov"],
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().sources.length, 1);
    assert.equal(
      r.json().sources[0].excerpt,
      "Verified source snippet for review.",
    );
    assert.equal(r.json().drafts[0].provider, "keenable");
    reject = true;
    const failed = await f.operation("source_discovery", {
      provider: "keenable",
      query: "handling",
      domains: ["usda.gov"],
    });
    assert.equal(failed.statusCode, 502);
    assert.equal(calls.length, 2);
    assert(calls.every((u) => u.includes("keenable")));
    assert(!failed.body.includes("do not echo secret"));
  } finally {
    await f.app.close();
  }
});
