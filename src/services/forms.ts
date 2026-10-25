/**
 * שכבת שירות לטפסים. כל הטפסים באתר עוברים כאן בלבד, כך שהחלפת ספק (שרת, דיוור, CRM)
 * נעשית במקום אחד.
 *
 * כל עוד לא הוגדר יעד (url === null) - הפונקציה לא שולחת ולא שומרת שום מידע.
 */
import { formEndpoints, type FormId } from "../config/integrations";

export type SubmitResult =
  | { status: "sent" }
  | { status: "not_connected" }
  | { status: "error"; message: string };

export type FormPayload = Record<string, string | string[] | boolean>;

/** זמן מינימלי למילוי טופס - הגנה בסיסית מבוטים */
export const MIN_FILL_MS = 2500;

export async function submitForm(
  id: FormId,
  data: FormPayload,
  meta: { startedAt: number; honeypot: string },
): Promise<SubmitResult> {
  // הגנת ספאם: שדה מלכודת מלא או מילוי מהיר מדי - מדווחים "הצלחה" שקטה בלי לשלוח
  if (meta.honeypot || Date.now() - meta.startedAt < MIN_FILL_MS) {
    return { status: "sent" };
  }

  const endpoint = formEndpoints[id];
  if (!endpoint.url) return { status: "not_connected" };

  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ form: id, data, sentAt: new Date().toISOString() }),
    });
    if (!res.ok) return { status: "error", message: `השרת החזיר ${res.status}` };
    return { status: "sent" };
  } catch {
    return { status: "error", message: "לא ניתן היה להתחבר לשרת" };
  }
}
