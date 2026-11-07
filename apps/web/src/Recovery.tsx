import { useState } from "react";
import {
  ArrowRight,
  Check,
  Clock,
  FileText,
  ShieldCheck,
  TriangleAlert,
  X,
  ChevronDown,
} from "lucide-react";
import type { RecoveryPlan, Snapshot } from "@rescuerelay/shared";
import { Notice, time, dateTime, Busy } from "./ui";
export function RecoveryReview({
  plan,
  snapshot,
  busy,
  onApprove,
  onRegenerate,
  onInvestigate,
  onEscalate,
}: {
  plan: RecoveryPlan;
  snapshot: Snapshot;
  busy: boolean;
  onApprove: () => void;
  onRegenerate: () => void;
  onInvestigate: () => void;
  onEscalate: (id: string) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const stale =
    plan.baseVersion !== snapshot.version && plan.status !== "applied";
  const expired = new Date(plan.expiresAt).getTime() < Date.now();
  return (
    <div className="recovery-review">
      <div className={`plan-summary ${plan.status}`}>
        <span className="plan-symbol">
          {plan.status === "infeasible" ? <TriangleAlert /> : <ShieldCheck />}
        </span>
        <div>
          <div className="eyebrow">
            {plan.status === "applied"
              ? "APPROVED & RECORDED"
              : plan.status === "infeasible"
                ? "HUMAN FOLLOW-UP NEEDED"
                : "YOUR DECISION. THE EVIDENCE IS HERE."}
          </div>
          <h3>
            {plan.status === "applied"
              ? "The new plan is in motion."
              : plan.status === "infeasible"
                ? "No feasible route. No forced match."
                : `${plan.replacements.length} proposed reassignment${plan.replacements.length === 1 ? "" : "s"}.`}
          </h3>
          <p>{plan.summary}</p>
        </div>
      </div>
      <div className="plan-meta">
        <span>
          <Clock size={14} /> Created {time(plan.createdAt)}
        </span>
        <span>Expires {time(plan.expiresAt)}</span>
        <span className="badge neutral">
          {plan.explanationMode === "offline-bounded"
            ? "Deterministic planner"
            : "Provider-assisted investigation"}
        </span>
      </div>
      {stale && (
        <Notice type="warning">
          <strong>This proposal is out of date.</strong> Workspace data changed
          after it was generated. Refresh the plan and review the new changes;
          approval will not be replayed automatically.
        </Notice>
      )}
      {expired && plan.status !== "applied" && (
        <Notice type="warning">
          This proposal has expired. Generate a new plan before approving.
        </Notice>
      )}
      {plan.replacements.length > 0 && (
        <section>
          <h4 className="section-label">
            EXACT CHANGES{" "}
            {plan.status === "applied" ? "APPLIED" : "FOR YOUR APPROVAL"}
          </h4>
          <div className="replacement-list">
            {plan.replacements.map((r) => {
              const rescue = snapshot.rescues.find((x) => x.id === r.rescueId);
              const donation = snapshot.donations.find(
                (x) => x.id === rescue?.donationId,
              );
              const volunteer = snapshot.volunteers.find(
                (x) => x.id === r.volunteerId,
              );
              return (
                <div className="replacement" key={r.rescueId}>
                  <div>
                    <strong>{donation?.description || r.rescueId}</strong>
                    <small>{rescue?.id}</small>
                  </div>
                  <ArrowRight size={18} />
                  <div>
                    <strong>{volunteer?.name || r.volunteerId}</strong>
                    <small>
                      Pickup {time(r.pickupEta)} · Delivery{" "}
                      {time(r.deliveryEta)}
                    </small>
                    <small>{r.travelMinutes} min estimated travel</small>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="field-hint">
            Approval changes only these assignments and estimated times, and
            writes an audit event plus in-app notifications. No SMS, email,
            push, or external dispatch is sent.
          </p>
        </section>
      )}
      <section>
        <div className="section-label-row">
          <h4 className="section-label">CANDIDATES & CONSTRAINTS</h4>
          <span>{plan.candidates.length} evaluated</span>
        </div>
        <div className="candidate-list">
          {plan.candidates.map((c, i) => (
            <details
              key={`${c.rescueId}-${c.volunteerId}-${i}`}
              className={`candidate ${c.feasible ? "feasible" : "rejected"}`}
            >
              <summary>
                <span className="candidate-mark">
                  {c.feasible ? <Check size={16} /> : <X size={16} />}
                </span>
                <span>
                  <strong>{c.volunteerName}</strong>
                  <small>
                    {c.rescueId} · {c.travelMinutes} min ·{" "}
                    {c.routeSource === "synthetic-matrix"
                      ? "Synthetic travel matrix"
                      : "Distance estimate"}
                  </small>
                </span>
                <span className={"badge " + (c.feasible ? "green" : "neutral")}>
                  {c.feasible ? "Eligible" : "Rejected"}
                </span>
                <ChevronDown size={15} />
              </summary>
              <div className="candidate-checks">
                {c.checks.map((check, n) => (
                  <div key={n} className={check.passed ? "pass" : "fail"}>
                    {check.passed ? <Check size={14} /> : <X size={14} />}
                    <span>
                      <strong>{check.rule}</strong> — {check.detail}
                    </span>
                  </div>
                ))}
                {c.reasons.map((reason, n) => (
                  <p key={n}>{reason}</p>
                ))}
                <small>
                  Estimated pickup {dateTime(c.pickupEta)} · delivery{" "}
                  {dateTime(c.deliveryEta)} · ranking score {c.score.toFixed(2)}
                </small>
              </div>
            </details>
          ))}
        </div>
        {!plan.candidates.length && (
          <Notice>
            No eligible candidate records were available for comparison.
          </Notice>
        )}
      </section>
      <section>
        <h4 className="section-label">RETRIEVED POLICY EVIDENCE</h4>
        <p className="field-hint">
          Inspect the source snippets used for this plan. Constraints remain
          enforced by code, independent of any explanation.
        </p>
        <div className="citation-grid">
          {plan.citations.map((c, i) => (
            <article className="citation" key={`${c.policyId}-${i}`}>
              <div>
                <span className="citation-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <FileText size={17} />
              </div>
              <h5>{c.title}</h5>
              <p>“{c.excerpt}”</p>
              <small>
                {c.source} · v{c.version}
              </small>
            </article>
          ))}
        </div>
      </section>
      {plan.warnings.length > 0 && (
        <Notice type="warning">
          <ul>
            {plan.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}
      {plan.escalations.length > 0 && (
        <section>
          <h4 className="section-label">UNRESOLVED RESCUES</h4>
          {plan.escalations.map((x, i) => (
            <p key={i}>{x}</p>
          ))}
          {plan.incidentIds
            .filter((id) => !plan.replacements.some((r) => r.rescueId === id))
            .map((id) => (
              <button
                className="button secondary"
                key={id}
                disabled={busy}
                onClick={() => onEscalate(id)}
              >
                Escalate {id} to coordinator review <ArrowRight size={16} />
              </button>
            ))}
        </section>
      )}
      <details className="trace">
        <summary>
          How this plan was built <span>{plan.trace.length} steps</span>
          <ChevronDown size={15} />
        </summary>
        <ol>
          {plan.trace.map((t, i) => (
            <li key={i}>
              <span>{String(t.step).padStart(2, "0")}</span>
              <div>
                <strong>{t.tool.replaceAll("_", " ")}</strong>
                <p>{t.reason}</p>
                <small>{t.result}</small>
              </div>
            </li>
          ))}
        </ol>
      </details>
      {snapshot.capabilities.providerConfigured &&
        plan.status !== "applied" && (
          <div className="provider-investigation">
            <Notice>
              Optional: send this rescue’s context and relevant policies to your
              operator-configured model provider for a bounded, read-only
              investigation. Deterministic checks and your separate approval
              still control every assignment.
            </Notice>
            <button
              className="button secondary"
              disabled={busy}
              onClick={onInvestigate}
            >
              Run a fresh provider-assisted investigation
            </button>
          </div>
        )}
      <div className="approval-box">
        {plan.status === "applied" ? (
          <Notice type="success">
            <strong>
              Approved at{" "}
              {plan.appliedAt ? dateTime(plan.appliedAt) : "the recorded time"}.
            </strong>{" "}
            The assignments, audit log, and in-app outbox are updated.
          </Notice>
        ) : plan.status === "infeasible" || stale || expired ? (
          <button
            className="button primary full"
            disabled={busy}
            onClick={onRegenerate}
          >
            {busy ? (
              <Busy />
            ) : (
              <>
                Re-evaluate current constraints
                <ArrowRight size={17} />
              </>
            )}
          </button>
        ) : (
          <>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              I have reviewed the proposed assignments, timing, and policy
              evidence.
            </label>
            <button
              className="button primary full"
              disabled={!confirmed || busy}
              onClick={onApprove}
            >
              {busy ? (
                <Busy label="Recording approval…" />
              ) : (
                <>
                  Approve {plan.replacements.length} reassignment
                  {plan.replacements.length === 1 ? "" : "s"}
                  <Check size={17} />
                </>
              )}
            </button>
            <small>
              Nothing changes until you approve. Approval is version-checked and
              recorded.
            </small>
          </>
        )}
      </div>
    </div>
  );
}
