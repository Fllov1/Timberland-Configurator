import { NextResponse } from "next/server";
import { BRAND, MODEL_NAME, getLace, getLeather, getSole, hasStamp, parseConfig, priceBreakdown } from "@/lib/config";
import {
  TelegramApiError,
  TelegramConfigError,
  decodeDataUrl,
  escapeHtml,
  getTelegramCredentials,
  isTelegramConfigured,
  sendOrderNotification,
} from "@/lib/telegram";
import { parseContact, validateContact } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isDev = process.env.NODE_ENV !== "production";

const fail = (error: string, status: number, code: string) => NextResponse.json({ ok: false, error, code }, { status });

function createOrderId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `LA-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}

/** Health check: lets you confirm the Telegram env vars are loaded without placing an order. */
export function GET() {
  return NextResponse.json({ ok: true, telegramConfigured: isTelegramConfigured() });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail("Invalid request body.", 400, "BAD_JSON");
  }
  const body = (payload ?? {}) as Record<string, unknown>;

  const config = parseConfig(body.config);
  if (!config) return fail("Invalid boot configuration.", 400, "BAD_CONFIG");

  const contact = parseContact(body.contact);
  if (!contact) return fail("Missing contact details.", 400, "BAD_CONTACT");
  const errors = validateContact(contact);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      { ok: false, error: "Please check the highlighted fields.", code: "INVALID_FIELDS", fields: errors },
      { status: 422 },
    );
  }

  let credentials;
  try {
    credentials = getTelegramCredentials();
  } catch (err) {
    const detail = err instanceof TelegramConfigError ? err.message : "Telegram is not configured";
    console.error(`[order] ${detail}. Fill in .env.local and restart the server.`);
    return fail(
      isDev ? `${detail}. Fill in .env.local and restart the dev server.` : "Ordering is not available right now. Please try again later.",
      503,
      "TELEGRAM_NOT_CONFIGURED",
    );
  }

  // Never trust a client-side total: the price is recomputed from the validated config.
  const { lines, total } = priceBreakdown(config);
  const orderId = createOrderId();
  const leather = getLeather(config.leather);
  const stamp = hasStamp(config)
    ? `${escapeHtml(config.stamp.text)} · ${config.stamp.finish === "foil" ? "gold foil" : "blind emboss"}`
    : "none";

  const summary = [
    `<b>🥾 NEW ORDER · ${escapeHtml(BRAND)}</b>`,
    `<code>${orderId}</code> — ${escapeHtml(MODEL_NAME)}`,
    "",
    `<b>Leather:</b> ${escapeHtml(leather.name)} (${escapeHtml(leather.note)})`,
    `<b>Laces:</b> ${escapeHtml(getLace(config.lace).name)}`,
    `<b>Sole:</b> ${escapeHtml(getSole(config.sole).name)}`,
    `<b>Stamp:</b> ${stamp}`,
    `<b>Size:</b> EU ${config.size}`,
    "",
    ...lines.map((l) => `${escapeHtml(l.label)} — $${l.amount}`),
    `<b>TOTAL: $${total}</b>`,
    "",
    `<b>Name:</b> ${escapeHtml(contact.name)}`,
    `<b>Contact:</b> ${escapeHtml(contact.contact)}`,
    contact.email ? `<b>Email:</b> ${escapeHtml(contact.email)}` : null,
    `<b>Ship to:</b> ${escapeHtml(contact.address)}`,
    contact.note ? `<b>Note:</b> ${escapeHtml(contact.note)}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const snapshot = decodeDataUrl(body.snapshot, orderId);

  try {
    const result = await sendOrderNotification(credentials, summary, snapshot, `<code>${orderId}</code> — look preview`);
    return NextResponse.json({ ok: true, orderId, total, snapshot: result.image });
  } catch (err) {
    console.error("[order] Telegram dispatch failed:", err);
    // In development, surface Telegram's own reason (bad token, chat not found, …) to speed up setup.
    const detail = isDev && err instanceof TelegramApiError ? ` (${err.message})` : "";
    return fail(`We could not reach the workshop. Please try again in a moment.${detail}`, 502, "TELEGRAM_FAILED");
  }
}
