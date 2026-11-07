# Rescue Pipeline + Liquid/Organic workspace — local verification

**Revision under review: 30 October 2026.** This section is the current redesign record; all release and Windows results below are historical and must not be attributed to this new source revision.

- Implemented full-width grouped navigation, snapshot-derived pipeline lanes, explicit Completed/Cancelled/All views and existing validated detail/plan links. Role-scoped records, approval/acceptance/receipt distinctions, custody warnings and offline/stale indicators are retained.
- Implemented actual Framer Motion entry behavior with spring `bounce: 0.4`, selected-indicator `scaleY`, attention-only brief settling motion, and system/local reduced-motion controls. No new provider or external dispatch behavior is enabled.
- Focused mapping tests are in `apps/web/test/pipeline.test.ts`: **6/6 passed**, covering exactly-one-lane completeness, terminal/escalated precedence, actual assignment acceptance, and stale/expired/applied/infeasible proposal exclusion.
- Executed `npm run verify`: all TypeScript checks, **130/130 tests** (API 33, native client 19, web 24, independent QA 54), **9 native/API integration checkpoints**, **12/12 offline evals**, API/shared checks and web production build passed. The aggregate command exited **1** because the parallel Expo export worker was terminated with **SIGKILL**; it is not recorded as an aggregate pass.
- Stopped the managed preview, then retried the failed stage with `node apps/mobile/scripts/expo.mjs export --platform all --clear --max-workers 1`: **exit 0**, Android/iOS/web exports produced. This verifies all constituent stages, with the original resource failure disclosed. No permanent machine or build configuration was changed.
- Independent read-only review: web 24/24, independent QA 54/54 and web typecheck passed. Review fixes included 16px primary card text and consuming the attention entrance so later refreshed attention does not replay it.
- Browser recovered through the supported desktop UI. Actual-app desktop and approximately 500px-wide browser inspection passed: full-width/grouped navigation, readable cards, wrapped controls and stacked narrow lanes. Screenshots retained outside the repository in `RescueRelay-pipeline-qa/`. Completed view separates delivery from recipient receipt. A visual finding (historic delivered records falsely implying pending acceptance) was fixed and regression-tested.
- Rapid Today/Dispatch navigation, refresh, reduce-motion toggle persistence across role switches/reload, volunteer-scoped single rescue and existing Accept dialog, and recipient-scoped two rescues were exercised. No dispatch mutation or provider activation was performed. Exact animation frame timing, OS-level reduced-motion emulation and physical devices were not tested.
- Final affected web suite: **25/25 passed**; web TypeScript/production build **exit 0** after the terminal-label fix. Combined with unchanged earlier suites, **131 tests pass** (33 API, 19 native, 25 web, 54 QA). The aggregate command resource-failure disclosure above still applies; it was not rerun as a single all-green command.
- **Pending for this revision:** published-commit aggregate CI and Windows pull/reload validation. Do not attribute historical release results below to these pending checks.
- This change targets the responsive web/PWA workspace. It does not establish physical native-device execution, signed packages, app-store readiness, production operation, a formal accessibility audit or food-safety certification.

---

# Windows launchers, animated relay and readable web UI

**Local verification: 30 October 2026, 19:28 UTC**, Windows 11, Node 24.22.2 / npm 11.19.1. This section records the current launcher/UI update; the earlier release evidence below remains historical.

- `npm run verify` completed with exit code **0**: API **33/33**, native client **19/19**, web client **19/19**, independent QA **53 passed / 1 skipped**. Total: **124 passed, zero failures, one existing POSIX-permissions test skipped on Windows**. This is not 125 passed.
- The two static-path escape tests execute on Windows using directory junctions, without requiring elevated file-symlink privileges. They retain the original file-symlink assertions on Linux and still require denial of access outside the web root. Production path-containment code is unchanged.
- Native-to-API integration: **9 checkpoints**. Offline evaluation: **12 scenarios**, **zero provider calls**. TypeScript, web production build and Expo Android/iOS/web bundle exports passed.
- `powershell -NoProfile -File scripts/test-launchers.ps1` completed with exit code **0**, **24 assertions**. Actual start, repeated start, stop, repeated stop, restart, dependency refusal, stale/reused PID rejection, expected-command validation and occupied-port refusal were tested from an unrelated current directory against `Z:\Rescue Relay & Co`, using a temporary DOS drive mapping. An unrelated Node process and an unrelated server on port 4000 survived the relevant operations. The temporary mapping was removed. UNC handling is implemented with pushd/popd but was not exercised against a network share.
- The real checkout was also started, started again and restarted through the batch files. The running API health and proxied health return HTTP 200; the landing page and updated React/CSS modules are served successfully. Both listeners remain on loopback, and live providers remain off.
- The landing SVG's static handoff composition was rendered and inspected. Its 12-second CSS sequence, Pause/Play control, accessible description and reduced-motion styles are implemented. Internal UI uses system sans-serif type with 16px body/controls, 14px supporting text and 12px section labels. Card/form/receipt wrapping and narrow-layout rules were reviewed in source.
- **Visual verification limit:** no connected browser automation was available in the local execution session. Desktop/narrow browser rendering, pause interaction and reduced-motion behavior were not visually exercised in a browser; the static SVG render is not a browser screenshot. These remain manual checks at the local app.
- CI now includes the existing Linux full verification plus a Windows launcher integration job. Remote results must be checked against the published commit; they are not claimed in this local record.

