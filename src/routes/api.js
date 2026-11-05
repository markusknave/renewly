import { config } from '../config.js';
import {
  changePassword,
  deleteAccount,
  rotateCalendarToken,
  rotateIngestToken,
  validCurrency,
  validTimezone,
} from '../auth.js';
import { all, nowIso, run } from '../db.js';
import { AppError, NotFoundError, ValidationError } from '../lib/errors.js';
import { sendJson } from '../http.js';
import { todayInTz } from '../lib/dates.js';
import {
  advanceSubscription,
  annotateSubscription,
  cancelSubscription,
  confirmDetection,
  createSubscription,
  deleteSubscription,
  dismissDetection,
  exportUserData,
  getSubscription,
  ingestTransactions,
  listSubscriptions,
  reactivateSubscription,
  summarize,
  updateSubscription,
} from '../domain/subscriptions.js';
import { rowsFromCsv } from '../domain/importCsv.js';
import { exchangePublicToken, syncItem, syncUserItems } from '../providers/plaid.js';
import { requireUser, respond } from './helpers.js';

function reminderDaysFrom(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new ValidationError('Provide at least one reminder day');
  const nums = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 90)) {
    throw new ValidationError('Reminder days must be whole numbers between 0 and 90');
  }
  return [...new Set(nums)].sort((a, b) => b - a).join(',');
}

const EVENT_LABELS = {
  price_change: 'price updated',
  plan_change: 'plan updated',
  renewed: 'renewal date advanced',
  canceled: 'canceled',
  reactivated: 'reactivated',
};

