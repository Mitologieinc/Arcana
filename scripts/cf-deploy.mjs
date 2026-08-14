import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const secretsPath = fileURLToPath(new URL("../.cf-secrets.env", import.meta.url));
const envName = process.argv.includes("--staging")
  ? "staging"
  : process.argv.includes("--production")
    ? "production"
    : undefined;

function run(args) {
  const result = spawnSync(npx, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function capture(args) {
  return spawnSync(npx, args, { encoding: "utf8" });
}

function wrangler(args) {
  return envName ? ["wrangler", ...args, "--env", envName] : ["wrangler", ...args];
}

run(["vite", "build"]);

const listed = capture(wrangler(["secret", "list"]));
const hasSecret = listed.status === 0 && (listed.stdout ?? "").includes("BETTER_AUTH_SECRET");
const extra = [];
if (!hasSecret) {
  writeFileSync(secretsPath, `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64url")}\n`);
  extra.push("--secrets-file", secretsPath);
}

try {
  run(wrangler(["deploy", ...extra]));
  run(wrangler(["d1", "migrations", "apply", "DB", "--remote"]));
} finally {
  if (existsSync(secretsPath)) unlinkSync(secretsPath);
}
