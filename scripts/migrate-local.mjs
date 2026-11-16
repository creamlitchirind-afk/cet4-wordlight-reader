import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!existsSync("dist/server/wrangler.json")) {
  throw new Error("Run npm run build before npm run db:local.");
}
const result = spawnSync(process.execPath, [
  "--import", "./scripts/sites-env.mjs",
  "./node_modules/wrangler/bin/wrangler.js",
  "d1", "migrations", "apply", "site-creator-d1", "--local",
  "--config", "dist/server/wrangler.json", "--persist-to", ".wrangler/state",
], { stdio: "inherit" });
process.exit(result.status ?? 1);
