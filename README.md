# Shelfring

Shelfring is a consumer-to-consumer marketplace for second-hand items. Sellers can list items at a fixed price or sell them through auctions. Each seller can also create and manage their own storefront inside the platform, with their own page, layout and item collection. The seller controls the visibility of each storefront and each item: public, visible only to selected groups (for example friends, colleagues or a local community), or private by invitation. This model combines the reach of a large marketplace with the trust of a closed group, so people can buy and sell used items with people they choose.

## Run it locally

Requirements: Node.js 22 or later.

```bash
npm install
npm run dev
```

Open http://localhost:8787. The first run writes `.dev.vars` with random local keys. The local database and photo storage live in `.wrangler/`.

- Sign-in codes and all other emails print to the terminal.
- The AI draft is a stub. To use Workers AI, add `AI_MODEL='<model id>'` to `.dev.vars` and sign in with `npx wrangler login`.
- The area check sees the location in `DEV_CF` in `.dev.vars` (country, region code, city).
- Sign in as `admin@example.com` to see the reports page at `/admin`.
- To test on a phone, open the dev server through an HTTPS tunnel; push notifications need HTTPS outside `localhost`.

Checks: `npm run check` (types, then `test/check.ts`).

## Host an instance

[DEPLOY.md](DEPLOY.md) lists the accounts and plans you need, every setting and secret, the steps to production, the production checks, updates, backups, the monthly cost and a private deployment pipeline. The architecture is in [ARCHITECTURE.md](ARCHITECTURE.md).

## License

Shelfring is free software under the GNU Affero General Public License, version 3 only (AGPL-3.0-only). See [LICENSE](LICENSE).
