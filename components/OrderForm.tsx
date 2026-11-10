"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { getLace, getLeather, getSole, hasStamp, priceBreakdown, type BootConfig } from "@/lib/config";
import { EMPTY_CONTACT, validateContact, type ContactFields } from "@/lib/validation";

interface OrderFormProps {
  config: BootConfig;
  getSnapshot: () => string | null;
  onBack: () => void;
  onSuccess: (orderId: string, snapshot: string | null) => void;
}

type Touched = Partial<Record<keyof ContactFields, boolean>>;

const FIELDS: { key: keyof ContactFields; label: string; placeholder: string; type?: string; autoComplete?: string; optional?: boolean }[] = [
  { key: "name", label: "Full name", placeholder: "Alex Kowalski", autoComplete: "name" },
  { key: "contact", label: "Phone or Telegram", placeholder: "+1 555 010 2030 or @handle", autoComplete: "tel" },
  { key: "email", label: "Email", placeholder: "you@studio.com", type: "email", autoComplete: "email", optional: true },
  { key: "address", label: "Shipping address", placeholder: "Street, city, postcode, country", autoComplete: "street-address" },
];

export default function OrderForm({ config, getSnapshot, onBack, onSuccess }: OrderFormProps) {
  const [values, setValues] = useState<ContactFields>(EMPTY_CONTACT);
  const [touched, setTouched] = useState<Touched>({});
  const [status, setStatus] = useState<"idle" | "sending">("idle");
  const [serverError, setServerError] = useState<string | null>(null);

  const errors = validateContact(values);
  const valid = Object.keys(errors).length === 0;
  const { total } = priceBreakdown(config);
  const summary = [
    getLeather(config.leather).name,
    `${getLace(config.lace).name} laces`,
    `${getSole(config.sole).name} sole`,
    hasStamp(config) ? `Stamp "${config.stamp.text}"` : null,
    `EU ${config.size}`,
  ].filter(Boolean);

  const set = (key: keyof ContactFields, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setTouched((t) => ({ ...t, [key]: true }));
    setServerError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, contact: true, email: true, address: true, note: true });
    if (!valid || status === "sending") return;

    setStatus("sending");
    setServerError(null);
    const snapshot = getSnapshot();
    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, contact: values, snapshot }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; orderId?: string; error?: string } | null;
      if (!res.ok || !data?.ok || !data.orderId) {
        throw new Error(data?.error ?? "Order could not be sent. Please try again.");
      }
      onSuccess(data.orderId, snapshot);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Network error. Please try again.");
      setStatus("idle");
    }
  };

  return (
    <form onSubmit={submit} noValidate className="animate-rise pb-2">
      <button type="button" onClick={onBack} className="label mb-6 flex items-center gap-2 transition-colors hover:text-bone">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to build
      </button>

      <h2 className="font-display text-4xl uppercase leading-none tracking-wide">Secure order</h2>
      <p className="mt-3 text-[13px] leading-relaxed text-smoke">{summary.join(" · ")}</p>

      <div className="mt-7 space-y-5">
        {FIELDS.map((f) => {
          const error = touched[f.key] ? errors[f.key] : undefined;
          return (
            <div key={f.key}>
              <label htmlFor={`order-${f.key}`} className="label flex justify-between">
                <span>{f.label}</span>
                {f.optional && <span className="text-white/25">Optional</span>}
              </label>
              <input
                id={`order-${f.key}`}
                type={f.type ?? "text"}
                value={values[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, [f.key]: true }))}
                placeholder={f.placeholder}
                autoComplete={f.autoComplete}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `order-${f.key}-error` : undefined}
                className={`field ${error ? "field-error" : ""}`}
              />
              <p id={`order-${f.key}-error`} role="alert" className="mt-1 min-h-[16px] font-mono text-[10px] uppercase tracking-wider text-ember">
                {error}
              </p>
            </div>
          );
        })}

        <div>
          <label htmlFor="order-note" className="label flex justify-between">
            <span>Note to the workshop</span>
            <span className={values.note.length > 300 ? "text-ember" : "text-white/25"}>{values.note.length}/300</span>
          </label>
          <textarea
            id="order-note"
            rows={2}
            value={values.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="Wide fit, gift wrap…"
            className={`field resize-none ${touched.note && errors.note ? "field-error" : ""}`}
          />
        </div>
      </div>

      {serverError && (
        <p role="alert" className="mt-4 border border-ember/40 bg-ember/10 px-3 py-2.5 text-[13px] text-ember">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="mt-6 flex h-14 w-full items-center justify-between bg-wheat px-5 font-mono text-xs uppercase tracking-label text-ink transition-colors hover:bg-bone disabled:cursor-wait disabled:opacity-70"
      >
        <span className="flex items-center gap-2.5">
          {status === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
          {status === "sending" ? "Sending order" : "Place order"}
        </span>
        <span className="text-sm font-semibold tracking-normal">${total}</span>
      </button>
      <p className="label mt-3 text-center !text-white/30">No payment now · we confirm by message</p>
    </form>
  );
}
