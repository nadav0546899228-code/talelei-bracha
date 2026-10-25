/** תאריכים לועזיים ועבריים */

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

/** תאריך עברי באותיות, למשל: ג׳ בחשוון תשפ״ז */
export function formatHebrewDate(iso: string): string {
  try {
    const parts = new Intl.DateTimeFormat("he-u-ca-hebrew", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).formatToParts(new Date(iso));
    const day = Number(parts.find((p) => p.type === "day")?.value);
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const year = Number(parts.find((p) => p.type === "year")?.value);
    return `${gematria(day)} ב${month} ${gematria(year % 1000)}`;
  } catch {
    return "";
  }
}

export function dayAndMonth(iso: string): { day: string; month: string } {
  const d = new Date(iso);
  return {
    day: String(d.getDate()),
    month: new Intl.DateTimeFormat("he-IL", { month: "short" }).format(d),
  };
}

/** המרת מספר לאותיות עבריות עם גרש/גרשיים */
export function gematria(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
  const tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
  const hundreds = ["", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק"];
  let s = hundreds[Math.floor(n / 100)] ?? "";
  const rest = n % 100;
  if (rest === 15) s += "טו";
  else if (rest === 16) s += "טז";
  else s += tens[Math.floor(rest / 10)] + ones[rest % 10];
  if (s.length === 1) return s + "׳";
  return s.slice(0, -1) + "״" + s.slice(-1);
}

export function wazeLink(address: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

export function mapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** שיתוף בוואטסאפ - ללא מספר יעד, המשתמש בוחר למי לשלוח */
export function whatsappShareLink(text: string, url?: string): string {
  const full = url ? `${text}\n${url}` : text;
  return `https://wa.me/?text=${encodeURIComponent(full)}`;
}
