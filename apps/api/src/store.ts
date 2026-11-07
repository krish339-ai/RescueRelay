import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type {
  Organization,
  Role,
  SessionResponse,
  User,
} from "@rescuerelay/shared";
import { AppError, assert, fail } from "./errors.js";
import { emptyState, id, nowIso, seedState, type OrgState } from "./state.js";
interface UserRow {
  id: string;
  org_id: string;
  name: string;
  email: string;
  role: Role;
  volunteer_id: string | null;
  recipient_id: string | null;
  password_hash: string | null;
}
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
function passwordMatches(password: string, encoded: string | null) {
  const [salt, hash] = (encoded ?? "").split(":");
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64);
  const wanted = Buffer.from(hash, "hex");
  return wanted.length === actual.length && timingSafeEqual(actual, wanted);
}
function mapUser(row: UserRow): User {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    email: row.email,
    role: row.role,
    ...(row.volunteer_id ? { volunteerId: row.volunteer_id } : {}),
    ...(row.recipient_id ? { recipientId: row.recipient_id } : {}),
  };
}
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT OR IGNORE INTO schema_migrations VALUES(1,datetime('now'));
    CREATE TABLE IF NOT EXISTS organizations(id TEXT PRIMARY KEY,state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES organizations(id),name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,role TEXT NOT NULL,volunteer_id TEXT,recipient_id TEXT,password_hash TEXT);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS idempotency(org_id TEXT NOT NULL,actor_id TEXT NOT NULL,key TEXT NOT NULL,fingerprint TEXT NOT NULL,response TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(org_id,actor_id,key));`);
  }
  /** Append only an external-operation receipt against current state; never apply stale domain results. */
  recordAiReceipt(
    orgId: string,
    receipt: import("./ai/state.js").StoredAiReceipt,
  ) {
    return this.transaction(() => {
      const state = this.read(orgId);
      state.ai ??= {
        drafts: [],
        referencePolicies: [],
        memories: [],
        receipts: [],
      };
      state.ai.receipts ??= [];
      state.ai.receipts.unshift(receipt);
      state.ai.receipts = state.ai.receipts.slice(0, 200);
      state.version++;
      this.save(state);
      return state;
    });
  }
  close() {
    this.db.close();
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  read(orgId: string): OrgState {
    const row = this.db
      .prepare("SELECT state FROM organizations WHERE id=?")
      .get(orgId) as { state: string } | undefined;
    assert(row, 404, "NOT_FOUND", "Organization not found");
    return JSON.parse(row.state);
  }
  private save(s: OrgState) {
    this.db
      .prepare("UPDATE organizations SET state=? WHERE id=?")
      .run(JSON.stringify(s), s.organization.id);
  }
  mutate<T>(
    orgId: string,
    expectedVersion: number,
    fn: (s: OrgState) => T,
    idem?: { actorId: string; key: string; fingerprint: string },
  ): { state: OrgState; result: T } {
    return this.transaction(() => {
      if (idem) {
        const hit = this.db
          .prepare(
            "SELECT fingerprint,response FROM idempotency WHERE org_id=? AND actor_id=? AND key=?",
          )
          .get(orgId, idem.actorId, idem.key) as
          | { fingerprint: string; response: string }
          | undefined;
        if (hit) {
          assert(
            hit.fingerprint === idem.fingerprint,
            409,
            "IDEMPOTENCY_CONFLICT",
            "This idempotency key was used for a different request.",
          );
          return JSON.parse(hit.response);
        }
      }
      const state = this.read(orgId);
      assert(
        state.version === expectedVersion,
        409,
        "STALE_VERSION",
        "State changed. Refresh and review before trying again.",
      );
      const result = fn(state);
      state.version++;
      this.save(state);
      const response = { state, result };
      if (idem)
        this.db
          .prepare("INSERT INTO idempotency VALUES(?,?,?,?,?,?)")
          .run(
            orgId,
            idem.actorId,
            idem.key,
            idem.fingerprint,
            JSON.stringify(response),
            nowIso(),
          );
      return response;
    });
  }
  createOrganization(input: {
    name: string;
    email: string;
    password: string;
    organizationName: string;
  }): SessionResponse {
    let user!: User;
    this.transaction(() => {
      const org: Organization = {
        id: id("org"),
        name: input.organizationName,
        demo: false,
        createdAt: nowIso(),
      };
      this.db
        .prepare("INSERT INTO organizations VALUES(?,?)")
        .run(org.id, JSON.stringify(emptyState(org)));
      user = this.insertUser(org.id, {
        name: input.name,
        email: input.email,
        password: input.password,
        role: "coordinator",
      });
    });
    return this.session(user);
  }
  insertUser(
    orgId: string,
    input: {
      name: string;
      email: string;
      password?: string;
      role: Role;
      volunteerId?: string;
      recipientId?: string;
    },
  ): User {
    const user: User = {
      id: id("user"),
      orgId,
      name: input.name,
      email: input.email.toLowerCase(),
      role: input.role,
      ...(input.volunteerId ? { volunteerId: input.volunteerId } : {}),
      ...(input.recipientId ? { recipientId: input.recipientId } : {}),
    };
    try {
      this.db
        .prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,?)")
        .run(
          user.id,
          orgId,
          user.name,
          user.email,
          user.role,
          user.volunteerId ?? null,
          user.recipientId ?? null,
          input.password ? passwordHash(input.password) : null,
        );
    } catch (e) {
      if (String(e).includes("UNIQUE"))
        throw new AppError(
          409,
          "ACCOUNT_EXISTS",
          "An account with that email already exists.",
        );
      throw e;
    }
    return user;
  }
  login(email: string, password: string): SessionResponse {
    const row = this.db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email.toLowerCase()) as UserRow | undefined; // Equal-cost scrypt on unknown addresses avoids obvious account timing leakage.
    const valid = row
      ? passwordMatches(password, row.password_hash)
      : (scryptSync(password, "rescuerelay-login-padding", 64), false);
    assert(
      row && valid,
      401,
      "INVALID_LOGIN",
      "Email or password is incorrect.",
    );
    return this.session(mapUser(row));
  }
  session(user: User): SessionResponse {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    this.db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(nowIso());
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(digest(token), user.id, expiresAt);
    return {
      token,
      expiresAt,
      user,
      organization: this.read(user.orgId).organization,
    };
  }
  authenticate(token: string): User {
    const row = this.db
      .prepare(
        "SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
      )
      .get(digest(token), nowIso()) as UserRow | undefined;
    assert(row, 401, "UNAUTHENTICATED", "Sign in to continue.");
    return mapUser(row);
  }
  logout(token: string) {
    this.db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run(digest(token));
  }
  ensureDemo() {
    if (
      this.db.prepare("SELECT id FROM organizations WHERE id=?").get("org-demo")
    )
      return;
    this.transaction(() => {
      const org: Organization = {
        id: "org-demo",
        name: "River City Rescue · Demo",
        demo: true,
        createdAt: nowIso(),
      };
      this.db
        .prepare("INSERT INTO organizations VALUES(?,?)")
        .run(org.id, JSON.stringify(seedState(org)));
      this.insertUser(org.id, {
        name: "Casey Brooks",
        email: "coordinator@demo.invalid",
        role: "coordinator",
      });
      this.insertUser(org.id, {
        name: "Maya Chen",
        email: "volunteer@demo.invalid",
        role: "volunteer",
        volunteerId: "v-maya",
      });
      this.insertUser(org.id, {
        name: "Maple Receiving Desk",
        email: "recipient@demo.invalid",
        role: "recipient",
        recipientId: "rec-maple",
      });
    });
  }
  demoSession(role: Role) {
    this.ensureDemo();
    const row = this.db
      .prepare("SELECT * FROM users WHERE org_id=? AND role=?")
      .get("org-demo", role) as unknown as UserRow;
    return this.session(mapUser(row));
  }
}
