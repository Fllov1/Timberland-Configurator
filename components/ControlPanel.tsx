"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import {
  FOIL_PRICE,
  LACES,
  LEATHERS,
  SIZES,
  SOLES,
  STAMP_MAX,
  STAMP_PRICE,
  getLace,
  getLeather,
  getSole,
  priceBreakdown,
  sanitizeStamp,
  type BootConfig,
  type StampFinish,
} from "@/lib/config";

interface ControlPanelProps {
  config: BootConfig;
  onChange: (next: BootConfig) => void;
}

const delta = (n: number) => (n ? `+$${n}` : "Incl.");

function Section({ index, title, value, children }: { index: string; title: string; value: string; children: ReactNode }) {
  return (
    <section className="border-t border-white/[0.08] py-6 first:border-t-0 first:pt-2">
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <h3 className="label">
          <span className="text-wheat">{index}</span>
          <span className="mx-2 text-white/20">/</span>
          {title}
        </h3>
        <span className="truncate font-mono text-[11px] uppercase tracking-wider text-bone">{value}</span>
      </header>
      {children}
    </section>
  );
}

interface SwatchProps {
  name: string;
  price: number;
  selected: boolean;
  onSelect: () => void;
  background: string;
}

function Swatch({ name, price, selected, onSelect, background }: SwatchProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${name} ${delta(price)}`}
      title={name}
      className="group flex flex-col items-center gap-2 outline-none"
    >
      <span
        className={`relative grid h-12 w-12 place-items-center rounded-full border transition-all duration-300 group-focus-visible:ring-2 group-focus-visible:ring-wheat ${
          selected ? "border-wheat p-[5px]" : "border-white/15 p-[3px] group-hover:border-white/40"
        }`}
      >
        <span className="h-full w-full rounded-full shadow-[inset_0_-6px_10px_rgba(0,0,0,0.35),inset_0_2px_3px_rgba(255,255,255,0.18)]" style={{ background }} />
      </span>
      <span className={`font-mono text-[9px] uppercase tracking-wider ${selected ? "text-wheat" : "text-white/35"}`}>
        {delta(price)}
      </span>
    </button>
  );
}

export default function ControlPanel({ config, onChange }: ControlPanelProps) {
  const leather = getLeather(config.leather);
  const lace = getLace(config.lace);
  const sole = getSole(config.sole);
  const { lines } = priceBreakdown(config);
  const setStamp = (patch: Partial<BootConfig["stamp"]>) => onChange({ ...config, stamp: { ...config.stamp, ...patch } });

  const finishes: { id: StampFinish; name: string; price: number }[] = [
    { id: "emboss", name: "Blind emboss", price: 0 },
    { id: "foil", name: "Gold foil", price: FOIL_PRICE },
  ];

  return (
    <div>
      <Section index="01" title="Leather" value={leather.name}>
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          {LEATHERS.map((o) => (
            <Swatch
              key={o.id}
              name={o.name}
              price={o.price}
              background={o.color}
              selected={o.id === config.leather}
              onSelect={() => onChange({ ...config, leather: o.id })}
            />
          ))}
        </div>
        <p className="mt-3 text-[13px] text-smoke">{leather.note}</p>
      </Section>

      <Section index="02" title="Laces" value={lace.name}>
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          {LACES.map((o) => (
            <Swatch
              key={o.id}
              name={o.name}
              price={o.price}
              background={o.color}
              selected={o.id === config.lace}
              onSelect={() => onChange({ ...config, lace: o.id })}
            />
          ))}
        </div>
      </Section>

      <Section index="03" title="Lug sole" value={sole.name}>
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          {SOLES.map((o) => (
            <Swatch
              key={o.id}
              name={o.name}
              price={o.price}
              background={`linear-gradient(180deg, ${o.midsole} 0 46%, ${o.outsole} 46% 100%)`}
              selected={o.id === config.sole}
              onSelect={() => onChange({ ...config, sole: o.id })}
            />
          ))}
        </div>
      </Section>

      <Section index="04" title="Heel stamp" value={config.stamp.enabled ? config.stamp.text || "—" : "Off"}>
        <div className="flex items-center justify-between gap-4">
          <p className="text-[13px] text-smoke">Your initials pressed into the outer heel. +${STAMP_PRICE}</p>
          <button
            type="button"
            role="switch"
            aria-checked={config.stamp.enabled}
            aria-label="Toggle heel stamp"
            onClick={() => setStamp({ enabled: !config.stamp.enabled })}
            className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-300 ${
              config.stamp.enabled ? "border-wheat bg-wheat/20" : "border-white/20 bg-white/5"
            }`}
          >
            <span
              className={`absolute left-[3px] top-[3px] h-5 w-5 rounded-full transition-all duration-300 ${
                config.stamp.enabled ? "translate-x-5 bg-wheat" : "bg-white/50"
              }`}
            />
          </button>
        </div>

        {config.stamp.enabled && (
          <div className="mt-5 animate-rise space-y-4">
            <div>
              <label htmlFor="stamp-text" className="label">
                Characters · max {STAMP_MAX}
              </label>
              <input
                id="stamp-text"
                value={config.stamp.text}
                onChange={(e) => setStamp({ text: sanitizeStamp(e.target.value) })}
                maxLength={STAMP_MAX}
                placeholder="A.K"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="field font-display text-3xl tracking-[0.2em]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {finishes.map((f) => {
                const active = config.stamp.finish === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setStamp({ finish: f.id })}
                    className={`flex items-center justify-between border px-3 py-3 text-left transition-colors ${
                      active ? "border-wheat text-bone" : "border-white/15 text-smoke hover:border-white/30"
                    }`}
                  >
                    <span className="text-[13px]">{f.name}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider">{delta(f.price)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      <Section index="05" title="Size" value={`EU ${config.size}`}>
        <div className="grid grid-cols-6 gap-1.5">
          {SIZES.map((s) => {
            const active = s === config.size;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ ...config, size: s })}
                className={`h-12 border font-mono text-sm transition-colors ${
                  active ? "border-bone bg-bone text-ink" : "border-white/15 text-bone hover:border-white/40"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </Section>

      <Section index="06" title="Breakdown" value={`${lines.length} ${lines.length === 1 ? "line" : "lines"}`}>
        <ul className="space-y-2">
          {lines.map((l) => (
            <li key={l.label} className="flex items-center justify-between gap-4 text-[13px]">
              <span className="flex items-center gap-2 text-smoke">
                <Check className="h-3 w-3 text-wheat" aria-hidden />
                {l.label}
              </span>
              <span className="font-mono text-bone">${l.amount}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
