/**
 * שכבת אחסון עם שני מתאמים:
 * - PostgreSQL (כשמוגדר DATABASE_URL - כך ב-Replit, גם בפיתוח וגם באתר המפורסם)
 * - קובץ JSON מקומי (לפיתוח בלבד; באתר מפורסם ב-Replit הקבצים לא נשמרים לאורך זמן!)
 *
 * מבנה אחיד: מסמכים לפי collection + id, עם data בפורמט JSON.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function createStore() {
  if (process.env.DATABASE_URL) return createPgStore(process.env.DATABASE_URL);
  return createFileStore(process.env.DATA_FILE || join(process.cwd(), "data", "db.json"));
}

async function createPgStore(url) {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS docs (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS docs_collection_created ON docs (collection, created_at DESC);
  `);
  const row = (r) => ({ ...r.data, id: r.id, createdAt: r.created_at, updatedAt: r.updated_at });
  return {
    kind: "postgres",
    async list(col, limit = 5000) {
      const { rows } = await pool.query(
        "SELECT id, data, created_at, updated_at FROM docs WHERE collection=$1 ORDER BY created_at DESC LIMIT $2",
        [col, limit],
      );
      return rows.map(row);
    },
    async get(col, id) {
      const { rows } = await pool.query("SELECT id, data, created_at, updated_at FROM docs WHERE collection=$1 AND id=$2", [col, id]);
      return rows[0] ? row(rows[0]) : null;
    },
    async put(col, id, data) {
      const { id: _i, createdAt: _c, updatedAt: _u, ...clean } = data;
      await pool.query(
        `INSERT INTO docs (collection, id, data) VALUES ($1,$2,$3)
         ON CONFLICT (collection, id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`,
        [col, id, clean],
      );
    },
    async del(col, id) {
      await pool.query("DELETE FROM docs WHERE collection=$1 AND id=$2", [col, id]);
    },
    async counts() {
      const { rows } = await pool.query("SELECT collection, count(*)::int AS n FROM docs GROUP BY collection");
      return Object.fromEntries(rows.map((r) => [r.collection, r.n]));
    },
  };
}

async function createFileStore(file) {
  let db = { collections: {} };
  try {
    db = JSON.parse(await readFile(file, "utf8"));
  } catch {
    /* קובץ חדש */
  }
  let queue = Promise.resolve();
  const save = () =>
    (queue = queue.then(async () => {
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(db));
      await rename(tmp, file);
    }));
  const col = (c) => (db.collections[c] ??= {});
  const row = (id, r) => ({ ...r.data, id, createdAt: r.created_at, updatedAt: r.updated_at });
  return {
    kind: "file",
    file,
    async list(c, limit = 5000) {
      return Object.entries(col(c))
        .map(([id, r]) => row(id, r))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, limit);
    },
    async get(c, id) {
      const r = col(c)[id];
      return r ? row(id, r) : null;
    },
    async put(c, id, data) {
      const { id: _i, createdAt: _c, updatedAt: _u, ...clean } = data;
      const now = new Date().toISOString();
      const prev = col(c)[id];
      col(c)[id] = { data: clean, created_at: prev?.created_at ?? now, updated_at: now };
      await save();
    },
    async del(c, id) {
      delete col(c)[id];
      await save();
    },
    async counts() {
      return Object.fromEntries(Object.entries(db.collections).map(([k, v]) => [k, Object.keys(v).length]));
    },
  };
}
