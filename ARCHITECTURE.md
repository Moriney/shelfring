# Shelfring architecture

Iteration 1 of the architecture brainstorm (2026-11-06), updated with the design decisions and the first implementation on the `mvp-init` branch. This file records the v1 decisions, the user journeys, the value proposition, the technical architecture, the deployment and the open points. Features that the brainstorm moved out of v1 are in [TODO.md](TODO.md).

Shelfring is open source under the AGPL-3.0-only ([LICENSE](LICENSE)). The repository holds no personal data and no instance settings. Each deployment gets its account, resources, domain, settings and secrets from outside the repository (section 5.2).

The Cloudflare and competitor facts come from checks on 2026-11-06. Prices and limits change. Check them again before setup.

## 1. Decisions for v1

| Topic | Decision |
|---|---|
| Market | First deployment: Helsinki area, Finland. EU law applies. The code contains no Helsinki-specific values (see 5.2). |
| Language | English only. |
| Client | Mobile-first web app, installable (PWA). No native apps. |
| Payment | Direct between buyer and seller. Shelfring handles no money. |
| Price modes | Fixed price (buyers can make an offer), or auction with non-binding bids. In an auction, the seller selects the buyer. |
| Audience of a listing | Two optional filters: area (named cities or regions) and password. If both are set, both must pass. No filter means public. |
| Area check | Soft filter. It uses the IP location that Cloudflare adds to each request. It is not a security boundary. |
| Visitor outside the area | Sees the message "This listing is not available in your area." |
| Discovery | Shared links only: a listing link or a storefront link. |
| Buyer | No account. The name is mandatory. Contact method, contact and a note are optional. |
| Seller | Signs in with a 6-digit email code to use the seller console. |
| Agreement | The buyer sends "I want it", an offer or a bid. The seller accepts one buyer. Then each one sees the contact of the other. |
| Auction display | The page shows only the highest bid, if one exists. Only the seller sees the bidders, the amounts and the contacts. Bids show on page load. An outbid bidder gets a notification. |
| Fake bids | v1 trusts bidders: no contact required, no bot check. The seller can remove any bid. |
| Storefront | One simple seller page per seller: name, photo, short text, cover image, grid of active listings. It has no rules of its own. Each listing keeps its own filters. |
| Listing speed | Target: under 60 seconds from "Sell" to published. |
| AI | Text-only draft from the photos: title, category, condition, description. |
| Notifications | Web push and email. |
| Moderation | Report button and an admin page. |
| Providers | Best tool for each part, at the lowest cost. |
| Hosting | Cloudflare. Each operator uses an own Cloudflare account and domain. The repository holds no instance values (see 5.2). |
| License | AGPL-3.0-only (see LICENSE). |
| Design | Direction B "Neighbourhood Sketchbook": one pen line, one yellow highlighter, dot-grid paper (section 8). |
| Themes | Paper (light) and chalkboard (dark) in v1. The device setting selects the theme. |
| Motion | Calm: a drawing draws itself once; feedback only. No motion with `prefers-reduced-motion`. |
| Voice | Plain English, short sentences. |
| Illustrations | Objects only: no people, no hands, no faces. |
| Logo | A ring drawn around a shelf with one mug, plus the site name in text. The symbol alone is the app icon. |
| Seller photos | Shown as they are, never filtered. Shelf cards use a 4:5 crop. The link preview image is composed in the seller's browser at publish (section 4.3). |

## 2. Value proposition

> Publish a used item in under one minute. For each listing, decide who can see it: everybody, people in selected cities or regions, or only people who know the password. Buyers need no account.

Comparison with the channels that people in the Helsinki area use today. † = not confirmed in the competitor check.

| | Shelfring v1 | Tori.fi | Facebook (Marketplace and kirpputori groups) | Huuto.net |
|---|---|---|---|---|
| Audience per listing | Public, area, password | Public | Marketplace is public. A group post is a separate copy. Hidden groups exist. | Public |
| Account needed to buy | No (name only) | Yes† | Yes (Meta account) | Yes† |
| AI listing help | Text draft from photos | Category and attribute suggestions† | Photo to title, text and price (2026; availability in Finland †) | None found |
| Auctions | Non-binding bids | No† | Informal, in comments† | Yes |
| Payment | Direct | Direct, or ToriDiili escrow (buyer pays a fee) | Direct. Checkout only for shipped items. | Direct, or Huuto Turva escrow (buyer pays a fee) |
| Seller fee | None | Free for private sellers. Paid boosts. | Free for local sales | Free for private sellers up to 50 sales per year |

