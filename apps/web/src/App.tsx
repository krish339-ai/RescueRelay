import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  HeartHandshake,
  Leaf,
  ShieldCheck,
  Smartphone,
  Truck,
  Users,
  X,
  WifiOff,
} from "lucide-react";
import type {
  SessionResponse,
  Snapshot,
  Role,
  PlanResponse,
  RecoveryPlan,
  CsvValidation,
  Donor,
} from "@rescuerelay/shared";
import { api, ApiFailure, downloadCsv } from "./api";
import { Landing } from "./Landing";
import { AiStudio } from "./AiStudio";
import { mergeScopedAiSnapshot } from "./ai-values";
import {
  Workspace,
  RescueDetail,
  NotificationList,
  type Tab,
} from "./Workspace";
import { RecoveryReview } from "./Recovery";
import {
  AuthForm,
  DonationForm,
  RescueForm,
  PartnerForm,
  VolunteerForm,
  RecipientForm,
  ReasonForm,
  UserForm,
  ImportForm,
  changedFields,
} from "./forms";
import { Modal, Notice, Field, Busy, Empty } from "./ui";
import "./styles.css";
type Dialog = { type: string; id?: string } | null;
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function App() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [tab, setTab] = useState<Tab>("dispatch");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [syncIssue, setSyncIssue] = useState(false);
  useEffect(() => setSyncIssue(false), [snapshot]);
  const [demoEnabled, setDemoEnabled] = useState<boolean | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallEvent | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<RecoveryPlan | null>(null);
  const approvalKey = useRef("");
  const busyRef = useRef(false);
  const sessionRef = useRef<SessionResponse | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    void api<{ demoMode: boolean }>("/config")
      .then((c) => setDemoEnabled(c.demoMode))
      .catch(() => setDemoEnabled(null));
    const online = () => setOffline(!navigator.onLine);
    const install = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallEvent);
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    window.addEventListener("beforeinstallprompt", install);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("beforeinstallprompt", install);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    document.title = session
      ? `${tab === "dispatch" ? "Overview" : tab.charAt(0).toUpperCase() + tab.slice(1)} · RescueRelay`
      : "RescueRelay — Good food. Better together.";
  }, [session, tab]);
  useEffect(() => {
    const handler = () => {
      const value = location.hash.replace("#/workspace/", "") as Tab;
      const allowed: Tab[] =
        session?.user.role === "coordinator"
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
          : session?.user.role === "volunteer"
            ? ["rescues", "availability", "updates"]
            : ["rescues", "receiving", "updates"];
      if (allowed.includes(value)) setTab(value);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, [session]);
  useEffect(() => {
    if (!session) return;
    let active = true;
    const timer = setInterval(() => {
      if (document.hidden || offline || busyRef.current) return;
      void api<Snapshot>("/snapshot", session.token)
        .then((s) => {
          if (active && sessionRef.current?.token === session.token)
            setSnapshot((previous) =>
              !previous ||
              previous.organization.id !== s.organization.id ||
              s.version >= previous.version
                ? s
                : previous,
            );
        })
        .catch((e) => {
          if (!active || sessionRef.current?.token !== session.token) return;
          setSyncIssue(true);
          if (e instanceof ApiFailure && e.status === 401) {
            setSession(null);
            setSnapshot(null);
            setDialog({ type: "auth" });
            setAuthMode("login");
            setError("Your session expired. Please log in again.");
          }
        });
    }, 25000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session, offline]);
  function navigate(next: Tab) {
    setTab(next);
    location.hash = `/workspace/${next}`;
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function open(type: string, id?: string) {
    setError("");
    setDialog({ type, id });
    if (type === "plan" && snapshot) {
      setSelectedPlan(snapshot.plans.find((p) => p.id === id) || null);
      approvalKey.current = crypto.randomUUID();
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
      if (!(e instanceof ApiFailure) || e.status >= 500) setSyncIssue(true);
      if (e instanceof ApiFailure) {
        if (e.code === "STALE_VERSION") {
          setError(
            "This workspace changed while you were reviewing it. We refreshed the data. Please review the latest details and submit again. No approval was automatically retried.",
          );
          if (sessionRef.current) {
            try {
              setSnapshot(
                await api<Snapshot>("/snapshot", sessionRef.current.token),
              );
            } catch {
              setSyncIssue(true);
              setError(
                "Workspace data changed, but the refresh failed. Please refresh when the server is available before reviewing or retrying. No approval was retried.",
              );
            }
          }
        } else if (e.status === 401) {
          setSession(null);
          setSnapshot(null);
          setAuthMode("login");
          setDialog({ type: "auth" });
          setError("Your session is no longer valid. Please log in again.");
        } else setError(e.message);
      } else if (
        e instanceof DOMException &&
        (e.name === "TimeoutError" || e.name === "AbortError")
      )
        setError(
          "The server took too long to respond. The action may have completed. Refresh your workspace before trying again; no change will be retried automatically.",
        );
      else
        setError(
          "We couldn’t reach the server. Check your connection and refresh the workspace before retrying a change.",
        );
      return undefined;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function establish(next: SessionResponse) {
    const data = await api<Snapshot>("/snapshot", next.token);
    setSession(next);
    sessionRef.current = next;
    setSnapshot(data);
    setDialog(null);
    setSelectedPlan(null);
    const first = next.user.role === "coordinator" ? "dispatch" : "rescues";
    navigate(first);
    setToast(
      next.organization.demo
        ? "You’re in the local demo. All people and food records are synthetic."
        : "Welcome to your RescueRelay workspace.",
    );
  }
  async function enterDemo(role: Role = "coordinator") {
    await run(async () => {
      if (sessionRef.current) {
        await api("/auth/logout", sessionRef.current.token, {});
        setSession(null);
        setSnapshot(null);
        sessionRef.current = null;
      }
      const next = await api<SessionResponse>("/auth/demo", undefined, {
        role,
      });
      await establish(next);
    });
  }
  async function authenticate(body: Record<string, unknown>) {
    await run(async () => {
      const next = await api<SessionResponse>(
        `/auth/${authMode}`,
        undefined,
        body,
      );
      await establish(next);
    });
  }
  async function refresh() {
    if (!session) return;
    await run(async () => {
      setSnapshot(await api<Snapshot>("/snapshot", session.token));
      setToast("Workspace refreshed.");
    });
  }
  async function logout() {
    if (!session) return;
    await run(async () => {
      await api("/auth/logout", session.token, {});
      setSession(null);
      sessionRef.current = null;
      setSnapshot(null);
      setDialog(null);
      setSelectedPlan(null);
      location.hash = "";
      setToast("You’ve been logged out. Your session was revoked.");
      window.scrollTo({ top: 0 });
    });
  }
  async function mutate(
    path: string,
    body: Record<string, unknown> = {},
    method?: string,
    close = true,
  ): Promise<boolean> {
    if (!session || !snapshot || offline) return false;
    const result = await run(async () => {
      const data = await api<Snapshot | { user: unknown }>(
        path,
        session.token,
        {
          ...(path === "/users" ? {} : { expectedVersion: snapshot.version }),
          ...body,
        },
        method,
      );
      if ("version" in data) setSnapshot(data);
      else setSnapshot(await api<Snapshot>("/snapshot", session.token));
      if (close) setDialog(null);
      setToast(
        path.includes("/accept")
          ? "Assignment accepted. Your coordinator can see the update."
          : path.includes("/confirm")
            ? "Receipt confirmed. Thank you for closing the loop."
            : path.includes("/cancel")
              ? "Interruption recorded. The rescue now needs coordinator review."
              : "Saved. Your workspace is up to date.",
      );
      return true;
    });
    return !!result;
  }
  async function generate(
    rescueIds?: string[],
    mode: "offline" | "provider" = "offline",
  ) {
    if (!session || !snapshot || offline) return;
    await run(async () => {
      const data = await api<PlanResponse>("/plans/generate", session.token, {
        expectedVersion: snapshot.version,
        mode,
        ...(rescueIds ? { rescueIds } : {}),
      });
      setSnapshot(data.snapshot);
      setSelectedPlan(data.plan);
      approvalKey.current = crypto.randomUUID();
      setDialog({ type: "plan", id: data.plan.id });
    });
  }
  async function approve() {
    if (!session || !snapshot || !selectedPlan || offline) return;
    await run(async () => {
      const data = await api<PlanResponse>(
        `/plans/${selectedPlan.id}/apply`,
        session.token,
        {
          expectedVersion: selectedPlan.baseVersion,
          idempotencyKey: approvalKey.current,
        },
      );
      setSnapshot(data.snapshot);
      setSelectedPlan(data.plan);
      setToast(
        "Plan approved. Assignments, audit evidence, and in-app updates are recorded.",
      );
    });
  }
  async function exportData(kind: "donations" | "audit") {
    if (!session) return;
    await run(async () => {
      await downloadCsv(
        `/exports/${kind}.csv`,
        session.token,
        `rescuerelay-${kind}.csv`,
      );
      setToast("CSV download prepared.");
    });
  }
  const closeDialog = () => {
    if (!busy) {
      setDialog(null);
      setError("");
    }
  };
  const selectedRescue = snapshot?.rescues.find((r) => r.id === dialog?.id);
  const selectedVolunteer = snapshot?.volunteers.find(
    (v) => v.id === dialog?.id,
  );
  const selectedRecipient = snapshot?.recipients.find(
    (r) => r.id === dialog?.id,
  );
  const selectedDonor = snapshot?.donors.find((d) => d.id === dialog?.id);
  const titles: Record<string, string> = {
    auth:
      authMode === "login"
        ? "Welcome back."
        : "A fresh start for your community.",
    demo: "One relay. Three perspectives.",
    donation: "Share something good.",
    rescue: "Make a new connection.",
    donor: "Add a donor partner.",
    recipient: "Add a recipient partner.",
    volunteer: "Welcome a volunteer.",
    editVolunteer: "Make room for a little good.",
    editRecipient: "Ready to receive.",
    editDonor: "Keep the details connected.",
    resolve: "Record the human decision.",
    cancel: "Let’s make another plan.",
    escalate: "Bring in a human.",
    plan: "A way forward, with evidence.",
    rescueDetail: "Every handoff matters.",
    notifications: "Your latest updates.",
    install: "Your relay, wherever you go.",
    import: "Bring your food offers along.",
    user: "Bring someone into the relay.",
    reset: "Reset this demo workspace?",
  };
  return (
    <>
      {session && snapshot ? (
        <Workspace
          snapshot={snapshot}
          tab={tab}
          setTab={navigate}
          onOpen={open}
          onRefresh={refresh}
          onLogout={logout}
          onDemo={() => open("demo")}
          busy={busy}
          offline={offline}
          syncIssue={syncIssue}
          onGenerate={() => void generate()}
          onExport={exportData}
          aiContent={
            <AiStudio
              snapshot={snapshot}
              token={session.token}
              onSnapshot={(next) =>
                setSnapshot((current) =>
                  mergeScopedAiSnapshot(
                    sessionRef.current?.token,
                    session.token,
                    current,
                    next,
                  ),
                )
              }
              onReviewPlan={(plan) => {
                if (sessionRef.current?.token !== session.token) return;
                setSelectedPlan(plan);
                approvalKey.current = crypto.randomUUID();
                setDialog({ type: "plan", id: plan.id });
              }}
              onSessionExpired={() => {
                if (sessionRef.current?.token !== session.token) return;
                setSession(null);
                sessionRef.current = null;
                setSnapshot(null);
                setAuthMode("login");
                setDialog({ type: "auth" });
                setError("Your session expired. Please log in again.");
              }}
            />
          }
          onRead={(id) =>
            void mutate(`/notifications/${id}/read`, {}, undefined, false)
          }
          onAction={(p, b) => void mutate(p, b, undefined, false)}
        />
      ) : (
        <Landing
          onDemo={() => void enterDemo()}
          onLogin={() => {
            setAuthMode("login");
            open("auth");
          }}
          onRegister={() => {
            setAuthMode("register");
            open("auth");
          }}
          onInstall={() => open("install")}
          busy={busy}
        />
      )}{" "}
      {!session && offline && (
        <div className="global-offline" role="status">
          <WifiOff size={17} /> Offline shell available. Connect to log in or
          change workspace data.
        </div>
      )}
      {error && !dialog && (
        <div className="global-error" role="alert">
          <span>{error}</span>
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {dialog && (
        <Modal
          key={dialog.type}
          title={titles[dialog.type] || "RescueRelay"}
          eyebrow={
            dialog.type === "plan"
              ? "RECOVERY REVIEW"
              : dialog.type === "auth"
                ? "WELCOME TO RESCUERELAY"
                : undefined
          }
          onClose={closeDialog}
          wide={
            dialog.type === "plan" ||
            dialog.type === "notifications" ||
            dialog.type === "import"
          }
        >
          {error && (
            <div className="dialog-error" role="alert">
              {error}
            </div>
          )}
          {dialog.type === "auth" && (
            <AuthForm
              key={authMode}
              mode={authMode}
              onMode={(m) => {
                setAuthMode(m);
                setError("");
              }}
              onSubmit={authenticate}
              busy={busy}
            />
          )}{" "}
          {dialog.type === "demo" && (
            <div className="demo-role-list">
              <Notice type="warning">
                Local demo only. Synthetic records are shared across these roles
                in one persistent sandbox. Switching roles signs out your
                current session first.
              </Notice>
              {demoEnabled === false ? (
                <Notice type="warning">
                  Demo mode is disabled on this server.
                </Notice>
              ) : (
                (["coordinator", "volunteer", "recipient"] as Role[]).map(
                  (role) => {
                    const Icon =
                      role === "coordinator"
                        ? Users
                        : role === "volunteer"
                          ? Truck
                          : HeartHandshake;
                    return (
                      <button
                        key={role}
                        className="demo-role"
                        disabled={busy || offline}
                        onClick={() => void enterDemo(role)}
                      >
                        <span>
                          <Icon />
                        </span>
                        <div>
                          <strong>{role}</strong>
                          <small>
                            {role === "coordinator"
                              ? "Coordinate, recover, and approve"
                              : role === "volunteer"
                                ? "Accept, pick up, deliver, and report interruptions"
                                : "See incoming food and confirm receipt"}
                          </small>
                        </div>
                        <ChevronRight size={18} />
                      </button>
                    );
                  },
                )
              )}
            </div>
          )}
          {snapshot && (
            <>
              {dialog.type === "donation" &&
                (snapshot.donors.length ? (
                  <DonationForm
                    snapshot={snapshot}
                    busy={busy || offline}
                    onSubmit={mutate}
                  />
                ) : (
                  <Empty
                    title="Start with a donor partner."
                    description="Every food offer belongs to a donor. Add their pickup location and contact details first."
                    action="Add a donor"
                    onAction={() => open("donor")}
                  />
                ))}{" "}
              {dialog.type === "rescue" &&
                (!snapshot.recipients.length ? (
                  <Empty
                    title="Give this food a destination."
                    description="Add a recipient partner with a receiving window and capacity before creating a rescue."
                    action="Add a recipient"
                    onAction={() => open("recipient")}
                  />
                ) : !snapshot.donations.some(
                    (d) =>
                      !snapshot.rescues.some(
                        (r) =>
                          r.donationId === d.id && r.status !== "cancelled",
                      ),
                  ) ? (
                  <Empty
                    title="Your next rescue needs a food offer."
                    description="Publish a new sealed shelf-stable food offer, then connect it to a recipient."
                    action="Create a food offer"
                    onAction={() => open("donation")}
                  />
                ) : (
                  <RescueForm
                    snapshot={snapshot}
                    busy={busy || offline}
                    onSubmit={mutate}
                    presetDonationId={dialog.id}
                  />
                ))}{" "}
              {["donor", "volunteer", "recipient"].includes(dialog.type) && (
                <PartnerForm
                  kind={dialog.type as "donor" | "volunteer" | "recipient"}
                  snapshot={snapshot}
                  busy={busy || offline}
                  onSubmit={mutate}
                />
              )}{" "}
              {dialog.type === "editVolunteer" && selectedVolunteer && (
                <VolunteerForm
                  volunteer={selectedVolunteer}
                  coordinator={snapshot.user.role === "coordinator"}
                  busy={busy || offline}
                  onSubmit={mutate}
                />
              )}{" "}
              {dialog.type === "editRecipient" && selectedRecipient && (
                <RecipientForm
                  recipient={selectedRecipient}
                  busy={busy || offline}
                  onSubmit={mutate}
                />
              )}{" "}
              {dialog.type === "editDonor" && selectedDonor && (
                <DonorForm
                  donor={selectedDonor}
                  busy={busy || offline}
                  onSubmit={mutate}
                />
              )}{" "}
              {(dialog.type === "cancel" || dialog.type === "escalate") && (
                <ReasonForm
                  label={
                    dialog.type === "cancel"
                      ? "Record interruption"
                      : "Escalate for review"
                  }
                  busy={busy || offline}
                  onSubmit={(reason) =>
                    void mutate(`/rescues/${dialog.id}/${dialog.type}`, {
                      reason,
                    })
                  }
                />
              )}{" "}
              {dialog.type === "resolve" && selectedRescue && (
                <ResolutionForm
                  custodyHeld={!!selectedRescue.custodyHeld}
                  busy={busy || offline}
                  onSubmit={(body) =>
                    void mutate(`/rescues/${selectedRescue.id}/resolve`, body)
                  }
                />
              )}{" "}
              {dialog.type === "rescueDetail" && selectedRescue && (
                <RescueDetail
                  rescue={selectedRescue}
                  snapshot={snapshot}
                  onOpen={open}
                  onAction={(p, b) => void mutate(p, b, undefined, false)}
                  onGenerate={() => void generate([selectedRescue.id])}
                  busy={busy || offline}
                />
              )}{" "}
              {dialog.type === "plan" && selectedPlan && (
                <RecoveryReview
                  key={`${selectedPlan.id}-${selectedPlan.baseVersion}`}
                  plan={selectedPlan}
                  snapshot={snapshot}
                  busy={busy || offline}
                  onApprove={approve}
                  onRegenerate={() => void generate(selectedPlan.incidentIds)}
                  onInvestigate={() =>
                    void generate(selectedPlan.incidentIds, "provider")
                  }
                  onEscalate={(id) => open("escalate", id)}
                />
              )}{" "}
              {dialog.type === "notifications" && (
                <NotificationList
                  snapshot={snapshot}
                  busy={busy || offline}
                  onRead={(id) =>
                    void mutate(
                      `/notifications/${id}/read`,
                      {},
                      undefined,
                      false,
                    )
                  }
                />
              )}{" "}
              {dialog.type === "user" && (
                <UserForm
                  snapshot={snapshot}
                  busy={busy || offline}
                  onSubmit={mutate}
                />
              )}{" "}
              {dialog.type === "import" && (
                <ImportForm
                  busy={busy || offline}
                  donorId={snapshot.donors[0]?.id}
                  onValidate={(csv) =>
                    run(() =>
                      api<CsvValidation>(
                        "/imports/donations/validate",
                        session!.token,
                        { csv },
                      ),
                    )
                  }
                  onImport={(csv) => void mutate("/imports/donations", { csv })}
                />
              )}{" "}
              {dialog.type === "reset" && (
                <div className="form">
                  <Notice type="warning">
                    This replaces all current demo records with the{" "}
                    <strong>{dialog.id?.replaceAll("_", " ")}</strong> scenario.
                    Existing recovery plans become invalid. Your non-demo
                    workspaces are not affected.
                  </Notice>
                  <button
                    className="button danger full"
                    disabled={busy || offline}
                    onClick={() =>
                      void mutate("/demo/reset", { scenario: dialog.id })
                    }
                  >
                    {busy ? <Busy /> : "Reset demo data"}
                  </button>
                  <button
                    className="button secondary full"
                    disabled={busy}
                    onClick={closeDialog}
                  >
                    Keep current demo
                  </button>
                </div>
              )}
            </>
          )}
          {dialog.type === "install" && (
            <div className="install-guide">
              <div className="install-art">
                <Smartphone size={42} />
                <Leaf size={25} />
              </div>
              <p>
                Install the web app for a focused, full-screen workspace. Your
                home screen, your next good move.
              </p>
              {installPrompt && (
                <button
                  className="button primary full"
                  onClick={async () => {
                    await installPrompt.prompt();
                    const c = await installPrompt.userChoice;
                    if (c.outcome === "accepted") {
                      setToast("Installation accepted by your browser.");
                      setInstallPrompt(null);
                      setDialog(null);
                    }
                  }}
                >
                  <Download size={18} /> Install RescueRelay
                </button>
              )}
              <ol>
                <li>
                  <strong>iPhone or iPad</strong>
                  <span>
                    Open the deployed app in Safari, tap Share, then “Add to
                    Home Screen.”
                  </span>
                </li>
                <li>
                  <strong>Android</strong>
                  <span>
                    Open in Chrome and choose “Install app” or “Add to Home
                    screen” from the browser menu.
                  </span>
                </li>
                <li>
                  <strong>Desktop</strong>
                  <span>Use your browser’s install icon when available.</span>
                </li>
              </ol>
              <Notice>
                The app needs HTTPS or localhost for installation. The cached
                shell works offline, but sign-in and changes require a
                connection. Authenticated API responses are never cached. Native
                iOS and Android builds are separate and require platform
                signing.
              </Notice>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
function DonorForm({
  donor: d,
  onSubmit,
  busy,
}: {
  donor: Donor;
  onSubmit: (
    path: string,
    body: Record<string, unknown>,
    method?: string,
  ) => Promise<boolean>;
  busy: boolean;
}) {
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void onSubmit(
          `/donors/${d.id}`,
          changedFields(d, {
            name: String(f.get("name")),
            contact: String(f.get("contact")),
            notes: String(f.get("notes")),
            location: {
              label: String(f.get("location")),
              lat: Number(f.get("lat")),
              lng: Number(f.get("lng")),
            },
          }),
          "PATCH",
        );
      }}
    >
      <Field label="Donor name">
        <input name="name" required defaultValue={d.name} />
      </Field>
      <Field label="Contact">
        <input name="contact" required defaultValue={d.contact} />
      </Field>
      <Field label="Location">
        <input name="location" required defaultValue={d.location.label} />
      </Field>
      <div className="form-row">
        <Field label="Latitude">
          <input
            name="lat"
            required
            type="number"
            min="-90"
            max="90"
            step="any"
            defaultValue={d.location.lat}
          />
        </Field>
        <Field label="Longitude">
          <input
            name="lng"
            required
            type="number"
            min="-180"
            max="180"
            step="any"
            defaultValue={d.location.lng}
          />
        </Field>
      </div>
      <Field label="Notes">
        <textarea name="notes" rows={3} defaultValue={d.notes} />
      </Field>
      <button className="button primary full" disabled={busy}>
        Save donor details <ArrowRight size={17} />
      </button>
    </form>
  );
}

function ResolutionForm({
  custodyHeld,
  busy,
  onSubmit,
}: {
  custodyHeld: boolean;
  busy: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSubmit({
          resolution: String(f.get("resolution")),
          reason: String(f.get("reason")),
        });
      }}
    >
      <Notice type="warning">
        <strong>Establish the outcome with the people involved first.</strong>{" "}
        This records your verified disposition; it is not independent proof of
        delivery, safe handling, or food disposal.
        {custodyHeld && (
          <p>
            Food is already in custody. Automatic recovery is not available.
            Contact the holder and recipient before recording an outcome.
          </p>
        )}
      </Notice>
      <Field label="Confirmed outcome">
        <select name="resolution" required defaultValue="">
          <option disabled value="">
            Choose the verified outcome
          </option>
          {!custodyHeld && (
            <option value="resume_recovery">
              Resume recovery — food has not been picked up
            </option>
          )}
          <option value="delivered">
            Delivery completed — confirmed with the people involved
          </option>
          <option value="cancelled">
            Rescue cancelled — custody and food disposition resolved
          </option>
        </select>
      </Field>
      <Field label="What did you confirm, and with whom?">
        <textarea
          name="reason"
          required
          minLength={3}
          maxLength={1000}
          rows={4}
        />
      </Field>
      <label className="checkbox-field">
        <input type="checkbox" required /> I established this outcome outside
        the app and understand it will be audited.
      </label>
      <button className="button primary full" disabled={busy}>
        Record confirmed disposition <Check size={17} />
      </button>
    </form>
  );
}
