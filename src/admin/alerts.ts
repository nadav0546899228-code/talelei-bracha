/** "מה דורש טיפול" - משותף ללוח הבקרה ולפעמון ההתראות */
import { useCallback, useEffect, useState } from "react";
import type { IconName } from "../components/Icon";
import { api, type Me, type Submission, type View } from "./api";
import type { Mode } from "./nav";
import type { OrgData } from "./org";
import type { Overview } from "./views/KollelView";
import { useLive } from "./live";

export type Alert = { id: string; icon: IconName; label: string; count: number; tone: "red" | "yellow"; view: View; tab?: string };

export function useAlerts(me: Me | null, mode: Mode, subs: Submission[] | null) {
  const [kollel, setKollel] = useState<Overview | null>(null);
  const [org, setOrg] = useState<OrgData | null>(null);
  const [unread, setUnread] = useState(0);
  const views = me?.user.views ?? [];
  const canKollel = mode === "boys" && views.includes("kollel");
  const canOrg = views.includes("org");

  const load = useCallback(() => {
    if (!me) return;
    if (canKollel) api<Overview>("/api/kollel/overview").then(setKollel).catch(() => setKollel(null));
    else setKollel(null);
    if (canOrg) api<OrgData>("/api/org").then(setOrg).catch(() => setOrg(null));
    else setOrg(null);
  }, [me, canKollel, canOrg]);
  const loadMsgs = useCallback(() => {
    if (!me?.user.views.includes("messages")) return;
    api<{ messages: { read: boolean; mine: boolean }[] }>("/api/messages")
      .then((r) => setUnread(r.messages.filter((m) => !m.mine && !m.read).length))
      .catch(() => undefined);
  }, [me]);
  useEffect(() => {
    loadMsgs();
  }, [loadMsgs]);
  useLive(["messages"], loadMsgs);

  useEffect(() => {
    load();
  }, [load]);
  useLive(["avrechim", "kollelMonths", "orgUnits", "phoneUsers", "users"], load);

  const alerts: Alert[] = [];
  alerts.push({ id: "msgs", icon: "chat", label: "הודעות שלא נקראו", count: unread, tone: "red", view: "messages" });
  const list = subs ?? [];
  const newOf = (forms: string[]) => list.filter((s) => forms.includes(s.form) && s.status === "new").length;

  if (kollel) {
    const known = new Set(kollel.branches.map((b) => b.id));
    const act = kollel.avrechim.filter((a) => a.active);
    alerts.push({ id: "nophone", icon: "phone", label: "אברכים בלי טלפון", count: act.filter((a) => !a.phone).length, tone: "yellow", view: "kollel", tab: "avrechim:nophone" });
    alerts.push({ id: "nobranch", icon: "pin", label: "אברכים בלי סניף", count: act.filter((a) => !a.branchId || !known.has(a.branchId)).length, tone: "yellow", view: "kollel", tab: "avrechim:nobranch" });
    if (kollel.me.canPayroll) {
      alerts.push({ id: "nomonth", icon: "calendar", label: "אין חודש פתוח לדיווח", count: kollel.months.some((m) => !m.locked) ? 0 : 1, tone: "red", view: "payroll" });
    }
  }
  if (org) {
    const domain = mode === "boys" ? "kollel" : "bnot";
    const role = `${domain}_branch`;
    const managed = new Set(org.people.filter((p) => p.roles.includes(role as never)).map((p) => p.scope?.[domain]?.branchId));
    const missing = org.branches.filter((b) => b.domain === domain && !managed.has(b.id)).length;
    alerts.push({ id: "nomgr", icon: "users", label: mode === "boys" ? "סניפים בלי מנהל" : "סניפים בלי מנהלת", count: missing, tone: "yellow", view: "org" });
  }
  if (mode === "girls" && views.includes("isha")) {
    const unassigned = list.filter((s) => s.form === "ishaRequest" && !s.assignedMentorId && !["done", "archived"].includes(s.status)).length;
    alerts.push({ id: "isha-new", icon: "chat", label: "בקשות שיחה חדשות", count: newOf(["ishaRequest"]), tone: "red", view: "isha", tab: "ishaRequest" });
    alerts.push({ id: "isha-un", icon: "hands", label: "בקשות בלי מלווה", count: unassigned, tone: "red", view: "isha", tab: "ishaRequest" });
    alerts.push({ id: "mentor-new", icon: "heart", label: "מלוות חדשות לבדיקה", count: newOf(["ishaMentor"]), tone: "yellow", view: "isha", tab: "ishaMentor" });
  }
  if (views.includes("inquiries")) {
    alerts.push({ id: "inq", icon: "inbox", label: "פניות חדשות מהאתר", count: newOf(["contact", "volunteer", "updates", "assistance"]), tone: "red", view: "inquiries" });
  }

  return { alerts, active: alerts.filter((a) => a.count > 0), kollel, org, reload: load };
}
