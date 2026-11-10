# Hosted AI validation — 7 November 2026

These checks ran against the private deployed RescueRelay Site, using a separate
synthetic organization. They are distinct from the original local API-key tests
and the local Worker delivery-workflow tests documented in the separate hosting source’s `HOSTING.md`.

## Live operations

| Provider | Deployed operation and observed result |
| --- | --- |
| Fireworks AI | Completed a read-only recovery investigation and produced a ready proposal. Three model requests, plus two separately consented LangSmith trace requests. No assignment was applied. |
| Nebius Token Factory | Completed a read-only recovery investigation and produced a ready proposal after the response-parser repair. Five model requests plus two separately consented LangSmith trace requests. No assignment was applied. |
| Tavily | One search returned two approved-domain source results and a reviewable reference draft. |
| Keenable | One search returned three approved-domain source results and a reviewable reference draft. |
| Mem0 | Saved one synthetic concise-display preference, recalled it, verified ownership and deleted it. Four provider requests across three separately consented operations. |
| LlamaParse | Uploaded a short synthetic text document and submitted parsing. The first separately consented status request returned completed markdown as a reviewable draft. |
| Pinecone | Indexed one explicitly reviewed synthetic reference, then retrieved its Amber Orchard marker on the first search without local fallback. One write and one search. |
| LangSmith | Accepted creation and completion of redacted Fireworks and Nebius investigation traces. Both operations reported no tracing warning. Trace rendering in the vendor UI was not independently inspected. |
| OpenAI | Disabled on the hosted Site; hosted key setup still requires the OpenAI Developers plugin workflow. Earlier local API success does not establish hosted readiness. |
| ElevenLabs | Disabled and not tested, as requested. |

## Authorization and state checks

Production checks confirmed private service access alone could not enter the
application API; an app session was still required. Registration, password login,
and persistent synthetic organization data worked. Volunteer and recipient
accounts were denied coordinator AI access. Successful operations required fresh
actor-scoped consent, and replaying an executed consent returned HTTP 403.
The investigation did not assign a volunteer. The shared demo was not reset.

## Defects found and repaired

The initial live checks exposed two Worker transport incompatibilities before
outbound requests were sent: native `fetch` was called with the wrong receiver,
and Workers does not support the `error` redirect option. The hosted transport
now calls `fetch` through a wrapper and uses `manual`, rejecting non-success
responses without following redirects or forwarding credentials. A real Worker
test with mocked outbound responses verifies both successful requests and
redirect rejection.

After those repairs, model investigations reached their providers but exceeded
the original 12-second per-request timeout. Investigations now allow 45 seconds
per request while retaining the existing six-turn, ten-tool and external-request
limits. Other operations retain their 12-second timeout. The failing operations
were not silently treated as successes; separate consent was used for each
targeted retest.

A subsequent Nebius investigation reached the model but rejected its final
response. A tiny diagnostic confirmed that Nebius returns `tool_calls: null`
when it answers without another tool call. The adapter now treats null as no
calls while still rejecting malformed function-call entries. Both cases have
regression tests; the diagnostic used 55 tokens and did not transfer project data.

## Test artifacts and limits

The isolated synthetic organization and its audit receipts remain in hosted D1.
One labeled reference remains in its separate Pinecone namespace. The synthetic
LlamaCloud file and parse job may remain under vendor retention settings. Redacted
LangSmith traces remain; the Mem0 test preference was deleted successfully.
No local credentials or real donor/volunteer/recipient data were uploaded.

The final release removes temporary service-test access and its two runtime
settings. A regression check verifies that the former header cannot bypass
signed-in visitor access. The final source passed all nine hosted regression
tests, hosted TypeScript checking and the client/Worker build.

All eight enabled integrations completed live operations. OpenAI and ElevenLabs
remain disabled; this is not a claim that all ten adapters are enabled or tested.

These are API-level live checks, not browser visual QA or a production load test.
The AI Studio `liveTested` flag remains a static false value; this report and the
operation receipts provide the actual evidence. Vendor credits and retention
are separate from hosting allowances. No exact spend was measured.

## Environment and source provenance

The verified deployment used the separate Sites source at commit
`b1cb3628d6c1ae50773e5243b5c33fa2004c8843` and completed on 7 November 2026.
The hosted network, timeout and parser repairs are in that hosting source; they
were not copied into the original local application by this documentation update.
The final live cleanup check returned HTTP 401 for the retired test credential
and HTTP 200 for the web shell. Site access remained owner-only.

The earlier [local validation report](ai-local-validation-2026-11-07.md) records
a different environment and earlier test coverage. API-level success does not
verify browser layouts, native devices, production load or future vendor uptime.
