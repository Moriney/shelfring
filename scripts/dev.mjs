// Local development: writes .dev.vars with random local keys on the first run, applies the D1 migrations
// to the local database, then starts `wrangler dev` on http://localhost:8787.
// The AI binding always runs remotely and needs a Cloudflare login, so the local config leaves it out
// unless .dev.vars sets AI_MODEL; without it the AI draft is a stub.
// `node scripts/dev.mjs keys` prints new production keys (HMAC_KEY and a VAPID key pair) and writes nothing.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';

const b64u = b => Buffer.from(b).toString('base64url');
async function keys() {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  return {
    HMAC_KEY: b64u(crypto.getRandomValues(new Uint8Array(32))),
    VAPID_PUBLIC_KEY: b64u(await crypto.subtle.exportKey('raw', k.publicKey)),
    VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', k.privateKey)).d
  };
}

if (process.argv[2] === 'keys') {
  for (const [n, v] of Object.entries(await keys())) console.log(`${n}=${v}`);
  process.exit(0);
}
if (!existsSync('.dev.vars')) {
  const v = {
    ...(await keys()),
    DEV: '1', // emails go to this terminal, the AI draft is a stub unless AI_MODEL is set
    SITE_URL: 'http://localhost:8787',
    EMAIL_API_KEY: 'unused-in-dev',
    ADMIN_EMAILS: 'admin@example.com',
    // example presets for the first deployment; see DEPLOY.md 3.7
    AREA_PRESETS: JSON.stringify({ 'Helsinki capital region': ['city:FI/helsinki', 'city:FI/espoo', 'city:FI/vantaa', 'city:FI/kauniainen'], Uusimaa: ['region:FI-18'], Finland: ['country:FI'] }),
    // the location that the area check sees locally: country,regionCode,city
    DEV_CF: 'FI,18,Helsinki'
  };
  writeFileSync('.dev.vars', Object.entries(v).map(([n, x]) => `${n}='${x}'`).join('\n') + '\n');
  console.log('Wrote .dev.vars with local keys.');
}
const cfg = JSON.parse(readFileSync('wrangler.json', 'utf8'));
// Wrangler reads only the required secrets from .dev.vars; the other local settings become variables of the dev config.
const local = Object.fromEntries([...readFileSync('.dev.vars', 'utf8').matchAll(/^(\w+)='(.*)'$/gm)].map(m => [m[1], m[2]]));
cfg.vars = Object.fromEntries(Object.entries(local).filter(([n]) => !cfg.secrets.required.includes(n)));
if (!cfg.vars.AI_MODEL) delete cfg.ai;
writeFileSync('wrangler.dev.json', JSON.stringify(cfg, null, 2));
execSync('npx wrangler d1 migrations apply shelfring --local -c wrangler.dev.json', { stdio: 'inherit' });
spawn('npx', ['wrangler', 'dev', '-c', 'wrangler.dev.json', '--test-scheduled', ...process.argv.slice(2)], { stdio: 'inherit' }).on('exit', c => process.exit(c ?? 0));
