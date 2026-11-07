# Security and operating boundaries

## What this build enforces
- Every persisted domain record belongs to one organization. An opaque bearer session determines organization and role; clients cannot select a different tenant in an action payload.
- Passwords use salted scrypt hashes. Random 256-bit opaque tokens expire after eight hours and are stored only as SHA-256 hashes. Web clients hold tokens in memory; native clients use OS-backed SecureStore. No fixed production administrator password, provider key or durable signing secret is shipped.
- Coordinator, volunteer and recipient authorization is rechecked on each write. A volunteer cannot alter training/capacity, access other volunteers' assignments or approve recovery. A recipient cannot see coordinator plans/audit or another recipient's delivery list.
- SQLite transactions, optimistic state versions, expiry and idempotency protect plan approval. Plans are not dispatches. Volunteer acceptance precedes pickup. Infeasible plans cannot be approved.
- Picked-up food remains associated with its holder during escalation. The holder is excluded from further assignment until a coordinator records disposition. The application does not certify that a physical event or safe handling occurred.
- Strict request validation, request size limits, authentication rate limits and parameterized SQL apply. CSV validation is all-or-nothing; exports neutralize spreadsheet formula prefixes.
- Optional model investigation uses read-only tools, typed arguments, tenant/incident scope, six-turn/ten-tool-call budgets and independent deterministic validation. No reasoning tool may apply a plan or send a dispatch instruction. All external adapters default OFF; server-only configuration and global/individual enable flags are separate from exact one-use operation consent.
- Explicit indexing, structured memory writes/deletes and document/audio uploads are separate bounded external operations. Actor/organization/version/input-bound expiring consent, scoped drafts and operation receipts preserve the authorization and review boundary. Writes and ambiguous outcomes are never automatically replayed; known remote identifiers survive partial success or stale local completion without applying stale domain changes.
- Approved external references are advisory and cannot change configured hard constraints. Voice transcription creates a draft; human-completed donation fields must pass domain validation. LangSmith tracing is separately disclosed, redacted and optional. No live account, vendor retention guarantee, model entitlement, monetary cap or operational efficacy has been verified. See [the AI contract](docs/ai-api-contract.md) and [service decisions](docs/ai-service-decisions.json).
- Browser/API responses are not cached for offline operational writes. Offline availability is a client-shell convenience, not offline dispatch authority.

## Local demo boundary
Demo mode permits role selection without a password and contains only synthetic data. API and web servers bind to loopback by default. `NODE_ENV=production` refuses demo mode. LAN demo requires intentional `HOST=0.0.0.0` plus `ALLOW_LAN_DEMO=true`; run only on a trusted private test network. Proxying the development API through a publicly exposed web server defeats the intended local boundary; do not do it.

## Limitations before any real operation
This repository is not a security certification or production launch. It needs independent security review, HTTPS/TLS, an approved identity/SSO/MFA and account-recovery design, production rate limiting, durable audit retention, encrypted backups, monitoring, dependency maintenance and operating procedures. The JSON-per-organization SQLite design is single-host and does not claim multi-region/high-concurrency scale. Organization-local calendar/timezone rules need explicit configuration; current capacity accounting conservatively uses UTC days. Food-handling policies must be reviewed by qualified local operators, not inferred by a language model.

Do not log or commit tokens, passwords, `.env`, databases or backups. Backups include personal information and password hashes. Restoring invalidates sessions but requires the operator to establish which backup is authoritative. Audit records are append-only at the application route level, not cryptographically tamper-proof against a filesystem administrator.

## Dependency maintenance
The lockfile pins reproducible dependency resolutions. Compatible security overrides for `image-size` 2.0.4 and `postcss` 8.5.32 address inherited Metro/Expo build-chain advisories; native export checks verify compatibility. See `docs/verification.md` for the exact final audit. A low-severity `deepmerge` 4.3.1 build-configuration advisory has no patched release at verification time. It is reached through trusted Expo configuration, not an API handler; never run untrusted Expo config in this checkout. The residual advisory remains disclosed rather than downgraded to evade reporting.

## Reporting
Report a suspected issue privately to the repository owner through an established trusted contact. Do not post credentials, personal data or exploit-bearing production records in a public issue. Include the affected commit, minimal synthetic reproduction and observed boundary failure.
