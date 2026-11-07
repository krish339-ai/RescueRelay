import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, AlertTriangle, CheckCircle2, Search } from "lucide-react";
import type { Snapshot } from "@rescuerelay/shared";
import { buildPipeline, approvalPlan, acceptanceLabel, type PipelineLane } from "./pipeline";
import { windowText } from "./ui";
import type { OpenAction } from "./Workspace";

const names: Record<PipelineLane, string> = {
  recovery: "Recovery first", approval: "Awaiting approval", acceptance: "Awaiting acceptance",
  assigned: "Assigned", transit: "In transit", completed: "Completed", cancelled: "Cancelled",
};
const descriptions: Record<PipelineLane, string> = {
  recovery: "Resolve the exception with the people involved.", approval: "A current plan is ready for human review.",
  acceptance: "An assigned volunteer has not accepted yet.", assigned: "Accepted assignment. Pickup is next.",
  transit: "Food picked up. Delivery is next.", completed: "Delivery recorded. Check recipient receipt.",
  cancelled: "Closed without delivery. See the recorded reason.",
};
const active: PipelineLane[] = ["recovery", "approval", "acceptance", "assigned", "transit"];

/** Snapshot-only presentation. Every action still uses the existing server-validated detail flows. */
export function PipelineBoard({snapshot: s, onOpen, reduced}: {snapshot: Snapshot; onOpen: OpenAction; reduced: boolean}) {
  const [view, setView] = useState<"active" | "completed" | "cancelled" | "all">("active");
  const [search, setSearch] = useState("");
  const firstEntry = useRef(true);
  const buckets = buildPipeline(s);
  const attention = buckets.recovery.length + buckets.approval.length;
  const initialAttention = useRef(attention > 0);
  const visible = view === "active" ? active : view === "all" ? [...active, "completed", "cancelled"] as PipelineLane[] : [view];
  const reducedVariants = { hidden: {y: 0}, shown: {y: 0, transition: {duration: 0}} };
  const rise = reduced ? reducedVariants : { hidden: {y: 36}, shown: {y: 0, transition: {type: "spring" as const, bounce: .4, duration: .7}} };
  const matches = (id: string) => {
    const r = s.rescues.find(r => r.id === id)!;
    const d = s.donations.find(d => d.id === r.donationId);
    const donor = s.donors.find(x => x.id === d?.donorId);
    const recipient = s.recipients.find(x => x.id === r.recipientId);
    return `${id} ${d?.description || ""} ${donor?.name || ""} ${recipient?.name || ""}`.toLowerCase().includes(search.toLowerCase());
  };
  return <section className="pipeline" aria-label="Rescue pipeline">
    <motion.div className="pipeline-summary" initial={reduced ? false : "hidden"} animate="shown"
      variants={{hidden: {}, shown: {transition: {staggerChildren: reduced ? 0 : .08}}}}>
      {[
        ["Active rescues", active.reduce((sum,k) => sum + buckets[k].length, 0), "In your accessible workspace"],
        ["Needs attention", attention, "Recovery or a plan to review"],
        ["Food delivered", `${s.metrics.deliveredKg} kg`, "Recorded deliveries, all time"],
        ["Completed rescues", buckets.completed.length, "Delivery recorded, all time"],
      ].map(([label,value,sub]) => <motion.div variants={rise} className="pipeline-stat" key={label}><span>{label}</span><strong>{value}</strong><small>{sub}</small></motion.div>)}
    </motion.div>
    {attention > 0 && <motion.div className="pipeline-attention" role="status"
      onAnimationComplete={() => { initialAttention.current = false; }}
      initial={reduced || !initialAttention.current ? false : {y: -20}}
      animate={{y: 0, x: reduced || !initialAttention.current ? 0 : [0,-2,2,-1,0]}}
      transition={reduced ? {duration: 0} : {y: {type: "spring", bounce: .25, duration: .6}, x: {duration: .28, delay: .55}}}>
      <AlertTriangle size={22}/><div><strong>{attention} {attention === 1 ? "rescue needs" : "rescues need"} attention</strong>
      <p>Review the recovery lane and any current approval plans. Nothing is reassigned automatically.</p></div>
    </motion.div>}
    <div className="pipeline-toolbar">
      <div className="pipeline-views" aria-label="Pipeline views">{(["active","completed","cancelled","all"] as const).map(v =>
        <button key={v} aria-pressed={view === v} className={view === v ? "active" : ""} onClick={() => setView(v)}>
          {v === "active" ? "Active pipeline" : v === "all" ? "All rescues" : v === "completed" ? `Completed (${buckets.completed.length})` : `Cancelled (${buckets.cancelled.length})`}
        </button>)}</div>
      <label className="search-box"><Search size={17}/><input aria-label="Search pipeline" placeholder="Find a rescue…" value={search} onChange={e => setSearch(e.target.value)}/></label>
    </div>
    <motion.div className="pipeline-lanes" data-view={view} initial={reduced ? false : "hidden"} animate="shown"
      onAnimationComplete={() => {firstEntry.current = false;}}
      variants={{hidden: {}, shown: {transition: {staggerChildren: reduced ? 0 : .09}}}}>
      {visible.map(lane => <section className={`pipeline-lane lane-${lane}`} key={lane} aria-label={names[lane]}>
        <header><h2>{names[lane]}</h2><span>{buckets[lane].length}</span></header>
        <p className="lane-description">{descriptions[lane]}</p>
        {buckets[lane].filter(r => matches(r.id)).map(r => {
          const d = s.donations.find(x => x.id === r.donationId);
          const donor = s.donors.find(x => x.id === d?.donorId);
          const recipient = s.recipients.find(x => x.id === r.recipientId);
          const volunteer = s.volunteers.find(x => x.id === r.volunteerId);
          const plan = approvalPlan(r,s);
          return <motion.article variants={rise} initial={firstEntry.current && !reduced ? undefined : false} className="pipeline-card" key={r.id}>
            <span className={`pipeline-badge badge-${lane}`}>{r.status === "escalated" ? "Escalated" : names[lane]}</span>
            <h3>{donor?.name || "Donor unavailable"}</h3>
            <p className="pipeline-destination"><ArrowRight size={14}/>{recipient?.name || "Recipient unavailable"}</p>
            <p>{d?.description || "Food offer unavailable"}</p>
            <div className="pipeline-card-facts"><strong>{d ? `${d.weightKg} kg` : "Weight unavailable"}</strong>{d && <span> · {d.servings} est. servings</span>}<p>Pickup {d ? windowText(d.pickupWindow) : "window unavailable"}</p></div>
            {!volunteer && r.volunteerId && <p className="pipeline-person">Volunteer assigned · details restricted</p>}
            {volunteer && <p className="pipeline-person">{volunteer.name}{acceptanceLabel(r)}</p>}
            {r.custodyHeld && <p className="pipeline-warning">Food custody held — coordinate a safe handoff.</p>}
            {r.status === "delivered" && <p className="pipeline-person">{r.recipientConfirmedAt ? "Recipient receipt confirmed" : "Recipient receipt not yet confirmed"}</p>}
            {r.status === "cancelled" && <p>{r.cancellationReason || "No cancellation reason recorded."}</p>}
            <button className="pipeline-open" onClick={() => onOpen("rescueDetail", r.id)}>Open rescue <ArrowUpRight size={17}/></button>
            {plan && s.user.role === "coordinator" && <button className="pipeline-plan" onClick={() => onOpen("plan", plan.id)}>Review approval plan <ArrowRight size={16}/></button>}
          </motion.article>;
        })}
        {!buckets[lane].filter(r => matches(r.id)).length && <div className="lane-empty"><CheckCircle2 size={21}/><span>{search ? "No matching rescues" : "Nothing here right now"}</span></div>}
      </section>)}
    </motion.div>
    <p className="pipeline-footnote">{s.rescues.length} accessible rescues · Status lanes are not drag-and-drop. Open a rescue for validated actions. Approval eligibility reflects the last saved snapshot; the server rechecks before applying.</p>
  </section>;
}
