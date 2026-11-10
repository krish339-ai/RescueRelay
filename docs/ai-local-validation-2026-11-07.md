# Local AI configuration and validation — 7 November 2026

**Later hosted evidence:** [Eight hosted integrations passed live operations](hosted-ai-validation-2026-11-07.md) later on the same date. This document preserves the earlier local checkpoint; its remaining-test list is not the current hosted status. OpenAI remains disabled on the Site and ElevenLabs remains parked.

This records operator-authorized checks on the Windows development checkout on 7 November 2026 (Eastern time). It supplements the historical mock-only release evidence; it is not a production certification or a claim that every AI workflow passed.

## Configuration and demo-account readiness

Nine providers are configured and enabled in the local, Git-ignored root `.env`: Fireworks, Nebius Token Factory, OpenAI, Pinecone, Tavily, Keenable, Mem0, LangSmith and LlamaParse. ElevenLabs is intentionally parked, unconfigured and disabled.

After restarting the local application, an authenticated **demo coordinator** session queried `/api/ai/capabilities`. All nine providers returned `configured=true`, `enabled=true`, `available=true` and an empty `missingEnv` list. The session was logged out afterward. This is a real local API readiness check using the demo account, not a browser interaction test or proof that every provider operation works end to end.

Credentials remain server-side and are not included in this report. Another checkout still requires its own operator configuration; repository defaults remain off and each app operation still requires its own consent.

## Observed provider results

| Provider | Successful validation | Limits / remaining work |
|---|---|---|
| Fireworks AI | Authenticated model lookup and one live arithmetic completion returned the correct answer; 26 input + 30 output = 56 tokens. Model: `accounts/fireworks/models/glm-5p3-flash`. | Direct provider test; full in-app investigation and tool-calling workflow not tested live. |
| Nebius Token Factory | Authenticated model catalog and one live arithmetic completion returned the correct answer; 26 input + 41 output = 67 tokens. Model: `zai-org/GLM-5.3-Flash`. | Direct provider test; full in-app investigation and tool-calling workflow not tested live. |
| OpenAI | Model lookup and one live Responses arithmetic request succeeded; 20 input + 5 output = 25 tokens. Model: `gpt-6-luna`. | Direct provider test; full in-app investigation not tested live. |
| Pinecone | Authenticated index metadata, compatible ready index, and the isolated app-route indexing/retrieval test described below passed. | The running demo workspace has no approved references populated by this test. |
| Tavily | Authenticated usage lookup and one basic public USDA search succeeded; one result, reported usage of one credit. | Direct search test; draft review/approval workflow not tested live. |
| Keenable | One authenticated public USDA search succeeded and returned one result. | Direct search test; draft review/approval workflow not tested live. |
| Mem0 | Authenticated ping succeeded and resolved a project. | Memory save, recall and delete were not tested at this local checkpoint; later hosted operations passed. |
| LangSmith | Saved replacement key successfully read the newly created RescueRelay Local tracing destination. Correct tracing project configured as `rescuerelay-local`, with its verified workspace scope. | No trace was sent at this local checkpoint; later hosted trace ingestion passed. Vendor dashboard display was not checked. |
| LlamaParse | Authenticated parse-job listing succeeded; the versions endpoint confirmed `cost_effective` with `latest` is supported. | No document was uploaded or parsed. |
| ElevenLabs | None; intentionally parked. | API key, transcription model and live transcription remain pending. |

Successful requests do not establish account credit balances, spending caps, latency benchmarks or long-term reliability. Exact charges were not independently audited.

## Pinecone indexing and retrieval test

The `rescuerelay-policies` index was verified ready on AWS `us-east-1`. Its `chunk_text` string field uses `llama-text-embed-v2`, 1,024 dimensions and cosine similarity; stored text and source/title fields support the application's citation handling.

The running demo workspace contained no approved reference policies or reviewable drafts. Instead of changing its data, the test created an **isolated in-memory instance of the actual RescueRelay API**, registered a synthetic coordinator/organization there, and seeded one synthetic reference fixture. The fixture was not a human-reviewed operational policy, and the draft approval workflow was not part of this test.

Both operations went through the actual authenticated `/api/ai/consents` and `/api/ai/operations` routes, with separate one-use consents and the organization-derived namespace. The transport contacted the real configured Pinecone index; responses were not mocked. Only Pinecone was contacted.

- Indexing: one document accepted with HTTP **202**; app receipt marked **completed**.
- Retrieval: first search returned HTTP **200** and the exact synthetic text, matching source reference, namespace and `reference_only` authority.
- No local fallback was used. Total external requests: **one upsert and one search**.
- The isolated app's configured operational policies remained unchanged. The running demo database was not modified.
- One clearly labeled **SYNTHETIC TEST ONLY — Amber Orchard** document remains in the separate test namespace. Its namespace and document ID are recorded only in the ignored local test report for later inspection or cleanup.

This proves the indexing and retrieval path against live Pinecone using the application code. It does not prove the browser upload/review flow, populate the real demo account's policy library, or change food-handling rules.

## Evidence and interpretation

Ignored local evidence is retained under `.rescuerelay/ai-setup/`: `fireworks-result.json`, `nebius-result.json`, `validation-operations.json`, `pinecone-metadata.json`, `pinecone-e2e-result.json`, and their helper scripts. The LangSmith destination lookup returned HTTP 200 and matched the supplied destination before settings were changed. The post-restart capability command checked all nine providers successfully.

`validation-metadata.json` is an **earlier checkpoint**: its missing Pinecone index and LangSmith project entries predate their creation and are superseded by the later checks recorded here. Do not read that file alone as the final setup status. Local evidence files are intentionally not committed, so this report is the shareable summary rather than a portable credentials-backed reproduction bundle.

AI Studio currently displays a hardcoded **Live testing unverified** label and the capability response uses `liveTested=false`. These fields do not ingest the manual validation evidence above. They were not changed to imply comprehensive end-to-end verification.

The earlier release service matrix preserves historical/default-off verification. The Word document now includes this setup and validation record in sections 21–24, and the HTML guide includes a dated local-validation update. This report records this machine's configuration and bounded live checks; it does not revise historical test counts or claim a new aggregate CI pass.
