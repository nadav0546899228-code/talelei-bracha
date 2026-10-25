/**
 * מפת ישראל בתלת-ממד: צללית הארץ "מורמת" (עובי ועומק), ועמודות פעילות שעולות מכל עיר -
 * גובה העמודה לפי כמות הפעילות, צבע לפי הארגון (טללי ברכה / בנות צילה).
 */
import { useMemo } from "react";

type Pin = { city: string; lat: number; lng: number; count: number; boys: number; girls: number; participants: number };

// קווי המתאר (קו רוחב, קו אורך) - חוף הים התיכון, הגבולות בצפון, בקעת הירדן, ים המלח, הערבה ואילת
const OUTLINE: [number, number][] = [
  [33.09, 35.105], [33.08, 35.2], [33.06, 35.32], [33.08, 35.45], [33.12, 35.5], [33.2, 35.55], [33.28, 35.575], [33.27, 35.62],
  [33.33, 35.76], [33.29, 35.83], [33.2, 35.86], [33.05, 35.87], [32.9, 35.86], [32.78, 35.8], [32.7, 35.7], [32.68, 35.62],
  [32.55, 35.565], [32.4, 35.55], [32.2, 35.55], [32.0, 35.52], [31.85, 35.54], [31.76, 35.56], [31.6, 35.52], [31.4, 35.48],
  [31.2, 35.46], [31.05, 35.42], [30.9, 35.36], [30.7, 35.28], [30.5, 35.18], [30.3, 35.13], [30.1, 35.12], [29.9, 35.06],
  [29.7, 35.0], [29.55, 34.98], [29.5, 34.9], [29.7, 34.82], [29.95, 34.72], [30.25, 34.6], [30.55, 34.52], [30.85, 34.42],
  [31.1, 34.32], [31.25, 34.25], [31.32, 34.22], [31.45, 34.38], [31.6, 34.52], [31.7, 34.57], [31.82, 34.64], [31.95, 34.71],
  [32.08, 34.77], [32.2, 34.81], [32.33, 34.85], [32.45, 34.88], [32.58, 34.91], [32.7, 34.94], [32.82, 34.96], [32.8, 35.01],
  [32.84, 35.06], [32.93, 35.075], [33.01, 35.09],
];
const KINNERET: [number, number][] = [[32.89, 35.6], [32.86, 35.64], [32.8, 35.65], [32.72, 35.6], [32.75, 35.55], [32.83, 35.54]];
const DEAD_SEA: [number, number][] = [[31.77, 35.48], [31.75, 35.56], [31.55, 35.56], [31.35, 35.54], [31.1, 35.47], [31.05, 35.41], [31.2, 35.4], [31.45, 35.42], [31.65, 35.45]];

const K = 150; // פיקסלים למעלה
const TILT = 0.84; // "השכבה" של המפה - כמו מבט מלמעלה בזווית
const PAD_X = 64; // רווח בצדדים לשמות הערים
const PAD_TOP = 64; // מקום לעמודות הגבוהות בצפון
const proj = (lat: number, lng: number) => ({ x: PAD_X + (lng - 34.15) * 0.853 * K, y: PAD_TOP + (33.45 - lat) * K * TILT });
const pathOf = (pts: [number, number][]) => pts.map(([la, ln], i) => { const p = proj(la, ln); return `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`; }).join(" ") + " Z";

const W = PAD_X * 2 + 1.8 * 0.853 * K - 20;
const H = PAD_TOP + 4.1 * K * TILT + 40;
const DEPTH = 14;

