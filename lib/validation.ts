export interface ContactFields {
  name: string;
  contact: string;
  email: string;
  address: string;
  note: string;
}

export type ContactErrors = Partial<Record<keyof ContactFields, string>>;

export const EMPTY_CONTACT: ContactFields = { name: "", contact: "", email: "", address: "", note: "" };

const PHONE = /^\+?[\d\s().-]{7,20}$/;
const HANDLE = /^@[A-Za-z0-9_]{5,32}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateContact(v: ContactFields): ContactErrors {
  const e: ContactErrors = {};
  const name = v.name.trim();
  const contact = v.contact.trim();
  const email = v.email.trim();
  const address = v.address.trim();

  if (name.length < 2) e.name = "Enter your full name";
  else if (name.length > 80) e.name = "Name is too long";

  if (!contact) e.contact = "Phone or Telegram @handle required";
  else if (!PHONE.test(contact) && !HANDLE.test(contact)) e.contact = "Use +1 555 000 0000 or @handle";

  if (email && !EMAIL.test(email)) e.email = "Email looks invalid";
  else if (email.length > 120) e.email = "Email is too long";

  if (address.length < 8) e.address = "Enter a full shipping address";
  else if (address.length > 200) e.address = "Address is too long";

  if (v.note.length > 300) e.note = "Max 300 characters";
  return e;
}

export function parseContact(input: unknown): ContactFields | null {
  if (!input || typeof input !== "object") return null;
  const c = input as Record<string, unknown>;
  const str = (k: string) => (typeof c[k] === "string" ? (c[k] as string).trim() : "");
  return { name: str("name"), contact: str("contact"), email: str("email"), address: str("address"), note: str("note") };
}
