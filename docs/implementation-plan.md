# RescueRelay implementation plan

## Product boundary
Build a runnable, cloneable local-first food-rescue coordination product, emphasizing explainable last-hour volunteer replacement and human approval. Real dispatch, food-safety certification, payments, public hosting and app-store distribution are outside this build. All seeded people, locations and rescues are synthetic; notifications are an in-app outbox, not messages to real people.

## Build sequence and acceptance gates
1. **Architecture and contracts.** TypeScript npm workspaces: Fastify API, Node 24 SQLite, React/Vite responsive installable web app, Expo Android/iOS client, shared contracts. Separate organization identity, durable state version, role-filtered reads. Publish API contract before client implementation.
2. **Persistence and identity.** SQLite WAL transactions, password hashing with scrypt, random short-lived opaque sessions stored hashed, no static production password or administrator API key. Local-only explicit demo access. Verify unauthorized and cross-organization reads/writes fail.
3. **Operational domain.** Donors, recipient acceptance policies, volunteers with availability/capacity, sealed shelf-stable donations, scheduled rescues and state transitions, audit trail and outbox. Reject invalid windows, unsafe unknown handling and unauthorized transitions.
4. **Recovery agent.** Evidence-driven tool selection, token/phrase policy retrieval with quoted citations, labeled synthetic route estimates, deterministic hard constraints, ranked replacement options and maximum bipartite matching under the one-active-rescue constraint. Offline bounded planner works without external calls. Optional configured provider can choose strictly allowlisted read-only investigation tools within six-turn/ten-call budgets, never override constraints or dispatch.
5. **Approval controls.** Cancellation opens a recovery incident. Coordinator generates a proposal, reviews evidence and rejection reasons, then applies an explicit proposal using expected state version and idempotency key. Revalidate constraints atomically; stale proposals fail. Infeasible cases escalate without fabrication.
6. **Web and mobile experiences.** Responsive coordinator dashboard, rescue board, recovery workspace, partner and volunteer views. Native Expo app for role-based daily activity, cancellation/status reporting and recipient acknowledgment. Accessible forms, loading/error/empty states and truthful connectivity labels.
7. **Data utilities and quality.** CSV validation/export, synthetic scenario reset, evaluation harness, integration tests for auth, tenant isolation, permission boundaries, recovery, infeasibility, stale approvals, idempotency and restart durability. Typecheck, builds, browser smoke and Android/iOS export checks as environment permits.
8. **Delivery.** Step-by-step HTML build guide and official DOCX; README quick start, security and operations notes, enterprise migration roadmap. Regular source commits and authenticated GitHub pushes. Verify remote commit and report tested versus untested targets accurately.

## Decisions
- SQLite is intentionally single-host; a versioned JSON aggregate per organization simplifies atomic invariant checking. Users, sessions, idempotency records and organization state are persisted separately. PostgreSQL with row-level security and durable jobs is the growth path, not a claim about present scale.
- Data and routes are synthetic; configurable policies encode operational checks but do not certify food safety. This initial build only accepts sealed shelf-stable goods.
- The offline agent is a transparent state-driven bounded planner, not a secretly simulated live LLM. Provider investigation mode requires user-supplied settings and an explicit request.
- Production configuration disables demo access and binds account/role assignment to authenticated organization coordinators. Initial registration creates a new organization; accounts are not self-promoted into another organization.

## Verification record
Implementation evidence and exact final checks will be recorded in `docs/verification.md`; commands must be rerun after changes.

## Optional AI extension
The selected implementation adds ten default-off adapters: Fireworks, Nebius, OpenAI API, Pinecone, Tavily, Keenable, Mem0, LangSmith, LlamaParse and ElevenLabs. The authoritative service decisions are in `ai-service-decisions.json`; the five additional implementation/readiness stages 13–17 are in `project-plan.json`. Seven other considered services remain explicit alternatives or deferred tools, not hidden dependencies.

The extension prepares local exact one-use consent before any external operation, retains receipts for partial or uncertain outcomes, and requires separate human review of drafts and recovery proposals. Local approved reference material informs retrieval but never changes deterministic safety constraints. Final local mocked verification passed at 18:05 UTC on 30 October 2026; live account activation, real vendor tests, hosting and device signing remain separate decisions.