export function IsraelMap3D({ pins, active, onPick, locked }: { pins: Pin[]; active: string; onPick: (city: string) => void; locked?: (city: string) => boolean }) {
  const land = useMemo(() => pathOf(OUTLINE), []);
  const kin = useMemo(() => pathOf(KINNERET), []);
  const dead = useMemo(() => pathOf(DEAD_SEA), []);
  const max = Math.max(1, ...pins.map((p) => p.count));
  // מציירים מהרחוק (צפון) לקרוב (דרום) כדי שעמודות יכסו נכון
  const sorted = [...pins].sort((a, b) => b.lat - a.lat);

  // שמות הערים בשני טורים בצדדים (ים / מזרח), מסודרים לפי גובה, עם קו חיבור לעמודה
  const labels = useMemo(() => {
    const pts = pins.map((p) => ({ p, ...proj(p.lat, p.lng) })).sort((a, b) => a.x - b.x);
    const mid = pts.length ? pts[Math.floor(pts.length / 2)].x : 0;
    const place = (arr: typeof pts, side: "w" | "e") => {
      const sorted = [...arr].sort((a, b) => a.y - b.y);
      const GAP = 15;
      let last = -1e9;
      return sorted.map((o) => {
        const ly = Math.max(o.y, last + GAP);
        last = ly;
        return { ...o, ly, side };
      });
    };
    return [...place(pts.filter((o) => o.x < mid), "w"), ...place(pts.filter((o) => o.x >= mid), "e")];
  }, [pins]);

  return (
    <svg className="adm-map3d" viewBox={`0 0 ${W.toFixed(0)} ${H.toFixed(0)}`} role="img" aria-label="מפת ישראל - פעילות לפי עיר">
      <defs>
        <linearGradient id="m3dTop" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#f4fbf7" />
          <stop offset="0.45" stopColor="#e3f1ea" />
          <stop offset="1" stopColor="#f3e6cf" />
        </linearGradient>
        <linearGradient id="m3dSide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5f9a92" />
          <stop offset="1" stopColor="#2e5f5c" />
        </linearGradient>
        <linearGradient id="m3dSea" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#cfe9f3" />
          <stop offset="1" stopColor="#eef8fb" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="m3dShadow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#103a3c" stopOpacity="0.28" />
          <stop offset="1" stopColor="#103a3c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="m3dColK" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0b6a6e" />
          <stop offset="0.5" stopColor="#1aa3a8" />
          <stop offset="1" stopColor="#0e7c80" />
        </linearGradient>
        <linearGradient id="m3dColB" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8e1240" />
          <stop offset="0.5" stopColor="#e2457f" />
          <stop offset="1" stopColor="#be1354" />
        </linearGradient>
        <filter id="m3dGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* הים */}
      <rect x="0" y="0" width={W * 0.55} height={H} fill="url(#m3dSea)" />
      <text x={PAD_X - 6} y={H - 90} textAnchor="middle" className="adm-map3d__sea">הים התיכון</text>

      {/* צל על "השולחן" */}
      <ellipse cx={W * 0.5} cy={H - 26} rx={W * 0.32} ry={18} fill="url(#m3dShadow)" />

      {/* עובי הארץ - שכבות */}
      {Array.from({ length: DEPTH }, (_, i) => DEPTH - i).map((d) => (
        <path key={d} d={land} transform={`translate(0 ${d})`} fill="url(#m3dSide)" opacity={d === DEPTH ? 0.9 : 1} />
      ))}
      {/* פני השטח */}
      <path d={land} fill="url(#m3dTop)" stroke="#ffffff" strokeWidth="2.2" strokeLinejoin="round" />
      <path d={land} fill="none" stroke="#8fbdb6" strokeWidth="0.8" strokeLinejoin="round" />
      <path d={kin} fill="#9fd3e3" stroke="#6fb3c9" strokeWidth="0.8" />
      <path d={dead} fill="#a9d7e6" stroke="#79b8cc" strokeWidth="0.8" />

      {/* שמות הערים בצדדים */}
      <g className="adm-map3d__labels">
        {labels.map(({ p, x, y, ly, side }) => {
          const lx = side === "w" ? 6 : W - 6;
          const txt = `${locked?.(p.city) ? "🔒 " : ""}${p.city} · ${p.participants}`;
          const w = Math.min(64, txt.length * 4.8 + 4);
          const ax = side === "w" ? lx + w : lx - w;
          return (
            <g key={`l-${p.city}`} className={active === p.city ? "is-on" : ""} onClick={() => onPick(p.city)} role="button" aria-label={p.city}>
              <polyline points={`${ax},${ly - 3} ${side === "w" ? ax + 6 : ax - 6},${ly - 3} ${x},${y - 3}`} className="adm-map3d__lead" />
              <text x={lx} y={ly} textAnchor={side === "w" ? "end" : "start"} className="adm-map3d__lbl">{txt}</text>
            </g>
          );
        })}
      </g>

      {/* עמודות פעילות */}
      {sorted.map((p) => {
        const { x, y } = proj(p.lat, p.lng);
        const h = 8 + (p.count / max) * 52;
        const w = 8;
        const tot = Math.max(1, p.boys + p.girls);
        const hb = p.boys + p.girls ? (h * p.boys) / tot : h;
        const on = active === p.city;
        const onlyGirls = p.girls > 0 && p.boys === 0;
        return (
          <g key={p.city} className={`adm-map3d__col${on ? " is-on" : ""}`} onClick={() => onPick(p.city)} role="button" aria-label={`${p.city}: ${p.count} פעילויות`}>
            <title>{`${p.city} · ${p.count} פעילויות (טללי ברכה ${p.boys}, בנות צילה ${p.girls}) · ${p.participants} משתתפים`}</title>
            <ellipse cx={x} cy={y + 1} rx={w * 0.9} ry={w * 0.38} fill="#0d3c3e" opacity="0.25" filter="url(#m3dGlow)" />
            <g className="adm-map3d__grow" style={{ transformOrigin: `${x}px ${y}px` }}>
              {/* טללי ברכה למטה (טורקיז), בנות צילה מעל (ורוד) */}
              {hb > 0 && !onlyGirls ? <rect x={x - w / 2} y={y - hb} width={w} height={hb} fill="url(#m3dColK)" /> : null}
              {h - hb > 0 || onlyGirls ? <rect x={x - w / 2} y={y - h} width={w} height={onlyGirls ? h : h - hb} fill="url(#m3dColB)" /> : null}
              <ellipse cx={x} cy={y - h} rx={w / 2} ry={w * 0.22} fill={p.girls ? "#f7a8c6" : "#8fe0e3"} />
              <ellipse cx={x} cy={y} rx={w / 2} ry={w * 0.22} fill={p.boys ? "#0a5a5d" : "#7a0f37"} />
              <text x={x} y={y - h - 4} className="adm-map3d__num">{p.count}</text>
            </g>
            <rect x={x - 10} y={y - h - 14} width="20" height={h + 20} fill="transparent" />
          </g>
        );
      })}
    </svg>
  );
}
