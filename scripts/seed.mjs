// Local UX testing: fills the local database and photo storage with a demo seller and mock listings.
// Run after `npm run dev` has run once (it writes wrangler.dev.json): `node scripts/seed.mjs`. Running it again replaces the demo data.
// Sign in as demo@example.com (the code shows at /dev/mail) to see the console; the shelf is at /s/demo.
// Known constraint: photos are SVG placeholders, which the upload path would reject; the /img route serves them as stored.
import { getPlatformProxy } from 'wrangler';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const { env, dispose } = await getPlatformProxy({ configPath: 'wrangler.dev.json', persist: true });
const DAY = 86400e3, now = Date.now(), SID = 'demoseller';
// same as pwMac in src/index.tsx, so the password "friends" opens the locked listing
const hmacKey = readFileSync('.dev.vars', 'utf8').match(/^HMAC_KEY='(.*)'$/m)[1];
const pwMac = pw => createHmac('sha256', hmacKey).update('pw:' + pw).digest('hex').slice(0, 32);

// [title, category, condition, mode, price €, status, days since listed, photos [emoji, colour, w, h][], extra]
const items = [
  ['Vintage teak sideboard', 'Furniture', 'Good', 'fixed', 180, 'active', 1, [['🪵', '#8B5A2B', 1600, 1200], ['🗄️', '#A0522D', 1200, 1600], ['🔑', '#6B4226', 1600, 1600]], { wants: 2 }],
  ['Road bike, 56 cm frame', 'Sports', 'Like new', 'auction', 250, 'active', 2, [['🚲', '#2F6690', 1600, 1200], ['⚙️', '#3A7CA5', 1600, 1200]], { bids: [260, 275, 290], endsIn: 2 }],
  ['Moomin mug collection (6)', 'Kitchen', 'Good', 'fixed', 60, 'active', 0, [['☕', '#D9BF77', 1200, 1600]], {}],
  ['Kids winter overall, size 110', 'Kids', 'Used', 'fixed', 25, 'reserved', 4, [['🧥', '#C1440E', 1200, 1600]], { wants: 1 }],
  ['Record player with speakers', 'Electronics', 'Good', 'auction', 40, 'active', 3, [['🎶', '#3C1642', 1600, 1600]], { bids: [], endsIn: null }],
  ['Monstera, big and healthy', 'Plants', 'Like new', 'fixed', 35, 'active', 5, [['🪴', '#2D6A4F', 1200, 1600], ['🌿', '#40916C', 1600, 1200]], { offers: [28] }],
  ['Cross-country skis + poles', 'Sports', 'Used', 'fixed', 45, 'active', 7, [['⛷️', '#5E81AC', 1200, 1600]], {}],
  ['Office chair, adjustable', 'Furniture', 'Good', 'auction', 30, 'ended', 9, [['💺', '#4C566A', 1600, 1600]], { bids: [35, 42], endsIn: -1 }],
  ['A very long title to see how a card handles text that wraps onto several lines', 'Books', 'Used', 'fixed', 8, 'active', 6, [['📚', '#B5838D', 1600, 1200]], {}],
  ['Board game bundle', 'Games', 'Good', 'fixed', 20, 'active', 8, [['🎲', '#E76F51', 1600, 1600]], { password: 'friends' }],
  ['Espresso machine', 'Kitchen', 'Good', 'fixed', 120, 'sold', 14, [['☕', '#6D4C41', 1600, 1200]], {}],
  ['Camping tent for 3', 'Outdoor', 'Used', 'fixed', 70, 'expired', 40, [['⛺', '#588157', 1600, 1200]], {}],
  ['Item without a photo', 'Other', 'Used', 'fixed', 5, 'active', 10, [], {}]
];

const svg = (emoji, bg, w, h, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="100%" height="100%" fill="${bg}"/><text x="50%" y="46%" font-size="${Math.min(w, h) / 3}" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
<text x="50%" y="88%" font-size="${Math.min(w, h) / 22}" fill="#fff" fill-opacity=".8" text-anchor="middle" font-family="sans-serif">${label}</text></svg>`;

const db = env.DB, old = (await db.prepare('SELECT key FROM photos WHERE seller_id = ?').bind(SID).all()).results;
for (const { key } of old) await env.PHOTOS.delete([`${key}/l`, `${key}/s`]);
await db.batch([
  db.prepare('DELETE FROM requests WHERE listing_id IN (SELECT id FROM listings WHERE seller_id = ?)').bind(SID),
  db.prepare('DELETE FROM photos WHERE seller_id = ?').bind(SID),
  db.prepare('DELETE FROM listings WHERE seller_id = ?').bind(SID),
  db.prepare('DELETE FROM sellers WHERE id = ?').bind(SID)
]);

const q = [db.prepare('INSERT INTO sellers (id, email, name, slug, about, contact, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .bind(SID, 'demo@example.com', 'Demo Shelf', 'demo', 'Moving out of Kallio, everything must go. Pick-up only, evenings and weekends.', '+358 40 000 0000', now - 60 * DAY)];
const putPhoto = async (id, i, [emoji, bg, w, h], title) => {
  const key = `${id}p${i}`, body = svg(emoji, bg, w, h, title), meta = { httpMetadata: { contentType: 'image/svg+xml' } };
  await env.PHOTOS.put(`${key}/l`, body, meta);
  await env.PHOTOS.put(`${key}/s`, body, meta);
  q.push(db.prepare('INSERT INTO photos (key, listing_id, seller_id, pos, w, h, avg, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(key, id, SID, +i || 0, w, h, bg, now));
  return key;
};
const cover = await putPhoto(null, 'cover', ['🏠', '#264653', 1600, 533], 'Demo Shelf');
q.push(db.prepare('UPDATE sellers SET cover_key = ? WHERE id = ?').bind(cover, SID));

let n = 0;
for (const [title, category, condition, mode, eur, status, ago, photos, x] of items) {
  const id = `demo${String(++n).padStart(2, '0')}`, pub = now - ago * DAY - n * 3600e3;
  const ends = mode === 'auction' && x.endsIn != null ? now + x.endsIn * DAY : null;
  q.push(db.prepare(`INSERT INTO listings (id, seller_id, title, category, condition, description, mode, price_cents, duration_days, ends_at, password_mac, status, created_at, published_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, SID, title, category, condition,
    `Mock listing for local testing. ${title} in ${condition.toLowerCase()} condition. Pick-up in Kallio, Helsinki.`,
    mode, eur * 100, 3, ends, x.password ? pwMac(x.password) : null, status, pub, pub, mode === 'fixed' ? pub + 30 * DAY : null));
  for (const [i, p] of photos.entries()) await putPhoto(id, i, p, title.slice(0, 40));
  const reqs = [...(x.bids || []).map(a => ['bid', a]), ...(x.offers || []).map(a => ['offer', a]), ...Array.from({ length: x.wants || 0 }, () => ['want', eur])];
  for (const [i, [kind, a]] of reqs.entries())
    q.push(db.prepare("INSERT INTO requests (id, listing_id, kind, amount_cents, name, contact, note, buyer_key_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(`${id}r${i}`, id, kind, a * 100, ['Aino', 'Mikko', 'Sara', 'Jussi'][i % 4], '040 123 4567', i ? '' : 'Can I pick it up on Saturday?', `demobuyer${i}`,
        status === 'reserved' && i === 0 ? 'accepted' : 'open', pub + (i + 1) * 3600e3));
}
await db.batch(q);
await dispose();
console.log(`Seeded ${items.length} listings. Shelf: http://localhost:8787/s/demo  Console: sign in as demo@example.com (code at /dev/mail).`);
