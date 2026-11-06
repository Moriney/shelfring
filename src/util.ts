// Small helpers without framework or platform objects, so test/check.ts can run them in Node.

const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

/** Random id: 128 bits by default, as hex. */
export const rid = (bytes = 16) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
export const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
export async function hmac(key: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
/** Constant-time string compare for MAC values of equal length. */
export const same = (a: string, b: string) => a.length === b.length && [...a].reduce((d, ch, i) => d | (ch.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

/** Signed cookie value: "a.b.c.<mac>"; returns the list, or [] if the MAC is wrong. */
export const signList = async (key: string, items: string[]) => [...items, (await hmac(key, 'list:' + items.join('.'))).slice(0, 32)].join('.');
export async function readList(key: string, v: string | undefined) {
  if (!v) return [];
  const parts = v.split('.'), mac = parts.pop()!;
  return same(mac, (await hmac(key, 'list:' + parts.join('.'))).slice(0, 32)) ? parts : [];
}

/* ---------- area ---------- */
export type Cf = { country?: string; regionCode?: string; city?: string } | undefined;
/** "Sörnäinen" -> "sornainen". Cloudflare city names can differ from official names; AREA_PRESETS lists the real values. */
export const cityKey = (city = '') => city.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '-');
// Known constraint: IP location is an estimate; Cloudflare states no accuracy.
// Ceiling: VPN, mobile and company networks can place a visitor in the wrong city. Upgrade path: "Use my location" (TODO.md).
export const inArea = (cf: Cf, area: string[]) => area.length === 0 || area.some(a =>
  a === `country:${cf?.country}` || a === `region:${cf?.country}-${cf?.regionCode}` || a === `city:${cf?.country}/${cityKey(cf?.city)}`);

/* ---------- photos ---------- */
/** Accepts only JPEG or WebP without EXIF data (the browser re-encodes, which drops it). Returns the MIME type or an error. */
export function checkPhoto(b: Uint8Array): { type: string } | { error: string } {
  if (b.length < 12 || b.length > 2_000_000) return { error: 'size' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    // walk the JPEG segments up to the image data; APP1 holds EXIF and XMP
    for (let i = 2; i + 4 <= b.length;) {
      if (b[i] !== 0xff) return { error: 'jpeg' };
      const m = b[i + 1];
      if (m === 0xda) return { type: 'image/jpeg' };
      if (m === 0xe1) return { error: 'exif' };
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return { error: 'jpeg' };
  }
  const tag = (o: number) => String.fromCharCode(...b.subarray(o, o + 4));
  if (tag(0) === 'RIFF' && tag(8) === 'WEBP') {
    for (let i = 12; i + 8 <= b.length;) {
      const t = tag(i);
      if (t === 'EXIF' || t === 'XMP ') return { error: 'exif' };
      i += 8 + ((b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)) >>> 0) + (b[i + 4] & 1);
    }
    return { type: 'image/webp' };
  }
  return { error: 'type' };
}

/* ---------- money ---------- */
/** "12", "12.5", "12,50" -> cents; null if not a price. */
export function cents(s: unknown) {
  const m = String(s ?? '').trim().replace(',', '.').match(/^(\d{1,7})(?:\.(\d{1,2}))?$/);
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : null;
}
export const money = (c: number, currency = 'EUR') =>
  new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: c % 100 ? 2 : 0 }).format(c / 100);

/* ---------- AI draft ---------- */
export const CATEGORIES = ['Furniture', 'Home and kitchen', 'Electronics', 'Phones and computers', 'Clothes and shoes', 'Kids and baby', 'Books and media',
  'Sports and outdoors', 'Bikes', 'Garden and tools', 'Music instruments', 'Hobbies and games', 'Art and collectibles', 'Beauty and health', 'Other'];
export const CONDITIONS = ['New', 'Like new', 'Good', 'Fair', 'For parts'];
export const DRAFT_PROMPT = `You write second-hand listings. Look at the photos of one item for sale. Reply with JSON only:
{"title": "max 60 characters, what the item is", "category": one of ${JSON.stringify(CATEGORIES)}, "condition": one of ${JSON.stringify(CONDITIONS)},
"description": "2 to 4 short, plain sentences: what it is, size or model if visible, visible wear or defects. No prices, no invented facts."}`;
/** Takes the model text, keeps only valid fields. */
export function parseDraft(text: unknown) {
  const s = typeof text === 'string' ? text : JSON.stringify(text ?? '');
  try {
    const o = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    const str = (v: unknown, n: number) => typeof v === 'string' ? v.trim().slice(0, n) : '';
    return { title: str(o.title, 80), category: CATEGORIES.includes(o.category) ? o.category : '', condition: CONDITIONS.includes(o.condition) ? o.condition : '', description: str(o.description, 1200) };
  } catch { return { title: '', category: '', condition: '', description: '' }; }
}