Findings:

1. AI listing help is not a unique value. eBay, Facebook Marketplace, Kleinanzeigen, Leboncoin, Marktplaats, Depop, Nextdoor and the Finnish app Bought have it. Speed must come from the whole flow: few steps, upload during the AI draft, a prefilled audience. AI alone is not enough.
2. The check found no product in Finland with a per-listing area limit or a listing password. This is the main gap.
3. Buying without an account is a second difference. It also brings a risk: spam and fake requests (see section 6).
4. The area filter is soft. The product text must say "for people nearby", not "only people nearby". The password is the only real access control.

## 3. User journeys (nominal)

### 3.1 Seller: first listing

| Step | Action | Time budget |
|---|---|---|
| 1 | Tap "Sell". | 2 s |
| 2 | Take or select 1–5 photos. The browser resizes them and uploads them in the background. | 15 s |
| 3 | The AI draft fills title, category, condition and description. The seller corrects it. | 5 s + 15 s |
| 4 | Set the price: fixed, or auction (start price, end time). | 10 s |
| 5 | Set the audience: public, area, password. The default is the audience of the previous listing. | 5 s |
| 6 | Publish. First time only: enter the email, then the 6-digit code. | 5 s (+ about 30 s one time) |
| 7 | Share with the phone's share sheet (WhatsApp, Telegram, email, copy link). | 3 s |

The email code comes at step 6, not at step 1. The seller sees the result before the only barrier.

### 3.2 Buyer: fixed price

1. The buyer opens a shared link.
2. If the listing has a password, the buyer enters it. The browser remembers it for 30 days.
3. If the listing has an area and the IP location is outside it, the buyer sees "not available in your area". The journey stops.
4. The buyer sees the photos, text, price and the seller's display name.
5. The buyer taps "I want it" or "Make an offer".
6. Form: name (mandatory). Optional: contact method, contact, note, email (for email notifications), "Notify me" (web push permission).
7. Confirmation: "The seller sees your request. Open this link again to see the answer."

### 3.3 Seller: accept

1. The seller gets a push or an email: "New request for <title>".
2. The seller opens the console, compares the requests and taps "Accept" on one.
3. The buyer gets a push or an email, if available, and sees the seller's contact on the listing page. The seller sees the buyer's contact, if the buyer gave one.
4. They meet or arrange shipping. The seller taps "Mark sold".

### 3.4 Auction

1. The page shows the end time and "Highest bid: €X" or "No bids yet".
2. A bid must be at least the start price and at least €1 more than the highest bid.
3. The previous highest bidder gets an "outbid" notification.
4. At the end time, the seller gets a notification with all bids and selects one buyer. An auction without an end date runs until the seller ends it. Then 3.3 applies. The seller does not have to select the highest bid.

### 3.5 Storefront

`<domain>/s/<seller>` shows the seller's name, short text, cover image and the active listings that this visitor may see. If the seller has password listings, a "Have a password?" field unlocks the matching listings.

## 4. Technical architecture

### 4.1 Components

```
Browser (PWA: pages, app.js, sw.js)
  │ HTTPS                               │ photo URLs
  ▼                                     ▼
Worker (TypeScript, Hono)          img.<domain>  (R2 public domain, CDN cache)
  ├──► D1  (SQLite, EU jurisdiction)
  ├──► R2  (photos, EU jurisdiction)
  ├──► Workers AI  (vision model, AI draft)
  ├──► Email provider API  (sign-in codes, notifications)
  └──► Browser push services  (Google, Apple, Mozilla)  ──► browsers
Cron Trigger (every 5 min) ──► Worker  (auction end, expiry, deletion)
```

