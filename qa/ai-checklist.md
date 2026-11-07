# Optional AI phase: adversarial QA scope

This is a test plan, not an executed-results claim. All adapter responses and credentials used in tests are synthetic. No live vendor calls or public uploads are authorized by this plan.

## Boundary gates

- Opening capabilities/drafts, preparing consent and disabled operations make zero outbound calls. Global disable also covers any legacy provider route.
- Coordinator-only access; actor and organization derived from session. Capabilities expose setting names and status, never values.
- Consent binds exact operation, normalized input, selected providers, data payload, actor, organization, state version and expiry. Changing any bound field fails closed. One-use consumption precedes external work, including failures and racing requests.
- Consent previews disclose recipients and maximum request budget. File previews disclose name/type/bytes/hash, not encoded body. An uncertain timeout is not automatically retried.

## Untrusted external evidence

- Provider authentication/quota/timeouts, non-JSON and schema-invalid responses produce bounded, sanitized failures without fallback to an undisclosed vendor.
- Unknown tool calls and injected instructions cannot mutate assignments or bypass deterministic eligibility, custody, capacity, timing or human approval.
- Published AI reference documents remain separate from authoritative policies; approval is actor/tenant scoped, versioned and not replayable.
- Source URLs cannot execute script or trigger server-side fetching. No arbitrary signed URL or private-network target is fetched.

## Memory, files and traces

- Memory save/recall/forget enforce actor plus organization scope, including malformed or foreign vendor results. Only enumerated noncritical preference fields accepted.
- File decoded size, base64 integrity, MIME/type and SHA-256 are verified; oversized, malformed or misleading inputs fail before egress. Polling uses a stored scoped job ID, one request per new consent.
- Trace emission is independently disclosed, opt-in, redacted and nonblocking. Provider errors and trace payloads do not leak keys, tokens, contacts or raw file contents.
- Draft review creates only the approved reference or validated donation, never an assignment, and rejects stale, foreign and duplicate review attempts.

Execution results belong in `docs/qa-review.md` after the routes and tests are complete.
