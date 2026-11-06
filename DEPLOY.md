# Deploy Shelfring

This guide is for operators. It tells you which accounts you need, how to put an instance into production, how to check, update and back it up, and how to keep your deployment pipeline private while the code stays public.

The provider facts come from the providers' documentation on 2026-11-06. "Not verified" marks a fact that this guide could not confirm in the provider's own documentation on that date. Prices and limits change. Check them again before you set up an instance. Section 10 lists the sources.

Placeholders:

| Placeholder | Meaning | Example |
|---|---|---|
| `<domain>` | your domain, a Cloudflare zone; the site runs on it | `example.org` |
| `img.<domain>` | the photo host (R2 public custom domain) | `img.example.org` |
| `<bucket>` | the R2 bucket name | `shelfring-photos` |
| `<zone-id>`, `<account-id>`, `<database-id>` | ids that Cloudflare shows | — |
| `<owner>/shelfring` | the public repository on GitHub | — |
| `<ref>` | a release tag or a full commit id of that repository | `v0.1.0` |

If the site runs on a subdomain (for example `shop.example.org`), keep the photo host one level below the zone (`img.example.org`). Universal SSL covers the zone apex and one level of subdomain only.

## 1. Accounts and plans

| Service | Used for | Plan for a pilot | Payment method |
|---|---|---|---|
| Cloudflare | Worker, D1, R2, Workers AI, rate limits, Cron Trigger, DNS, TLS, logs | Workers Free; zone on the Free plan | Yes, for the R2 subscription |
| Domain registrar | `<domain>` | any registrar | Yes (registration fee) |
| Resend | sign-in codes and notification emails | Free | Not verified |
| GitHub | the code; one private repository for the pipeline (section 8) | Free | No |
| Browser push services (Google, Apple, Mozilla) | web push delivery | no account | — |

### 1.1 Cloudflare

- **Account.** Use one Cloudflare account for each instance. The Worker name `shelfring` is fixed in `wrangler.json`, so a second instance (for example staging) needs its own account.
- **Workers Free.** 100,000 Worker requests per day, 10 ms CPU time per invocation (also for the Cron run), 50 subrequests per invocation, 5 Cron Triggers per account. Requests for the static files in `public/` are free and unlimited. Photo views on `img.<domain>` go to R2, not to the Worker.
- **Workers Paid: $5 per month per account.** You need it when one of these applies:
  - More than 100,000 Worker requests per day. Free then returns error 1027.
  - Requests that use more than 10 ms CPU time again and again. Free then returns error 1102 "Worker exceeded resource limits". The web push encryption and the AI draft request are probably the heaviest handlers (not measured).
  - More than 10,000 Workers AI neurons per day. On Free, further AI calls fail and the sell form stays empty.
  - D1 above the Free limits (below).
  - More than 50 D1 queries or subrequests in one invocation. Each old listing that the Cron run deletes needs several queries. On Free, a run with much work can stop at this limit; the next run, 5 minutes later, continues.
  - D1 Time Travel for 30 days instead of 7.

  Paid includes 10 million requests and 30 million CPU milliseconds per month, then $0.30 per million requests and $0.02 per million CPU milliseconds. CPU time is up to 5 minutes per request (default 30 seconds).
- **D1.** On both plans. Free: 10 databases, 500 MB per database, 5 GB per account, 5 million rows read and 100,000 rows written per day (reset at 00:00 UTC). Paid: 10 GB per database; 25 billion rows read, 50 million rows written and 5 GB storage per month included.
- **R2.** You must add an R2 subscription in the dashboard (**Storage & databases > R2 > Overview**) through a checkout flow. Cloudflare requires a payment method (card or PayPal) to purchase products. Add one also if you stay inside the free tier. Free each month: 10 GB-month storage, 1 million Class A operations (writes), 10 million Class B operations (reads). Egress is free.
- **Workers AI.** On both plans. 10,000 neurons per day are free. More needs Workers Paid at $0.011 per 1,000 neurons. The price depends on the model, for example `@cf/google/gemma-4-26b-a4b-it` $0.10 per million input tokens and $0.30 per million output tokens, `@cf/meta/llama-4-scout-17b-16e-instruct` $0.27 and $0.85. Some models need a paid billing method; the Workers AI pricing page lists them.
- **DNS zone.** Add `<domain>` to Cloudflare as a zone on the Free plan, with Cloudflare nameservers (full setup). The Worker custom domain and the R2 custom domain both need an active zone in the same account. A partial (CNAME) setup is only available on Business and Enterprise.
- **Rate Limiting binding, Cron Trigger.** Included. The docs state no separate price for the Rate Limiting binding. Its limits are approximate and apply separately in each Cloudflare location.
- **Workers Logs.** Free: 200,000 log events per day, kept 3 days. Paid: 20 million per month, kept 7 days. From 1 December 2026, Workers Logs use the Cloudflare Observability pricing.

