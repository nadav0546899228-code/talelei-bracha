/** הוצאות סניף - כלליות על הסניף (כיבוד, ספרים, שכירות...), לא לאברך מסוים */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, del, post } from "../api";
import { Chips, ExportBtn, money } from "../components";
import { EXPENSE_CATEGORIES, type BranchExpense } from "../kollelCalc";
import { buildXlsx, downloadBlob, type Sheet } from "../xlsx";
import { useLive } from "../live";
import type { Overview } from "./KollelView";

export function branchExpensesSheet(ov: Overview, _label: string, list: BranchExpense[]): Sheet {
  const bname = (id: string) => ov.branches.find((b) => b.id === id)?.name ?? "-";
  const cname = (id: string) => {
    const b = ov.branches.find((x) => x.id === id);
    return ov.cities.find((c) => c.id === b?.parentId)?.name ?? "";
  };
  return {
    name: "הוצאות סניפים",
    widths: [16, 18, 14, 30, 12, 18],
    moneyCols: [4],
    totalRow: true,
    rows: [
      ["עיר", "סניף", "קטגוריה", "פירוט", "סכום", "דווח ע״י"],
      ...list.map((e) => [cname(e.branchId), bname(e.branchId), e.category || "", e.description, e.amount, e.byName]),
      ["סה״כ", "", "", "", list.reduce((t, e) => t + e.amount, 0), ""],
    ],
  };
}

export function useBranchExpenses(month: string) {
  const [list, setList] = useState<BranchExpense[] | null>(null);
  const load = useCallback(() => {
    if (!month) return;
    api<{ expenses: BranchExpense[] }>(`/api/kollel/branch-expenses?month=${encodeURIComponent(month)}`)
      .then((r) => setList(r.expenses))
      .catch(() => setList([]));
  }, [month]);
  useEffect(() => {
    load();
  }, [load]);
  useLive(["kollelBranchExpenses"], load);
  return { list, load };
}

export function BranchExpenses({ ov, month, locked }: { ov: Overview; month: string; locked: boolean }) {
  const { list, load } = useBranchExpenses(month);
  const branches = ov.branches;
  const [form, setForm] = useState({ branchId: branches.length === 1 ? branches[0].id : "", category: EXPENSE_CATEGORIES[0], amount: "", description: "" });
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const total = (list ?? []).reduce((t, e) => t + e.amount, 0);
  const bname = (id: string) => ov.branches.find((b) => b.id === id)?.name ?? "-";
  const byBranch = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of list ?? []) m.set(e.branchId, (m.get(e.branchId) || 0) + e.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);

  const save = async () => {
    setErr("");
    try {
      await post("/api/kollel/branch-expenses", { month, branchId: form.branchId, category: form.category, amount: Number(form.amount), description: form.description });
      setForm({ ...form, amount: "", description: "" });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };
  const remove = async (id: string) => {
    if (!window.confirm("למחוק את ההוצאה?")) return;
    try {
      await del(`/api/kollel/branch-expenses/${id}`);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };
  const label = ov.months.find((m) => m.id === month)?.label ?? month;

  return (
    <section className="adm-panel adm-bx">
      <div className="adm-panel__head">
        <h2>
          <Icon name="file" width={18} height={18} style={{ verticalAlign: "-3px" }} /> הוצאות סניף
        </h2>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong>{money(total)}</strong>
          <ExportBtn onClick={() => downloadBlob(buildXlsx([branchExpensesSheet(ov, label, list ?? [])]), `הוצאות סניפים ${label}.xlsx`)} />
        </span>
      </div>
      <p className="muted" style={{ margin: "0 0 8px", fontSize: "0.86rem" }}>הוצאות כלליות על הסניף - לא נכנסות למשכורת של אברך.</p>

      {byBranch.length > 1 ? (
        <div className="adm-bx__sum">
          {byBranch.map(([id, sum]) => (
            <span key={id}>
              {bname(id)} <strong>{money(sum)}</strong>
            </span>
          ))}
        </div>
      ) : null}

      {!locked ? (
        open ? (
          <div className="adm-bx__form">
            {branches.length > 1 ? (
              <select className="input" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} aria-label="סניף">
                <option value="">בחירת סניף…</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {ov.cities.find((c) => c.id === b.parentId)?.name ? `${ov.cities.find((c) => c.id === b.parentId)?.name} · ` : ""}
                    {b.name}
                  </option>
                ))}
              </select>
            ) : null}
            <Chips<string> value={form.category} onChange={(category) => setForm({ ...form, category })} items={EXPENSE_CATEGORIES.map((c) => ({ id: c, label: c }))} />
            <div className="adm-bx__row">
              <input className="input" type="number" inputMode="decimal" placeholder="₪" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} aria-label="סכום" />
              <input className="input" placeholder="פירוט" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} aria-label="פירוט" />
              <button type="button" className="adm-icon-btn adm-icon-btn--ok" aria-label="שמירה" disabled={!form.branchId || !(Number(form.amount) > 0)} onClick={save}>
                <Icon name="check" />
              </button>
              <button type="button" className="adm-icon-btn" aria-label="סגירה" onClick={() => setOpen(false)}>
                <Icon name="close" />
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(true)}>
            <Icon name="plus" /> הוצאה לסניף
          </button>
        )
      ) : null}
      {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}

      <div className="adm-list" style={{ marginTop: 8 }}>
        {(list ?? []).map((e) => (
          <div key={e.id} className="adm-row" style={{ cursor: "default" }}>
            <span className="adm-row__title">
              {e.category || "הוצאה"}
              {e.description ? ` · ${e.description}` : ""}
            </span>
            <span className="adm-item__actions">
              <strong style={{ whiteSpace: "nowrap" }}>{money(e.amount)}</strong>
              {!locked ? (
                <button type="button" className="adm-icon-btn adm-icon-btn--danger" aria-label="מחיקת הוצאה" onClick={() => remove(e.id)}>
                  <Icon name="trash" />
                </button>
              ) : null}
            </span>
            <span className="adm-row__sub">
              {bname(e.branchId)} · {e.byName}
            </span>
          </div>
        ))}
        {list && !list.length ? <p className="muted">אין הוצאות בחודש הזה.</p> : null}
      </div>
    </section>
  );
}
