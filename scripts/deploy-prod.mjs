#!/usr/bin/env node
// One release gate for the whole web app.
// It refuses to spend a Vercel deployment unless every fix is committed,
// tests and the web build pass, and today's production budget is not spent.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const LEDGER = join(ROOT, ".deploy-ledger.json");
const MAX_PER_DAY = 12;
const args = new Set(process.argv.slice(2));
const confirm = args.has("--confirm");
const dryRun = args.has("--dry-run") || !confirm;
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const version = String(pkg.version || "");

function run(command) {
  const result = spawnSync(command, { cwd: ROOT, shell: true, stdio: "inherit" });
  if (result.status !== 0) throw new Error("Command failed: " + command);
}
function out(command) {
  return execFileSync(command, { cwd: ROOT, shell: true, encoding: "utf8" }).trim();
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function loadLedger() {
  try {
    const value = JSON.parse(readFileSync(LEDGER, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
function saveLedger(entries) {
  writeFileSync(LEDGER, JSON.stringify(entries.slice(-50), null, 2) + "\n");
}
function deploymentsToday(entries) {
  return entries.filter((entry) => String(entry.at || "").slice(0, 10) === today()).length;
}

console.log("\nJamdDmaj release gate");
console.log("version:", version);

const dirty = out("git status --porcelain --untracked-files=no");
if (dirty) {
  console.error("\nHay cambios sin commitear. Agrupa y commitea todos los fixes antes de liberar.\n" + dirty);
  process.exit(1);
}

let live = null;
try {
  const response = await fetch("https://www.jamddmaj.com/api/status", { cache: "no-store" });
  live = await response.json();
} catch {
  console.warn("No se pudo leer /api/status; se omite la comparacion de version.");
}
if (live?.version === version && !args.has("--allow-same-version")) {
  console.error("\nLa version " + version + " ya esta en produccion. Sube package.json cuando agrupes el siguiente release.");
  process.exit(1);
}
console.log("live:", live?.version || "unknown");

const ledger = loadLedger();
const used = deploymentsToday(ledger);
console.log("production deploys today:", used + "/" + MAX_PER_DAY);
if (used >= MAX_PER_DAY && !dryRun) {
  console.error("\nPresupuesto diario agotado. Espera al siguiente dia UTC o agrupa el proximo release.");
  process.exit(1);
}

console.log("\n[1/4] tests");
run("npm test");
console.log("\n[2/4] web build");
run("npm run build:web");

if (dryRun) {
  console.log("\n[3/4] deploy omitted (dry run)");
  console.log("[4/4] ledger not changed");
  console.log("\nTodo listo. Para liberar TODO en un solo deploy:");
  console.log("  npm run release:prod -- --confirm");
  process.exit(0);
}

const worktree = join(tmpdir(), "jamd-release-" + Date.now());
console.log("\n[3/4] deploy", worktree);
try {
  run("git worktree add --detach \"" + worktree + "\" HEAD");
  mkdirSync(join(worktree, ".vercel"), { recursive: true });
  copyFileSync(join(ROOT, ".vercel", "project.json"), join(worktree, ".vercel", "project.json"));
  const deploy = spawnSync("npx --yes vercel@latest deploy --prod --yes", {
    cwd: worktree,
    shell: true,
    stdio: "inherit"
  });
  if (deploy.status !== 0) throw new Error("Vercel deploy failed");
} finally {
  try { run("git worktree remove \"" + worktree + "\" --force"); } catch {}
}

console.log("\n[4/4] verify live version");
const deadline = Date.now() + 90000;
let verified = null;
while (Date.now() < deadline) {
  try {
    const response = await fetch("https://www.jamddmaj.com/api/status", { cache: "no-store" });
    const body = await response.json();
    if (body?.version === version) { verified = body; break; }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
if (!verified) {
  console.error("El deploy termino pero /api/status no muestra " + version + " todavia.");
  process.exit(1);
}
ledger.push({ at: new Date().toISOString(), version, url: "https://www.jamddmaj.com" });
saveLedger(ledger);
console.log("OK. Produccion en " + version + ". Deploys hoy: " + deploymentsToday(ledger) + "/" + MAX_PER_DAY);