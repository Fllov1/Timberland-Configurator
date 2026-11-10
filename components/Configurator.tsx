"use client";

import { useCallback, useRef, useState, type TouchEvent } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, Camera, Check, ChevronUp, Download, X } from "lucide-react";
import {
  BRAND,
  DEFAULT_CONFIG,
  MODEL_NAME,
  getLace,
  getLeather,
  getSole,
  hasStamp,
  priceBreakdown,
  type BootConfig,
} from "@/lib/config";
import type { CaptureFn } from "./boot/BootViewer";
import ControlPanel from "./ControlPanel";
import OrderForm from "./OrderForm";

const BootViewer = dynamic(() => import("./boot/BootViewer"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center">
      <span className="label animate-pulse">Loading studio</span>
    </div>
  ),
});

type View = "build" | "order" | "done";

export default function Configurator() {
  const [config, setConfig] = useState<BootConfig>(DEFAULT_CONFIG);
  const [view, setView] = useState<View>("build");
  const [expanded, setExpanded] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  const [order, setOrder] = useState<{ id: string; snapshot: string | null } | null>(null);

  const captureRef = useRef<CaptureFn | null>(null);
  const touchStart = useRef<number | null>(null);

  const leather = getLeather(config.leather);
  const lace = getLace(config.lace);
  const sole = getSole(config.sole);
  const { total } = priceBreakdown(config);

  const getSnapshot = useCallback(() => captureRef.current?.() ?? null, []);

  const captureLook = () => {
    const url = getSnapshot();
    if (!url) return;
    setFlash((n) => n + 1);
    setShot(url);
  };

  const onHandleTouchStart = (e: TouchEvent) => {
    touchStart.current = e.touches[0].clientY;
  };
  const onHandleTouchEnd = (e: TouchEvent) => {
    if (touchStart.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStart.current;
    touchStart.current = null;
    if (dy < -24) setExpanded(true);
    else if (dy > 24) setExpanded(false);
  };

  const startOrder = () => {
    setView("order");
    setExpanded(true);
  };

  const reset = () => {
    setConfig(DEFAULT_CONFIG);
    setOrder(null);
    setShot(null);
    setView("build");
    setExpanded(false);
  };

  const specLine = [leather.name, lace.name, sole.name, hasStamp(config) ? `“${config.stamp.text}”` : null, `EU ${config.size}`]
    .filter(Boolean)
    .join(" — ");

  return (
    <main className="fixed inset-0 overflow-hidden bg-ink text-bone">
      {/* ───────── Stage ───────── */}
      <div className="grain absolute inset-x-0 top-0 h-[60dvh] lg:inset-y-0 lg:right-[440px] lg:h-full">
        <BootViewer config={config} captureRef={captureRef} />
        <div className="vignette pointer-events-none absolute inset-0" />
        {flash > 0 && <div key={flash} className="pointer-events-none absolute inset-0 animate-flash bg-white" />}

        {/* Top bar */}
        <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] lg:p-8">
          <div>
            <p className="font-display text-xl uppercase leading-none tracking-[0.08em] lg:text-2xl">{BRAND}</p>
            <p className="label mt-2">N°01 — Custom program</p>
          </div>
          <button
            type="button"
            onClick={captureLook}
            className="glass pointer-events-auto flex h-11 items-center gap-2.5 border border-white/15 px-4 font-mono text-[10px] uppercase tracking-label transition-colors hover:border-wheat hover:text-wheat"
          >
            <Camera className="h-4 w-4" aria-hidden />
            Capture look
          </button>
        </header>

        {/* Editorial title */}
        <div className="pointer-events-none absolute bottom-[calc(3dvh+14px)] left-4 right-4 lg:bottom-10 lg:left-8">
          <h1 className="hidden font-display uppercase leading-[0.86] tracking-tight text-bone/90 lg:block lg:text-[clamp(4rem,8vw,8.5rem)]">
            Built
            <br />
            <span className="text-transparent [-webkit-text-stroke:1px_rgba(236,231,221,0.55)]">to order</span>
          </h1>
          <div className="flex items-end justify-between gap-4 lg:mt-6">
            <p className="label max-w-[70%] leading-relaxed !text-bone/70">{specLine}</p>
            <p className="label hidden whitespace-nowrap sm:block">Drag to rotate · Pinch / scroll to zoom</p>
          </div>
        </div>

        {/* Captured look */}
        {shot && (
          <div className="glass absolute left-4 top-20 w-40 animate-rise border border-white/15 p-2 lg:left-8 lg:top-28 lg:w-56">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot} alt="Captured look of your custom boot" className="aspect-[4/3] w-full object-cover" />
            <div className="mt-2 flex items-center justify-between">
              <a
                href={shot}
                download={`${BRAND.toLowerCase().replace(/[^a-z]+/g, "-")}-${config.leather}.jpg`}
                className="label flex items-center gap-1.5 !text-wheat"
              >
                <Download className="h-3.5 w-3.5" aria-hidden /> Save
              </a>
              <button type="button" onClick={() => setShot(null)} aria-label="Dismiss captured look" className="p-1 text-smoke hover:text-bone">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ───────── Control sheet / side panel ───────── */}
      <aside
        className={`glass fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl border-t border-white/10 transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] lg:absolute lg:inset-x-auto lg:right-0 lg:top-0 lg:h-full lg:w-[440px] lg:rounded-none lg:border-l lg:border-t-0 ${
          expanded ? "h-[86dvh]" : "h-[43dvh]"
        }`}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          onTouchStart={onHandleTouchStart}
          onTouchEnd={onHandleTouchEnd}
          aria-label={expanded ? "Collapse panel" : "Expand panel"}
          aria-expanded={expanded}
          className="flex w-full shrink-0 touch-none flex-col items-center gap-1 pb-2 pt-3 lg:hidden"
        >
          <span className="h-1 w-10 rounded-full bg-white/25" />
          <ChevronUp className={`h-3.5 w-3.5 text-smoke transition-transform duration-500 ${expanded ? "rotate-180" : ""}`} aria-hidden />
        </button>

        <div className="hidden shrink-0 items-end justify-between border-b border-white/[0.08] px-8 pb-6 pt-8 lg:flex">
          <div>
            <p className="label">Configure</p>
            <h2 className="mt-2 font-display text-3xl uppercase leading-none tracking-wide">{MODEL_NAME}</h2>
          </div>
          <p className="label">{view === "build" ? "Step 1 / 2" : view === "order" ? "Step 2 / 2" : "Complete"}</p>
        </div>

        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 lg:px-8 lg:pt-4">
          {view === "build" && <ControlPanel config={config} onChange={setConfig} />}
          {view === "order" && (
            <OrderForm
              config={config}
              getSnapshot={getSnapshot}
              onBack={() => setView("build")}
              onSuccess={(id, snapshot) => {
                setOrder({ id, snapshot });
                setView("done");
              }}
            />
          )}
          {view === "done" && order && (
            <div className="animate-rise py-4 lg:py-8">
              <span className="grid h-12 w-12 place-items-center rounded-full border border-wheat text-wheat">
                <Check className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-6 font-display text-4xl uppercase leading-none tracking-wide">Order received</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-smoke">
                Your build is with the workshop. We will message you shortly to confirm sizing, payment and delivery.
              </p>
              <dl className="mt-6 space-y-2 border-y border-white/[0.08] py-4 font-mono text-[11px] uppercase tracking-wider">
                <div className="flex justify-between">
                  <dt className="text-smoke">Reference</dt>
                  <dd className="text-wheat">{order.id}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-smoke">Total</dt>
                  <dd>${total}</dd>
                </div>
              </dl>
              {order.snapshot && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={order.snapshot} alt="Your ordered boot" className="mt-6 aspect-[16/10] w-full border border-white/10 object-cover" />
              )}
              <button
                type="button"
                onClick={reset}
                className="mt-6 h-12 w-full border border-white/20 font-mono text-[10px] uppercase tracking-label transition-colors hover:border-bone"
              >
                Build another pair
              </button>
            </div>
          )}
        </div>

        {view === "build" && (
          <footer className="flex shrink-0 items-center gap-4 border-t border-white/[0.08] px-5 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-3.5 lg:px-8 lg:py-6">
            <div className="min-w-[92px]">
              <p className="label">Total</p>
              <p className="font-display text-3xl leading-none tracking-wide" aria-live="polite">
                ${total}
              </p>
            </div>
            <button
              type="button"
              onClick={startOrder}
              className="group flex h-14 flex-1 items-center justify-between bg-bone px-5 font-mono text-xs uppercase tracking-label text-ink transition-colors hover:bg-wheat"
            >
              Secure order
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
            </button>
          </footer>
        )}
      </aside>
    </main>
  );
}
