# RescueRelay web experience

Responsive React + Vite web/PWA, with no framework-level external service dependency. The API is the source of truth; no authenticated data or session token is stored in browser storage.

## Run

From repository root, install with `npm ci`, then `npm run dev` for API + Vite on localhost. The web package defaults to `127.0.0.1:5173` and proxies `/api` to `127.0.0.1:4000`. `VITE_API_URL` can select a separately hosted API; set its CORS allowlist appropriately.

For a single-process server, first build, then use the repository's API/static server (`npm start` / documented preview entrypoint). Do not expose a loopback-trusted development proxy to a public network. See root deployment documentation for the intentional LAN demo opt-in.

Web checks:

```sh
npm run test -w @rescuerelay/web
npm run typecheck -w @rescuerelay/web
npm run build -w @rescuerelay/web
```

## Product and visual decisions

- Cream, forest, muted olive, and persimmon form an editorial food-rescue identity, not a generic software dashboard. Georgia and system sans-serif fallbacks work without remote font requests.
- The hero's produce crate and relay are original inline SVG. No licensed stock imagery, fabricated customer logos, testimonials, or impact statistics are used.
- The landing-page three-step recovery example is explicitly illustrative and makes no API mutation. Entering the local demo opens real persisted synthetic data.
- Donor offers are entered by coordinators. There is no fabricated donor login role. Volunteer and recipient account scopes match the API contract.
- Dashboard metrics come directly from the role-filtered snapshot. Route illustrations are labelled schematics; ETA data comes from synthetic matrices or distance estimates, never claimed live GPS/traffic.
- Workspace tabs are reflected in hash navigation. Mobile navigation is collapsible; content reflows down to 360px. Native dialogs support keyboard focus, Escape, backdrop dismissal, and focus restoration. Escape is prevented while a mutation is busy rather than hiding an in-progress dialog.
- Visible focus rings, labelled form fields, required validation, semantic buttons, alert/status live regions, and reduced-motion CSS are included. No full WCAG certification is claimed.

## Implemented flows

- Register an isolated coordinator organization; password login; server-revoked logout. Web tokens exist in memory only and a browser reload requires login.
- Explicit local demo role switch signs out the previous session first. All demo roles use one synthetic persistent sandbox; demo reset has a separate destructive confirmation.
- Coordinator donor/recipient/volunteer creation, changed-only profile edits, sealed shelf-stable offer creation, rescue creation, CSV validate/import/export, and scoped account creation.
- Rescue details: acceptance, pickup, delivery, cancellation, custody interruption, recipient confirmation, escalation, and explicit coordinator disposition.
- Recovery: inspect exact proposed changes, eligible and rejected candidates, per-rule checks, route provenance, retrieved policy excerpts and versions, tool trace, warnings, and infeasible outcomes. A review checkbox and a separate approval click are required.
- Optional operator-configured provider investigation is an explicitly labelled fresh investigation. The retired explanation endpoint is not used. Deterministic constraints and separate coordinator approval remain authoritative.
- In-app outbox and audit trail are distinct from external delivery channels. Only notifications addressed to the current role have a mark-read button.
- Stale versions refetch but never silently retry a mutation. Plans compare their base version against the current snapshot; stale/expired plans cannot be approved. Approval retains an idempotency key and original plan version. Network requests time out; uncertain results tell the user to refresh before retrying.

## PWA and offline boundaries

The Vite build emits `sw.js` with a build-specific cache name and a precise static-asset allowlist. The production entrypoint registers it. It caches only the public shell and assets; API paths, Authorization-bearing requests, and cross-origin data are never cached. There is no background sync, offline mutation queue, push handler, or simulated offline write.

An already-open workspace remains readable in memory offline and disables mutations. An offline reload can load the public shell but cannot restore an authenticated session. Installation guidance covers Safari, Android Chrome, and compatible desktop browsers. HTTPS or localhost is required. Native builds are owned by `apps/mobile` and require separate platform signing.

## Verification and evidence

