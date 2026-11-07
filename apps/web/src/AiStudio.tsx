import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Database,
  FileText,
  FileUp,
  Globe,
  Info,
  Layers,
  LockKeyhole,
  Mic,
  RefreshCw,
  Route,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type {
  AiCapabilities,
  AiCapability,
  AiConsentManifest,
  AiDraft,
  AiDraftApproval,
  AiOperation,
  AiOperationInput,
  AiOperationResponse,
  AiOperationReceipt,
  AiProviderId,
  AiSource,
  AiWorkspace as AiWorkspaceData,
  RecoveryPlan,
  Snapshot,
} from "@rescuerelay/shared";
import { api, ApiFailure } from "./api";
import { AiOperationForm } from "./AiForms";
import { DonationForm } from "./forms";
import { Modal, Notice, Empty, Busy, Field, dateTime, time } from "./ui";
import {
  capabilityLabel,
  consentIsStale,
  providerLabels,
  safeExternalUrl,
} from "./ai-values";
import "./ai.css";

const operationLabels: Record<AiOperation, string> = {
  investigate: "Investigate a recovery",
  policy_search: "Find policy evidence",
  policy_index: "Index approved reference knowledge",
  source_discovery: "Discover public references",
  preference_recall: "Recall advisory preferences",
  preference_save: "Save a noncritical preference",
  preference_forget: "Forget an app-owned preference",
  document_upload: "Prepare a document reference",
  document_poll: "Check document processing",
  voice_transcribe: "Turn a voice note into a draft",
};
type AiDialog =
  | {
      kind: "operation";
      operation: AiOperation;
      draft?: AiDraft;
      referenceId?: string;
    }
  | { kind: "setup"; provider: AiProviderId }
  | { kind: "draft"; draft: AiDraft }
  | null;
