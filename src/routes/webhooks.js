import { config } from '../config.js';
import { audit, findUserByIngestToken } from '../auth.js';
import { get, nowIso, run } from '../db.js';
import { sha256Hex, verifyHmacSha256Hex } from '../lib/crypto.js';
import { AppError, ValidationError } from '../lib/errors.js';
import { sendJson } from '../http.js';
import { todayInTz } from '../lib/dates.js';
import { parseReceiptEmail } from '../domain/emailParser.js';
import {
  cancelSubscription,
  findSubscriptionForMerchant,
  ingestEmailCandidate,
  ingestTransactions,
} from '../domain/subscriptions.js';
import { syncItem, verifyPlaidWebhook } from '../providers/plaid.js';

function recipientValue(value) {
  if (Array.isArray(value)) return value.join(',');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value || '');
}

function tokenFromRecipient(value) {
  const text = recipientValue(value);
  const match = text.match(/(?:^|[<,\s])renewly\+([A-Za-z0-9_-]{10,})@/i);
  return match ? match[1] : '';
}

function signatureFrom(req) {
  const raw = String(req.headers['x-renewly-signature'] || '').trim();
  if (!raw) return '';
  const eq = raw.lastIndexOf('=');
  return eq >= 0 ? raw.slice(eq + 1) : raw;
}

function bearerFrom(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function dedupe(db, source, eventId) {
  const res = run(
    db,
    `INSERT INTO webhook_events (source, event_id, received_at)
     VALUES (?, ?, ?) ON CONFLICT(source, event_id) DO NOTHING`,
    source,
    eventId,
    nowIso()
  );
  return res.changes > 0;
}

export function registerWebhookRoutes(router) {
  const handleEmail = (ctx) => {
    if (!ctx.limiter.check(`wh-email:${ctx.ip}`, 300, 60_000)) {
      throw new AppError(429, 'Too many webhook requests');
    }

    const signature = signatureFrom(ctx.req);
    if (config.requireEmailSignature || signature) {
      const ok = verifyHmacSha256Hex(
        config.emailWebhookSecret,
        ctx.rawBody.toString('utf8'),
        signature
      );
      if (!ok) throw new AppError(401, 'Invalid webhook signature', 'bad_signature');
    }

    const body = ctx.body;
    const fields = body && typeof body === 'object' ? body : {};
    const raw = typeof body === 'string' ? body : String(fields.raw || '');
    const recipients = fields.to ?? fields.recipient ?? fields.To ?? fields.to_email ?? '';
    const token =
      ctx.params.token ||
      tokenFromRecipient(recipients) ||
      String(ctx.req.headers['x-renewly-token'] || '');

    if (!token) {
      sendJson(ctx.res, 202, { accepted: true });
      return;
    }
    const user = findUserByIngestToken(ctx.db, token);
    if (!user) {
      // Do not reveal whether a token exists.
      sendJson(ctx.res, 202, { accepted: true });
      return;
    }

    const parsed = parseReceiptEmail({
      from: fields.from || fields.sender || fields.From || '',
      to: recipients,
      subject: fields.subject || fields.Subject || '',
      text: fields.text || fields['body-plain'] || fields.TextBody || '',
      html: fields.html || fields['body-html'] || fields.HtmlBody || '',
      raw,
      date: fields.date || fields.Date || '',
      defaultCurrency: user.currency,
      today: todayInTz(user.timezone || 'UTC'),
    });

    const eventId = parsed?.message_id || sha256Hex(ctx.rawBody);
    if (!dedupe(ctx.db, 'email', eventId)) {
      sendJson(ctx.res, 202, { accepted: true, duplicate: true });
      return;
    }
    if (!parsed) {
      sendJson(ctx.res, 202, { accepted: true });
      return;
    }

    if (parsed.cancelled) {
      const sub = findSubscriptionForMerchant(ctx.db, user.id, parsed.merchant_key);
      if (sub) cancelSubscription(ctx.db, user.id, sub.id);
      audit(ctx.db, {
        userId: user.id,
        action: 'email_cancellation',
        ip: ctx.ip,
        meta: { merchant: parsed.merchant_key },
      });
    } else {
      ingestEmailCandidate(ctx.db, user.id, parsed);
      audit(ctx.db, {
        userId: user.id,
        action: 'email_ingested',
        ip: ctx.ip,
        meta: {
          merchant: parsed.merchant_key,
          confidence: parsed.confidence,
        },
      });
    }

    sendJson(ctx.res, 202, { accepted: true });
  };

  router.post('/webhooks/email', handleEmail);
  router.post('/webhooks/email/:token', handleEmail);

  const handleTransactions = (ctx) => {
    if (!ctx.limiter.check(`wh-txn:${ctx.ip}`, 300, 60_000)) {
      throw new AppError(429, 'Too many webhook requests');
    }
    if (config.txnWebhookSecret) {
      const ok = verifyHmacSha256Hex(
        config.txnWebhookSecret,
        ctx.rawBody.toString('utf8'),
        signatureFrom(ctx.req)
      );
      if (!ok) throw new AppError(401, 'Invalid webhook signature', 'bad_signature');
    }

    const token =
      ctx.params.token ||
      bearerFrom(ctx.req) ||
      String(ctx.req.headers['x-renewly-token'] || '');
    const user = findUserByIngestToken(ctx.db, token);
    if (!user) {
      sendJson(ctx.res, 202, { accepted: true });
      return;
    }

    let payload = ctx.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        throw new ValidationError('Expected a JSON body');
      }
    }
    const rows = Array.isArray(payload) ? payload : payload?.transactions;
    if (!Array.isArray(rows)) {
      throw new ValidationError('Body must contain a transactions array');
    }

    const result = ingestTransactions(ctx.db, user.id, rows, {
      provider: 'webhook',
      source: 'bank',
    });
    audit(ctx.db, {
      userId: user.id,
      action: 'transactions_ingested',
      ip: ctx.ip,
      meta: { inserted: result.inserted, candidates: result.candidates },
    });
    sendJson(ctx.res, 202, { accepted: true, ...result });
  };

  router.post('/webhooks/transactions', handleTransactions);
  router.post('/webhooks/transactions/:token', handleTransactions);

  router.post('/webhooks/plaid', async (ctx) => {
    if (!ctx.limiter.check(`wh-plaid:${ctx.ip}`, 120, 60_000)) {
      throw new AppError(429, 'Too many webhook requests');
    }
    if (!config.plaid.configured) {
      sendJson(ctx.res, 503, { ok: false, error: 'Plaid is not configured' });
      return;
    }
    const header = ctx.req.headers['plaid-verification'];
    const valid = await verifyPlaidWebhook(ctx.rawBody, header);
    if (!valid) throw new AppError(401, 'Invalid Plaid verification', 'bad_signature');

    const body = ctx.body && typeof ctx.body === 'object' ? ctx.body : {};
    if (!body.item_id) {
      sendJson(ctx.res, 200, { ok: true });
      return;
    }
    const item = get(
      ctx.db,
      "SELECT * FROM bank_items WHERE provider = 'plaid' AND item_id = ?",
      String(body.item_id)
    );
    if (!item) {
      sendJson(ctx.res, 200, { ok: true });
      return;
    }
    const eventId =
      body.webhook_id ||
      `${body.webhook_type || 'unknown'}:${body.webhook_code || 'unknown'}:${body.item_id}`;
    if (!dedupe(ctx.db, 'plaid', eventId)) {
      sendJson(ctx.res, 200, { ok: true, duplicate: true });
      return;
    }
    const result = await syncItem(ctx.db, item);
    sendJson(ctx.res, 200, { ok: true, ...result });
  });
}
