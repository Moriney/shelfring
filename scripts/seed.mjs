// Local UX testing: fills the local database and photo storage with two demo sellers and mock listings.
// Run after `npm run dev` has run once (it writes wrangler.dev.json): `node scripts/seed.mjs`. Running it again replaces the demo data.
// - Demo Shelf (/s/demo, demo@example.com): edge cases with SVG placeholder photos.
// - Helena's Home (/s/helena, helena@example.com): realistic items with real photos fetched from Wikimedia Commons.
// Sign in with either email (the code shows at /dev/mail) to see the console.
// Known constraint: SVG placeholders and the Commons JPEGs skip the upload checks; the /img route serves them as stored.
import { getPlatformProxy } from 'wrangler';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const DAY = 86400e3, now = Date.now(), UA = { 'User-Agent': 'shelfring-seed/1.0 (local test data)' };
// same as pwMac in src/index.tsx, so the password "friends" opens the locked listings
const hmacKey = readFileSync('.dev.vars', 'utf8').match(/^HMAC_KEY='(.*)'$/m)[1];
const pwMac = pw => createHmac('sha256', hmacKey).update('pw:' + pw).digest('hex').slice(0, 32);
const NEAR = { area: ['city:FI/helsinki', 'city:FI/espoo', 'city:FI/vantaa', 'city:FI/kauniainen'], label: 'Helsinki capital region' };

// A photo is [emoji, colour, w, h] for an SVG placeholder, or a Commons file title.
// Item: [title, category, condition, mode, price €, status, days since listed, photos, extra { desc, bids, offers, wants, endsIn, password, near }]
const sellers = [{
  id: 'demoseller', email: 'demo@example.com', name: 'Demo Shelf', slug: 'demo', contact: '+358 40 000 0000',
  about: 'Moving out of Kallio, everything must go. Pick-up only, evenings and weekends.', cover: ['🏠', '#264653', 1600, 533],
  items: [
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
  ]
}, {
  id: 'demohelena', email: 'helena@example.com', name: "Helena's Home", slug: 'helena', contact: '+358 50 111 2222',
  about: 'Family of four in Töölö, clearing out the storage room before winter. Everything is clean and from a smoke-free home. Pick-up near Töölöntori.',
  cover: 'File:Astiankuivauskaappi.jpg',
  items: [
    ['Teak sideboard, 1960s', 'Furniture', 'Good', 'fixed', 340, 'active', 1, ['File:McIntosh Teak Sideboard Circa 1960s.jpg', 'File:McIntosh Teak Sideboard Circa 1960s-open.jpg'],
      { wants: 2, offers: [290], desc: 'Scottish teak sideboard from the 1960s, 198 × 46 × 76 cm. Three drawers and two cabinets with one shelf each. Some light scratches on the top, the drawers run smoothly. You need a van and two people; it is on the ground floor.' }],
    ['Carbon road bike, size 54', 'Sports', 'Good', 'auction', 450, 'active', 2, ['File:Guerciotti with Rolf Elan Wheelset.jpg'],
      { bids: [450, 480, 510, 535], endsIn: 1, desc: 'Guerciotti carbon frame, size 54, Shimano 105 groupset, Rolf Elan wheels. About 4000 km, serviced in spring with a new chain and brake pads. Fits a rider of 170–178 cm. Pedals not included.' }],
    ['Moomin mug, green', 'Kitchen', 'Like new', 'fixed', 18, 'active', 0, ['File:Muumipeikko nurmenvihreä cropped.jpg'],
      { desc: 'Arabia Moomin mug, 0.3 l. Used a few times, no chips or crazing. Dishwasher safe. I can bring it to Kamppi on weekdays.' }],
    ['IKEA Poäng armchair, beige cushion', 'Furniture', 'Good', 'fixed', 40, 'active', 3, ['File:POÄNG in “Knisa Beige” (45144076894).jpg'],
      { near: true, desc: 'Birch veneer frame with a washable Knisa beige cushion cover. Comfortable reading chair, no damage. The cushion was washed last month.' }],
    ['Bang & Olufsen Beogram turntable', 'Electronics', 'Used', 'auction', 90, 'active', 4, ['File:Ca 1964 Bang Olufsen Beogram 42V record player Denmark.jpg'],
      { bids: [95], endsIn: 3, desc: 'Beogram from the 1960s, teak plinth with the original lid. It powers on and the platter turns at the correct speed. The needle should be replaced. Sold as is, you can test it here before bidding.' }],
    ['Faux plant in white ceramic pot', 'Home', 'Like new', 'fixed', 15, 'active', 2, ['File:Modern faux plant in white pot on a kitchen countertop, enhancing decor.jpg'],
      { desc: 'Artificial plant, about 45 cm tall with the pot. Looks real, never needs water. The pot is ceramic and can be used on its own.' }],
    ['Office chair with armrests', 'Furniture', 'Used', 'auction', 20, 'ended', 9, ['File:Buerostuhl (fcm).jpg'],
      { bids: [20, 25, 32], endsIn: -1, desc: 'Height-adjustable office chair with tilt lock. The fabric is clean, one armrest is a little loose.' }],
    ['Fjällräven Kånken backpack, black', 'Bags', 'Good', 'fixed', 35, 'active', 5, ['File:Fjallraven Kanken backpack (Unsplash).jpg'],
      { offers: [25, 30], desc: 'Classic Kånken, 16 l, black. Used for one school year. No holes, the zips work. The seat pad is missing.' }],
    ['Walden D310e acoustic guitar', 'Music', 'Good', 'auction', 120, 'active', 6, ['File:00 Walden Acoustic Guitar D310e 01.jpg', 'File:00 Walden Acoustic Guitar D310e body.jpg'],
      { bids: [], endsIn: null, desc: 'Dreadnought with a built-in pickup and tuner. New strings in October. Small mark on the back, see the photos. Comes with a soft gig bag. Open auction: I accept a good bid when one comes.' }],
    ['Lelit espresso machine with PID', 'Kitchen', 'Good', 'fixed', 520, 'reserved', 7, ['File:Lelit Semiautomatic Espresso Machine with PID and Pressure Gauge.jpg'],
      { wants: 2, desc: 'Lelit single-boiler machine with PID temperature control and a pressure gauge. Descaled every two months. Comes with the portafilter, two baskets and a tamper. Grinder not included.' }],
    ['Dome tent for 2–3 people', 'Outdoor', 'Used', 'fixed', 60, 'sold', 15, ['File:Dome tent in the BWCA (CDM11452CT).jpg'],
      { desc: 'Free-standing dome tent with two doors. Stayed dry in heavy rain in Lapland. All poles and pegs included.' }],
    ['Kids overall, size 86', 'Kids', 'Good', 'fixed', 22, 'active', 3, ['File:Parkdress størrelse 86.jpg'],
      { near: true, wants: 1, desc: 'Water-repellent softshell overall, size 86. Reflectors on the arms and legs. No stains, the zip works well.' }],
    ['Le Creuset cast iron pot, 24 cm', 'Kitchen', 'Good', 'fixed', 75, 'active', 4, ['File:Lecreuset lamama-enzomari.JPG'],
      { desc: 'Round enamelled cast iron pot, 4.2 l, brown. Works on induction. Normal signs of use inside, no chips on the enamel.' }],
    ['Iittala Kivi tealight holders, 2 pcs', 'Home', 'Like new', 'fixed', 24, 'active', 1, ['File:Marimekko-Iittala Kivituikut Primavera-liinalla.jpg'],
      { password: 'friends', desc: 'Red and dark blue Kivi holders by Marimekko and Iittala. No chips. The tablecloth is not for sale.' }]
  ]
}];