export function registerApiRoutes(router) {
  // ---- Subscriptions ----
  router.get('/api/subscriptions', (ctx) => {
    const user = requireUser(ctx);
    sendJson(ctx.res, 200, {
      ok: true,
      subscriptions: listSubscriptions(ctx.db, user.id).map(annotateSubscription),
      summary: summarize(ctx.db, user.id, user.currency, user.timezone),
    });
  });

  router.get('/api/subscriptions/:id', (ctx) => {
    const user = requireUser(ctx);
    const sub = getSubscription(ctx.db, user.id, ctx.params.id);
    if (!sub) throw new NotFoundError('Subscription not found');
    sendJson(ctx.res, 200, { ok: true, subscription: annotateSubscription(sub) });
  });

  router.post('/api/subscriptions', (ctx) => {
    const user = requireUser(ctx);
    const sub = createSubscription(ctx.db, user.id, ctx.body || {}, { source: 'manual' });
    respond(ctx, {
      status: 201,
      message: `Added ${sub.merchant_name}.`,
      data: { subscription: sub },
      redirectTo: '/dashboard',
    });
  });

  const updateHandler = (ctx) => {
    const user = requireUser(ctx);
    const result = updateSubscription(ctx.db, user.id, ctx.params.id, ctx.body || {});
    if (!result) throw new NotFoundError('Subscription not found');
    const labels = result.events.map((e) => EVENT_LABELS[e.type]).filter(Boolean);
    respond(ctx, {
      message: labels.length ? `Saved — ${labels.join(', ')}.` : 'Changes saved.',
      data: { subscription: result.subscription, events: result.events },
    });
  };
  router.post('/api/subscriptions/:id', updateHandler);
  router.patch('/api/subscriptions/:id', updateHandler);
  router.put('/api/subscriptions/:id', updateHandler);

  router.post('/api/subscriptions/:id/delete', (ctx) => {
    const user = requireUser(ctx);
    const ok = deleteSubscription(ctx.db, user.id, ctx.params.id);
    if (!ok) throw new NotFoundError('Subscription not found');
    respond(ctx, { message: 'Subscription deleted.' });
  });
  router.delete('/api/subscriptions/:id', (ctx) => {
    const user = requireUser(ctx);
    const ok = deleteSubscription(ctx.db, user.id, ctx.params.id);
    if (!ok) throw new NotFoundError('Subscription not found');
    sendJson(ctx.res, 200, { ok: true, message: 'Subscription deleted.' });
  });

  router.post('/api/subscriptions/:id/advance', (ctx) => {
    const user = requireUser(ctx);
    const sub = advanceSubscription(ctx.db, user.id, ctx.params.id, {
      amount: ctx.body?.amount,
    });
    if (!sub) throw new NotFoundError('Subscription not found');
    respond(ctx, {
      message: `Marked renewed. Next charge ${sub.next_renewal_date}.`,
      data: { subscription: sub },
    });
  });

  router.post('/api/subscriptions/:id/cancel', (ctx) => {
    const user = requireUser(ctx);
    const result = cancelSubscription(ctx.db, user.id, ctx.params.id);
    if (!result) throw new NotFoundError('Subscription not found');
    respond(ctx, { message: 'Subscription canceled.', data: { subscription: result.subscription } });
  });

  router.post('/api/subscriptions/:id/reactivate', (ctx) => {
    const user = requireUser(ctx);
    const sub = reactivateSubscription(ctx.db, user.id, ctx.params.id);
    if (!sub) throw new NotFoundError('Subscription not found');
    respond(ctx, {
      message: `Reactivated. Next charge ${sub.next_renewal_date}.`,
      data: { subscription: sub },
    });
  });

  // ---- Detections ----
  router.post('/api/detections/:id/confirm', (ctx) => {
    const user = requireUser(ctx);
    const result = confirmDetection(ctx.db, user.id, ctx.params.id);
    if (!result) throw new NotFoundError('Detection not found or already handled');
    respond(ctx, {
      message: `${result.subscription.merchant_name} is now tracked.`,
      data: { subscription: result.subscription },
    });
  });

  router.post('/api/detections/:id/dismiss', (ctx) => {
    const user = requireUser(ctx);
    const ok = dismissDetection(ctx.db, user.id, ctx.params.id);
    if (!ok) throw new NotFoundError('Detection not found or already handled');
    respond(ctx, { message: 'Detection dismissed.' });
  });

  // ---- Notifications ----
  router.post('/api/notifications/read', (ctx) => {
    const user = requireUser(ctx);
    run(
      ctx.db,
      'UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL',
      nowIso(),
      user.id
    );
    respond(ctx, { message: 'Reminders marked read.' });
  });

  router.get('/api/notifications', (ctx) => {
    const user = requireUser(ctx);
    const rows = all(
      ctx.db,
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      user.id
    );
    sendJson(ctx.res, 200, { ok: true, notifications: rows });
  });

  // ---- Settings ----
  router.post('/api/settings', (ctx) => {
    const user = requireUser(ctx);
    const body = ctx.body || {};
    const timezone = body.timezone !== undefined ? validTimezone(body.timezone) : user.timezone;
    const currency =
      body.currency !== undefined ? validCurrency(body.currency, user.currency) : user.currency;
    const reminderDays =
      body.reminder_days !== undefined
        ? reminderDaysFrom(body.reminder_days)
        : user.reminder_days;
    run(
      ctx.db,
      'UPDATE users SET timezone = ?, currency = ?, reminder_days = ? WHERE id = ?',
      timezone,
      currency,
      reminderDays,
      user.id
    );
    run(ctx.db, "DELETE FROM reminders WHERE user_id = ? AND status = 'pending'", user.id);
    respond(ctx, {
      message: 'Settings saved.',
      data: { timezone, currency, reminder_days: reminderDays },
      redirectTo: '/settings',
    });
  });
  router.patch('/api/settings', (ctx) => {
    const user = requireUser(ctx);
    const body = ctx.body || {};
    const timezone = body.timezone !== undefined ? validTimezone(body.timezone) : user.timezone;
    const currency =
      body.currency !== undefined ? validCurrency(body.currency, user.currency) : user.currency;
    const reminderDays =
      body.reminder_days !== undefined
        ? reminderDaysFrom(body.reminder_days)
        : user.reminder_days;
    run(
      ctx.db,
      'UPDATE users SET timezone = ?, currency = ?, reminder_days = ? WHERE id = ?',
      timezone,
      currency,
      reminderDays,
      user.id
    );
    sendJson(ctx.res, 200, { ok: true, timezone, currency, reminder_days: reminderDays });
  });

  router.post('/api/settings/password', (ctx) => {
    const user = requireUser(ctx);
    const body = ctx.body || {};
    changePassword(ctx.db, user.id, body.current_password, body.new_password, ctx.ip);
    ctx.clearSessionCookie();
    respond(ctx, {
      message: 'Password updated. Please sign in again.',
      data: { reauth: true },
      redirectTo: '/login',
    });
  });

  router.post('/api/settings/rotate-ingest', (ctx) => {
    const user = requireUser(ctx);
    rotateIngestToken(ctx.db, user.id);
    respond(ctx, {
      message: 'Forwarding address rotated.',
      redirectTo: '/settings',
    });
  });

  router.post('/api/settings/rotate-calendar', (ctx) => {
    const user = requireUser(ctx);
    rotateCalendarToken(ctx.db, user.id);
    respond(ctx, {
      message: 'Calendar link rotated.',
      redirectTo: '/settings',
    });
  });

  // ---- CSV import ----
  router.post('/api/import/csv', (ctx) => {
    const user = requireUser(ctx);
    const body = ctx.body;
    const csv =
      typeof body === 'string'
        ? body
        : String(body?.csv || '');
    if (!csv || csv.trim().length < 10) {
      throw new ValidationError('Choose a CSV file or paste CSV text first');
    }
    const parsed = rowsFromCsv(csv, {
      defaultCurrency: user.currency,
      today: todayInTz(user.timezone || 'UTC'),
    });
    if (parsed.error) throw new ValidationError(parsed.error);
    if (!parsed.rows.length) {
      throw new ValidationError('No usable rows found. Need merchant, date, and amount columns.');
    }
    const result = ingestTransactions(ctx.db, user.id, parsed.rows, {
      provider: 'csv',
      source: 'csv',
    });
    respond(ctx, {
      message: `Imported ${result.inserted} transactions; analyzed ${result.candidates} recurring stream(s).`,
      data: result,
      redirectTo: '/dashboard',
    });
  });

  // ---- Export & account ----
  router.get('/api/export', (ctx) => {
    const user = requireUser(ctx);
    const payload = JSON.stringify(exportUserData(ctx.db, user.id), null, 2);
    const filename = `renewly-export-${todayInTz(user.timezone || 'UTC')}.json`;
    ctx.res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'content-length': Buffer.byteLength(payload),
    });
    ctx.res.end(payload);
  });

  router.post('/api/account/delete', (ctx) => {
    const user = requireUser(ctx);
    deleteAccount(ctx.db, user.id, ctx.body?.password, ctx.ip);
    ctx.clearSessionCookie();
    respond(ctx, {
      message: 'Your account and all data were deleted.',
      data: { deleted: true },
      redirectTo: '/register',
    });
  });

  // ---- Optional Plaid bank aggregation ----
  router.post('/api/bank/plaid/link-token', async (ctx) => {
    const user = requireUser(ctx);
    if (!config.plaid.configured) throw new AppError(501, 'Plaid is not configured');
    const { createLinkToken } = await import('../providers/plaid.js');
    const data = await createLinkToken(user.id);
    sendJson(ctx.res, 200, { ok: true, ...data });
  });

  router.post('/api/bank/plaid/exchange', async (ctx) => {
    const user = requireUser(ctx);
    if (!config.plaid.configured) throw new AppError(501, 'Plaid is not configured');
    const publicToken = ctx.body?.public_token;
    if (!publicToken) throw new ValidationError('public_token is required');
    const item = await exchangePublicToken(ctx.db, user.id, publicToken);
    const synced = await syncItem(ctx.db, item);
    sendJson(ctx.res, 200, { ok: true, item_id: item.item_id, ...synced });
  });

  router.post('/api/bank/plaid/sync', async (ctx) => {
    const user = requireUser(ctx);
    if (!config.plaid.configured) throw new AppError(501, 'Plaid is not configured');
    const result = await syncUserItems(ctx.db, user.id);
    sendJson(ctx.res, 200, { ok: true, ...result });
  });
}
