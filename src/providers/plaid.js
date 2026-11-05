import crypto from 'node:crypto';
import { config } from '../config.js';
import { all, get, nowIso, run } from '../db.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import { ingestTransactions } from '../domain/subscriptions.js';

const BASE_URLS = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
};

function baseUrl() {
  return BASE_URLS[config.plaid.env] || BASE_URLS.sandbox;
}

async function plaidRequest(pathname, body, { timeout = 15000 } = {}) {
  if (!config.plaid.configured) {
    const err = new Error('Plaid is not configured');
    err.status = 501;
    throw err;
  }
  const res = await fetch(`${baseUrl()}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: config.plaid.clientId,
      secret: config.plaid.secret,
      ...body,
    }),
    signal: AbortSignal.timeout(timeout),
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = {};
  }
  if (!res.ok) {
    const err = new Error(
      `Plaid ${pathname} failed (${res.status}): ${data.error_message || text.slice(0, 200)}`
    );
    err.status = 502;
    err.code = 'plaid_error';
    throw err;
  }
  return data;
}

export async function createLinkToken(userId) {
  return plaidRequest('/link/token/create', {
    client_name: 'Renewly',
    products: ['transactions'],
    country_codes: ['US', 'CA', 'GB'],
    language: 'en',
    user: { client_user_id: String(userId) },
  });
}

export async function exchangePublicToken(db, userId, publicToken) {
  const result = await plaidRequest('/item/public_token/exchange', {
    public_token: publicToken,
  });
  const enc = encrypt(result.access_token, config.masterKey);
  run(
    db,
    `INSERT INTO bank_items (user_id, provider, item_id, access_token_enc, cursor, created_at)
     VALUES (?, 'plaid', ?, ?, NULL, ?)
     ON CONFLICT(provider, item_id) DO UPDATE SET access_token_enc = excluded.access_token_enc`,
    userId,
    result.item_id,
    enc,
    nowIso()
  );
  return get(db, "SELECT * FROM bank_items WHERE provider = 'plaid' AND item_id = ?", result.item_id);
}

export async function syncItem(db, item) {
  const accessToken = decrypt(item.access_token_enc, config.masterKey);
  let cursor = item.cursor || undefined;
  const added = [];
  let hasMore = true;
  let guard = 0;
  while (hasMore && guard < 20) {
    const page = await plaidRequest('/transactions/sync', {
      access_token: accessToken,
      cursor,
      count: 500,
    });
    added.push(...(page.added || []));
    cursor = page.next_cursor;
    hasMore = Boolean(page.has_more);
    guard += 1;
  }
  const rows = added.map((t) => ({
    merchant_raw: t.merchant_name || t.name || 'Unknown merchant',
    amount_cents: Math.round(Math.abs(Number(t.amount) || 0) * 100),
    currency: t.iso_currency_code || t.unofficial_currency_code || 'USD',
    posted_date: t.authorized_date || t.date,
    external_id: t.transaction_id,
    account_label: t.account_id,
  }));
  const result = ingestTransactions(db, item.user_id, rows, {
    provider: 'plaid',
    source: 'bank',
  });
  run(db, 'UPDATE bank_items SET cursor = ? WHERE id = ?', cursor, item.id);
  return result;
}

export async function syncUserItems(db, userId) {
  const items = all(
    db,
    "SELECT * FROM bank_items WHERE user_id = ? AND provider = 'plaid'",
    userId
  );
  const results = [];
  for (const item of items) {
    results.push({ item_id: item.item_id, ...(await syncItem(db, item)) });
  }
  return { items: results.length, results };
}

const keyCache = new Map();

async function fetchVerificationKey(kid) {
  const cached = keyCache.get(kid);
  if (cached && cached.expires > Date.now()) return cached.key;
  const result = await plaidRequest('/webhook_verification_key/get', { key_id: kid });
  keyCache.set(kid, { key: result.key, expires: Date.now() + 5 * 60 * 1000 });
  return result.key;
}

/**
 * Verifies Plaid's `Plaid-Verification` JWT (ES256), including the body hash and
 * issue time. `fetchKey` is injectable for testing.
 */
export async function verifyPlaidWebhook(rawBody, jwt, { fetchKey } = {}) {
  try {
    if (!jwt || typeof jwt !== 'string') return false;
    const parts = jwt.split('.');
    if (parts.length !== 3) return false;
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (header.alg !== 'ES256' || !header.kid) return false;

    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(payload.iat) || Math.abs(now - payload.iat) > 300) return false;

    const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    if (payload.request_body_sha256 !== bodyHash) return false;

    const jwk = fetchKey ? await fetchKey(header.kid) : await fetchVerificationKey(header.kid);
    if (!jwk) return false;
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    return crypto.verify(
      'sha256',
      Buffer.from(`${headerB64}.${payloadB64}`),
      { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signatureB64, 'base64url')
    );
  } catch {
    return false;
  }
}