Web TypeScript, production build, and six focused client regression tests were run successfully during implementation. The tests cover changed-only patches, preserved timestamp precision, no-store bearer transport, no automatic retry, idempotency payload preservation, and useful field validation errors. The shared QA owner records browser results, screenshot paths, regression tests, and unverified states in `docs/qa-review.md`; that is the source of truth for browser coverage. Do not infer real-device testing, app-store publication, push delivery, live routes, or enterprise certification from a successful web build.

## Optional AI Studio (coordinator web workspace)

The AI Studio is integrated with the existing visual system and navigation without replacing the verified offline rescue workflow. It uses `docs/ai-api-contract.md` and the shared discriminated types. It adds no client-side credentials, provider SDKs, persistent browser storage, or new frontend dependencies.

- Opening the studio reads **local** capabilities and actor-scoped draft/receipt records only. The UI separately reports configured settings, individual enable flags, global external-call opt-in, availability, and unverified live-test status. It never infers credit balances from an offer or subscription.
- Fireworks, Nebius, and OpenAI are selectable investigation providers. Pinecone retrieval and redacted LangSmith tracing are separately disclosed options. The output remains a proposed plan reviewed through the existing, separate domain approval dialog.
- Pinecone-disabled policy search has an explicit **local-only** preview and a `Run local lookup` control. The UI says **0 external requests** and does not ask the user to consent to a nonexistent external transfer.
- Tavily or explicitly selected Keenable source research is limited to the server-provided approved domains. Keenable accepts exactly one approved site per request, with no automatic fallback to another provider. Mem0 preferences are structured, noncritical, advisory, and actor-scoped. LlamaParse document uploads and ElevenLabs audio submissions are bounded to 2 MiB; no recording starts automatically and no file is automatically transferred to a vendor.
- A local preparation step binds the request, payload hash, version, providers, request budget, retention notice, and disclosed data categories. Investigation previews describe permitted fields, **not every subsequent dynamic model/tool value**. File previews show metadata and SHA-256, not full document/audio content.
- Every external execution requires a separate consent checkbox and explicit confirmation. Consent expiration, workspace changes, unavailable adapters, and consumed consent prevent execution. No error, timeout, or rejected call is automatically replayed. The longer explicit-operation timeout is 190 seconds (allowing the server’s bounded 180-second investigation to return); ordinary reads and preparation remain 30 seconds.
- Document parsing status requests are separately prepared and consented; there is no automatic paid polling. Provider output is untrusted text. Draft approval is a separate human action: reference drafts enter a distinct reference collection, while voice-note drafts use the existing human-completed donation form. Neither can assign volunteers or weaken configured constraints.
- Actor-scoped operation receipts expose only the server's safe known provider IDs, recorded request counts, outcome status, and guidance. After an operation error the UI refreshes local snapshots/drafts/receipts without reexecuting the operation. A timeout is not presented as proof that no upload or charge occurred. There are no invented retry, vendor cleanup, or deletion-success controls.
- Late AI responses are guarded by current session token, organization, actor, and monotonic snapshot version. They cannot overwrite another login's workspace after logout, role switching, or navigation.

Current client coverage is **19 passing tests**: the six baseline tests plus provider-status distinctions, consent staleness, safe source links, exact-byte file encoding, oversize/empty-file rejection, one-use-operation no-replay behavior, and late-response scope/version isolation, explicit source-provider/domain scoping, and approved-reference-only indexing bounds. TypeScript and production builds pass. Baseline actual-browser QA and AI default-off/local-only browser evidence are maintained by the independent QA owner in `docs/qa-review.md`; no live provider call or paid usage was performed by the web implementation worker. Native clients retain their separately verified baseline workflow; this coordinator AI Studio is a web feature.

Approved reference cards also expose a separate `policy_index` consent workflow: select one to five reviewed references, inspect the bound Pinecone chunks/namespace, and explicitly authorize indexing. Only approved reference knowledge is eligible; configured hard policies are excluded. The app never provisions an index, promises immediate search visibility, or automatically retries a potentially billable re-embedding.