// Commons: one API call per size for all titles, then the image files themselves.
const titles = sellers.flatMap(s => [s.cover, ...s.items.flatMap(i => i[7])]).filter(p => typeof p === 'string');
const get = async url => {
  for (let k = 1; ; k++) {
    const r = await fetch(url, { headers: UA });
    if (r.ok) return r;
    if (k === 5) throw new Error(`${r.status} for ${url}`);
    console.log(`Wikimedia answered ${r.status}, waiting ${10 * k} s`);
    await new Promise(z => setTimeout(z, 10e3 * k));
  }
};
const info = async width => {
  const d = await (await get(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiextmetadatafilter=LicenseShortName&iiurlwidth=${width}&titles=${encodeURIComponent(titles.join('|'))}`)).json();
  const byTitle = Object.fromEntries(Object.values(d.query.pages).map(p => [p.title, p.imageinfo?.[0]]));
  return Object.fromEntries(titles.map(t => [t, byTitle[d.query.normalized?.find(n => n.from === t)?.to ?? t] ?? (() => { throw new Error('Not on Commons: ' + t); })()]));
};
const [large, small] = await Promise.all([info(1280), info(800)]);

const { env, dispose } = await getPlatformProxy({ configPath: 'wrangler.dev.json', persist: true });
const db = env.DB, q = [];
const svg = (emoji, bg, w, h, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="100%" height="100%" fill="${bg}"/><text x="50%" y="46%" font-size="${Math.min(w, h) / 3}" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
<text x="50%" y="88%" font-size="${Math.min(w, h) / 22}" fill="#fff" fill-opacity=".8" text-anchor="middle" font-family="sans-serif">${label}</text></svg>`;
const putPhoto = async (sid, lid, key, pos, p, label) => {
  let w, h, avg, bl, bs, type;
  if (typeof p === 'string') {
    ({ thumbwidth: w, thumbheight: h } = large[p]);
    // Known constraint: a fixed warm grey stands in for the photo's average colour (only shows while the image loads).
    avg = '#8A7F72', type = 'image/jpeg';
    [bl, bs] = await Promise.all([large[p].thumburl, small[p].thumburl].map(async u => new Uint8Array(await (await get(u)).arrayBuffer())));
  } else {
    [, avg, w, h] = p; type = 'image/svg+xml'; bl = bs = svg(p[0], avg, w, h, label);
  }
  await env.PHOTOS.put(`${key}/l`, bl, { httpMetadata: { contentType: type } });
  await env.PHOTOS.put(`${key}/s`, bs, { httpMetadata: { contentType: type } });
  q.push(db.prepare('INSERT INTO photos (key, listing_id, seller_id, pos, w, h, avg, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(key, lid, sid, pos, w, h, avg, now));
};
const credit = ps => ps.filter(p => typeof p === 'string').map(p => `\n\nPhoto: Wikimedia Commons, ${p.slice(5)} (${large[p].extmetadata?.LicenseShortName?.value ?? 'see Commons'}).`).join('');

for (const s of sellers) {
  const sid = s.id;
  for (const { key } of (await db.prepare('SELECT key FROM photos WHERE seller_id = ?').bind(sid).all()).results) await env.PHOTOS.delete([`${key}/l`, `${key}/s`]);
  await db.batch([
    db.prepare('DELETE FROM requests WHERE listing_id IN (SELECT id FROM listings WHERE seller_id = ?)').bind(sid),
    db.prepare('DELETE FROM photos WHERE seller_id = ?').bind(sid),
    db.prepare('DELETE FROM listings WHERE seller_id = ?').bind(sid),
    db.prepare('DELETE FROM sellers WHERE id = ?').bind(sid)
  ]);
  q.push(db.prepare('INSERT INTO sellers (id, email, name, slug, about, contact, cover_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(sid, s.email, s.name, s.slug, s.about, s.contact, sid + 'cover', now - 60 * DAY));
  await putPhoto(sid, null, sid + 'cover', 0, s.cover, s.name);
  for (const [n, [title, category, condition, mode, eur, status, ago, photos, x]] of s.items.entries()) {
    const id = `${sid}${String(n + 1).padStart(2, '0')}`, pub = now - ago * DAY - n * 3600e3;
    const ends = mode === 'auction' && x.endsIn != null ? now + x.endsIn * DAY : null;
    const desc = (x.desc ?? `Mock listing for local testing. ${title} in ${condition.toLowerCase()} condition. Pick-up in Kallio, Helsinki.`) + credit(photos);
    q.push(db.prepare(`INSERT INTO listings (id, seller_id, title, category, condition, description, mode, price_cents, duration_days, ends_at, area, area_label, password_mac, status, created_at, published_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, sid, title, category, condition, desc, mode, eur * 100, 3, ends,
      JSON.stringify(x.near ? NEAR.area : []), x.near ? NEAR.label : '', x.password ? pwMac(x.password) : null, status, pub, pub, mode === 'fixed' ? pub + 30 * DAY : null));
    for (const [i, p] of photos.entries()) await putPhoto(sid, id, `${id}p${i}`, i, p, title.slice(0, 40));
    const reqs = [...(x.bids || []).map(a => ['bid', a]), ...(x.offers || []).map(a => ['offer', a]), ...Array.from({ length: x.wants || 0 }, () => ['want', eur])];
    for (const [i, [kind, a]] of reqs.entries())
      q.push(db.prepare('INSERT INTO requests (id, listing_id, kind, amount_cents, name, contact, note, buyer_key_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(`${id}r${i}`, id, kind, a * 100, ['Aino', 'Mikko', 'Sara', 'Jussi'][i % 4], '040 123 4567', i ? '' : 'Can I pick it up on Saturday?', `demobuyer${i}`,
          status === 'reserved' && i === 0 ? 'accepted' : 'open', pub + (i + 1) * 3600e3));
  }
}
await db.batch(q);
await dispose();
console.log(`Seeded ${sellers.map(s => `${s.items.length} listings at http://localhost:8787/s/${s.slug} (${s.email})`).join(', ')}. Sign-in codes show at /dev/mail.`);
