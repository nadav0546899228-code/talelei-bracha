// פיתוח מקומי: מפעיל את השרת (5000) ואת Vite (5173) יחד
import { spawn } from "node:child_process";

const run = (cmd, args, env = {}) =>
  spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...env } });

const server = run("node", ["--watch", "server/index.mjs"], { PORT: "5000" });
const vite = run("npx", ["vite"]);

const stop = () => {
  server.kill();
  vite.kill();
  process.exit();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
