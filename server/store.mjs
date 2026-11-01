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
  const base = process.env.DATABASE_URL
    ? await createPgStore(process.env.DATABASE_URL)
    : await createFileStore(process.env.DATA_FILE || join(process.cwd(), "data", "db.json"));
  return base.kind === "postgres" ? withCache(base) : base;
}

/**
 * מטמון בזיכרון לאוספים: קריאה חוזרת לאוסף לא מושכת שוב את כל הנתונים מהמסד.
 * לפני שימוש בעותק השמור נבדקת חתימת גרסה זולה (מספר רשומות + עדכון אחרון),
 * כך שגם כשרצים כמה שרתים במקביל לא מוצגים נתונים ישנים.
 * מוחזר תמיד עותק, כדי ששינוי של אובייקט בקוד לא ישבש את המטמון.
 */
const NO_CACHE = new Set(["backupData", "backups", "avrechFiles", "mitchUpdates", "activityWall"]);
function withCache(base) {
  const cache = new Map(); // col -> { ver, rows, at }
  const inflight = new Map();
  const clone = (x) => structuredClone(x);
  async function full(col) {
    const hit = cache.get(col);
    // בתוך חצי שנייה מהבדיקה האחרונה - בלי לשאול את המסד שוב (מאחד קריאות של אותה בקשה)
    if (hit && Date.now() - hit.at < 500) return hit.rows;
    if (inflight.has(col)) return inflight.get(col);
    const p = (async () => {
      const ver = await base.version(col);
      if (hit && hit.ver === ver) {
        hit.at = Date.now();
        return hit.rows;
      }
      const rows = await base.list(col, 1_000_000);
      cache.set(col, { ver, rows, at: Date.now() });
      return rows;
    })().finally(() => inflight.delete(col));
    inflight.set(col, p);
    return p;
  }
  const drop = (col) => cache.delete(col);
  return {
    ...base,
    async list(col, limit = 1_000_000) {
      if (NO_CACHE.has(col)) return base.list(col, limit);
      return clone((await full(col)).slice(0, limit));
    },
    async get(col, id) {
      if (NO_CACHE.has(col)) return base.get(col, id);
      // מתוך המטמון של האוסף (אם הוא עדכני) - בלי שאילתה נוספת למסד
      const rows = await full(col);
      const hit = rows.find((r) => r.id === id);
      return hit ? clone(hit) : null;
    },
    async put(col, id, data) {
      await base.put(col, id, data);
      drop(col);
    },
    async del(col, id) {
      await base.del(col, id);
      drop(col);
    },
    async update(col, id, fn) {
      const r = await base.update(col, id, fn);
      drop(col);
      return r;
    },
  };
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
    async list(col, limit = 1_000_000) {
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
    /** עדכון אטומי: נועל את הרשומה, מריץ fn על הערך הנוכחי ושומר. fn מחזיר null כדי לא לשמור */
    async update(col, id, fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${col}/${id}`]);
        const { rows } = await client.query("SELECT id, data, created_at, updated_at FROM docs WHERE collection=$1 AND id=$2", [col, id]);
        const next = await fn(rows[0] ? row(rows[0]) : null);
        if (next) {
          const { id: _i, createdAt: _c, updatedAt: _u, ...clean } = next;
          await client.query(
            `INSERT INTO docs (collection, id, data) VALUES ($1,$2,$3)
             ON CONFLICT (collection, id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`,
            [col, id, clean],
          );
        }
        await client.query("COMMIT");
        return next;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    /** רשימה בלי שדות כבדים (תמונות/קבצים) - מחזיר רק את מספר הפריטים בשדה */
    async listLight(col, fields, limit = 1_000_000) {
      let expr = "data";
      const params = [col, limit];
      for (const f of fields) {
        params.push(f);
        const i = params.length;
        expr = `(${expr} - $${i}::text) || jsonb_build_object($${i}::text || 'Count', CASE jsonb_typeof(data->$${i}::text) WHEN 'array' THEN jsonb_array_length(data->$${i}::text) WHEN 'string' THEN 1 ELSE 0 END)`;
      }
      const { rows } = await pool.query(
        `SELECT id, ${expr} AS data, created_at, updated_at FROM docs WHERE collection=$1 ORDER BY created_at DESC LIMIT $2`,
        params,
      );
      return rows.map(row);
    },
    /** חתימת גרסה זולה לאוסף - משתנה בכל הוספה, עדכון או מחיקה */
    async version(col) {
      const { rows } = await pool.query("SELECT count(*)::int AS n, max(updated_at) AS m FROM docs WHERE collection=$1", [col]);
      return `${rows[0].n}:${rows[0].m ? new Date(rows[0].m).getTime() : 0}`;
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
  let locks = Promise.resolve();
  // כתיבות רצופות מאוחדות לכתיבה אחת לקובץ (טעינת נתוני דמה מהירה פי כמה)
  let pending = null;
  const save = () => {
    if (pending) return pending;
    pending = queue = queue.then(async () => {
      pending = null;
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(db));
      await rename(tmp, file);
    });
    return pending;
  };
  const col = (c) => (db.collections[c] ??= {});
  // עותק עמוק - שינוי של אובייקט שהוחזר לא משנה את הנתונים השמורים
  const row = (id, r) => ({ ...structuredClone(r.data), id, createdAt: r.created_at, updatedAt: r.updated_at });
  return {
    kind: "file",
    file,
    async list(c, limit = 1_000_000) {
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
      col(c)[id] = { data: structuredClone(clean), created_at: prev?.created_at ?? now, updated_at: now };
      await save();
    },
    async del(c, id) {
      delete col(c)[id];
      await save();
    },
    async update(c, id, fn) {
      const run = async () => {
        const r = col(c)[id];
        const next = await fn(r ? row(id, r) : null);
        if (next) await this.put(c, id, next);
        return next;
      };
      const p = (locks = locks.then(run, run));
      return p;
    },
    async listLight(c, fields, limit = 1_000_000) {
      return (await this.list(c, limit)).map((d) => {
        const out = { ...d };
        for (const f of fields) {
          out[`${f}Count`] = Array.isArray(d[f]) ? d[f].length : d[f] ? 1 : 0;
          delete out[f];
        }
        return out;
      });
    },
    async version(c) {
      return `${Object.keys(col(c)).length}:${Math.max(0, ...Object.values(col(c)).map((r) => new Date(r.updated_at).getTime()))}`;
    },
    async counts() {
      return Object.fromEntries(Object.entries(db.collections).map(([k, v]) => [k, Object.keys(v).length]));
    },
  };
}
