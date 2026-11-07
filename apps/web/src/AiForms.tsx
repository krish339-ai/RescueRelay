import { useState, type FormEvent } from "react";
import { ArrowRight, FileUp, Mic, ShieldCheck } from "lucide-react";
import type {
  AiCapabilities,
  AiDraft,
  AiMemory,
  AiOperation,
  AiOperationInput,
  Snapshot,
  Policy,
} from "@rescuerelay/shared";
import { Field, Notice, Busy } from "./ui";
import {
  encodeAiFile,
  MAX_AI_FILE_BYTES,
  providerLabels,
  sourceDiscoveryRequest,
  policyIndexRequest,
} from "./ai-values";
export function AiOperationForm({
  operation,
  capabilities,
  snapshot,
  memories,
  references,
  referenceId,
  draft,
  busy,
  onPrepare,
}: {
  operation: AiOperation;
  capabilities: AiCapabilities;
  snapshot: Snapshot;
  memories: AiMemory[];
  references: Policy[];
  referenceId?: string;
  draft?: AiDraft;
  busy: boolean;
  onPrepare: (request: AiOperationInput) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [encoding, setEncoding] = useState(false);
  const [prefType, setPrefType] = useState<
    "communication_style" | "ui_density"
  >("communication_style");
  const [file, setFile] = useState<File | null>(null);
  const [sourceProvider, setSourceProvider] = useState<"tavily" | "keenable">(
    "tavily",
  );
  const pendingRescues = snapshot.rescues.filter(
    (r) => r.status === "needs_recovery",
  );
  const disabled = busy || encoding;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) || "").trim();
    let request: AiOperationInput;
    try {
      switch (operation) {
        case "investigate": {
          const ids = form.getAll("rescueIds").map(String);
          if (!ids.length)
            throw new Error("Select at least one rescue awaiting recovery.");
          request = {
            operation,
            input: {
              provider: text("provider") as "fireworks" | "nebius" | "openai",
              rescueIds: ids,
              usePinecone: form.has("usePinecone"),
              trace: form.has("trace"),
            },
          };
          break;
        }
        case "policy_index": {
          request = policyIndexRequest(
            form.getAll("referenceIds").map(String),
            references.map((reference) => reference.id),
          );
          break;
        }
        case "policy_search":
          request = { operation, input: { query: text("query") } };
          break;
        case "source_discovery": {
          request = sourceDiscoveryRequest(
            text("sourceProvider") as "tavily" | "keenable",
            text("query"),
            form.getAll("domains").map(String),
            capabilities.allowedResearchDomains,
          );
          break;
        }
        case "preference_recall":
          request = { operation, input: { query: text("query") } };
          break;
        case "preference_save":
          request = {
            operation,
            input: {
              preferenceType: prefType,
              value: text("value") as
                | "concise"
                | "detailed"
                | "comfortable"
                | "compact",
            },
          };
          break;
        case "preference_forget":
          request = { operation, input: { memoryId: text("memoryId") } };
          break;
        case "document_poll":
          if (!draft) throw new Error("Select the document draft to check.");
          request = { operation, input: { draftId: draft.id } };
          break;
        case "document_upload":
        case "voice_transcribe": {
          if (!file) throw new Error("Choose a file first.");
          setEncoding(true);
          const contentBase64 = await encodeAiFile(
            file,
            capabilities.maximumFileBytes,
          );
          const title = text("title");
          if (operation === "document_upload") {
            const mimeType =
              file.type === "application/pdf" ||
              file.name.toLowerCase().endsWith(".pdf")
                ? "application/pdf"
                : "text/plain";
            request = {
              operation,
              input: { filename: file.name, mimeType, contentBase64, title },
            };
          } else {
            const extension = file.name.split(".").pop()?.toLowerCase();
            const mimeType = (
              {
                mp3: "audio/mpeg",
                wav: "audio/wav",
                m4a: "audio/mp4",
                mp4: "audio/mp4",
                webm: "audio/webm",
              } as const
            )[extension as "mp3" | "wav" | "m4a" | "mp4" | "webm"];
            if (!mimeType)
              throw new Error("Use an MP3, WAV, M4A, MP4, or WebM audio file.");
            request = {
              operation,
              input: { filename: file.name, mimeType, contentBase64, title },
            };
          }
          break;
        }
        default:
          throw new Error("Unsupported operation.");
      }
      await onPrepare(request);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This request could not be prepared.",
      );
    } finally {
      setEncoding(false);
    }
  }
  return (
    <form className="form ai-operation-form" onSubmit={submit}>
      {error && (
        <div className="dialog-error" role="alert">
          {error}
        </div>
      )}
      {operation === "investigate" && (
        <>
          <Notice>
            <strong>A proposal, never a dispatch.</strong> The selected model
            can inspect allowlisted rescue context and policies. Deterministic
            checks still decide eligibility. Any resulting plan requires
            separate coordinator approval.
          </Notice>
          <Field label="Reasoning provider">
            <select name="provider" defaultValue="fireworks">
              {(["fireworks", "nebius", "openai"] as const).map((id) => {
                const cap = capabilities.providers.find(
                  (c) => c.provider === id,
                );
                return (
                  <option key={id} value={id}>
                    {providerLabels[id]} ·{" "}
                    {cap?.available
                      ? "available with consent"
                      : "not enabled or configured"}
                  </option>
                );
              })}
            </select>
          </Field>
          <fieldset className="form-fieldset">
            <legend>Rescues to investigate</legend>
            {pendingRescues.length ? (
              pendingRescues.map((r) => (
                <label className="checkbox-field" key={r.id}>
                  <input
                    type="checkbox"
                    name="rescueIds"
                    value={r.id}
                    defaultChecked
                  />
                  <span>
                    {snapshot.donations.find((d) => d.id === r.donationId)
                      ?.description || r.id}
                    <small className="ai-input-hint">{r.id}</small>
                  </span>
                </label>
              ))
            ) : (
              <p className="field-hint">
                No rescues are awaiting recovery. Create an unassigned rescue or
                record an actual interruption before investigating.
              </p>
            )}
          </fieldset>
          <label className="checkbox-field">
            <input type="checkbox" name="usePinecone" />
            <span>
              Include optional Pinecone policy retrieval
              <small className="ai-input-hint">
                External references cannot alter the hard constraints.
              </small>
            </span>
          </label>
          <label className="checkbox-field">
            <input type="checkbox" name="trace" />
            <span>
              Include a redacted LangSmith trace
              <small className="ai-input-hint">
                A separate disclosed transfer of operational metrics, not raw
                food notes, contact details, or uploaded files.
              </small>
            </span>
          </label>
        </>
      )}
      {operation === "policy_index" && (
        <>
          <Notice type="warning">
            <strong>A separate transfer of approved reference text.</strong>{" "}
            Only human-approved references may be sent to the existing
            configured Pinecone document index. This does not provision an index
            or change authoritative constraints. Repeating an upsert can incur
            embedding charges.
          </Notice>
          <fieldset className="form-fieldset">
            <legend>Approved references (select one to five)</legend>
            {references.length ? (
              references.map((reference) => (
                <label className="checkbox-field" key={reference.id}>
                  <input
                    type="checkbox"
                    name="referenceIds"
                    value={reference.id}
                    defaultChecked={reference.id === referenceId}
                  />
                  <span>
                    {reference.title}
                    <small className="ai-input-hint">
                      {reference.id} · v{reference.version}
                    </small>
                  </span>
                </label>
              ))
            ) : (
              <p className="field-hint">
                Approve a reference draft before preparing indexing. Configured
                hard policies cannot be selected here.
              </p>
            )}
          </fieldset>
          <p className="field-hint">
            The next preview includes the approved chunks and namespace bound to
            this request. An accepted upsert can take time to become searchable;
            acceptance is not proof of immediate retrieval visibility.
          </p>
        </>
      )}
      {operation === "policy_search" && (
        <>
          <Notice>
            Search policy evidence. If remote retrieval is unavailable, the
            preview will explicitly offer a local-only lookup instead. Search
            results never change an assignment or authoritative constraint.
          </Notice>
          <Field label="What policy evidence do you need?">
            <textarea
              name="query"
              required
              minLength={3}
              maxLength={500}
              rows={4}
              placeholder="Which constraints apply to a replacement volunteer?"
            />
          </Field>
        </>
      )}
      {operation === "source_discovery" && (
        <>
          <Notice type="warning">
            Use public, non-personal research terms. Don’t include donor
            addresses, recipient identities, personal records, or unpublished
            incident details. Results create reference drafts, not operating
            policy.
          </Notice>
          <Field
            label="Source-discovery provider"
            hint="Only the selected provider receives this request. There is no automatic external fallback."
          >
            <select
              name="sourceProvider"
              value={sourceProvider}
              onChange={(event) =>
                setSourceProvider(event.target.value as "tavily" | "keenable")
              }
            >
              {(["tavily", "keenable"] as const).map((provider) => (
                <option key={provider} value={provider}>
                  {providerLabels[provider]} ·{" "}
                  {capabilities.providers.find((p) => p.provider === provider)
                    ?.available
                    ? "available with consent"
                    : "not enabled or configured"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Research question">
            <textarea
              name="query"
              required
              minLength={3}
              maxLength={500}
              rows={4}
              placeholder="Public guidance on coordinating volunteer food pickups"
            />
          </Field>
          <fieldset className="form-fieldset">
            <legend>
              {sourceProvider === "keenable"
                ? "Operator-approved domain (choose exactly one)"
                : "Operator-approved domains (select up to six)"}
            </legend>
            {capabilities.allowedResearchDomains.length ? (
              capabilities.allowedResearchDomains.map((domain, index) => (
                <label
                  className="checkbox-field"
                  key={`${sourceProvider}-${domain}`}
                >
                  <input
                    type={sourceProvider === "keenable" ? "radio" : "checkbox"}
                    name="domains"
                    value={domain}
                    defaultChecked={
                      sourceProvider === "keenable" ? index === 0 : index < 6
                    }
                  />
                  {domain}
                </label>
              ))
            ) : (
              <p className="field-hint">
                No research domains are approved by the server operator. Inspect
                Tavily setup requirements before preparing a request.
              </p>
            )}
          </fieldset>
        </>
      )}
      {operation.startsWith("preference_") && (
        <Notice>
          <strong>Personal and noncritical only.</strong> Mem0 preferences are
          scoped to your actor and organization. They are advisory—not
          availability, capacity, medical, allergen, food-safety, or routing
          instructions.
        </Notice>
      )}
      {operation === "preference_recall" && (
        <Field label="Preference lookup">
          <input
            name="query"
            required
            minLength={2}
            maxLength={200}
            placeholder="My preferred response style"
          />
        </Field>
      )}
      {operation === "preference_save" && (
        <>
          <Field label="Preference type">
            <select
              value={prefType}
              onChange={(e) => setPrefType(e.target.value as typeof prefType)}
            >
              <option value="communication_style">Communication style</option>
              <option value="ui_density">Interface density preference</option>
            </select>
          </Field>
          <Field label="Preference value">
            <select
              name="value"
              key={prefType}
              defaultValue={
                prefType === "communication_style" ? "concise" : "comfortable"
              }
            >
              {(prefType === "communication_style"
                ? ["concise", "detailed"]
                : ["comfortable", "compact"]
              ).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
          <p className="field-hint">
            Saving records this preference only. It does not automatically
            restyle the app or change operational decisions.
          </p>
        </>
      )}
      {operation === "preference_forget" && (
        <Field label="Your saved preference">
          <select name="memoryId" required defaultValue="">
            <option value="" disabled>
              Select an app-owned memory
            </option>
            {memories.map((m) => (
              <option key={m.id} value={m.id}>
                {m.preferenceType.replaceAll("_", " ")}: {m.value}
              </option>
            ))}
          </select>
          {!memories.length && (
            <small>No app-owned preferences are available to delete.</small>
          )}
        </Field>
      )}
      {(operation === "document_upload" ||
        operation === "voice_transcribe") && (
        <>
          <Notice type="warning">
            <strong>Your file may contain sensitive information.</strong> Only
            use material you are authorized to share. Preparation sends it to
            your RescueRelay server for hashing; the next step previews any
            external transfer. Provider retention and charges still apply.
          </Notice>
          <Field
            label={
              operation === "document_upload"
                ? "Document title"
                : "Voice note title"
            }
          >
            <input
              name="title"
              required
              minLength={2}
              maxLength={150}
              placeholder={
                operation === "document_upload"
                  ? "Volunteer handbook reference"
                  : "Draft food offer notes"
              }
            />
          </Field>
          <label className="ai-file-picker">
            {operation === "document_upload" ? (
              <FileUp size={27} />
            ) : (
              <Mic size={27} />
            )}
            <strong>
              {file
                ? file.name
                : operation === "document_upload"
                  ? "Choose a PDF or text document"
                  : "Choose an audio recording"}
            </strong>
            <span>
              {file
                ? `${(file.size / 1024).toFixed(1)} KiB`
                : `Maximum ${Math.min(capabilities.maximumFileBytes, MAX_AI_FILE_BYTES) / 1024 / 1024} MiB · no automatic upload`}
            </span>
            <input
              type="file"
              required
              accept={
                operation === "document_upload"
                  ? ".pdf,.txt,application/pdf,text/plain"
                  : ".mp3,.wav,.m4a,.mp4,.webm,audio/mpeg,audio/wav,audio/mp4,audio/webm"
              }
              onChange={(e) => {
                setError("");
                const selected = e.target.files?.[0] || null;
                if (
                  selected &&
                  selected.size >
                    Math.min(capabilities.maximumFileBytes, MAX_AI_FILE_BYTES)
                ) {
                  setError("Choose a file no larger than 2 MiB.");
                  setFile(null);
                  e.target.value = "";
                } else if (
                  selected &&
                  (selected.name.length > 150 ||
                    !/^[a-zA-Z0-9_. -]+$/.test(selected.name))
                ) {
                  setError(
                    "Rename the file using letters, numbers, spaces, dots, underscores, or hyphens (at most 150 characters).",
                  );
                  setFile(null);
                  e.target.value = "";
                } else if (
                  selected &&
                  operation === "document_upload" &&
                  !/\.(pdf|txt)$/i.test(selected.name)
                ) {
                  setError("Use a PDF or plain-text (.txt) document.");
                  setFile(null);
                  e.target.value = "";
                } else setFile(selected);
              }}
            />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" required /> I have permission to submit this
            file and have removed unnecessary personal data.
          </label>
          <p className="field-hint">
            {operation === "document_upload"
              ? "Parsing creates a reference draft for human review. It never installs a new hard constraint."
              : "Transcription creates a reviewable note. Donor IDs, quantities, sealed status, pickup windows, and assignments are never inferred or auto-filled."}
          </p>
        </>
      )}
      {operation === "document_poll" && draft && (
        <>
          <Notice>
            Check the status of <strong>{draft.title}</strong> with one
            separately authorized provider request. There is no automatic
            polling or repeated paid lookup.
          </Notice>
          <div className="ai-job-reference">
            <strong>{draft.title}</strong>
            <small>
              Draft {draft.id} · currently {draft.status}
            </small>
          </div>
        </>
      )}
      <button
        className="button primary full"
        type="submit"
        disabled={
          disabled ||
          (operation === "investigate" && !pendingRescues.length) ||
          (operation === "policy_index" && !references.length) ||
          (operation === "source_discovery" &&
            !capabilities.allowedResearchDomains.length) ||
          (operation === "preference_forget" && !memories.length)
        }
      >
        {disabled ? (
          <Busy
            label={
              encoding ? "Preparing local file preview…" : "Preparing preview…"
            }
          />
        ) : (
          <>
            Preview request & data scope <ArrowRight size={17} />
          </>
        )}
      </button>
      <p className="ai-local-note">
        <ShieldCheck size={14} /> This step makes no external provider call.
      </p>
    </form>
  );
}
