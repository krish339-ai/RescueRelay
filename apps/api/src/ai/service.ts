import { createHash, randomBytes } from "node:crypto";
import type {
  AiConsentManifest,
  AiOperationInput,
  AiOperationResponse,
  AiOperationReceipt,
  AiProviderId,
  User,
} from "@rescuerelay/shared";
import { assert, AppError } from "../errors.js";
import { audit, id, nowIso, type OrgState } from "../state.js";
import { Store } from "../store.js";
import { snapshot } from "../snapshot.js";
import {
  investigateWithProvider,
  OpenAIInvestigationProvider,
} from "../provider.js";
import { capabilities, loadAiSettings, type AiSettings } from "./config.js";
import { indexDocuments, indexReferences } from "./indexing.js";
import { investigationEvidence } from "./evidence.js";
import { AiHttp, type Fetcher } from "./http.js";
import {
  ChatCompletionsInvestigator,
  localPolicySearch,
  discoverSources,
  discoverKeenableSources,
  parseDocumentPoll,
  parseDocumentStart,
  pineconeSearch,
  scopeHash,
  tracePlan,
  transcribe,
} from "./adapters.js";
import { aiState, publicDraft, type StoredAiDraft } from "./state.js";
import {
  forgetPreference,
  recallPreferences,
  savePreference,
} from "./memory.js";
export interface AiOptions {
  settings?: AiSettings;
  fetch?: Fetcher;
  now?: () => number;
  pause?: (ms: number) => Promise<void>;
}
interface Consent {
  asOf: number;
  contextHash?: string;
  actorId: string;
  orgId: string;
  fingerprint: string;
  expires: number;
  manifest: AiConsentManifest;
}
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const fingerprint = (request: AiOperationInput, version: number) =>
  hash(JSON.stringify({ request, version }));
