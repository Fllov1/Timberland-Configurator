/**
 * Minimal Telegram Bot API client (server-only, native fetch, no dependencies).
 * Docs: https://core.telegram.org/bots/api
 */

// Override only if you run a self-hosted Bot API server (or a local mock in tests).
const apiBase = () => process.env.TELEGRAM_API_BASE?.trim() || "https://api.telegram.org";
const TIMEOUT_MS = 15_000;
const CAPTION_LIMIT = 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export class TelegramConfigError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Missing environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
    this.name = "TelegramConfigError";
    this.missing = missing;
  }
}

export class TelegramApiError extends Error {
  readonly method: string;
  readonly status: number;
  constructor(method: string, status: number, description: string) {
    super(`Telegram ${method} failed (${status}): ${description}`);
    this.name = "TelegramApiError";
    this.method = method;
    this.status = status;
  }
}

export interface TelegramCredentials {
  token: string;
  chatId: string;
}

/** Reads credentials from the environment; throws TelegramConfigError listing what is missing. */
export function getTelegramCredentials(): TelegramCredentials {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim() ?? "";
  const missing = [!token && "TELEGRAM_BOT_TOKEN", !chatId && "TELEGRAM_CHAT_ID"].filter((v): v is string => Boolean(v));
  if (missing.length) throw new TelegramConfigError(missing);
  return { token, chatId };
}

export const isTelegramConfigured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface DecodedImage {
  blob: Blob;
  filename: string;
}

/** Decodes a canvas `toDataURL()` string (JPEG/PNG) into an uploadable Blob. */
export function decodeDataUrl(value: unknown, basename = "snapshot"): DecodedImage | null {
  if (typeof value !== "string") return null;
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: `image/${match[1]}` }),
    filename: `${basename}.${match[1] === "jpeg" ? "jpg" : "png"}`,
  };
}

async function call(token: string, method: string, body: FormData | Record<string, unknown>) {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/bot${token}/${method}`, {
      method: "POST",
      // For FormData, fetch sets the multipart/form-data boundary header itself.
      headers: isForm ? undefined : { "Content-Type": "application/json" },
      body: isForm ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new TelegramApiError(method, 0, err instanceof Error ? err.message : "network error");
  }
  const data = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!res.ok || !data?.ok) throw new TelegramApiError(method, res.status, data?.description ?? "unexpected response");
}

function mediaForm(chatId: string, field: "photo" | "document", image: DecodedImage, caption: string) {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  form.append(field, image.blob, image.filename);
  return form;
}

export interface NotificationResult {
  /** How the snapshot was delivered ("none" when there was no usable image). */
  image: "photo" | "document" | "none";
}

/**
 * Delivers an order card to the seller's chat.
 *  1. sendPhoto (multipart) with the summary as caption — shows as a preview card.
 *  2. If Telegram rejects the photo, retry as sendDocument (no recompression limits).
 *  3. If the summary exceeds the caption limit, or no image exists, send it as a message.
 * Throws TelegramApiError only when the text summary itself could not be delivered.
 */
export async function sendOrderNotification(
  { token, chatId }: TelegramCredentials,
  html: string,
  image: DecodedImage | null,
  shortCaption: string,
): Promise<NotificationResult> {
  const fitsCaption = html.length <= CAPTION_LIMIT;
  let delivered: NotificationResult["image"] = "none";
  let textDelivered = false;

  if (image) {
    const caption = fitsCaption ? html : shortCaption;
    try {
      await call(token, "sendPhoto", mediaForm(chatId, "photo", image, caption));
      delivered = "photo";
      textDelivered = fitsCaption;
    } catch (photoError) {
      console.warn("[telegram] sendPhoto failed, retrying as document:", photoError);
      try {
        await call(token, "sendDocument", mediaForm(chatId, "document", image, caption));
        delivered = "document";
        textDelivered = fitsCaption;
      } catch (documentError) {
        console.warn("[telegram] sendDocument failed, falling back to text only:", documentError);
      }
    }
  }

  if (!textDelivered) {
    await call(token, "sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  }
  return { image: delivered };
}
