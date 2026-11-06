// Shelfring: one Worker with server-rendered pages. Routes, pages, forms and the scheduled job.
import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { raw } from 'hono/html';
import type { Child } from 'hono/jsx';
import { rid, sha256, hmac, same, signList, readList, inArea, checkPhoto, cents, money, CATEGORIES, CONDITIONS, DRAFT_PROMPT, parseDraft, type Cf } from './util.ts';
import { send } from './push.ts';
import { SCENES, LOGO } from './art.ts';

/* ---------- types and settings ---------- */
type Settings = {
  SITE_NAME?: string; CURRENCY?: string; AREA_PRESETS?: string; AI_MODEL?: string; PHOTO_ORIGIN?: string; EMAIL_FROM?: string;
  SITE_URL?: string; CONTACT_EMAIL?: string; TERMS_URL?: string; PRIVACY_URL?: string; SOURCE_URL?: string; VAPID_PUBLIC_KEY?: string;
  DEV?: string; DEV_CF?: string;
};
type E = Env & Settings;
type Seller = { id: string; email: string; name: string; slug: string | null; about: string; contact: string; photo_key: string | null; cover_key: string | null; last_audience: string | null };
type Listing = {
  id: string; seller_id: string | null; title: string; category: string; condition: string; description: string; mode: 'fixed' | 'auction';
  price_cents: number; duration_days: number; ends_at: number | null; area: string; area_label: string; password_mac: string | null;
  status: string; og_key: string | null; removed_reason: string | null; created_at: number; published_at: number | null; expires_at: number | null; closed_at: number | null;
};
type Photo = { key: string; listing_id: string | null; pos: number; w: number; h: number; avg: string };
type Req = { id: string; listing_id: string; kind: string; amount_cents: number; name: string; contact: string; note: string; email: string; buyer_key_hash: string; status: string; created_at: number; decided_at: number | null };
type C = Context<{ Bindings: E; Variables: { seller: Seller | null } }>;