type Props = {
  snapshot: Snapshot;
  token: string;
  onSnapshot: (s: Snapshot) => void;
  onReviewPlan: (plan: RecoveryPlan) => void;
  onSessionExpired: () => void;
};
export function AiStudio({
  snapshot,
  token,
  onSnapshot,
  onReviewPlan,
  onSessionExpired,
}: Props) {
  const [capabilities, setCapabilities] = useState<AiCapabilities | null>(null);
  const [workspace, setWorkspace] = useState<AiWorkspaceData>({
    drafts: [],
    referencePolicies: [],
    memories: [],
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"tools" | "drafts" | "references">("tools");
  const [dialog, setDialog] = useState<AiDialog>(null);
  const [manifest, setManifest] = useState<AiConsentManifest | null>(null);
  const [pendingRequest, setPendingRequest] = useState<AiOperationInput | null>(
    null,
  );
  const [consumed, setConsumed] = useState(false);
  const [result, setResult] = useState<AiOperationResponse | null>(null);
  const [message, setMessage] = useState("");
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    void Promise.all([
      api<AiCapabilities>("/ai/capabilities", token),
      api<AiWorkspaceData>("/ai/drafts", token),
    ])
      .then(([caps, data]) => {
        if (mounted.current) {
          setCapabilities(caps);
          setWorkspace(data);
        }
      })
      .catch((e) => {
        if (mounted.current) {
          setError(
            e instanceof Error
              ? e.message
              : "The local AI workspace could not be loaded.",
          );
          if (e instanceof ApiFailure && e.status === 401) onSessionExpired();
        }
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, [token]);
  async function reloadLocal() {
    const [caps, data, latest] = await Promise.all([
      api<AiCapabilities>("/ai/capabilities", token),
      api<AiWorkspaceData>("/ai/drafts", token),
      api<Snapshot>("/snapshot", token),
    ]);
    if (mounted.current) {
      setCapabilities(caps);
      setWorkspace(data);
      onSnapshot(latest);
    }
  }
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ApiFailure) {
        setError(e.message);
        if (e.status === 401) onSessionExpired();
        if (e.code === "STALE_VERSION" || e.code === "AI_RESULT_STALE") {
          try {
            await reloadLocal();
          } catch {
            setError(
              "Workspace data changed, but refreshing failed. Refresh before preparing a new request. No external operation was retried.",
            );
          }
        }
      } else
        setError(
          "The request could not be confirmed. If an external operation was started, the provider may already have received it. No automatic retry was made. Refresh local records and check provider usage before starting another transfer.",
        );
      return undefined;
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function openOperation(
    operation: AiOperation,
    draft?: AiDraft,
    referenceId?: string,
  ) {
    setError("");
    setManifest(null);
    setPendingRequest(null);
    setConsumed(false);
    setDialog({ kind: "operation", operation, draft, referenceId });
  }
  function close() {
    if (busy) return;
    setDialog(null);
    setManifest(null);
    setPendingRequest(null);
    setConsumed(false);
    setError("");
  }
  async function prepare(request: AiOperationInput) {
    await run(async () => {
      const consent = await api<AiConsentManifest>("/ai/consents", token, {
        ...request,
        expectedVersion: snapshot.version,
      });
      setPendingRequest(request);
      setManifest(consent);
      setConsumed(false);
    });
  }
  async function execute() {
    if (
      !manifest ||
      !pendingRequest ||
      consumed ||
      !manifest.executionAvailable ||
      consentIsStale(manifest, snapshot.version)
    )
      return;
    const confirmedManifest = manifest;
    const request = pendingRequest;
    setConsumed(true);
    await run(async () => {
      let response: AiOperationResponse;
      try {
        response = await api<AiOperationResponse>("/ai/operations", token, {
          ...request,
          expectedVersion: confirmedManifest.expectedVersion,
          consentId: confirmedManifest.consentId,
        });
      } catch (error) {
        // Failed external work can still produce a durable actor-scoped receipt.
        // Only local reads are repeated; never replay the paid operation.
        try {
          await reloadLocal();
        } catch {
          /* Original error remains authoritative. */
        }
        throw error;
      }
      onSnapshot(response.snapshot);
      setResult(response);
      setDialog(null);
      setManifest(null);
      setPendingRequest(null);
      setMessage(
        "Operation result recorded. Review the evidence and any drafts before taking another action.",
      );
      try {
        await reloadLocal();
      } catch {
        setError(
          "The operation returned a result, but the local draft list could not be refreshed. Use Refresh local records; do not repeat the external operation.",
        );
      }
      if (response.drafts?.length) setView("drafts");
    });
  }
  async function approveDraft(
    draft: AiDraft,
    approval: Omit<AiDraftApproval, "expectedVersion">,
  ): Promise<boolean> {
    const success = await run(async () => {
      const next = await api<Snapshot>(
        `/ai/drafts/${draft.id}/approve`,
        token,
        { expectedVersion: snapshot.version, ...approval },
      );
      onSnapshot(next);
      setDialog(null);
      setMessage(
        draft.kind === "reference_policy"
          ? "Reference approved into the reference collection. Authoritative constraints are unchanged."
          : "Human-reviewed food offer created. Creating and assigning a rescue remains a separate action.",
      );
      try {
        await reloadLocal();
      } catch {
        setError(
          "Approval was recorded, but the local list could not be refreshed. Refresh local records before further review.",
        );
      }
      return true;
    });
    return !!success;
  }
  async function rejectDraft(draft: AiDraft, reason: string) {
    await run(async () => {
      const next = await api<Snapshot>(`/ai/drafts/${draft.id}/reject`, token, {
        expectedVersion: snapshot.version,
        reason,
      });
      onSnapshot(next);
      setDialog(null);
      setMessage("Draft rejected. No reference or food offer was created.");
      try {
        await reloadLocal();
      } catch {
        setError(
          "Rejection was recorded, but the local list could not be refreshed.",
        );
      }
    });
  }
  const readyCount =
    capabilities?.providers.filter((p) => p.available).length || 0;
  const reviewCount = workspace.drafts.filter(
    (d) => d.status === "needs_review",
  ).length;
  const selectedCapability =
    dialog?.kind === "setup"
      ? capabilities?.providers.find((p) => p.provider === dialog.provider)
      : undefined;
  return (
    <div className="ai-studio">
      <section className="ai-intro">
        <div>
          <span className="eyebrow">
            <ShieldCheck size={13} /> OPTIONAL INTELLIGENCE. EXPLICIT HUMAN
            CONTROL.
          </span>
          <h2>
            More context.
            <br />
            <em>Not less care.</em>
          </h2>
          <p>
            Prepare better evidence with optional AI tools. Review provider
            destinations, the bound request, and disclosed data categories—then
            decide what becomes part of the relay.
          </p>
        </div>
        <div className="ai-control-card">
          <span
            className={
              "ai-global-status " +
              (capabilities?.externalCallsEnabled ? "enabled" : "disabled")
            }
          >
            <span />
            {loading
              ? "Reading local configuration…"
              : capabilities?.externalCallsEnabled
                ? "External-call gate enabled"
                : "External-call gate off"}
          </span>
          <strong>
            {readyCount}
            <small> / {capabilities?.providers.length ?? "—"}</small>
          </strong>
          <span>providers available to request</span>
          <p>
            Settings present ≠ enabled ≠ live-tested.
            <br />
            No credit balances or paid usage are assumed.
          </p>
        </div>
      </section>
      {message && (
        <div className="ai-message" role="status">
          <CheckCircle2 size={17} />
          <span>{message}</span>
          <button
            className="icon-button"
            aria-label="Dismiss AI workspace message"
            onClick={() => setMessage("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {error && !dialog && (
        <div className="dialog-error" role="alert">
          {error}
        </div>
      )}
      <div className="ai-toolbar">
        <div className="filter-tabs" aria-label="AI workspace sections">
          <button
            className={view === "tools" ? "active" : ""}
            aria-pressed={view === "tools"}
            onClick={() => setView("tools")}
          >
            Tools & controls
          </button>
          <button
            className={view === "drafts" ? "active" : ""}
            aria-pressed={view === "drafts"}
            onClick={() => setView("drafts")}
          >
            Review drafts <span>{reviewCount}</span>
          </button>
          <button
            className={view === "references" ? "active" : ""}
            aria-pressed={view === "references"}
            onClick={() => setView("references")}
          >
            Reference collection{" "}
            <span>{workspace.referencePolicies.length}</span>
          </button>
        </div>
        <button
          className="button secondary small"
          disabled={busy || loading}
          onClick={() =>
            void run(async () => {
              await reloadLocal();
              setMessage(
                "Local capabilities and draft records refreshed. No provider was called.",
              );
            })
          }
        >
          <RefreshCw size={14} /> Refresh local records
        </button>
      </div>
      {loading ? (
        <div className="ai-loading" role="status">
          <Busy label="Reading local capabilities and drafts…" />
          <p>No external provider is being contacted.</p>
        </div>
      ) : !capabilities ? (
        <Empty
          title="The AI workspace isn’t reachable yet."
          description="The baseline rescue workflow remains available. Check the server and retry loading local capability information."
          action="Retry local connection"
          onAction={() => void run(reloadLocal)}
        />
      ) : (
        <>
          {view === "tools" && (
            <>
              <div className="ai-safety-strip">
                <LockKeyhole size={17} />
                <p>
                  {capabilities.disclosure ||
                    "All provider calls require explicit, short-lived consent. Secrets stay on the server; no external call happens when you open this page."}
                </p>
              </div>
              <div className="ai-feature-grid">
                {[
                  {
                    operation: "investigate" as const,
                    icon: Route,
                    title: "Reason through a recovery",
                    copy: "Compare evidence with Fireworks, Nebius, or OpenAI. Keep deterministic constraints and separate approval in charge.",
                    providers: [
                      "fireworks",
                      "nebius",
                      "openai",
                    ] as AiProviderId[],
                    tag: "PROPOSE, NEVER DISPATCH",
                  },
                  {
                    operation: "policy_search" as const,
                    icon: BookOpen,
                    title: "Find the relevant policy",
                    copy: "Retrieve cited policy evidence with Pinecone, or use the clearly labelled local-only fallback.",
                    providers: ["pinecone"] as AiProviderId[],
                    tag: "RETRIEVAL WITH PROVENANCE",
                  },
                  {
                    operation: "source_discovery" as const,
                    icon: Globe,
                    title: "Bring in public references",
                    copy: "Use Tavily or Keenable on approved public domains. Every discovery lands as a draft, not an operating rule.",
                    providers: ["tavily", "keenable"] as AiProviderId[],
                    tag: "PUBLIC RESEARCH TO DRAFT",
                  },
                  {
                    operation: "preference_recall" as const,
                    icon: SlidersHorizontal,
                    title: "Remember the small things",
                    copy: "Keep noncritical communication and display preferences advisory, scoped to you and your organization.",
                    providers: ["mem0"] as AiProviderId[],
                    tag: "NONCRITICAL PREFERENCES ONLY",
                  },
                  {
                    operation: "document_upload" as const,
                    icon: FileUp,
                    title: "Turn a document into context",
                    copy: "Use LlamaParse to prepare a reference draft. Check asynchronous parsing only when you authorize a status request.",
                    providers: ["llamaparse"] as AiProviderId[],
                    tag: "DOCUMENT TO REVIEWABLE DRAFT",
                  },
                  {
                    operation: "voice_transcribe" as const,
                    icon: Mic,
                    title: "Start with a voice note",
                    copy: "Use ElevenLabs to transcribe an authorized recording. A person supplies the food-offer facts and reviews every field.",
                    providers: ["elevenlabs"] as AiProviderId[],
                    tag: "VOICE TO HUMAN-REVIEWED NOTE",
                  },
                ].map((feature) => {
                  const anyAvailable = feature.providers.some(
                    (id) =>
                      capabilities.providers.find((p) => p.provider === id)
                        ?.available,
                  );
                  return (
                    <article className="ai-feature" key={feature.operation}>
                      <div className="ai-feature-top">
                        <span className="ai-feature-icon">
                          <feature.icon size={22} />
                        </span>
                        <span
                          className={
                            "badge " + (anyAvailable ? "green" : "neutral")
                          }
                        >
                          {anyAvailable
                            ? "Available with consent"
                            : feature.operation === "policy_search"
                              ? "Local lookup available"
                              : "External execution off"}
                        </span>
                      </div>
                      <span className="eyebrow">{feature.tag}</span>
                      <h3>{feature.title}</h3>
                      <p>{feature.copy}</p>
                      <div className="ai-provider-pills">
                        {feature.providers.map((provider) => (
                          <button
                            key={provider}
                            onClick={() => {
                              setError("");
                              setDialog({ kind: "setup", provider });
                            }}
                          >
                            {providerLabels[provider]}
                            <Info size={11} />
                          </button>
                        ))}
                      </div>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => openOperation(feature.operation)}
                      >
                        {anyAvailable
                          ? "Prepare a request"
                          : feature.operation === "policy_search"
                            ? "Preview a policy lookup"
                            : "Preview without calling"}
                        <ArrowRight size={15} />
                      </button>
                      {feature.operation === "preference_recall" && (
                        <div className="ai-mini-actions">
                          <button
                            disabled={busy}
                            onClick={() => openOperation("preference_save")}
                          >
                            Save a preference
                          </button>
                          <button
                            disabled={busy || !workspace.memories.length}
                            onClick={() => openOperation("preference_forget")}
                          >
                            Forget one
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              <section className="ai-provider-section">
                <div className="section-label-row">
                  <div>
                    <span className="eyebrow">NO HIDDEN CONNECTIONS</span>
                    <h3>Know what’s configured.</h3>
                  </div>
                  <span>Server-reported status only</span>
                </div>
                <div className="ai-provider-table">
                  {capabilities.providers.map((provider) => (
                    <button
                      className="ai-provider-row"
                      key={provider.provider}
                      onClick={() => {
                        setError("");
                        setDialog({
                          kind: "setup",
                          provider: provider.provider,
                        });
                      }}
                    >
                      <span className="ai-provider-name">
                        <span>{provider.label.slice(0, 1)}</span>
                        <strong>{provider.label}</strong>
                      </span>
                      <span
                        className={
                          "badge " + (provider.configured ? "green" : "neutral")
                        }
                      >
                        {provider.configured
                          ? "Settings present"
                          : "Not configured"}
                      </span>
                      <span
                        className={
                          "badge " + (provider.enabled ? "green" : "neutral")
                        }
                      >
                        {provider.enabled
                          ? "Adapter enabled"
                          : "Adapter disabled"}
                      </span>
                      <span className="ai-live-label">
                        Live testing unverified
                      </span>
                      <span className="ai-provider-action">
                        Setup details
                        <ChevronRight size={14} />
                      </span>
                    </button>
                  ))}
                </div>
                <p className="field-hint">
                  LangSmith is an optional redacted trace attached to an
                  investigation, not a separate auto-export. No secrets can be
                  entered or activated here. The server operator controls opt-in
                  and approved research domains.
                </p>
              </section>
            </>
          )}
          {view === "drafts" && (
            <>
              <Notice>
                <strong>Untrusted until you review it.</strong> Raw provider
                output is rendered as text. Reference drafts cannot replace
                authoritative constraints. Voice drafts cannot assign a rescue
                or infer handling facts.
              </Notice>
              {workspace.drafts.length ? (
                <div className="ai-draft-grid">
                  {[...workspace.drafts]
                    .sort(
                      (a, b) =>
                        Date.parse(b.createdAt) - Date.parse(a.createdAt),
                    )
                    .map((draft) => (
                      <article className="ai-draft-card" key={draft.id}>
                        <div className="ai-draft-card-top">
                          <span className="ai-feature-icon">
                            {draft.kind === "reference_policy" ? (
                              <FileText size={20} />
                            ) : (
                              <Mic size={20} />
                            )}
                          </span>
                          <span className={`badge ai-draft-${draft.status}`}>
                            {draft.status.replaceAll("_", " ")}
                          </span>
                        </div>
                        <small>
                          {providerLabels[draft.provider]} ·{" "}
                          {dateTime(draft.createdAt)}
                        </small>
                        <h3>{draft.title}</h3>
                        <p className="ai-draft-snippet">
                          {draft.content ||
                            draft.notice ||
                            "Processing has not produced reviewable text yet."}
                        </p>
                        <footer>
                          <span>
                            {draft.kind === "reference_policy"
                              ? "Reference draft"
                              : "Rescue-note draft"}
                          </span>
                          <button
                            className="text-button"
                            onClick={() => {
                              setError("");
                              setDialog({ kind: "draft", draft });
                            }}
                          >
                            {draft.status === "needs_review"
                              ? "Review draft"
                              : "Inspect record"}
                            <ArrowUpRight size={15} />
                          </button>
                        </footer>
                        {draft.status === "processing" && (
                          <button
                            className="button secondary full"
                            disabled={busy}
                            onClick={() =>
                              openOperation("document_poll", draft)
                            }
                          >
                            Preview one status request
                            <RefreshCw size={14} />
                          </button>
                        )}
                      </article>
                    ))}
                </div>
              ) : (
                <Empty
                  title="Ideas will land here first."
                  description="A document, source search, or voice transcription creates a reviewable draft. Nothing becomes a food offer or reference until you approve it."
                />
              )}
            </>
          )}
          {view === "references" && (
            <>
              <Notice>
                <BookOpen size={17} />
                <strong>Reference knowledge, not hard rules.</strong> These
                human-reviewed documents can inform an investigation. They
                cannot relax the configured capacity, timing, handling, or
                approval constraints in the Policy library.
              </Notice>
              {workspace.referencePolicies.length ? (
                <div className="policy-grid">
                  {workspace.referencePolicies.map((policy) => (
                    <article className="policy-card" key={policy.id}>
                      <div className="policy-card-top">
                        <span className="badge neutral">
                          Reviewed reference
                        </span>
                        <span className="badge neutral">{policy.scope}</span>
                      </div>
                      <h2>{policy.title}</h2>
                      <p>{policy.text}</p>
                      <footer>
                        <FileText size={15} />
                        <span>
                          {policy.source}
                          <small>
                            {policy.id} · v{policy.version}
                          </small>
                        </span>
                      </footer>
                      <button
                        className="button secondary full ai-index-button"
                        disabled={busy}
                        onClick={() =>
                          openOperation("policy_index", undefined, policy.id)
                        }
                      >
                        Preview indexing in Pinecone <Database size={15} />
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title="A reference shelf worth trusting."
                  description="Approved reference drafts will appear here, separately from the authoritative operating policies."
                />
              )}
            </>
          )}
        </>
      )}
      {!!workspace.receipts?.length && (
        <OperationReceipts receipts={workspace.receipts} />
      )}
      {result && (
        <section className="ai-result panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">LAST OPERATION RESULT</span>
              <h3>
                {result.fallback === "local-only"
                  ? "Local-only evidence returned."
                  : "The result is ready for review."}
              </h3>
            </div>
            <button
              className="icon-button"
              onClick={() => setResult(null)}
              aria-label="Dismiss operation result"
            >
              <X size={18} />
            </button>
          </div>
          <div className="ai-result-body">
            <p>{result.summary}</p>
            {result.warnings.map((warning, i) => (
              <Notice type="warning" key={i}>
                {warning}
              </Notice>
            ))}
            {result.citations?.length ? (
              <div className="citation-grid">
                {result.citations.map((citation, i) => (
                  <article className="citation" key={i}>
                    <h5>{citation.title}</h5>
                    <p>{citation.excerpt}</p>
                    <small>
                      {citation.source} · version {citation.version} · retrieval
                      score {citation.score.toFixed(3)}
                    </small>
                  </article>
                ))}
              </div>
            ) : null}
            {result.sources?.length ? (
              <SourceList sources={result.sources} />
            ) : null}
            {result.preferences?.length ? (
              <div className="ai-preferences-result">
                <Notice>
                  Advisory preferences only. No operational rule, assignment, or
                  app setting was changed by recalling them.
                </Notice>
                {result.preferences.map((p) => (
                  <div key={p.id}>
                    <p>{p.text}</p>
                    <small>{p.id}</small>
                  </div>
                ))}
              </div>
            ) : null}
            {result.plan && (
              <button
                className="button primary"
                onClick={() => onReviewPlan(result.plan!)}
              >
                Inspect the proposed recovery plan
                <ArrowRight size={17} />
              </button>
            )}
            {!!result.drafts?.length && (
              <button
                className="button secondary"
                onClick={() => setView("drafts")}
              >
                Review {result.drafts.length} draft
                {result.drafts.length === 1 ? "" : "s"}
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </section>
      )}
      {dialog && (
        <Modal
          key={
            dialog.kind === "operation"
              ? `${dialog.kind}-${dialog.operation}`
              : dialog.kind
          }
          wide={!!manifest || dialog.kind === "draft"}
          title={
            dialog.kind === "setup"
              ? `${selectedCapability?.label || "Provider"} setup, clearly.`
              : dialog.kind === "draft"
                ? "A draft, not a decision."
                : manifest
                  ? "Review the bound request."
                  : operationLabels[dialog.operation]
          }
          eyebrow={
            manifest
              ? "ONE-USE, VERSION-BOUND CONSENT"
              : dialog.kind === "draft"
                ? "HUMAN REVIEW REQUIRED"
                : "OPTIONAL AI WORKSPACE"
          }
          onClose={close}
        >
          {error && (
            <div className="dialog-error" role="alert">
              {error}
            </div>
          )}
          {dialog.kind === "setup" && selectedCapability && capabilities && (
            <ProviderSetup
              capability={selectedCapability}
              globalEnabled={capabilities.externalCallsEnabled}
            />
          )}
          {dialog.kind === "operation" &&
            capabilities &&
            (manifest && pendingRequest ? (
              <ConsentReview
                manifest={manifest}
                snapshotVersion={snapshot.version}
                busy={busy}
                consumed={consumed}
                onConfirm={execute}
                onBack={() => {
                  if (!busy) {
                    setManifest(null);
                    setPendingRequest(null);
                    setConsumed(false);
                    setError("");
                  }
                }}
                onClose={close}
              />
            ) : (
              <AiOperationForm
                operation={dialog.operation}
                capabilities={capabilities}
                snapshot={snapshot}
                memories={workspace.memories}
                references={workspace.referencePolicies}
                referenceId={dialog.referenceId}
                draft={dialog.draft}
                busy={busy}
                onPrepare={prepare}
              />
            ))}
          {dialog.kind === "draft" && (
            <DraftReview
              draft={dialog.draft}
              snapshot={snapshot}
              busy={busy}
              onApprove={(approval) => approveDraft(dialog.draft, approval)}
              onReject={(reason) => rejectDraft(dialog.draft, reason)}
              onPoll={() => openOperation("document_poll", dialog.draft)}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
function ProviderSetup({
  capability: c,
  globalEnabled,
}: {
  capability: AiCapability;
  globalEnabled: boolean;
}) {
  return (
    <div className="ai-setup">
      <Notice>
        <strong>{capabilityLabel(c, globalEnabled)}.</strong> Configuration is
        read from the RescueRelay server. This screen does not test a provider
        connection, inspect a credit balance, or activate anything.
      </Notice>
      <dl className="ai-setup-status">
        <div>
          <dt>Global external-call gate</dt>
          <dd>{globalEnabled ? "Enabled" : "Off"}</dd>
        </div>
        <div>
          <dt>Individual adapter</dt>
          <dd>{c.enabled ? "Enabled" : "Disabled"}</dd>
        </div>
        <div>
          <dt>Required settings</dt>
          <dd>
            {c.configured ? "Present (values hidden)" : "Missing or incomplete"}
          </dd>
        </div>
        <div>
          <dt>Execution available</dt>
          <dd>
            {c.available
              ? "Only after explicit consent"
              : "No external execution"}
          </dd>
        </div>
        <div>
          <dt>Live testing</dt>
          <dd>Not verified</dd>
        </div>
      </dl>
      <p>{c.note}</p>
      <h4>Server-only setting names</h4>
      <pre className="ai-env-list">
        {c.requiredEnv.join("\n") || "No additional variable names reported."}
      </pre>
      {c.missingEnv.length > 0 && (
        <p className="field-hint">Missing: {c.missingEnv.join(", ")}.</p>
      )}
      <Notice type="warning">
        An authorized operator must independently verify the account, API
        access, pricing, retention terms, and spending limit before enabling
        this adapter. Never paste credentials into this UI, a chat, or a
        repository. A subscription offer is not proof of API credit eligibility.
      </Notice>
    </div>
  );
}
function ConsentReview({
  manifest: m,
  snapshotVersion,
  busy,
  consumed,
  onConfirm,
  onBack,
  onClose,
}: {
  manifest: AiConsentManifest;
  snapshotVersion: number;
  busy: boolean;
  consumed: boolean;
  onConfirm: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [authorized, setAuthorized] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const stale = consentIsStale(m, snapshotVersion, now);
  const local = m.executionMode === "local-only";
  return (
    <div className="ai-consent">
      <div
        className={"ai-consent-destination " + (local ? "local" : "external")}
      >
        <span>
          {local ? <Database size={25} /> : <ArrowUpRight size={25} />}
        </span>
        <div>
          <div className="eyebrow">
            {local ? "LOCAL-ONLY EXECUTION" : "EXPLICIT EXTERNAL TRANSFER"}
          </div>
          <h3>
            {local
              ? "This lookup stays local."
              : m.providers.map((p) => providerLabels[p]).join(" + ")}
          </h3>
          <p>
            {local
              ? "The server reports that no external provider will be called."
              : "Consent covers the listed providers, this bound request, and the disclosed data categories."}
          </p>
        </div>
      </div>
      <div className="ai-consent-meta">
        <span>Expires {time(m.expiresAt)}</span>
        <span>Workspace version {m.expectedVersion}</span>
        <span>
          {local
            ? "0 external requests"
            : `At most ${m.maximumRequests} provider request${m.maximumRequests === 1 ? "" : "s"}`}
        </span>
      </div>
      {!m.executionAvailable && (
        <Notice type="warning">
          <strong>Execution is disabled or unconfigured.</strong> This is an
          inspectable local preview, not an active connection. An authorized
          server operator must complete the required opt-ins before any external
          transfer can run.
        </Notice>
      )}
      {stale && (
        <Notice type="warning">
          This preview expired or the workspace changed. Go back and prepare a
          fresh request. Nothing is automatically repeated.
        </Notice>
      )}
      <h4 className="section-label">DATA CATEGORIES</h4>
      <div className="ai-data-categories">
        {local && !m.dataCategories.length && (
          <span className="badge neutral">None leave this workspace</span>
        )}
        {m.dataCategories.map((category) => (
          <span className="badge neutral" key={category}>
            {category.replaceAll("_", " ")}
          </span>
        ))}
      </div>
      <h4 className="section-label">BOUND REQUEST PREVIEW</h4>
      {m.operation === "investigate" && (
        <p className="field-hint">
          This preview describes permitted fields, not every value in later
          read-only model/tool exchanges. The investigator may receive current
          values within these disclosed categories; excluded fields remain
          withheld by the server.
        </p>
      )}
      <pre className="ai-payload-preview">
        {JSON.stringify(m.payloadPreview, null, 2)}
      </pre>
      <p className="ai-hash">
        <strong>SHA-256 of bound request and workspace version</strong>
        <code>{m.payloadSha256}</code>
      </p>
      <Notice type={local ? "info" : "warning"}>{m.retentionNotice}</Notice>
      {!local && (
        <p className="field-hint">
          The request budget is not a price quote or credit reservation. Any
          provider charges and retention terms remain your responsibility. A
          timeout may mean the provider received the data; do not blindly
          resubmit.
        </p>
      )}
      <div className="ai-consent-actions">
        {consumed ? (
          <>
            <Notice type="warning">
              This one-use consent has been submitted.{" "}
              {busy
                ? "The operation is in progress. Leaving does not undo an external transfer."
                : "No automatic retry is allowed. Inspect local records and provider usage before preparing any new request."}
            </Notice>
            {!busy && (
              <button className="button secondary full" onClick={onClose}>
                Close and inspect local records
              </button>
            )}
          </>
        ) : (
          <>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={authorized}
                onChange={(e) => setAuthorized(e.target.checked)}
                disabled={!m.executionAvailable || stale || busy}
              />
              {local
                ? "I confirm this exact local-only lookup."
                : "I authorize this bound request and its disclosed data categories to the listed providers, within the stated request budget, and understand the retention and potential charges."}
            </label>
            <button
              className="button primary full"
              disabled={busy || !authorized || !m.executionAvailable || stale}
              onClick={onConfirm}
            >
              {busy ? (
                <Busy label="Executing the approved request…" />
              ) : (
                <>
                  {local ? "Run local lookup" : "Confirm this data transfer"}
                  <ShieldCheck size={17} />
                </>
              )}
            </button>
            <button className="text-button" disabled={busy} onClick={onBack}>
              Back to edit the request
            </button>
          </>
        )}
      </div>
    </div>
  );
}
function SourceList({ sources }: { sources: AiSource[] }) {
  return (
    <div className="ai-source-list">
      {sources.map((source, i) => {
        const url = safeExternalUrl(source.url);
        return (
          <article key={`${source.url}-${i}`}>
            <span className="citation-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <h5>{source.title}</h5>
              <p>{source.excerpt}</p>
              {url ? (
                <a
                  className="text-button"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Inspect source <ArrowUpRight size={14} />
                </a>
              ) : (
                <small>{source.url}</small>
              )}
              {source.version && <small>Version {source.version}</small>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
function DraftReview({
  draft: d,
  snapshot,
  busy,
  onApprove,
  onReject,
  onPoll,
}: {
  draft: AiDraft;
  snapshot: Snapshot;
  busy: boolean;
  onApprove: (
    approval: Omit<AiDraftApproval, "expectedVersion">,
  ) => Promise<boolean>;
  onReject: (reason: string) => Promise<void>;
  onPoll: () => void;
}) {
  const [mode, setMode] = useState<"inspect" | "approve" | "reject">("inspect");
  return (
    <div className="ai-draft-review">
      <div className="ai-draft-heading">
        <div>
          <span className="eyebrow">
            {providerLabels[d.provider]} · {d.kind.replaceAll("_", " ")}
          </span>
          <h3>{d.title}</h3>
          <small>
            Created {dateTime(d.createdAt)} · {d.id}
          </small>
        </div>
        <span className={`badge ai-draft-${d.status}`}>
          {d.status.replaceAll("_", " ")}
        </span>
      </div>
      <Notice type="warning">
        {d.notice ||
          "Provider output is untrusted evidence. Review and correct it before approving."}
      </Notice>
      <h4 className="section-label">ORIGINAL DRAFT — UNTRUSTED TEXT</h4>
      <pre className="ai-draft-content">
        {d.content || "No reviewable content is available yet."}
      </pre>
      {d.sources.length > 0 && (
        <>
          <h4 className="section-label">ATTRIBUTED SOURCES</h4>
          <SourceList sources={d.sources} />
        </>
      )}
      {d.approvedEntityId && (
        <Notice type="success">
          Approved entity: <code>{d.approvedEntityId}</code>.{" "}
          {d.reviewedAt && `Reviewed ${dateTime(d.reviewedAt)}.`}
        </Notice>
      )}
      {d.status === "processing" && (
        <button
          className="button secondary full"
          disabled={busy}
          onClick={onPoll}
        >
          Preview one separately consented status request
          <RefreshCw size={16} />
        </button>
      )}
      {d.status === "needs_review" && (
        <>
          <div className="ai-review-tabs filter-tabs">
            <button
              className={mode === "inspect" ? "active" : ""}
              onClick={() => setMode("inspect")}
            >
              Inspect only
            </button>
            <button
              className={mode === "approve" ? "active" : ""}
              onClick={() => setMode("approve")}
            >
              Review & approve
            </button>
            <button
              className={mode === "reject" ? "active" : ""}
              onClick={() => setMode("reject")}
            >
              Reject draft
            </button>
          </div>
          {mode === "inspect" && (
            <Notice>
              Reviewing this record makes no change. Choose Review & approve to
              supply the final human-reviewed fields, or reject the draft.
            </Notice>
          )}
          {mode === "approve" &&
            (d.kind === "reference_policy" ? (
              <ReferenceApproval draft={d} busy={busy} onApprove={onApprove} />
            ) : (
              <>
                <Notice>
                  <strong>Complete the food-offer facts yourself.</strong>{" "}
                  Nothing is inferred from this transcript. Approval creates an
                  offer only—not a rescue assignment. Every existing sealed,
                  shelf-stable validation still applies.
                </Notice>
                {snapshot.donors.length ? (
                  <DonationForm
                    snapshot={snapshot}
                    busy={busy}
                    onSubmit={async (_path, body) =>
                      onApprove({
                        donation: body as unknown as NonNullable<
                          AiDraftApproval["donation"]
                        >,
                      })
                    }
                  />
                ) : (
                  <Empty
                    title="Add a donor partner first."
                    description="Close this review and add the verified donor in Our community. The draft will stay here until you are ready."
                  />
                )}
              </>
            ))}
          {mode === "reject" && (
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void onReject(String(f.get("reason")));
              }}
            >
              <Field label="Why should this draft not be used?">
                <textarea
                  name="reason"
                  required
                  minLength={3}
                  maxLength={1000}
                  rows={3}
                />
              </Field>
              <button className="button danger-outline full" disabled={busy}>
                {busy ? (
                  <Busy />
                ) : (
                  <>
                    Reject without creating a record
                    <Trash2 size={16} />
                  </>
                )}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
function ReferenceApproval({
  draft,
  busy,
  onApprove,
}: {
  draft: AiDraft;
  busy: boolean;
  onApprove: (
    approval: Omit<AiDraftApproval, "expectedVersion">,
  ) => Promise<boolean>;
}) {
  const [reviewedText, setReviewedText] = useState(draft.content);
  return (
    <form
      className="form"
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void onApprove({
          referencePolicy: {
            title: String(f.get("title")),
            text: String(f.get("text")),
            scope: String(f.get("scope")) as
              | "handling"
              | "volunteer"
              | "recipient"
              | "routing"
              | "approval",
          },
        });
      }}
    >
      <Notice>
        <strong>Approve as reference material only.</strong> This will not
        install or override an authoritative policy, change a hard constraint,
        or approve a rescue assignment.
      </Notice>
      <Field label="Reviewed reference title">
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={draft.title}
        />
      </Field>
      <Field label="Reference topic">
        <select name="scope" defaultValue="handling">
          <option value="handling">Handling reference</option>
          <option value="volunteer">Volunteer reference</option>
          <option value="recipient">Recipient reference</option>
          <option value="routing">Routing reference</option>
          <option value="approval">Approval reference</option>
        </select>
      </Field>
      <Field
        label="Reviewed and corrected text"
        hint={`${reviewedText.length.toLocaleString()} / 12,000 characters. Shorten to a reviewed excerpt if needed; the original draft above is preserved.`}
      >
        <textarea
          name="text"
          rows={10}
          required
          maxLength={12000}
          value={reviewedText}
          onChange={(event) => setReviewedText(event.target.value)}
        />
      </Field>
      <label className="checkbox-field">
        <input type="checkbox" required /> I checked the source and corrected
        the content. I understand this is reference knowledge, not an
        enforceable operating rule.
      </label>
      <button
        className="button primary full"
        disabled={busy || reviewedText.length > 12000}
      >
        {busy ? (
          <Busy />
        ) : (
          <>
            Approve into the reference collection
            <Check size={17} />
          </>
        )}
      </button>
    </form>
  );
}

function OperationReceipts({ receipts }: { receipts: AiOperationReceipt[] }) {
  const labels: Record<AiOperationReceipt["status"], string> = {
    completed: "Completed",
    external_completed_local_stale: "External result; local save stale",
    partial_external_write: "Partial external write",
    outcome_unknown: "Outcome unknown",
    rejected: "Rejected",
  };
  return (
    <section className="ai-receipts panel">
      <div className="panel-title">
        <div>
          <span className="eyebrow">YOUR ACTOR-SCOPED RECORD</span>
          <h3>Operation receipts</h3>
        </div>
        <span className="badge neutral">{receipts.length} recorded</span>
      </div>
      <p>
        Inspect recorded outcomes before authorizing a new request. A timeout is
        not proof that nothing was uploaded, stored, or charged.
      </p>
      <div className="ai-receipt-list">
        {[...receipts]
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .map((receipt) => (
            <details
              className={`ai-receipt ${receipt.status === "completed" ? "" : "needs-attention"}`}
              key={receipt.id}
            >
              <summary>
                <span className="ai-receipt-icon">
                  {receipt.status === "completed" ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <Info size={18} />
                  )}
                </span>
                <span>
                  <strong>{operationLabels[receipt.operation]}</strong>
                  <small>
                    {dateTime(receipt.createdAt)} ·{" "}
                    {receipt.requestCount === 0
                      ? "No external requests"
                      : receipt.providers
                          .map((p) => providerLabels[p])
                          .join(", ") || "Provider request recorded"}
                  </small>
                </span>
                <span
                  className={
                    "badge " +
                    (receipt.status === "completed" ? "green" : "neutral")
                  }
                >
                  {labels[receipt.status]}
                </span>
                <ChevronRight size={15} />
              </summary>
              <div className="ai-receipt-body">
                <Notice
                  type={receipt.status === "completed" ? "info" : "warning"}
                >
                  {receipt.guidance}
                </Notice>
                <dl>
                  <div>
                    <dt>Receipt</dt>
                    <dd>{receipt.id}</dd>
                  </div>
                  <div>
                    <dt>Recorded request count</dt>
                    <dd>{receipt.requestCount}</dd>
                  </div>
                  <div>
                    <dt>Bound request hash</dt>
                    <dd>
                      <code>{receipt.payloadSha256}</code>
                    </dd>
                  </div>
                </dl>
                {receipt.externalRecords.length > 0 && (
                  <>
                    <h4 className="section-label">KNOWN PROVIDER RECORD IDS</h4>
                    <ul>
                      {receipt.externalRecords.map((record, i) => (
                        <li key={`${record.id}-${i}`}>
                          <strong>
                            {providerLabels[record.provider]} · {record.kind}
                          </strong>
                          <code>{record.id}</code>
                        </li>
                      ))}
                    </ul>
                    <p className="field-hint">
                      These identifiers help an authorized operator investigate
                      the provider account. They are not proof that all work
                      completed or that provider copies were deleted. This
                      screen performs no cleanup or retry.
                    </p>
                  </>
                )}
              </div>
            </details>
          ))}
      </div>
    </section>
  );
}
