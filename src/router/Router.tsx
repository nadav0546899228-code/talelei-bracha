/**
 * נתב קל ללא תלויות (History API). תומך בקישורים פנימיים, עוגנים (#), חזרה אחורה
 * וגלילה לראש העמוד במעבר בין עמודים.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

type RouterState = {
  path: string;
  hash: string;
  navigate: (to: string) => void;
};

const RouterContext = createContext<RouterState | null>(null);

function scrollToHash(hash: string) {
  if (!hash) return false;
  const el = document.getElementById(decodeURIComponent(hash.slice(1)));
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  // העברת פוקוס לנגישות
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  return true;
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState(() => ({
    path: window.location.pathname,
    hash: window.location.hash,
  }));

  useEffect(() => {
    const onPop = () => setLoc({ path: window.location.pathname, hash: window.location.hash });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    const url = new URL(to, window.location.origin);
    const samePath = url.pathname === window.location.pathname;
    window.history.pushState({}, "", url.pathname + url.search + url.hash);
    setLoc({ path: url.pathname, hash: url.hash });
    if (samePath && url.hash) {
      scrollToHash(url.hash);
    } else if (!url.hash) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, []);

  // אחרי טעינת עמוד עם עוגן - גלילה לעוגן כשהתוכן קיים
  useEffect(() => {
    if (!loc.hash) return;
    let tries = 0;
    const id = window.setInterval(() => {
      if (scrollToHash(loc.hash) || ++tries > 20) window.clearInterval(id);
    }, 60);
    return () => window.clearInterval(id);
  }, [loc.path, loc.hash]);

  const value = useMemo(() => ({ ...loc, navigate }), [loc, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterState {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useRouter must be used inside RouterProvider");
  return ctx;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const { navigate, path } = useRouter();
  const isExternal = /^(https?:|mailto:|tel:)/.test(to);

  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (
      e.defaultPrevented ||
      isExternal ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      rest.target === "_blank"
    )
      return;
    e.preventDefault();
    navigate(to);
  };

  const current = !isExternal && to.split("#")[0] === path ? "page" : undefined;

  return (
    <a
      href={to}
      onClick={handle}
      aria-current={current}
      {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...rest}
    >
      {children}
    </a>
  );
}
