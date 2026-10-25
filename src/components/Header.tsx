import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { bnotNav, kollelNav, mainNav, publicSiteMode } from "../config/site";
import { Link, useRouter } from "../router/Router";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

export function Header() {
  const { path } = useRouter();
  const mode = publicSiteMode(path);
  const nav = mode === "bnot" ? bnotNav : mode === "kollel" ? kollelNav : mainNav;
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // סגירת תפריטים במעבר עמוד ושמירת הבחירה בין שני אתרי התדמית
  useEffect(() => {
    setMenuOpen(false);
    setOpenDropdown(null);
    if (mode === "bnot" || mode === "kollel") sessionStorage.setItem("tb-public-site", mode);
  }, [path, mode]);

  // תפריט מובייל: נעילת גלילה, Escape, פוקוס
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panelRef.current?.querySelector<HTMLElement>("a, button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
      if (e.key === "Tab" && panelRef.current) {
        const items = panelRef.current.querySelectorAll<HTMLElement>("a, button");
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // סגירת תת-תפריט בלחיצה בחוץ / Escape
  useEffect(() => {
    if (!openDropdown) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && (e.target as HTMLElement).closest(".site-nav__item.is-open")) return;
      setOpenDropdown(null);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, [openDropdown]);

  const isActive = (to: string, children?: { to: string }[]) =>
    path === to || (children?.some((c) => c.to === path) ?? false);

  const header = (
    <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
      <div className="container site-header__bar">
        <Link
          to={mode === "bnot" ? "/bnot-tzila" : mode === "kollel" ? "/keren-talelei-bracha" : "/"}
          className={`brand-mark brand-mark--${mode}`}
          aria-label={mode === "bnot" ? "בנות צילה - לדף הבית" : mode === "kollel" ? "קרן טללי ברכה - לדף הבית" : "קרן טללי ברכה ובנות צילה - לדף הבית"}
        >
          {mode === "bnot" ? <Logo org="bnotTzila" height={46} priority /> : mode === "kollel" ? <Logo org="taleiBracha" height={54} priority /> : (
            <>
              <Logo org="taleiBracha" height={54} priority />
              <span className="brand-mark__sep" aria-hidden="true" />
              <Logo org="bnotTzila" height={40} priority />
            </>
          )}
        </Link>

        <nav className="site-nav" aria-label="ניווט ראשי">
          <ul className="site-nav__list">
            {nav.map((item) =>
              item.children ? (
                <li
                  key={item.label}
                  className={`site-nav__item ${openDropdown === item.label ? "is-open" : ""}`}
                  onMouseEnter={() => setOpenDropdown(item.label)}
                  onMouseLeave={() => setOpenDropdown(null)}
                >
                  <button
                    type="button"
                    className="site-nav__link"
                    aria-expanded={openDropdown === item.label}
                    aria-current={isActive(item.to, item.children) ? "page" : undefined}
                    onClick={() => setOpenDropdown((v) => (v === item.label ? null : item.label))}
                  >
                    {item.label}
                    <Icon name="chevronDown" />
                  </button>
                  <ul className="site-nav__dropdown">
                    {item.children.map((c) => (
                      <li key={c.to}>
                        <Link to={c.to}>{c.label}</Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : (
                <li key={item.to} className="site-nav__item">
                  <Link to={item.to} className="site-nav__link">
                    {item.label}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </nav>

        <div className="header-actions">
          {mode !== "home" ? (
            <Link to={mode === "bnot" ? "/keren-talelei-bracha" : "/bnot-tzila"} className="site-mode-switch">
              {mode === "bnot" ? <Logo org="taleiBracha" height={26} /> : <Logo org="bnotTzila" height={25} />}
              <span>{mode === "bnot" ? "לאתר הקרן" : "לאתר בנות צילה"}</span>
            </Link>
          ) : null}
          <Link to="/admin" className="btn btn--ghost btn--sm staff-link" aria-label="כניסת צוות" title="כניסת צוות">
            <Icon name="lock" />
            <span className="staff-link__text">כניסת צוות</span>
          </Link>
          <Link to="/donate" className="btn btn--flame btn--sm">
            <Icon name="heart" />
            לתרומה
          </Link>
          <button
            ref={toggleRef}
            type="button"
            className="menu-toggle"
            aria-label="פתיחת תפריט"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="menu" />
          </button>
        </div>
      </div>
    </header>
  );

  // התפריט נפתח מחוץ לכותרת (portal) כדי שיכסה את כל המסך ולא ייחתך בתוך הפס העליון
  const menu = (
      <div id="mobile-menu" className={`mobile-menu ${menuOpen ? "is-open" : ""}`} aria-hidden={!menuOpen}>
        <div className="mobile-menu__backdrop" onClick={() => setMenuOpen(false)} />
        <div
          ref={panelRef}
          className="mobile-menu__panel"
          role="dialog"
          aria-modal="true"
          aria-label="תפריט ניווט"
        >
          <div className="mobile-menu__head">
            <Logo org="taleiBracha" height={48} />
            <button
              type="button"
              className="icon-btn icon-btn--dark"
              aria-label="סגירת תפריט"
              onClick={() => {
                setMenuOpen(false);
                toggleRef.current?.focus();
              }}
              tabIndex={menuOpen ? 0 : -1}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="mobile-menu__body">
            <ul className="mobile-menu__list">
              {nav.flatMap((item) => {
                const rows = item.children
                  ? [
                      <li key={item.label + "-h"} className="is-group">
                        <Link to={item.to} tabIndex={menuOpen ? 0 : -1}>
                          {item.label}
                        </Link>
                      </li>,
                      ...item.children.map((c) => (
                        <li key={c.to + "-c"} className="is-sub">
                          <Link to={c.to} tabIndex={menuOpen ? 0 : -1}>
                            {c.label}
                          </Link>
                        </li>
                      )),
                    ]
                  : [
                      <li
                        key={item.to}
                        className={item.to === "/bnot-tzila" || item.to === "/isha-le-isha" ? "is-bz" : ""}
                      >
                        <Link to={item.to} tabIndex={menuOpen ? 0 : -1}>
                          {item.label}
                          <Icon name="arrowLeft" width={18} height={18} />
                        </Link>
                      </li>,
                    ];
                return rows;
              })}
            </ul>
          </div>
          <div className="mobile-menu__foot">
            <Link to="/donate" className="btn btn--flame btn--block" tabIndex={menuOpen ? 0 : -1}>
              <Icon name="heart" />
              לתרומה
            </Link>
            <Link to="/isha-le-isha" className="btn btn--ghost-rose btn--block" tabIndex={menuOpen ? 0 : -1}>
              אישה לאישה - בקשת שיחה
            </Link>
            <Link to="/admin" className="btn btn--ghost btn--block" tabIndex={menuOpen ? 0 : -1}>
              <Icon name="lock" />
              כניסת צוות
            </Link>
          </div>
        </div>
      </div>
  );

  return (
    <>
      {header}
      {createPortal(menu, document.body)}
    </>
  );
}