| Part | Choice | Reason |
|---|---|---|
| Code | One Cloudflare Worker in TypeScript with Hono JSX. Wrangler bundles it; no other build step. | Server-rendered HTML gives fast pages and correct link previews. Hono escapes output by default, which prevents XSS without manual escaping. |
| Client scripts | `app.js` (plain JavaScript) and `sw.js` (service worker) | Photo input, resize and upload, AI draft call, share sheet, push subscription. No framework. |
| Database | D1 (SQLite), EU jurisdiction | Free tier: 500 MB per database, 5M rows read and 100k rows written per day. One primary database runs each statement atomically. |
| Photos | R2 bucket, EU jurisdiction, public custom domain for reads | No egress fees. The CDN caches photos. No image-transformation cost, because the browser makes the sizes. |
| AI draft | Workers AI vision model | Free 10,000 neurons per day on all plans. No extra account. |
| Email | A third-party free tier in v1: the Resend API | Cloudflare Email Sending is not available on Workers Free. |
| Push | Web Push (RFC 8030, 8291, 8292) with Web Crypto in the Worker | Delivery is free. No library is necessary. |
| Rate limits | Workers Rate Limiting binding | Protects the forms that need no login. |
| Scheduled work | One Cron Trigger, every 5 minutes | Auction end, listing expiry, data deletion. |
| Logs, analytics | Workers Logs, Cloudflare Web Analytics (no cookies) | Free. |

Repository layout:

```
src/index.tsx       routes, pages, forms, notifications, scheduled job
src/util.ts         ids, MACs, area check, photo check, money, AI draft parsing
src/push.ts         Web Push encryption (RFC 8291) and VAPID (RFC 8292)
src/art.ts          exported drawings: empty-state scenes, logo
public/             app.js, sw.js, style.css, icons.svg, fonts, app icons, og.png
migrations/         D1 SQL files
scripts/dev.mjs     local development (npm run dev)
scripts/deploy.mjs  adds the instance values from environment variables, then deploys (see 5.2)
test/check.ts       one runnable check (npm run check)
wrangler.json       generic: binding names only; no account, resource ids, routes or settings
LICENSE             AGPL-3.0
```

### 4.2 Data model (D1)

| Table | Main columns | Note |
|---|---|---|
| `sellers` | id, email, name, slug, about, cover_key, contact, last_audience | The storefront is part of this row. |
| `login_codes` | email, code_mac, expires_at, attempts | 6 digits, 10 minutes, max 5 attempts. |
| `sessions` | token_hash, seller_id, expires_at | 30 days. D1 stores only the hash. |
| `listings` | id, seller_id, draft_key_hash, title, category, condition, description, mode, price_cents, duration_days, ends_at, area, area_label, password_mac, status, og_key, expires_at, closed_at | `area` is a JSON list, for example `["region:FI-18","city:FI/espoo"]`. `status`: draft, active, reserved, ended, expired, sold, closed, removed. |
| `photos` | key, listing_id, seller_id, pos, w, h, avg | `key` is a random 128-bit name in R2. `w`, `h` and the average colour `avg` give stable layout and a placeholder. |
| `requests` | id, listing_id, kind, amount_cents, name, contact, note, email, buyer_key_hash, status, decided_at | `kind` is `want`, `offer` or `bid`. One free-text contact field. |
| `push_subs` | endpoint, owner, p256dh, auth | `owner` is a seller id or a buyer key hash. |
| `reports` | id, listing_id, reason, details, status | For the admin page. |

All ids are random 128-bit values, so nobody can guess a listing URL.

### 4.3 Mechanisms

**Visibility check (each listing view):**

```ts
// Known constraint: IP location is an estimate; Cloudflare states no accuracy.
// Ceiling: VPN, mobile and company networks can place a visitor in the wrong city.
// Upgrade path: "Use my location" fallback (TODO.md).
const inArea = (cf, area) => area.some((a) =>
  a === `country:${cf?.country}` ||
  a === `region:${cf?.country}-${cf?.regionCode}` ||
  a === `city:${cf?.country}/${cityKey(cf?.city)}`);

const visible =
  (listing.area.length === 0 || inArea(request.cf, listing.area)) &&
  (listing.password_id === null || unlocked(cookies).has(listing.password_id));
```

Sellers always see their own listings. The area picker shows the choices from the instance setting `AREA_PRESETS` (example in 5.2). The code contains no country, region or city names.

**Password:** stored on the listing as HMAC-SHA256(server key, password), truncated to 128 bits. Listings of a seller with the same password unlock together, which the storefront field uses. After a correct entry, a signed cookie holds the unlocked MAC values for 30 days. Rate limit: 5 attempts per 60 s per IP address and listing; the binding allows only 10 s or 60 s periods. Minimum length: 6 characters. The seller cannot read a password again but can set a new one.
Known constraint: this is a keyed hash, not a slow hash, because Workers Free allows 10 ms CPU per request. Ceiling: if the server key and the database leak together, weak passwords can be guessed offline. Upgrade path: PBKDF2 with a high iteration count on Workers Paid.

