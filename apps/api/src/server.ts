import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createApp } from "./app.js";
const root = fileURLToPath(new URL("../../../", import.meta.url));
try {
  loadEnvFile(resolve(root, ".env"));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const host = process.env.HOST ?? "127.0.0.1";
const demo = process.env.DEMO_MODE
  ? process.env.DEMO_MODE === "true"
  : process.env.NODE_ENV !== "production";
const allowLanDemo = process.env.ALLOW_LAN_DEMO === "true";
if (process.env.NODE_ENV === "production" && demo)
  throw new Error("Production cannot enable DEMO_MODE. Set DEMO_MODE=false.");
if (demo && !["127.0.0.1", "::1", "localhost"].includes(host) && !allowLanDemo)
  throw new Error(
    "Non-loopback demo requires explicit ALLOW_LAN_DEMO=true. Use only a trusted private test network.",
  );
const { app } = await createApp({
  databasePath: process.env.DATABASE_PATH
    ? resolve(root, process.env.DATABASE_PATH)
    : resolve(root, "data/rescuerelay.db"),
  demoMode: demo,
  allowLanDemo,
  origins: process.env.WEB_ORIGINS?.split(",").map((s) => s.trim()),
  logger: true,
  ...(process.argv.includes("--web")
    ? { staticRoot: resolve(root, "apps/web/dist") }
    : {}),
});
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
await app.listen({ port: Number(process.env.PORT ?? 4000), host });
