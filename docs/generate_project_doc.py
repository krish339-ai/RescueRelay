#!/usr/bin/env python3
"""Generate the editable RescueRelay product and technical reference.

Local regeneration: python docs/generate_project_doc.py
Dependency: python-docx 1.2.0 (see docs/requirements-docs.txt). The application
itself remains Node-only. In Codex, run using its bundled primary Python runtime.
The DOCX is the requested artifact; render images and PDF under docs/.qa are
verification intermediates. Re-render and inspect every page after edits.
Do not infer platform or test success from documentation generation.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "RescueRelay-Project-Documentation.docx"
DATE = "7 November 2026"
NAVY = "233B53"
GRAY = "D9D9D9"
PALE = "F1F5F8"

SOURCES = [
    ("S1", "Forgotten Harvest", "Harvest Heroes Small but Mighty Rescue Routes", "4 September 2024",
     "https://www.forgottenharvest.org/harvest-heroes-small-but-mighty-rescue-routes/"),
    ("S2", "412 Food Rescue", "New Food Donor Walmart in Bethel Park", "16 November 2022",
     "https://412foodrescue.org/new-food-donor-bethel-park-walmart/"),
    ("S3", "412 Food Rescue", "412 Food Rescue Celebrates 9 Years with FoodRescueHero Week", "18 March 2024",
     "https://412foodrescue.org/food-rescue-hero-week-2024/"),
    ("S4", "412 Food Rescue", "Volunteer Handbook", "Publication date not stated",
     "https://public.foodrescuehero.org/412_food_rescue_volunteer_handbook.pdf"),
    ("S5", "Food Rescue Hero", "Streamlining for Good Food Rescue Hero Maximizes Impact Through 2023 Tech Improvements", "13 December 2023",
     "https://foodrescuehero.org/streamlining-for-good-food-rescue-hero-maximizes-impact-through-2023-tech-improvements/"),
    ("S6", "Food Rescue Hero", "Operational Efficiency and Automation", "Undated product page",
     "https://foodrescuehero.org/solutions/operational-efficiency/"),
]


def prop(parent, name, value=None):
    node = OxmlElement(name)
    if value is not None:
        node.set(qn("w:val"), str(value))
    parent.append(node)
    return node


def font(run, size=None, bold=None, color="000000"):
    run.font.name = "Arial"
    run.font.color.rgb = RGBColor.from_string(color)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    rpr = run._element.get_or_add_rPr()
    rf = rpr.find(qn("w:rFonts"))
    if rf is None:
        rf = OxmlElement("w:rFonts")
        rpr.insert(0, rf)
    for attr in ("ascii", "hAnsi", "eastAsia", "cs"):
        rf.set(qn(f"w:{attr}"), "Arial")


def hyperlink(p, text, url):
    rel = p.part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    h = OxmlElement("w:hyperlink")
    h.set(qn("r:id"), rel)
    r = OxmlElement("w:r")
    pr = OxmlElement("w:rPr")
    prop(pr, "w:color", "164D72")
    prop(pr, "w:u", "single")
    r.append(pr)
    t = OxmlElement("w:t")
    t.text = text
    r.append(t)
    h.append(r)
    p._p.append(h)


class Report:
    def __init__(self):
        self.d = Document()
        s = self.d.sections[0]
        s.page_width, s.page_height = Inches(8.5), Inches(11)
        s.top_margin, s.bottom_margin = Inches(0.72), Inches(0.68)
        s.left_margin = s.right_margin = Inches(0.75)
        s.header_distance = s.footer_distance = Inches(0.3)
        styles = self.d.styles
        for name in ("Normal", "Title", "Subtitle", "Heading 1", "Heading 2", "Heading 3", "List Bullet", "List Number"):
            st = styles[name]
            st.font.name = "Arial"
            st.font.color.rgb = RGBColor(0, 0, 0)
            # Strip inherited decorative borders and theme colors.
            rpr = st.element.get_or_add_rPr()
            color = rpr.find(qn("w:color"))
            if color is not None:
                for key in list(color.attrib):
                    if key != qn("w:val"):
                        del color.attrib[key]
            ppr = st.element.find(qn("w:pPr"))
            if ppr is not None:
                for node in ppr.findall(qn("w:pBdr")):
                    ppr.remove(node)
        normal = styles["Normal"]
        normal.font.size = Pt(10.5)
        normal.paragraph_format.line_spacing = 1.12
        normal.paragraph_format.space_after = Pt(7)
        styles["Title"].font.size = Pt(27)
        styles["Title"].font.bold = True
        styles["Title"].paragraph_format.space_after = Pt(12)
        styles["Subtitle"].font.size = Pt(12)
        styles["Subtitle"].paragraph_format.space_after = Pt(14)
        for name, size in (("Heading 1", 18), ("Heading 2", 12), ("Heading 3", 10.5)):
            styles[name].font.size = Pt(size)
            styles[name].font.bold = True
            styles[name].paragraph_format.space_before = Pt(12 if name != "Heading 1" else 0)
            styles[name].paragraph_format.space_after = Pt(6)
            styles[name].paragraph_format.keep_with_next = True
        for name in ("List Bullet", "List Number"):
            styles[name].font.size = Pt(10.5)
            styles[name].paragraph_format.space_after = Pt(5)
            styles[name].paragraph_format.line_spacing = 1.1
        header = s.header.paragraphs[0]
        font(header.add_run("RescueRelay"), 9, True)
        header.add_run("    Product and technical reference")
        for r in header.runs:
            font(r, 9)
        footer = s.footer.paragraphs[0]
        footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        font(footer.add_run(f"Version 0.1    |    {DATE}    |    Page "), 8.5)
        fld = OxmlElement("w:fldSimple")
        fld.set(qn("w:instr"), "PAGE")
        footer._p.append(fld)
        core = self.d.core_properties
        core.title = "RescueRelay Product and Technical Documentation"
        core.subject = "Product scope architecture operation and enterprise roadmap"
        core.author = "Krishna Kallamadi"
        core.last_modified_by = "Krishna Kallamadi"
        core.created = datetime(2026, 10, 30, tzinfo=timezone.utc)
        core.modified = datetime(2026, 11, 7, tzinfo=timezone.utc)
        core.keywords = "RescueRelay food rescue recovery coordination technical documentation"
        core.comments = "Synthetic demonstration reference. Not a certification or operational authorization."

    def p(self, text, bold_lead=None, style=None):
        p = self.d.add_paragraph(style=style)
        if bold_lead and text.startswith(bold_lead):
            p.add_run(bold_lead).bold = True
            p.add_run(text[len(bold_lead):])
        else:
            p.add_run(text)
        p.paragraph_format.widow_control = True
        return p

    def h(self, text):
        return self.d.add_heading(text, level=2)

    def page(self, number, title):
        heading = self.d.add_heading(f"{number} {title}", level=1)
        heading.paragraph_format.page_break_before = True

    def bullets(self, items):
        for item in items:
            self.p(item, style="List Bullet")

    def table(self, headings, rows, widths):
        t = self.d.add_table(rows=1, cols=len(headings))
        t.autofit = False
        for j, width in enumerate(widths):
            t.columns[j].width = Inches(width)
        tPr = t._tbl.tblPr
        borders = OxmlElement("w:tblBorders")
        for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
            e = OxmlElement(f"w:{edge}")
            for k, v in {"val": "single", "sz": "4", "color": GRAY}.items():
                e.set(qn(f"w:{k}"), v)
            borders.append(e)
        tPr.append(borders)
        margins = OxmlElement("w:tblCellMar")
        for edge in ("top", "left", "bottom", "right"):
            e = OxmlElement(f"w:{edge}")
            e.set(qn("w:w"), "100")
            e.set(qn("w:type"), "dxa")
            margins.append(e)
        tPr.append(margins)
        prop(t.rows[0]._tr.get_or_add_trPr(), "w:tblHeader")
        for j, heading in enumerate(headings):
            t.rows[0].cells[j].text = heading
        for row in rows:
            cells = t.add_row().cells
            for j, value in enumerate(row):
                cells[j].text = str(value)
        for i, row in enumerate(t.rows):
            prop(row._tr.get_or_add_trPr(), "w:cantSplit")
            for j, cell in enumerate(row.cells):
                cell.width = Inches(widths[j])
                cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
                tcpr = cell._tc.get_or_add_tcPr()
                shade = OxmlElement("w:shd")
                shade.set(qn("w:fill"), NAVY if i == 0 else ("FFFFFF" if i % 2 else PALE))
                tcpr.append(shade)
                for p in cell.paragraphs:
                    p.paragraph_format.space_after = Pt(1)
                    p.paragraph_format.line_spacing = 1.05
                    p.paragraph_format.keep_with_next = i == 0
                    for r in p.runs:
                        font(r, 9.3, i == 0, "FFFFFF" if i == 0 else "000000")
        self.p("").paragraph_format.space_after = Pt(1)
        return t

    def code(self, text):
        p = self.p(text)
        p.paragraph_format.space_after = Pt(9)
        for r in p.runs:
            r.font.name = "Consolas"
            r.font.size = Pt(9.5)
        return p


def build():
    r = Report()
    r.d.add_paragraph("RescueRelay Product and Technical Documentation", "Title")
    r.d.add_paragraph("A local first food rescue recovery coordinator", "Subtitle")
    r.p(f"Author Krishna Kallamadi  •  Reference release 0.1  •  {DATE}")
    r.p("RescueRelay demonstrates how a coordinator can recover a scheduled food rescue when its volunteer becomes unavailable. It combines a shared operational record, constrained replacement planning, understandable evidence and an explicit human approval step. The result is a runnable reference implementation for product evaluation, not a live dispatch service or a certification of safe food handling.")
    r.p("This reference covers the local product, optional AI adapters, operating controls and enterprise evolution. Sections 21 to 24 add the 7 November local AI setup and validation: nine providers are configured, with precise test limits; ElevenLabs remains parked. It is written for product reviewers, developers and food rescue operations leaders. Historical release results and current local tests are identified separately.")
    r.h("The central decision")
    r.p("Keep a human coordinator accountable for every replacement. The planner may collect evidence, reject infeasible candidates, rank feasible options and prepare a proposal. It must not invent availability, silently change a recipient, bypass policy checks or send real-world instructions without an authorized integration and approval.")
    r.table(["Boundary", "Meaning in this release"], [
        ("Implemented reference", "A local application with an API, persistent state, web experience, mobile client source and a bounded recovery workflow."),
        ("Synthetic demonstration", "Seeded identities, locations, rescues and travel estimates are fictional. The in-app outbox does not deliver SMS, email or push notifications."),
        ("Future product", "Real routing, notification delivery, enterprise identity, managed hosting and operational service commitments require additional implementation and validation."),
    ], [1.45, 5.55])
    r.p("Reading path: sections 2–3 cover product evidence; 4–8 technical design; 9–11 setup and release checks; 12–14 operations, roadmap and sources; 15–19 AI workflows and historical service decisions; 20 the web redesign; 21–24 current AI configuration, setup steps and live-test evidence.")

    r.page(2, "Field evidence and product positioning")
    r.p("Food recovery already depends on coordinated relationships between donors, volunteer drivers and receiving organizations. The following published examples ground that model. They are historical descriptions, not evidence that those organizations use RescueRelay, endorse it or experienced the synthetic failure scenarios in this repository.")
    r.h("A recurring multi donor route")
    r.p("Forgotten Harvest described a Wednesday route collecting from Fresh Thyme and Aldi and delivering to Open Door Ministry in Canton. Its September 2024 account shows how more than one donor can feed a recurring local delivery relationship. RescueRelay uses the operational idea of donor, recipient, volunteer and window as separate records; it does not reproduce the named volunteer or real route. [S1]")
    r.h("A donor partnership with several recipients")
    r.p("In November 2022, 412 Food Rescue reported that volunteers were collecting donations from Walmart in Bethel Park for local nonprofit partners. The article does not name the receiving organizations or describe a cancellation. This supports the need to represent donor relationships and recipient acceptance independently, not a claim about emergency recovery. [S2]")
    r.h("A specific donor to housing connection")
    r.p("A March 2024 412 Food Rescue article records a rescue from Giant Eagle in South Side to Allegheny County Housing Authority Dorchester. It illustrates why a receiving location is a concrete operational destination rather than an abstract demand score. No actual delivery data from this example is stored in the demo. [S3]")
    r.h("Existing capabilities and the remaining hypothesis")
    r.p("The 412 Food Rescue handbook allows app substitute requests until one hour before the rescue window and directs volunteers to dispatch within that hour. It also requires staff approval for timing or recipient changes. These are that operator’s documented procedures, not universal rules. [S4]")
    r.p("Food Rescue Hero documented substitute push notifications and improved change tracking in its 2023 technology update. Its current product page advertises last-minute substitutions, food safety alerts and multi-stop route optimization. Replacement notifications and routing are therefore not new categories introduced by RescueRelay. [S5, S6]")
    r.p("The differentiation hypothesis is narrower: a transparent last-hour recovery workspace that makes hard constraints, rejected alternatives, evidence and the approval record easy to inspect. Whether this reduces coordination effort or improves recovery outcomes remains a pilot question, not an established market gap.")

    r.page(3, "People and the recovery workflow")
    r.p("The primary user is the coordinator responsible for a rescue’s operational state. Volunteer and recipient accounts see the portion of the workflow tied to their role. Donors are partner records, not a separate authenticated role in this release. A screen restriction is not sufficient authorization; the API must enforce the same boundaries.")
    r.table(["Role", "Primary responsibility", "Authority boundary"], [
        ("Coordinator", "Maintain operational records and review recovery options.", "Approve or decline a replacement; resolve infeasible incidents."),
        ("Volunteer", "View relevant rescues and report execution or inability to attend.", "Cannot approve a replacement on the coordinator’s behalf."),
        ("Donor partner", "Provide the donation and collection information.", "Coordinator-maintained partner record; no donor login in this release."),
        ("Recipient", "Review incoming food and record receipt.", "Restricted to recipient-linked records and permitted actions."),
    ], [1.0, 3.0, 3.0])
    r.h("The normal operating sequence")
    r.bullets([
        "Establish a donor, recipient and volunteer, with the declared capacity and time-window information needed by the rescue.",
        "Create a permitted donation and schedule a rescue. Treat acceptance and handling conditions as required inputs, not suggestions.",
        "Record volunteer acceptance before pickup, then pickup and delivery through authorized forward-only state transitions. Recipient acknowledgment records receipt after delivery is reported.",
    ])
    r.h("When the volunteer becomes unavailable")
    r.p("A pre-pickup cancellation marks the rescue as needing recovery and records the reason. The coordinator requests a proposal. The planner examines the incident, the current organization state, relevant policy text and available candidate information. It returns feasible replacement options and explains why other options fail the checks.")
    r.p("The coordinator reviews the proposed volunteer, route estimate, pickup and delivery windows, assumptions and rejection reasons; approval applies the planner’s proposed replacements rather than an arbitrary client-supplied candidate. Approval submits the proposal identifier and current version information. The server rechecks the plan against current state before recording the replacement, audit event and in-app notification records.")
    r.h("A meaningful negative outcome")
    r.p("If no candidate satisfies the constraints, the correct result is an escalation, not a fabricated replacement. A human can contact the relevant parties through their established channels, determine whether an operationally safe alternative exists, or cancel the rescue. The application must not imply that an unresolved incident has been recovered.")

    r.page(4, "Architecture and repository structure")
    r.p("The repository is a TypeScript workspace with an API, a responsive browser client, an Expo mobile client and shared contracts. The API is the authority for identity, organization-scoped state, recovery decisions and writes. Clients present that state and submit bounded commands; they do not decide whether an approval is valid.")
    r.table(["Location", "Responsibility", "Boundary"], [
        ("apps/api", "Fastify HTTP API, authentication, persistence, domain commands and recovery planning.", "Node 24 process and local SQLite database."),
        ("apps/web", "React and Vite coordinator and role-specific browser experience.", "Uses API contracts rather than direct database access."),
        ("apps/mobile", "Expo and React Native mobile workflow source.", "Shares the API; device builds and distribution are separate steps."),
        ("packages/shared", "Shared TypeScript request, response and domain contracts.", "Reduces client and server schema drift."),
        ("docs and scripts", "Build explanation, reference material and verification utilities.", "Operational guidance is distinct from executable enforcement."),
    ], [1.3, 3.4, 2.3])
    r.h("Request and data flow")
    r.p("A browser or phone authenticates to the API. The server resolves the session to a user and organization, validates the requested operation, reads the current aggregate and applies the relevant role and domain checks. A successful mutation commits the new state and associated records. The client refreshes from the API rather than assuming that a click succeeded.")
    r.p("For recovery, the flow is incident → evidence collection → deterministic constraint checks → proposal → human approval → transactional revalidation and commit. Optional provider investigation uses read-only tools; deterministic checks are recomputed before a proposal is persisted. Provider prose cannot transform an invalid candidate into a valid one.")
    r.h("Why a local aggregate")
    r.p("The reference uses SQLite and a versioned organization aggregate to make a small, single-host system understandable and repeatable. A complete organization update can be checked and committed atomically. This is a deliberate local architecture, not a claim that a single JSON aggregate is the right storage model for a national food rescue network.")
    r.p("External routing and message delivery are not required for the deterministic demo. That removes API keys, live contacts and provider availability from the core demonstration, while keeping the integration seams visible for future development.")

    r.page(5, "Data model and lifecycle")
    r.p("The domain separates the physical donation, the rescue that transports it and the recovery proposal. A disruption is represented by the rescue status and cancellation reason rather than a separate incident table; a custody flag preserves whether food is still held during escalation. This makes a decision explainable without confusing the food record with the proposed replacement.")
    r.table(["Record", "Purpose", "Important relationship"], [
        ("Organization and user", "Identity and access scope.", "A session resolves to an organization and an authorized role."),
        ("Donor and recipient", "Collection point and receiving partner.", "A rescue connects the correct donation source and destination."),
        ("Volunteer", "Declared availability, capacity and operational linkage.", "Candidate eligibility is checked for a specific rescue."),
        ("Donation and rescue", "Food record, windows, volunteer, acceptance, custody and lifecycle.", "Forward transitions and human resolution preserve operational context."),
        ("Recovery plan", "Affected rescue identifiers, candidate evidence and proposed replacements.", "Approval refers to a proposal built from a particular state."),
        ("Audit and outbox", "Trace of changes and prepared in-app notifications.", "Records accompany a successful state mutation."),
    ], [1.5, 2.7, 2.8])
    r.h("Versioning and stale decisions")
    r.p("A proposal is a snapshot-based recommendation. Between generation and approval, another coordinator may update the rescue, a volunteer may become unavailable or the time may advance. The expected state version and ten-minute proposal expiry prevent an old proposal from being applied as though nothing changed. A conflict requires refreshing the state and generating or reviewing a new proposal.")
    r.h("Idempotency and retries")
    r.p("An approval is a mutation, not a request to send the same command repeatedly. An idempotency key lets the server recognize a retry of the same logical action. Together with a transaction and version check, this reduces duplicate effects when a client loses a response. It does not provide exactly-once delivery to a future external notification provider.")
    r.h("Food and identity boundaries")
    r.p("The initial domain is intentionally restricted to sealed shelf-stable goods. A successful policy check means only that declared demo data satisfies the implemented rules. It does not inspect food, establish temperatures, verify a driver’s real credentials or replace an operator’s acceptance procedures.")
    r.p("All seeded entities are synthetic. Real contact details, household histories and sensitive recipient information should not be added to a demonstration database. A future pilot needs a documented data inventory, purpose, access model and retention schedule before collecting them.")

    r.page(6, "Bounded planning and approval controls")
    r.p("The default recovery agent is an offline, state-driven planner. It is bounded because the available tools, checks and permissible outcomes are constrained by code. It is explainable because a proposal carries evidence, candidate reasoning and rejection information rather than only a recommendation label.")
    r.h("Evidence before recommendation")
    r.p("Planning starts with the incident and current operational state. Policy retrieval scores token overlap and matching policy scopes, then returns up to five persisted policy passages with their identifiers and versions. Route estimates are deterministic demo inputs or calculations, not live traffic predictions. The interface must keep their synthetic status visible so a short estimate is never confused with a verified arrival time.")
    r.h("Feasibility before ranking")
    r.p("Hard checks cover sealed shelf-stable handling, availability, recorded training, vehicle capacity, no other active rescue or held custody, recipient category and UTC-day receiving capacity, pickup and delivery windows, and volunteer availability through completion. The planner includes ten minutes at each stop and a five-minute closing buffer. Only feasible candidates are ranked, preferring less travel and closer capacity fit. Maximum bipartite matching finds one-to-one coverage across feasible candidates and can revise earlier choices for scarce volunteers. Every targeted rescue must be covered before approval. Local score preferences do not guarantee minimum total travel; this is not a global route optimizer.")
    r.table(["Control", "Required behavior", "Failure response"], [
        ("Constraint checks", "Evaluate candidate facts before recommending.", "Explain rejection; do not hide it inside a score."),
        ("Human approval", "Require an authorized coordinator to review and approve.", "Leave the proposal unapplied."),
        ("Fresh state", "Revalidate inside the approval write path.", "Reject stale or newly infeasible proposals."),
        ("No feasible option", "Preserve the incident as unresolved.", "Escalate for human coordination."),
        ("Provider investigation", "Allow read-only tools and bounded evidence gathering.", "Reject unsafe tools, invalid scope or missing evidence."),
    ], [1.4, 3.1, 2.5])
    r.h("Optional provider investigation")
    r.p("With server-only configuration, explicit enable flags and an exact one-use consent, a selected Fireworks, Nebius or OpenAI model may select read-only tools to inspect incidents, retrieve policies, inspect volunteers, check candidates or ask for clarification. The loop permits at most six turns and ten tool calls. Strict schemas and rescue scope checks reject unsupported requests. Required evidence is checked and the deterministic planner recomputes the result. The model cannot write, dispatch or override constraints; provider mode is not required for the offline demo.")
    r.p("The planner does not contact real volunteers, procure transport or certify food. A disruption after pickup preserves custody and escalates to a person; it cannot return to automated recovery while food remains held.")

    r.page(7, "Identity security and privacy")
    r.p("The local system includes authentication and authorization controls, but those controls do not by themselves establish enterprise security. The distinction is important: a development demonstration can show correct boundaries while still requiring independent review, hardened deployment and operational monitoring.")
    r.h("Authentication and organization scope")
    r.p("Passwords of at least 12 characters are hashed with scrypt. Sessions use random opaque tokens, SHA-256 server-side token hashes and an eight-hour expiry. Web tokens stay in memory; the mobile client uses OS secure storage when available, with memory-only fallback. The server derives organization identity and role from the authenticated session, rather than trusting a client-supplied role. Registration creates a separate organization instead of allowing a user to grant themselves privileges in an existing one.")
    r.p("Reads and mutations must be scoped to the authenticated organization. Role-specific views expose the relevant subset of data, and domain actions apply authorization again on the server. Cross-organization identifiers must not bypass these checks. Donor location, receiving constraints and volunteer eligibility cannot change while an active rescue or held custody depends on them.")
    r.h("Demo mode is an explicit local convenience")
    r.p("The example configuration binds the API to loopback and enables synthetic demo access. A separate opt-in permits a private local network phone test. Demo access must be disabled before any deployment containing real data. A network-accessible demo is not safe merely because the data began as synthetic.")
    r.table(["Risk", "Reference control", "Additional production work"], [
        ("Unauthorized actions", "Session identity, role checks and scoped state.", "Independent authorization review and broader adversarial tests."),
        ("Concurrent changes", "Version check, transaction and idempotency.", "Distributed concurrency design and delivery reconciliation."),
        ("Secret leakage", "Environment-based provider configuration.", "Managed secrets, rotation and deployment log review."),
        ("Personal data exposure", "Synthetic seed data and role-filtered reads.", "Data minimization, retention, deletion and access audit process."),
        ("Host compromise", "Local deployment boundary.", "TLS, patching, encryption policy, backups and incident response."),
    ], [1.35, 2.7, 2.95])
    r.h("Privacy by operational necessity")
    r.p("Only collect information needed to coordinate the rescue. Do not turn recipient vulnerability, household histories or personal circumstances into ranking features. An enterprise design should separate partner contact data from general operational metrics, restrict exports and ensure that optional explanation providers receive the smallest justified payload.")
    r.p("No security certification, legal compliance determination or food safety certification is asserted by this document. The deployment owner remains responsible for jurisdiction-specific review and operating procedures.")

    r.page(8, "Interfaces and integration boundaries")
    r.p("The API is the stable boundary between the user experiences and the operational state. The shared TypeScript contracts describe data shapes; server validation, authentication and domain rules determine whether an operation is allowed. Refer to the repository API documentation and route definitions for exact paths and payloads.")
    r.table(["Interface group", "Purpose", "Important behavior"], [
        ("Identity", "Register, authenticate, resolve and end a session.", "Never accept a client role as authority."),
        ("Operational state", "Read relevant partners, volunteers, donations and rescues.", "Scope every response to the session and role."),
        ("Domain commands", "Create records and record permitted lifecycle events.", "Validate state transitions on the server."),
        ("Recovery", "Open an incident, generate a proposal and apply approval.", "Keep planning separate from committing the change."),
        ("Data utilities", "Validate imports and export permitted data.", "Treat uploaded content as untrusted input."),
        ("Audit and outbox", "Inspect changes and prepared notification records.", "An outbox entry is not proof of delivery to a person."),
    ], [1.35, 2.85, 2.8])
    r.h("A notification seam rather than a messaging claim")
    r.p("The demonstration records notifications in an in-app outbox. It does not send SMS, email, mobile push or voice calls. A real delivery adapter would need recipient verification, consent and preference handling, delivery identifiers, retries, provider callbacks, deduplication and clear distinction between queued, accepted and delivered states.")
    r.h("A route seam rather than live navigation")
    r.p("Synthetic travel estimates make scenarios reproducible. A routing integration would need supported geography, rate limits, latency handling, fallback behavior and explicit uncertainty. A real ETA should be revalidated near approval and execution; live routing alone still cannot confirm that a volunteer is willing or that a receiving site is ready.")
    r.h("Data portability and future integrations")
    r.p("CSV donation validation and all-or-nothing import accept at most 200 rows. Donations and audit events can be exported, with formula-safe CSV cells. These utilities are not a substitute for a durable integration contract. Future partner connectors should use versioned schemas, scoped credentials and reconciliation reports. Imported rows must not grant roles, override organization identity or bypass the same domain rules used by the UI.")
    r.p("Keep external adapters behind narrow interfaces. The domain should remain testable without provider credentials, and the deterministic evaluation scenarios should remain available even after real services are introduced.")

    r.page(9, "Local setup and demonstration")
    r.p("Use the repository README as the executable setup reference. The baseline is Node 24 and npm workspaces. Run the API and browser locally first; add a phone only after the same workflow succeeds in a desktop browser. Never place real operating data in a test environment simply to make the demonstration look more realistic.")
    r.h("Start the local application")
    r.code("git clone https://github.com/krish339-ai/RescueRelay.git\ncd RescueRelay\nnpm ci\ncp .env.example .env\nnpm run dev")
    r.p("These commands initialize a new clone of the public repository. Preserve the existing .env when updating an already configured checkout.")
    r.p("Development binds the API to 127.0.0.1:4000 and Vite to 127.0.0.1:5173. For a same-origin local preview, run npm run build -w @rescuerelay/web, then npm start; open http://127.0.0.1:4000. This is local serving, not public deployment. Keep database paths, client API settings and permitted origins explicit. SQLite state persists across restarts; reset scenarios deliberately.")
    r.h("Walk through a recovery")
    r.bullets([
        "Enter the synthetic demo as a coordinator and inspect the seeded rescue, donation, receiving policy and volunteer information.",
        "Open the baseline rescue from Harbor Market to Maple Community Kitchen, already marked as needing recovery after a synthetic vehicle problem. Its timing is regenerated when the demo scenario is reset.",
        "Generate a recovery proposal. Read the evidence, route assumptions, selected candidate and rejected candidates before approving.",
        "Approve once, then refresh. Confirm that the volunteer and lifecycle reflect the successful write, with acceptance still required, and that audit and in-app outbox records are visible.",
        "Repeat with an infeasible scenario. Confirm that the application escalates without inventing a viable volunteer or silently relaxing a constraint.",
    ])
    r.h("Check failure handling deliberately")
    r.p("Generate a proposal, change relevant state through another authorized action and attempt to apply the old proposal. The expected result is a stale-state rejection, followed by a refresh and a new planning pass. Retry a successful approval with the same idempotency key to evaluate duplicate protection rather than repeatedly pressing unrelated controls.")
    r.h("Verification commands")
    r.code("npm run verify")
    r.p("The combined gate runs typecheck, test, test:integration, eval and build. Run an individual npm script when diagnosing its stage.")
    r.p("A successful command is evidence only for the code and environment actually exercised. The verification record distinguishes automated checks, browser observations, export checks and untested physical-device behavior. Do not translate a successful web build into a claim that an iOS binary was tested.")

    r.page(10, "Web phone Android and iOS support")
    r.p("RescueRelay uses two delivery paths: a responsive web experience for browsers, including phone browsers, and an Expo mobile codebase intended for Android and iOS. They share the API and business rules. Platform compatibility describes an implementation path; it is not the same as a published application or a completed device certification matrix.")
    r.table(["Target", "Delivery path", "Release boundary"], [
        ("Desktop web", "React and Vite browser client.", "Build and browser checks are recorded separately."),
        ("Phone browser", "Responsive layout using the same web application.", "Requires a reachable API and a supported browser; not a native binary."),
        ("Installable web", "Web manifest and application shell where configured.", "Installation depends on browser and deployment conditions; offline writes are not promised."),
        ("Android", "Expo and React Native source using the common API.", "Export validation is distinct from a signed build and real-device testing."),
        ("iOS", "Expo and React Native source using the common API.", "Signing, Apple tooling and device validation are separate release tasks."),
    ], [1.15, 2.5, 3.35])
    r.h("Private network phone testing")
    r.p("A phone cannot reach the development computer through its own 127.0.0.1 address. For an authorized private network test, expose the API on the intended local interface, configure the explicit LAN demo opt-in and set the client API URL to that computer’s reachable address. For a native development binary using HTTP, the mobile build also requires RESCUERELAY_ALLOW_HTTP_DEV=true; never enable that flag for a release or store build. Limit exposure with the host firewall and return to loopback defaults afterwards.")
    r.h("Client responsibilities and connectivity")
    r.p("The mobile client supports daily rescue work, recovery review and approval, lifecycle actions, availability and notifications. Master data, user creation and CSV tools belong to the web workspace. Stored timestamps are UTC; mobile times are displayed in the device’s local timezone.")
    r.p("The client should distinguish an API error from an empty list and should not represent a disconnected mutation as a completed rescue. An application shell cache does not make authenticated operational writes safe offline. Offline command queues and conflict resolution remain a separate design problem.")
    r.p("Readable labels, keyboard use, responsive layouts, visible focus and adequate target sizes are important evaluation criteria. A complete accessibility claim requires systematic keyboard and assistive-technology testing on the actual supported platforms. This reference does not claim conformance certification.")
    r.h("Distribution remains a product gate")
    r.p("There is no claim of App Store or Google Play availability. Before distribution, complete signing, privacy disclosures, permissions review, device testing, crash reporting, version policy and support procedures. Public hosting and real partner onboarding also require an explicit deployment and security decision.")

    r.page(11, "Verification and evaluation")
    r.p("Automated checks, observed client journeys and real operational effectiveness are different measures. The first two have bounded evidence below. The third requires a governed pilot with an existing-workflow baseline; no real food recovery or labor saving is claimed.")
    r.h("Executed baseline evidence")
    r.p("The final baseline GitHub Actions run 41100222611 passed at 17:37:43 UTC on 30 October 2026 for revision 19aea24. Its observed logs record 55 tests: 20 API, 8 native-client, 6 web and 21 independent QA. Strict TypeScript, separate native real-API integration, 12 synthetic evaluations, web build and Android/iOS/web exports also passed. Provider checks used mocks, with no external provider call.")
    r.table(["Evidence", "Observed result", "Boundary"], [
        ("Automated gate", "55/55 in the final baseline CI run; authorization, constraints, races, persistence and transport covered.", "Not exhaustive security or load testing."),
        ("Evaluation", "12/12 synthetic scenarios; no assignment mutation during generation.", "Not a field impact or accuracy estimate."),
        ("Web browser", "Final 17:30 UTC review passed at desktop 1182 and narrow 500 CSS pixels, using the actual web server and API.", "Not exact 390-pixel application, physical touch, offline shell or installation verification."),
        ("Native client", "8 unit tests, real-API transport, strict types and all exports passed; a separate React Native Web 430-pixel canvas journey passed.", "Not Android/iOS runtime, SecureStore hardware, signing or store distribution."),
    ], [1.3, 3.65, 2.05])
    r.p("The browser pass covered recovery evidence and approval, role-scoped acceptance through receipt, CSV positive and negative cases, no-capacity escalation, navigation focus, and actual API outage feedback followed by restart recovery. These results are in docs/qa-review.md. The earlier 17:09 UTC local aggregate had 54 tests; the final 55-test baseline is separately verified, not inferred. The final local AI-extension aggregate at 18:05 UTC passed 125 tests: API 33, native 19, web 19 and independent QA 54. Nine native real-API checkpoints, 12 offline evaluations, typechecks and all platform exports passed. Implementation revision 5a861989 also passed GitHub Actions run 41106211194. This release closure records that result; its publication and file delivery are separate.")
    r.h("Dependency and release limits")
    r.p("Both local and CI audits report 0 critical, high or moderate findings. The local snapshot has 14 propagated low entries; final baseline CI has 8. Both are rooted in the same deepmerge build-configuration advisory. An audit exit code of 0 is not an all-clear. Use trusted configuration and re-audit after changes.")
    r.h("Pilot metrics for a future release")
    r.p("Measure incident-to-decision time, coordinator rejection reasons, stale-plan conflicts and unresolved incidents. Track completed deliveries separately from approved proposals: a proposed replacement is not a rescued meal. Compare against the operator’s current workflow with consent and a defined observation period. Review workload distribution and failure cases, not just average speed.")

    r.page(12, "Operations and failure management")
    r.p("The reference is designed for a controlled single-host environment. Application state is not independent real-world confirmation: an audit entry records a software action, not proof that a volunteer arrived or food was acceptable. After escalation, a coordinator records a reason and resolves the rescue as delivered or cancelled, or resumes recovery only when no food remains in custody. Held custody blocks that automated recovery path.")
    r.h("Configuration and state")
    r.p("Keep environment files and database files out of source control. Review demo mode, bind address, allowed origins, database path and provider mode before starting a deployment. Use a durable writable location for a database that must survive restarts. Do not run multiple independent application instances against assumptions intended for one local process.")
    r.p("The local db:backup, db:check and db:restore scripts in scripts/database.mjs support schema version 1. Backup uses VACUUM INTO for a consistent SQLite snapshot including committed write-ahead-log data. Backup and restore require a new destination; they refuse to overwrite a database. Restore invalidates sessions. Stop the API, point DATABASE_PATH to the checked restored file, restart and verify with a fresh login. Protect snapshots because they contain operational data and password hashes. These utilities are not a managed backup service; retention, restoration drills and recovery objectives remain operating responsibilities.")
    r.table(["Condition", "Operator response", "Do not do this"], [
        ("API unavailable", "Check process, configuration, database access and logs; refresh after recovery.", "Assume a failed request completed because the UI was clicked."),
        ("Stale proposal", "Refresh current state and generate or review a new plan.", "Remove the version check to force an approval."),
        ("No feasible candidate", "Escalate through established operational channels.", "Relax food, capacity or acceptance constraints silently."),
        ("Provider failure", "Select offline planning explicitly and inspect the failure.", "Let generated text authorize an otherwise invalid change."),
        ("Notification in outbox", "Treat it as an in-app record only.", "Tell an operator that a person received a message."),
    ], [1.35, 3.0, 2.65])
    r.h("Release and incident discipline")
    r.p("Before updating a shared test installation, preserve the previous version, verify database compatibility and run the documented verification gates. After an incident, record the timeline, affected state, user-visible outcome and recovery action without placing sensitive data or credentials in logs.")
    r.p("For a future pilot, appoint an operational owner and a technical on-call owner, define service hours and manual fallback procedures, and rehearse restoring service. Availability targets, support commitments and escalation response times should be negotiated from evidence rather than implied by the presence of an application.")

    r.page(13, "Enterprise product roadmap")
    r.p("The enterprise direction is a governed recovery coordination layer that can coexist with established rescue platforms. Progress should be gated by evidence and operational readiness, not by adding an autonomous action to every workflow. The following capabilities are proposed work, not features represented as shipped.")
    r.table(["Stage", "Product and engineering work", "Exit evidence"], [
        ("Controlled pilot", "Partner discovery, approved data inventory, realistic policies, user training and manual fallback.", "Operators can explain decisions and recover safely from failed proposals."),
        ("Reliable integrations", "Live route provider, consent-aware messaging, provider webhooks, retry workers and delivery reconciliation.", "Measured failure handling and no false delivery confirmations."),
        ("Enterprise foundation", "PostgreSQL data model, tenant isolation strategy, SSO, granular permissions and audited administration.", "Security review, migration tests and organization-boundary tests."),
        ("Operational resilience", "Managed deployment, monitoring, backups, restore drills, incident response and service ownership.", "Measured recovery objectives and rehearsed rollback."),
        ("Multi-region growth", "Regional policy configuration, localization, integrations and controlled optimization experiments.", "Evidence of benefit without weaker safety or unequal service."),
    ], [1.3, 3.5, 2.2])
    r.h("Product validation before scale")
    r.p("Interview dispatchers using current substitute and routing tools. Ask which facts are missing at the moment of a disruption, how they decide that a replacement is acceptable, and which explanations they need to trust or reject a proposal. Validate the recovery workspace against those answers rather than assuming an unserved market.")
    r.h("Engineering evolution")
    r.p("Move from a single-host aggregate to a normalized transactional model only when the required concurrency, reporting or integration patterns justify it. Add durable background jobs for external effects and use an explicit event or outbox contract. Keep domain checks deterministic and maintain a replayable evaluation suite through the migration.")
    r.h("Responsible automation")
    r.p("Any future automation beyond proposal preparation needs a specific authority model, measurable failure bounds and a reversible operating procedure. Do not use personal vulnerability as a routing shortcut or treat a model’s confidence as consent. Human approval, visible uncertainty and a clear escalation path remain central product requirements.")
    r.p("Enterprise readiness is an outcome of validated controls, operating processes and user evidence. It is not a label supplied by a framework choice, a successful build or a polished demonstration.")

    r.page(14, "Sources and document control")
    r.p("The primary sources below were checked on 30 October 2026. Historical examples establish context only. Product pages describe the publisher’s claims, not an independent benchmark. Bracketed source identifiers in this document map to these entries; links open the original publications.")
    for sid, author, title, published, url in SOURCES:
        r.h(f"{sid} {author}")
        p = r.p("")
        hyperlink(p, title, url)
        p.add_run(f". {published}.")
        if sid == "S4":
            r.p("Relevant material: PDF pages 6–7 for staff-approved changes and substitute-request timing. The PDF cover is counted as page 1.")
    r.h("Implementation references")
    r.p("Use README.md for current startup instructions, docs/verification.md for executed checks, the API route definitions for exact endpoints, packages/shared for domain contracts and the HTML build guide for the implementation narrative. Source code and observed execution take precedence if documentation and behavior diverge.")
    r.h("About the author")
    r.p("Krishna Kallamadi describes more than 16 years of work with on-premises and cloud databases, including healthcare and insurance, spanning database administration, performance, migration, data engineering and architecture. His stated focus includes automation, security and AI engineering, and his published profile lists AWS Certified AI Practitioner. This biography follows his published DataQualityAgent repository profile.")
    p = r.p("")
    hyperlink(p, "Author source", "https://github.com/krish339-ai/DataQualityAgent")
    p.add_run("  •  ")
    hyperlink(p, "GitHub", "https://github.com/krish339-ai")
    p.add_run("  •  ")
    hyperlink(p, "LinkedIn", "https://www.linkedin.com/in/krishna-kishore-kallamadi-a22b498/")
    r.p("No real donor, volunteer or recipient contact information is reproduced. No affiliation with the cited organizations is implied. No production deployment, app-store release, security certification or food safety certification is claimed.")
    r.page(15, "Optional AI workflows and safeguards")
    r.p("The offline product remains usable without a paid service. Ten selected adapters support optional reasoning, reference search, document ingestion, preferences, tracing and voice drafts. Seven additional services are alternatives or deferred tools. The following matrix is generated from the same 17-service decision file used by the HTML guide and roadmap.")
    r.h("Example of a disrupted pantry pickup")
    r.p("In the fictional Harbor Market rescue, a volunteer cancels before pickup. A coordinator can ask the selected model to inspect the incident, approved policy evidence and feasible replacements. The local consent screen identifies the provider, model, actual sanitized evidence, payload hash and request budget. The model can investigate but cannot assign a volunteer. The coordinator reviews the proposal; deterministic constraints and current state are checked again when approving it. Volunteer acceptance, pickup, delivery and recipient receipt remain separate steps.")
    r.h("Example of adding partner guidance")
    r.p("A coordinator uploads an authorized pantry handbook for LlamaParse processing, then separately requests its status. Parsed material remains a reference draft until a person reviews its title, text and scope. An approved reference can be indexed through a separate Pinecone consent. The app sends deterministic, attributed chunks to an existing compatible index; an accepted asynchronous upsert does not prove immediate search visibility. Retrieved references inform explanations and never replace configured safety or capacity constraints.")
    r.h("Example of a spoken donation note")
    r.p("A market operator supplies an authorized recording describing sealed shelf-stable food. ElevenLabs transcription creates a rescue-note draft. A person must complete and validate the donor, category, weight, servings and pickup window before it becomes a donation. Transcription does not infer safe handling, create an assignment or call a driver. Web AI Studio supports document/audio uploads; the native AI Assist surface supports capability status, investigation consent, approval and operation receipts.")
    r.h("Consent and failure handling")
    r.p("Every external operation is disabled by default. One-use consent is tied to actor, organization, state version, exact input and expiry. Unknown future model output is disclosed as dynamic rather than falsely previewed. No startup call, hidden vendor fallback or automatic mutation replay occurs. Actor-scoped receipts preserve known remote identifiers and partial or uncertain outcomes for human recovery; stale results cannot silently change domain state. File-byte and request-count limits are not verified page, audio-duration or spending limits.")

    decisions = json.loads((HERE / "ai-service-decisions.json").read_text())
    runtime = [item for item in decisions["services"] if item["runtime_provider_id"]]
    deferred = [item for item in decisions["services"] if not item["runtime_provider_id"]]
    for number, title, items in [
        (16, "Selected AI services for reasoning and discovery", runtime[:5]),
        (17, "Selected AI services for memory ingestion and voice", runtime[5:]),
        (18, "Alternative services and human evaluation", deferred[:4]),
        (19, "Optional development and future integrations", deferred[4:]),
    ]:
        r.page(number, title)
        r.p("This matrix preserves the 30 October release checkpoint from docs/ai-service-decisions.json, when live services were off and unverified. Sections 21 to 24 record the later local setup and bounded live tests. A passed mock alone does not establish live access or vendor performance.")
        r.table(["Service", "Use case and boundary", "Implementation and verification"],
            [(item["service"], item["role"], item["status"]) for item in items], [1.25, 3.5, 2.25])
        r.h("Official service references")
        for item in items:
            p = r.p("")
            hyperlink(p, item["service"], item["source"])
        if number == 19:
            r.h("Before any live test")
            r.bullets([
                "Verify the intended account, model or index, API entitlement and current vendor terms. A ChatGPT subscription alone does not establish usable API access.",
                "Configure credentials only through an approved private server-side setup. Never place keys in client code, source control, chat or screenshots.",
                "Approve the exact provider, permitted data, retention implications and bounded test cost. Use appropriate vendor-side budget controls; local byte limits do not enforce a monetary cap.",
                "Use synthetic or approved redacted material first. Inspect receipts and vendor usage before repeating any uncertain operation. No live activation is required to use the local offline demo.",
            ])
            r.p("Project delivery does not provision hosting, GPU instances, external accounts, notification delivery or app-store releases. These remain explicit later decisions, not hidden dependencies of the reference product.")
    r.page(20, "Pipeline workspace and current release checks")
    r.p("The selected web design is Rescue Pipeline with Liquid/Organic animation. A full-width workspace and grouped top navigation replace the earlier internal layout. This is a presentation change over the existing API and role-scoped records, not a new dispatch engine. The separate Expo native screens are unchanged.")
    r.h("Read the actual rescue state")
    r.p("Open the pipeline to inspect recovery, approval, acceptance, assigned and in-transit lanes. Each rescue appears in one lane. Approval requires a ready, current-version, unexpired proposal at the last snapshot; the server still rechecks expiry and constraints when approval is submitted. An assignment without acceptance remains in acceptance. Escalated or unassigned work stays in recovery. Completed, Cancelled and All views keep terminal records accessible; delivery is distinct from recipient acknowledgment.")
    r.p("Open a rescue or proposal through its existing detail link to act. Coordinator, volunteer and recipient restrictions remain enforced; the board does not enable drag-to-dispatch. Custody warnings, stale/offline indicators, audit history, recovery evidence, AI Studio and existing routes remain available within their role boundaries.")
    r.h("Readability and motion")
    r.p("Body and control text use a local system sans-serif stack at 16px, with 14px supporting text and 12px section labels. Framer Motion provides spring entry, a selected-navigation indicator and brief attention settling. System and local reduced-motion controls are implemented. Browser review checked local reduced-motion preference persistence. OS preference emulation and exact frame timing were not exercised; no accessibility certification is claimed.")
    r.h("Windows launchers")
    r.p("After npm ci, use start.bat, stop.bat or restart.bat from the checkout; PowerShell uses .\\start.bat. Paths are resolved from the launcher, not a fixed drive or username. Windows 10/11, PowerShell 5.1+, Node 24.x and npm 11+ are required. The launchers bind to loopback ports 5173 and 4000 and stop only their verified owned session. External AI defaults off; the updated launcher honors explicit root .env settings, while existing process environment values take precedence. Restart after configuration changes. A port conflict is reported, not silently reassigned.")
    r.h("Current verification boundary")
    r.p("Initial local checks passed 130 tests, 9 native/API checkpoints, 12 offline evaluations with zero provider calls, typechecks and web build. Aggregate verify failed when Expo was killed with SIGKILL; an all-platform --max-workers 1 retry exited 0. After the terminal-label fix, fresh GitHub Actions run 41128268002 passed for revision 9057ea4: 131 tests (API 33, native 19, web 25, QA 54), 12 evaluations with zero provider calls and all platform exports. Both aggregate verification and Windows launcher jobs succeeded.")
    r.p("Actual-app desktop and approximately 500px narrow review passed, including role scopes, the volunteer Accept dialog, terminal receipt distinction, rapid navigation/refresh and local reduced-motion persistence. Windows pulled revision 9057ea4 and passed full verification: 130 passed, zero failed, one existing POSIX-only test skipped; 9 integration checkpoints, 12 evaluations, all exports and 24 launcher assertions passed. Direct/proxied health and served pipeline assets returned HTTP 200. Windows browser visuals were not exercised locally. These 30 October results describe their own revisions, when all live services were off and unverified. The later local provider results follow; no live dispatch, native-device certification or production readiness is claimed.")
    append_ai_setup(r)
    return r.d


def append_ai_setup(r):
    r.page(21, "Local AI configuration and validation")
    r.p("On 7 November 2026, nine providers were configured and enabled in the private local settings. After restart, an authenticated demo coordinator checked the capability endpoint: all nine were configured, enabled and available with no missing settings. ElevenLabs remains parked. This local readiness check does not mean every provider workflow passed end to end.")
    r.table(["Provider", "Observed live result", "Still untested"], [
        ("Fireworks AI", "Model lookup and correct arithmetic completion; 56 tokens total.", "In-app investigation and tool calling."),
        ("Nebius Token Factory", "Model catalog and correct arithmetic completion; 67 tokens total.", "In-app investigation and tool calling."),
        ("OpenAI", "Model lookup and correct Responses arithmetic result; 25 tokens total.", "In-app investigation."),
        ("Pinecone", "Ready index; one real upsert and retrieval through isolated app routes.", "Running demo policy population and browser review flow."),
        ("Tavily", "Usage authentication and public USDA search; one result and one reported credit.", "In-app reference draft review and approval."),
        ("Keenable", "Authenticated public USDA search; one result.", "In-app reference draft review and approval."),
        ("Mem0", "Authenticated ping resolved the project.", "Memory save, recall and delete."),
        ("LangSmith", "Saved key read the Local tracing destination; scope and project verified.", "Trace ingestion and display."),
        ("LlamaParse", "Authenticated jobs listing; tier and version accepted.", "Document upload and parsing."),
        ("ElevenLabs", "Parked; disabled and unconfigured.", "Key, model and transcription."),
    ], [1.25, 3.2, 2.55])
    r.h("What the demo account verified")
    r.p("The check signed in through the real local demo coordinator API, read /api/ai/capabilities and signed out. Direct provider tests used the saved credentials separately. Pinecone used the actual application routes in an isolated in-memory instance. None of these results is a browser interaction test or a live food-rescue investigation.")
    r.h("How to interpret the status label")
    r.p("AI Studio currently shows a hardcoded Live testing unverified label; the capability field liveTested remains false. The app does not ingest these manual test results. Use this dated record for actual coverage. Credentials remain private and no full account balances, spending caps or production reliability were verified.")

    r.page(22, "Configure credentials and provider settings")
    r.p("These steps describe the completed local setup and how a teammate can configure their own checkout. API keys authorize the account that owns them; eligible usage is billed to that account. Credit availability does not replace an API key.")
    r.bullets([
        "Step 1  Open the repository root. If .env is absent, copy .env.example to .env. Preserve an existing file and its values. Confirm .env is ignored by Git before entering credentials.",
        "Step 2  In each provider account, create an API key and save it directly in the matching server-side setting below. Do not put it in the browser, client code, screenshots or documentation.",
        "Step 3  Save the additional settings shown below. Models and resources must be accessible to the same account or workspace as the key. The values record this session, not a promise of future model availability.",
    ])
    r.table(["Provider", "Credential setting", "Additional setting or requirement"], [
        ("Fireworks", "FIREWORKS_API_KEY", "FIREWORKS_MODEL=\naccounts/fireworks/models/glm-5p3-flash"),
        ("Nebius", "NEBIUS_API_KEY", "NEBIUS_MODEL=zai-org/GLM-5.3-Flash"),
        ("OpenAI", "OPENAI_API_KEY", "OPENAI_MODEL=gpt-6-luna"),
        ("Pinecone", "PINECONE_API_KEY", "PINECONE_INDEX_HOST from the verified index; see section 23."),
        ("Tavily", "TAVILY_API_KEY", "Retain the approved source-domain allowlist."),
        ("Keenable", "KEENABLE_API_KEY", "Use the explicitly selected search provider and approved site."),
        ("Mem0", "MEM0_API_KEY", "Key must resolve the intended Mem0 project."),
        ("LangSmith", "LANGSMITH_API_KEY", "LANGSMITH_PROJECT and workspace scope; see section 23."),
        ("LlamaParse", "LLAMA_CLOUD_API_KEY", "LLAMAPARSE_TIER=cost_effective\nLLAMAPARSE_VERSION=latest"),
        ("ElevenLabs", "ELEVENLABS_API_KEY", "Parked. ELEVENLABS_STT_MODEL also required before future activation."),
    ], [1.0, 2.5, 3.5])
    r.bullets([
        "Step 4  Validate key access and resource compatibility before enabling a provider. Set AI_EXTERNAL_CALLS_ENABLED=true and the applicable provider flag to true. The nine flags use FIREWORKS, NEBIUS, OPENAI, PINECONE, TAVILY, KEENABLE, MEM0, LANGSMITH and LLAMAPARSE followed by _ENABLED. Keep ELEVENLABS_ENABLED=false.",
        "Step 5  Save the file and run restart.bat. The Windows launcher honors .env; inherited process settings take precedence. Reload the file before later edits if another tool changed it, so a stale editor buffer does not overwrite new settings.",
    ])

    r.page(23, "Create the Pinecone and LangSmith resources")
    r.h("Pinecone policy index")
    r.p("A valid key alone is insufficient: RescueRelay requires a compatible Documents API index. In this session, the RescueRelay key and new index belonged to the existing Default project. A teammate must use the project containing their own key.")
    r.bullets([
        "Step 1  In Pinecone, select the project that lists your API key. Open Database, then Create index. Name the index rescuerelay-policies.",
        "Step 2  Select Serverless capacity, AWS, us-east-1 Virginia and On-demand read capacity.",
        "Step 3  Under Schema definition, add the String field chunk_text. Configure Dense embedding with llama-text-embed-v2, 1024 dimensions and cosine similarity. Full-text search and the additional title field may remain. This form has no separate Index format field.",
        "Step 4  Create the index and wait for Ready. Copy its Host into PINECONE_INDEX_HOST. Verify the schema through index metadata before setting PINECONE_ENABLED=true.",
    ])
    r.p("The application uses Documents API version 2026-07, plain-text embedding and source-attributed results. The new index starts without approved reference content. Creating it does not populate the policy library or authorize importing operational data.")
    r.h("LangSmith Local tracing destination")
    r.bullets([
        "Step 1  In LangSmith Settings, create a Personal Access Token for the intended workspace. This session used Workspace 1. Save it directly as LANGSMITH_API_KEY. A key description is not the tracing project name.",
        "Step 2  Return to the main dashboard. In the agent-based interface, choose Connect an agent. Enter RescueRelay as the Agent name and rescuerelay as the Agent ID, then click Connect agent. The ID is fixed after creation.",
        "Step 3  Select the Local environment. Copy the ID beside Local and verify that destination using the saved key. Read its actual tracing project name and workspace ID; do not guess from the display name.",
        "Step 4  This session resolved LANGSMITH_PROJECT=rescuerelay-local. Save the verified scope in LANGSMITH_WORKSPACE_ID and set LANGSMITH_ENABLED=true, then restart. Different accounts may resolve different names or scopes.",
    ])
    r.p("The destination lookup passed, but no trace was submitted. Waiting for traces is expected until a separately consented traced operation runs. Tracing retention settings do not identify the destination and did not need changing during this setup.")

    r.page(24, "Validate the demo and understand the live tests")
    r.h("Check the running demo")
    r.bullets([
        "Step 1  Start or restart the local application. Open http://127.0.0.1:5173 and sign in as the demo coordinator.",
        "Step 2  Open Workspace, then AI Studio and Tools & Controls. Confirm the intended provider is configured and enabled with no missing settings. This checks readiness; it does not send a provider request.",
        "Step 3  For a live operation, select the provider and a small approved input. Review its consent preview, exact data transfer and request budget before execution. Each search, upload, memory action or trace has its own scope.",
        "Step 4  Inspect the operation receipt and actual result. A completed receipt, an available status and a successful remote result are different facts. Check whether retrieval used local fallback. Do not replay uncertain writes automatically.",
    ])
    r.h("Pinecone test that passed")
    r.p("The running demo had no approved references. An isolated in-memory instance of the real API therefore registered a synthetic coordinator and organization, then seeded one reference fixture labeled SYNTHETIC TEST ONLY Amber Orchard. The fixture was not a human-approved operational policy; draft approval was outside this test.")
    r.p("Indexing and search each passed through the real consent and operation routes with separate one-use consents and the organization's hashed namespace. The transport used live Pinecone, not mocked responses. One upsert returned HTTP 202; the first search returned HTTP 200 and the exact indexed text with its matching source reference and reference_only authority. No local fallback occurred. Total external requests were one write and one search.")
    r.p("The running demo database and configured operational policies stayed unchanged. One labeled synthetic document remains in the isolated test namespace. The ignored local test report records its namespace and document ID for inspection or cleanup. The real demo account still has no approved references indexed by this test.")
    r.h("Populate a real demo reference later")
    r.p("Prepare an authorized reference draft through source discovery or document parsing, review its title, text and scope, and approve it as reference knowledge. Select that approved reference for a separate Pinecone indexing consent. After acceptance, perform a separately consented search and inspect the citation. Configured hard policies cannot be indexed through this operation and remain authoritative.")
    r.h("Evidence and remaining work")
    r.p("The shareable record is docs/ai-local-validation-2026-11-07.md. Ignored local evidence under .rescuerelay/ai-setup includes model test results, search results and pinecone-e2e-result.json. The earlier metadata snapshot predates Pinecone and LangSmith resource creation. Remaining live checks include model-driven investigations, Mem0 operations, LlamaParse file parsing and LangSmith trace ingestion. ElevenLabs remains parked. These checks do not establish production readiness or a new aggregate CI pass.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    build().save(args.output)
    print(args.output)


if __name__ == "__main__":
    main()
