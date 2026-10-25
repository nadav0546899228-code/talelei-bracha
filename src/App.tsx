import { lazy, Suspense, useEffect } from "react";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { FloatingButtons } from "./components/Floating";
import { UpdateBanner } from "./components/UpdateBanner";
import { isDevSite } from "./config/site";
import { useRouter } from "./router/Router";
import { matchRoute } from "./router/routes";

const AdminApp = lazy(() => import("./admin/AdminApp"));
const loading = (
  <div className="page-loading" aria-live="polite">
    <div className="spinner" aria-label="טוען" />
  </div>
);

function setMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export default function App() {
  const { path } = useRouter();
  const isAdmin = path === "/admin" || path.startsWith("/admin/");
  const route = matchRoute(path);
  const Page = route.component;

  // SEO בסיסי לכל עמוד
  useEffect(() => {
    if (isAdmin) return;
    document.title = route.title;
    setMeta('meta[name="description"]', "name", "description", route.description);
    setMeta('meta[property="og:title"]', "property", "og:title", route.title);
    setMeta('meta[property="og:description"]', "property", "og:description", route.description);
    setMeta('meta[property="og:url"]', "property", "og:url", window.location.origin + path);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = window.location.origin + path;
    if (isDevSite) setMeta('meta[name="robots"]', "name", "robots", "noindex, nofollow");
  }, [route, path, isAdmin]);

  if (isAdmin)
    return (
      <>
        <UpdateBanner />
        <Suspense fallback={loading}>
          <AdminApp />
        </Suspense>
      </>
    );

  return (
    <>
      <a className="skip-link" href="#main">
        דילוג לתוכן הראשי
      </a>
      {isDevSite ? <div className="dev-banner">אתר פיתוח</div> : null}
      <Header />
      <main id="main" tabIndex={-1}>
        <Suspense fallback={loading}>
          <Page />
        </Suspense>
      </main>
      <Footer />
      <FloatingButtons />
      <UpdateBanner />
    </>
  );
}
