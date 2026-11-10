# Optional AI workspace — phase 2 contract

**Observed hosted validation:** eight integrations passed the bounded operations in the [hosted test report](hosted-ai-validation-2026-11-07.md). OpenAI is disabled on the Site and ElevenLabs is parked. The hosting copy has separate Worker transport and parser repairs; this local API contract and default settings do not automatically activate another installation.

The verified offline product remains the default. No connector is activated by installing the code. No key is collected in chat or the client. All routes require coordinator authentication and derive organization from the current session. **Configured**, **enabled**, and **live-tested** are distinct. Adapter implementation and mocked verification are recorded in the verification report. Later local setup and bounded live checks are recorded in the [7 November 2026 validation report](ai-local-validation-2026-11-07.md); that report distinguishes demo-account readiness, direct provider checks and the isolated Pinecone app-route test. The current `liveTested=false` capability field does not incorporate those manual results.

## Read and setup
- `GET /api/ai/capabilities` → `AiCapabilities`. Safe environment variable names/status only, never values. `available` requires global external-call opt-in, individual enable flag and all required settings. No network check occurs.
- `GET /api/ai/drafts` → `AiWorkspace {drafts,referencePolicies,memories}`. Drafts and preferences are scoped to the current actor; approved reference knowledge is shared within the organization.
- Shared types: `packages/shared/src/ai.ts`, exported by `@rescuerelay/shared`.

## Consent, then execute
1. `POST /api/ai/consents` body `{operation,input,expectedVersion}` → `AiConsentManifest`. This is entirely local. Show the exact provider(s), data categories, payload preview/hash, retention warning and maximum request budget. A short-lived one-use consent is bound to the actor, organization, current version and exact payload. Requests can be prepared while disabled for explanation, but execution remains blocked.
2. An explicit **Confirm this data transfer** action calls `POST /api/ai/operations` with the same `{operation,input,expectedVersion,consentId}` → `AiOperationResponse`.
3. Clients must never automatically repeat an operation after a timeout, consent failure or HTTP error. The server may retry an explicitly read-only request once after HTTP 429, with at most a one-second wait and within the disclosed total request budget; writes and ambiguous network outcomes are not automatically replayed. Consent is consumed before attempting external work. Expired, mismatched, consumed or stale consent fails closed. Do not interpret an uncertain upload timeout as proof the vendor received nothing.

Operations/inputs are the discriminated `AiOperationInput` union:
- `investigate`: `{provider:'fireworks'|'nebius'|'openai',rescueIds?,usePinecone?,trace?}`. Runs the existing bounded read-only tool investigation and persists a proposed plan, never applies it. `trace:true` adds separately disclosed redacted LangSmith metrics; failure to trace does not fail the planning result. `usePinecone:true` authorizes optional remote policy retrieval; external references cannot change deterministic constraints.
- `policy_search`: `{query}`. Pinecone Documents API in a server-derived organization namespace; returns citations. On unavailable remote retrieval, local-only fallback is visibly labeled; no fallback to another external vendor.
- `source_discovery`: `{query,domains:string[],provider?:'tavily'|'keenable'}`. Default Tavily basic search restricted to the operator's approved domain allowlist; creates a **reference-policy draft**, not an active policy. Keenable is an explicitly selected alternative using exactly one approved `site`, realtime mode and bounded snippets; it is never an automatic fallback.
- `policy_index`: `{referenceIds:string[]}`. Separately authorize one Pinecone Documents API upsert of 1–5 distinct, already approved organization reference policies. The manifest shows the exact deterministic text chunks, provenance, namespace and hash. Maximum 40 chunks/64 KiB, one HTTP request, no automatic write retry. Requires an existing compatible index; the upsert may create its namespace and replaces matching app-owned IDs. Acceptance is asynchronous, not proof of immediate search visibility. Re-embedding can be billed again on a later manually authorized retry. Configured hard policies and raw drafts cannot be indexed through this operation.
- `preference_save`: `{preferenceType:'communication_style'|'ui_density',value:'concise'|'detailed'|'comfortable'|'compact'}`. Only structured noncritical preferences; no availability, medical, allergen, capacity or safety memory.
- `preference_recall`: `{query}`. Mem0 actor+organization-scoped advisory lookup.
- `preference_forget`: `{memoryId}`. Delete only an ID previously saved by this actor through this app. No cross-tenant IDs accepted.
- `document_upload`: `{filename,mimeType:'application/pdf'|'text/plain',contentBase64,title}`. Upload bounded document to LlamaParse and create async parsing job; returns processing draft. The operation does not provision a vendor account/index. Cost and retention remain subject to vendor terms.
- `document_poll`: `{draftId}`. One separately consented job-status request. Completed markdown becomes a reviewable reference draft; pending remains processing. No unbounded polling.
- `voice_transcribe`: `{filename,mimeType:'audio/mpeg'|'audio/wav'|'audio/mp4'|'audio/webm',contentBase64,title}`. ElevenLabs transcription creates a rescue-note draft. It does not guess donor IDs, quantities, safety status or dispatch. Human completes validated donation fields at approval.

File content is base64 JSON, maximum **2 MiB decoded**, with bounded request size. The consent preview shows filename, type, bytes and SHA-256—not the full uploaded content. Byte/request limits are not verified page, audio-duration, credit or spending caps; operator-approved vendor-side spend controls are required before live use. Audio/document contents may contain personal data; uploader must have permission to transfer them. No retention or zero-logging promise is inferred from a subscription tier.

## Draft review is a separate action
- `POST /api/ai/drafts/:id/approve` → `Snapshot`; body `AiDraftApproval` with `expectedVersion` and exactly one of:
  - `referencePolicy:{title,text,scope}` for `reference_policy`. Published only to the reference knowledge collection, **never the authoritative configured constraints**.
  - `donation:{donorId,description,category,weightKg,servings,sealed,handlingNotes,pickupWindow}` for `rescue_note`. Human-completed fields pass the existing sealed-shelf-stable, organization and window validation. This creates only a donation; assigning a rescue remains a separate workflow.
- `POST /api/ai/drafts/:id/reject` `{expectedVersion,reason}` → `Snapshot`.

Refresh `/ai/drafts` after a review mutation. Raw external outputs are untrusted evidence and rendered as text, never HTML. Results and sources stay visibly attributed. No upload, trace, search, preference write or model call occurs at startup or merely opening this workspace.

## Environment gate
Global `AI_EXTERNAL_CALLS_ENABLED=false` by default. Each individual adapter additionally requires `<PROVIDER>_ENABLED=true` and its server-only settings, enumerated by capabilities. `OPENAI_ENABLED` is independent of ChatGPT subscription status; any eligible API credits and model access must be verified by the account owner. Unknown provider names are rejected, never guessed.

## Operation receipts and dynamic evidence

The workspace returns actor-only `receipts` containing safe known vendor file/job/memory/document identifiers, request counts, payload hash and recovery guidance. Partial external writes, uncertain outcomes and external completion followed by local state staleness preserve a receipt without applying stale domain results. Refreshing receipts is a local read; cleanup/replay is never automatic.

Investigation consent includes the actual sanitized local evidence envelope, chosen model, as-of timestamp and hash. Tools may select bounded subsets and derive results from this envelope; future model text or external retrieval results cannot be known before execution and are explicitly disclosed as dynamic. Human-approved references participate in local retrieval with `reference_only` provenance, while configured policy passages remain separately labeled and deterministically authoritative.
