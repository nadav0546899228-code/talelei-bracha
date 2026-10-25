import { rm } from "node:fs/promises";
await rm("data/demo.json", { force: true });
console.log("✅ נתוני הדמה המקומיים נמחקו.");
