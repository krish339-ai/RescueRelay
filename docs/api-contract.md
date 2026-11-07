# Client integration contract
Base: `http://localhost:4000/api`. JSON; `Authorization: Bearer <session token>` after login. All timestamps ISO UTC. Errors `{error,code,details?}`. All data is scoped to the authenticated organization and role. Import public types from `@rescuerelay/shared`. Development demo is synthetic and loopback-only by default.

## Identity
- GET `/health` -> `{status:'ok', version:'0.1.0'}`
- GET `/config` -> `{demoMode:boolean, providerConfigured:boolean}`. `providerConfigured` reflects the injected legacy/test reasoning provider, not optional AI service readiness. Use `/ai/capabilities` for safe adapter-specific status.
- POST `/auth/demo` `{role:'coordinator'|'volunteer'|'recipient'}` -> `SessionResponse`. Demo volunteer maps to `v-maya`; recipient maps to `rec-maple`. Available only in demo mode.
- POST `/auth/register` `{name,email,password,organizationName}` -> `SessionResponse`. Creates a NEW isolated empty organization and coordinator. Password minimum 12 characters.
- POST `/auth/login` `{email,password}` -> `SessionResponse`.
- POST `/auth/logout` `{}` -> `{ok:true}`. Revokes current session.
- POST `/users` coordinator `{name,email,password,role,volunteerId?,recipientId?}` -> `{user}`. Role entity must belong to organization. No other org may be selected.

## Read and mutation shape
- GET `/snapshot` -> `Snapshot`. Use `snapshot.version` as `expectedVersion` for every domain mutation.
- Normal domain mutations return refreshed `Snapshot`. Conflict HTTP 409 `STALE_VERSION`: refetch and ask for review, do NOT silently replay approval.
- POST `/rescues/:id/cancel` `{expectedVersion,reason}` coordinator or the assigned volunteer. Opens recovery; picked-up rescues instead escalate custody interruption, with no automated reassignment.
- POST `/rescues/:id/accept` `{expectedVersion}` assigned volunteer or coordinator; marks volunteer acceptance, required before pickup.
- POST `/rescues/:id/status` `{expectedVersion,status:'picked_up'|'delivered'}` coordinator or assigned volunteer; strict forward transitions.
- POST `/rescues/:id/confirm` `{expectedVersion}` recipient for its own delivered rescue, or coordinator.
- PATCH `/volunteers/:id` `{expectedVersion,available?,capacityKg?,availability?,location?,trained?,vehicle?,notes?}` coordinator, or self for availability/location only.
- PATCH `/recipients/:id` `{expectedVersion,capacityKg?,openingWindow?,acceptedCategories?,notes?}` coordinator or own recipient account.
- POST `/donors` `{expectedVersion,name,location,contact?,notes?}` coordinator.
- PATCH `/donors/:id` `{expectedVersion,name?,location?,contact?,notes?}` coordinator.
- POST `/recipients` `{expectedVersion,name,location,contact?,acceptedCategories,capacityKg,openingWindow,notes?}` coordinator.
- POST `/volunteers` `{expectedVersion,name,vehicle,capacityKg,available,availability,location,trained,notes?}` coordinator.
- POST `/donations` `{expectedVersion,donorId,description,category,weightKg,servings,sealed,handlingNotes?,pickupWindow}` coordinator. Only sealed shelf-stable category accepted; other handling needs human-approved future workflows.
- POST `/rescues` `{expectedVersion,donationId,recipientId,deliveryWindow,volunteerId?}` coordinator. Without volunteer starts `needs_recovery`; an initial volunteer assignment must pass constraints.

## Recovery and evidence
- POST `/plans/generate` `{expectedVersion,rescueIds?:string[],mode?:'offline'|'provider'}` coordinator -> `PlanResponse {plan,snapshot}`. By default considers all `needs_recovery` rescues. Persists proposal; updates state version. `plan.baseVersion === snapshot.version`.
- POST `/plans/:id/apply` `{expectedVersion,idempotencyKey:string}` coordinator -> `PlanResponse`. Requires `ready` plan, matching current version, unexpired plan, constraints still valid, and explicit approval click. Same key/body is replay-safe even after version changed. Changed body/key reuse -> 409. Never retry automatically with a new version.
- In the ordinary application, `mode:provider` on `/plans/generate` is gated with HTTP 503 `CONSENT_REQUIRED`. An explicitly injected test provider is retained for isolated tests; legacy environment settings do not enable live requests. External investigation requires `/ai/consents` followed by `/ai/operations` with `operation:investigate`; see [the AI contract](ai-api-contract.md). Deterministic matching and separate approval still control assignments. Offline mode makes no vendor call. `/plans/:id/explain` remains retired (410); use the AI workspace consent flow, not a legacy shortcut.
- POST `/rescues/:id/escalate` `{expectedVersion,reason}` coordinator -> `Snapshot`.
- POST `/rescues/:id/resolve` `{expectedVersion,resolution:'resume_recovery'|'delivered'|'cancelled',reason}` coordinator; explicit disposition for an escalated rescue. Resume recovery is forbidden while `custodyHeld` is true; delivered/cancelled require the coordinator to establish disposition outside the app.
- Eligibility, location and receiving-constraint edits are rejected while active assignments depend on them. Resolve those assignments first; notes/contact edits remain allowed.
- POST `/notifications/:id/read` `{expectedVersion}` -> `Snapshot`.
- POST `/demo/reset` `{expectedVersion,scenario?:'baseline'|'no_capacity'|'tight_window'}` coordinator -> `Snapshot`. Demo org only, cancels stale proposals, regenerates timestamps.

## Data utilities
- POST `/imports/donations/validate` `{csv:string}` coordinator -> `CsvValidation`.
- POST `/imports/donations` `{expectedVersion,csv:string}` coordinator -> `Snapshot`; all-or-nothing validation/import.
- GET `/exports/donations.csv` coordinator -> UTF-8 CSV, formula-safe cells.
- GET `/exports/audit.csv` coordinator -> UTF-8 CSV.
CSV headers: `donorId,description,weightKg,servings,pickupStart,pickupEnd`; imported items are explicitly sealed shelf-stable, label them accurately before upload. Maximum 200 rows.

## Client handling
Coordinator may see organization-wide audit, policies, candidates and metrics. Volunteers see only assigned rescues, associated donors/recipients/donations and own volunteer record; recipients see only their own rescues and location. Both see applicable notifications, not coordinator plans/audit or other users. Role switch in demo should logout old session before entering a new role. Login tokens belong in memory on web and secure OS storage on mobile, never console/logs. Browser reload may require login; that is intentional. No service-worker caching of authenticated API responses.

## Optional AI workspace
All AI routes require a coordinator and derive organization and actor from the session. `GET /ai/capabilities` reads safe configured/enabled/available/live-tested status without network probing; `GET /ai/drafts` reads actor-scoped drafts, preferences and receipts plus organization-scoped approved references. Consent preparation is local. Explicit execution, draft approval and recovery approval are separate actions. The complete operation union, file limits, external-write semantics, receipt handling and current payload contracts are documented in [ai-api-contract.md](ai-api-contract.md) and `packages/shared/src/ai.ts`.
