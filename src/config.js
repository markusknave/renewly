import fs from 'node:fs';
import path from 'node:path';
import { loadOrCreateMasterKey, loadOrCreateSecret } from './lib/crypto.js';

function loadEnvFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const root = path.resolve(process.cwd());
loadEnvFile(path.join(root, '.env'));

const env = process.env.NODE_ENV || 'development';
const port = Number(process.env.PORT || 8787);
const dataDir = path.resolve(root, process.env.RENEWLY_DATA_DIR || 'data');
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

const baseUrl = (process.env.RENEWLY_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');

export const config = {
  root,
  env,
  production: env === 'production',
  port,
  baseUrl,
  dataDir,
  dbFile: path.join(dataDir, 'renewly.db'),
  secureCookies:
    process.env.RENEWLY_SECURE_COOKIES === 'true' || baseUrl.startsWith('https://'),
  trustProxy: process.env.RENEWLY_TRUST_PROXY === '1',
  ingestDomain: process.env.RENEWLY_INGEST_DOMAIN || 'in.renewly.local',
  sessionTtlDays: 30,
  sessionIdleDays: 7,
  maxBodyBytes: 1024 * 1024,
  masterKey: loadOrCreateMasterKey(
    path.join(dataDir, 'master.key'),
    process.env.RENEWLY_MASTER_KEY
  ),
  emailWebhookSecret:
    process.env.RENEWLY_EMAIL_WEBHOOK_SECRET ||
    loadOrCreateSecret(path.join(dataDir, 'email-webhook.secret')),
  requireEmailSignature: Boolean(process.env.RENEWLY_EMAIL_WEBHOOK_SECRET),
  txnWebhookSecret: process.env.RENEWLY_TXN_WEBHOOK_SECRET || '',
  notifyWebhookUrl: process.env.RENEWLY_NOTIFY_WEBHOOK_URL || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  notifyFrom: process.env.RENEWLY_NOTIFY_FROM || 'Renewly <renewly@localhost>',
  plaid: {
    env: process.env.PLAID_ENV || 'sandbox',
    clientId: process.env.PLAID_CLIENT_ID || '',
    secret: process.env.PLAID_SECRET || '',
    get configured() {
      return Boolean(this.clientId && this.secret);
    },
  },
};

export function isProduction() {
  return config.production;
}
