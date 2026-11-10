export const BRAND = "LUG/ATELIER";
export const MODEL_NAME = "6-Inch Custom";
export const BASE_PRICE = 180;
export const STAMP_PRICE = 15;
export const FOIL_PRICE = 10;
export const STAMP_MAX = 4;

export type Finish = "nubuck" | "leather";
export type StampFinish = "emboss" | "foil";

export interface LeatherOption {
  id: string;
  name: string;
  note: string;
  color: string;
  collar: string;
  stitch: string;
  finish: Finish;
  price: number;
}

export interface LaceOption {
  id: string;
  name: string;
  color: string;
  price: number;
}

export interface SoleOption {
  id: string;
  name: string;
  outsole: string;
  midsole: string;
  welt: string;
  price: number;
}

export const LEATHERS: LeatherOption[] = [
  { id: "wheat", name: "Wheat Classic", note: "Waterproof nubuck", color: "#c07f2c", collar: "#241d1a", stitch: "#f0e2bf", finish: "nubuck", price: 0 },
  { id: "onyx", name: "Jet Black", note: "Full-grain leather", color: "#1c1c1f", collar: "#0b0b0c", stitch: "#3a3a3f", finish: "leather", price: 0 },
  { id: "olive", name: "Military Olive", note: "Brushed nubuck", color: "#5b6038", collar: "#1d1f15", stitch: "#c9c79a", finish: "nubuck", price: 10 },
  { id: "umber", name: "Raw Umber", note: "Oiled dark brown", color: "#4b2e1e", collar: "#1a1210", stitch: "#b98a5a", finish: "leather", price: 10 },
  { id: "chalk", name: "Bone Chalk", note: "Pale nubuck", color: "#d8d0c0", collar: "#2a2826", stitch: "#8a8172", finish: "nubuck", price: 20 },
];

export const LACES: LaceOption[] = [
  { id: "gold", name: "Hiker Gold", color: "#c9952e", price: 0 },
  { id: "onyx", name: "Onyx", color: "#1a1a1a", price: 0 },
  { id: "bone", name: "Bone", color: "#e8e2d4", price: 5 },
  { id: "ember", name: "Signal Ember", color: "#ff5a1f", price: 8 },
  { id: "volt", name: "Acid Volt", color: "#c8ff2e", price: 8 },
];

export const SOLES: SoleOption[] = [
  { id: "gum", name: "Gum Honey", outsole: "#6e431f", midsole: "#b98a4e", welt: "#c9a064", price: 0 },
  { id: "blackout", name: "Blackout", outsole: "#121212", midsole: "#1f1f1f", welt: "#2b2b2b", price: 0 },
  { id: "bone", name: "Bone Cup", outsole: "#cfc7b6", midsole: "#e9e3d6", welt: "#f1ece2", price: 12 },
  { id: "volt", name: "Volt Line", outsole: "#121212", midsole: "#c8ff2e", welt: "#1f1f1f", price: 18 },
  { id: "ember", name: "Ember Line", outsole: "#121212", midsole: "#ff5a1f", welt: "#1f1f1f", price: 18 },
];

export const SIZES = [40, 41, 42, 43, 44, 45] as const;

export interface BootConfig {
  leather: string;
  lace: string;
  sole: string;
  size: number;
  stamp: { enabled: boolean; text: string; finish: StampFinish };
}

export const DEFAULT_CONFIG: BootConfig = {
  leather: "wheat",
  lace: "gold",
  sole: "gum",
  size: 42,
  stamp: { enabled: false, text: "", finish: "emboss" },
};

export const getLeather = (id: string) => LEATHERS.find((o) => o.id === id) ?? LEATHERS[0];
export const getLace = (id: string) => LACES.find((o) => o.id === id) ?? LACES[0];
export const getSole = (id: string) => SOLES.find((o) => o.id === id) ?? SOLES[0];

export const sanitizeStamp = (raw: string) =>
  raw
    .toUpperCase()
    .replace(/[^A-Z0-9&.\-]/g, "")
    .slice(0, STAMP_MAX);

export const hasStamp = (c: BootConfig) => c.stamp.enabled && c.stamp.text.length > 0;

export interface PriceLine {
  label: string;
  amount: number;
}

export function priceBreakdown(c: BootConfig): { lines: PriceLine[]; total: number } {
  const lines: PriceLine[] = [{ label: `${MODEL_NAME} base`, amount: BASE_PRICE }];
  const leather = getLeather(c.leather);
  const lace = getLace(c.lace);
  const sole = getSole(c.sole);
  if (leather.price) lines.push({ label: leather.name, amount: leather.price });
  if (lace.price) lines.push({ label: `${lace.name} laces`, amount: lace.price });
  if (sole.price) lines.push({ label: `${sole.name} sole`, amount: sole.price });
  if (hasStamp(c)) {
    lines.push({ label: `Heel stamp "${c.stamp.text}"`, amount: STAMP_PRICE });
    if (c.stamp.finish === "foil") lines.push({ label: "Gold foil finish", amount: FOIL_PRICE });
  }
  return { lines, total: lines.reduce((sum, l) => sum + l.amount, 0) };
}

/** Strictly validates an untrusted config (used by the API route). */
export function parseConfig(input: unknown): BootConfig | null {
  if (!input || typeof input !== "object") return null;
  const c = input as Record<string, unknown>;
  const stamp = (c.stamp ?? {}) as Record<string, unknown>;
  if (typeof c.leather !== "string" || !LEATHERS.some((o) => o.id === c.leather)) return null;
  if (typeof c.lace !== "string" || !LACES.some((o) => o.id === c.lace)) return null;
  if (typeof c.sole !== "string" || !SOLES.some((o) => o.id === c.sole)) return null;
  if (typeof c.size !== "number" || !(SIZES as readonly number[]).includes(c.size)) return null;
  const text = typeof stamp.text === "string" ? sanitizeStamp(stamp.text) : "";
  return {
    leather: c.leather,
    lace: c.lace,
    sole: c.sole,
    size: c.size,
    stamp: {
      enabled: stamp.enabled === true && text.length > 0,
      text,
      finish: stamp.finish === "foil" ? "foil" : "emboss",
    },
  };
}
