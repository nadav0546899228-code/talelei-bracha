/**
 * חיבור לימות המשיח (call2all) - שיחות קוליות, צינתוקים ו-SMS.
 * תיעוד: https://f2.freeivr.co.il/topic/55 (API - גישת מפתחים למערכות)
 *
 * Secrets:
 *   YEMOT_TOKEN - "מספר_מערכת:סיסמת_ניהול" או מפתח API קבוע שנוצר בממשק חומת האש של ימות
 *   YEMOT_API_BASE - אופציונלי (ברירת מחדל https://www.call2all.co.il/ym/api/)
 */

const BASE = (process.env.YEMOT_API_BASE || "https://www.call2all.co.il/ym/api/").replace(/\/?$/, "/");
const TOKEN = process.env.YEMOT_TOKEN || "";

export const yemotConfigured = () => Boolean(TOKEN);

async function call(command, params = {}) {
  if (!TOKEN) throw new Error("ימות המשיח לא מחובר - יש להגדיר YEMOT_TOKEN ב-Secrets");
  const res = await fetch(BASE + command, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", authorization: TOKEN },
    body: JSON.stringify({ token: TOKEN, ...params }),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`ימות המשיח החזיר תשובה לא צפויה (${res.status})`);
  }
  if (data.responseStatus !== "OK") {
    throw new Error(`ימות המשיח: ${data.message || data.responseStatus || "שגיאה"}`);
  }
  return data;
}

const colon = (phones) => phones.map((p) => p.phone).join(":");

/** יתרת יחידות ופרטי מערכת */
export const getSession = () => call("GetSession");

export const getTemplates = () => call("GetTemplates");

/**
 * קמפיין קולי.
 * mode "tts": הקראת טקסט אישי לכל נמען (ttsMode=1 - הודעה כללית של התבנית ואחריה הטקסט האישי)
 * mode "template": השמעת ההודעה המוקלטת שהועלתה לתבנית בימות
 */
export function runCampaign({ templateId, callerId, recipients, mode, textFor }) {
  const params = { templateId: Number(templateId) };
  if (callerId) params.callerId = callerId;
  if (mode === "tts") {
    params.ttsMode = 1;
    params.phones = Object.fromEntries(recipients.map((r) => [r.phone, { name: r.name || "", text: textFor(r) }]));
  } else {
    params.phones = colon(recipients);
  }
  return call("RunCampaign", params);
}

export function runTzintuk({ callerId, recipients }) {
  const params = { phones: colon(recipients) };
  if (callerId) params.callerId = callerId;
  return call("RunTzintuk", params);
}

export function sendSms({ from, message, recipients }) {
  const params = { message, phones: colon(recipients) };
  if (from) params.from = from;
  return call("SendSms", params);
}

export const getCampaignStatus = (campaignId) => call("GetCampaignStatus", { campaignId, entries: "all", range: ":" });
