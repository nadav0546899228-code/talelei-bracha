import { rm } from "node:fs/promises";

const file = "data/demo.json";
await rm(file, { force: true });
process.env.DATABASE_URL = "";
process.env.DATA_FILE = file;

const { createStore } = await import("../server/store.mjs");
const { seedDemo } = await import("../server/demoSeed.mjs");
await seedDemo(await createStore());
console.log("✅ מצב הדמו מוכן בקובץ data/demo.json");
console.log("הנתונים מבודדים ואינם נוגעים במסד הנתונים האמיתי.");