const budgets: Record<AiOperationInput["operation"], number> = {
  investigate: 12,
  policy_index: 1,
  policy_search: 2,
  source_discovery: 2,
  preference_recall: 2,
  preference_save: 1,
  preference_forget: 3,
  document_upload: 2,
  document_poll: 2,
  voice_transcribe: 1,
};
export function providersFor(request: AiOperationInput): AiProviderId[] {
  switch (request.operation) {
    case "investigate":
      return [
        request.input.provider,
        ...(request.input.usePinecone ? ["pinecone" as const] : []),
        ...(request.input.trace ? ["langsmith" as const] : []),
      ];
    case "policy_index":
    case "policy_search":
      return ["pinecone"];
    case "source_discovery":
      return [request.input.provider ?? "tavily"];
    case "preference_save":
    case "preference_recall":
    case "preference_forget":
      return ["mem0"];
    case "document_upload":
    case "document_poll":
      return ["llamaparse"];
    case "voice_transcribe":
      return ["elevenlabs"];
  }
}
function fileBytes(
  request: Extract<
    AiOperationInput,
    { operation: "document_upload" | "voice_transcribe" }
  >,
): Buffer {
  const b = Buffer.from(request.input.contentBase64, "base64");
  assert(
    b.length > 0 &&
      b.length <= 2 * 1024 * 1024 &&
      b.toString("base64") === request.input.contentBase64,
    400,
    "INVALID_UPLOAD",
    "Upload must be canonical base64 and at most 2 MiB decoded.",
  );
  const type = request.input.mimeType;
  let valid = false;
  if (type === "application/pdf")
    valid = b.subarray(0, 5).toString() === "%PDF-";
  else if (type === "text/plain") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(b);
      valid = !b.includes(0);
    } catch {
      valid = false;
    }
  } else if (type === "audio/wav")
    valid =
      b.subarray(0, 4).toString() === "RIFF" &&
      b.subarray(8, 12).toString() === "WAVE";
  else if (type === "audio/mpeg")
    valid =
      b.subarray(0, 3).toString() === "ID3" ||
      (b.length > 1 && b[0] === 255 && (b[1]! & 224) === 224);
  else if (type === "audio/mp4") valid = b.subarray(4, 8).toString() === "ftyp";
  else if (type === "audio/webm")
    valid = b.subarray(0, 4).toString("hex") === "1a45dfa3";
  assert(
    valid,
    400,
    "UPLOAD_TYPE_MISMATCH",
    "File signature does not match the selected supported content type. This check does not validate document pages, audio duration or content safety.",
  );
  return b;
}
export class AiService {
  readonly settings: AiSettings;
  private consents = new Map<string, Consent>();
  private now: () => number;
  constructor(
    private store: Store,
    private options: AiOptions = {},
  ) {
    this.settings = structuredClone(options.settings ?? loadAiSettings());
    Object.freeze(this.settings.allowedResearchDomains);
    for (const vendor of Object.values(this.settings.vendors))
      Object.freeze(vendor);
    Object.freeze(this.settings.vendors);
    Object.freeze(this.settings);
    this.now = options.now ?? Date.now;
  }
  capabilities() {
    return capabilities(this.settings);
  }
  private validateScope(s: OrgState, user: User, r: AiOperationInput) {
    if (r.operation === "investigate") {
      const targets =
        r.input.rescueIds ??
        s.rescues.filter((x) => x.status === "needs_recovery").map((x) => x.id);
      assert(
        targets.length > 0 &&
          targets.length <= 50 &&
          targets.every((rid) =>
            s.rescues.some(
              (x) => x.id === rid && x.status === "needs_recovery",
            ),
          ),
        422,
        "INVALID_INCIDENTS",
        "Choose current recovery incidents belonging to your organization.",
      );
    }
    if (r.operation === "policy_index") indexDocuments(s, r.input.referenceIds);
    if (r.operation === "source_discovery")
      assert(
        r.input.domains.every((d) =>
          this.settings.allowedResearchDomains.includes(d),
        ),
        422,
        "DOMAIN_NOT_APPROVED",
        "Search domains must come from the operator-approved allowlist.",
      );
    if (r.operation === "source_discovery" && r.input.provider === "keenable")
      assert(
        r.input.domains.length === 1,
        422,
        "KEENABLE_SITE_LIMIT",
        "Keenable requires exactly one approved site per operation.",
      );
    if (r.operation === "preference_save")
      assert(
        r.input.preferenceType === "communication_style"
          ? ["concise", "detailed"].includes(r.input.value)
          : ["comfortable", "compact"].includes(r.input.value),
        400,
        "INVALID_PREFERENCE",
        "Preference value does not match its noncritical category.",
      );
    if (r.operation === "preference_forget")
      assert(
        aiState(s).memories.some(
          (m) => m.id === r.input.memoryId && m.ownerId === user.id,
        ),
        404,
        "NOT_FOUND",
        "Your saved preference was not found.",
      );
    if (r.operation === "document_poll")
      assert(
        aiState(s).drafts.some(
          (d) =>
            d.id === r.input.draftId &&
            d.ownerId === user.id &&
            d.status === "processing" &&
            d.provider === "llamaparse" &&
            d.remoteJobId,
        ),
        404,
        "NOT_FOUND",
        "Your pending parse job was not found.",
      );
    if (r.operation === "document_upload" || r.operation === "voice_transcribe")
      fileBytes(r);
  }
  prepare(
    user: User,
    request: AiOperationInput,
    expectedVersion: number,
  ): AiConsentManifest {
    const s = this.store.read(user.orgId);
    assert(
      s.version === expectedVersion,
      409,
      "STALE_VERSION",
      "Refresh before reviewing a data-transfer consent.",
    );
    this.validateScope(s, user, request);
    for (const [key, c] of this.consents)
      if (c.expires <= this.now()) this.consents.delete(key);
    assert(
      [...this.consents.values()].filter((c) => c.actorId === user.id).length <
        20,
      429,
      "CONSENT_LIMIT",
      "Too many pending consent previews. Wait for expiry before creating more.",
    );
    const providers = providersFor(request),
      caps = this.capabilities();
    const available = providers.every(
      (p) => caps.providers.find((c) => c.provider === p)!.available,
    );
    const localOnly = request.operation === "policy_search" && !available;
    let preview: Record<string, unknown> = { ...request.input };
    let categories: string[] = [];
    switch (request.operation) {
      case "investigate":
        preview = {
          ...request.input,
          incidentIds:
            request.input.rescueIds ??
            s.rescues
              .filter((x) => x.status === "needs_recovery")
              .map((x) => x.id),
          sharedFields: [
            "incident IDs and status",
            "food category, sealed flag and weight",
            "pickup/delivery/receiving windows",
            "volunteer IDs, capacity, training and availability",
            "configured policy excerpts",
            "human-approved reference excerpts (reference-only)",
          ],
          excludedFields: [
            "names",
            "email addresses",
            "contact details",
            "addresses",
            "coordinates",
            "cancellation reasons",
          ],
        };
        categories = [
          "operational constraints and pseudonymous record IDs",
          "configured policy text and separately labeled human-approved references",
          ...(request.input.usePinecone
            ? ["policy search text and organization namespace"]
            : []),
          ...(request.input.trace
            ? [
                "separate redacted counts, tool names and hashed organization scope",
              ]
            : []),
        ];
        break;
      case "policy_index":
        categories = [
          "full approved reference text chunks",
          "reviewed titles and provenance",
          "hashed organization namespace",
          "metered external indexing write",
        ];
        break;
      case "policy_search":
        categories = localOnly
          ? []
          : ["policy search query", "hashed organization namespace"];
        break;
      case "source_discovery":
        categories = ["exact query text", "approved source domains"];
        break;
      case "preference_save":
        preview = { ...request.input, userId: scopeHash(user.orgId, user.id) };
        categories = [
          "structured noncritical display preference",
          "hashed actor and organization identifier",
        ];
        break;
      case "preference_recall":
        preview = { ...request.input, userId: scopeHash(user.orgId, user.id) };
        categories = [
          "preference query",
          "hashed actor and organization identifier",
        ];
        break;
      case "preference_forget":
        preview = {
          memoryId: request.input.memoryId,
          userId: scopeHash(user.orgId, user.id),
        };
        categories = [
          "owned memory identifier and ownership lookup",
          "external preference deletion",
        ];
        break;
      case "document_upload":
      case "voice_transcribe": {
        const bytes = fileBytes(request);
        preview = {
          filename: request.input.filename,
          mimeType: request.input.mimeType,
          title: request.input.title,
          bytes: bytes.length,
          fileSha256: hash(bytes),
          warning:
            "Entire file content is transferred. Byte limits are not page, duration, credit or spending caps.",
        };
        categories = [
          request.operation === "document_upload"
            ? "full uploaded document content"
            : "full uploaded voice recording",
          "filename and content type",
        ];
        break;
      }
      case "document_poll": {
        const draft = aiState(s).drafts.find(
          (d) => d.id === request.input.draftId,
        )!;
        preview = { draftId: draft.id, providerJobId: draft.remoteJobId };
        categories = ["previously uploaded document job identifier"];
        break;
      }
    }
    const asOf = this.now();
    let contextHash: string | undefined;
    if (request.operation === "investigate") {
      const envelope = investigationEvidence(s, request.input.rescueIds, asOf);
      contextHash = hash(JSON.stringify(envelope));
      preview = {
        ...preview,
        model:
          this.settings.vendors[request.input.provider].model ??
          "not configured",
        evidenceEnvelope: envelope,
        evidenceSha256: contextHash,
        dynamicDisclosure:
          "The fixed envelope is the complete local operational evidence available to tools. The model chooses bounded tool calls; future model text and external retrieval outputs are not known before execution. If Pinecone is selected, returned reference passages may be forwarded to the selected reasoning provider. External references never override configured constraints.",
      };
    }
    if (request.operation === "policy_index") {
      const documents = indexDocuments(s, request.input.referenceIds);
      contextHash = hash(JSON.stringify(documents));
      preview = {
        namespace: scopeHash(user.orgId),
        documents,
        documentSha256: contextHash,
        apiVersion: "2026-07",
        writeWarning:
          "Upsert may create the namespace and replaces matching app-owned document IDs. Accepted writes are asynchronous; retries can re-embed and bill again. No automatic retry or index creation.",
      };
    }
    if (request.operation === "policy_search")
      preview = {
        ...preview,
        namespace: scopeHash(user.orgId),
        apiVersion: "2026-07",
        topK: 5,
      };
    if (request.operation === "document_upload")
      preview = {
        ...preview,
        parseTier: this.settings.vendors.llamaparse.tier ?? "not configured",
        parseVersion:
          this.settings.vendors.llamaparse.version ?? "not configured",
      };
    if (request.operation === "voice_transcribe")
      preview = {
        ...preview,
        model: this.settings.vendors.elevenlabs.model ?? "not configured",
      };
    const expires = asOf + 300000,
      consentId = randomBytes(24).toString("base64url");
    const manifest: AiConsentManifest = {
      consentId,
      operation: request.operation,
      expiresAt: new Date(expires).toISOString(),
      expectedVersion,
      payloadSha256: hash(
        JSON.stringify({
          operationInputSha256: fingerprint(request, expectedVersion),
          contextHash: contextHash ?? null,
        }),
      ),
      providers,
      dataCategories: categories,
      payloadPreview: preview,
      maximumRequests: budgets[request.operation],
      retentionNotice: localOnly
        ? "Local lookup only; no external provider will receive this request."
        : "External provider billing, retention and data-processing terms apply. Credits are not a verified spending cap. Uploaded files may be retained; this app does not automatically delete vendor copies. Confirm you have permission to transfer this data. No zero-retention claim is made.",
      requiresExplicitConfirmation: true,
      executionMode: localOnly ? "local-only" : "external",
      executionAvailable: available || localOnly,
    };
    this.consents.set(consentId, {
      asOf,
      contextHash,
      actorId: user.id,
      orgId: user.orgId,
      fingerprint: fingerprint(request, expectedVersion),
      expires,
      manifest,
    });
    return manifest;
  }
  async execute(
    user: User,
    request: AiOperationInput,
    expectedVersion: number,
    consentId: string,
  ): Promise<AiOperationResponse> {
    const consent = this.consents.get(consentId);
    assert(
      consent && consent.actorId === user.id && consent.orgId === user.orgId,
      403,
      "CONSENT_INVALID",
      "A valid one-use consent for this actor and organization is required.",
    );
    this.consents.delete(consentId);
    assert(
      consent.expires > this.now(),
      403,
      "CONSENT_EXPIRED",
      "Consent expired. Prepare and review a fresh manifest.",
    );
    assert(
      consent.fingerprint === fingerprint(request, expectedVersion),
      403,
      "CONSENT_MISMATCH",
      "Operation, payload or version differs from the reviewed consent.",
    );
    const state = this.store.read(user.orgId);
    assert(
      state.version === expectedVersion,
      409,
      "STALE_VERSION",
      "State changed after consent. Review fresh evidence and a new consent. No external call was made.",
    );
    this.validateScope(state, user, request);
    if (request.operation === "policy_index")
      assert(
        hash(
          JSON.stringify(indexDocuments(state, request.input.referenceIds)),
        ) === consent.contextHash,
        409,
        "CONSENT_CONTEXT_CHANGED",
        "Approved reference text differs from reviewed index consent.",
      );
    if (request.operation === "investigate")
      assert(
        hash(
          JSON.stringify(
            investigationEvidence(state, request.input.rescueIds, consent.asOf),
          ),
        ) === consent.contextHash,
        409,
        "CONSENT_CONTEXT_CHANGED",
        "Operational evidence differs from the reviewed envelope. Prepare fresh consent.",
      );
    assert(
      consent.manifest.executionAvailable,
      403,
      "ADAPTER_UNAVAILABLE",
      "Required external integrations are disabled or unconfigured. No call was made.",
    );
    const http = new AiHttp(
      this.settings,
      this.options.fetch,
      budgets[request.operation],
      12000,
      this.options.pause,
    );
    const warnings: string[] = [];
    let result: Omit<AiOperationResponse, "snapshot"> = {
      summary: "Operation completed; no assignment was applied.",
      warnings,
    };
    const externalRecords: AiOperationReceipt["externalRecords"] = [];
    const receipt = (
      status: AiOperationReceipt["status"],
      guidance: string,
    ): AiOperationReceipt => ({
      id: id("ai-receipt"),
      operation: request.operation,
      status,
      providers: consent.manifest.providers,
      requestCount: http.calls,
      payloadSha256: consent.manifest.payloadSha256,
      createdAt: nowIso(),
      externalRecords: [...externalRecords],
      guidance,
    });
    const drafts: StoredAiDraft[] = [];
    let apply = (s: OrgState) => {};
    const draft = (
      kind: StoredAiDraft["kind"],
      provider: AiProviderId,
      title: string,
      content: string,
      status: StoredAiDraft["status"] = "needs_review",
    ): StoredAiDraft => ({
      id: id("ai-draft"),
      kind,
      provider,
      title,
      content,
      status,
      sources: [],
      ownerId: user.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      notice:
        "Untrusted AI or external reference output. Review and edit before a separate validated action. This is not a food-safety certification.",
    });
    try {
      switch (request.operation) {
        case "policy_index": {
          const indexed = await indexReferences(
            http,
            state,
            request.input.referenceIds,
            (documentId) =>
              externalRecords.push({
                provider: "pinecone",
                kind: "document-upsert-target",
                id: documentId,
              }),
          );
          result.summary = `Pinecone accepted ${indexed.count} reviewed reference chunks in your organization namespace. Search visibility is asynchronous; no automatic polling or retry occurred.`;
          warnings.push(
            "A successful upsert is not proof of immediate search visibility. Separate future search requires its own consent. Configured operational constraints remain unchanged.",
          );
          break;
        }
        case "policy_search": {
          const found =
            consent.manifest.executionMode === "local-only"
              ? {
                  citations: localPolicySearch(state, request.input.query),
                  warnings: [
                    "The reviewed consent authorized local-only lookup. No external request was made.",
                  ],
                  fallback: "local-only" as const,
                }
              : await pineconeSearch(http, state, request.input.query);
          result = {
            ...result,
            ...found,
            summary: found.fallback
              ? "Local-only policy results. No external result was trusted."
              : "Organization-scoped reference matches returned. Configured constraints remain authoritative.",
          };
          break;
        }
        case "source_discovery": {
          const chosen = request.input.provider ?? "tavily";
          const sources =
            chosen === "keenable"
              ? await discoverKeenableSources(
                  http,
                  request.input.query,
                  request.input.domains,
                )
              : await discoverSources(
                  http,
                  request.input.query,
                  request.input.domains,
                );
          assert(
            sources.length > 0,
            422,
            "NO_SOURCED_RESULTS",
            "No results from the approved source domains were returned.",
          );
          const d = draft(
            "reference_policy",
            chosen,
            "Source discovery: " + request.input.query.slice(0, 100),
            sources
              .map((s) => `${s.title}\n${s.url}\n${s.excerpt}`)
              .join("\n\n")
              .slice(0, 100000),
          );
          d.sources = sources;
          drafts.push(d);
          result.sources = sources;
          result.summary =
            "Source excerpts saved as a reference draft. No policy or assignment changed.";
          break;
        }
        case "preference_save": {
          const saved = await savePreference(
            http,
            user.orgId,
            user.id,
            request.input.preferenceType,
            request.input.value,
          );
          result.preferences = saved;
          externalRecords.push(
            ...saved.map((m) => ({
              provider: "mem0" as const,
              kind: "memory",
              id: m.id,
            })),
          );
          apply = (s) => {
            aiState(s).memories.push(
              ...saved.map((m) => ({
                id: m.id,
                remoteId: m.id,
                ownerId: user.id,
                preferenceType: request.input.preferenceType,
                value: request.input.value,
                createdAt: nowIso(),
              })),
            );
          };
          result.summary =
            "Only the explicitly selected noncritical preference was stored externally. It cannot override rescue constraints.";
          break;
        }
        case "preference_recall": {
          result.preferences = await recallPreferences(
            http,
            user.orgId,
            user.id,
            request.input.query,
            new Set(
              aiState(state)
                .memories.filter((m) => m.ownerId === user.id)
                .map((m) => m.remoteId),
            ),
          );
          result.summary =
            "Actor-scoped advisory preferences returned. No policy or assignment changed.";
          break;
        }
        case "preference_forget": {
          const memory = aiState(state).memories.find(
            (m) => m.id === request.input.memoryId && m.ownerId === user.id,
          )!;
          externalRecords.push({
            provider: "mem0",
            kind: "memory-deletion-target",
            id: memory.remoteId,
          });
          await forgetPreference(http, user.orgId, user.id, memory.remoteId);
          apply = (s) => {
            aiState(s).memories = aiState(s).memories.filter(
              (m) => !(m.id === memory.id && m.ownerId === user.id),
            );
          };
          result.summary =
            "The owned external preference was deleted and its local reference removed.";
          break;
        }
        case "document_upload": {
          const bytes = fileBytes(request);
          const jobId = await parseDocumentStart(
            http,
            request.input.filename,
            request.input.mimeType,
            bytes,
            (kind, id) =>
              externalRecords.push({ provider: "llamaparse", kind, id }),
          );
          const d = draft(
            "reference_policy",
            "llamaparse",
            request.input.title,
            "Document uploaded. Parsing is pending; use a separately reviewed status request.",
            "processing",
          );
          d.remoteJobId = jobId;
          drafts.push(d);
          result.summary =
            "Document uploaded and parsing requested. No unbounded polling, policy publication or assignment occurred.";
          warnings.push(
            "Vendor copies may remain stored and incur charges under account settings; local byte limits are not a page or spending cap.",
          );
          break;
        }
        case "document_poll": {
          const d = aiState(state).drafts.find(
            (d) => d.id === request.input.draftId && d.ownerId === user.id,
          )!;
          const parsed = await parseDocumentPoll(http, d.remoteJobId!);
          const updated = {
            ...d,
            updatedAt: nowIso(),
            status:
              parsed.status === "completed"
                ? ("needs_review" as const)
                : parsed.status === "failed"
                  ? ("failed" as const)
                  : ("processing" as const),
            ...(parsed.markdown ? { content: parsed.markdown } : {}),
          };
          apply = (s) => {
            const index = aiState(s).drafts.findIndex((x) => x.id === d.id);
            aiState(s).drafts[index] = updated;
          };
          result.drafts = [publicDraft(updated)];
          result.summary =
            parsed.status === "completed"
              ? "Parsed markdown is ready for human reference review. No configured constraints changed."
              : parsed.status === "failed"
                ? "Vendor parsing ended unsuccessfully. No policy or assignment changed."
                : "Parsing remains pending. No automatic polling was scheduled.";
          break;
        }
        case "voice_transcribe": {
          const content = await transcribe(
            http,
            request.input.filename,
            request.input.mimeType,
            fileBytes(request),
          );
          drafts.push(
            draft("rescue_note", "elevenlabs", request.input.title, content),
          );
          result.summary =
            "Transcript saved as a rescue-note draft. A human must supply and verify all structured donation fields; no dispatch occurred.";
          warnings.push(
            "Audio bytes are not a verified duration limit. Vendor retention terms apply; zero logging is not assumed.",
          );
          break;
        }
        case "investigate": {
          const p = request.input.provider;
          let provider;
          if (p === "openai") {
            const v = this.settings.vendors.openai;
            provider = new OpenAIInvestigationProvider(
              v.key!,
              v.model!,
              async (_url, init) =>
                new Response(
                  JSON.stringify(
                    await http.json(
                      "openai",
                      "https://api.openai.com/v1/responses",
                      init,
                      true,
                    ),
                  ),
                  {
                    status: 200,
                    headers: { "content-type": "application/json" },
                  },
                ),
            );
          } else provider = new ChatCompletionsInvestigator(p, http);
          const plan = await investigateWithProvider(
            state,
            request.input.rescueIds,
            provider,
            async (query) => {
              const local = localPolicySearch(state, query);
              if (!request.input.usePinecone) return local;
              const found = await pineconeSearch(http, state, query);
              warnings.push(...found.warnings);
              return [
                ...local.filter((c) => c.authority === "configured"),
                ...found.citations.filter((c) => c.authority !== "configured"),
              ];
            },
            consent.asOf,
          );
          if (request.input.trace) {
            const warning = await tracePlan(http, plan, user.orgId);
            if (warning) warnings.push(warning);
          }
          apply = (s) => {
            s.plans.unshift(plan);
            s.plans = s.plans.slice(0, 50);
          };
          result.plan = plan;
          result.summary =
            "Read-only provider investigation produced a proposal. Review evidence and use the separate existing approval control to reserve volunteers.";
          break;
        }
      }
    } catch (error) {
      if (http.calls > 0) {
        const uncertain =
          error instanceof AppError &&
          error.code === "EXTERNAL_OUTCOME_UNKNOWN";
        const r = receipt(
          externalRecords.length
            ? "partial_external_write"
            : uncertain
              ? "outcome_unknown"
              : "rejected",
          "External work may be partially complete. Known vendor identifiers are retained here. Do not automatically replay; inspect the vendor account and any retained files/memories, then authorize a specific recovery action.",
        );
        this.store.recordAiReceipt(user.orgId, { ...r, ownerId: user.id });
        if (error instanceof AppError)
          throw new AppError(error.status, error.code, error.message, {
            receipt: r,
          });
        throw new AppError(
          502,
          "EXTERNAL_OPERATION_INCOMPLETE",
          "The external operation did not finish cleanly. Review the retained receipt before authorizing recovery.",
          { receipt: r },
        );
      }
      throw error;
    }
    const completedReceipt = receipt(
      "completed",
      "The bounded operation completed. This receipt is not evidence of food movement or an applied rescue assignment.",
    );
    let saved;
    try {
      saved = this.store.mutate(user.orgId, expectedVersion, (s) => {
        apply(s);
        aiState(s).receipts.unshift({ ...completedReceipt, ownerId: user.id });
        aiState(s).receipts = aiState(s).receipts.slice(0, 200);
        if (drafts.length) {
          aiState(s).drafts.unshift(...drafts);
          aiState(s).drafts = aiState(s).drafts.slice(0, 100);
        }
        audit(
          s,
          user,
          "ai.operation",
          request.operation,
          `User-consented ${consent.manifest.executionMode}; providers ${consent.manifest.providers.join(", ")}; ${http.calls}/${http.maximumCalls} bounded HTTP requests. No automatic assignment.`,
        );
      });
    } catch (error) {
      if (error instanceof AppError && error.code === "STALE_VERSION") {
        const r = receipt(
          "external_completed_local_stale",
          "External work completed but organization state changed; no stale domain result was applied. Review known vendor identifiers and retained files/memories before authorizing recovery.",
        );
        this.store.recordAiReceipt(user.orgId, { ...r, ownerId: user.id });
        throw new AppError(
          409,
          "AI_RESULT_STALE",
          "Organization state changed while the operation ran. External work may have completed; a recovery receipt was saved without applying the stale domain result.",
          { receipt: r },
        );
      }
      throw error;
    }
    if (drafts.length) result.drafts = drafts.map(publicDraft);
    result.warnings = [...new Set([...result.warnings, ...warnings])];
    return {
      ...result,
      receipt: completedReceipt,
      snapshot: snapshot(saved.state, user, false),
    };
  }
}
