#!/usr/bin/env node
/** Local operator utility. Never overwrites an existing destination; restore invalidates sessions. */
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, chmodSync } from "node:fs";
import { resolve, dirname } from "node:path";
const [command, ...args] = process.argv.slice(2);
const readFlag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const source = resolve(readFlag("--source") ?? "data/rescuerelay.db");
const outputValue = readFlag("--output");
const output = outputValue ? resolve(outputValue) : undefined;
function verify(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const check = db.prepare("PRAGMA integrity_check").all();
    if (check.length !== 1 || check[0].integrity_check !== "ok")
      throw new Error("SQLite integrity check failed.");
    const fk = db.prepare("PRAGMA foreign_key_check").all();
    if (fk.length) throw new Error("Foreign key check failed.");
    const version = db
      .prepare("SELECT MAX(version) AS version FROM schema_migrations")
      .get().version;
    if (version !== 1)
      throw new Error(
        `Unsupported schema version ${version}; no migration is attempted.`,
      );
    return {
      schemaVersion: version,
      organizations: db
        .prepare("SELECT count(*) AS count FROM organizations")
        .get().count,
      integrity: "ok",
    };
  } finally {
    db.close();
  }
}
try {
  if (!["backup", "restore", "check"].includes(command))
    throw new Error(
      "Usage: node scripts/database.mjs check --source data/rescuerelay.db | backup --source data/rescuerelay.db --output backups/snapshot.db | restore --source backups/snapshot.db --output data/restored.db",
    );
  if (!existsSync(source)) throw new Error("Source database does not exist.");
  if (command === "check") {
    console.log(JSON.stringify(verify(source), null, 2));
  } else {
    if (!output) throw new Error("--output is required.");
    if (source === output || existsSync(output))
      throw new Error(
        "Destination must be a new file. Existing databases are never overwritten.",
      );
    verify(source);
    mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
    if (command === "backup") {
      const db = new DatabaseSync(source, { readOnly: true });
      try {
        db.prepare("VACUUM INTO ?").run(output);
      } finally {
        db.close();
      }
    } else {
      const sourceDb = new DatabaseSync(source, { readOnly: true });
      try {
        sourceDb.prepare("VACUUM INTO ?").run(output);
      } finally {
        sourceDb.close();
      }
      const db = new DatabaseSync(output);
      try {
        db.exec("DELETE FROM sessions;");
      } finally {
        db.close();
      }
    }
    chmodSync(output, 0o600);
    console.log(
      JSON.stringify(
        {
          action: command,
          output,
          ...verify(output),
          ...(command === "restore"
            ? {
                sessions: "invalidated",
                next: "Stop the API, then set DATABASE_PATH to this new file and restart. Verify with a fresh login.",
              }
            : {
                warning:
                  "Backup contains personal data and password hashes. Protect it; do not commit or share it.",
              }),
        },
        null,
        2,
      ),
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
