import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const outDir = join(root, ".agents", "outputs");
const logPath = join(outDir, "replit-demo.log");
const statusPath = join(outDir, "replit-sync.log");
const pidPath = join(outDir, "replit-demo.pid");

await mkdir(outDir, { recursive: true });

function clean(text = "") {
  return text
    .replace(/^(.*(?:TOKEN|SECRET|PASSWORD|DATABASE_URL|API_KEY|PRIVATE_KEY).*)$/gim, "[redacted]")
    .replace(/(postgres(?:ql)?:\/\/)[^\s@]+@/gi, "$1[redacted]@")
    .slice(-16000);
}

function git(args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" });
}

async function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}

let existingPid = "";
try { existingPid = (await readFile(pidPath, "utf8")).trim(); } catch {}
let alive = await isAlive(existingPid);

if (!alive) {
  const fd = await open(logPath, "a");
  await fd.write(`\n\n===== START ${new Date().toISOString()} =====\n`);
  const child = spawn("npm", ["run", "demo"], {
    cwd: root,
    detached: true,
    stdio: ["ignore", fd.fd, fd.fd],
    env: process.env,
  });
  child.unref();
  await writeFile(pidPath, String(child.pid));
  await fd.close();
  existingPid = String(child.pid);
  await new Promise((r) => setTimeout(r, 5500));
  alive = await isAlive(existingPid);
}

async function probe(url) {
  try {
    const res = await fetch(url, { redirect: "manual" });
    return `${res.status} ${res.statusText}`;
  } catch (e) {
    return `לא זמין: ${e instanceof Error ? e.message : "שגיאה"}`;
  }
}

let log = "";
try { log = await readFile(logPath, "utf8"); } catch {}

const sha = git(["rev-parse", "--short", "HEAD"]).stdout.trim();
const branchName = git(["branch", "--show-current"]).stdout.trim();
const working = git(["status", "--porcelain"]).stdout
  .split("\n")
  .filter((line) => line && !line.includes(".agents/outputs/"))
  .join("\n");

const report = [
  `Replit status: ${new Date().toISOString()}`,
  `branch: ${branchName || "(detached)"}`,
  `commit: ${sha || "unknown"}`,
  `demo pid: ${existingPid || "none"}`,
  `demo running: ${alive ? "yes" : "no"}`,
  `server 5000: ${await probe("http://127.0.0.1:5000/")}`,
  `vite 5173: ${await probe("http://127.0.0.1:5173/")}`,
  `working tree: ${working ? "\n" + working : "clean"}`,
  "",
  "===== SAFE LOG TAIL =====",
  clean(log.split("\n").slice(-120).join("\n")),
  "",
].join("\n");

await writeFile(statusPath, report);

git(["add", "-f", ".agents/outputs/replit-sync.log"]);
const staged = git(["diff", "--cached", "--quiet"]);
if (staged.status !== 0) git(["commit", "-m", "chore: update Replit status"]);

const push = git(["push", "origin", "HEAD:main"]);
if (push.status !== 0) {
  console.error("⚠️ הסטטוס נשמר מקומית אבל לא הצליח לעלות ל-GitHub.");
  console.error(clean(push.stderr || push.stdout));
} else {
  console.log("✅ מצב הדמו הופעל/נבדק והסטטוס נשלח ל-GitHub.");
  console.log("אפשר לכתוב עכשיו בצ'אט: בוצע");
}
