# RescueRelay

**Explainable food-rescue recovery, with people in control.**

RescueRelay helps coordinators review donation logistics, record volunteer cancellations, investigate replacement options against explicit policies, and approve a recoverable plan. It includes a responsive installable web client, an Expo Android/iOS client, a durable API, and an auditable offline agent that runs without API keys.

> This is a runnable local-first product foundation, **not a production deployment or food-safety certification**. All seeded names, routes, donations and incidents are synthetic. Notifications stay in the app; no recipient or volunteer is contacted. Initial handling support is **sealed shelf-stable goods only**.

## Quick start

Prerequisites: **Node.js 24.x**, npm 11+, and Git. No Python, database server or provider account is needed to run the application.

```bash
git clone https://github.com/krish339-ai/RescueRelay.git
cd RescueRelay
npm ci
npm run dev
```

Open **http://localhost:5173**. Choose a synthetic demo role, or create your own organization with a password of at least 12 characters. New organizations start empty; the demo never mixes with your organization's data. The API listens on **http://127.0.0.1:4000** and stores SQLite data under `data/`.

For a single-server build with the real API and web client on one port, run:

```bash
npm run build -w @rescuerelay/web
npm start
```

Open **http://localhost:4000**. `npm run dev:preview` uses the same built-client/API path for managed local previews; it respects `PORT` and does not inject mock data or bypass demo access rules.

Both servers bind to loopback by default. Stop them with Ctrl+C. To customize settings, copy `.env.example` to `.env`; never commit `.env` or database files. The API reads the root `.env` automatically.


### Windows start, stop and restart

After `npm ci`, double-click **start.bat**, **stop.bat** or **restart.bat** in this checkout. From PowerShell use `.\start.bat` (and similarly for stop/restart). You can also call a launcher's quoted absolute path from another folder. No drive or username is configured: each file resolves its helper relative to itself, and the npm wrapper uses `pushd`/`popd` for spaces, drive changes and UNC paths.

- **start.bat** checks Node 24.x, npm 11+, installed dependencies and free ports, opens a visible development console, runs the existing `npm run dev`, and waits for API/web readiness. A repeated start reuses the recorded session.
- **stop.bat** asks this checkout's supervisor to stop its own Windows job. **restart.bat** stops that session and starts a fresh one. Repeated stop is safe. PID, creation time, checkout path and a launch token are verified; unrelated processes and manually started sessions are never adopted or killed.
- The launchers use **http://127.0.0.1:5173** and API port **4000**, enforce loopback binding, and keep external AI calls off for the local demo. A port conflict is reported; there is no automatic port switch. Stop an earlier manual `npm run dev` with Ctrl+C before using a launcher.
- Keep the visible console open while working. Ctrl+C or closing it also ends its owned process tree. Runtime state and the supervisor log live in ignored `.rescuerelay/`; do not copy that folder between checkouts.
- Windows 10/11 and Windows PowerShell 5.1+ are required. The scripts never change execution policy or install dependencies automatically. If your organization's policy blocks PowerShell scripts/native helper compilation, use the manual npm commands or contact your administrator. Error windows pause for readability; automated callers can set `RESCUERELAY_NONINTERACTIVE=1`.

The landing illustration tells a 12-second, repeating story: sealed pantry goods move from a donor, through volunteer pickup and transport, to a recipient. **Pause/Play** controls motion. The system's reduced-motion preference displays a meaningful static handoff instead. This is an illustrative journey, not live vehicle tracking or a dispatch action.

Internal web pages use a local system sans-serif stack (Segoe UI on Windows), 16px body and control text, 14px supporting text, and 12px section labels. Headings, cards, forms, recovery reviews and AI Studio share the same hierarchy; responsive grids wrap instead of shrinking the text. No remote font request is added.

### Rescue Pipeline workspace

The web workspace uses a full-width cream/forest pipeline rather than a permanent broad sidebar. Coordinators navigate **Today**, **Dispatch**, **Network**, **Impact**, and **Workspace**; grouped secondary navigation keeps Food offers, community records, the policy library, Activity & outbox, AI Studio and workspace settings accessible. Volunteers and recipients see their own role-filtered navigation and accessible rescue records.

