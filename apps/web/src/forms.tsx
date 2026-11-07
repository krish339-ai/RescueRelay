import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Upload, ShieldCheck } from "lucide-react";
import type {
  Snapshot,
  Role,
  Volunteer,
  Recipient,
  CsvValidation,
} from "@rescuerelay/shared";
import { Field, Notice, Busy, localDate, iso } from "./ui";
import { changedFields, editedWindow } from "./form-values";
export { changedFields } from "./form-values";
export type Submit = (
  path: string,
  body: Record<string, unknown>,
  method?: string,
) => Promise<boolean>;
const formData = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return new FormData(e.currentTarget);
};
const str = (f: FormData, k: string) => String(f.get(k) || "");
const num = (f: FormData, k: string) => Number(f.get(k));
function WindowFields({
  prefix,
  label,
  start,
  end,
}: {
  prefix: string;
  label: string;
  start: string;
  end: string;
}) {
  return (
    <fieldset className="form-fieldset">
      <legend>{label}</legend>
      <div className="form-row">
        <Field label="Starts">
          <input
            required
            type="datetime-local"
            name={`${prefix}Start`}
            defaultValue={localDate(start)}
          />
        </Field>
        <Field label="Ends">
          <input
            required
            type="datetime-local"
            name={`${prefix}End`}
            defaultValue={localDate(end)}
          />
        </Field>
      </div>
    </fieldset>
  );
}
function LocationFields({ label = "Location" }: { label?: string }) {
  return (
    <fieldset className="form-fieldset">
      <legend>{label}</legend>
      <Field label="Address or location label">
        <input
          name="location"
          required
          placeholder="123 Community Street"
          maxLength={200}
        />
      </Field>
      <div className="form-row">
        <Field label="Latitude">
          <input
            name="lat"
            type="number"
            required
            step="any"
            min="-90"
            max="90"
            placeholder="40.7128"
          />
        </Field>
        <Field label="Longitude">
          <input
            name="lng"
            type="number"
            required
            step="any"
            min="-180"
            max="180"
            placeholder="-74.0060"
          />
        </Field>
      </div>
      <p className="field-hint">
        Coordinates support approximate route estimates. This is not live GPS or
        navigation.
      </p>
    </fieldset>
  );
}
function SubmitButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button className="button primary full" type="submit" disabled={busy}>
      {busy ? (
        <Busy />
      ) : (
        <>
          {label}
          <ArrowRight size={17} />
        </>
      )}
    </button>
  );
}
export function AuthForm({
  mode,
  onMode,
  onSubmit,
  busy,
}: {
  mode: "login" | "register";
  onMode: (mode: "login" | "register") => void;
  onSubmit: (body: Record<string, unknown>) => void;
  busy: boolean;
}) {
  return (
    <form
      className="form"
      onSubmit={(e) => {
        const f = formData(e);
        onSubmit(Object.fromEntries(f.entries()));
      }}
    >
      {mode === "register" && (
        <>
          <Field label="Your name">
            <input
              name="name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={100}
              autoFocus
            />
          </Field>
          <Field label="Workspace name">
            <input
              name="organizationName"
              required
              minLength={2}
              maxLength={120}
              placeholder="Your community food rescue"
            />
          </Field>
        </>
      )}
      <Field label="Email">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus={mode === "login"}
        />
      </Field>
      <Field
        label="Password"
        hint={mode === "register" ? "Use at least 12 characters." : ""}
      >
        <input
          name="password"
          type="password"
          minLength={mode === "register" ? 12 : 1}
          required
          maxLength={128}
          autoComplete={
            mode === "register" ? "new-password" : "current-password"
          }
        />
      </Field>
      {mode === "register" && (
        <Notice>
          <strong>A fresh, private workspace.</strong>
          <br />
          You’ll be its coordinator. Demo data is never copied into your
          organization.
        </Notice>
      )}
      <SubmitButton
        busy={busy}
        label={mode === "login" ? "Log in" : "Create workspace"}
      />
      <p className="session-note">
        Your workspace stays saved on the server. This browser keeps your
        sign-in in memory only; refreshing the page requires signing in again.
      </p>
      <p className="form-footnote">
        {mode === "login" ? "New to RescueRelay?" : "Already have a workspace?"}{" "}
        <button
          type="button"
          className="inline-link"
          onClick={() => onMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Create a workspace" : "Log in"}
        </button>
      </p>
    </form>
  );
}
export function DonationForm({
  snapshot,
  onSubmit,
  busy,
}: {
  snapshot: Snapshot;
  onSubmit: Submit;
  busy: boolean;
}) {
  const now = snapshot.serverTime;
  return (
    <form
      className="form"
      onSubmit={(e) => {
        const f = formData(e);
        void onSubmit("/donations", {
          donorId: str(f, "donorId"),
          description: str(f, "description"),
          category: "shelf_stable",
          sealed: true,
          weightKg: num(f, "weightKg"),
          servings: num(f, "servings"),
          handlingNotes: str(f, "handlingNotes"),
          pickupWindow: {
            start: iso(str(f, "pickupStart")),
            end: iso(str(f, "pickupEnd")),
          },
        });
      }}
    >
      <Notice>
        <strong>Sealed, shelf-stable food only.</strong> Refrigerated, frozen,
        prepared, opened, or uncertain items need a separately approved handling
        workflow. Do not use this flow for them.
      </Notice>
      <Field label="Donor">
        <select name="donorId" required defaultValue="">
          <option value="" disabled>
            Select a donor
          </option>
          {snapshot.donors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="What’s available?">
        <input
          name="description"
          required
          maxLength={300}
          placeholder="Sealed rice, canned beans, and pasta"
        />
      </Field>
      <div className="form-row">
        <Field label="Weight (kg)">
          <input
            name="weightKg"
            type="number"
            required
            min="0.1"
            max="10000"
            step="0.1"
          />
        </Field>
        <Field label="Estimated servings">
          <input
            name="servings"
            type="number"
            required
            min="1"
            max="100000"
            step="1"
          />
        </Field>
      </div>
      <WindowFields
        label="Pickup window"
        prefix="pickup"
        start={now}
        end={new Date(new Date(now).getTime() + 3 * 3600000).toISOString()}
      />
      <Field label="Handling notes">
        <textarea
          name="handlingNotes"
          rows={3}
          placeholder="Packaging details, access instructions, or other verified requirements."
          maxLength={1000}
        />
      </Field>
      <label className="checkbox-field">
        <input type="checkbox" required /> I confirm this offer is sealed and
        shelf-stable.
      </label>
      <SubmitButton busy={busy} label="Publish offer" />
    </form>
  );
}
export function RescueForm({
  snapshot,
  onSubmit,
  busy,
  presetDonationId,
}: {
  snapshot: Snapshot;
  onSubmit: Submit;
  busy: boolean;
  presetDonationId?: string;
}) {
  const now = snapshot.serverTime;
  const used = new Set(
    snapshot.rescues
      .filter((r) => r.status !== "cancelled")
      .map((r) => r.donationId),
  );
  return (
    <form
      className="form"
      onSubmit={(e) => {
        const f = formData(e);
        void onSubmit("/rescues", {
          donationId: str(f, "donationId"),
          recipientId: str(f, "recipientId"),
          deliveryWindow: {
            start: iso(str(f, "deliveryStart")),
            end: iso(str(f, "deliveryEnd")),
          },
          ...(str(f, "volunteerId")
            ? { volunteerId: str(f, "volunteerId") }
            : {}),
        });
      }}
    >
      <Field label="Food offer">
        <select
          name="donationId"
          required
          defaultValue={presetDonationId || ""}
        >
          <option value="" disabled>
            Select an available offer
          </option>
          {snapshot.donations
            .filter((d) => !used.has(d.id))
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.description} · {d.weightKg} kg
              </option>
            ))}
        </select>
      </Field>
      <Field label="Recipient">
        <select name="recipientId" required defaultValue="">
          <option value="" disabled>
            Select a recipient
          </option>
          {snapshot.recipients.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Volunteer"
        hint="Leave unassigned to compare viable recovery options before approving a route."
      >
        <select name="volunteerId" defaultValue="">
          <option value="">Find the right match with a recovery plan</option>
          {snapshot.volunteers
            .filter((v) => v.available)
            .map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.capacityKg} kg
              </option>
            ))}
        </select>
      </Field>
      <WindowFields
        prefix="delivery"
        label="Delivery window"
        start={now}
        end={new Date(new Date(now).getTime() + 4 * 3600000).toISOString()}
      />
      <Notice>
        The server checks capacity, timing, handling, and recipient constraints
        before accepting an assignment.
      </Notice>
      <SubmitButton busy={busy} label="Create rescue" />
    </form>
  );
}
export function PartnerForm({
  kind,
  snapshot,
  onSubmit,
  busy,
}: {
  kind: "donor" | "recipient" | "volunteer";
  snapshot: Snapshot;
  onSubmit: Submit;
  busy: boolean;
}) {
  const now = snapshot.serverTime;
  return (
    <form
      className="form"
      onSubmit={(e) => {
        const f = formData(e);
        const location = {
          label: str(f, "location"),
          lat: num(f, "lat"),
          lng: num(f, "lng"),
        };
        const body: Record<string, unknown> = {
          name: str(f, "name"),
          location,
          notes: str(f, "notes"),
        };
        if (kind === "donor" || kind === "recipient")
          body.contact = str(f, "contact");
        if (kind === "recipient") {
          body.capacityKg = num(f, "capacityKg");
          body.acceptedCategories = ["shelf_stable"];
          body.openingWindow = {
            start: iso(str(f, "windowStart")),
            end: iso(str(f, "windowEnd")),
          };
        }
        if (kind === "volunteer") {
          body.capacityKg = num(f, "capacityKg");
          body.vehicle = str(f, "vehicle");
          body.available = f.has("available");
          body.trained = f.has("trained");
          body.availability = {
            start: iso(str(f, "windowStart")),
            end: iso(str(f, "windowEnd")),
          };
        }
        void onSubmit(`/${kind}s`, body);
      }}
    >
      <Field label={kind === "volunteer" ? "Full name" : "Organization name"}>
        <input name="name" required maxLength={120} />
      </Field>
      {kind !== "volunteer" && (
        <Field label="Contact">
          <input
            name="contact"
            required
            placeholder="Contact name, email, or phone"
            maxLength={200}
          />
        </Field>
      )}
      <LocationFields />
      {kind !== "donor" && (
        <>
          <Field
            label={
              kind === "volunteer"
                ? "Vehicle capacity (kg)"
                : "Receiving capacity (kg)"
            }
          >
            <input
              name="capacityKg"
              required
              type="number"
              min="1"
              max="10000"
              step="0.1"
            />
          </Field>
          <WindowFields
            prefix="window"
            label={kind === "volunteer" ? "Availability" : "Receiving window"}
            start={now}
            end={new Date(new Date(now).getTime() + 6 * 3600000).toISOString()}
          />
        </>
      )}
      {kind === "volunteer" && (
        <>
          <Field label="Vehicle">
            <input
              name="vehicle"
              required
              placeholder="Car, van, or cargo bike"
              maxLength={120}
            />
          </Field>
          <label className="checkbox-field">
            <input name="available" type="checkbox" defaultChecked /> Available
            for assignments
          </label>
          <label className="checkbox-field">
            <input name="trained" type="checkbox" /> Required handling training
            verified by coordinator
          </label>
        </>
      )}
      {kind === "recipient" && (
        <Notice>
          Current rescue workflow supports sealed shelf-stable food only. This
          recipient will accept that category.
        </Notice>
      )}
      <Field label="Notes">
        <textarea name="notes" rows={3} maxLength={1000} />
      </Field>
      <SubmitButton busy={busy} label={`Add ${kind}`} />
    </form>
  );
}
export function VolunteerForm({
  volunteer,
  onSubmit,
  busy,
  coordinator,
}: {
  volunteer: Volunteer;
  onSubmit: Submit;
  busy: boolean;
  coordinator: boolean;
}) {
  return (
    <form
      className="form"
      onSubmit={(e) => {
        const f = formData(e);
        void onSubmit(
          `/volunteers/${volunteer.id}`,
          changedFields(volunteer, {
            available: f.has("available"),
            availability: editedWindow(f, "window", volunteer.availability),
            ...(coordinator
              ? {
                  capacityKg: num(f, "capacityKg"),
                  vehicle: str(f, "vehicle"),
                  trained: f.has("trained"),
                  notes: str(f, "notes"),
                }
              : {}),
          }),
          "PATCH",
        );
      }}
    >
      <label className="checkbox-field">
        <input
          type="checkbox"
          name="available"
          defaultChecked={volunteer.available}
        />{" "}
        Available for new assignments
      </label>
      <WindowFields
        prefix="window"
        label="Availability window"
        start={volunteer.availability.start}
        end={volunteer.availability.end}
      />
      {coordinator ? (
        <>
          <Field label="Vehicle capacity (kg)">
            <input
              name="capacityKg"
              type="number"
              required
              min="1"
              max="10000"
              step="0.1"
              defaultValue={volunteer.capacityKg}
            />
          </Field>
          <Field label="Vehicle">
            <input name="vehicle" required defaultValue={volunteer.vehicle} />
          </Field>
          <label className="checkbox-field">
            <input
              name="trained"
              type="checkbox"
              defaultChecked={volunteer.trained}
            />{" "}
            Handling training verified
          </label>
          <Field label="Notes">
            <textarea name="notes" defaultValue={volunteer.notes} />
          </Field>
        </>
      ) : (
        <Notice>
          Your registered vehicle is {volunteer.vehicle}, with a capacity of{" "}
          {volunteer.capacityKg} kg. Ask your coordinator to change vehicle
          capacity or training records.
        </Notice>
      )}
      <SubmitButton busy={busy} label="Save availability" />
    </form>
  );
}
export function RecipientForm({
  recipient,
  onSubmit,
  busy,
}: {
  recipient: Recipient;
  onSubmit: Submit;
  busy: boolean;
}) {
  return (
    <form
      className="form"
      onSubmit={(e) => {
        const f = formData(e);
        void onSubmit(
          `/recipients/${recipient.id}`,
          changedFields(recipient, {
            capacityKg: num(f, "capacityKg"),
            openingWindow: editedWindow(f, "window", recipient.openingWindow),
            notes: str(f, "notes"),
          }),
          "PATCH",
        );
      }}
    >
      <Field label="Receiving capacity (kg)">
        <input
          name="capacityKg"
          required
          type="number"
          min="1"
          max="10000"
          step="0.1"
          defaultValue={recipient.capacityKg}
        />
      </Field>
      <WindowFields
        prefix="window"
        label="Receiving window"
        start={recipient.openingWindow.start}
        end={recipient.openingWindow.end}
      />
      <Field label="Receiving notes">
        <textarea name="notes" rows={4} defaultValue={recipient.notes} />
      </Field>
      <Notice>
        Current supported category: sealed shelf-stable food. Capacity and
        opening times are checked before route approval.
      </Notice>
      <SubmitButton busy={busy} label="Save receiving details" />
    </form>
  );
}
export function ReasonForm({
  label,
  onSubmit,
  busy,
}: {
  label: string;
  onSubmit: (reason: string) => void;
  busy: boolean;
}) {
  return (
    <form
      className="form"
      onSubmit={(e) => {
        const f = formData(e);
        onSubmit(str(f, "reason"));
      }}
    >
      <Notice type="warning">
        {label.includes("Escalate")
          ? "This flags the rescue for human follow-up. It does not contact emergency services or dispatch a replacement."
          : "The rescue will need coordinator review. If food is already in transit, custody is escalated instead of automatically reassigned."}
      </Notice>
      <Field label="What happened?">
        <textarea
          name="reason"
          autoFocus
          required
          minLength={3}
          maxLength={1000}
          rows={4}
          placeholder="Provide enough context for the coordinator to act."
        />
      </Field>
      <SubmitButton busy={busy} label={label} />
    </form>
  );
}
export function UserForm({
  snapshot,
  onSubmit,
  busy,
}: {
  snapshot: Snapshot;
  onSubmit: Submit;
  busy: boolean;
}) {
  const [role, setRole] = useState<Role>("volunteer");
  return (
    <form
      className="form"
      onSubmit={(e) => {
        const f = formData(e);
        void onSubmit("/users", {
          name: str(f, "name"),
          email: str(f, "email"),
          password: str(f, "password"),
          role,
          ...(role === "volunteer"
            ? { volunteerId: str(f, "entityId") }
            : role === "recipient"
              ? { recipientId: str(f, "entityId") }
              : {}),
        });
      }}
    >
      <Notice>
        <ShieldCheck size={16} /> Create a login only for someone authorized to
        access this workspace. No invitation email is sent; securely share
        credentials out of band.
      </Notice>
      <Field label="Name">
        <input name="name" required minLength={2} />
      </Field>
      <Field label="Email">
        <input type="email" name="email" required />
      </Field>
      <Field
        label="Initial password"
        hint="Minimum 12 characters. Share through a secure channel."
      >
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
        />
      </Field>
      <Field label="Role">
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="volunteer">Volunteer</option>
          <option value="recipient">Recipient</option>
          <option value="coordinator">Coordinator</option>
        </select>
      </Field>
      {role !== "coordinator" && (
        <Field label={`Linked ${role}`}>
          <select name="entityId" required defaultValue="">
            <option disabled value="">
              Choose a record
            </option>
            {(role === "volunteer"
              ? snapshot.volunteers
              : snapshot.recipients
            ).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <SubmitButton busy={busy} label="Create workspace account" />
    </form>
  );
}
export function ImportForm({
  onValidate,
  onImport,
  busy,
  donorId,
}: {
  onValidate: (csv: string) => Promise<CsvValidation | undefined>;
  onImport: (csv: string) => void;
  busy: boolean;
  donorId?: string;
}) {
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<CsvValidation>();
  return (
    <div className="form">
      <Notice>
        Import at most 200 offers. Every row must describe sealed shelf-stable
        food. Nothing is imported until validation passes and you confirm.
      </Notice>
      <p className="field-hint">
        Required columns:
        donorId,description,weightKg,servings,pickupStart,pickupEnd. Use ISO
        timestamps.{" "}
        {donorId && (
          <>
            Example donor ID: <code>{donorId}</code>.
          </>
        )}
      </p>
      <Field label="Choose a CSV file">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              setCsv(await file.text());
              setResult(undefined);
            }
          }}
        />
      </Field>
      <Field label="CSV contents">
        <textarea
          rows={8}
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setResult(undefined);
          }}
          placeholder="donorId,description,weightKg,servings,pickupStart,pickupEnd"
        />
      </Field>
      {result && (
        <Notice type={result.valid ? "success" : "warning"}>
          {result.valid ? (
            <>
              <Check size={16} /> {result.rows} rows validated. Review the
              descriptions before importing.
            </>
          ) : (
            <ul>
              {result.errors.map((e, i) => (
                <li key={i}>
                  Row {e.row}, {e.field}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </Notice>
      )}
      {result?.valid && (
        <div className="import-preview">
          {result.preview.map((r, i) => (
            <div key={i}>
              <strong>{r.description}</strong>
              <span>
                {r.weightKg} kg · {r.servings} servings
              </span>
            </div>
          ))}
        </div>
      )}
      <button
        className="button secondary"
        disabled={busy || !csv}
        onClick={async () => setResult(await onValidate(csv))}
      >
        Validate CSV
      </button>
      <button
        className="button primary"
        disabled={busy || !result?.valid}
        onClick={() => onImport(csv)}
      >
        <Upload size={16} /> Import verified offers
      </button>
    </div>
  );
}