**Photo upload:** the browser draws each photo on a canvas, scales it to 1600 px and 800 px (long edge) and encodes it as WebP, or as JPEG if the browser cannot encode WebP, about 200 KB at 1600 px. A card on a 3× phone needs about 510 × 640 px, so 400 px was too small. The browser also measures the average colour. Re-encoding removes the EXIF data, including the GPS position. The Worker checks the type, the size (max 2 MB) and that no EXIF block is present. Then it writes the photo to R2 under a random key. The upload runs while the AI draft runs.

**Link preview image:** at publish, the seller's browser draws a 1200 × 630 JPEG: the whole first photo on paper, a frame, the price and the site name. Chat apps crop `og:image` to about 1.91:1 or 1:1, so a tall photo would lose its top and bottom. The image is one more R2 object (about 120 KB). Password listings, and listings that the visitor may not see, get the fixed `og.png`.
Known constraint: chat apps cache previews, so a later price change does not reach old previews.
Known constraint: anybody who has a photo URL can open the photo. Shelfring shows photo URLs only after the visibility check, so a URL gives no more than a screenshot. Old URLs keep working after an audience change. Upgrade path: copy the photos to new keys when the audience changes.

**Draft before sign-in:** a draft belongs to a random draft key in a cookie until the seller signs in at "Publish". The Cron run deletes unpublished drafts and their photos after 24 hours. Uploads and AI draft calls have a rate limit per IP address.

**AI draft:** the Worker sends up to 3 photos and a fixed category list to the model. The model returns JSON: title, category, condition, description. The timeout is 8 s. If the call fails, the form stays empty and the seller can still publish.

- Cost estimate, with the assumption of about 1,500 input tokens and 300 output tokens: about $0.0002 per draft with `@cf/google/gemma-4-26b-a4b-it` ($0.10 / $0.30 per million tokens), about $0.0007 with `@cf/meta/llama-4-scout-17b-16e-instruct` ($0.27 / $0.85). The free 10,000 neurons per day ($0.11) cover about 170–450 drafts per day. The number of tokens per image differs between models.
- Model selection: test 20 real listing photos with 3 candidate models and compare quality, time and cost. Workers AI retires models (several on 2026-11-15), so the model id is the instance setting `AI_MODEL`.

**Auction bid:** one conditional statement. D1 runs it atomically, so two parallel bids cannot both pass the check.

```sql
INSERT INTO requests (id, listing_id, kind, amount_cents, name, contact_kind, contact, note, email, buyer_key_hash, status, created_at)
SELECT ?1, ?2, 'bid', ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'open', ?10
WHERE EXISTS (SELECT 1 FROM listings WHERE id = ?2 AND mode = 'auction' AND status = 'active'
                AND ends_at > ?10 AND ?3 >= price_cents)
  AND ?3 >= COALESCE((SELECT MAX(amount_cents) + 100 FROM requests
                      WHERE listing_id = ?2 AND kind = 'bid' AND status = 'open'), 0);
-- meta.changes = 0: the bid is too low or the auction has ended.
```

**Buyer without account:** on the first request, the Worker sets a random buyer key in an HttpOnly cookie (1 year) and stores its hash with the request. The listing page shows this buyer's requests and their status. The push subscription uses the same key.
Known constraint: the status is visible only in the same browser. A buyer who gives no contact, no email and no push permission cannot be reached until the buyer opens the link again.

**Seller sign-in:** a 6-digit code by email, valid for 10 minutes, max 5 attempts, stored as an HMAC. Rate limits per email and per IP address also protect the email quota. The session is a random 256-bit token in an HttpOnly, Secure, SameSite=Lax cookie for 30 days. D1 stores only its hash. The admin page uses the same sign-in plus an `ADMIN_EMAILS` secret.

**Notifications:**

| Event | To |
|---|---|
| New request, offer or bid | Seller |
| Auction ended | Seller |
| Request accepted or declined | Buyer |
| Outbid | Previous highest bidder |

Each event goes to web push (if subscribed) and to email (if an address is known). The Worker encrypts the push payload (ECDH P-256, HKDF, AES-128-GCM; RFC 8291) and signs it with VAPID (ECDSA P-256; RFC 8292), all with Web Crypto. Events from a request are sent in that request; the Cron run sends the "auction ended" events.
Known constraint: each notification uses CPU time for the crypto. Ceiling: Workers Free allows 10 ms CPU per request. Upgrade path: if the measured CPU time is too high, send through a Queue (available on Workers Free).