- The active pipeline has **Recovery first**, **Awaiting approval**, **Awaiting acceptance**, **Assigned**, and **In transit** lanes. **Completed**, **Cancelled**, and **All rescues** views preserve terminal records; search filters the visible cards. Counts come from the saved snapshot, not illustrative targets or invented ETAs.
- A rescue enters Awaiting approval only when its recovery proposal is ready, matches the snapshot version, has not expired as of the snapshot time, and includes that rescue and a replacement. This is **review eligibility, not permission to apply**: the API rechecks current expiry and constraints. Escalations stay in Recovery first. An actual assignment without acceptance appears in Awaiting acceptance; delivery and recipient receipt remain distinct.
- Open a card to use the existing recovery, acceptance, custody, receipt and other validated actions. There is no drag-and-drop reassignment. Offline and stale-snapshot notices remain visible.
- **Liquid/Organic motion** uses Framer Motion: the selected navigation indicator expands vertically, summary/cards rise in a staggered spring with `bounce: 0.4`, and an attention banner settles briefly when attention exists. Entry animations are not intended to replay on routine snapshot refreshes. The header's **Reduce motion** preference is saved locally and the system preference always takes precedence.

The responsive web/PWA shares these views across desktop and phone browsers; this change does not replace the separate Expo native screens or establish a signed Android/iOS release. The landing animation and drive-agnostic Windows launchers remain separate and unchanged. See [build guide](docs/build-guide.html#pipeline-workspace) for the implementation sequence and [verification record](docs/verification.md) for this revision's actual test status.

### Try the complete recovery flow

1. Enter the **coordinator demo**. Harbor Market's synthetic rescue needs a replacement after a pre-pickup cancellation.
2. Open the rescue in **Recovery first** and generate a recovery proposal. Inspect each candidate's capacity, training, availability, receiving windows, cited policies and estimated route. The default mode is visibly offline.
3. Approve the proposal explicitly. Approval reserves a replacement, records an audit event and creates only in-app notifications.
4. An assignment still requires volunteer acceptance before pickup. In the volunteer demo, practice accept → picked up → delivered on Maya's separate pantry rescue, or cancel before pickup and return to coordinator recovery.
5. Switch to the recipient demo to view Maple's deliveries and acknowledgment/policy controls. Infeasible scenarios and post-pickup interruptions escalate rather than silently relax constraints.

A proposal expires after ten minutes; any intervening organization change makes its evidence stale. Refresh and review a new proposal instead of replaying an old approval.

## Clients and commands

| Command | Purpose |
|---|---|
| `npm run dev` | API and responsive web development servers |
| `npm run dev:api` / `npm run dev:web` | Start one server |
| `npm run dev:mobile` | Expo development server; see [native guide](apps/mobile/README.md) |
| `npm run typecheck` | Typecheck API, shared contract, web and native client |
| `npm test` | API, native, web and independent QA suites |
| `npm run eval` | Twelve synthetic offline policy/constraint scenarios |
| `npm run build` | API/shared checks, web build and Expo Android/iOS/web bundle export |
| `npm run verify` | Typecheck, all tests, native real-API integration, evaluation and all builds |
| `npm run test:qa` | Independent regression/security suite |
| `npm run db:check -- --source data/rescuerelay.db` | SQLite integrity and schema check |

Mobile export is a JavaScript/assets compatibility check—not a signed APK, IPA, app-store release or physical-device runtime test. Android builds require the Android toolchain; iOS native builds require macOS/Xcode. A phone cannot reach a computer's `localhost`; see the native guide for the explicit trusted-LAN opt-in and editable API base URL. Do not expose demo mode to an untrusted network.

## Architecture

```text
apps/web       React + Vite responsive PWA; memory-only web sessions
apps/mobile    Expo + React Native; OS SecureStore sessions on native
apps/api       Fastify + Node 24 SQLite; authentication and domain boundary
packages/shared  Typed entities, snapshots and action contracts
qa/            Independent regression tests
scripts/       Safe local database utilities
docs/          Build guide, official documentation, architecture and evidence
```

The organization aggregate is versioned and persisted atomically in SQLite WAL transactions. Separate tables hold users, hashed eight-hour opaque sessions, schema version and idempotent approval responses. Registration creates a new isolated organization; only its coordinator can create linked volunteer/recipient accounts. Reads are role-filtered, and authorization is checked again for every write.

The offline agent chooses investigation tools based on incident evidence, retrieves exact local policy passages using lexical/phrase matching, evaluates deterministic hard constraints, and uses maximum bipartite matching to avoid scarce-driver greedy failures. Candidate preference favors shorter travel and capacity fit; it does **not** claim global route optimality. Routing uses a labeled synthetic matrix or distance estimate, never live traffic. Receiving capacity is conservatively reserved across overlapping **UTC** delivery days.

### Optional AI integrations

The offline product remains fully usable without secrets. The selected runtime adapters are **Fireworks, Nebius Token Factory, OpenAI API, Pinecone, Tavily, Keenable, Mem0, LangSmith, LlamaIndex LlamaParse and ElevenLabs**. Their use cases and seven explicitly deferred alternatives/tools are recorded in the [17-service decision matrix](docs/ai-service-decisions.json) and [visual roadmap](docs/project-plan.html). All ten adapters have mocked verification; none is live-verified or automatically activated.

Web **AI Studio** supports investigation, reference retrieval and indexing, controlled source discovery, document/audio drafts, preferences and operation receipts. Native **AI Assist** supports capability status, model choice, optional retrieval/tracing, investigation consent, receipts and separate recovery approval; uploads and reference/preference management remain web-only.

1. Keep all external calls OFF for the local demonstration. Opening either AI workspace reads local capability status and makes no vendor request.
2. Before an approved live test, review account entitlement, model/index compatibility, permitted data, retention and vendor-side spending controls. Configure only server-side settings in an uncommitted root `.env`, following [.env.example](.env.example). Never put keys in client code, chat, screenshots or source control.
3. Execution requires `AI_EXTERNAL_CALLS_ENABLED=true`, the selected provider's individual `_ENABLED` flag and all required settings. Configuration alone is neither permission nor evidence of a successful connection. Legacy `REASONING_PROVIDER=openai` does **not** enable live calls.
4. Prepare an entirely local consent manifest through AI Studio or AI Assist. Review the exact provider, sanitized evidence or file hash, request budget and retention warning. Explicit confirmation uses a short-lived, actor/organization/version/input-bound, one-use consent. Clients do not automatically retry uncertain external operations.
5. Review returned drafts or recovery proposals separately before applying a domain change. Known partial or uncertain external outcomes remain visible in actor-scoped receipts; receipt presence does not prove rollback or deletion at a vendor.

Reasoning uses allowlisted **read-only** tools with a six-turn/ten-tool-call budget and independent deterministic validation. It cannot assign a volunteer or override constraints. Separately consented indexing, memory writes/deletes and file uploads are bounded external operations, not reasoning tools or hidden dispatch actions. Approved references remain advisory; file-byte/request limits are not verified monetary, page or audio-duration caps.

Use the [AI API contract](docs/ai-api-contract.md) for current endpoints. The ordinary `/plans/generate` provider shortcut is gated; external investigation goes through `/ai/consents` then `/ai/operations`. No live provider call, credential configuration, real upload, external trace or spending was used to develop or verify this build.

## Documentation

- [Step-by-step HTML build guide](docs/build-guide.html) — open locally in your browser.
- [Official project documentation](docs/RescueRelay-Project-Documentation.docx) — audience-ready Word document.
- [Implementation plan](docs/implementation-plan.md) and [API contract](docs/api-contract.md).
- [Verification evidence](docs/verification.md), [security boundaries](SECURITY.md), and [native client guide](apps/mobile/README.md).
- [Documentation regeneration](docs/authoring.md) — optional Python tools; not needed to run the app.

## Backup and recovery

```bash
npm run db:backup -- --source data/rescuerelay.db --output backups/snapshot.db
npm run db:check -- --source backups/snapshot.db
npm run db:restore -- --source backups/snapshot.db --output data/restored.db
```

These commands refuse to overwrite an existing destination. Backup uses SQLite's consistent snapshot operation, including committed WAL data. Restore validates schema/integrity, creates a **new** database and invalidates all sessions; it does not replace a running database. Stop the API, point `DATABASE_PATH` to the restored file, restart, and sign in again. Protect backups: they contain user information and password hashes. Version 1 is the only supported schema; future migrations require an explicit tested migration procedure.

## Enterprise direction

The current single-host foundation deliberately leaves enterprise SSO/MFA, password recovery, PostgreSQL row-level isolation, durable background queues, real notification delivery, maps/traffic contracts, cold-chain workflows, regulator/food-bank policy validation, production observability and alerting, signed mobile releases and production hardening for the next phase. Existing food-rescue organizations already provide matching, substitution and routing; RescueRelay's explainable last-hour recovery focus is a product hypothesis to validate with operators, not a claim of uniqueness.

## Author

**Krishna Kallamadi** · [GitHub](https://github.com/krish339-ai) · [LinkedIn](https://www.linkedin.com/in/krishna-kishore-kallamadi-a22b498/)

A database and cloud professional with 16+ years of on-premises and cloud experience in healthcare and insurance, with a career beginning in 2009. Areas of focus include database administration and performance, data engineering and architecture, cloud, AI, automation and security. AWS Certified AI Practitioner, pursuing an AI Data Architect direction. This author biography follows the author's [DataQualityAgent profile](https://github.com/krish339-ai/DataQualityAgent/blob/main/README.md).
