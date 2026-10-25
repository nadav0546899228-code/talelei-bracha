/**
 * מערכת הניהול - /admin
 * כניסה עם Google. כל משתמש רואה רק את התצוגות שהתפקידים שלו מאפשרים (השרת אוכף).
 * שני מצבים - טללי ברכה (בנים) ובנות צילה (בנות) - בלי ערבוב. החלפה בלוגו שבשורה העליונה.
 * ניווט: כפתורי-על שנכנסים פנימה, ושורה תחתונה שזזה לצדדים וניתנת לעריכה.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Icon, type IconName } from "../components/Icon";
import { Logo } from "../components/Logo";
import { runtime } from "../config/contentModel";
import { Link } from "../router/Router";
import { api, ApiError, post, type Me, type Submission, type View, setCacheOwner, clearApiCache } from "./api";
import { ImpersonateModal } from "./Impersonate";
import { FirstRunGuide, guideKey } from "./FirstRunGuide";
import { entriesFor, entryActive, hubsFor, loadBar, loadMode, MODE_LABELS, modesFor, saveBar, saveMode, type Mode, type NavEntry, type NavLeaf, type Screen } from "./nav";
import { HubView } from "./NavParts";
import { useAlerts, type Alert } from "./alerts";
import { SearchModal } from "./Search";
import { OrgScopeBar } from "./OrgScopeBar";
import { disablePush, enablePush, pushState } from "./push";
import { OrgView } from "./views/OrgView";
import { MessagesView } from "./views/MessagesView";
import { BnotView } from "./views/BnotView";
import { ReportsHub } from "./views/ExportCenter";
import { DonationsView } from "./views/DonationsView";
import "./admin.css";
import { AuditView } from "./views/AuditView";
import { ContentView } from "./views/ContentView";
import { DashboardView } from "./views/DashboardView";
import { ActivityCenterView } from "./views/ActivityCenterView";
import { SmartCenterView } from "./views/SmartCenterView";
import { DeveloperView } from "./views/DeveloperView";
import { SubmissionsView } from "./views/SubmissionsView";
import { UsersView } from "./views/UsersView";
import { KollelView } from "./views/KollelView";
import { PayrollView } from "./views/PayrollView";
import { BroadcastView } from "./views/BroadcastView";
import { useLive, useLiveConnection } from "./live";
import { useInstall } from "./install";


/* ------------------------------------------------------------------ כניסה */

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void;
          renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
        };
      };
    };
  }
}

function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("לא ניתן לטעון את כניסת Google"));
    document.head.appendChild(s);
  });
}

