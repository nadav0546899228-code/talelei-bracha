/**
 * מערכת הניהול - /admin
 * כניסה עם Google. כל משתמש רואה רק את התצוגות שהתפקידים שלו מאפשרים (השרת אוכף).
 * שני מצבים - טללי ברכה (בנים) ובנות צילה (בנות) - בלי ערבוב. החלפה בלוגו שבשורה העליונה.
 * ניווט: כפתורי-על שנכנסים פנימה, ושורה תחתונה שזזה לצדדים וניתנת לעריכה.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { runtime } from "../config/contentModel";
import { Link } from "../router/Router";
import { api, ApiError, post, type Me, type Submission, type View } from "./api";
import { ImpersonateModal } from "./Impersonate";
import { FirstRunGuide, guideKey } from "./FirstRunGuide";
import { entriesFor, entryActive, hubsFor, loadBar, loadMode, MODE_LABELS, modesFor, saveBar, saveMode, type Mode, type NavEntry, type NavLeaf, type Screen } from "./nav";
import { HubView } from "./NavParts";
import { useAlerts } from "./alerts";
import { SearchModal } from "./Search";
import { disablePush, enablePush, pushState } from "./push";
import { OrgView } from "./views/OrgView";
import { MessagesView } from "./views/MessagesView";
import { BnotView } from "./views/BnotView";
import { ReportsView } from "./views/ReportsView";
import { DonationsView } from "./views/DonationsView";
import "./admin.css";
import { AuditView } from "./views/AuditView";
import { ContentView } from "./views/ContentView";
import { DashboardView } from "./views/DashboardView";
import { ActivityCenterView } from "./views/ActivityCenterView";
import { DeveloperView } from "./views/DeveloperView";
import { SubmissionsView } from "./views/SubmissionsView";
import { UsersView } from "./views/UsersView";
import { KollelView } from "./views/KollelView";
import { PayrollView } from "./views/PayrollView";
import { BroadcastView } from "./views/BroadcastView";
import { useLive, useLiveConnection } from "./live";


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
    let manifest = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifest) {
      manifest = document.createElement("link");
      manifest.rel = "manifest";
      document.head.appendChild(manifest);
    }
    manifest.href = `/manifest-${brand}.webmanifest`;
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
  const [barSorting, setBarSorting] = useState(false);
  const [draggingBarId, setDraggingBarId] = useState<string | null>(null);
  const barPressTimer = useRef<number | null>(null);
  const barPress = useRef<{ id: string; x: number; y: number; pointerId: number; el: HTMLElement } | null>(null);
  const suppressBarClick = useRef(false);
  const barScrollRef = useRef<HTMLDivElement>(null);

  const loadMe = useCallback(async () => {
    try {
      const m = await api<Me>("/api/auth/me");
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
  const [bellOpen, setBellOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
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
    barPress.current = { id, x: ev.clientX, y: ev.clientY, pointerId: ev.pointerId, el: ev.currentTarget };
    barPressTimer.current = window.setTimeout(() => {
      const p = barPress.current;
      if (!p || p.id !== id) return;
      suppressBarClick.current = true;
      setBarSorting(true);
      setDraggingBarId(id);
      try { p.el.setPointerCapture(p.pointerId); } catch { /* לא קריטי */ }
      try { navigator.vibrate?.(18); } catch { /* לא קריטי */ }
    }, 420);
  };
  const barPointerMove = (ev: ReactPointerEvent<HTMLButtonElement>) => {
    const p = barPress.current;
    if (!p) return;
    const distance = Math.hypot(ev.clientX - p.x, ev.clientY - p.y);
    if (!draggingBarId) {
      if (distance > 9) clearBarTimer();
      return;
    }
    ev.preventDefault();
    const tabs = barScrollRef.current;
    if (tabs) {
      const rect = tabs.getBoundingClientRect();
      if (ev.clientX < rect.left + 42) tabs.scrollBy({ left: -18 });
      else if (ev.clientX > rect.right - 42) tabs.scrollBy({ left: 18 });
    }
    const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-bar-id]");
    const overId = hit?.dataset.barId;
    if (!overId || overId === draggingBarId) return;
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
  };
  const finishBarPress = () => {
    clearBarTimer();
    barPress.current = null;
    setDraggingBarId(null);
    setBarSorting(false);
  };
  const barNav = (
    <nav aria-label="ניווט ראשי" className={`adm-bar${barSorting ? " is-sorting" : ""}`}>
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
            onPointerUp={finishBarPress}
            onPointerCancel={finishBarPress}
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

  return (
    <div className="adm" data-mode={mode} data-display={displayMode}>
      <header className="adm-top">
        {modes.length > 1 ? (
          <button type="button" className="adm-mode" onClick={switchMode} aria-label={`מעבר ל${MODE_LABELS[mode === "boys" ? "girls" : "boys"]}`} title={`מעבר ל${MODE_LABELS[mode === "boys" ? "girls" : "boys"]}`}>
            <Logo org={mode === "boys" ? "taleiBracha" : "bnotTzila"} height={40} />
            <Icon name="refresh" className="adm-mode__swap" />
          </button>
        ) : (
          <Link to="/" aria-label="לאתר">
            <Logo org={mode === "boys" ? "taleiBracha" : "bnotTzila"} height={40} />
          </Link>
        )}
        <div className="adm-top__title">
          {MODE_LABELS[mode]}
          <small>{title}</small>
        </div>
        <div className="adm-top__spacer" />
        <div className="adm-user">
          {me.canImpersonate ? (
            <button
              type="button"
              className="adm-viewbtn adm-views-trigger"
              onClick={openImpersonate}
              title="מעבר בין תצוגות"
              aria-label={`התצוגה הנוכחית: ${viewName}. מעבר בין תצוגות`}
            >
              <span>{viewName}</span>
              <Icon name="chevronDown" />
            </button>
          ) : null}
          <button type="button" className="adm-icon-btn adm-search-btn" onClick={() => setSearchOpen(true)} aria-label="חיפוש" title="חיפוש">
            <Icon name="search" />
          </button>
          <button type="button" className="adm-icon-btn adm-bell" onClick={() => setBellOpen(!bellOpen)} aria-label={`התראות${dash.active.length ? ` (${dash.active.length})` : ""}`} title="התראות">
            <Icon name="bell" />
            {dash.active.length ? <span className="adm-badge">{dash.active.length}</span> : null}
          </button>
          <button type="button" className="adm-account-btn" onClick={() => setProfileOpen(true)} aria-label="האזור האישי" title="האזור האישי">
            {account.picture ? <img src={account.picture} alt="" referrerPolicy="no-referrer" /> : <span className="adm-avatar">{initial}</span>}
            <span className="adm-account-btn__text">
              <strong>{account.name || account.email}</strong>
              <small>האזור האישי</small>
            </span>
            <Icon name="chevronDown" className="adm-account-btn__arrow" />
          </button>
        </div>
      </header>

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
          {"hub" in current ? (
            <HubView hub={hubs.find((h) => h.id === current.hub)!} badge={leafBadge} onOpen={openLeaf} />
          ) : (
            <>
              {curView === "dashboard" ? <DashboardView {...ctx} views={me.user.views} dash={dash} /> : null}
              {curView === "activity" ? <ActivityCenterView go={go} /> : null}
              {curView === "isha" ? (
                <SubmissionsView key={`isha-${curTab ?? ""}`} {...ctx} forms={["ishaRequest", "ishaMentor"]} initialForm={curTab as never} title="אישה לאישה" />
              ) : null}
              {curView === "inquiries" ? <SubmissionsView key="inq" {...ctx} forms={["contact", "volunteer", "updates", "assistance"]} title="פניות" /> : null}
              {curView === "kollel" ? <KollelView key={`k-${curTab ?? ""}`} me={me} go={go} initialTab={curTab} /> : null}
              {curView === "payroll" ? <PayrollView me={me} /> : null}
              {curView === "messages" ? <MessagesView me={me} /> : null}
              {curView === "bnot" ? <BnotView key={`bn-${curTab ?? ""}`} me={me} initialTab={curTab} /> : null}
              {curView === "reports" ? <ReportsView /> : null}
              {curView === "org" ? <OrgView key={mode} me={me} domain={mode === "boys" ? "kollel" : "bnot"} /> : null}
              {curView === "broadcast" ? <BroadcastView key={`bc-${mode}-${curTab ?? ""}`} me={me} mode={mode} initialTab={curTab} /> : null}
              {curView === "content" ? <ContentView key={`ct-${curTab ?? ""}`} initialSection={curTab} /> : null}
              {curView === "donations" ? <DonationsView me={me} /> : null}
              {curView === "users" ? <UsersView me={me} /> : null}
              {curView === "audit" ? <AuditView /> : null}
              {curView === "developer" ? <DeveloperView {...ctx} /> : null}
            </>
          )}
        </main>
      </div>
      <div className="adm-tabs" ref={barScrollRef}>{barNav}</div>
      {searchOpen ? <SearchModal onClose={() => setSearchOpen(false)} onGo={go} /> : null}
      {bellOpen ? (
        <>
          <div className="adm-pop-back" onClick={() => setBellOpen(false)} />
          <div className="adm-pop" role="dialog" aria-label="התראות">
            {dash.active.length ? (
              dash.active.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`adm-pop__item adm-pop__item--${a.tone}`}
                  onClick={() => {
                    setBellOpen(false);
                    go(a.view, a.tab);
                  }}
                >
                  <Icon name={a.icon} />
                  <span>{a.label}</span>
                  <span className="adm-badge" style={{ flex: "none" }}>
                    {a.count}
                  </span>
                </button>
              ))
            ) : (
              <div className="adm-allgood" style={{ margin: 0 }}>
                <Icon name="checkCircle" /> אין התראות
              </div>
            )}
          </div>
        </>
      ) : null}
      {profileOpen ? (
        <Profile
          me={me}
          onLogout={logout}
          onClose={() => setProfileOpen(false)}
          onCode={() => {
            setProfileOpen(false);
            setCodeOpen(true);
          }}
          displayMode={displayMode}
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
  onClose,
  onCode,
  onSaved,
  onLogout,
  onGuide,
  onViews,
  displayMode,
  onDisplayMode,
}: {
  me: Me;
  onClose: () => void;
  onCode: () => void;
  onSaved: () => void;
  onLogout: () => void;
  onGuide: () => void;
  onViews?: () => void;
  displayMode: DisplayMode;
  onDisplayMode: (mode: DisplayMode) => void;
}) {
  const account = me.account ?? me.user;
  const [name, setName] = useState(account.name || "");
  const [phone, setPhone] = useState(account.phone || "");
  const [err, setErr] = useState<string | null>(null);
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

  const save = async () => {
    try {
      await post("/api/auth/profile", { name, phone });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };

  const roleText = account.roles.map((r) => me.roleLabels[r]).join(" · ");
  const initial = (account.name || account.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="adm-personal-back" role="dialog" aria-modal="true" aria-label="האזור האישי">
      <div className="adm-personal">
        <header className="adm-personal__top">
          <div>
            <span className="adm-eyebrow">החשבון שלי</span>
            <h1>האזור האישי</h1>
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
            {account.email ? <small dir="ltr">{account.email}</small> : null}
          </div>
        </section>

        <section className="adm-personal__card">
          <div className="adm-personal__heading">
            <span><Icon name="monitor" /></span>
            <div><h2>תצוגת המערכת</h2><p>בחר איך המערכת תוצג במכשיר הזה.</p></div>
          </div>
          <div className="adm-display-picker" role="radiogroup" aria-label="תצוגת המערכת">
            <button type="button" role="radio" aria-checked={displayMode === "auto"} className={displayMode === "auto" ? "is-active" : ""} onClick={() => onDisplayMode("auto")}>
              <Icon name="refresh" /><span>אוטומטי</span>
            </button>
            <button type="button" role="radio" aria-checked={displayMode === "desktop"} className={displayMode === "desktop" ? "is-active" : ""} onClick={() => onDisplayMode("desktop")}>
              <Icon name="monitor" /><span>מחשב</span>
            </button>
            <button type="button" role="radio" aria-checked={displayMode === "mobile"} className={displayMode === "mobile" ? "is-active" : ""} onClick={() => onDisplayMode("mobile")}>
              <Icon name="smartphone" /><span>פלאפון</span>
            </button>
          </div>
        </section>

        <section className="adm-personal__card adm-personal__hub">
          <button type="button" className="adm-personal__row" onClick={togglePush} disabled={push === "busy" || push === "unsupported" || push === "blocked"}>
            <span className="adm-personal__rowicon"><Icon name="bell" /></span>
            <span>
              <strong>התראות למכשיר</strong>
              <small>
                {push === "on"
                  ? "פעילות במכשיר הזה"
                  : push === "blocked"
                    ? "חסומות בהגדרות הדפדפן"
                    : push === "unsupported"
                      ? "לא זמינות במכשיר הזה"
                      : push === "busy"
                        ? "בודק..."
                        : "כבויות — לחיצה להפעלה"}
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

          {account.kind === "phone" ? (
            <button type="button" className="adm-personal__row" onClick={onCode}>
              <span className="adm-personal__rowicon"><Icon name="lock" /></span>
              <span><strong>החלפת קוד אישי</strong><small>עדכון קוד הכניסה למערכת</small></span>
              <Icon name="arrowLeft" className="adm-personal__arrow" />
            </button>
          ) : null}

          <button type="button" className="adm-personal__row adm-personal__row--logout" onClick={onLogout}>
            <span className="adm-personal__rowicon"><Icon name="logout" /></span>
            <span><strong>התנתקות</strong><small>יציאה מהחשבון במכשיר הזה</small></span>
            <Icon name="arrowLeft" className="adm-personal__arrow" />
          </button>
        </section>

        <section className="adm-personal__card">
          <div className="adm-personal__heading">
            <span><Icon name="users" /></span>
            <div><h2>פרטי חשבון</h2><p>הפרטים שמופיעים בתוך מערכת הניהול.</p></div>
          </div>
          <div className="adm-fields">
            <label className="field">
              <span className="field__label">שם</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">טלפון</span>
              <input className="input" type="tel" dir="ltr" style={{ textAlign: "right" }} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
          {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button type="button" className="btn btn--sm" onClick={save}>
              <Icon name="check" /> שמירת פרטים
            </button>
          </div>
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
