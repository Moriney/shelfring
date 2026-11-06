// Deploy with the instance values from the environment, so that no instance value is in the repository.
// D1_DATABASE_ID, R2_BUCKET_NAME, R2_JURISDICTION and CUSTOM_DOMAIN are optional (see DEPLOY.md).
// Other arguments go to `wrangler deploy`, for example `--secrets-file <file>`: the first deploy of a new Worker needs it.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const env = process.env, cfg = JSON.parse(readFileSync('wrangler.json', 'utf8'));
if (env.D1_DATABASE_ID) cfg.d1_databases[0].database_id = env.D1_DATABASE_ID;
if (env.R2_BUCKET_NAME) cfg.r2_buckets[0].bucket_name = env.R2_BUCKET_NAME;
if (env.R2_JURISDICTION) cfg.r2_buckets[0].jurisdiction = env.R2_JURISDICTION;
if (env.CUSTOM_DOMAIN) cfg.routes = [{ pattern: env.CUSTOM_DOMAIN, custom_domain: true }];
writeFileSync('wrangler.deploy.json', JSON.stringify(cfg, null, 2));

const run = (...args) => execFileSync('npx', ['wrangler', ...args], { stdio: 'inherit' });
const migrate = () => run('d1', 'migrations', 'apply', cfg.d1_databases[0].database_name, '--remote', '-c', 'wrangler.deploy.json');
// with a database id the schema is ready before the new code runs; without one, the first deploy creates the database
if (env.D1_DATABASE_ID) migrate();
run('deploy', '-c', 'wrangler.deploy.json', ...process.argv.slice(2));
if (!env.D1_DATABASE_ID) migrate();
