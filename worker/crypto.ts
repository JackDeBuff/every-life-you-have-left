/**
 * App-level encryption for the most sensitive things people give us (owner, Sat Nov 7): uploaded
 * files (CV, LinkedIn PDF, AI-app export), the text extracted from them, and selfies. AES-256-GCM
 * with a key only the Worker holds (secret DATA_KEY: 32 random bytes, base64). Cloudflare already
 * encrypts R2 and D1 at rest; this is a second layer, so a copy of the bucket or the database
 * alone doesn't reveal them.
 *
 *   text  -> "enc:v1:<iv b64>:<ciphertext b64>"
 *   bytes -> MAGIC (4) | iv (12) | ciphertext
 *
 * No key -> encryptX returns null and the caller does NOT store the item (fail closed).
 */
export type CryptoEnv = { DATA_KEY?: string };

const MAGIC = new Uint8Array([0x45, 0x4c, 0x59, 0x31]); // "ELY1"
let cached: { raw: string; key: Promise<CryptoKey> } | null = null;

function keyOf(env: CryptoEnv): Promise<CryptoKey> | null {
  const raw = env.DATA_KEY?.trim();
  if (!raw) return null;
  if (cached?.raw !== raw) {
    const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    if (bytes.length !== 32) return null;
    cached = { raw, key: crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]) };
  }
  return cached.key;
}

const b64 = (u: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptBytes(env: CryptoEnv, data: Uint8Array): Promise<Uint8Array | null> {
  const key = keyOf(env);
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key, data));
  const out = new Uint8Array(MAGIC.length + iv.length + ct.length);
  out.set(MAGIC, 0);
  out.set(iv, MAGIC.length);
  out.set(ct, MAGIC.length + iv.length);
  return out;
}

export async function decryptBytes(env: CryptoEnv, data: Uint8Array): Promise<Uint8Array | null> {
  const key = keyOf(env);
  if (!key || data.length < 16 + 12 || !MAGIC.every((b, i) => data[i] === b)) return null;
  try {
    const iv = data.subarray(4, 16);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await key, data.subarray(16)));
  } catch {
    return null;
  }
}

export async function encryptText(env: CryptoEnv, text: string): Promise<string | null> {
  const key = keyOf(env);
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key, new TextEncoder().encode(text)));
  return `enc:v1:${b64(iv)}:${b64(ct)}`;
}

/** Plain text passes through (rows written before encryption); a bad or missing key gives null. */
export async function decryptText(env: CryptoEnv, stored: string | null): Promise<string | null> {
  if (stored == null || !stored.startsWith("enc:v1:")) return stored;
  const key = keyOf(env);
  if (!key) return null;
  const [, , iv, ct] = stored.split(":");
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv!) }, await key, unb64(ct!));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}
