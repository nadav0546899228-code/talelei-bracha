import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadContent } from "./config/contentModel";
import { RouterProvider } from "./router/Router";
import "./styles/index.css";

// טעינת התוכן המעודכן ממערכת הניהול, ואז הצגה
loadContent().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <RouterProvider>
        <App />
      </RouterProvider>
    </StrictMode>,
  );
});

// התקנה כאפליקציה בפלאפון (גם לאתר המפורסם וגם לאתר הפיתוח)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