---

# Final implementation verification evidence

**Verified:** 30 October 2026 at 18:05 UTC. Final local source after the web AI-operation timeout repair, Node 24.22.1 / npm 11.9.0. `npm run verify` completed with **exit code 0**. This supersedes the earlier local counts below, which are retained as historical baseline evidence.

| Final executed check | Result |
|---|---:|
| API tests | 33 / 33 |
| Native client tests | 19 / 19 |
| Web client tests | 19 / 19 |
| Independent QA | 54 / 54: 21 baseline and 33 AI |
| **Automated tests total** | **125 / 125; zero failures or skips** |
| Native real-API integration | 9 passed checkpoints: 4 baseline and 5 AI |
| Offline synthetic evaluations | 12 / 12; providerCalls = 0 |
| Strict TypeScript and workspace builds | Passed |
| Expo Android, iOS and web exports | Passed; bundles, not installed native binaries |

All ten selected runtime adapters have source and mocked coverage. Seven other service decisions remain alternatives or deferred tools. Tests exercise exact consent ownership/version/hash/expiry, local-only disclosure, malformed responses, safe bounded transport, human-reviewed reference indexing, local reference-only retrieval, actor-scoped memory and durable partial/uncertain-operation receipts. The native integration exercises Fireworks, Nebius and OpenAI through mocked responses followed by a separate real domain approval. Nine checkpoints are not nine additional unit tests.

