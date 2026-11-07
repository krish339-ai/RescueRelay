import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PipelineBoard } from "./PipelineBoard";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarClock,
  Check,
  ChevronRight,
  Clock,
  FileText,
  HeartHandshake,
  Inbox,
  Leaf,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sprout,
  Truck,
  Users,
  Activity,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  Settings,
  Smartphone,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import type {
  Snapshot,
  Rescue,
  Donation,
  Volunteer,
  Recipient,
  RecoveryPlan,
} from "@rescuerelay/shared";
import { Brand, RouteSketch } from "./brand";
import {
  Status,
  Empty,
  Notice,
  windowText,
  time,
  dateTime,
  initials,
} from "./ui";
export type Tab =
  | "dispatch"
  | "rescues"
  | "offers"
  | "partners"
  | "policies"
  | "activity"
  | "settings"
  | "availability"
  | "receiving"
  | "updates"
  | "ai";
export type OpenAction = (type: string, id?: string) => void;
const labels: Record<Tab, string> = {
  dispatch: "Overview",
  rescues: "Rescues",
  offers: "Food offers",
  partners: "Our community",
  policies: "Policy library",
  activity: "Activity & outbox",
  settings: "Workspace",
  availability: "My availability",
  receiving: "My kitchen",
  updates: "Updates",
  ai: "AI Studio",
};
export function Workspace({
  snapshot,
  tab,
  setTab,
  onOpen,
  onRefresh,
  onLogout,
  onDemo,
  busy,
  offline,
  syncIssue,
  onGenerate,
  onExport,
  onRead,
  onAction,
  aiContent,
}: {
  snapshot: Snapshot;
  tab: Tab;
  setTab: (t: Tab) => void;
  onOpen: OpenAction;
  onRefresh: () => void;
  onLogout: () => void;
  onDemo: () => void;
  busy: boolean;
  offline: boolean;
  syncIssue: boolean;
  onGenerate: () => void;
  onExport: (kind: "donations" | "audit") => void;
  onRead: (id: string) => void;
  onAction: (path: string, body?: Record<string, unknown>) => void;
  aiContent?: ReactNode;
}) {
  const systemReduced = useReducedMotion();
  const [motionOff, setMotionOff] = useState(() => {
    try { return localStorage.getItem("rescuerelay.reduce-motion") === "true"; } catch { return false; }
  });
  const reduced = !!systemReduced || motionOff;
  const contentRef = useRef<HTMLElement>(null);
  const previousTab = useRef(tab);
  useEffect(() => {
    if (previousTab.current !== tab) contentRef.current?.focus({ preventScroll: true });
    previousTab.current = tab;
  }, [tab]);
  const coordinator = snapshot.user.role === "coordinator";
  const nav: Tab[] = coordinator
    ? [
        "dispatch",
        "rescues",
        "offers",
        "partners",
        "policies",
        "activity",
        "ai",
        "settings",
      ]
    : snapshot.user.role === "volunteer"
      ? ["rescues", "availability", "updates"]
      : ["rescues", "receiving", "updates"];
  const groups: {label: string; tabs: Tab[]}[] = coordinator ? [
    { label: "Today", tabs: ["dispatch"] },
    { label: "Dispatch", tabs: ["rescues", "offers"] },
    { label: "Network", tabs: ["partners"] },
    { label: "Impact", tabs: ["activity"] },
    { label: "Workspace", tabs: ["policies", "ai", "settings"] },
  ] : [
    { label: "My rescues", tabs: ["rescues"] },
    { label: snapshot.user.role === "volunteer" ? "Availability" : "My kitchen", tabs: [snapshot.user.role === "volunteer" ? "availability" : "receiving"] },
    { label: "Updates", tabs: ["updates"] },
  ];
  const group = groups.find(g => g.tabs.includes(tab)) || groups[0];
  return (
    <div className="workspace pipeline-workspace">
      <a className="skip-link" href="#workspace-content">
        Skip to workspace
      </a>
      <header className="relay-topbar">
        <Brand />
        <nav aria-label="Workspace sections" className="relay-primary-nav">
          {groups.map(g => <button key={g.label} className={group === g ? "active" : ""}
            aria-current={group === g ? "true" : undefined} onClick={() => setTab(g.tabs[0])}>
            {group === g && <motion.span className="organic-active" aria-hidden="true"
              initial={reduced ? false : {scaleY: 0}} animate={{scaleY: 1}}
              transition={{type: "spring", bounce: .4, duration: .65}} />}
            <span>{g.label}</span>
          </button>)}
        </nav>
        <div className="relay-identity"><span className="avatar">{initials(snapshot.user.name)}</span>
          <span><strong>{snapshot.user.name}</strong><small>{snapshot.user.role}</small></span>
          <button className="icon-button" onClick={onLogout} disabled={busy} aria-label="Log out"><LogOut size={18}/></button>
        </div>
      </header>
      <div className="workspace-main">
        <header className="workspace-header">
          <nav className="relay-secondary-nav" aria-label={`${group.label} pages`}>
            {group.tabs.filter(t => nav.includes(t)).map(t => <button key={t}
              className={tab === t ? "active" : ""} aria-current={tab === t ? "page" : undefined}
              onClick={() => setTab(t)}>{labels[t]}</button>)}
          </nav>
          <div className="header-actions">
            <label className="motion-control"><input type="checkbox" checked={reduced} disabled={!!systemReduced}
              onChange={e => {setMotionOff(e.target.checked); try {localStorage.setItem("rescuerelay.reduce-motion", String(e.target.checked));} catch { /* preference remains session-local */ }}} />
              Reduce motion{systemReduced ? " (system)" : ""}</label>
            <button className="icon-button" onClick={() => onOpen("install")} aria-label="Install app"><Smartphone size={18}/></button>

            <span
              className={`connection-indicator ${offline ? "offline" : ""}`}
              title="Browser network status only, not confirmation that the API is reachable. The footer shows the last successful data refresh."
            >
              <i />
              {offline ? "Browser offline" : "Browser online"}
            </span>
            <button
              className="icon-button"
              aria-label="Refresh workspace"
              onClick={onRefresh}
              disabled={busy || offline}
            >
              <RefreshCw size={17} className={busy ? "spin" : ""} />
            </button>
            <button
              className="icon-button notification-button"
              aria-label={`Updates, ${snapshot.notifications.filter((n) => !n.read && n.audience === snapshot.user.role).length} unread`}
              onClick={() => onOpen("notifications")}
            >
              <Bell size={18} />
              {snapshot.notifications.some(
                (n) => !n.read && n.audience === snapshot.user.role,
              ) && <i />}
            </button>
          </div>
        </header>
        {snapshot.organization.demo && (
          <div className="demo-banner">
            <span>
              <span className="demo-tag">LOCAL DEMO</span> Synthetic people &
              food. Persistent sandbox data. No external messages.
            </span>
            <button onClick={onDemo} disabled={busy}>
              Switch role <ArrowRight size={13} />
            </button>
          </div>
        )}
        {offline && (
          <div className="offline-banner" role="status">
            You’re offline. Viewing data already in memory. All changes are
            disabled until you reconnect.
          </div>
        )}
        {syncIssue && !offline && (
          <div className="sync-banner" role="status">
            <span>
              Latest server refresh could not be confirmed. Showing the last
              saved snapshot from {time(snapshot.serverTime)}. Refresh before
              retrying an uncertain change.
            </span>
            <button className="text-button" onClick={onRefresh} disabled={busy}>
              Refresh <RefreshCw size={14} />
            </button>
          </div>
        )}
        <main ref={contentRef} tabIndex={-1} className="workspace-content" id="workspace-content">
          <header className="page-heading">
            <div>
              <div className="eyebrow">
                {coordinator
                  ? "YOUR COMMUNITY, CONNECTED"
                  : snapshot.user.role === "volunteer"
                    ? "YOUR TIME MAKES A DIFFERENCE"
                    : "GOOD FOOD, COMING YOUR WAY"}
              </div>
              <h1>
                {tab === "dispatch" ? (
                  <>
                    Every rescue, at its next step.
                  </>
                ) : tab === "rescues" && !coordinator ? (
                  snapshot.user.role === "volunteer" ? (
                    "Your part of the relay."
                  ) : (
                    "Your incoming rescues."
                  )
                ) : (
                  labels[tab]
                )}
              </h1>
              <p>
                {tab === "dispatch"
                  ? "A shared operational picture. Every pickup, every handoff, every next step."
                  : tab === "rescues"
                    ? "Clear plans. Practical next steps. A little care at every handoff."
                    : tab === "offers"
                      ? "Surplus with somewhere to go. Every offer starts a possibility."
                      : tab === "partners"
                        ? "The people and places that make your relay possible."
                        : tab === "policies"
                          ? "The source of truth behind every recovery decision."
                          : tab === "activity"
                            ? "An honest record of what changed, why, and who approved it."
                            : tab === "ai"
                              ? "Optional tools. Visible data boundaries. Human-reviewed outcomes."
                              : tab === "settings"
                                ? "Your workspace, its people, and exactly what it can do."
                                : tab === "availability"
                                  ? "Let your coordinator know when you can lend a hand."
                                  : tab === "receiving"
                                    ? "Keep your receiving window and capacity up to date."
                                    : "Your in-app updates. No outside messages are sent."}
              </p>
            </div>
            {coordinator && (tab === "dispatch" || tab === "offers") && (
              <button
                className="button primary"
                onClick={() => onOpen("donation")}
                disabled={busy || offline}
              >
                <Plus size={17} /> New food offer
              </button>
            )}
            {coordinator && tab === "rescues" && (
              <button
                className="button primary"
                onClick={() => onOpen("rescue")}
                disabled={busy || offline}
              >
                <Plus size={17} /> Create rescue
              </button>
            )}
          </header>
          {tab === "dispatch" && (
            <>
              {!snapshot.rescues.length && (
                <section className="onboarding-panel">
                  <div>
                    <span className="eyebrow">
                      LET’S BUILD YOUR FIRST RELAY
                    </span>
                    <h2>A few good connections.</h2>
                    <p>
                      Add the people and places, share a food offer, then
                      connect a rescue.
                    </p>
                  </div>
                  <div className="onboarding-steps">
                    {[
                      {
                        type: "donor",
                        label: "Add a donor",
                        done: !!snapshot.donors.length,
                      },
                      {
                        type: "recipient",
                        label: "Add a recipient",
                        done: !!snapshot.recipients.length,
                      },
                      {
                        type: "volunteer",
                        label: "Add a volunteer",
                        done: !!snapshot.volunteers.length,
                      },
                    ].map((step, i) => (
                      <button
                        className={step.done ? "done" : ""}
                        key={step.type}
                        disabled={busy || offline}
                        onClick={() => onOpen(step.type)}
                      >
                        <span>{step.done ? <Check size={14} /> : i + 1}</span>
                        {step.label}
                        <ArrowUpRight size={14} />
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <PipelineBoard snapshot={snapshot} onOpen={onOpen} reduced={reduced} />
              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-title">
                    <h2>Recent activity</h2>
                    <button
                      className="text-button"
                      onClick={() => setTab("activity")}
                    >
                      All activity <ArrowRight size={15} />
                    </button>
                  </div>
                  <ActivityList snapshot={snapshot} compact />
                </section>
                <section className="panel community-note">
                  <span className="big-flower">✳︎</span>
                  <div>
                    <div className="eyebrow">BUILT ON TRUST</div>
                    <h2>
                      The evidence is part
                      <br />
                      of the plan.
                    </h2>
                    <p>
                      Recovery plans cite your policies, compare rejected
                      options, and wait for your approval.
                    </p>
                    <button
                      className="underlined-link"
                      onClick={() => setTab("policies")}
                    >
                      Explore the policy library <ArrowRight size={15} />
                    </button>
                  </div>
                </section>
              </div>
            </>
          )}
          {tab === "ai" && aiContent}
          {tab === "rescues" && (
            <PipelineBoard snapshot={snapshot} onOpen={onOpen} reduced={reduced} />
          )}
          {tab === "offers" && (
            <Offers
              snapshot={snapshot}
              onOpen={onOpen}
              onExport={() => onExport("donations")}
              busy={busy || offline}
            />
          )}
          {tab === "partners" && (
            <Partners
              snapshot={snapshot}
              onOpen={onOpen}
              busy={busy || offline}
            />
          )}
          {tab === "policies" && <Policies snapshot={snapshot} />}
          {tab === "activity" && (
            <ActivityView
              snapshot={snapshot}
              onExport={() => onExport("audit")}
              onRead={onRead}
              busy={busy || offline}
              onOpen={onOpen}
            />
          )}
          {tab === "settings" && (
            <SettingsView
              snapshot={snapshot}
              onOpen={onOpen}
              busy={busy || offline}
            />
          )}
          {tab === "availability" && (
            <div className="profile-cards">
              {snapshot.volunteers.map((v) => (
                <VolunteerCard
                  key={v.id}
                  volunteer={v}
                  onEdit={() => onOpen("editVolunteer", v.id)}
                  disabled={busy || offline}
                />
              ))}
            </div>
          )}
          {tab === "receiving" && (
            <div className="profile-cards">
              {snapshot.recipients.map((r) => (
                <RecipientCard
                  key={r.id}
                  recipient={r}
                  onEdit={() => onOpen("editRecipient", r.id)}
                  disabled={busy || offline}
                />
              ))}
            </div>
          )}
          {tab === "updates" && (
            <NotificationList
              snapshot={snapshot}
              onRead={onRead}
              busy={busy || offline}
            />
          )}
          <footer className="workspace-footer">
            <span>
              <Leaf size={14} /> Good food. Real people. A better relay.
            </span>
            <span>
              Updated {time(snapshot.serverTime)} · v{snapshot.version} · Times
              shown locally
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Metrics({ snapshot: s }: { snapshot: Snapshot }) {
  return (
    <div className="metrics-grid">
      {[
        {
          label: "Active rescues",
          value: s.metrics.active,
          sub: `${s.metrics.totalRescues} rescues in this workspace`,
          icon: Truck,
          tone: "green",
        },
        {
          label: "Potential servings",
          value: s.metrics.potentialServings,
          sub: "Estimated from food offers",
          icon: Sprout,
          tone: "orange",
        },
        {
          label: "Food delivered",
          value: `${s.metrics.deliveredKg} kg`,
          sub: `${s.metrics.delivered} completed deliveries`,
          icon: HeartHandshake,
          tone: "yellow",
        },
        {
          label: "Volunteers available",
          value: s.metrics.availableVolunteers,
          sub: "Marked available in their profile",
          icon: Users,
          tone: "green",
        },
      ].map((m) => (
        <section className="metric" key={m.label}>
          <div>
            <span>{m.label}</span>
            <m.icon size={19} />
          </div>
          <strong>{m.value}</strong>
          <small>
            <i className={m.tone} />
            {m.sub}
          </small>
        </section>
      ))}
    </div>
  );
}
function RescueList({
  snapshot: s,
  onOpen,
  compact = false,
}: {
  snapshot: Snapshot;
  onOpen: OpenAction;
  compact?: boolean;
}) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const filtered = s.rescues
    .filter((r) => filter === "all" || r.status === filter)
    .filter((r) => {
      const d = s.donations.find((x) => x.id === r.donationId);
      const donor = s.donors.find((x) => x.id === d?.donorId);
      const rec = s.recipients.find((x) => x.id === r.recipientId);
      return `${r.id} ${d?.description} ${donor?.name} ${rec?.name}`
        .toLowerCase()
        .includes(search.toLowerCase());
    });
  return (
    <div className={compact ? "" : "panel rescue-list-panel"}>
      {!compact && (
        <div className="list-toolbar">
          <div className="filter-tabs" aria-label="Filter rescues">
            {[
              ["all", "All rescues"],
              ["needs_recovery", "Needs recovery"],
              ["assigned", "Assigned"],
              ["picked_up", "In transit"],
              ["delivered", "Delivered"],
              ["escalated", "Escalated"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="search-box">
            <Search size={16} />
            <input
              aria-label="Search rescues"
              placeholder="Find a rescue…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
      )}
      {!filtered.length ? (
        <Empty
          title={
            search || filter !== "all"
              ? "No matching rescues."
              : "Your next good thing starts here."
          }
          description={
            search || filter !== "all"
              ? "Try another search or status filter."
              : s.user.role === "coordinator"
                ? "Add a donor, recipient, and food offer. Then connect them with your first rescue."
                : "Your coordinator will connect you with a rescue. It will appear here when assigned."
          }
        />
      ) : (
        <div className="rescue-list">
          {(compact ? filtered.slice(0, 5) : filtered).map((r) => {
            const d = s.donations.find((x) => x.id === r.donationId);
            const donor = s.donors.find((x) => x.id === d?.donorId);
            const recipient = s.recipients.find((x) => x.id === r.recipientId);
            const volunteer = s.volunteers.find((x) => x.id === r.volunteerId);
            return (
              <button
                className={`rescue-row ${r.status === "needs_recovery" ? "at-risk" : ""}`}
                key={r.id}
                onClick={() => onOpen("rescueDetail", r.id)}
              >
                <span className="rescue-icon">
                  <Package size={22} />
                </span>
                <div className="rescue-main">
                  <strong>{d?.description || "Food rescue"}</strong>
                  <span>
                    {donor?.name || "Donor"}
                    <ArrowRight size={12} />
                    {recipient?.name || "Recipient"}
                  </span>
                  <small>
                    {d?.weightKg || 0} kg · {d?.servings || 0} est. servings
                  </small>
                </div>
                <div className="rescue-meta">
                  <Status status={r.status} />
                  <span>
                    <Clock size={12} />
                    {d ? windowText(d.pickupWindow) : "Window unavailable"}
                  </span>
                </div>
                <div className="rescue-person">
                  <span
                    className={
                      volunteer
                        ? "avatar small-avatar"
                        : "avatar small-avatar empty-avatar"
                    }
                  >
                    {volunteer ? initials(volunteer.name) : "—"}
                  </span>
                  <small>
                    {volunteer?.name ||
                      (r.volunteerId
                        ? "Volunteer assigned"
                        : "Needs a volunteer")}
                  </small>
                </div>
                <ChevronRight size={17} className="row-arrow" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
function Offers({
  snapshot: s,
  onOpen,
  onExport,
  busy,
}: {
  snapshot: Snapshot;
  onOpen: OpenAction;
  onExport: () => void;
  busy: boolean;
}) {
  const [search, setSearch] = useState("");
  const items = s.donations.filter((d) =>
    `${d.description} ${s.donors.find((x) => x.id === d.donorId)?.name}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="content-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="Search food offers"
            placeholder="Find a food offer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div>
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() => onOpen("import")}
          >
            Import CSV
          </button>
          <button
            className="button secondary small"
            disabled={busy}
            onClick={onExport}
          >
            <ArrowDownToLine size={15} /> Export
          </button>
        </div>
      </div>
      <Notice>
        Currently supported: sealed shelf-stable food. Your coordinator enters
        offers on behalf of donors. No donor self-service accounts or
        food-safety determinations are implied.
      </Notice>
      {!items.length ? (
        <Empty
          title="A fresh start for good food."
          description="Add a donor in Our community, then publish your first sealed shelf-stable food offer."
          action="Add a donor"
          onAction={() => onOpen("donor")}
        />
      ) : (
        <div className="offer-grid">
          {items.map((d) => {
            const rescue = s.rescues.find(
              (r) => r.donationId === d.id && r.status !== "cancelled",
            );
            return (
              <article className="offer-card" key={d.id}>
                <div className="offer-card-top">
                  <span className="offer-symbol">
                    <Package />
                  </span>
                  <span className="badge neutral">SEALED · SHELF-STABLE</span>
                </div>
                <small className="offer-donor">
                  {s.donors.find((x) => x.id === d.donorId)?.name}
                </small>
                <h3>{d.description}</h3>
                <div className="offer-numbers">
                  <span>
                    <strong>{d.weightKg}</strong> kg
                  </span>
                  <span>
                    <strong>{d.servings}</strong> est. servings
                  </span>
                </div>
                <div className="offer-window">
                  <Clock size={15} />
                  <span>
                    Pickup {windowText(d.pickupWindow)}
                    <small>
                      {new Date(d.pickupWindow.start).toLocaleDateString()}
                    </small>
                  </span>
                </div>
                {d.handlingNotes && <p>{d.handlingNotes}</p>}
                <footer>
                  {rescue ? (
                    <>
                      <Status status={rescue.status} />
                      <button
                        className="icon-button"
                        aria-label={`View rescue for ${d.description}`}
                        onClick={() => onOpen("rescueDetail", rescue.id)}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </>
                  ) : (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => onOpen("rescue", d.id)}
                    >
                      Connect a rescue <ArrowRight size={16} />
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
function Partners({
  snapshot: s,
  onOpen,
  busy,
}: {
  snapshot: Snapshot;
  onOpen: OpenAction;
  busy: boolean;
}) {
  const [kind, setKind] = useState<"donors" | "volunteers" | "recipients">(
    "donors",
  );
  return (
    <>
      <div className="content-toolbar">
        <div className="filter-tabs">
          <button
            className={kind === "donors" ? "active" : ""}
            onClick={() => setKind("donors")}
          >
            Donors <span>{s.donors.length}</span>
          </button>
          <button
            className={kind === "volunteers" ? "active" : ""}
            onClick={() => setKind("volunteers")}
          >
            Volunteers <span>{s.volunteers.length}</span>
          </button>
          <button
            className={kind === "recipients" ? "active" : ""}
            onClick={() => setKind("recipients")}
          >
            Recipients <span>{s.recipients.length}</span>
          </button>
        </div>
        <button
          className="button primary small"
          disabled={busy}
          onClick={() => onOpen(kind.slice(0, -1))}
        >
          <Plus size={16} /> Add {kind.slice(0, -1)}
        </button>
      </div>
      {!s[kind].length ? (
        <Empty
          title="Good people make a good relay."
          description={`Add your first ${kind.slice(0, -1)} to begin connecting your community.`}
        />
      ) : (
        <div className="partner-grid">
          {kind === "donors" &&
            s.donors.map((d) => (
              <article className="partner-card" key={d.id}>
                <span className="partner-icon">
                  <Sprout />
                </span>
                <span className="eyebrow">DONOR PARTNER</span>
                <h3>{d.name}</h3>
                <p>
                  <MapPin size={15} />
                  {d.location.label}
                </p>
                <p>{d.contact}</p>
                <div className="partner-note">
                  {d.notes || "No additional donor notes."}
                </div>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => onOpen("editDonor", d.id)}
                >
                  Edit donor details <ArrowUpRight size={16} />
                </button>
              </article>
            ))}
          {kind === "volunteers" &&
            s.volunteers.map((v) => (
              <VolunteerCard
                key={v.id}
                volunteer={v}
                onEdit={() => onOpen("editVolunteer", v.id)}
                disabled={busy}
              />
            ))}
          {kind === "recipients" &&
            s.recipients.map((r) => (
              <RecipientCard
                key={r.id}
                recipient={r}
                onEdit={() => onOpen("editRecipient", r.id)}
                disabled={busy}
              />
            ))}
        </div>
      )}
    </>
  );
}
function VolunteerCard({
  volunteer: v,
  onEdit,
  disabled,
}: {
  volunteer: Volunteer;
  onEdit: () => void;
  disabled: boolean;
}) {
  return (
    <article className="partner-card">
      <div className="partner-card-top">
        <span className="avatar large-avatar">{initials(v.name)}</span>
        <span className={"badge " + (v.available ? "green" : "neutral")}>
          {v.available ? "Available" : "Unavailable"}
        </span>
      </div>
      <h3>{v.name}</h3>
      <p>
        <Truck size={15} />
        {v.vehicle} · {v.capacityKg} kg capacity
      </p>
      <p>
        <Clock size={15} />
        {windowText(v.availability)}
      </p>
      <p>
        <MapPin size={15} />
        {v.location.label}
      </p>
      <div className="partner-note">
        <ShieldCheck size={15} />
        {v.trained ? "Handling training verified" : "Training not verified"}
        {v.notes && <p>{v.notes}</p>}
      </div>
      <button className="text-button" disabled={disabled} onClick={onEdit}>
        Edit availability & details <ArrowUpRight size={16} />
      </button>
    </article>
  );
}
function RecipientCard({
  recipient: r,
  onEdit,
  disabled,
}: {
  recipient: Recipient;
  onEdit: () => void;
  disabled: boolean;
}) {
  return (
    <article className="partner-card">
      <span className="partner-icon">
        <HeartHandshake />
      </span>
      <span className="eyebrow">RECIPIENT PARTNER</span>
      <h3>{r.name}</h3>
      <p>
        <MapPin size={15} />
        {r.location.label}
      </p>
      <p>
        <Clock size={15} />
        {windowText(r.openingWindow)}
      </p>
      <div className="recipient-capacity">
        <strong>{r.capacityKg} kg</strong>
        <span>receiving capacity</span>
      </div>
      <div className="partner-note">
        Accepts{" "}
        {r.acceptedCategories.map((c) => c.replaceAll("_", " ")).join(", ")}.
        {r.notes && <p>{r.notes}</p>}
      </div>
      <button className="text-button" disabled={disabled} onClick={onEdit}>
        Edit receiving details <ArrowUpRight size={16} />
      </button>
    </article>
  );
}
function Policies({ snapshot: s }: { snapshot: Snapshot }) {
  return (
    <>
      <Notice>
        <ShieldCheck size={19} />
        <strong>Evidence, not autonomous judgment.</strong> These versioned
        policies constrain the planner. Operators remain responsible for
        verifying food suitability, local requirements, and safe handling.
      </Notice>
      <div className="policy-grid">
        {s.policies.map((p, i) => (
          <article className="policy-card" key={p.id}>
            <div className="policy-card-top">
              <span className="policy-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="badge neutral">{p.scope}</span>
            </div>
            <h2>{p.title}</h2>
            <p>{p.text}</p>
            <footer>
              <FileText size={15} />
              <span>
                {p.source}
                <small>
                  Version {p.version} · {p.id}
                </small>
              </span>
            </footer>
          </article>
        ))}
      </div>
    </>
  );
}
function ActivityList({
  snapshot: s,
  compact = false,
}: {
  snapshot: Snapshot;
  compact?: boolean;
}) {
  return s.audit.length ? (
    <div className="activity-list">
      {(compact ? s.audit.slice(0, 4) : s.audit).map((a) => (
        <div key={a.id}>
          <span className="activity-dot">
            <Check size={12} />
          </span>
          <div>
            <strong>{a.action.replaceAll("_", " ")}</strong>
            <p>{a.detail}</p>
            <small>
              {dateTime(a.at)} · {a.actorId} · {a.entityId}
            </small>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <Empty
      title="Your story starts here."
      description="Approved changes will appear here as your team gets moving."
    />
  );
}
function ActivityView({
  snapshot: s,
  onExport,
  onRead,
  busy,
  onOpen,
}: {
  snapshot: Snapshot;
  onExport: () => void;
  onRead: (id: string) => void;
  busy: boolean;
  onOpen: OpenAction;
}) {
  const [view, setView] = useState("audit");
  return (
    <>
      <div className="content-toolbar">
        <div className="filter-tabs">
          <button
            className={view === "audit" ? "active" : ""}
            onClick={() => setView("audit")}
          >
            Audit trail
          </button>
          <button
            className={view === "plans" ? "active" : ""}
            onClick={() => setView("plans")}
          >
            Recovery plans
          </button>
          <button
            className={view === "outbox" ? "active" : ""}
            onClick={() => setView("outbox")}
          >
            In-app outbox
          </button>
        </div>
        <button
          className="button secondary small"
          onClick={onExport}
          disabled={busy}
        >
          <ArrowDownToLine size={15} /> Export audit
        </button>
      </div>
      {view === "audit" ? (
        <section className="panel">
          <ActivityList snapshot={s} />
        </section>
      ) : view === "outbox" ? (
        <NotificationList snapshot={s} onRead={onRead} busy={busy} />
      ) : (
        <div className="plans-list">
          {s.plans.length ? (
            s.plans.map((p) => (
              <button
                className="panel plan-row"
                key={p.id}
                onClick={() => onOpen("plan", p.id)}
              >
                <ShieldCheck size={22} />
                <span>
                  <strong>{p.summary}</strong>
                  <small>
                    {dateTime(p.createdAt)} · {p.replacements.length}{" "}
                    replacements · {p.status}
                  </small>
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))
          ) : (
            <Empty
              title="No recovery plans yet."
              description="When a rescue needs a new route, generate a plan from the dispatch board."
            />
          )}
        </div>
      )}
    </>
  );
}
export function NotificationList({
  snapshot: s,
  onRead,
  busy,
}: {
  snapshot: Snapshot;
  onRead: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div className="notifications">
      <Notice>
        In-app updates only. These records are not email, SMS, push
        notifications, or proof of receipt by another person.
      </Notice>
      {s.notifications.length ? (
        s.notifications.map((n) => (
          <article
            className={`notification ${n.read ? "" : "unread"}`}
            key={n.id}
          >
            <span className="notification-icon">
              <Bell size={18} />
            </span>
            <div>
              <h3>{n.title}</h3>
              <p>{n.body}</p>
              <small>
                {dateTime(n.at)} · {n.audience} · in-app only
              </small>
            </div>
            {!n.read && n.audience === s.user.role && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => onRead(n.id)}
              >
                Mark read <Check size={15} />
              </button>
            )}
          </article>
        ))
      ) : (
        <Empty
          title="All quiet for now."
          description="Assignment and handoff updates will appear here."
        />
      )}
    </div>
  );
}
function SettingsView({
  snapshot: s,
  onOpen,
  busy,
}: {
  snapshot: Snapshot;
  onOpen: OpenAction;
  busy: boolean;
}) {
  return (
    <div className="settings-grid">
      <section className="panel settings-card">
        <div className="eyebrow">YOUR WORKSPACE</div>
        <h2>{s.organization.name}</h2>
        <dl>
          <div>
            <dt>Account</dt>
            <dd>{s.user.email}</dd>
          </div>
          <div>
            <dt>Your role</dt>
            <dd>{s.user.role}</dd>
          </div>
          <div>
            <dt>Organization</dt>
            <dd>{s.organization.id}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{dateTime(s.organization.createdAt)}</dd>
          </div>
        </dl>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => onOpen("user")}
        >
          <Plus size={16} /> Add a workspace account
        </button>
        <p className="field-hint">
          Volunteer and recipient logins are linked to an existing record and
          see only their scoped data.
        </p>
      </section>
      <section className="panel settings-card">
        <div className="eyebrow">CLEAR ABOUT WHAT’S REAL</div>
        <h2>Built to be understood.</h2>
        <ul className="capability-list">
          <li>
            <CheckCircle2 />
            <span>
              <strong>Persistent, isolated workspaces</strong>Server-side
              sessions, role-filtered data, and a versioned audit trail.
            </span>
          </li>
          <li>
            <CheckCircle2 />
            <span>
              <strong>Human-approved recovery</strong>Constraint checks and
              policy retrieval. No autonomous dispatch.
            </span>
          </li>
          <li>
            <MapPin />
            <span>
              <strong>Estimated routes</strong>Synthetic matrix or
              distance-based timing, not live maps or traffic.
            </span>
          </li>
          <li>
            <Bell />
            <span>
              <strong>In-app notifications only</strong>No SMS, email, or push
              provider is connected.
            </span>
          </li>
          <li>
            <ShieldCheck />
            <span>
              <strong>Local-first pilot, not enterprise certified</strong>
              Production security, SSO, backups, and operations need deployment
              review.
            </span>
          </li>
        </ul>
      </section>
      {s.organization.demo && (
        <section className="panel settings-card demo-settings">
          <div className="eyebrow">LOCAL DEMO CONTROLS</div>
          <h2>Practice the unexpected.</h2>
          <p>
            Reset the sandbox to a known scenario. This replaces this demo
            workspace’s current records and invalidates existing plans.
          </p>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => onOpen("reset", "baseline")}
            >
              Baseline
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => onOpen("reset", "no_capacity")}
            >
              No capacity
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => onOpen("reset", "tight_window")}
            >
              Tight window
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
export function RescueDetail({
  rescue: r,
  snapshot: s,
  onOpen,
  onAction,
  onGenerate,
  busy,
}: {
  rescue: Rescue;
  snapshot: Snapshot;
  onOpen: OpenAction;
  onAction: (path: string, body?: Record<string, unknown>) => void;
  aiContent?: ReactNode;
  onGenerate: () => void;
  busy: boolean;
}) {
  const d = s.donations.find((x) => x.id === r.donationId);
  const donor = s.donors.find((x) => x.id === d?.donorId);
  const recipient = s.recipients.find((x) => x.id === r.recipientId);
  const volunteer = s.volunteers.find((x) => x.id === r.volunteerId);
  const canDrive =
    s.user.role === "coordinator" ||
    (s.user.role === "volunteer" && s.user.volunteerId === r.volunteerId);
  return (
    <div className="rescue-detail">
      <div className="detail-status">
        <Status status={r.status} />
        <span>{r.id}</span>
      </div>
      <h3>{d?.description}</h3>
      <div className="detail-numbers">
        <span>
          <strong>{d?.weightKg}</strong> kg
        </span>
        <span>
          <strong>{d?.servings}</strong> estimated servings
        </span>
        <span className="badge neutral">
          Sealed · {d?.category.replaceAll("_", " ")}
        </span>
      </div>
      <div className="detail-route">
        <div>
          <span className="route-node" />
          <div>
            <small>PICKUP FROM</small>
            <strong>{donor?.name}</strong>
            <p>{donor?.location.label}</p>
            <span>
              <Clock size={14} />
              {d && windowText(d.pickupWindow)}
            </span>
            <p>{donor?.contact}</p>
          </div>
        </div>
        <div>
          <span className="route-node end" />
          <div>
            <small>DELIVER TO</small>
            <strong>{recipient?.name}</strong>
            <p>{recipient?.location.label}</p>
            <span>
              <Clock size={14} />
              {windowText(r.deliveryWindow)}
            </span>
            <p>{recipient?.contact}</p>
          </div>
        </div>
      </div>
      <div className="assigned-person">
        <span className="avatar">
          {volunteer ? initials(volunteer.name) : "?"}
        </span>
        <div>
          <strong>
            {volunteer?.name ||
              (r.volunteerId
                ? "Volunteer assigned"
                : "A new volunteer is needed")}
          </strong>
          <small>
            {volunteer
              ? `${volunteer.vehicle} · ${volunteer.capacityKg} kg capacity`
              : r.volunteerId
                ? "Your coordinator has assigned coverage. Personal details are restricted by role."
                : "Review a recovery plan before making a new assignment."}
          </small>
        </div>
      </div>
      <div className="rescue-timeline">
        {[
          { label: "Assigned", done: !!r.volunteerId },
          { label: "Accepted", done: !!r.acceptedAt },
          {
            label: "Picked up",
            done: r.status === "picked_up" || r.status === "delivered",
          },
          { label: "Delivered", done: r.status === "delivered" },
          { label: "Received", done: !!r.recipientConfirmedAt },
        ].map((step, i) => (
          <div className={step.done ? "done" : ""} key={step.label}>
            <span>{step.done ? <Check size={12} /> : i + 1}</span>
            <small>{step.label}</small>
          </div>
        ))}
      </div>
      {r.cancellationReason && (
        <Notice type="warning">
          <strong>Interruption note</strong>
          <br />
          {r.cancellationReason}
        </Notice>
      )}
      {d?.handlingNotes && (
        <section className="detail-note">
          <h4>Handling notes</h4>
          <p>{d.handlingNotes}</p>
        </section>
      )}
      {recipient?.notes && (
        <section className="detail-note">
          <h4>Recipient requirements</h4>
          <p>{recipient.notes}</p>
        </section>
      )}
      <div className="detail-actions">
        {canDrive && r.status === "assigned" && !r.acceptedAt && (
          <button
            className="button primary full"
            disabled={busy}
            onClick={() => onAction(`/rescues/${r.id}/accept`)}
          >
            Accept assignment <Check size={17} />
          </button>
        )}
        {canDrive && r.status === "assigned" && r.acceptedAt && (
          <button
            className="button primary full"
            disabled={busy}
            onClick={() =>
              onAction(`/rescues/${r.id}/status`, { status: "picked_up" })
            }
          >
            Confirm food picked up <Package size={17} />
          </button>
        )}
        {canDrive && r.status === "picked_up" && (
          <button
            className="button primary full"
            disabled={busy}
            onClick={() =>
              onAction(`/rescues/${r.id}/status`, { status: "delivered" })
            }
          >
            Confirm delivery completed <Check size={17} />
          </button>
        )}
        {(s.user.role === "recipient" || s.user.role === "coordinator") &&
          r.status === "delivered" &&
          !r.recipientConfirmedAt && (
            <button
              className="button primary full"
              disabled={busy}
              onClick={() => onAction(`/rescues/${r.id}/confirm`)}
            >
              Confirm food received <HeartHandshake size={17} />
            </button>
          )}
        {r.recipientConfirmedAt && (
          <Notice type="success">
            Recipient confirmed receipt at {dateTime(r.recipientConfirmedAt)}.
          </Notice>
        )}
        {s.user.role === "coordinator" && r.status === "needs_recovery" && (
          <button
            className="button primary full"
            disabled={busy}
            onClick={onGenerate}
          >
            Compare recovery options <ArrowRight size={17} />
          </button>
        )}
        {canDrive && (r.status === "assigned" || r.status === "picked_up") && (
          <button
            className="button danger-outline full"
            disabled={busy}
            onClick={() => onOpen("cancel", r.id)}
          >
            {r.status === "picked_up"
              ? "Report a custody interruption"
              : "I can’t complete this pickup"}
          </button>
        )}
        {s.user.role === "coordinator" && r.status === "escalated" && (
          <>
            <Notice type="warning">
              {r.custodyHeld
                ? "Food remains in custody. Contact the holder and recipient; this rescue cannot be automatically reassigned."
                : "This rescue is waiting for a coordinator’s documented human decision."}
            </Notice>
            <button
              className="button primary full"
              disabled={busy}
              onClick={() => onOpen("resolve", r.id)}
            >
              Record a verified outcome <ShieldCheck size={17} />
            </button>
          </>
        )}
        {s.user.role === "coordinator" &&
          (r.status === "needs_recovery" || r.status === "picked_up") && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => onOpen("escalate", r.id)}
            >
              Escalate for human follow-up
            </button>
          )}
      </div>
      <p className="field-hint">
        Only mark a handoff complete after it happens. Recorded updates do not
        substitute for verified safe handling.
      </p>
    </div>
  );
}