const DAY = 86_400_000;
const app = new Hono<{ Bindings: E; Variables: { seller: Seller | null } }>();
const site = (e: E) => e.SITE_NAME || 'Shelfring';
const cur = (e: E) => e.CURRENCY || 'EUR';
const presets = (e: E): Record<string, string[]> => { try { return JSON.parse(e.AREA_PRESETS || '{}'); } catch { return {}; } };
const purl = (e: E, key: string, size: 'l' | 's' | 'og') => `${e.PHOTO_ORIGIN || '/img'}/${key}/${size}`;
const abs = (origin: string, u: string) => u.startsWith('/') ? origin + u : u;
const smallW = (p: Photo) => Math.round(p.w * Math.min(1, 800 / Math.max(p.w, p.h)));
const ip = (c: C) => c.req.header('cf-connecting-ip') || 'local';
const limited = async (rl: RateLimit, key: string) => !(await rl.limit({ key })).success;
const cookie = { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' } as const;
const cfOf = (c: C): Cf => {
  if (c.env.DEV && c.env.DEV_CF) { const [country, regionCode, city] = c.env.DEV_CF.split(','); return { country, regionCode, city }; }
  return c.req.raw.cf as Cf;
};
const when = (t: number) => new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki' });
// Known constraint: times show in one time zone for all visitors. Upgrade path: a TIME_ZONE setting.
const ago = (t: number) => { const d = Math.floor((Date.now() - t) / DAY); return d < 1 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
const str = (v: unknown, max: number) => (typeof v === 'string' ? v : '').trim().slice(0, max);
const emailOk = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/* ---------- middleware: CSRF, session, headers ---------- */
app.use('*', async (c, next) => {
  if (c.req.method === 'POST') {
    // a cross-site form cannot set X-Forwarded-Host, so a proxy in front (a tunnel, a preview) stays allowed
    const o = c.req.header('origin');
    if (!o || ![c.req.header('host'), c.req.header('x-forwarded-host')].includes(new URL(o).host)) return c.text('Forbidden: cross-site request', 403);
  }
  const sid = getCookie(c, 'sid');
  c.set('seller', sid ? await c.env.DB.prepare('SELECT s.* FROM sessions x JOIN sellers s ON s.id = x.seller_id WHERE x.token_hash = ? AND x.expires_at > ?')
    .bind(await sha256(sid), Date.now()).first<Seller>() : null);
  await next();
  c.header('Content-Security-Policy', `default-src 'self'; img-src 'self' data: blob: ${c.env.PHOTO_ORIGIN || ''}; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'same-origin');
});

/* ---------- page shell ---------- */
type PageOpts = { title?: string; og?: { title: string; description: string; image: string } | 'generic'; wide?: boolean };
async function page(c: C, o: PageOpts, body: Child) {
  const e = c.env, s = c.get('seller'), origin = new URL(c.req.url).origin;
  const og = o.og === 'generic' || !o.og ? { title: site(e), description: 'A listing on ' + site(e), image: origin + '/og.png' } : o.og;
  const foot = [['/safety', 'Safety tips'], [e.TERMS_URL, 'Terms'], [e.PRIVACY_URL, 'Privacy'], [e.CONTACT_EMAIL && 'mailto:' + e.CONTACT_EMAIL, 'Contact'], [e.SOURCE_URL, 'Source code']].filter(([h]) => h);
  const html = (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{o.title ? `${o.title} · ${site(e)}` : site(e)}</title>
        <meta name="theme-color" content="#FDFDFB" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#1F2430" media="(prefers-color-scheme: dark)" />
        <meta property="og:title" content={og.title} />
        <meta property="og:description" content={og.description} />
        <meta property="og:image" content={og.image} />
        <meta property="og:site_name" content={site(e)} />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="stylesheet" href="/style.css" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <script src="/app.js" defer></script>
      </head>
      <body data-vapid={e.VAPID_PUBLIC_KEY || ''} data-currency={cur(e)} data-site={site(e)}>
        <header class="bar">
          <a class="brand" href={s ? '/console' : '/'}>{raw(LOGO)}<span>{site(e)}</span></a>
          {s ? <a class="btn small" href="/sell">Sell</a> : <span class="bar-r"><a href="/signin">Sign in</a><a class="btn small" href="/sell">Sell</a></span>}
        </header>
        <main class={o.wide ? 'page wide' : 'page'}>{body}</main>
        <footer class="foot">{foot.map(([h, t]) => <a href={h!}>{t}</a>)}</footer>
      </body>
    </html>
  );
  return c.html('<!doctype html>' + (await html.toString()));
}
const notice = (c: C, title: string, text: Child, status = 200, scene?: keyof typeof SCENES) => {
  c.status(status as 200);
  return page(c, { title }, <section class="notice">{scene && raw(SCENES[scene])}<h1>{title}</h1><p>{text}</p></section>);
};
const Icon = ({ n }: { n: string }) => <svg class="ico" aria-hidden="true"><use href={`/icons.svg#${n}`} /></svg>;
const Ph = ({ e, p, alt, cls = 'r45', size = 's', eager = false }: { e: E; p: Photo; alt: string; cls?: string; size?: 's' | 'l'; eager?: boolean }) => (
  <span class={`ph ${cls}`} style={`--avg:${p.avg}`}>
    <img src={purl(e, p.key, size)} srcset={`${purl(e, p.key, 's')} ${smallW(p)}w, ${purl(e, p.key, 'l')} ${p.w}w`} sizes={cls === 'r45' ? '(max-width: 560px) 50vw, 270px' : '(max-width: 560px) 100vw, 560px'}
      width={p.w} height={p.h} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" fetchpriority={eager ? 'high' : undefined} />
  </span>
);
const Err = ({ list }: { list: string[] }) => list.length ? <div class="err" role="alert">{list.map(t => <p>{t}</p>)}</div> : null;

/* ---------- data helpers ---------- */
const listingById = (e: E, id: string) => e.DB.prepare('SELECT * FROM listings WHERE id = ?').bind(id).first<Listing>();
const photosOf = async (e: E, id: string) => (await e.DB.prepare('SELECT * FROM photos WHERE listing_id = ? ORDER BY pos, created_at').bind(id).all<Photo>()).results;
const photo = (e: E, key: string | null) => key ? e.DB.prepare('SELECT * FROM photos WHERE key = ?').bind(key).first<Photo>() : null;
const priceOf = (e: E, l: Listing) => money(l.price_cents, cur(e));
const topBid = (e: E, id: string) => e.DB.prepare("SELECT * FROM requests WHERE listing_id = ? AND kind = 'bid' AND status = 'open' ORDER BY amount_cents DESC, created_at LIMIT 1").bind(id).first<Req>();
const unlocked = async (c: C) => readList(c.env.HMAC_KEY, getCookie(c, 'pw'));
// Known constraint: a keyed hash, not a slow hash, because Workers Free allows 10 ms CPU per request.
// Ceiling: with the server key and the database together, weak passwords can be guessed offline. Upgrade path: PBKDF2 on Workers Paid.
const pwMac = async (e: E, pw: string) => (await hmac(e.HMAC_KEY, 'pw:' + pw)).slice(0, 32);
async function visible(c: C, l: Listing) {
  if (c.get('seller')?.id === l.seller_id) return 'ok';
  if (l.password_mac && !(await unlocked(c)).includes(l.password_mac)) return 'password';
  return inArea(cfOf(c), JSON.parse(l.area)) ? 'ok' : 'area';
}
async function buyerKey(c: C) {
  let k = getCookie(c, 'bk');
  if (!k) { k = rid(); setCookie(c, 'bk', k, { ...cookie, maxAge: 365 * 86400 }); }
  return sha256('buyer:' + k);
}
async function deletePhotos(e: E, keys: string[]) {
  if (!keys.length) return;
  await e.PHOTOS.delete(keys.flatMap(k => [`${k}/l`, `${k}/s`]));
  await e.DB.prepare(`DELETE FROM photos WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).run();
}

/* ---------- notifications: web push and email ---------- */
// Local development only: the last emails, shown at /dev/mail. Known constraint: memory of one local isolate; lost on restart.
const devMail: { to: string; subject: string; text: string; at: number }[] = [];
async function sendEmail(e: E, to: string, subject: string, text: string) {
  if (e.DEV) { devMail.unshift({ to, subject, text, at: Date.now() }); devMail.length = Math.min(devMail.length, 30); return console.log(`\n--- email to ${to}\n${subject}\n\n${text}\n---\n`); }
  // Known constraint: only the Resend API. Upgrade path: an EMAIL_API_URL setting for other providers.
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${e.EMAIL_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: e.EMAIL_FROM, to: [to], subject, text }) });
  if (!r.ok) console.error('email failed', r.status, await r.text());
}
async function notify(e: E, origin: string, owner: string | null, email: string | null, msg: { title: string; body: string; path: string }) {
  const url = origin + msg.path;
  if (owner && e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY) {
    const subs = (await e.DB.prepare('SELECT * FROM push_subs WHERE owner = ?').bind(owner).all<{ endpoint: string; p256dh: string; auth: string }>()).results;
    for (const s of subs) {
      const st = await send(s, JSON.stringify({ title: msg.title, body: msg.body, url }), { pub: e.VAPID_PUBLIC_KEY, priv: e.VAPID_PRIVATE_KEY, subject: e.CONTACT_EMAIL ? 'mailto:' + e.CONTACT_EMAIL : origin }).catch(() => 0);
      if (st === 404 || st === 410) await e.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run();
    }
  }
  if (email) await sendEmail(e, email, msg.title, `${msg.body}\n\n${url}\n\n${site(e)}`);
}
const later = (c: C, p: Promise<unknown>) => { try { c.executionCtx.waitUntil(p); } catch { p.catch(console.error); } };

/* ---------- home, static pages ---------- */
app.get('/', c => c.get('seller') ? c.redirect('/console') : page(c, {}, (
  <section class="home">
    {raw(SCENES.emptyA)}
    <h1>Sell a used item in one minute.</h1>
    <p class="lede">Take a photo, check the text, set a price. Then share the link with the people you choose: everybody, people nearby, or only people who know the password. Buyers need no account.</p>
    <p><a class="btn" href="/sell">Sell an item</a></p>
    <p class="muted">Already selling? <a href="/signin">Sign in</a> to see your shelf.</p>
  </section>
)));
app.get('/dev/mail', c => c.env.DEV ? page(c, { title: 'Local mailbox' }, (
  <section class="console"><h1>Local mailbox</h1><p class="muted">Local development only. Emails since the server started, newest first.</p>
    {devMail.length ? <ul class="reqs">{devMail.map(m => <li><div><b>{m.subject}</b><span class="muted"> · to {m.to} · {ago(m.at)}</span></div><p class="note">{m.text}</p></li>)}</ul> : <p class="muted">No emails yet.</p>}</section>
)) : c.notFound());
app.get('/safety', c => page(c, { title: 'Safety tips' }, (
  <section class="prose"><h1>Safety tips</h1>
    <ul>
      <li>Meet in a public place in daylight, for example at a metro station or a shop.</li>
      <li>Look at the item before you pay. Pay when you get the item.</li>
      <li>Never enter bank codes or card details from a link that someone sends you.</li>
      <li>{site(c.env)} never asks you for a payment and never sends payment links.</li>
      <li>A bid in an auction is not binding. The seller chooses the buyer.</li>
      <li>Report a listing that looks wrong. The report link is at the end of each listing.</li>
    </ul>
  </section>
)));
app.get('/manifest.webmanifest', c => c.json({
  name: site(c.env), short_name: site(c.env), start_url: '/console', display: 'standalone', background_color: '#FDFDFB', theme_color: '#2D5BFF',
  icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
}, 200, { 'Content-Type': 'application/manifest+json' }));

/* photos through the Worker: local development, and same-origin reads for the link preview canvas */
app.get('/img/:key/:size{l|s|og}', async c => {
  const o = await c.env.PHOTOS.get(`${c.req.param('key')}/${c.req.param('size')}`);
  if (!o) return c.notFound();
  return new Response(o.body, { headers: { 'Content-Type': o.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
});

/* ---------- sign-in with an email code ---------- */
const nextPath = (v: unknown) => typeof v === 'string' && /^\/[a-z0-9/?=&._-]*$/i.test(v) && !v.startsWith('//') ? v : '/console';
const SignIn = ({ next, err, email = '' }: { next: string; err: string[]; email?: string }) => (
  <section class="form"><h1>Sign in</h1><p class="muted">We send a 6-digit code to your email. No password.</p><Err list={err} />
    <form method="post" action="/signin"><input type="hidden" name="next" value={next} />
      <label>Email<input type="email" name="email" value={email} required autocomplete="email" inputmode="email" maxlength={254} /></label>
      <button class="btn wide">Send the code</button></form></section>
);
app.get('/signin', c => page(c, { title: 'Sign in' }, <SignIn next={nextPath(c.req.query('next'))} err={[]} />));
app.post('/signin', async c => {
  const f = await c.req.parseBody(), email = str(f.email, 254).toLowerCase(), next = nextPath(f.next);
  if (!emailOk(email)) return page(c, { title: 'Sign in' }, <SignIn next={next} email={email} err={['Enter a valid email address.']} />);
  if (await limited(c.env.RL_STRICT, 'login:' + ip(c)) || await limited(c.env.RL_STRICT, 'login:' + email))
    return page(c, { title: 'Sign in' }, <SignIn next={next} email={email} err={['Too many codes. Wait one minute and try again.']} />);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  await c.env.DB.prepare('INSERT OR REPLACE INTO login_codes (email, code_mac, expires_at, attempts) VALUES (?, ?, ?, 0)').bind(email, await hmac(c.env.HMAC_KEY, `code:${email}:${code}`), Date.now() + 600_000).run();
  later(c, sendEmail(c.env, email, `Your ${site(c.env)} code: ${code}`, `Your sign-in code is ${code}. It is valid for 10 minutes.\n\nIf you did not ask for a code, ignore this email.`));
  return c.redirect(`/signin/code?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
});
const CodeForm = ({ env, email, next, err }: { env: E; email: string; next: string; err: string[] }) => (
  <section class="form"><h1>Enter the code</h1><p class="muted">We sent a 6-digit code to <b>{email}</b>. It is valid for 10 minutes.</p><Err list={err} />
    <form method="post" action="/signin/code"><input type="hidden" name="email" value={email} /><input type="hidden" name="next" value={next} />
      <label>Code<input name="code" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength={6} class="code" /></label>
      <button class="btn wide">Sign in</button></form>
    <p class="muted"><a href={`/signin?next=${encodeURIComponent(next)}`}>Send a new code</a></p>
    {env.DEV && <p class="tip">Local development: no email is sent. <a href="/dev/mail" target="_blank">Open the local mailbox</a></p>}</section>
);
app.get('/signin/code', c => page(c, { title: 'Enter the code' }, <CodeForm env={c.env} email={str(c.req.query('email'), 254)} next={nextPath(c.req.query('next'))} err={[]} />));
app.post('/signin/code', async c => {
  const f = await c.req.parseBody(), email = str(f.email, 254).toLowerCase(), next = nextPath(f.next), code = str(f.code, 6);
  const row = await c.env.DB.prepare('SELECT * FROM login_codes WHERE email = ?').bind(email).first<{ code_mac: string; expires_at: number; attempts: number }>();
  const fail = (t: string) => page(c, { title: 'Enter the code' }, <CodeForm env={c.env} email={email} next={next} err={[t]} />);
  if (!row || row.expires_at < Date.now() || row.attempts >= 5) return fail('This code is not valid any more. Send a new code.');
  await c.env.DB.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?').bind(email).run();
  if (!same(row.code_mac, await hmac(c.env.HMAC_KEY, `code:${email}:${code}`))) return fail(`The code is wrong. ${4 - row.attempts} attempts left.`);
  await c.env.DB.prepare('DELETE FROM login_codes WHERE email = ?').bind(email).run();
  await c.env.DB.prepare('INSERT INTO sellers (id, email, contact, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (email) DO NOTHING').bind(rid(), email, email, Date.now()).run();
  const seller = (await c.env.DB.prepare('SELECT * FROM sellers WHERE email = ?').bind(email).first<Seller>())!;
  const token = rid(32);
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, seller_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), seller.id, Date.now() + 30 * DAY).run();
  setCookie(c, 'sid', token, { ...cookie, maxAge: 30 * 86400 });
  return c.redirect(seller.name ? next : `/console/profile?next=${encodeURIComponent(next)}`);
});
app.post('/signout', async c => {
  const sid = getCookie(c, 'sid');
  if (sid) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(sid)).run();
  deleteCookie(c, 'sid', cookie);
  return c.redirect('/');
});

/* ---------- selling: draft, photos, AI draft, publish ---------- */
async function draft(c: C, create: boolean) {
  const dk = getCookie(c, 'dk');
  if (dk) {
    const d = await c.env.DB.prepare("SELECT * FROM listings WHERE draft_key_hash = ? AND status = 'draft'").bind(await sha256('draft:' + dk)).first<Listing>();
    if (d) return d;
  }
  if (!create) return null;
  const key = rid(), id = rid();
  const last = JSON.parse(c.get('seller')?.last_audience || '{}');
  await c.env.DB.prepare('INSERT INTO listings (id, draft_key_hash, area, area_label, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, await sha256('draft:' + key), JSON.stringify(last.area || []), last.label || '', Date.now()).run();
  setCookie(c, 'dk', key, { ...cookie, maxAge: 86400 });
  return (await listingById(c.env, id))!;
}

app.post('/api/photo', async c => {
  const e = c.env, f = await c.req.parseBody(), target = String(f.target || 'listing'), seller = c.get('seller');
  if (await limited(e.RL, 'up:' + ip(c))) return c.json({ error: 'Too many uploads. Wait one minute.' }, 429);
  const d = target === 'listing' ? await draft(c, true) : null;
  if (target !== 'listing' && !seller) return c.json({ error: 'Sign in first.' }, 401);
  if (d && (await photosOf(e, d.id)).length >= 5) return c.json({ error: 'A listing can have 5 photos.' }, 400);
  const l = f.l, s = f.s, w = Number(f.w), h = Number(f.h), avg = String(f.avg || '');
  if (!(l instanceof File) || !(s instanceof File) || !(w > 0 && w <= 1600 && h > 0 && h <= 1600) || !/^#[0-9A-F]{6}$/i.test(avg)) return c.json({ error: 'Bad upload.' }, 400);
  const bl = new Uint8Array(await l.arrayBuffer()), bs = new Uint8Array(await s.arrayBuffer());
  const tl = checkPhoto(bl), ts = checkPhoto(bs);
  if ('error' in tl || 'error' in ts) return c.json({ error: 'This photo cannot be used. Take it again, or save it as JPEG.' }, 400);
  const key = rid(), meta = { cacheControl: 'public, max-age=31536000, immutable' };
  await e.PHOTOS.put(`${key}/l`, bl, { httpMetadata: { contentType: tl.type, ...meta } });
  await e.PHOTOS.put(`${key}/s`, bs, { httpMetadata: { contentType: ts.type, ...meta } });
  const pos = d ? ((await e.DB.prepare('SELECT MAX(pos) AS m FROM photos WHERE listing_id = ?').bind(d.id).first<{ m: number | null }>())?.m ?? -1) + 1 : 0;
  await e.DB.prepare('INSERT INTO photos (key, listing_id, seller_id, pos, w, h, avg, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(key, d?.id ?? null, seller?.id ?? null, pos, w, h, avg, Date.now()).run();
  if (!d && seller) {
    const col = target === 'cover' ? 'cover_key' : 'photo_key', old = seller[col];
    await e.DB.prepare(`UPDATE sellers SET ${col} = ? WHERE id = ?`).bind(key, seller.id).run();
    if (old) await deletePhotos(e, [old]);
  }
  return c.json({ key, url: purl(e, key, 's') });
});
async function ownDraftPhoto(c: C) {
  const d = await draft(c, false), p = await photo(c.env, c.req.param('key') ?? null);
  return d && p && p.listing_id === d.id ? { d, p } : null;
}
app.post('/api/photo/:key/delete', async c => {
  const o = await ownDraftPhoto(c); if (!o) return c.json({ error: 'Not found' }, 404);
  await deletePhotos(c.env, [o.p.key]);
  return c.json({ ok: true });
});
app.post('/api/photo/:key/first', async c => {
  const o = await ownDraftPhoto(c); if (!o) return c.json({ error: 'Not found' }, 404);
  await c.env.DB.prepare('UPDATE photos SET pos = (SELECT MIN(pos) FROM photos WHERE listing_id = ?) - 1 WHERE key = ?').bind(o.d.id, o.p.key).run();
  return c.json({ ok: true });
});
app.post('/api/og', async c => {
  const d = await draft(c, false); if (!d) return c.json({ error: 'No draft' }, 404);
  if (Number(c.req.header('content-length') || 0) > 2_000_000) return c.json({ error: 'Too large' }, 413);
  const b = new Uint8Array(await c.req.arrayBuffer()), t = checkPhoto(b);
  if ('error' in t) return c.json({ error: 'Bad image' }, 400);
  const key = rid();
  await c.env.PHOTOS.put(`${key}/og`, b, { httpMetadata: { contentType: t.type, cacheControl: 'public, max-age=31536000, immutable' } });
  if (d.og_key) await c.env.PHOTOS.delete(`${d.og_key}/og`);
  await c.env.DB.prepare('UPDATE listings SET og_key = ? WHERE id = ?').bind(key, d.id).run();
  return c.json({ ok: true });
});
app.post('/api/draft-ai', async c => {
  const e = c.env, d = await draft(c, false);
  if (!d) return c.json({}, 404);
  if (await limited(e.RL, 'ai:' + ip(c))) return c.json({}, 429);
  if (!e.AI_MODEL) return c.json(e.DEV ? { title: 'Item from your photos (AI stub)', category: 'Other', condition: 'Good', description: 'Local development has no AI. Set AI_MODEL to use Workers AI.' } : {});
  const images = [];
  for (const p of (await photosOf(e, d.id)).slice(0, 3)) {
    const o = await e.PHOTOS.get(`${p.key}/s`); if (!o) continue;
    const b = new Uint8Array(await o.arrayBuffer()); let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    images.push({ type: 'image_url', image_url: { url: `data:${o.httpMetadata?.contentType || 'image/jpeg'};base64,${btoa(s)}` } });
  }
  if (!images.length) return c.json({});
  try {
    const run = e.AI.run(e.AI_MODEL as keyof AiModels, { messages: [{ role: 'system', content: DRAFT_PROMPT }, { role: 'user', content: [{ type: 'text', text: 'Photos of the item:' }, ...images] }], max_tokens: 500 } as never);
    const r = await Promise.race([run, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 8000))]) as { response?: unknown };
    return c.json(parseDraft(r?.response));
  } catch (err) { console.error('AI draft failed', err); return c.json({}); }
});

const SellForm = ({ c, d, photos, err }: { c: C; d: Listing; photos: Photo[]; err: string[] }) => {
  const e = c.env, last = JSON.parse(c.get('seller')?.last_audience || '{}'), area: string[] = JSON.parse(d.area), p = presets(e);
  const price = d.price_cents || d.title ? (d.price_cents / 100).toString() : '';
  return (
    <form class="sell" method="post" action="/sell" data-sell>
      <h1>Sell an item</h1><Err list={err} />
      <fieldset><legend><b>1</b> Photos</legend>
        <p class="muted">1 to 5 photos. The first photo is the cover.</p>
        <p class="tip"><Icon n="cam" /><span>Use daylight. Put the item on a plain surface. Show all of it.</span></p>
        {!photos.length && raw(SCENES.sellA)}
        <div class="grid3" data-photos>
          {photos.map((ph, i) => <figure class={i ? 'pick' : 'pick cover'} data-key={ph.key}><Ph e={e} p={ph} alt={`Photo ${i + 1}`} />{i === 0 && <span class="chip cover-chip">Cover</span>}
            <button type="button" class="x" data-del aria-label={`Remove photo ${i + 1}`}><Icon n="x" /></button></figure>)}
          <label class="slot" data-add hidden={photos.length >= 5}><Icon n="plus" /><span>Add photo</span><input type="file" accept="image/*" multiple data-file class="sr" /></label>
        </div>
        <p class="muted" data-photo-msg aria-live="polite">{photos.length > 1 ? 'Tap a photo to make it the cover.' : ''}</p>
        <noscript><p class="err">Photo upload needs JavaScript.</p></noscript>
      </fieldset>
      <fieldset><legend><b>2</b> Details</legend>
        <p class="ai muted" data-ai aria-live="polite"></p>
        <label>Title<input name="title" value={d.title} required minlength={3} maxlength={80} /></label>
        <div class="two">
          <label>Category<select name="category"><option value="">Choose</option>{CATEGORIES.map(x => <option selected={x === d.category}>{x}</option>)}</select></label>
          <label>Condition<select name="condition"><option value="">Choose</option>{CONDITIONS.map(x => <option selected={x === d.condition}>{x}</option>)}</select></label>
        </div>
        <label>Description<textarea name="description" rows={4} maxlength={2000}>{d.description}</textarea></label>
      </fieldset>
      <fieldset><legend><b>3</b> Price</legend>
        <div class="seg" role="radiogroup" aria-label="Price mode">
          <label><input type="radio" name="mode" value="fixed" checked={d.mode !== 'auction'} />Fixed price</label>
          <label><input type="radio" name="mode" value="auction" checked={d.mode === 'auction'} />Auction</label>
        </div>
        <div class="two">
          <label><span class="if-fixed">Price</span><span class="if-auction">Start price</span><span class="money"><span>{money(0, cur(e)).replace(/[\d.,\s]/g, '')}</span><input name="price" value={price} inputmode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?" /></span></label>
          <label class="if-auction">Ends after<select name="duration">{[1, 3, 7].map(n => <option value={n} selected={n === d.duration_days}>{n === 1 ? '1 day' : `${n} days`}</option>)}</select></label>
        </div>
        <p class="muted if-fixed">Buyers can say "I want it" or make an offer.</p>
        <p class="muted if-auction">Bids are not binding. At the end, you choose the buyer.</p>
      </fieldset>
      <fieldset><legend><b>4</b> Who can see it</legend>
        <p class="muted">No choice means everybody with the link.</p>
        {Object.keys(p).length > 0 && <div class="checks">{Object.keys(p).map(k => <label class="check"><input type="checkbox" name="area" value={k} checked={p[k].every(a => area.includes(a))} />People in {k}</label>)}</div>}
        <label>Password<input name="password" minlength={6} maxlength={64} autocomplete="off" placeholder={last.pw ? 'Empty: no password' : 'Optional, at least 6 characters'} /></label>
        {last.pw && <label class="check"><input type="checkbox" name="same_pw" value="1" checked={d.password_mac === last.pw} />Use the same password as last time</label>}
        <p class="muted">The area check uses the location of the internet connection. It is a soft filter: it shows the listing to people nearby, but not always only to them. For a closed group, use a password.</p>
      </fieldset>
      <button class="btn wide" data-publish>Publish</button>
      <p class="muted center">{c.get('seller') ? 'The listing goes live at once.' : 'First time? We ask for your email at the end.'}</p>
    </form>
  );
};
app.get('/sell', async c => {
  const d = (await draft(c, true))!;
  return page(c, { title: 'Sell an item' }, <SellForm c={c} d={d} photos={await photosOf(c.env, d.id)} err={[]} />);
});
app.post('/sell', async c => {
  const e = c.env, d = await draft(c, false), seller = c.get('seller');
  if (!d) return c.redirect('/sell');
  const f = await c.req.parseBody({ all: true }), p = presets(e);
  const one = (k: string) => (Array.isArray(f[k]) ? (f[k] as unknown[])[0] : f[k]);
  const err: string[] = [], title = str(one('title'), 80), mode = one('mode') === 'auction' ? 'auction' : 'fixed', price = cents(one('price'));
  const duration = [1, 3, 7].includes(Number(one('duration'))) ? Number(one('duration')) : 3;
  const labels = ([] as unknown[]).concat(f.area ?? []).map(String).filter(k => p[k]);
  const pw = str(one('password'), 64), last = JSON.parse(seller?.last_audience || '{}');
  const mac = pw ? await pwMac(e, pw) : one('same_pw') && last.pw ? last.pw : null;
  if (title.length < 3) err.push('Write a title of at least 3 characters.');
  if (price === null) err.push('Write the price as a number, for example 15 or 12.50.');
  if (pw && pw.length < 6) err.push('The password needs at least 6 characters.');
  const photos = await photosOf(e, d.id);
  if (!photos.length) err.push('Add at least one photo.');
  await e.DB.prepare('UPDATE listings SET title = ?, category = ?, condition = ?, description = ?, mode = ?, price_cents = ?, duration_days = ?, area = ?, area_label = ?, password_mac = ? WHERE id = ?')
    .bind(title, CATEGORIES.includes(String(one('category'))) ? one('category') : '', CONDITIONS.includes(String(one('condition'))) ? one('condition') : '', str(one('description'), 2000),
      mode, price ?? 0, duration, JSON.stringify([...new Set(labels.flatMap(k => p[k]))]), labels.join(', '), pw.length >= 6 || !pw ? mac : d.password_mac, d.id).run();
  if (err.length) return page(c, { title: 'Sell an item' }, <SellForm c={c} d={(await listingById(e, d.id))!} photos={photos} err={err} />);
  return seller ? publish(c, seller) : c.redirect('/signin?next=/sell/publish');
});
app.get('/sell/publish', async c => {
  const s = c.get('seller');
  if (!s) return c.redirect('/signin?next=/sell/publish');
  if (!s.name) return c.redirect('/console/profile?next=/sell/publish');
  return publish(c, s);
});
async function publish(c: C, s: Seller) {
  const e = c.env, d = await draft(c, false);
  if (!d) return c.redirect('/console');
  const t = Date.now(), auction = d.mode === 'auction';
  await e.DB.batch([
    e.DB.prepare("UPDATE listings SET seller_id = ?, draft_key_hash = NULL, status = 'active', published_at = ?, expires_at = ?, ends_at = ? WHERE id = ?")
      .bind(s.id, t, auction ? null : t + 30 * DAY, auction ? t + d.duration_days * DAY : null, d.id),
    e.DB.prepare('UPDATE photos SET seller_id = ? WHERE listing_id = ?').bind(s.id, d.id),
    e.DB.prepare('UPDATE sellers SET last_audience = ? WHERE id = ?').bind(JSON.stringify({ area: JSON.parse(d.area), label: d.area_label, pw: d.password_mac }), s.id)
  ]);
  deleteCookie(c, 'dk', cookie);
  return c.redirect(`/l/${d.id}?new=1`);
}

/* ---------- listing page ---------- */
const statusText: Record<string, string> = { reserved: 'Reserved', ended: 'Auction ended', expired: 'Expired', sold: 'Sold', closed: 'Closed' };
app.get('/l/:id', async c => {
  const e = c.env, l = await listingById(e, c.req.param('id'));
  if (!l || l.status === 'draft' || !l.seller_id) return notice(c, 'Not found', 'This listing does not exist.', 404);
  if (l.status === 'removed') return notice(c, 'Removed', 'This listing was removed because it broke the rules.', 410);
  const v = await visible(c, l);
  if (v === 'password') return page(c, { title: 'Password', og: 'generic' }, (
    <section class="form">{raw(SCENES.emptyA)}<h1>This listing has a password</h1><p class="muted">The seller shares the password with the people who may see it.</p>
      <form method="post" action={`/l/${l.id}/unlock`}><label>Password<input name="password" required autocomplete="off" maxlength={64} /></label><button class="btn wide">Open</button></form></section>
  ));
  if (v === 'area') return notice(c, 'Not available', 'This listing is not available in your area.');
  const [photos, seller, bid] = await Promise.all([photosOf(e, l.id), e.DB.prepare('SELECT * FROM sellers WHERE id = ?').bind(l.seller_id).first<Seller>(), topBid(e, l.id)]);
  const own = c.get('seller')?.id === l.seller_id, origin = new URL(c.req.url).origin;
  const bkRaw = getCookie(c, 'bk'), mine = bkRaw ? (await e.DB.prepare('SELECT * FROM requests WHERE listing_id = ? AND buyer_key_hash = ? ORDER BY created_at DESC').bind(l.id, await sha256('buyer:' + bkRaw)).all<Req>()).results : [];
  const accepted = mine.find(r => r.status === 'accepted'), first = photos[0];
  const ar = first ? Math.min(Math.max(first.w / first.h, .8), 4 / 3) : 1;
  const open = l.status === 'active' && (l.mode === 'fixed' || (l.ends_at ?? 0) > Date.now());
  const minBid = Math.max(l.price_cents, bid ? bid.amount_cents + 100 : 0);
  const priceLine = l.mode === 'auction' ? (bid ? `Highest bid: ${money(bid.amount_cents, cur(e))}` : `No bids yet. Start price ${priceOf(e, l)}`) : priceOf(e, l);
  const og = { title: `${l.title} · ${l.mode === 'auction' ? 'Auction from ' + priceOf(e, l) : priceOf(e, l)}`, description: [l.condition, l.area_label ? 'For people nearby' : ''].filter(Boolean).join('. ') || site(e),
    image: abs(origin, l.og_key ? purl(e, l.og_key, 'og') : first ? purl(e, first.key, 's') : '/og.png') };
  return page(c, { title: l.title, og }, (
    <article class="listing">
      {own && c.req.query('new') && <div class="done"><p><b>Your listing is live.</b> Share the link with the people you choose.</p><button type="button" class="btn" data-share={`${origin}/l/${l.id}`} data-title={l.title}><Icon n="share" />Share</button></div>}
      <div class="hero">
        <div class="track" style={`--ar:${ar.toFixed(4)}`} tabindex={0} role="group" aria-label={`${photos.length} photos`} data-track>
          {photos.map((p, i) => <figure class="slide"><img src={purl(e, p.key, 'l')} srcset={`${purl(e, p.key, 's')} ${smallW(p)}w, ${purl(e, p.key, 'l')} ${p.w}w`} sizes="(max-width: 560px) 100vw, 560px"
            width={p.w} height={p.h} style={`background:${p.avg}`} alt={i ? `${l.title}, photo ${i + 1} of ${photos.length}` : l.title} loading={i ? 'lazy' : 'eager'} fetchpriority={i ? undefined : 'high'} decoding="async" /></figure>)}
        </div>
        {photos.length > 1 && <span class="count" aria-hidden="true" data-count>1 / {photos.length}</span>}
        {statusText[l.status] && <span class="chip state">{statusText[l.status]}</span>}
      </div>
      {photos.length > 1 && <div class="thumbs">{photos.map((p, i) => <button type="button" class="th" aria-current={i === 0 ? 'true' : 'false'} aria-label={`Photo ${i + 1}`} style={`--avg:${p.avg}`} data-thumb={i}><img src={purl(e, p.key, 's')} alt="" loading="lazy" /></button>)}</div>}
      <header class="lhead"><h1>{l.title}</h1><p class="lprice">{priceLine}</p>
        <p class="meta">{l.mode === 'auction' && l.ends_at && <span><Icon n="clock" />{l.ends_at > Date.now() ? `Ends ${when(l.ends_at)}` : `Ended ${when(l.ends_at)}`}</span>}
          <span><Icon n="clock" />Listed {ago(l.published_at ?? l.created_at)}</span>{l.area_label && <span><Icon n="globe" />For people nearby</span>}{l.password_mac && <span><Icon n="lock" />Password</span>}</p></header>
      {l.description && <p class="desc">{l.description}</p>}
      {(l.condition || l.category) && <p class="cond">{l.condition && <><b>Condition:</b> {l.condition.toLowerCase()}. </>}{l.category && <><b>Category:</b> {l.category}</>}</p>}
      <p class="meta"><span>Seller: {seller?.slug ? <a href={`/s/${seller.slug}`}>{seller.name}</a> : seller?.name}</span></p>
      {accepted && <section class="accepted">{raw(SCENES.acceptedA)}<h2>{seller?.name} accepted your request</h2><p>Contact: <b>{seller?.contact}</b></p><p class="muted">Agree on the time and place. <a href="/safety">Safety tips</a></p></section>}
      {mine.length > 0 && !accepted && <section class="mine" id="mine"><h2>Your requests</h2><ul>{mine.map(r => <li><b>{r.kind === 'want' ? 'I want it' : r.kind === 'offer' ? 'Offer' : 'Bid'}</b> {r.kind !== 'want' && money(r.amount_cents, cur(e))} · {r.status === 'open' ? 'Waiting for the seller' : r.status === 'declined' ? 'Not accepted' : r.status === 'removed' ? 'Removed by the seller' : 'Accepted'}</li>)}</ul>
        <p class="muted">Open this link again to see the answer.</p></section>}
      {own ? <p class="owner"><a class="btn" href={`/console/l/${l.id}`}>Open in your console</a><button type="button" class="btn ghost" data-share={`${origin}/l/${l.id}`} data-title={l.title}><Icon n="share" />Share</button></p>
        : open && <RequestForm l={l} minBid={minBid} e={e} />}
      {!own && <p class="muted report"><a href={`/l/${l.id}/report`}><Icon n="flag" />Report this listing</a></p>}
    </article>
  ));
});
const RequestForm = ({ l, minBid, e }: { l: Listing; minBid: number; e: E }) => (
  <form class="req" method="post" action={`/l/${l.id}/request`} data-req>
    <h2>{l.mode === 'auction' ? 'Bid' : 'Ask to buy'}</h2>
    {l.mode === 'auction'
      ? <label>Your bid<span class="money"><span>{money(0, cur(e)).replace(/[\d.,\s]/g, '')}</span><input name="amount" required inputmode="decimal" value={(minBid / 100).toString()} pattern="[0-9]+([.,][0-9]{1,2})?" /></span><small class="muted">At least {money(minBid, cur(e))}. Bids are not binding.</small></label>
      : <details class="offer"><summary>Make an offer instead</summary><label>Your offer<span class="money"><span>{money(0, cur(e)).replace(/[\d.,\s]/g, '')}</span><input name="amount" inputmode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" /></span></label></details>}
    <label>Your name<input name="name" required maxlength={60} autocomplete="name" /></label>
    <label>How can the seller reach you? <small class="muted">Optional. The seller sees it only after accepting you.</small><input name="contact" maxlength={120} placeholder="Phone, email or Telegram" /></label>
    <label>Note <small class="muted">Optional</small><textarea name="note" rows={2} maxlength={500} /></label>
    <label>Email for the answer <small class="muted">Optional</small><input type="email" name="email" maxlength={254} autocomplete="email" /></label>
    <label class="check" data-push-opt hidden><input type="checkbox" name="push" value="1" />Notify me in this browser</label>
    <button class="btn wide">{l.mode === 'auction' ? 'Place the bid' : 'Send'}</button>
  </form>
);
app.post('/l/:id/unlock', async c => {
  const l = await listingById(c.env, c.req.param('id'));
  if (!l?.password_mac) return c.redirect('/');
  if (await limited(c.env.RL_STRICT, `pw:${ip(c)}:${l.id}`)) return notice(c, 'Wait a minute', 'Too many attempts. Wait one minute and try again.', 429);
  const mac = await pwMac(c.env, str((await c.req.parseBody()).password, 64));
  if (!same(mac, l.password_mac)) return notice(c, 'Wrong password', <>The password is wrong. <a href={`/l/${l.id}`}>Try again</a></>, 403);
  const list = await unlocked(c);
  setCookie(c, 'pw', await signList(c.env.HMAC_KEY, [...new Set([...list, mac])].slice(-20)), { ...cookie, maxAge: 30 * 86400 });
  return c.redirect(`/l/${l.id}`);
});
app.post('/l/:id/request', async c => {
  const e = c.env, l = await listingById(e, c.req.param('id')), origin = new URL(c.req.url).origin;
  if (!l || l.status !== 'active' || (await visible(c, l)) !== 'ok') return notice(c, 'Not possible', 'This listing does not take requests now.', 409);
  if (await limited(e.RL, 'req:' + ip(c))) return notice(c, 'Wait a minute', 'Too many requests. Wait one minute and try again.', 429);
  const f = await c.req.parseBody(), name = str(f.name, 60), email = str(f.email, 254).toLowerCase(), amount = cents(f.amount);
  const kind = l.mode === 'auction' ? 'bid' : amount !== null && String(f.amount).trim() ? 'offer' : 'want';
  if (!name) return notice(c, 'Name missing', <>Write your name. <a href={`/l/${l.id}`}>Back</a></>, 400);
  if (email && !emailOk(email)) return notice(c, 'Email not valid', <>Check the email address. <a href={`/l/${l.id}`}>Back</a></>, 400);
  if (kind !== 'want' && amount === null) return notice(c, 'Amount missing', <>Write the amount as a number. <a href={`/l/${l.id}`}>Back</a></>, 400);
  const bk = await buyerKey(c), id = rid(), t = Date.now(), prev = kind === 'bid' ? await topBid(e, l.id) : null;
  const args = [id, l.id, kind, kind === 'want' ? l.price_cents : amount!, name, str(f.contact, 120), str(f.note, 500), email, bk, t];
  if (kind === 'bid') {
    // one statement, so two parallel bids cannot both pass the check
    const r = await e.DB.prepare(`INSERT INTO requests (id, listing_id, kind, amount_cents, name, contact, note, email, buyer_key_hash, status, created_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'open', ?10
      WHERE EXISTS (SELECT 1 FROM listings WHERE id = ?2 AND mode = 'auction' AND status = 'active' AND ends_at > ?10 AND ?4 >= price_cents)
        AND ?4 >= COALESCE((SELECT MAX(amount_cents) + 100 FROM requests WHERE listing_id = ?2 AND kind = 'bid' AND status = 'open'), 0)`).bind(...args).run();
    if (!r.meta.changes) return notice(c, 'Bid too low', <>Somebody bid more, or the auction has ended. <a href={`/l/${l.id}`}>See the highest bid</a></>, 409);
  } else {
    await e.DB.prepare("INSERT INTO requests (id, listing_id, kind, amount_cents, name, contact, note, email, buyer_key_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)").bind(...args).run();
  }
  const seller = await e.DB.prepare('SELECT * FROM sellers WHERE id = ?').bind(l.seller_id).first<Seller>();
  const what = kind === 'want' ? `${name} wants it` : `${name} ${kind === 'bid' ? 'bids' : 'offers'} ${money(amount!, cur(e))}`;
  later(c, (async () => {
    await notify(e, origin, l.seller_id, seller?.email ?? null, { title: `New ${kind === 'want' ? 'request' : kind} for ${l.title}`, body: what, path: `/console/l/${l.id}` });
    if (prev && prev.buyer_key_hash !== bk) await notify(e, origin, prev.buyer_key_hash, prev.email || null, { title: `You were outbid: ${l.title}`, body: `The highest bid is now ${money(amount!, cur(e))}.`, path: `/l/${l.id}` });
  })());
  return c.redirect(`/l/${l.id}#mine`);
});
app.get('/l/:id/report', async c => {
  const l = await listingById(c.env, c.req.param('id'));
  if (!l || l.status === 'draft') return c.notFound();
  return page(c, { title: 'Report' }, (
    <section class="form"><h1>Report this listing</h1><p class="muted">{l.title}</p>
      <form method="post" action={`/l/${l.id}/report`}>
        <fieldset class="checks">{['Prohibited item', 'Scam or fake', 'Offensive content', 'Other'].map((r, i) => <label class="check"><input type="radio" name="reason" value={r} required checked={i === 0} />{r}</label>)}</fieldset>
        <label>Details <small class="muted">Optional</small><textarea name="details" rows={3} maxlength={1000} /></label>
        <button class="btn wide">Send the report</button></form></section>
  ));
});
app.post('/l/:id/report', async c => {
  const l = await listingById(c.env, c.req.param('id'));
  if (!l) return c.notFound();
  if (await limited(c.env.RL, 'report:' + ip(c))) return notice(c, 'Wait a minute', 'Too many reports. Wait one minute.', 429);
  const f = await c.req.parseBody();
  await c.env.DB.prepare('INSERT INTO reports (id, listing_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?)').bind(rid(), l.id, str(f.reason, 40) || 'Other', str(f.details, 1000), Date.now()).run();
  return notice(c, 'Thank you', 'We look at each report. We remove listings that break the rules.');
});

/* ---------- storefront ---------- */
app.get('/s/:slug', async c => {
  const e = c.env, s = await e.DB.prepare('SELECT * FROM sellers WHERE slug = ?').bind(c.req.param('slug')).first<Seller>();
  if (!s) return notice(c, 'Not found', 'This shelf does not exist.', 404);
  const all = (await e.DB.prepare("SELECT * FROM listings WHERE seller_id = ? AND status IN ('active', 'reserved') ORDER BY published_at DESC").bind(s.id).all<Listing>()).results;
  const shown: { l: Listing; p: Photo | undefined; bid: Req | null }[] = [];
  for (const l of all) if ((await visible(c, l)) === 'ok') shown.push({ l, p: (await photosOf(e, l.id))[0], bid: l.mode === 'auction' ? await topBid(e, l.id) : null });
  const hidden = all.some(l => l.password_mac) && shown.length < all.length, cover = await photo(e, s.cover_key), avatar = await photo(e, s.photo_key);
  return page(c, { title: s.name, og: { title: `${s.name} on ${site(e)}`, description: s.about || `${shown.length} items`, image: abs(new URL(c.req.url).origin, cover ? purl(e, cover.key, 's') : '/og.png') } }, (
    <section class="shelf">
      {cover && <Ph e={e} p={cover} alt={`Cover photo of ${s.name}`} cls="r31" size="l" eager />}
      <div class="seller">{avatar ? <Ph e={e} p={avatar} alt="" cls="avatar" /> : <span class="avatar" aria-hidden="true">{s.name.slice(0, 1).toUpperCase()}</span>}<h1>{s.name}</h1>{s.about && <p class="about">{s.about}</p>}</div>
      <p class="muted">{shown.length === 1 ? '1 item' : `${shown.length} items`}</p>
      {shown.length ? <div class="grid2">{shown.map(({ l, p, bid }) => (
        <a class="card" href={`/l/${l.id}`}>
          {p ? <span class="ph r45" style={`--avg:${p.avg}`}><img src={purl(e, p.key, 's')} width={p.w} height={p.h} alt="" loading="lazy" decoding="async" />
            {l.mode === 'auction' && <span class="chip"><Icon n="clock" />Auction</span>}{l.status === 'reserved' && <span class="chip">Reserved</span>}
            <span class="price">{l.mode === 'auction' && bid && <small>Highest bid</small>}{money(bid?.amount_cents ?? l.price_cents, cur(e))}</span></span> : <span class="ph r45" />}
          <b>{l.title}</b><span class="muted">{l.mode === 'auction' && l.ends_at ? `Ends ${when(l.ends_at)}` : l.condition}</span>
        </a>))}</div> : <div class="notice">{raw(SCENES.emptyA)}<p>Nothing to see here now.</p></div>}
      {hidden && <form class="pw" method="post" action={`/s/${s.slug}/unlock`}><label><span><Icon n="lock" />Have a password?</span><span class="pwrow"><input name="password" required autocomplete="off" maxlength={64} placeholder="Password" /><button class="btn small">Open</button></span></label></form>}
    </section>
  ));
});
app.post('/s/:slug/unlock', async c => {
  const e = c.env, slug = c.req.param('slug'), s = await e.DB.prepare('SELECT id FROM sellers WHERE slug = ?').bind(slug).first<{ id: string }>();
  if (!s) return c.notFound();
  if (await limited(e.RL_STRICT, `pw:${ip(c)}:${s.id}`)) return notice(c, 'Wait a minute', 'Too many attempts. Wait one minute and try again.', 429);
  const mac = await pwMac(e, str((await c.req.parseBody()).password, 64));
  const hit = await e.DB.prepare("SELECT 1 FROM listings WHERE seller_id = ? AND password_mac = ? AND status IN ('active', 'reserved') LIMIT 1").bind(s.id, mac).first();
  if (!hit) return notice(c, 'Wrong password', <>No listing on this shelf has this password. <a href={`/s/${slug}`}>Back</a></>, 403);
  setCookie(c, 'pw', await signList(e.HMAC_KEY, [...new Set([...(await unlocked(c)), mac])].slice(-20)), { ...cookie, maxAge: 30 * 86400 });
  return c.redirect(`/s/${slug}`);
});

/* ---------- seller console ---------- */
const auth = async (c: C, next: () => Promise<void>) => { if (!c.get('seller')) return c.redirect('/signin?next=' + encodeURIComponent(new URL(c.req.url).pathname)); await next(); };
app.use('/console/*', auth); app.use('/console', auth); app.use('/admin/*', auth); app.use('/admin', auth);

app.get('/console', async c => {
  const e = c.env, s = c.get('seller')!;
  const rows = (await e.DB.prepare(`SELECT l.*, (SELECT COUNT(*) FROM requests r WHERE r.listing_id = l.id AND r.status = 'open') AS n,
      (SELECT key FROM photos p WHERE p.listing_id = l.id ORDER BY pos, created_at LIMIT 1) AS pkey, (SELECT avg FROM photos p WHERE p.listing_id = l.id ORDER BY pos, created_at LIMIT 1) AS pavg
    FROM listings l WHERE l.seller_id = ? AND l.status != 'removed' ORDER BY l.published_at DESC`).bind(s.id).all<Listing & { n: number; pkey: string | null; pavg: string | null }>()).results;
  const live = rows.filter(r => ['active', 'reserved', 'ended'].includes(r.status)), done = rows.filter(r => !live.includes(r));
  const Row = ({ r }: { r: (typeof rows)[number] }) => (
    <li><a class="row" href={`/console/l/${r.id}`}>{r.pkey ? <img class="tn" src={purl(e, r.pkey, 's')} alt="" style={`background:${r.pavg}`} loading="lazy" /> : <span class="tn" />}
      <span><b>{r.title}</b><span class="muted">{priceOf(e, r)}{r.mode === 'auction' ? ' start' : ''} · {statusText[r.status] || 'Active'}{r.status === 'active' && r.mode === 'auction' && r.ends_at ? ` · ends ${when(r.ends_at)}` : ''}</span></span>
      {r.n > 0 && <span class="badge">{r.n} new</span>}</a></li>
  );
  return page(c, { title: 'Your shelf' }, (
    <section class="console">
      <div class="console-h"><h1>Your shelf</h1>{s.slug && <a href={`/s/${s.slug}`}>See it as a buyer</a>}</div>
      {live.length ? <ul class="rows">{live.map(r => <Row r={r} />)}</ul>
        : <div class="notice">{raw(SCENES.emptyA)}<h2>Your shelf is empty</h2><p>Take a photo of something you want to sell.</p><p><a class="btn" href="/sell">Sell an item</a></p></div>}
      {done.length > 0 && <><h2 class="sub">Closed</h2><ul class="rows">{done.map(r => <Row r={r} />)}</ul></>}
      <div class="tools">
        <button type="button" class="btn ghost" data-push="seller" hidden><Icon n="bell" />Turn on notifications</button>
        <p class="muted" data-push-ios hidden>For notifications on iPhone, add this page to the Home Screen first.</p>
        <a class="btn ghost" href="/console/profile">Your profile</a>
        {s.slug && <button type="button" class="btn ghost" data-share={`${new URL(c.req.url).origin}/s/${s.slug}`} data-title={s.name}><Icon n="share" />Share your shelf</button>}
        <form method="post" action="/signout"><button class="link">Sign out</button></form>
      </div>
    </section>
  ));
});

app.get('/console/l/:id', async c => {
  const e = c.env, s = c.get('seller')!, l = await listingById(e, c.req.param('id'));
  if (!l || l.seller_id !== s.id) return notice(c, 'Not found', 'This listing is not on your shelf.', 404);
  const reqs = (await e.DB.prepare("SELECT * FROM requests WHERE listing_id = ? AND status != 'removed' ORDER BY CASE kind WHEN 'bid' THEN -amount_cents ELSE created_at END").bind(l.id).all<Req>()).results;
  const acc = reqs.find(r => r.status === 'accepted'), canPick = !acc && ['active', 'ended'].includes(l.status);
  const Act = ({ a, r, label, ghost }: { a: string; r?: string; label: string; ghost?: boolean }) => <form method="post" action={`/console/l/${l.id}/${a}`}>{r && <input type="hidden" name="r" value={r} />}<button class={ghost ? 'btn small ghost' : 'btn small'}>{label}</button></form>;
  return page(c, { title: l.title }, (
    <section class="console">
      <p><a class="back" href="/console"><Icon n="back" />Your shelf</a></p>
      <h1>{l.title}</h1>
      <p class="meta"><span>{l.mode === 'auction' ? `Auction, start ${priceOf(e, l)}` : priceOf(e, l)}</span><span>{statusText[l.status] || 'Active'}</span>
        {l.area_label && <span><Icon n="globe" />{l.area_label}</span>}{l.password_mac && <span><Icon n="lock" />Password</span>}</p>
      <p class="acts"><a class="btn small ghost" href={`/l/${l.id}`}>Open the page</a><button type="button" class="btn small ghost" data-share={`${new URL(c.req.url).origin}/l/${l.id}`} data-title={l.title}><Icon n="share" />Share</button></p>
      {acc && <div class="accepted"><h2>You accepted {acc.name}</h2><p>Contact: <b>{acc.contact || 'not given. The buyer sees your contact on the listing page.'}</b></p>
        <div class="acts"><Act a="sold" label="Mark sold" />{(acc.decided_at ?? 0) < Date.now() - DAY && <Act a="release" r={acc.id} label="Choose another buyer" ghost />}</div>
        {(acc.decided_at ?? 0) >= Date.now() - DAY && <p class="muted">If the buyer does not answer, you can choose another buyer after 24 hours.</p>}</div>}
      <h2 class="sub">{l.mode === 'auction' ? 'Bids' : 'Requests'}</h2>
      {reqs.length ? <ul class="reqs">{reqs.map(r => (
        <li class={r.status}><div><b>{r.name}</b> · {r.kind === 'want' ? 'wants it' : `${r.kind === 'bid' ? 'bids' : 'offers'} ${money(r.amount_cents, cur(e))}`}<span class="muted"> · {ago(r.created_at)}{r.status === 'declined' ? ' · not accepted' : ''}</span></div>
          {r.note && <p class="note">{r.note}</p>}
          {r.status === 'open' && <div class="acts">{canPick && <Act a="accept" r={r.id} label="Accept" />}{l.mode === 'fixed' && <Act a="decline" r={r.id} label="Decline" ghost />}{r.kind === 'bid' && <Act a="remove" r={r.id} label="Remove bid" ghost />}</div>}
        </li>))}</ul> : <p class="muted">No {l.mode === 'auction' ? 'bids' : 'requests'} yet. Share the link to find a buyer.</p>}
      <div class="tools">
        {l.status === 'active' && <Act a="close" label="Close the listing" ghost />}
        {l.status === 'expired' && <Act a="renew" label="Renew for 30 days" />}
      </div>
    </section>
  ));
});
app.post('/console/l/:id/:act{accept|decline|remove|release|sold|close|renew}', async c => {
  const e = c.env, s = c.get('seller')!, l = await listingById(e, c.req.param('id')), act = c.req.param('act'), origin = new URL(c.req.url).origin, t = Date.now();
  if (!l || l.seller_id !== s.id) return c.notFound();
  const rId = str((await c.req.parseBody()).r, 40);
  const r = rId ? await e.DB.prepare('SELECT * FROM requests WHERE id = ? AND listing_id = ?').bind(rId, l.id).first<Req>() : null;
  const tell = (q: Req, title: string, body: string) => later(c, notify(e, origin, q.buyer_key_hash, q.email || null, { title, body, path: `/l/${l.id}` }));
  if (act === 'accept' && r?.status === 'open' && ['active', 'ended'].includes(l.status)) {
    await e.DB.batch([e.DB.prepare("UPDATE requests SET status = 'accepted', decided_at = ? WHERE id = ?").bind(t, r.id), e.DB.prepare("UPDATE listings SET status = 'reserved' WHERE id = ?").bind(l.id)]);
    tell(r, `${s.name} accepted your request`, `${l.title}: open the link to see the contact.`);
  } else if (act === 'decline' && r?.status === 'open') {
    await e.DB.prepare("UPDATE requests SET status = 'declined', decided_at = ? WHERE id = ?").bind(t, r.id).run();
    tell(r, `Not accepted: ${l.title}`, 'The seller chose another buyer.');
  } else if (act === 'remove' && r?.status === 'open') {
    await e.DB.prepare("UPDATE requests SET status = 'removed', decided_at = ? WHERE id = ?").bind(t, r.id).run();
  } else if (act === 'release' && r?.status === 'accepted' && (r.decided_at ?? 0) < t - DAY) {
    await e.DB.batch([e.DB.prepare("UPDATE requests SET status = 'declined', decided_at = ? WHERE id = ?").bind(t, r.id),
      e.DB.prepare('UPDATE listings SET status = ? WHERE id = ?').bind(l.mode === 'auction' && (l.ends_at ?? 0) <= t ? 'ended' : 'active', l.id)]);
    tell(r, `Not accepted any more: ${l.title}`, 'The seller did not get an answer and chose another buyer.');
  } else if (act === 'sold' && l.status === 'reserved') {
    const others = (await e.DB.prepare("SELECT * FROM requests WHERE listing_id = ? AND status = 'open'").bind(l.id).all<Req>()).results;
    await e.DB.batch([e.DB.prepare("UPDATE listings SET status = 'sold', closed_at = ? WHERE id = ?").bind(t, l.id), e.DB.prepare("UPDATE requests SET status = 'declined', decided_at = ? WHERE listing_id = ? AND status = 'open'").bind(t, l.id)]);
    for (const q of others) tell(q, `Sold: ${l.title}`, 'The item went to another buyer.');
  } else if (act === 'close' && l.status === 'active') {
    await e.DB.prepare("UPDATE listings SET status = 'closed', closed_at = ? WHERE id = ?").bind(t, l.id).run();
  } else if (act === 'renew' && l.status === 'expired') {
    await e.DB.prepare("UPDATE listings SET status = 'active', expires_at = ?, closed_at = NULL WHERE id = ?").bind(t + 30 * DAY, l.id).run();
  }
  return c.redirect(`/console/l/${l.id}`);
});

const Profile = ({ c, s, next, err }: { c: C; s: Seller; next: string; err: string[] }) => (
  <section class="form"><h1>Your profile</h1><p class="muted">Buyers see your name and your shelf. They see your contact only after you accept them.</p><Err list={err} />
    <form method="post" action="/console/profile"><input type="hidden" name="next" value={next} />
      <label>Name<input name="name" value={s.name} required maxlength={40} autocomplete="name" /></label>
      <label>Contact for accepted buyers<input name="contact" value={s.contact} required maxlength={120} placeholder="Phone, email or Telegram" /></label>
      <label>About your shelf <small class="muted">Optional</small><textarea name="about" rows={2} maxlength={300}>{s.about}</textarea></label>
      <div class="two"><label class="slot wide" data-target="photo"><Icon n="cam" /><span>{s.photo_key ? 'Change your photo' : 'Your photo (optional)'}</span><input type="file" accept="image/*" data-file class="sr" /></label>
        <label class="slot wide" data-target="cover"><Icon n="cam" /><span>{s.cover_key ? 'Change the cover image' : 'Cover image (optional)'}</span><input type="file" accept="image/*" data-file class="sr" /></label></div>
      <p class="muted" data-photo-msg aria-live="polite"></p>
      <button class="btn wide">Save</button></form></section>
);
app.get('/console/profile', c => page(c, { title: 'Your profile' }, <Profile c={c} s={c.get('seller')!} next={nextPath(c.req.query('next'))} err={[]} />));
app.post('/console/profile', async c => {
  const s = c.get('seller')!, f = await c.req.parseBody(), name = str(f.name, 40), contact = str(f.contact, 120), next = nextPath(f.next);
  if (!name || !contact) return page(c, { title: 'Your profile' }, <Profile c={c} s={{ ...s, name, contact }} next={next} err={['Write your name and a contact.']} />);
  const slug = s.slug || `${name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'shelf'}-${rid(2)}`;
  await c.env.DB.prepare('UPDATE sellers SET name = ?, contact = ?, about = ?, slug = ? WHERE id = ?').bind(name, contact, str(f.about, 300), slug, s.id).run();
  return c.redirect(next);
});

/* ---------- push subscriptions ---------- */
app.post('/api/push', async c => {
  const b = await c.req.json<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>().catch(() => ({} as never));
  const who = c.req.query('for') === 'seller' ? c.get('seller')?.id : await buyerKey(c);
  if (!who || !/^https:\/\//.test(b.endpoint || '') || !b.keys?.p256dh || !b.keys?.auth || (b.endpoint || '').length > 1000) return c.json({ error: 'Bad subscription' }, 400);
  if (await limited(c.env.RL, 'push:' + ip(c))) return c.json({}, 429);
  await c.env.DB.prepare('INSERT OR REPLACE INTO push_subs (endpoint, owner, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)').bind(b.endpoint, who, b.keys.p256dh.slice(0, 200), b.keys.auth.slice(0, 50), Date.now()).run();
  return c.json({ ok: true });
});

/* ---------- admin: reports ---------- */
const isAdmin = (c: C) => (c.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(x => x.trim()).includes(c.get('seller')!.email);
app.get('/admin', async c => {
  if (!isAdmin(c)) return notice(c, 'Not allowed', 'This page is for administrators.', 403);
  const rows = (await c.env.DB.prepare("SELECT r.*, l.title, l.status AS lstatus FROM reports r JOIN listings l ON l.id = r.listing_id WHERE r.status = 'open' ORDER BY r.created_at").all<{ id: string; listing_id: string; reason: string; details: string; created_at: number; title: string; lstatus: string }>()).results;
  return page(c, { title: 'Reports' }, (
    <section class="console"><h1>Open reports</h1>
      {rows.length ? <ul class="reqs">{rows.map(r => <li><div><b>{r.reason}</b> · <a href={`/l/${r.listing_id}`}>{r.title}</a><span class="muted"> · {ago(r.created_at)} · {r.lstatus}</span></div>{r.details && <p class="note">{r.details}</p>}
        <form method="post" action={`/admin/r/${r.id}`} class="acts"><input name="why" maxlength={500} placeholder="Reason told to the seller" aria-label="Reason told to the seller" /><button class="btn small" name="act" value="remove">Remove listing</button><button class="btn small ghost" name="act" value="dismiss">Keep</button></form></li>)}</ul>
        : <p class="muted">No open reports.</p>}
    </section>
  ));
});
app.post('/admin/r/:id', async c => {
  if (!isAdmin(c)) return c.text('Forbidden', 403);
  const e = c.env, f = await c.req.parseBody(), r = await e.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(c.req.param('id')).first<{ listing_id: string; reason: string }>();
  if (!r) return c.notFound();
  if (f.act === 'remove') {
    const why = str(f.why, 500) || r.reason, l = await listingById(e, r.listing_id);
    await e.DB.batch([e.DB.prepare("UPDATE listings SET status = 'removed', removed_reason = ?, closed_at = ? WHERE id = ?").bind(why, Date.now(), r.listing_id),
      e.DB.prepare("UPDATE reports SET status = 'done' WHERE listing_id = ?").bind(r.listing_id)]);
    const s = l?.seller_id ? await e.DB.prepare('SELECT email FROM sellers WHERE id = ?').bind(l.seller_id).first<{ email: string }>() : null;
    // Digital Services Act: the seller gets a statement of reasons for each removal
    if (s) later(c, sendEmail(e, s.email, `Your listing was removed: ${l!.title}`, `We removed your listing "${l!.title}".\n\nReason: ${why}\n\nIf you think this is wrong, answer to ${e.CONTACT_EMAIL || 'the site contact'}.`));
  } else await e.DB.prepare("UPDATE reports SET status = 'done' WHERE id = ?").bind(c.req.param('id')).run();
  return c.redirect('/admin');
});

/* ---------- scheduled job: every 5 minutes ---------- */
async function scheduled(e: E, origin: string) {
  const t = Date.now(), db = e.DB;
  // auctions that ended: tell the seller
  const ended = (await db.prepare("SELECT l.*, s.email FROM listings l JOIN sellers s ON s.id = l.seller_id WHERE l.mode = 'auction' AND l.status = 'active' AND l.ends_at <= ?").bind(t).all<Listing & { email: string }>()).results;
  for (const l of ended) {
    await db.prepare("UPDATE listings SET status = 'ended' WHERE id = ? AND status = 'active'").bind(l.id).run();
    const n = (await db.prepare("SELECT COUNT(*) AS n FROM requests WHERE listing_id = ? AND kind = 'bid' AND status = 'open'").bind(l.id).first<{ n: number }>())?.n ?? 0;
    await notify(e, origin, l.seller_id, l.email, { title: `Auction ended: ${l.title}`, body: n ? `${n} bids. Choose the buyer.` : 'No bids.', path: `/console/l/${l.id}` });
  }
  await db.batch([
    db.prepare("UPDATE listings SET status = 'expired', closed_at = ? WHERE mode = 'fixed' AND status = 'active' AND expires_at <= ?").bind(t, t),
    db.prepare('DELETE FROM login_codes WHERE expires_at < ?').bind(t),
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(t)
  ]);
  // drafts after 24 hours, and closed listings after 30 days: delete the photos, the buyer data and the listing
  const old = (await db.prepare("SELECT id, og_key FROM listings WHERE (status = 'draft' AND created_at < ?) OR (status IN ('sold', 'closed', 'expired', 'removed') AND closed_at < ?) LIMIT 50").bind(t - DAY, t - 30 * DAY).all<{ id: string; og_key: string | null }>()).results;
  for (const l of old) {
    await deletePhotos(e, (await photosOf(e, l.id)).map(p => p.key));
    if (l.og_key) await e.PHOTOS.delete(`${l.og_key}/og`);
    await db.batch([db.prepare('DELETE FROM requests WHERE listing_id = ?').bind(l.id), db.prepare('DELETE FROM reports WHERE listing_id = ?').bind(l.id), db.prepare('DELETE FROM listings WHERE id = ?').bind(l.id)]);
  }
}

app.notFound(c => notice(c, 'Not found', 'This page does not exist.', 404));
app.onError((err, c) => { console.error(err); return notice(c, 'Something went wrong', 'Try again in a moment. Your data is safe.', 500); });

export default {
  fetch: app.fetch,
  // the Cron run has no request, so the links in its messages use SITE_URL
  scheduled: (_: ScheduledController, e: E, ctx: ExecutionContext) => ctx.waitUntil(scheduled(e, e.SITE_URL || ''))
} satisfies ExportedHandler<E>;