**Remote implementation verified:** GitHub Actions [run 41106211194](https://github.com/krish339-ai/RescueRelay/actions/runs/41106211194), job `124236595501`, succeeded for implementation commit `5a8619894f5cbc8dacb182fd3094427038fad482`. The remote tree `1eda3f01276441605123e781bc58c35e40aa2f07` matches the verified local implementation tree. Observed logs confirm 125 tests, native real-API integration, 12 offline evaluations with zero provider calls, typechecks and all platform exports. CI audit recorded 8 propagated low entries and no critical, high or moderate findings.

**Release closure boundary:** this later release update records the verified implementation above and prepares the final handoff package. It does not claim that its own future commit has already passed CI, or that attachments were received. Final publication and delivery are reported separately. Historical baseline run [41100222611](https://github.com/krish339-ai/RescueRelay/actions/runs/41100222611), revision `19aea24`, recorded 55 tests and 12 evaluations; those are not the final implementation totals.

**Live and platform boundary:** no live service, account entitlement, real document/audio upload, external trace, credits or spending was tested. All external calls remain disabled by default. Physical Android/iOS execution, signing, stores, production deployment and PWA installation remain unverified. Browser evidence has its own precise scope in [qa-review.md](qa-review.md).

# Historical baseline local verification

**Verified:** 30 October 2026, 17:09 UTC, on the cloud development computer. Node 24.22.1 / npm 11.9.0. This records executed checks, not a production certification. Later UI-only formatting and browser findings should be rechecked before the final handoff.

## Aggregate gate — passed

`npm run verify` completed with **exit code 0**, without secret credentials or undocumented environment prefixes. The command runs:

```text
npm run typecheck
npm test
npm run test:integration
npm run eval
npm run build
```

| Executed check | Result | Coverage |
|---|---:|---|
| API owner tests | 20 / 20 passed | Authentication, tenant isolation, hashing, role permissions, acceptance, custody, recovery, stale/expired approval, concurrency, idempotency, CSV, persistence, backup/restore and real single-server static/API behavior |
| Native client tests | 7 / 7 passed | Endpoint validation, bearer/version transport, no automatic replay, timeouts, uncertain network outcomes, role transitions and approval guards |
| Web client tests | 6 / 6 passed | Changed-only policy patches, preserved timestamp precision, no-store session transport, no automatic mutation retry, idempotency preservation and field errors |
| Independent QA | 21 / 21 passed | Adversarial authorization, tenant/notification isolation, token expiry, forged proxy headers, stale and changed constraints, provider budgets and race conditions, calendar normalization, aggregate capacity, scarce-driver matching, custody and filesystem permissions |
| **Automated tests total** | **54 / 54 passed** | Three workspace test suites plus independent QA |
| Mobile real-API integration | Passed | Native transport wired to the real Fastify application in process; role-filtered lifecycle and recovery flow; no network dispatch |
| Synthetic evaluation | 12 / 12 passed | Baseline recovery; insufficient capacity; tight pickup; unsupported cold-chain; unsealed goods; recipient category/capacity/closure; unavailable/untrained volunteers; short availability; distance-route fallback |
| Strict TypeScript | Passed | API, shared contract, web and mobile workspaces |
| Web production build | Passed | Vite bundle and service-worker shell |
| Expo Android export | Passed | Hermes JavaScript/assets bundle, approximately 1.83 MB |
| Expo iOS export | Passed | Hermes JavaScript/assets bundle, approximately 1.82 MB |
| Expo web export | Passed | React Native Web bundle, approximately 435 kB |

The evaluation harness records **zero external provider calls** and verifies that generation does not mutate assignments and selected replacements pass all deterministic constraints. Provider investigation is tested with mocked responses, including denied tools, invalid arguments, out-of-scope incidents, insufficient evidence, tool-budget exhaustion and concurrent state change. A real paid/provider response has **not** been exercised.

## Important regressions closed

- Replaced greedy assignment with maximum bipartite matching, so a scarce driver can be reassigned through an augmenting path instead of incorrectly declaring a solvable rescue set infeasible. This is maximum feasible coverage with local ranking, not global minimum-distance routing.
- Policy/location/eligibility changes cannot silently invalidate an active commitment. Escalated food custody retains its holder and blocks reuse until explicit coordinator disposition.
- Impossible CSV dates are rejected rather than normalized. Incoming timestamps are canonical UTC; receiving capacity conservatively reserves overlapping UTC days.
- Approval checks version, proposal age, current eligibility and all constraints inside an atomic transaction. Idempotent replay and racing approval writes do not duplicate effects.
- A consistent SQLite snapshot includes committed WAL data. Restore creates a new database, refuses overwrite, verifies integrity/schema and invalidates sessions. New data directories/database files use restrictive permissions.
- The delivered `npm start` path serves the built web application and the real API from one server. API routes never fall back to the SPA; encoded traversal and symlink escape cannot return private files.
- Expo's default home telemetry write failed in the restricted cloud workspace on the first aggregate run. A version-aware launcher now disables telemetry and uses an app-local cache; the exact vanilla aggregate command was rerun successfully. This does not grant filesystem permissions or modify a user's global setup.

## Dependency audit

`npm audit --audit-level=high` completed with **exit code 0**. Exact snapshot: [dependency-audit.json](dependency-audit.json).

- Critical: **0**
- High: **0**
- Moderate: **0**
- Low: **14 propagated package entries**, rooted in one unpatched `deepmerge` 4.3.1 prototype-poisoning advisory, [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).

The affected path is Expo build-configuration merging, not a web/API handler. Only trusted repository/configuration input should be used. There was no patched `deepmerge` release in the registry when checked; the issue remains disclosed rather than evaded with an unsupported downgrade.

Compatible, explicitly tested overrides resolve `image-size` to **2.0.4** and `postcss` to **8.5.32**, removing the inherited high-severity advisories. Native verification called the actual installed Metro asset-size adapter on a PNG and actual PostCSS parsing/stringification, then exported Android/iOS/web. These pins intentionally exceed upstream Metro/Expo's older dependency ranges; `npm ls` may label those upstream ranges invalid even though the pinned clean install and export checks pass. Reassess the overrides on future Expo upgrades.

## Scope not established by these checks

- No physical Android device, Android emulator or iOS simulator/device runtime has been certified. Export is not native execution.
- No signed APK/IPA, app-store submission, public deployment, real provider request, live traffic route, email/SMS/push dispatch or real food movement occurred.
- No field study establishes operational effectiveness or uniqueness. Seeded data and cancellation incidents are synthetic.
- No food-safety certification, regulatory review, penetration test, load/soak benchmark, accessibility audit or multi-region failover test has been completed.
- Supported browser QA and screenshot findings are tracked separately in [qa-review.md](qa-review.md) and the final delivery notes. Do not substitute static screenshots for lifecycle test evidence.

## Reproduce

```bash
npm ci
npm run verify
npm audit --audit-level=high
npm run build -w @rescuerelay/web
npm start
```

Open `http://localhost:4000` for the real single-server client/API path. To check database operations, use the backup/check/restore commands in the README with new output filenames. Do not run restore over a live database or commit its contents.
