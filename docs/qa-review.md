# Independent QA review

**Scope of this record:** the browser reviews below are historical. Later [hosted AI API validation](hosted-ai-validation-2026-11-07.md) verified eight integrations; it did not repeat browser visual QA.

Review date: 30 October 2026. All records used in this review are synthetic. This is a development verification record, not a production security or food-safety certification.

## Automated independent coverage

Run from the repository root:

```sh
node --import tsx --test qa/independent.test.ts
```

The independent suite is also included in `npm test`. The final isolated run at 17:30 UTC passed **21 tests, 0 failed**. Tests use Fastify injection with temporary SQLite databases or in-memory state; no external provider, notification, payment, or dispatch is invoked.

| Area | Result | Evidence |
| --- | --- | --- |
| Unauthorized requests, isolated organization registration, cross-organization mutation | Passed | Missing/invalid session rejected; foreign rescue and account entity links rejected; newly registered organization empty |
| Session storage, expiry, logout | Passed | Stored session token is a SHA-256 digest, expired/revoked tokens rejected |
| API demo network gate | Passed | Non-loopback requests rejected, including forged forwarding headers; disabled demo returns 404 |
| Role-specific privacy and authority | Passed | Volunteers and recipients receive only scoped entities; no coordinator audit/plans; unauthorized mutations, exports and notification marking rejected |
| Human approval, races and replay | Passed | Generation does not assign; concurrent same-key approvals produce one audit mutation; altered request key reuse rejected |
| Stale, expired and changed constraints | Passed | Stale version/plan and expired proposals rejected; approval independently rechecks hard constraints even with unchanged stored version |
| Operational custody and receipt | Passed | Acceptance required before pickup; status skipping rejected; cancellation retains custody; custody cannot resume recovery; explicit coordinator disposition required; only correct recipient or coordinator confirms receipt |
| Assignment commitments | Passed | Volunteer eligibility, donor location and recipient constraints cannot invalidate active commitments |
| Capacity and matching | Passed | Scarce-driver fixture finds complete matching; escalated custody reserves its holder; recipient capacity accounts for same UTC day across timestamp offsets |
| Duplicate rescues and failed mutations | Passed | Duplicate active rescue blocked; rejected writes do not advance version |
| CSV | Passed | Quoted commas, quotes and newlines round-trip; spreadsheet formula prefixes neutralized; impossible dates rejected; invalid rows prevent entire import |
| Restart durability | Passed | SQLite reopening retains sessions, organization version, audit, approval and idempotent replay |
| Local filesystem privacy | Passed | New data directories use 0700; live database, WAL and shared-memory files use 0600 on Linux |
| Delivered same-origin server | Passed | SPA deep links work; missing assets and authenticated unknown API routes return 404; traversal and escaping symlinks return 403; CSP and private API no-store headers verified |
| Optional provider boundary | Passed with mocks | Unknown tools, outside-scope IDs, malformed arguments and missing evidence rejected; no state mutation; concurrent data change invalidates investigation before persistence |

## Defects found and retested

The owners corrected the following issues during review, and the independent suite now passes the associated regression tests:

- Active assignment constraints could previously be edited without preserving commitments.
- Escalated post-pickup custody did not previously reserve its volunteer.
- Greedy candidate selection could fail a feasible scarce-driver matching scenario.
- CSV date validation previously normalized impossible calendar dates.
- Daily recipient capacity previously grouped timestamps by their textual date prefix rather than a consistent operational UTC day.

## Browser verification

**The actual delivered web application and API work together in the supported managed cloud browser.** The QA launcher starts the same `apps/api/src/server.ts --web` entry point used by `npm start`, with built web assets and a synthetic temporary SQLite database. Browser API calls are real HTTP requests; no mock or injected backend is used for this browser result.

Passed desktop flows:

- Coordinator demo sign-in, baseline recovery generation, five candidate explanations and five policy citations.
- Approval remains disabled until the review checkbox is selected; explicit approval updates assignment, version and audit.
- Coordinator-recorded acceptance, pickup and delivery, followed by switching to the scoped recipient account and confirming receipt.
- Volunteer-only assigned-rescue view, acceptance, pre-pickup cancellation, resulting empty scoped view, and an availability edit.
- Role switching, logout and fresh-page login requirement.
- CSV export completes a browser download; invalid donor rows leave import disabled; a validated quoted-comma description imports correctly.
- The no-capacity scenario produces five rejected candidates and no approval action; coordinator escalation and an explicitly acknowledged no-pickup disposition return the rescue to recovery.
- With the actual server deliberately stopped, the browser-online indicator is not presented as API connectivity: an unreachable error and stale-snapshot banner expose the last refresh time. Restarting the server clears the stale banner after a successful poll; manual refresh succeeds and clears the prior error.

Passed narrow-screen flows at **500 CSS pixels of viewport width** (485-pixel content area with scrollbar):

- Landing, coordinator dashboard, volunteer empty state and availability form fit without page-level horizontal overflow.
- Navigation drawer opens and closes after choosing a destination.
- Recovery modal scrolls to evidence and approval controls without horizontal overflow (445-pixel client and scroll widths).
- Escape dismisses the reviewed modal without applying the proposal; the rescue remains awaiting recovery.

Two browser defects were found and retested successfully. The closed mobile navigation drawer previously remained in the accessibility tree and could retain focus: it is now absent from the closed-state tree, focuses its close control when opened, wraps Shift-Tab to the last control, and restores focus to the opener after Escape; the background content is excluded while open. A connectivity label previously implied server reachability from browser connectivity alone: it now explicitly says “Browser online”, and an actual API outage produces the stale-data feedback described above. Screenshots are in `qa/screenshots/` and are actual, unedited application captures using synthetic records.

Earlier preview startup and separate-process API connectivity problems were resolved by the delivered same-origin server and the QA launcher's explicit port translation. They are not current application blockers. Browser developer tools are explicitly blocked by this environment's policy; that restriction was respected. Normal window resizing was used instead. No iframe policy weakening or alternate browser automation process was used.

## Dependency audit

The final independent `npm audit --omit=dev --json` reports **0 critical, 0 high, 0 moderate and 14 low dependency entries**. Those entries are propagated from one remaining root advisory: [`deepmerge` prototype poisoning, GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).

For history, the initial audit reported 28 entries (22 high, 6 low). Owner-controlled compatible overrides repaired the `image-size` and `postcss` advisories, followed by a clean dependency installation and a repeat audit. The remaining low-severity advisory is disclosed rather than described as a clean security bill of health.

## Final result and limits

**No unresolved functional failure remains in the executed independent checks.** This is bounded acceptance of the cases listed above, not a claim that every browser action or operational condition has been tested.

- Browser registration/login with typed credentials, broader forms not listed above, actual browser-offline service-worker behavior and PWA installation remain unverified by this browser pass. Stopping the API tests server-unreachable feedback, not browser network-offline behavior.
- Exact 390-pixel viewport behavior and physical-device touch behavior. The tested narrow width is 500 pixels, not a phone emulator.
- Physical Android/iOS device operation, platform signing, store submission and delivery of real notifications.
- Load/soak testing, multi-host database operation, independent penetration testing, food-safety compliance or production certification.

Android/iOS bundle export is distinct from running an emulator or physical device. The native owner maintains its separate transport and export evidence; this report does not convert export success into device verification.

## Optional AI phase — mock-verified boundary checks

The baseline results above remain separate from the optional integration phase. At 17:56 UTC, `qa/ai-independent.test.ts` passed **33 tests, 0 failed**, using local mock responses and synthetic credentials only. Together with the baseline suite, the independent QA total is **54 passed**. No adapter test performs a real provider call.

