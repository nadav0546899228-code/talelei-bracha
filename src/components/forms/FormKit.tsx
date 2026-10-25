/**
 * ערכת טפסים: ניהול מצב, ולידציה, הגנת ספאם ותצוגת תוצאה.
 * כל הטפסים נשלחים דרך services/forms בלבד.
 */
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { FormId } from "../../config/integrations";
import { validate, type Rule } from "../../lib/validation";
import { submitForm, type FormPayload, type SubmitResult } from "../../services/forms";
import { Icon } from "../Icon";

export type FieldSpec = {
  rules?: Rule[];
  initial?: string | string[] | boolean;
};

type Values = Record<string, string | string[] | boolean>;

export function useForm(id: FormId, spec: Record<string, FieldSpec>) {
  const initial: Values = Object.fromEntries(
    Object.entries(spec).map(([k, s]) => [k, s.initial ?? ""]),
  );
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const startedAt = useRef(Date.now());
  const honeypot = useRef("");
  const formRef = useRef<HTMLFormElement>(null);

  const check = (name: string, v: Values[string]): string | null => {
    const rules = spec[name]?.rules ?? [];
    if (typeof v === "boolean") {
      return rules.length && !v ? (rules[0]("") ?? "שדה חובה") : null;
    }
    if (Array.isArray(v)) {
      return rules.length ? validate(v.join(","), rules) : null;
    }
    return validate(v, rules);
  };

  const set = (name: string, v: Values[string]) => {
    setValues((prev) => ({ ...prev, [name]: v }));
    if (touched[name]) setErrors((e) => ({ ...e, [name]: check(name, v) }));
  };

  const blur = (name: string) => {
    setTouched((t) => ({ ...t, [name]: true }));
    setErrors((e) => ({ ...e, [name]: check(name, values[name]) }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const all: Record<string, string | null> = {};
    for (const k of Object.keys(spec)) all[k] = check(k, values[k]);
    setErrors(all);
    setTouched(Object.fromEntries(Object.keys(spec).map((k) => [k, true])));
    const firstBad = Object.keys(spec).find((k) => all[k]);
    if (firstBad) {
      const el = formRef.current?.querySelector<HTMLElement>(`[name="${firstBad}"]`);
      el?.focus();
      return;
    }
    setBusy(true);
    const res = await submitForm(id, values as FormPayload, {
      startedAt: startedAt.current,
      honeypot: honeypot.current,
    });
    setBusy(false);
    setResult(res);
    if (res.status === "sent") {
      setValues(initial);
      setTouched({});
    }
  };

  return { values, errors, set, blur, onSubmit, busy, result, setResult, honeypot, formRef };
}

export type FormApi = ReturnType<typeof useForm>;

/** עטיפת טופס: שדה מלכודת לבוטים + הודעות תוצאה */
export function FormShell({
  form,
  children,
  submitLabel,
  submitClass = "btn",
  successTitle = "הפנייה התקבלה",
  successText = "תודה! נחזור אלייך/אליך בהקדם.",
  label,
}: {
  form: FormApi;
  children: ReactNode;
  submitLabel: string;
  submitClass?: string;
  successTitle?: string;
  successText?: string;
  label: string;
}) {
  const r = form.result;
  return (
    <form ref={form.formRef} onSubmit={form.onSubmit} noValidate aria-label={label} style={{ position: "relative" }}>
      <div className="honeypot" aria-hidden="true">
        <label>
          אין למלא שדה זה
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            onChange={(e) => (form.honeypot.current = e.target.value)}
          />
        </label>
      </div>

      <div className="form-grid form-grid--2">{children}</div>

      <div aria-live="polite">
        {r?.status === "sent" ? (
          <div className="form-status form-status--ok" role="status">
            <Icon name="checkCircle" />
            <div>
              <h3>{successTitle}</h3>
              <p>{successText}</p>
            </div>
          </div>
        ) : null}
        {r?.status === "not_connected" ? (
          <div className="form-status form-status--pending" role="status">
            <Icon name="info" />
            <div>
              <h3>הטופס תקין - אך עדיין לא חובר ליעד שליחה</h3>
              <p>
                זהו שלב הבנייה של האתר. הפרטים <strong>לא נשלחו ולא נשמרו</strong> בשום מקום. הטופס
                יופעל לאחר שהמוסדות יגדירו מי מקבל את הפניות.
              </p>
            </div>
          </div>
        ) : null}
        {r?.status === "error" ? (
          <div className="form-status form-status--error" role="alert">
            <Icon name="alert" />
            <div>
              <h3>השליחה לא הצליחה</h3>
              <p>אפשר לנסות שוב בעוד רגע. ({r.message})</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="form-actions">
        <button type="submit" className={submitClass} disabled={form.busy}>
          {form.busy ? "שולח…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

type BaseFieldProps = {
  form: FormApi;
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  span?: boolean;
};

function FieldWrap({
  id,
  label,
  hint,
  required,
  error,
  span,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  error?: string | null;
  span?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`field ${error ? "has-error" : ""} ${span ? "span-2" : ""}`}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? (
          <span className="field__req" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="field__opt">(לא חובה)</span>
        )}
      </label>
      {children}
      {hint ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={`${id}-err`}>
          <Icon name="alert" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  form,
  name,
  label,
  hint,
  required,
  span,
  type = "text",
  autoComplete,
  maxLength,
  inputMode,
}: BaseFieldProps & {
  type?: "text" | "tel" | "email";
  autoComplete?: string;
  maxLength?: number;
  inputMode?: "text" | "tel" | "email";
}) {
  const id = useId();
  const err = form.errors[name];
  const describedBy = [hint ? `${id}-hint` : "", err ? `${id}-err` : ""].filter(Boolean).join(" ");
  return (
    <FieldWrap id={id} label={label} hint={hint} required={required} error={err} span={span}>
      <input
        id={id}
        name={name}
        type={type}
        className="input"
        value={String(form.values[name] ?? "")}
        onChange={(e) => form.set(name, e.target.value)}
        onBlur={() => form.blur(name)}
        aria-required={required || undefined}
        aria-invalid={err ? true : undefined}
        aria-describedby={describedBy || undefined}
        autoComplete={autoComplete}
        maxLength={maxLength}
        inputMode={inputMode}
      />
    </FieldWrap>
  );
}

export function TextArea({
  form,
  name,
  label,
  hint,
  required,
  span = true,
  maxLength = 600,
}: BaseFieldProps & { maxLength?: number }) {
  const id = useId();
  const err = form.errors[name];
  const v = String(form.values[name] ?? "");
  return (
    <FieldWrap id={id} label={label} hint={hint} required={required} error={err} span={span}>
      <textarea
        id={id}
        name={name}
        className="textarea"
        value={v}
        maxLength={maxLength}
        onChange={(e) => form.set(name, e.target.value)}
        onBlur={() => form.blur(name)}
        aria-required={required || undefined}
        aria-invalid={err ? true : undefined}
        aria-describedby={[hint ? `${id}-hint` : "", err ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined}
      />
      <span className="field__hint" aria-hidden="true">
        {v.length}/{maxLength}
      </span>
    </FieldWrap>
  );
}

export function SelectField({
  form,
  name,
  label,
  hint,
  required,
  span,
  options,
  placeholder = "בחירה…",
}: BaseFieldProps & { options: string[]; placeholder?: string }) {
  const id = useId();
  const err = form.errors[name];
  return (
    <FieldWrap id={id} label={label} hint={hint} required={required} error={err} span={span}>
      <select
        id={id}
        name={name}
        className="select"
        value={String(form.values[name] ?? "")}
        onChange={(e) => form.set(name, e.target.value)}
        onBlur={() => form.blur(name)}
        aria-required={required || undefined}
        aria-invalid={err ? true : undefined}
        aria-describedby={err ? `${id}-err` : undefined}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </FieldWrap>
  );
}

/** בחירה מרובה/יחידה בכפתורי "גלולה" */
export function Choices({
  form,
  name,
  label,
  options,
  multiple = true,
  required,
  hint,
}: BaseFieldProps & { options: string[]; multiple?: boolean }) {
  const id = useId();
  const err = form.errors[name];
  const current = form.values[name];
  const list = Array.isArray(current) ? current : current ? [String(current)] : [];
  return (
    <div className={`field span-2 ${err ? "has-error" : ""}`}>
      <fieldset className="choices" aria-describedby={err ? `${id}-err` : undefined}>
        <legend>
          {label}
          {required ? (
            <span className="field__req" aria-hidden="true">
              *
            </span>
          ) : (
            <span className="field__opt">(לא חובה)</span>
          )}
        </legend>
        {options.map((o) => {
          const checked = list.includes(o);
          return (
            <label className="choice" key={o}>
              <input
                type={multiple ? "checkbox" : "radio"}
                name={name}
                value={o}
                checked={checked}
                onChange={() => {
                  if (multiple) {
                    form.set(name, checked ? list.filter((x) => x !== o) : [...list, o]);
                  } else {
                    form.set(name, o);
                  }
                }}
                onBlur={() => form.blur(name)}
              />
              <span>{o}</span>
            </label>
          );
        })}
      </fieldset>
      {hint ? <p className="field__hint">{hint}</p> : null}
      {err ? (
        <p className="field__error" id={`${id}-err`}>
          <Icon name="alert" />
          {err}
        </p>
      ) : null}
    </div>
  );
}

export function Consent({ form, name, children }: { form: FormApi; name: string; children: ReactNode }) {
  const id = useId();
  const err = form.errors[name];
  return (
    <div className={`field span-2 ${err ? "has-error" : ""}`}>
      <label className="checkbox" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          name={name}
          checked={Boolean(form.values[name])}
          onChange={(e) => form.set(name, e.target.checked)}
          aria-required="true"
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${id}-err` : undefined}
        />
        <span>{children}</span>
      </label>
      {err ? (
        <p className="field__error" id={`${id}-err`}>
          <Icon name="alert" />
          {err}
        </p>
      ) : null}
    </div>
  );
}