### 4.4 Calibration before launch

- **IP location:** call a test page from at least 10 networks in the Helsinki area: mobile (Elisa, Telia, DNA), home broadband, office and university networks, and a VPN. Record `country`, `regionCode`, `region` and `city`. Build the city list and the name aliases from the real values, not from official names. The result goes into the instance setting `AREA_PRESETS`, not into the code. After launch, log only the count of failed area checks per listing, not the IP addresses.
- **AI model:** 20 real photos, 3 candidate models (see 4.3).
- **Speed:** measure the 60-second journey on a mid-range Android phone on a 4G network.

### 4.5 Security and privacy (v1)

- Random 128-bit ids for listings, photos, passwords, drafts and buyer keys.
- Cookies are HttpOnly, Secure and SameSite=Lax. Each POST must have a matching `Origin` header (CSRF protection).
- A Content Security Policy allows scripts only from the Shelfring domain.
- Each console query filters by the signed-in seller id, so no seller can read the data of another seller.
- Rate limits on all forms without login. A script could otherwise use the free D1 write quota (100k rows per day) in minutes and stop the service.
- No IP addresses are stored. Buyer data is deleted 30 days after the listing closes (default, see section 7).
- Link previews: the Open Graph tags (title, price, first photo) are part of the page and follow the same visibility check. Some chat apps build the preview on the sender's phone (for example Signal and iMessage; WhatsApp is reported to do the same, not verified here). A local seller then gets a full preview for an area listing. Others (for example Telegram and Slack) fetch the page from their own servers and get a generic preview for an area listing. Password listings always get a generic preview.

## 5. Deployment

### 5.1 Can Cloudflare do it out of the box?

Mostly yes. Cloudflare plus one email provider covers v1.

| Need | On Cloudflare? | v1 solution |
|---|---|---|
| Hosting, code, TLS, CDN, DNS | Yes | Worker with a custom domain |
| Database | Yes | D1, EU jurisdiction |
| Photo storage and delivery | Yes | R2, EU jurisdiction, public custom domain |
| Image resizing | Yes (Images), but not necessary | In the browser, $0 |
| AI draft | Yes | Workers AI |
| Visitor location | Yes, on all plans | `request.cf` |
| Rate limits, bot check | Yes | Rate Limiting binding. Turnstile (free) later, if necessary. |
| Scheduled jobs | Yes | Cron Trigger |
| Logs, analytics | Yes | Workers Logs, Web Analytics |
| Email sending | Only on Workers Paid (open beta) | Third-party free tier on Workers Free |
| Sign-in for public users | No product | Own email-code sign-in, about 100 lines |
| Push delivery | Not necessary | Browser push services (free) |
| Payments, SMS, maps | No | Not necessary in v1 |

The per-listing area rules cannot go in the Cloudflare WAF. A zone allows 5 custom rules on Free (20 Pro, 100 Business, 1,000 Enterprise), and the WAF has no access to listing data. The Worker applies the rules from the database.

### 5.2 Instance configuration and setup

The repository holds the code and a generic `wrangler.json`: binding names, `keep_vars: true`, `secrets.required` and the Cron schedule. It has no account id, no resource ids, no routes and no settings. An operator gives the instance values from outside the repository:

| Value | Source | Mechanism |
|---|---|---|
| Cloudflare account | `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the shell or CI, or `wrangler login` | Wrangler reads these environment variables. |
| D1 database, R2 bucket | `D1_DATABASE_ID`, `R2_BUCKET_NAME`, `R2_JURISDICTION` in the shell or CI | `scripts/deploy.mjs` writes them into `wrangler.deploy.json`, which git ignores. Without them, Wrangler creates the resources on the first deploy (automatic provisioning). |
| Domain | `CUSTOM_DOMAIN` in the shell or CI | The script adds it as a route with `custom_domain: true`. Without it, the Worker runs on its `workers.dev` address. |
| Settings | Variables in the Cloudflare dashboard (table below) | `keep_vars: true` keeps dashboard variables on each deploy. |
| Secrets | `wrangler secret put` or the dashboard | A deploy fails if a secret in `secrets.required` is missing. |
| Email DNS records | The operator's DNS zone | Records from the email provider. |

Settings and secrets of an instance:

| Name | Kind | Example for the first deployment |
|---|---|---|
| `SITE_NAME` | variable | `Shelfring` |
| `CURRENCY` | variable | `EUR` |
| `AREA_PRESETS` | variable (JSON) | `{"Helsinki capital region":["city:FI/helsinki","city:FI/espoo","city:FI/vantaa","city:FI/kauniainen"],"Uusimaa":["region:FI-18"],"Finland":["country:FI"]}` |
| `AI_MODEL` | variable | a Workers AI vision model id (see 4.3) |
| `SITE_URL` | variable | the public address, for example `https://<domain>`; the Cron run uses it for links in its messages |
| `PHOTO_ORIGIN` | variable | the R2 custom domain, for example `https://img.<domain>` |
| `EMAIL_FROM` | variable | a sender address on the operator's domain |
| `CONTACT_EMAIL` | variable | the point of contact that the Digital Services Act requires |
| `TERMS_URL`, `PRIVACY_URL` | variable | the operator's terms of use and privacy notice |
| `SOURCE_URL` | variable | the source code of the running version (section 6, item 11) |
| `VAPID_PUBLIC_KEY` | variable | the public key for web push |
| `HMAC_KEY`, `VAPID_PRIVATE_KEY`, `EMAIL_API_KEY`, `ADMIN_EMAILS` | secret | — |

Setup steps for an operator:

1. Fork or clone the repository. No file changes are necessary.
2. Optional, for EU data location: create the D1 database and the R2 bucket with the EU jurisdiction. The jurisdiction can only be set at creation. R2 probably needs a payment method on file, also inside the free tier (check at setup).
3. Connect the R2 bucket to a custom domain and set `PHOTO_ORIGIN`.
4. Create an account at Resend (v1 uses its API; free-tier quota not verified yet). The sender domain must be verified there. Add its SPF, DKIM and DMARC records in DNS.
5. Set the variables and secrets from the table. `node scripts/dev.mjs keys` prints a new `HMAC_KEY` and a VAPID key pair.
6. Deploy: run `node scripts/deploy.mjs` locally, or set it as the deploy command in Workers Builds (Cloudflare's Git integration) and keep the environment values there as build variables. With resource ids, the script runs the D1 migrations first, then `wrangler deploy -c wrangler.deploy.json`.
7. Local development: `npm install`, then `npm run dev` (see README.md). The script writes `.dev.vars` with random local keys, applies the migrations to the local D1 database and starts `wrangler dev` with local D1 and R2. git ignores `.dev.vars` and the generated `wrangler.dev.json`.

Known constraints:

- Without resource ids, the docs do not state if a later deploy reuses the resources that the first deploy created. Ceiling: a later deploy could bind new, empty resources. Use deploys without ids only for test instances. Upgrade path: verify the behavior with a test deploy, or always give the ids.
- Preview versions of other branches use the production bindings. Ceiling: a preview can change production data. Upgrade path: a second instance with its own resources for staging, before previews get real use.

### 5.3 Monthly cost

| Phase | Cost |
|---|---|
| Pilot: inside the free limits (Workers 100k requests per day and 10 ms CPU per request; D1 500 MB, 5M rows read and 100k written per day; R2 10 GB, about 6,000 listings with 5 photos at about 1.6 MB per listing; Workers AI 10k neurons per day; email inside the provider's free tier) | $0, plus the domain fee |
| After one of these limits | Workers Paid: $5 per month. It includes 10M requests and 30M CPU-ms per month, up to 30 s CPU per request, D1 25 billion rows read and 50M rows written, and Cloudflare Email Sending with 3,000 emails per month ($0.35 per 1,000 after that). R2 above 10 GB: $0.015 per GB-month. |

Values to monitor: requests per day, CPU time per request, D1 rows written per day, AI neurons per day, emails per day.

## 6. Other matters to consider

1. **Law (Finland, EU).**
   - GDPR: buyer names and contacts are personal data. This needs a privacy notice, retention periods and processor agreements with Cloudflare and the email provider.
   - Digital Services Act: notice and action (the report button) and a statement of reasons to the seller for each removal apply to all hosting services. Several other platform duties do not apply to micro and small enterprises (verify with a lawyer).
   - DAC7 tax reporting: Shelfring does not know the final price, so the reporting duty is probably not triggered. Verify with the Finnish Tax Administration.
   - Terms of use, a list of prohibited items, a minimum age, and a clear text that a bid is not binding.
2. **Spam and abuse:** scripts can use the forms that need no login. v1 has rate limits, and the seller can remove requests. Next step: Turnstile (TODO.md).
3. **Scams:** Facebook Marketplace scams reached Finland in 2025 (Yle). Add a short safety page: meet in a public place, never enter bank codes from a link, Shelfring never asks for payment.
4. **Wrong IP location:** both filters must pass, so a correct password does not help a buyer whom the IP places outside the area. Monitor the failed-check counts after launch. The location fallback is in TODO.md.
5. **Link previews:** shared links are the only discovery channel in v1. Generic previews in some chat apps can reduce clicks (see 4.5 and section 7).
6. **Accessibility:** target WCAG 2.2 AA (labels, contrast, keyboard use, alt text). The AI draft can also propose an alt text for each photo. Check if the European Accessibility Act applies; it has an exemption for micro-enterprises that supply services.
7. **Data loss:** D1 Time Travel restores up to 7 days back on Workers Free (30 days on Paid). R2 has no object versioning, so a deleted photo cannot be restored.
8. **Lock-in:** low for v1. The SQL is SQLite, R2 is S3-compatible, and Hono runs on other runtimes.
9. **Revenue:** none in v1. The cost is $0 in the pilot phase.
10. **Own-agent connector (TODO.md):** results of the check: Claude accepts custom remote MCP connectors with OAuth on all plans (one on Free). Claude calls the server from Anthropic's cloud, so the IP area check sees Anthropic, not the seller. Claude cannot pass a chat photo to a tool. Anthropic does not let third parties route requests through a person's Claude subscription. The ChatGPT facts are not verified yet.
11. **License duties of operators:** under AGPL-3.0 section 13, an operator who runs a modified Shelfring must offer the source code of the modified version to its users. The page footer links to `SOURCE_URL` for this reason.
12. **Hosting outside Cloudflare:** v1 uses Cloudflare bindings (D1, R2, Workers AI, `request.cf`). Other hosting needs adapters (TODO.md).

## 7. Defaults for the open questions

The first implementation uses these defaults. Each one is a setting or a few lines of code, so a later iteration can change it.

| Question | v1 default |
|---|---|
| Link previews for area listings in chat apps that fetch from their own servers (Telegram, Slack) | Generic preview. No User-Agent exception, because anybody can fake it. |
| Listing lifetime | Fixed-price listings expire after 30 days. The seller renews in one tap. |
| Data retention | The Cron run deletes the photos, the requests and the listing 30 days after the listing closes. Drafts go after 24 hours. |
| AI draft categories | A fixed list of 15 categories and 5 conditions (`src/util.ts`). |
| Seller data before acceptance | The display name and the storefront. The contact only after acceptance. |
| Accepted buyer does not answer | After 24 hours the seller can choose another buyer. |
| Auction options | 1, 3 or 7 days, or no end date: then the seller ends the auction in the console. Minimum step: 1 unit of the currency. |
| Revenue model | None in v1. |
| Legal entity, terms, prohibited items | Open. `TERMS_URL` and `PRIVACY_URL` link to the operator's texts. |

## 8. Design (direction B)

- **Tokens** are in `public/style.css`: paper `#FDFDFB` with `#D3D8E3` dots, ink `#1F2233`, pencil `#5E6478`, blue `#2D5BFF`, highlighter `#FFE34F`; chalkboard `#1F2430`, `#353C4C`, `#EDEFF5`, `#A9AFC2`, `#8EA6FF`. One font: Shantell Sans (OFL), self-hosted in `public/fonts`.
- **Contrast:** price tag `#1F2233` on `#FFE34F` 12.2:1, white on blue 5.2:1, pencil on paper 5.8:1, chalk pencil on chalkboard 7.1:1.
- **Drawings** were exported once from the design engine: the icon sprite `public/icons.svg`, the pen frames (CSS `border-image`), three empty-state scenes and the logo in `src/art.ts`, the app icons and `og.png`. The pages have no drawing code at run time.
- **Photos:** the pen draws a frame around each photo; it never draws on the item. No filters, no background removal, the same photo in both themes. Shelf cards crop to 4:5 from the centre; the listing page shows each photo whole. The sell form shows the card crop, so the seller sees it before publishing.
  Known constraint: the centre crop can miss an item at the edge of the photo. Upgrade path: one focus point per photo, used as `object-position` (TODO.md).
- **Not in v1:** background removal, automatic brightness or white balance, AI "enhance". Each changes how the item looks and costs CPU time or money.