| AI boundary | Result | Executed evidence |
| --- | --- | --- |
| Disabled state and legacy path | Passed | Configured-but-globally-disabled adapters make zero requests; capabilities expose no secret values; legacy live generation requires the consent route; explicit local policy fallback makes zero external requests |
| Consent ownership and integrity | Passed | Exact actor, tenant, operation, input, provider, version and expiry checked; foreign attempts cannot consume the rightful actor's consent; racing execution calls once; failures consume consent |
| Local-only disclosure | Passed | A consent reviewed as local-only cannot become an external request after a configuration change |
| Errors and bounded requests | Passed | Authentication/payment/quota failures sanitized; writes and uncertain timeouts not replayed; a separately allowed read quota retry is bounded; request budget, body size, malformed JSON and interrupted streams enforced |
| Read-only investigation and trace | Passed with mocks | Invalid model schema and unsafe tools rejected; deterministic proposal remains unapplied; the complete sanitized evidence envelope is hash-bound and same-version changes block egress; trace occurs only with disclosed opt-in, contains redacted metrics and fails nonblockingly |
| Sources and retrieval | Passed with mocks | Unapproved domains, executable/credentialed/lookalike source URLs and wrong Pinecone namespaces rejected; unsafe index host makes no request; fallback is visibly local-only; explicitly selected Keenable is restricted to one approved site and never silently switches vendor |
| Reviewed reference indexing | Passed with mocks | Only approved organization references accepted; exact chunks and namespace disclosed; duplicate/foreign IDs and same-version text changes rejected; one upsert, no retry; uncertain accepted count retains target IDs in a receipt without claiming search visibility |
| Memory privacy | Passed with mocks | Only structured noncritical preferences accepted; actor/tenant and owned-ID filters exclude foreign results; foreign deletion refused |
| File boundaries | Passed | Canonical base64, UTF-8/signature agreement, safe filename and 2 MiB decoded bound checked before egress; manifest includes size/hash rather than full contents; changed file invalidates consent |
| Async parsing | Passed with mocks | Upload and parse creation bounded; polling needs separate consent and owned pending job; returned signed URLs are not fetched and job IDs stay encoded on the fixed vendor host |
| Draft review | Passed | Foreign actors cannot see/review drafts; repeated approval rejected; published references remain separate from authoritative constraints; voice draft requires human-supplied valid donation fields and never assigns a rescue |
| Restart | Passed | Known remote-file receipts survive SQLite reopening; unused ephemeral consent is invalid after restart and makes zero requests |
| Concurrent changes and remote receipts | Passed with mocks | Stale external results never overwrite newer domain state; known upload/memory IDs survive partial success or stale local completion in actor-scoped receipts; no automatic write or delete replay |

The review found and the owner repaired four integration boundary defects: local-only execution was not pinned to its reviewed mode; malformed OpenAI output could escape as an internal exception; a foreign invalid consent attempt could consume the owner's confirmation; interrupted response streams were not sanitized at the transport boundary. Regression checks now pass. Partial-success receipts were also added and verified for uploaded files and externally saved/deleted preferences.

The actual delivered browser UI has passed default-off capability/setup inspection, a keyboard-confirmed local-only lookup with five citations, disabled external preview/confirmation, Escape focus restoration, empty draft/reference states, and 500-pixel layout/consent scrolling without horizontal overflow. Screenshots `18`–`23` record those checks. Final bound-request wording, explicit zero-external-request local consent and an actual zero-request operation receipt passed a subsequent desktop browser review (screenshot `24`). At 18:05 UTC the final delivered-server review passed: AI Studio showed all ten services disabled and live-unverified; selecting Keenable required exactly one approved site, previewed the exact query and usda.gov recipient boundary with only Keenable, and kept confirmation disabled. The existing local lookup receipt expanded with zero external requests and no food movement or assignment claim. Screenshots 25 and 26 record these checks. The native receipt screen was visually inspected at a 430-pixel React Native Web canvas; this is not native-device execution.

No live vendor connection, credits, model availability, subscription entitlement, real upload or external trace has been tested. Remote receipts preserve known identifiers and uncertainty; they are not proof that an unknown vendor-side outcome was rolled back or that vendor copies were deleted. Runtime native-device and production-security limits above remain unchanged.

## Final documentation review
The 19-page official DOCX was rendered and every page image inspected on 30 October 2026. All 17 canonical service names, roles and statuses match the HTML guide, roadmap and provider registry. Updated HTML passed desktop visual review at 1182 CSS pixels, including contained service-matrix scrolling. A fresh narrow-layout retest was not completed: supported OS window resizing did not resize the controlled browser tab, then the accessibility provider became unavailable. Historical narrow checks are not presented as this final retest.