function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"google" | "phone">("google");
  const [ph, setPh] = useState("");
  const [code, setCode] = useState("");
  const clientId = runtime.googleClientId;
  // כניסת בדיקה - רק כשהאתר רץ על המחשב המקומי (השרת חוסם בכל מקום אחר)
  const [devEmail, setDevEmail] = useState("");
  const devLogin = async () => {
    try {
      await post("/api/auth/dev-login", { email: devEmail });
      onLoggedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    }
  };

  const phoneLogin = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/api/auth/phone", { phone: ph, code });
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "הכניסה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!clientId || mode !== "google") return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !btnRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            setBusy(true);
            setError(null);
            try {
              await post("/api/auth/google", { credential });
              onLoggedIn();
            } catch (e) {
              setError(e instanceof Error ? e.message : "הכניסה נכשלה");
            } finally {
              setBusy(false);
            }
          },
        });
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "signin_with",
          locale: "he",
          width: 280,
        });
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [clientId, onLoggedIn, mode]);

  return (
    <div className="adm-login">
      <div className="adm-login__card">
        <div className="adm-login__logos">
          <Logo org="taleiBracha" height={84} priority />
          <Logo org="bnotTzila" height={64} priority />
        </div>
        <h1 style={{ fontFamily: "var(--font-body)", fontSize: "1.5rem", fontWeight: 800 }}>כניסת צוות</h1>
        <p className="muted" style={{ margin: 0 }}>
          מערכת הניהול של קרן טללי ברכה ובנות צילה. הכניסה בחשבון Google מורשה בלבד.
        </p>
        {runtime.serverAvailable ? (
          <div className="tabs" role="tablist" style={{ marginTop: 18, marginBottom: 4 }}>
            <button type="button" role="tab" aria-selected={mode === "google"} onClick={() => setMode("google")}>
              Google
            </button>
            <button type="button" role="tab" aria-selected={mode === "phone"} onClick={() => setMode("phone")}>
              טלפון וקוד
            </button>
          </div>
        ) : null}
        {!runtime.serverAvailable ? (
          <div className="adm-alert adm-alert--info">השרת לא זמין בתצוגה זו. מערכת הניהול פועלת רק כשהאתר רץ עם השרת (npm start).</div>
        ) : mode === "phone" ? (
          <form onSubmit={phoneLogin} className="adm-fields" style={{ marginTop: 14, textAlign: "start" }}>
            <label className="field">
              <span className="field__label">מספר טלפון</span>
              <input className="input" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" style={{ textAlign: "right" }} value={ph} onChange={(e) => setPh(e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">קוד</span>
              <input className="input" type="password" inputMode="numeric" autoComplete="current-password" dir="ltr" style={{ textAlign: "right" }} value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <button type="submit" className="btn" disabled={busy || !ph || !code}>
              כניסה
            </button>
          </form>
        ) : clientId ? (
          <div className="adm-login__gbtn" ref={btnRef} aria-busy={busy} />
        ) : (
          <div className="adm-alert adm-alert--info">
            כניסת Google עדיין לא הוגדרה. יש להוסיף את <code>GOOGLE_CLIENT_ID</code> ל-Secrets.
          </div>
        )}
        {runtime.devLogin && mode === "google" ? (
          <div className="adm-alert adm-alert--info">
            <strong>כניסת בדיקה מקומית</strong>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input className="input" dir="ltr" value={devEmail} onChange={(e) => setDevEmail(e.target.value)} placeholder="email" aria-label="מייל לבדיקה" />
              <button type="button" className="btn btn--sm" onClick={devLogin}>
                כניסה
              </button>
            </div>
          </div>
        ) : null}
        {busy ? <p className="muted">מתחבר…</p> : null}
        {error ? (
          <div className="adm-alert adm-alert--error" role="alert">
            {error}
          </div>
        ) : null}
        <p style={{ marginTop: 20, marginBottom: 0 }}>
          <Link to="/">← חזרה לאתר</Link>
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ מעטפת */

function screenFromUrl(): Screen {
  const p = new URLSearchParams(window.location.search);
  const v = p.get("v") || "dashboard";
  return v.startsWith("hub-") ? { hub: v.slice(4) } : { view: v as View, tab: p.get("t") || undefined };
}

type DisplayMode = "auto" | "desktop" | "mobile";
type FontSize = "sm" | "md" | "lg";

/** איזה אייקון אפליקציה מתאים להרשאות (כמו בשרת) */
function appBrandOf(me: Me | null): "combined" | "kollel" | "bnot" {
  const v = (me?.account ?? me?.user)?.views ?? [];
  const k = v.includes("kollel") || v.includes("payroll");
  const b = v.includes("bnot") || v.includes("isha");
  return k && b ? "combined" : b ? "bnot" : k ? "kollel" : "combined";
}

function loadDisplayMode(userId: string): DisplayMode {
  try {
    const value = localStorage.getItem(`tb-display-mode:${userId}`);
    return value === "desktop" || value === "mobile" ? value : "auto";
  } catch {
    return "auto";
  }
}

export default function AdminApp() {
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<"loading" | "login" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [screen, setScreen] = useState<Screen>(screenFromUrl);
  // כפתור "חזרה" של הטלפון/הדפדפן - צעד אחד אחורה בתוך המערכת
  useEffect(() => {
    const onPop = () => {
      if (window.location.pathname.startsWith("/admin")) setScreen(screenFromUrl());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const [mode, setModeState] = useState<Mode>("boys");
  const [bar, setBar] = useState<string[]>([]);
  const [asOpen, setAsOpen] = useState(false);

  useEffect(() => {
    const account = me?.account ?? me?.user;
    if (!account) return;
    const k = account.views.includes("kollel");
    const b = account.views.includes("bnot");
    const brand = k && b ? "combined" : b ? "bnot" : "kollel";
    // המניפסט של האפליקציה נקבע בשרת (admin.webmanifest) - החלפה אחרי הטעינה שוברת את ההתקנה בכרום
    let icon = document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }
    icon.href = brand === "bnot" ? "/brand/logo-bnot-tzila.png" : brand === "kollel" ? "/brand/logo-keren-talelei-bracha.png" : "/brand/icon-combined-192.png";
  }, [me?.user.id, me?.account?.id]);
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("auto");
  // בפלאפון לא מציגים תצוגת מחשב גם אם נבחרה בעבר (אחרת המסך נחתך)
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 899px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const appInst = useInstall();
  const [instHide, setInstHide] = useState(() => {
    try {
      return localStorage.getItem("tb-inst-sheet") === "1";
    } catch {
      return false;
    }
  });
  const [instHelp, setInstHelp] = useState<string | null>(null);
  const hideInstall = () => {
    setInstHide(true);
    try {
      localStorage.setItem("tb-inst-sheet", "1");
    } catch {
      /* לא נשמר */
    }
  };
  const shownDisplay: DisplayMode = displayMode;

  const [barSorting, setBarSorting] = useState(false);
  const [draggingBarId, setDraggingBarId] = useState<string | null>(null);
  const barPressTimer = useRef<number | null>(null);
  const barPress = useRef<{ id: string; x: number; y: number; lastX: number; lastY: number; pointerId: number; el: HTMLElement; panning: boolean } | null>(null);
  const suppressBarClick = useRef(false);
  const barScrollRef = useRef<HTMLDivElement>(null);
  const barGrip = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  // הצמדת הסרגל: למטה / לצד ימין / לצד שמאל (נשמר במכשיר)
  const [dock, setDock] = useState<"bottom" | "right" | "left">(() => {
    try {
      const v = localStorage.getItem("tb-dock");
      return v === "right" || v === "left" ? v : "bottom";
    } catch {
      return "bottom";
    }
  });
  const [fontSize, setFontSize] = useState<FontSize>(() => {
    try {
      const v = localStorage.getItem("tb-font");
      return v === "sm" || v === "lg" ? v : "md";
    } catch {
      return "md";
    }
  });
  const saveFont = (f: FontSize) => {
    setFontSize(f);
    try {
      localStorage.setItem("tb-font", f);
    } catch {
      /* לא נשמר */
    }
  };
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.fontSize;
    el.style.fontSize = fontSize === "sm" ? "14px" : fontSize === "lg" ? "18px" : "";
    return () => {
      el.style.fontSize = prev;
    };
  }, [fontSize]);
  const [dockPreview, setDockPreview] = useState<"bottom" | "right" | "left" | null>(null);
  const saveDock = (d: "bottom" | "right" | "left") => {
    setDock(d);
    try {
      localStorage.setItem("tb-dock", d);
    } catch {
      /* לא נשמר */
    }
  };

  const loadMe = useCallback(async () => {
    try {
      const m = await api<Me>("/api/auth/me");
      setCacheOwner(`${m.user.id}|${m.user.impersonatedBy?.id || ""}`);
      setMe(m);
      setModeState(loadMode(m, modesFor(m)));
      setState("ready");
      if (m.mustChangeCode) setCodeOpen(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setState("login");
      else {
        setErrorMsg(e instanceof Error ? e.message : "שגיאה");
        setState(runtime.serverAvailable ? "error" : "login");
      }
    }
  }, []);

  useEffect(() => {
    document.title = "מערכת ניהול | קרן טללי ברכה · בנות צילה";
    let m = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!m) {
      m = document.createElement("meta");
      m.name = "robots";
      document.head.appendChild(m);
    }
    m.content = "noindex, nofollow";
    loadMe();
  }, [loadMe]);

  const refreshSubs = useCallback(async () => {
    try {
      const r = await api<{ submissions: Submission[] }>("/api/admin/submissions");
      setSubs(r.submissions);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setState("login");
    }
  }, []);

  useLiveConnection(state === "ready");
  useLive(["submissions"], () => state === "ready" && refreshSubs());

  useEffect(() => {
    if (state !== "ready") return;
    refreshSubs();
    const id = window.setInterval(refreshSubs, 30_000);
    const onFocus = () => document.visibilityState === "visible" && refreshSubs();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [state, refreshSubs]);

  const modes = useMemo(() => (me ? modesFor(me) : []), [me]);
  const hubs = useMemo(() => (me ? hubsFor(me, mode) : []), [me, mode]);
  const entries = useMemo(() => entriesFor(hubs), [hubs]);
  const dash = useAlerts(state === "ready" ? me : null, mode, subs);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSeed, setSearchSeed] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [appMenuQuery, setAppMenuQuery] = useState("");
  useEffect(() => {
    if (me) setBar(loadBar(me, mode, entries));
  }, [me, mode, entries]);

  useEffect(() => {
    if (me) setDisplayMode(loadDisplayMode((me.account ?? me.user).id));
  }, [me?.user.id, me?.account?.id]);

  useEffect(() => {
    if (!me || state !== "ready") return;
    try {
      setGuideOpen(!localStorage.getItem(guideKey(me, mode)));
    } catch {
      setGuideOpen(false);
    }
  }, [me, mode, state]);

  const leaves = hubs.flatMap((h) => h.items);
  const viewOk = (v: View) => leaves.some((l) => l.view === v);
  const current: Screen = "hub" in screen ? (hubs.some((h) => h.id === screen.hub) ? screen : { view: "dashboard" }) : viewOk(screen.view) ? screen : { view: "dashboard" };

  useEffect(() => {
    if (!appMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAppMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [appMenuOpen]);

  const setUrl = (s: Screen) => {
    const url = new URL(window.location.href);
    url.searchParams.set("v", "hub" in s ? `hub-${s.hub}` : s.view);
    if (!("hub" in s) && s.tab) url.searchParams.set("t", s.tab);
    else url.searchParams.delete("t");
    const next = url.pathname + url.search;
    if (next === window.location.pathname + window.location.search) return;
    // לוח הבקרה הוא נקודת הבסיס - שאר המסכים נכנסים להיסטוריה
    window.history.pushState({ tb: 1 }, "", next);
  };
  const show = (s: Screen) => {
    setScreen(s);
    setUrl(s);
    setAppMenuOpen(false);
    setAppMenuQuery("");
    window.scrollTo({ top: 0 });
  };
  const go = (v: View, tab?: string) => show({ view: v, tab });
  const openLeaf = (l: NavLeaf) => go(l.view, l.tab);
  const openEntry = (e: NavEntry) => (e.leaf ? openLeaf(e.leaf) : e.hub ? show({ hub: e.hub.id }) : undefined);

  const switchMode = () => {
    if (!me || modes.length < 2) return;
    const next: Mode = mode === "boys" ? "girls" : "boys";
    setModeState(next);
    saveMode(me, next);
    show({ view: "dashboard" });
  };

  const setPreferredDisplay = (next: DisplayMode) => {
    setDisplayMode(next);
    if (!me) return;
    try {
      const accountId = (me.account ?? me.user).id;
      if (next === "auto") localStorage.removeItem(`tb-display-mode:${accountId}`);
      else localStorage.setItem(`tb-display-mode:${accountId}`, next);
    } catch {
      /* העדפה מקומית בלבד */
    }
  };

  const logout = async () => {
    await post("/api/auth/logout", {}).catch(() => undefined);
    clearApiCache();
    setCacheOwner("");
    setMe(null);
    setState("login");
  };

  if (state === "loading") {
    return (
      <div className="page-loading">
        <div className="spinner" aria-label="טוען" />
      </div>
    );
  }
  if (state === "login" || !me) return <LoginScreen onLoggedIn={loadMe} />;
  if (state === "error") {
    return (
      <div className="adm-login">
        <div className="adm-login__card">
          <div className="adm-alert adm-alert--error">{errorMsg}</div>
          <button type="button" className="btn" style={{ marginTop: 16 }} onClick={loadMe}>
            ניסיון נוסף
          </button>
        </div>
      </div>
    );
  }

  const newCount = (forms: string[]) => (subs ?? []).filter((x) => forms.includes(x.form) && x.status === "new").length;
  const unreadMsgs = dash.alerts.find((x) => x.id === "msgs")?.count ?? 0;
  const leafBadge = (l: NavLeaf) => (l.badgeMessages ? unreadMsgs : 0) + (l.badgeForms ? newCount(l.badgeForms) : 0);
  const entryBadge = (e: NavEntry) => (e.leaf ? leafBadge(e.leaf) : (e.hub?.items ?? []).reduce((t, l) => t + leafBadge(l), 0));

  const account = me.account ?? me.user;
  const initial = (account.name || account.email || "?").trim().charAt(0).toUpperCase();
  const barEntries = bar.map((id) => entries.find((e) => e.id === id)).filter(Boolean) as NavEntry[];
  const curView: View | null = "hub" in current ? null : current.view;
  const curTab = "hub" in current ? undefined : current.tab;
  const title = "hub" in current ? hubs.find((h) => h.id === current.hub)?.label ?? "" : leaves.find((l) => l.view === current.view && (!l.tab || l.tab === curTab))?.label ?? me.viewLabels[current.view];

  const clearBarTimer = () => {
    if (barPressTimer.current !== null) {
      window.clearTimeout(barPressTimer.current);
      barPressTimer.current = null;
    }
  };
  const barPointerDown = (ev: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    clearBarTimer();
    suppressBarClick.current = false;
    barPress.current = { id, x: ev.clientX, y: ev.clientY, lastX: ev.clientX, lastY: ev.clientY, pointerId: ev.pointerId, el: ev.currentTarget, panning: false };
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* לא קריטי */ }
    barPressTimer.current = window.setTimeout(() => {
      const p = barPress.current;
      if (!p || p.id !== id || p.panning) return;
      suppressBarClick.current = true;
      setBarSorting(true);
      setDraggingBarId(id);
      try { navigator.vibrate?.(18); } catch { /* לא קריטי */ }
    }, 420);
  };
  const barPointerMove = (ev: ReactPointerEvent<HTMLButtonElement>) => {
    const p = barPress.current;
    if (!p) return;
    const dx = ev.clientX - p.lastX;
    const totalX = ev.clientX - p.x;
    const totalY = ev.clientY - p.y;
    const distance = Math.hypot(totalX, totalY);
    const tabs = barScrollRef.current;

    if (!draggingBarId) {
      // גרירה רגילה = הזזת הסרגל עצמו. מתחילים אחרי תנועה קטנה,
      // ומבטלים את הלחיצה הארוכה כדי שלא תופעל בטעות בזמן גלילה.
      if (distance > 6) {
        p.panning = true;
        clearBarTimer();
        suppressBarClick.current = true;
      }
      if (p.panning && tabs) {
        ev.preventDefault();
        if (dock === "bottom") tabs.scrollBy({ left: -dx, behavior: "auto" });
        else tabs.scrollBy({ top: -(ev.clientY - p.lastY), behavior: "auto" });
      }
      p.lastX = ev.clientX;
      p.lastY = ev.clientY;
      return;
    }

    ev.preventDefault();
    if (tabs) {
      const rect = tabs.getBoundingClientRect();
      if (ev.clientX < rect.left + 54) tabs.scrollBy({ left: -26, behavior: "auto" });
      else if (ev.clientX > rect.right - 54) tabs.scrollBy({ left: 26, behavior: "auto" });
    }
    const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-bar-id]");
    const overId = hit?.dataset.barId;
    if (overId && overId !== draggingBarId) {
      setBar((prev) => {
        const from = prev.indexOf(draggingBarId);
        const to = prev.indexOf(overId);
        if (from < 0 || to < 0 || from === to) return prev;
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        saveBar(me, mode, next);
        return next;
      });
    }
    p.lastX = ev.clientX;
    p.lastY = ev.clientY;
  };
  const finishBarPress = (ev?: ReactPointerEvent<HTMLButtonElement>) => {
    clearBarTimer();
    const p = barPress.current;
    if (p && ev) {
      try { ev.currentTarget.releasePointerCapture(p.pointerId); } catch { /* לא קריטי */ }
    }
    barPress.current = null;
    setDraggingBarId(null);
    setBarSorting(false);
  };
  // גרירת שש הנקודות: הסרגל זז עם האצבע ונצמד לצד הקרוב (ימין / שמאל / למטה). לחיצה בלי גרירה מחליפה צד.
  const dockFor = (x: number, y: number): "bottom" | "right" | "left" => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (y > h * 0.78 && x > w * 0.22 && x < w * 0.78) return "bottom";
    if (x < w * 0.35) return "left";
    if (x > w * 0.65) return "right";
    return "bottom";
  };
  const gripPointerDown = (ev: ReactPointerEvent<HTMLButtonElement>) => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    barGrip.current = { pointerId: ev.pointerId, x: ev.clientX, y: ev.clientY, moved: false };
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* לא קריטי */ }
  };
  const gripPointerMove = (ev: ReactPointerEvent<HTMLButtonElement>) => {
    const g = barGrip.current;
    if (!g) return;
    ev.preventDefault();
    if (!g.moved && Math.hypot(ev.clientX - g.x, ev.clientY - g.y) > 10) g.moved = true;
    if (g.moved) setDockPreview(dockFor(ev.clientX, ev.clientY));
  };
  const gripPointerEnd = (ev: ReactPointerEvent<HTMLButtonElement>) => {
    const g = barGrip.current;
    if (g) {
      try { ev.currentTarget.releasePointerCapture(g.pointerId); } catch { /* לא קריטי */ }
      if (g.moved) saveDock(dockFor(ev.clientX, ev.clientY));
      else saveDock(dock === "bottom" ? "right" : dock === "right" ? "left" : "bottom");
    }
    barGrip.current = null;
    setDockPreview(null);
  };

  const barNav = (
    <nav aria-label="ניווט ראשי" className={`adm-bar${barSorting ? " is-sorting" : ""}`} style={{ ["--bar-n" as string]: String(barEntries.length) }}>
      {barEntries.map((e) => {
        const b = entryBadge(e);
        const dragging = draggingBarId === e.id;
        return (
          <button
            key={e.id}
            type="button"
            data-bar-id={e.id}
            className={`adm-tab${dragging ? " is-dragging" : ""}`}
            aria-current={entryActive(e, current) ? "page" : undefined}
            aria-label={barSorting ? `${e.label}, גרירה לשינוי מיקום` : e.label}
            onPointerDown={(ev) => barPointerDown(ev, e.id)}
            onPointerMove={barPointerMove}
            onPointerUp={(ev) => finishBarPress(ev)}
            onPointerCancel={(ev) => finishBarPress(ev)}
            onContextMenu={(ev) => ev.preventDefault()}
            onClick={(ev) => {
              if (suppressBarClick.current) {
                suppressBarClick.current = false;
                ev.preventDefault();
                return;
              }
              openEntry(e);
            }}
          >
            <Icon name={e.icon} />
            <span>{e.label}</span>
            {b ? <span className="adm-badge" aria-label={`${b} חדשות`}>{b}</span> : null}
          </button>
        );
      })}
    </nav>
  );

  const sideNav = (
    <nav aria-label="תצוגות">
      {hubs.map((h) =>
        h.items.length === 1 ? (
          <button key={h.id} type="button" className="adm-tab" aria-current={curView === h.items[0].view ? "page" : undefined} onClick={() => openLeaf(h.items[0])}>
            <Icon name={h.icon} />
            <span>{h.label}</span>
            {leafBadge(h.items[0]) ? <span className="adm-badge">{leafBadge(h.items[0])}</span> : null}
          </button>
        ) : (
          <div key={h.id} className="adm-side__group">
            <button type="button" className="adm-side__hub" aria-current={"hub" in current && current.hub === h.id ? "page" : undefined} onClick={() => show({ hub: h.id })}>
              <Icon name={h.icon} />
              {h.label}
            </button>
            {h.items.map((l) => (
              <button
                key={l.id}
                type="button"
                className="adm-tab adm-tab--sub"
                aria-current={curView === l.view && (!l.tab || !curTab || l.tab === curTab) ? "page" : undefined}
                onClick={() => openLeaf(l)}
              >
                <span>{l.label}</span>
                {leafBadge(l) ? <span className="adm-badge">{leafBadge(l)}</span> : null}
              </button>
            ))}
          </div>
        ),
      )}
    </nav>
  );

  const openImpersonate = () => setAsOpen(true);
  const stopImpersonate = async () => {
    try { localStorage.removeItem("tb-active-org-scope"); } catch { /* לא זמין */ }
    await post("/api/auth/stop-impersonate", {}).catch(() => undefined);
    setSubs(null);
    await loadMe();
    refreshSubs();
  };
  const switched = async () => {
    setAsOpen(false);
    setSubs(null);
    show({ view: "dashboard" });
    await loadMe();
    refreshSubs();
  };
  const ctx = { me, subs, refreshSubs, go, openImpersonate, mode };
  const by = me.user.impersonatedBy;
  // שם התצוגה שפתוחה עכשיו (התפקיד שלי, או של מי שנכנסתי בשמו)
  const ownRole = account.roles.includes("developer") ? "developer" : account.roles[0];
  const viewName = by
    ? me.user.kind === "virtual"
      ? me.user.name.replace(" (תצוגה לדוגמה)", "")
      : me.roleLabels[me.user.roles[0]] || me.user.name || ""
    : me.roleLabels[ownRole] || "תצוגות";
  const ownViewLabel = me.roleLabels[ownRole] || "החשבון שלי";
  const menuQuery = appMenuQuery.trim().toLocaleLowerCase("he");
  const menuGroups = hubs
    .flatMap((h) => (h.items.some((l) => l.group) ? [...new Set(h.items.map((l) => l.group || ""))].map((g) => ({ ...h, id: `${h.id}:${g}`, label: g ? `${h.label} · ${g}` : h.label, items: h.items.filter((l) => (l.group || "") === g) })) : [h]))
    .map((h) => ({
      ...h,
      items: h.items.filter((l) => !menuQuery || `${h.label} ${l.label} ${l.hint || ""}`.toLocaleLowerCase("he").includes(menuQuery)),
    }))
    .filter((h) => h.items.length);
  const unreadMessages = dash.active.find((a) => a.id === "msgs")?.count ?? 0;

  return (
    <div className="adm" data-mode={mode} data-display={shownDisplay} data-dock={dock}>
      <header className="adm-top">
        <button type="button" className="adm-icon-btn adm-top-menu-btn" onClick={() => setAppMenuOpen(true)} aria-label="פתיחת תפריט המערכת" title="תפריט המערכת">
          <Icon name="menu" />
        </button>
        {modes.length > 1 ? (
          <button type="button" className="adm-mode adm-mode--logo-only" onClick={switchMode} aria-label={`מעבר ל${MODE_LABELS[mode === "boys" ? "girls" : "boys"]}`} title={`מעבר ל${MODE_LABELS[mode === "boys" ? "girls" : "boys"]}`}>
            <Logo org={mode === "boys" ? "taleiBracha" : "bnotTzila"} height={42} />
            <Icon name="refresh" className="adm-mode__swap" />
          </button>
        ) : (
          <Link to="/" className="adm-mode adm-mode--logo-only" aria-label="לאתר">
            <Logo org={mode === "boys" ? "taleiBracha" : "bnotTzila"} height={42} />
          </Link>
        )}
        <div className="adm-top__title adm-top__title--page">
          <strong>{title}</strong>
        </div>
        <div className="adm-top__spacer" />
        <div className="adm-user">
          {me.canImpersonate ? (
            <button
              type="button"
              className="adm-viewbtn"
              onClick={() => setAsOpen(true)}
              aria-label={`תצוגה: ${viewName}. מעבר תצוגה`}
              title="מעבר תצוגה"
            >
              <span className="adm-viewbtn__txt">
                <small>תצוגה</small>
                <b>{viewName}</b>
              </span>
              <Icon name="chevronDown" />
            </button>
          ) : null}
          <button type="button" className="adm-account-btn adm-account-btn--notified" onClick={() => setProfileOpen(true)} aria-label={`האזור האישי${unreadMessages ? `, ${unreadMessages} הודעות שלא נקראו` : ""}`} title="האזור האישי">
            <span className="adm-account-btn__avatar-wrap">
              {account.picture ? <img src={account.picture} alt="" referrerPolicy="no-referrer" /> : <span className="adm-avatar">{initial}</span>}
              {unreadMessages ? <span className="adm-account-msg-badge">{unreadMessages > 99 ? "99+" : unreadMessages}</span> : null}
            </span>
            <span className="adm-account-btn__text">
              <strong>{account.name || account.email}</strong>
              <small>{unreadMessages ? `${unreadMessages} הודעות חדשות` : "האזור האישי"}</small>
            </span>
            <Icon name="chevronDown" className="adm-account-btn__arrow" />
          </button>
        </div>
      </header>

      <OrgScopeBar me={me} mode={mode} />

      {appMenuOpen ? (
        <div className="adm-appmenu-back" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setAppMenuOpen(false)}>
          <section className="adm-appmenu" role="dialog" aria-modal="true" aria-label="כל אפשרויות המערכת">
            <header className="adm-appmenu__head">
              <div>
                <span className="adm-eyebrow">{MODE_LABELS[mode]}</span>
                <h2>תפריט המערכת</h2>
                <small>אפשרויות לפי ההרשאות שלך</small>
              </div>
              <button type="button" className="adm-icon-btn" onClick={() => setAppMenuOpen(false)} aria-label="סגירת התפריט">
                <Icon name="close" />
              </button>
            </header>

            <div className="adm-appmenu__tools">
              <label className="adm-appmenu__search">
                <Icon name="search" />
                <input
                  type="search"
                  value={appMenuQuery}
                  onChange={(e) => setAppMenuQuery(e.target.value)}
                  placeholder="חיפוש בתפריט או בכל המערכת…"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && appMenuQuery.trim().length >= 2) {
                      e.preventDefault();
                      setSearchSeed(appMenuQuery.trim());
                      setAppMenuOpen(false);
                      setSearchOpen(true);
                    }
                  }}
                />
                {appMenuQuery ? <button type="button" onClick={() => setAppMenuQuery("")} aria-label="ניקוי חיפוש"><Icon name="close" /></button> : null}
              </label>
              {appMenuQuery.trim().length >= 2 ? (
                <button
                  type="button"
                  className="adm-appmenu__global-search"
                  onClick={() => {
                    setSearchSeed(appMenuQuery.trim());
                    setAppMenuOpen(false);
                    setSearchOpen(true);
                  }}
                >
                  <Icon name="search" />
                  <span><strong>חיפוש בכל המערכת</strong><small>“{appMenuQuery.trim()}”</small></span>
                  <Icon name="arrowLeft" />
                </button>
              ) : null}
            </div>

            <div className="adm-appmenu__body">
              {menuGroups.map((h) => (
                <section className="adm-appmenu__group" key={h.id}>
                  <div className="adm-appmenu__group-head">
                    <span className="adm-appmenu__group-icon"><Icon name={h.icon} /></span>
                    <div><strong>{h.label}</strong><small>{h.items.length} אפשרויות</small></div>
                  </div>
                  <div className="adm-appmenu__grid">
                    {h.items.map((l) => {
                      const b = leafBadge(l);
                      const active = curView === l.view && (!l.tab || !curTab || l.tab === curTab);
                      return (
                        <button type="button" key={l.id} className="adm-appmenu__item" aria-current={active ? "page" : undefined} onClick={() => openLeaf(l)}>
                          <span className="adm-appmenu__item-icon"><Icon name={l.icon} /></span>
                          <span className="adm-appmenu__item-copy">
                            <strong>{l.label}</strong>
                            {l.hint ? <small>{l.hint}</small> : null}
                          </span>
                          {b ? <span className="adm-appmenu__badge">{b}</span> : <Icon name="arrowLeft" className="adm-appmenu__arrow" />}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
              {!menuGroups.length ? (
                <div className="adm-empty-state">
                  <Icon name="search" />
                  <strong>לא נמצאה אפשרות כזאת</strong>
                  <span>נסו מילת חיפוש אחרת.</span>
                </div>
              ) : null}
            </div>

            <footer className="adm-appmenu__foot">
              <button type="button" onClick={() => { setAppMenuOpen(false); setProfileOpen(true); }}>
                <span className="adm-avatar">{initial}</span>
                <span><strong>{account.name || account.email}</strong><small>{ownViewLabel} · אזור אישי והעדפות</small></span>
                <Icon name="arrowLeft" />
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      <div className="adm-layout">
        <aside className="adm-side">
          {modes.length > 1 ? (
            <div className="adm-modes" role="tablist" aria-label="מצב">
              {modes.map((m) => (
                <button key={m} type="button" role="tab" aria-selected={m === mode} onClick={() => m !== mode && switchMode()}>
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          ) : null}
          {sideNav}
          <div className="adm-side__foot">
            <Link to="/">← לאתר הציבורי</Link>
            <span className="muted" dir="ltr">{account.email || account.phone}</span>
          </div>
        </aside>
        <main className="adm-main" id="main" tabIndex={-1}>
          {narrow && !guideOpen && !appInst.installed && !instHide ? (
            <div className="adm-instsheet" role="dialog" aria-label="התקנת האפליקציה">
              <div className="adm-instsheet__card">
                <img className="adm-instsheet__icon" src={`/brand/app-${appBrandOf(me)}-192.png`} alt="" />
                <h2>התקנת האפליקציה</h2>
                <p>אייקון במסך הבית, נפתח ישר למערכת - בלי לחפש בדפדפן.</p>
                {instHelp ? (
                  <ol className="adm-instsheet__steps">
                    {instHelp.split("←").map((x, i) => (
                      <li key={i}>{x.trim()}</li>
                    ))}
                  </ol>
                ) : null}
                <div className="adm-instsheet__btns">
                  {!instHelp ? (
                    <button
                      type="button"
                      className="adm-instsheet__go"
                      onClick={async () => {
                        const r = await appInst.install();
                        if (r === "manual") setInstHelp(appInst.manualText);
                        else hideInstall();
                      }}
                    >
                      <Icon name="download" /> התקנה
                    </button>
                  ) : null}
                  <button type="button" className="adm-instsheet__later" onClick={hideInstall}>
                    {instHelp ? "הבנתי" : "לא עכשיו"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {"hub" in current ? (
            <HubView hub={hubs.find((h) => h.id === current.hub)!} badge={leafBadge} onOpen={openLeaf} />
          ) : (
            <>
              {curView === "dashboard" ? <DashboardView {...ctx} views={me.user.views} dash={dash} /> : null}
              {curView === "smart" ? <SmartCenterView go={go} initialTab={curTab} /> : null}
              {curView === "activity" ? <ActivityCenterView go={go} /> : null}
              {curView === "isha" ? (
                <SubmissionsView key={`isha-${curTab ?? ""}`} {...ctx} forms={["ishaRequest", "ishaMentor"]} initialForm={curTab as never} title="אישה לאישה" />
              ) : null}
              {curView === "inquiries" ? <SubmissionsView key="inq" {...ctx} forms={["contact", "volunteer", "updates", "assistance"]} title="פניות" /> : null}
              {curView === "kollel" ? <KollelView key={`k-${curTab ?? ""}`} me={me} go={go} initialTab={curTab} /> : null}
              {curView === "payroll" ? <PayrollView me={me} /> : null}
              {curView === "messages" ? <MessagesView key={`msg-${mode}`} me={me} mode={mode} /> : null}
              {curView === "bnot" ? <BnotView key={`bn-${curTab ?? ""}`} me={me} initialTab={curTab} /> : null}
              {curView === "reports" ? <ReportsHub key={`rp-${curTab ?? ""}`} me={me} initialTab={curTab} /> : null}
              {curView === "org" ? <OrgView key={mode} me={me} domain={mode === "boys" ? "kollel" : "bnot"} /> : null}
              {curView === "broadcast" ? <BroadcastView key={`bc-${mode}-${curTab ?? ""}`} me={me} mode={mode} initialTab={curTab} /> : null}
              {curView === "content" ? <ContentView key={`ct-${curTab ?? ""}`} initialSection={curTab} /> : null}
              {curView === "donations" ? <DonationsView me={me} /> : null}
              {curView === "users" ? <UsersView key={`u-${mode}`} me={me} mode={mode} /> : null}
              {curView === "audit" ? <AuditView /> : null}
              {curView === "developer" ? <DeveloperView {...ctx} /> : null}
            </>
          )}
        </main>
      </div>
      <div className="adm-tabs" ref={barScrollRef}>
        {barNav}
        <button
          type="button"
          className="adm-bar-grip"
          aria-label="הצמדת הסרגל לצד המסך - גרירה או לחיצה"
          title="גרירה לצד המסך"
          onPointerDown={gripPointerDown}
          onPointerMove={gripPointerMove}
          onPointerUp={gripPointerEnd}
          onPointerCancel={gripPointerEnd}
        >
          <span className="adm-bar-grip__dots" aria-hidden="true">
            <i /><i /><i /><i /><i /><i />
          </span>
        </button>
      </div>
      {dockPreview ? <div className={`adm-dock-ghost adm-dock-ghost--${dockPreview}`} aria-hidden="true" /> : null}
      {searchOpen ? <SearchModal initialQuery={searchSeed} onClose={() => { setSearchOpen(false); setSearchSeed(""); }} onGo={go} /> : null}
      {profileOpen ? (
        <Profile
          me={me}
          alerts={dash.active}
          onAlert={(view, tab) => {
            setProfileOpen(false);
            go(view, tab);
          }}
          onLogout={logout}
          onClose={() => setProfileOpen(false)}
          onCode={() => {
            setProfileOpen(false);
            setCodeOpen(true);
          }}
          displayMode={shownDisplay}
          dock={dock}
          onDock={saveDock}
          fontSize={fontSize}
          onFontSize={saveFont}
          onDisplayMode={setPreferredDisplay}
          onGuide={() => {
            setProfileOpen(false);
            setGuideOpen(true);
          }}
          onViews={me.canImpersonate ? () => {
            setProfileOpen(false);
            setAsOpen(true);
          } : undefined}
          onSaved={() => {
            setProfileOpen(false);
            loadMe();
          }}
        />
      ) : null}
      {asOpen ? (
        <ImpersonateModal
          mode={mode}
          current={by ? me.user.id : undefined}
          backLabel={ownViewLabel}
          onClose={() => setAsOpen(false)}
          onSwitched={switched}
          onBack={
            by
              ? () => {
                  setAsOpen(false);
                  stopImpersonate();
                }
              : undefined
          }
        />
      ) : null}
      {codeOpen ? <ChangeCode forced={me.mustChangeCode} onClose={() => { setCodeOpen(false); setMe({ ...me, mustChangeCode: false }); }} /> : null}
      {guideOpen ? <FirstRunGuide me={me} mode={mode} onClose={() => setGuideOpen(false)} /> : null}
    </div>
  );
}

function Profile({
  me,
  alerts,
  onAlert,
  onClose,
  onCode,
  onSaved,
  onLogout,
  onGuide,
  onViews,
  displayMode,
  onDisplayMode,
  dock,
  onDock,
  fontSize,
  onFontSize,
}: {
  me: Me;
  alerts: Alert[];
  onAlert: (view: View, tab?: string) => void;
  onClose: () => void;
  onCode: () => void;
  onSaved: () => void;
  onLogout: () => void;
  onGuide: () => void;
  onViews?: () => void;
  displayMode: DisplayMode;
  onDisplayMode: (mode: DisplayMode) => void;
  dock: "bottom" | "right" | "left";
  onDock: (d: "bottom" | "right" | "left") => void;
  fontSize: FontSize;
  onFontSize: (f: FontSize) => void;
}) {
  const inst = useInstall();
  const [instMsg, setInstMsg] = useState<string | null>(null);
  const account = me.account ?? me.user;
  const [open, setOpen] = useState<"name" | "phone" | null>(null);
  const [name, setName] = useState(account.name || "");
  const [phone, setPhone] = useState(account.phone || "");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [push, setPush] = useState<"on" | "off" | "blocked" | "unsupported" | "busy">("busy");

  useEffect(() => {
    pushState().then(setPush).catch(() => setPush("unsupported"));
  }, []);

  const togglePush = async () => {
    setErr(null);
    const prev = push;
    setPush("busy");
    try {
      if (prev === "on") await disablePush();
      else {
        await enablePush();
        await post("/api/push/test", {}).catch(() => undefined);
      }
      setPush(await pushState());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
      setPush(await pushState());
    }
  };

  const save = async (what: "name" | "phone") => {
    setErr(null);
    try {
      await post("/api/auth/profile", { name, phone });
      setOk(what === "name" ? "השם עודכן ✓" : "הטלפון עודכן ✓");
      setOpen(null);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };

  const roleText = account.roles.map((r) => me.roleLabels[r]).join(" · ");
  const initial = (account.name || account.email || "?").trim().charAt(0).toUpperCase();
  const alertTotal = alerts.reduce((n, a) => n + a.count, 0);

  const detailRow = (key: "name" | "phone", icon: IconName, label: string, value: string, input: ReactNode) => (
    <div className="adm-pf-row">
      <div className="adm-pf-row__head">
        <span className="adm-personal__rowicon"><Icon name={icon} /></span>
        <span className="adm-pf-row__txt">
          <small>{label}</small>
          <strong dir={key === "phone" ? "ltr" : undefined}>{value || "לא הוזן"}</strong>
        </span>
        <button type="button" className="adm-pf-edit" onClick={() => { setErr(null); setOk(null); setName(account.name || ""); setPhone(account.phone || ""); setOpen(open === key ? null : key); }}>
          {open === key ? <><Icon name="close" /> ביטול</> : <><Icon name="edit" /> עריכה</>}
        </button>
      </div>
      {open === key ? (
        <div className="adm-pf-row__form">
          {input}
          <button type="button" className="btn btn--sm" onClick={() => save(key)}>
            <Icon name="check" /> שמירה
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="adm-personal-back" role="dialog" aria-modal="true" aria-label="האזור האישי">
      <div className="adm-personal">
        <header className="adm-personal__top">
          <div>
            <span className="adm-eyebrow">החשבון שלי</span>
            <h1>הפרופיל שלי</h1>
          </div>
          <button type="button" className="adm-icon-btn" aria-label="חזרה למערכת" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>

        <section className="adm-personal__profile">
          {account.picture ? <img src={account.picture} alt="" referrerPolicy="no-referrer" /> : <span className="adm-personal__avatar">{initial}</span>}
          <div>
            <strong>{account.name || account.email}</strong>
            <span>{roleText}</span>
            {account.phone ? <small dir="ltr">{account.phone}</small> : account.email ? <small dir="ltr">{account.email}</small> : null}
          </div>
        </section>

        {/* התראות - שורה אחת; הרשימה נפתחת רק בלחיצה */}
        <section className="adm-personal__card adm-personal__hub">
          <button type="button" className="adm-personal__row" onClick={() => setAlertsOpen(!alertsOpen)} aria-expanded={alertsOpen}>
            <span className="adm-personal__rowicon"><Icon name="bell" /></span>
            <span><strong>הודעות והתראות</strong><small>{alertTotal ? `${alertTotal} ממתינות לטיפול` : "אין כרגע"}</small></span>
            {alertTotal ? <b className="adm-pf-count">{alertTotal}</b> : null}
            <Icon name="chevronDown" className={`adm-personal__arrow${alertsOpen ? " is-open" : ""}`} />
          </button>
          {alertsOpen ? (
            <div className="adm-personal__alert-list" style={{ padding: "0 10px 10px" }}>
              {alerts.length ? alerts.map((a) => (
                <button type="button" className={`adm-personal__alert adm-personal__alert--${a.tone}`} key={a.id} onClick={() => onAlert(a.view, a.tab)}>
                  <span className="adm-personal__rowicon"><Icon name={a.icon} /></span>
                  <span><strong>{a.label}</strong></span>
                  <b>{a.count}</b>
                  <Icon name="arrowLeft" className="adm-personal__arrow" />
                </button>
              )) : <div className="adm-allgood"><Icon name="checkCircle" /> הכל מטופל</div>}
            </div>
          ) : null}
        </section>

        {/* הפרטים שלי - כל שדה נפתח לעריכה רק בלחיצה */}
        <section className="adm-personal__card">
          <div className="adm-personal__heading">
            <span><Icon name="users" /></span>
            <div><h2>הפרטים שלי</h2><p>מופיעים בתוך המערכת ובתפוצות.</p></div>
          </div>
          {detailRow("name", "users", "שם", account.name || "", <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />)}
          {detailRow("phone", "phone", "טלפון", account.phone || "", <input className="input" type="tel" dir="ltr" style={{ textAlign: "right" }} value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />)}
          {account.email ? (
            <div className="adm-pf-row">
              <div className="adm-pf-row__head">
                <span className="adm-personal__rowicon"><Icon name="mail" /></span>
                <span className="adm-pf-row__txt"><small>מייל (כניסה עם Google)</small><strong dir="ltr">{account.email}</strong></span>
              </div>
            </div>
          ) : null}
          {account.kind === "phone" ? (
            <div className="adm-pf-row">
              <div className="adm-pf-row__head">
                <span className="adm-personal__rowicon"><Icon name="lock" /></span>
                <span className="adm-pf-row__txt"><small>קוד כניסה</small><strong>••••••</strong></span>
                <button type="button" className="adm-pf-edit" onClick={onCode}><Icon name="edit" /> שינוי קוד</button>
              </div>
            </div>
          ) : null}
          {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}
          {ok ? <div className="adm-alert adm-alert--ok">{ok}</div> : null}
        </section>

        {/* העדפות אישיות */}
        <section className="adm-personal__card adm-personal__hub">
          <button type="button" className="adm-personal__row" onClick={() => setPrefsOpen(!prefsOpen)} aria-expanded={prefsOpen}>
            <span className="adm-personal__rowicon"><Icon name="monitor" /></span>
            <span><strong>העדפות אישיות</strong><small>תצוגה, גודל כתב ומיקום הסרגל</small></span>
            <Icon name="chevronDown" className={`adm-personal__arrow${prefsOpen ? " is-open" : ""}`} />
          </button>
          {prefsOpen ? (
          <div style={{ padding: "0 14px 12px" }}>
          <div className="adm-pf-pref">
            <span>מצב תצוגה</span>
            <div className="adm-display-picker" role="radiogroup" aria-label="מצב תצוגה">
              {([["auto", "refresh", "אוטומטי"], ["mobile", "smartphone", "פלאפון"], ["desktop", "monitor", "מחשב"]] as const).map(([v, ic, l]) => (
                <button key={v} type="button" role="radio" aria-checked={displayMode === v} className={displayMode === v ? "is-active" : ""} onClick={() => onDisplayMode(v)}>
                  <Icon name={ic} /><span>{l}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="adm-pf-pref">
            <span>גודל כתב</span>
            <div className="adm-display-picker" role="radiogroup" aria-label="גודל כתב">
              {([["sm", "קטן", 13], ["md", "רגיל", 16], ["lg", "גדול", 19]] as const).map(([v, l, px]) => (
                <button key={v} type="button" role="radio" aria-checked={fontSize === v} className={fontSize === v ? "is-active" : ""} onClick={() => onFontSize(v)}>
                  <b style={{ fontSize: px }}>A</b><span>{l}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="adm-pf-pref">
            <span>מיקום סרגל הניווט</span>
            <div className="adm-display-picker" role="radiogroup" aria-label="מיקום סרגל הניווט">
              {([["right", "ימין"], ["bottom", "למטה"], ["left", "שמאל"]] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={dock === v} className={dock === v ? "is-active" : ""} onClick={() => onDock(v)}>
                  <Icon name="grid" /><span>{l}</span>
                </button>
              ))}
            </div>
            <small className="muted">אפשר גם לגרור את שש הנקודות לצד המסך.</small>
          </div>
          </div>
          ) : null}
        </section>

        <section className="adm-personal__card adm-personal__hub">
          {!inst.installed ? (
            <button
              type="button"
              className="adm-personal__row"
              onClick={async () => {
                const r = await inst.install();
                if (r === "manual") setInstMsg(inst.manualText);
              }}
            >
              <span className="adm-personal__rowicon"><Icon name="smartphone" /></span>
              <span>
                <strong>התקנת האפליקציה</strong>
                <small>{instMsg || "אייקון במסך הבית, נפתח ישר למערכת"}</small>
              </span>
              <Icon name="download" className="adm-personal__arrow" />
            </button>
          ) : null}
          <button type="button" className="adm-personal__row" onClick={togglePush} disabled={push === "busy" || push === "unsupported" || push === "blocked"}>
            <span className="adm-personal__rowicon"><Icon name="bell" /></span>
            <span>
              <strong>התראות למכשיר</strong>
              <small>
                {push === "on" ? "פעילות במכשיר הזה" : push === "blocked" ? "חסומות בהגדרות הדפדפן" : push === "unsupported" ? "לא זמינות במכשיר הזה" : push === "busy" ? "בודק..." : "כבויות — לחיצה להפעלה"}
              </small>
            </span>
            <span className={`adm-switch${push === "on" ? " is-on" : ""}`} aria-hidden="true" />
          </button>
          {onViews ? (
            <button type="button" className="adm-personal__row" onClick={onViews}>
              <span className="adm-personal__rowicon"><Icon name="grid" /></span>
              <span><strong>מעבר בין תצוגות</strong><small>צפייה במערכת לפי תפקיד או משתמש</small></span>
              <Icon name="arrowLeft" className="adm-personal__arrow" />
            </button>
          ) : null}
          <button type="button" className="adm-personal__row" onClick={onGuide}>
            <span className="adm-personal__rowicon"><Icon name="info" /></span>
            <span><strong>הדרכה למערכת</strong><small>פתיחת ההדרכה הקצרה מחדש</small></span>
            <Icon name="arrowLeft" className="adm-personal__arrow" />
          </button>
          <button type="button" className="adm-personal__row adm-personal__row--logout" onClick={onLogout}>
            <span className="adm-personal__rowicon"><Icon name="logout" /></span>
            <span><strong>התנתקות</strong><small>יציאה מהחשבון במכשיר הזה</small></span>
            <Icon name="arrowLeft" className="adm-personal__arrow" />
          </button>
        </section>
      </div>
    </div>
  );
}

function ChangeCode({ forced, onClose }: { forced: boolean; onClose: () => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (next !== again) return setErr("הקודים החדשים אינם זהים");
    try {
      await post("/api/auth/change-code", { current: cur, next });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };
  return (
    <div className="adm-modal-back" role="dialog" aria-modal="true" aria-label="החלפת קוד">
      <div className="adm-modal">
        <h2>{forced ? "בחירת קוד אישי" : "החלפת הקוד שלי"}</h2>
        {forced ? <p className="muted">זו כניסה ראשונה עם קוד זמני. יש לבחור קוד אישי של 4 עד 8 ספרות.</p> : null}
        <div className="adm-fields">
          {(
            [
              ["הקוד הנוכחי", cur, setCur, "current-password"],
              ["קוד חדש", next, setNext, "new-password"],
              ["שוב את הקוד החדש", again, setAgain, "new-password"],
            ] as const
          ).map(([label, v, set, ac]) => (
            <label key={label} className="field">
              <span className="field__label">{label}</span>
              <input className="input" type="password" inputMode="numeric" dir="ltr" style={{ textAlign: "right" }} autoComplete={ac} value={v} onChange={(e) => set(e.target.value)} />
            </label>
          ))}
        </div>
        {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}
        <div className="btn-row" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn--sm" disabled={!cur || !next} onClick={save}>
            שמירה
          </button>
          {!forced ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
              ביטול
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export type AdminCtx = {
  me: Me;
  subs: Submission[] | null;
  refreshSubs: () => Promise<void>;
  go: (v: View, tab?: string) => void;
  openImpersonate: () => void;
  mode: Mode;
};
