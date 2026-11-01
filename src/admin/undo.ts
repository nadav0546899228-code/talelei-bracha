/**
 * הודעת "נמחק · בטל" אחרי מחיקה מהמסך - כמו בנוסעים בן טובים.
 * לחיצה על "בטל" מחזירה את מה שנמחק (השרת שומר אותו לרבע שעה).
 */
let host: HTMLDivElement | null = null;
let timer: number | undefined;

export function newUndoId(): string {
  return `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function showUndo(undoId: string, restore: (id: string) => Promise<unknown>) {
  if (typeof document === "undefined") return;
  if (!host) {
    host = document.createElement("div");
    host.className = "adm-undo";
    host.setAttribute("role", "status");
    host.setAttribute("dir", "rtl");
    document.body.appendChild(host);
  }
  window.clearTimeout(timer);
  host.innerHTML = "";
  const text = document.createElement("span");
  text.textContent = "נמחק";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "בטל";
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      await restore(undoId);
      text.textContent = "שוחזר ✓";
      btn.remove();
      // מרעננים את המסכים
      window.dispatchEvent(new CustomEvent("tb-live", { detail: "*" }));
    } catch (e) {
      text.textContent = e instanceof Error ? e.message : "לא ניתן לבטל";
      btn.remove();
    }
    timer = window.setTimeout(hide, 2500);
  };
  host.append(text, btn);
  host.classList.add("is-on");
  timer = window.setTimeout(hide, 8000);
}

function hide() {
  host?.classList.remove("is-on");
}
