import { lazy, Suspense, useEffect } from "react";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { FloatingButtons } from "./components/Floating";
import { UpdateBanner } from "./components/UpdateBanner";
import { isDevSite } from "./config/site";
import { runtime } from "./config/contentModel";
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
  const isShare = path === "/share";
  const hiddenDonationRoute = path === "/donate" && !runtime.featureFlags.donations;
  const route = matchRoute(hiddenDonationRoute ? "/__hidden_donation__" : path);
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
    setMeta('meta[name="robots"]', "name", "robots", isDevSite || isShare || hiddenDonationRoute ? "noindex, nofollow" : "index, follow");
  }, [route, path, isAdmin, isShare, hiddenDonationRoute]);

  if (isAdmin)
    return (
      <>
        {isDevSite ? <div className="dev-banner">אתר פיתוח{runtime.demo ? " · נתוני דמה" : ""}</div> : null}
        <UpdateBanner />
        <Suspense fallback={loading}>
          <AdminApp />
        </Suspense>
      </>
    );

  if (isShare)
    return (
      <Suspense fallback={loading}>
        <Page />
      </Suspense>
    );

  return (
    <>
      <a className="skip-link" href="#main">
        דילוג לתוכן הראשי
      </a>
      {isDevSite ? <div className="dev-banner">אתר פיתוח{runtime.demo ? " · נתוני דמה" : ""}</div> : null}
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