### 1.2 Email: Resend

- Shelfring v1 sends email only through the Resend API.
- Free plan: 3,000 emails per month and 100 per day (not verified, 2026-11-06: Resend's pricing page and blog show these numbers in web search results; the pages could not be opened). Number of sender domains on Free: not verified (sources say 1 or 3). Pro: $20 per month for 50,000 emails per month (not verified, third-party sources only).
- The daily limit is the first limit that a pilot reaches. Each sign-in sends one code. Each request, offer and bid sends one email to the seller. If Resend refuses a message, the Worker logs `email failed` and nobody gets the email. A seller without the code cannot sign in.
- You need a sender domain that you control (`<domain>`) and its DNS records (section 3.5).
- When you add the domain, you select the sending region, for example `eu-west-1` (Ireland). The region controls where emails are sent from, not where Resend stores account data (not verified, 2026-11-06).

### 1.3 Domain registrar

- Any registrar works. You replace its nameservers with the two that Cloudflare gives you.
- Cloudflare Registrar sells and renews domains at cost (the registry and ICANN fees, no markup). Domains registered there always use Cloudflare nameservers. Check that it offers your top-level domain. Prices per top-level domain: not verified.

### 1.4 GitHub

- The public repository holds the code. You need no account to deploy from it.
- The recommended private pipeline (section 8) uses one private repository. GitHub Free includes 2,000 Actions minutes per month for private repositories (not verified, 2026-11-06).
- Environments with environment secrets and required reviewers in private repositories need GitHub Pro, Team or Enterprise (not verified, 2026-11-06). The example workflow uses repository secrets, which work on Free.

### 1.5 Optional

- **Contact mailbox.** `CONTACT_EMAIL` must receive mail. Cloudflare Email Routing can forward `contact@<domain>` to an existing mailbox. Inbound Email Routing is unlimited on Workers Free and Paid.
- **Terms and privacy pages.** `TERMS_URL` and `PRIVACY_URL` can point to any public page. One option without another account: upload HTML files to the R2 bucket and use `https://img.<domain>/terms.html`. Purge the cache after you change a file.

## 2. What you deploy

- One Worker, `shelfring`, with the static files in `public/`.
- One D1 database and one R2 bucket, both in the EU jurisdiction.
- The Worker custom domain `<domain>` and the R2 custom domain `img.<domain>`.
- One Cron Trigger every 5 minutes: auction end, listing expiry, deletion of old data.
- Two Rate Limiting namespaces, `7301` and `7302`. These ids must be unique in the account.

The repository holds no instance values. `scripts/deploy.mjs` reads `D1_DATABASE_ID`, `R2_BUCKET_NAME`, `R2_JURISDICTION` and `CUSTOM_DOMAIN` from the environment and writes `wrangler.deploy.json`, which git ignores. Settings are Worker variables. Keys are Worker secrets.

## 3. First deployment

Requirements on your computer: Node.js 22 or later, and git.

### 3.1 Get the code

```bash
git clone https://github.com/<owner>/shelfring.git
cd shelfring
git checkout <ref>
npm ci
npx wrangler login
```

`wrangler login` opens a browser. A pipeline uses an API token instead (section 8.3).

### 3.2 Put the domain on Cloudflare

1. In the Cloudflare dashboard, add `<domain>`. Select the Free plan.
2. At your registrar, replace the nameservers with the two that Cloudflare shows.
3. Wait until the zone status is **Active**.
4. Write down the zone id. It is on the zone overview page.

### 3.3 Create the database and the bucket in the EU

The jurisdiction can only be set when you create a resource.

1. Add the R2 subscription: **Storage & databases > R2 > Overview**, then complete the checkout.
2. Create the database. Write down the `database_id` from the output.

   ```bash
   npx wrangler d1 create shelfring --jurisdiction=eu
   ```

3. Create the bucket.

   ```bash
   npx wrangler r2 bucket create <bucket> --jurisdiction=eu
   ```

Without resource ids, `wrangler deploy` creates the database and the bucket itself (automatic provisioning), and later deploys reuse them. But they get no jurisdiction. Use this only for test instances.

### 3.4 Connect the photo domain

1. Connect the bucket to `img.<domain>`. Wait until the status is **Active**.

   ```bash
   npx wrangler r2 bucket domain add <bucket> --domain img.<domain> --zone-id <zone-id> --jurisdiction eu --min-tls 1.2
   ```

   The dashboard has the same function: **R2 > `<bucket>` > Settings > Custom Domains > Add**.
2. Do not enable the `r2.dev` address. It is rate-limited and for development only.
3. Add a Cache Rule in the zone `<domain>`: **Caching > Cache Rules > Create rule**. Condition: hostname equals `img.<domain>`. Action: **Eligible for cache**. Reason: photo keys have no file extension (`<key>/l`), and Cloudflare caches by file extension only. Without the rule, each photo view is an R2 read. Each photo has the header `Cache-Control: public, max-age=31536000, immutable`.
4. CORS is not necessary. Pages show photos with `<img>` only. The link preview canvas reads the photo through the Worker (`/img/...`, same origin).

### 3.5 Verify the sender domain at Resend

1. Create a Resend account.
2. Add the domain `<domain>`. Select the region.
3. Add the DNS records that Resend shows to the DNS of `<domain>` in Cloudflare. Copy the values exactly. Resend uses the subdomain `send` for the return path (record names not verified, 2026-11-06):

   | Type | Name | Purpose |
   |---|---|---|
   | MX | `send` | bounce and complaint feedback |
   | TXT | `send` | SPF |
   | TXT | `resend._domainkey` | DKIM |

4. Add a DMARC record yourself. Start with a policy that only reports:

   | Type | Name | Value |
   |---|---|---|
   | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:<report address>` |

   When the reports show that your mail passes for some weeks, change `p=none` to `p=quarantine`.
5. Wait until Resend shows the domain as **Verified**. This often takes 15 minutes. DNS changes can take up to 72 hours (not verified, 2026-11-06).
6. Create an API key. If Resend offers it, give the key sending access only, for `<domain>` only (not verified, 2026-11-06). This value is `EMAIL_API_KEY`.

### 3.6 Generate the keys

```bash
node scripts/dev.mjs keys
```

The command prints `HMAC_KEY`, `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. It writes no file. Save the three values in a password manager.

- Do not change `HMAC_KEY` after launch. Listing passwords, unlock cookies and open sign-in codes depend on it.
- If you change the VAPID keys, existing push subscriptions stop working. Users must turn on notifications again.

### 3.7 Settings and secrets

These are all the values that `src/index.tsx` reads:

| Name | Kind | Value | If not set |
|---|---|---|---|
| `SITE_URL` | variable | `https://<domain>` | Links in the messages of the Cron run (auction ended) have no host. |
| `PHOTO_ORIGIN` | variable | `https://img.<domain>` | Photos go through the Worker (`/img/...`): more Worker requests, no CDN cache. |
| `SITE_NAME` | variable | the name in pages, emails and the installed app | `Shelfring` |
| `CURRENCY` | variable | ISO 4217 code, for example `EUR` | `EUR` |
| `AREA_PRESETS` | variable, type **Text** | JSON object: label → list of `country:<CC>`, `region:<CC>-<region code>`, `city:<CC>/<city key>`. Calibrate it (section 4). | The sell form has no area choice. |
| `AI_MODEL` | variable | a Workers AI vision model id, for example `@cf/google/gemma-4-26b-a4b-it`. Check that the model is not on the deprecation list. | No AI draft. The seller fills in the form. |
| `EMAIL_FROM` | variable | `Shelfring <noreply@<domain>>`, on the verified domain | Resend refuses the emails. |
| `CONTACT_EMAIL` | variable | the point of contact (Digital Services Act). Also the contact in the web push signature (VAPID subject). | No contact link. Push uses the site address as contact. |
| `TERMS_URL` | variable | your terms of use | No link |
| `PRIVACY_URL` | variable | your privacy notice | No link |
| `SOURCE_URL` | variable | the source of the running version, for example `https://github.com/<owner>/shelfring/tree/<ref>` (section 9) | No link |
| `VAPID_PUBLIC_KEY` | variable | from 3.6 | No web push |
| `HMAC_KEY` | secret | from 3.6 | The deploy fails. |
| `VAPID_PRIVATE_KEY` | secret | from 3.6 | The deploy fails. |
| `EMAIL_API_KEY` | secret | from 3.5 | The deploy fails. |
| `ADMIN_EMAILS` | secret | comma-separated email addresses that may open `/admin` | The deploy fails. |

Never set `DEV` or `DEV_CF` in production. `DEV` stops all email and opens the page `/dev/mail`, which shows every sign-in code to every visitor.

Example of `AREA_PRESETS` for an instance in the Helsinki area, before calibration:

```json
{"Helsinki capital region":["city:FI/helsinki","city:FI/espoo","city:FI/vantaa","city:FI/kauniainen"],"Uusimaa":["region:FI-18"],"Finland":["country:FI"]}
```

Set `AREA_PRESETS` as type **Text**. A variable of type JSON reaches the code as an object, but the code expects text; the area choice then disappears.

Where the values go:

- Variables: in the dashboard, **Workers & Pages > shelfring > Settings > Variables and Secrets**, type Text. `keep_vars: true` in `wrangler.json` keeps them on each deploy. With the private pipeline, they are in `vars.json` instead (section 8).
- Secrets: in a secrets file at the first deploy (3.8), later with `npx wrangler secret put <NAME>`. After you save a secret, Wrangler and the dashboard do not show its value.
- Limits: 64 variables per Worker on Free (128 on Paid), 5 KB each.

### 3.8 Deploy

1. Write the four secrets to a JSON file outside the repository folder:

   ```json
   {"HMAC_KEY":"<value>","VAPID_PRIVATE_KEY":"<value>","EMAIL_API_KEY":"<value>","ADMIN_EMAILS":"<admin email>"}
   ```

2. Set the instance values and run the deploy script:

   ```bash
   export D1_DATABASE_ID=<database-id> R2_BUCKET_NAME=<bucket> R2_JURISDICTION=eu CUSTOM_DOMAIN=<domain>
   node scripts/deploy.mjs --secrets-file <path to the secrets file>
   ```

   The script writes `wrangler.deploy.json`, applies the D1 migrations in `migrations/`, then runs `wrangler deploy`. Arguments after the script name go to `wrangler deploy`. Wrangler refuses the first deploy of a new Worker if a secret in `secrets.required` is missing; `--secrets-file` supplies them. A secrets file only adds or replaces secrets. It deletes none.
3. Delete the secrets file.
4. Add the variables from 3.7 in the dashboard and deploy them.
5. Open `https://<domain>`. Cloudflare creates the DNS record and the certificate for the custom domain. With a custom domain, the `workers.dev` address stays off.
6. Sign in with an address from `ADMIN_EMAILS`. The menu shows **Reports** (`/admin`).

Other commands:

- Migrations only: `npx wrangler d1 migrations apply shelfring --remote -c wrangler.deploy.json`.
- Build check without upload: `npx wrangler deploy --dry-run -c wrangler.deploy.json --outdir <folder>`. Do not give `--dry-run` to `scripts/deploy.mjs`: the script applies the migrations before it calls Wrangler.

## 4. Check production

- [ ] `https://<domain>` opens with a valid certificate.
- [ ] **Sign-in email.** Sign in at `/signin` with an address at a large mail provider. The code arrives within one minute. In the original message, SPF, DKIM and DMARC show `pass`. If no email arrives, look for `email failed` and the Resend status code in Workers Logs (**shelfring > Observability**).
- [ ] **Photo upload.** On a phone, tap **Sell** and add a photo. The photo shows. Its address starts with `https://img.<domain>/`. Open the photo address two times; the second response has the header `cf-cache-status: HIT`.
- [ ] **AI draft.** With `AI_MODEL` set, the title, category, condition and description fill in. The code waits at most 8 seconds. The Workers AI page in the dashboard shows the neurons.
- [ ] **Publish and share.** Publish the listing and share the link in a chat app. The preview shows the photo, the title and the price.
- [ ] **Push on Android and desktop.** In Chrome or Firefox, open your listing in a second browser profile or device. Send "I want it" and select "Notify me in this browser". As the seller, select **Turn on notifications** in the console. The seller device shows the new request. Accept it: the buyer device shows the answer.
- [ ] **Push on iPhone and iPad.** iOS or iPadOS 16.4 or later. In Safari, open `https://<domain>`, then **Share > Add to Home Screen**. Open Shelfring from the Home Screen icon and turn on notifications there. Repeat the test above. Apple offers web push only to web apps on the Home Screen (not verified, 2026-11-06).
- [ ] **Cron.** **shelfring > Settings > Trigger Events > View events** shows a run every 5 minutes without errors. For a new Worker, the first events can take up to 30 minutes to show. Workers Logs also show the `cron` invocations.
- [ ] **Area check calibration** (see ARCHITECTURE.md 4.4):
  1. Open the site from at least 10 networks in your area: each mobile operator, home broadband, an office network, a university network and a VPN.
  2. For each request, read the location values (`country`, `regionCode`, `city`) in the invocation log in Workers Logs. The exact field names in the log: not verified.
  3. Build `AREA_PRESETS` from these real values, not from official names. A city key is lower case, without accents, with `-` for spaces: `Sörnäinen Kallio` becomes `sornainen-kallio`.
  4. Publish one test listing for each preset. Open it from inside and from outside the area. Outside, the page says "This listing is not available in your area."
  5. After launch, repeat the check when sellers report wrong results.
- [ ] **Reports.** Report a test listing. It shows at `/admin`.
- [ ] **After one week.** Compare with the limits in section 1: requests per day, CPU time per request, D1 rows written per day, AI neurons per day, emails per day (Resend dashboard).

## 5. Updates and rollbacks

### 5.1 Update

1. Read the changes between your version and the new one: `git log <old-ref>..<new-ref>`, and the changes in `DEPLOY.md`, `migrations/` and `wrangler.json`. New settings appear in section 3.7.
2. Deploy the new version.
   - With the private pipeline: change `SHELFRING_REF` (section 8) and commit.
   - From your computer: `git fetch --tags`, `git checkout <new-ref>`, `npm ci`, then `node scripts/deploy.mjs` with the same environment values as before. The secrets are already on the Worker.
3. Do the checks in section 4 that the change touches.

With `D1_DATABASE_ID` set, the script applies new migrations before the new code goes live. For a short time, the old code runs on the new schema.

### 5.2 Rollback

- `npx wrangler deployments list --name shelfring` shows the versions.
- `npx wrangler rollback <version-id> --name shelfring --message "<reason>"` makes an older version live at once. The dashboard has the same function: **shelfring > Deployments**. Only the 100 most recent versions are available.
- A rollback does not change D1. If the newer version applied a migration, the older code runs on the new schema. To go back in the data too, see section 6.
- With the private pipeline, also set `SHELFRING_REF` back. Otherwise the next run deploys the bad version again.

## 6. Backups

- **D1 Time Travel** is always on. It restores the database to any minute in the last 7 days (Free) or 30 days (Paid).

  ```bash
  npx wrangler d1 time-travel info shelfring --timestamp=<RFC 3339 time> -c wrangler.deploy.json
  npx wrangler d1 time-travel restore shelfring --timestamp=<RFC 3339 time> -c wrangler.deploy.json
  ```

  A restore overwrites the database. All writes after that time are lost. Write down the bookmark that the restore prints: with it, you can undo the restore.
- **A copy outside Cloudflare:** `npx wrangler d1 export shelfring --remote --output <file>.sql -c wrangler.deploy.json`. The file holds personal data. Encrypt it, and delete it when your retention period ends.
- **Photos.** Time Travel does not cover R2. The Cron run deletes the photos 30 days after a listing closes, by design. To keep a copy, sync the bucket through the R2 S3 API; the endpoint for the EU jurisdiction is `https://<account-id>.eu.r2.cloudflarestorage.com`.
- **Keys.** Keep the keys from 3.6 in a password manager. A restored database without the same `HMAC_KEY` has no working listing passwords.

## 7. Monthly cost

| Item | Pilot, inside the free limits | After the free limits |
|---|---|---|
| Workers | $0 (Free) | $5 (Paid), then $0.30 per million requests above 10 million and $0.02 per million CPU ms above 30 million |
| D1 | $0 | Included in Paid up to 25 billion rows read, 50 million rows written, 5 GB; then $0.001 per million rows read, $1.00 per million rows written, $0.75 per GB-month |
| R2 | $0 up to 10 GB-month, 1 million Class A, 10 million Class B operations | $0.015 per GB-month, $4.50 per million Class A, $0.36 per million Class B |
| Workers AI | $0 up to 10,000 neurons per day | $0.011 per 1,000 neurons, needs Paid |
| Zone, DNS, TLS, custom domains, Cache Rules, Email Routing | $0 (Free plan) | — |
| Workers Logs | $0 up to 200,000 events per day | Paid: 20 million per month included, then $0.60 per million; Observability pricing from 1 December 2026 |
| Resend | $0 up to 3,000 emails per month and 100 per day (not verified) | Pro: $20 for 50,000 emails per month (not verified) |
| GitHub, private pipeline | $0 (not verified) | — |
| Domain | the yearly fee of your registrar for your top-level domain (not verified) | — |
| **Total** | **$0 per month, plus the domain fee** | **$5 per month plus usage; plus a Resend plan if you need more than 100 emails per day** |

10 GB of R2 holds about 6,000 listings with 5 photos each (ARCHITECTURE.md 5.3).

## 8. Private deployment pipeline

The code is public. Your deployment can stay private.

### 8.1 What is private

- Credentials: the Cloudflare API token and the four runtime secrets.
- Personal data: `ADMIN_EMAILS`.
- Instance values: the account id, the database id, the bucket name and the version that runs. They are not credentials, but they do not belong in the public repository.
- Not private: `SITE_URL`, `PHOTO_ORIGIN`, `CONTACT_EMAIL`, `VAPID_PUBLIC_KEY`, `SOURCE_URL` and the other settings are in the pages that each visitor gets.

### 8.2 Options

| | A. Private ops repository with GitHub Actions (recommended) | B. Workers Builds on the public repository | C. Private copy of the repository |
|---|---|---|---|
| Code that runs | the public repository at a pinned tag or commit | the latest commit of one branch of the public repository | your private copy |
| Instance values and settings | files in the private repository, with history | build variables and Worker variables in the Cloudflare dashboard, no history | files in the private copy |
| Secrets | Actions secrets of the private repository, sent to the Worker on each deploy | Worker secrets and build secrets in the dashboard | as A or B |
| Deploy starts on | a commit to the private repository, or a manual run | each push to the production branch of the public repository | a push to the private copy |
| Visible to the public | nothing | build check runs and pull request comments with preview links in the public repository | nothing, until the AGPL makes you publish your changes |
| Upstream updates | change one line (`SHELFRING_REF`) after you read the changes | each push goes live without a separate review step | merge from upstream and resolve conflicts |
| AGPL | `SOURCE_URL` points to the public tag | the same | publish your modified source (section 9) |
| Cost | GitHub Free (not verified) | Workers Builds: 3,000 build minutes per month on Free | as A or B |

Notes on B:

- The Worker name in the dashboard must be `shelfring`, the `name` in `wrangler.json`.
- Set the deploy command to `node scripts/deploy.mjs`. Add `D1_DATABASE_ID`, `R2_BUCKET_NAME`, `R2_JURISDICTION` and `CUSTOM_DOMAIN` as build variables. Workers Builds installs the dependencies itself.
- The API token that Workers Builds creates has no D1 permission. Add **D1 Edit** to it (**My Profile > API Tokens**). Otherwise the migration step fails.
- Set the four secrets before the first build, with `npx wrangler secret put <NAME>`. This command creates the Worker if it does not exist yet.
- Builds of other branches create Previews. Turn off builds for other branches, or give Previews their own resources in the Preview settings. Which resources a Preview uses by default: not verified.
- Each person who can push to the production branch can deploy to production.

Notes on C:

- On GitHub, a fork of a public repository stays public (not verified, 2026-11-06). A private copy is a new private repository:

  ```bash
  git clone --bare https://github.com/<owner>/shelfring.git
  cd shelfring.git
  git push --mirror <URL of your new private repository>
  ```

  To take upstream updates into a clone of the private copy: `git remote add upstream https://github.com/<owner>/shelfring.git`, `git fetch upstream --tags`, `git merge <ref>`.
- If you run modified code, the AGPL makes you offer that source to all users (section 9). The code changes cannot stay private. Only the configuration can.

### 8.3 Recommendation: option A

Option A puts nothing instance-specific into the public repository or its public check runs. The version in production changes only with a commit that you make. Settings have a history. The same workflow can rebuild the instance in a new Cloudflare account.

The private repository holds two files:

```
.github/workflows/deploy.yml   the workflow below
vars.json                      the variables from section 3.7, without SOURCE_URL
```

Setup:

1. Create a private repository on GitHub. Give write access only to people who may deploy. A person with write access can change the workflow, and a workflow can read the secrets (not verified, 2026-11-06).
2. Create a Cloudflare API token: on the **Account API tokens** page, select **Create Token** and the template **Edit Cloudflare Workers**. Add the permission **D1 Edit**. Limit the token to your account and to the zone `<domain>`. If the first deploy reports an authorization error for the custom domain, add the permission that the error names (not verified which one, 2026-11-06).
3. In the private repository, add these repository secrets (**Settings > Secrets and variables > Actions**): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `HMAC_KEY`, `VAPID_PRIVATE_KEY`, `EMAIL_API_KEY`, `ADMIN_EMAILS`.
4. Copy the workflow and `vars.json` below into the private repository. Replace the placeholders.
5. Push to `main`. The workflow runs. You can also start it by hand: **Actions > Deploy > Run workflow**.
6. Do the checks in section 4.
7. To update: read the upstream changes, change `SHELFRING_REF`, commit and push. To roll back fast: `wrangler rollback` (section 5.2), then set `SHELFRING_REF` back.

Where each value lives:

| Value | Lives in | Who can see it |
|---|---|---|
| Code, this guide, the example workflow | public repository | everybody |
| `SHELFRING_REF`, `D1_DATABASE_ID`, `R2_BUCKET_NAME`, `CUSTOM_DOMAIN`, `vars.json` | private repository | its collaborators |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Actions secrets of the private repository | nobody can read them back; workflows of the private repository use them |
| `HMAC_KEY`, `VAPID_PRIVATE_KEY`, `EMAIL_API_KEY`, `ADMIN_EMAILS` | Actions secrets, then Worker secrets | nobody can read them back in GitHub or Cloudflare; the running Worker reads them |
| Variables at run time | Worker variables | members of the Cloudflare account; most are also in the public pages |
| Workflow logs | Actions of the private repository | its readers; GitHub hides the secret values in logs (not verified, 2026-11-06) |
| Backup of the keys | your password manager | you |
| Database, photos | D1 and R2 | members of the Cloudflare account |

`vars.json`:

```json
{
  "SITE_NAME": "Shelfring",
  "SITE_URL": "https://<domain>",
  "PHOTO_ORIGIN": "https://img.<domain>",
  "CURRENCY": "EUR",
  "AI_MODEL": "<Workers AI vision model id>",
  "AREA_PRESETS": { "<label>": ["city:<CC>/<city key>"], "<country label>": ["country:<CC>"] },
  "EMAIL_FROM": "Shelfring <noreply@<domain>>",
  "CONTACT_EMAIL": "<contact address>",
  "TERMS_URL": "<terms page URL>",
  "PRIVACY_URL": "<privacy page URL>",
  "VAPID_PUBLIC_KEY": "<from node scripts/dev.mjs keys>"
}
```

`.github/workflows/deploy.yml`. This file is documentation in the public repository. It is not an active workflow there.

```yaml
# Deploys one Shelfring instance from the public repository.
# Copy to .github/workflows/deploy.yml in a PRIVATE repository, next to vars.json.
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
concurrency: deploy
permissions:
  contents: read
env:
  UPSTREAM: <owner>/shelfring       # the public repository
  SHELFRING_REF: <ref>              # the tag or full commit id that runs in production
  D1_DATABASE_ID: <database-id>
  R2_BUCKET_NAME: <bucket>
  R2_JURISDICTION: eu
  CUSTOM_DOMAIN: <domain>
jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v6
        with:
          path: ops
      - uses: actions/checkout@v6
        with:
          repository: ${{ env.UPSTREAM }}
          ref: ${{ env.SHELFRING_REF }}
          path: app
          persist-credentials: false
      - uses: actions/setup-node@v6
        with:
          node-version: 24
      - name: Install
        working-directory: app
        run: npm ci
      - name: Add the settings and the source link of this version
        working-directory: app
        run: |
          jq --slurpfile v ../ops/vars.json --arg src "https://github.com/$UPSTREAM/tree/$SHELFRING_REF" \
            '.vars = ($v[0] | map_values(if type == "string" then . else tojson end)) + {SOURCE_URL: $src}' \
            wrangler.json > wrangler.tmp && mv wrangler.tmp wrangler.json
      - name: Write the runtime secrets to a temporary file
        env:
          HMAC_KEY: ${{ secrets.HMAC_KEY }}
          VAPID_PRIVATE_KEY: ${{ secrets.VAPID_PRIVATE_KEY }}
          EMAIL_API_KEY: ${{ secrets.EMAIL_API_KEY }}
          ADMIN_EMAILS: ${{ secrets.ADMIN_EMAILS }}
        run: |
          jq -n 'env | {HMAC_KEY, VAPID_PRIVATE_KEY, EMAIL_API_KEY, ADMIN_EMAILS}
            | if any(.[]; (. // "") == "") then error("a runtime secret is empty") else . end' > "$RUNNER_TEMP/secrets.json"
      - name: Check, migrate and deploy
        working-directory: app
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          npm run check
          node scripts/deploy.mjs --secrets-file "$RUNNER_TEMP/secrets.json" --message "shelfring $SHELFRING_REF"
      - name: Remove the secrets file
        if: always()
        run: rm -f "$RUNNER_TEMP/secrets.json"
```

What the workflow does:

1. It checks out the private repository and the public repository at `SHELFRING_REF`.
2. It writes the variables from `vars.json` into `wrangler.json` on the runner and adds `SOURCE_URL` for the exact version. A value that is not text (for example `AREA_PRESETS`) becomes JSON text.
3. It writes the four runtime secrets to a temporary file. It stops if a secret is empty.
4. It runs `npm run check` (types and `test/check.ts`). Then `scripts/deploy.mjs` applies the migrations and deploys with the secrets file.

The values in `vars.json` replace dashboard variables with the same name on each deploy. Change settings in `vars.json` only. A variable that you remove from `vars.json` stays on the Worker until you delete it in the dashboard (`keep_vars: true`).

## 9. License duties (AGPL-3.0-only)

- Shelfring is licensed under the AGPL-3.0-only. Under section 13, if you run a modified version, you must offer all users who interact with it over the network the Corresponding Source of your version, at no charge.
- Set `SOURCE_URL` in each instance. The page footer links to it. For an unmodified version, point it to the exact tag or commit in the public repository. The workflow in section 8 does this.
- If you modify the code, publish the exact source that runs, for example in a public fork at the deployed commit, and point `SOURCE_URL` to it. Keep the license notices.
- This guide treats instance values, settings, keys and secrets as configuration, not as source code, so they stay private. This is not legal advice.
- The easiest way to keep option A: send your changes upstream as pull requests.

## 10. Sources and facts not verified

Checked on 2026-11-06 in the Cloudflare documentation (developers.cloudflare.com): Workers pricing and limits, Workers Builds configuration, limits and GitHub integration, the GitHub Actions guide, secrets, environment variables, custom domains, Cron Triggers, rollbacks, Wrangler configuration (automatic provisioning, `keep_vars`, `secrets`), Workers Logs, D1 pricing, limits, data location and Time Travel, R2 pricing, get started, data location and public buckets, default cache behavior, Cache Rules, partial DNS setup, Workers AI pricing, Email Service pricing, Rate Limiting binding, API token templates and permissions, billing profile, Cloudflare Registrar. Wrangler 4.158.0 source: required secrets, automatic provisioning, the `workers.dev` default.

Not verified on 2026-11-06 (the provider documentation could not be opened from the check environment, or it did not state the fact):

- Resend: the Free plan limits (3,000 per month, 100 per day), the number of domains on Free, the Pro price, the DNS record names, the verification time, the region behavior, API key permissions, whether a payment method is needed.
- GitHub: Actions minutes on Free, environments in private repositories, forks of public repositories, who can use secrets, secret masking in logs.
- Apple: web push only for Home Screen web apps on iOS and iPadOS 16.4 and later.
- Cloudflare: the field names of the location values in Workers Logs; which resources a Workers Builds Preview uses by default; the token permission for the custom domain on the first deploy.
- Domain prices.
