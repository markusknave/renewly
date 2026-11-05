import { all, get, nowIso, run, transaction } from '../db.js';
import {
  addCadence,
  addDays,
  isValidIsoDate,
  monthlyCents,
  normalizeCadence,
  parseNumericAmount,
  todayInTz,
  yearlyCents,
} from '../lib/dates.js';
import { ValidationError } from '../lib/errors.js';
import { sha256Hex } from '../lib/crypto.js';
import { getMerchant, normalizeMerchant, slugify } from './merchants.js';
import { analyzeStream, groupByMerchant } from './recurring.js';

export const SUB_STATUSES = new Set([
  'active',
  'trial',
  'paused',
  'canceled',
  'needs_review',
]);

const ACTIVE_STATUSES = new Set(['active', 'trial', 'needs_review']);
const AUTO_EMAIL_CONFIDENCE = 0.7;
const AUTO_BANK_CONFIDENCE = 0.85;

function str(value, max = 500) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\u0000/g, '').trim().slice(0, max);
}

function optionalStr(value, max = 500) {
  const s = str(value, max);
  return s || null;
}

function centsFrom(value, alreadyCents = false) {
  if (value === undefined || value === null || value === '') return 0;
  if (alreadyCents) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.round(n));
  }
  const parsed = parseNumericAmount(String(value));
  if (parsed !== null) return parsed;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0;
}

function currencyFrom(value, fallback = 'USD') {
  const c = String(value || fallback || 'USD').toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : 'USD';
}

function dateOrNull(value) {
  if (!value) return null;
  const s = String(value).trim().slice(0, 10);
  if (!isValidIsoDate(s)) {
    throw new ValidationError(`Invalid date: ${s}`);
  }
  return s;
}

function normalizePlan(value) {
  return optionalStr(value, 120);
}

function customDaysFrom(value, cadence) {
  if (cadence !== 'custom') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 3650) {
    throw new ValidationError('Custom interval must be between 1 and 3650 days');
  }
  return Math.round(n);
}

export function normalizeSubscriptionInput(input = {}, defaults = {}) {
  const name = str(input.merchant_name ?? input.merchant ?? input.name, 120);
  if (!name) throw new ValidationError('Merchant name is required');
  const known = getMerchant(input.merchant_key);
  const normalized = known || normalizeMerchant(name);
  const merchantKey = slugify(input.merchant_key || normalized.key || name);

  let amountCents;
  if (input.amount_cents !== undefined && input.amount_cents !== null) {
    amountCents = centsFrom(input.amount_cents, true);
  } else {
    amountCents = centsFrom(input.amount, false);
  }
  if (amountCents > 100_000_000) {
    throw new ValidationError('Amount is too large');
  }

  const rawCadence = input.cadence || defaults.cadence || 'monthly';
  const cadence = normalizeCadence(rawCadence, input.custom_interval_days);
  const customIntervalDays = customDaysFrom(
    input.custom_interval_days ?? defaults.custom_interval_days,
    cadence
  );

  const status = String(input.status || defaults.status || 'active').toLowerCase();
  if (!SUB_STATUSES.has(status)) throw new ValidationError('Invalid status');

  return {
    merchant_key: merchantKey,
    merchant_name: str(input.merchant_name ?? normalized.name, 120),
    plan_name: normalizePlan(input.plan_name),
    amount_cents: amountCents,
    currency: currencyFrom(input.currency, defaults.currency),
    cadence,
    custom_interval_days: customIntervalDays,
    status,
    next_renewal_date: dateOrNull(input.next_renewal_date),
    started_on: dateOrNull(input.started_on),
    last_charge_date: dateOrNull(input.last_charge_date),
    notes: optionalStr(input.notes, 2000),
  };
}

export function recordEvent(db, userId, subscriptionId, type, { amountCents, currency, effectiveDate, meta } = {}) {
  run(
    db,
    `INSERT INTO subscription_events
      (user_id, subscription_id, type, amount_cents, currency, effective_date, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    subscriptionId,
    type,
    amountCents ?? null,
    currency ?? null,
    effectiveDate ?? null,
    meta ? JSON.stringify(meta) : null,
    nowIso()
  );
}

export function getSubscription(db, userId, id) {
  return get(db, 'SELECT * FROM subscriptions WHERE id = ? AND user_id = ?', Number(id), userId) || null;
}

export function listSubscriptions(db, userId) {
  return all(
    db,
    `SELECT * FROM subscriptions WHERE user_id = ?
     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'trial' THEN 1 WHEN 'needs_review' THEN 2
       WHEN 'paused' THEN 3 ELSE 4 END,
       next_renewal_date IS NULL, next_renewal_date, merchant_name`,
    userId
  );
}

export function createSubscription(db, userId, input, { source = 'manual', confidence = 1 } = {}) {
  const data = normalizeSubscriptionInput(input);
  if (!data.next_renewal_date && data.started_on) {
    data.next_renewal_date = addCadence(
      data.started_on,
      data.cadence,
      data.custom_interval_days || 30
    );
  }
  if (!data.next_renewal_date && data.status === 'active') {
    const today = todayInTz('UTC');
    data.next_renewal_date = addCadence(today, data.cadence, data.custom_interval_days || 30);
  }
  const now = nowIso();
  const res = run(
    db,
    `INSERT INTO subscriptions
      (user_id, merchant_key, merchant_name, plan_name, amount_cents, currency, cadence,
       custom_interval_days, status, next_renewal_date, started_on, last_charge_date, notes,
       source, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    data.merchant_key,
    data.merchant_name,
    data.plan_name,
    data.amount_cents,
    data.currency,
    data.cadence,
    data.custom_interval_days,
    data.status,
    data.next_renewal_date,
    data.started_on,
    data.last_charge_date,
    data.notes,
    source,
    confidence,
    now,
    now
  );
  const id = Number(res.lastInsertRowid);
  recordEvent(db, userId, id, 'created', {
    amountCents: data.amount_cents,
    currency: data.currency,
    effectiveDate: data.started_on,
    meta: { source },
  });
  return getSubscription(db, userId, id);
}

export function updateSubscription(db, userId, id, input) {
  const existing = getSubscription(db, userId, id);
  if (!existing) return null;
  const merged = {
    merchant_name: input.merchant_name ?? existing.merchant_name,
    merchant_key: input.merchant_key ?? existing.merchant_key,
    plan_name: input.plan_name !== undefined ? input.plan_name : existing.plan_name,
    amount_cents:
      input.amount_cents !== undefined || input.amount !== undefined
        ? input.amount_cents !== undefined
          ? input.amount_cents
          : input.amount
        : existing.amount_cents,
    currency: input.currency ?? existing.currency,
    cadence: input.cadence ?? existing.cadence,
    custom_interval_days:
      input.custom_interval_days !== undefined
        ? input.custom_interval_days
        : existing.custom_interval_days,
    status: input.status ?? existing.status,
    next_renewal_date:
      input.next_renewal_date !== undefined
        ? input.next_renewal_date
        : existing.next_renewal_date,
    started_on: input.started_on !== undefined ? input.started_on : existing.started_on,
    last_charge_date:
      input.last_charge_date !== undefined
        ? input.last_charge_date
        : existing.last_charge_date,
    notes: input.notes !== undefined ? input.notes : existing.notes,
  };
  if (
    input.amount_cents === undefined &&
    input.amount !== undefined
  ) {
    merged.amount_cents = centsFrom(input.amount, false);
  }
  const data = normalizeSubscriptionInput(merged, { currency: existing.currency });

  const events = [];
  if (data.amount_cents !== existing.amount_cents) {
    events.push({
      type: 'price_change',
      meta: { from_cents: existing.amount_cents, to_cents: data.amount_cents },
      amountCents: data.amount_cents,
      currency: data.currency,
    });
  }
  if ((data.plan_name || '') !== (existing.plan_name || '')) {
    events.push({
      type: 'plan_change',
      meta: { from: existing.plan_name, to: data.plan_name },
    });
  }
  if (
    ACTIVE_STATUSES.has(existing.status) &&
    data.status === 'canceled'
  ) {
    events.push({ type: 'canceled', meta: {} });
  }
  if (
    (existing.status === 'canceled' || existing.status === 'paused') &&
    ACTIVE_STATUSES.has(data.status)
  ) {
    events.push({ type: 'reactivated', meta: {} });
  }
  if (
    data.next_renewal_date &&
    existing.next_renewal_date &&
    data.next_renewal_date > existing.next_renewal_date &&
    ACTIVE_STATUSES.has(data.status)
  ) {
    events.push({
      type: 'renewed',
      meta: { from: existing.next_renewal_date, to: data.next_renewal_date },
      effectiveDate: data.next_renewal_date,
    });
  }

  const now = nowIso();
  run(
    db,
    `UPDATE subscriptions SET
       merchant_key = ?, merchant_name = ?, plan_name = ?, amount_cents = ?, currency = ?,
       cadence = ?, custom_interval_days = ?, status = ?, next_renewal_date = ?, started_on = ?,
       last_charge_date = ?, notes = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    data.merchant_key,
    data.merchant_name,
    data.plan_name,
    data.amount_cents,
    data.currency,
    data.cadence,
    data.custom_interval_days,
    data.status,
    data.next_renewal_date,
    data.started_on,
    data.last_charge_date,
    data.notes,
    now,
    Number(id),
    userId
  );
  for (const ev of events) {
    recordEvent(db, userId, Number(id), ev.type, {
      amountCents: ev.amountCents,
      currency: ev.currency,
      effectiveDate: ev.effectiveDate,
      meta: ev.meta,
    });
  }
  if (data.next_renewal_date !== existing.next_renewal_date) {
    run(
      db,
      "DELETE FROM reminders WHERE subscription_id = ? AND status = 'pending'",
      Number(id)
    );
  }
  return { subscription: getSubscription(db, userId, id), events };
}

export function deleteSubscription(db, userId, id) {
  const res = run(db, 'DELETE FROM subscriptions WHERE id = ? AND user_id = ?', Number(id), userId);
  return res.changes > 0;
}

export function cancelSubscription(db, userId, id) {
  return updateSubscription(db, userId, id, { status: 'canceled' });
}

export function reactivateSubscription(db, userId, id) {
  const existing = getSubscription(db, userId, id);
  if (!existing) return null;
  const today = todayInTz('UTC');
  let next = existing.next_renewal_date;
  if (!next || next < today) {
    next = addCadence(today, existing.cadence, existing.custom_interval_days || 30);
  }
  return updateSubscription(db, userId, id, {
    status: 'active',
    next_renewal_date: next,
  });
}

export function advanceSubscription(db, userId, id, { amount } = {}) {
  const existing = getSubscription(db, userId, id);
  if (!existing) return null;
  const today = todayInTz('UTC');
  let base = existing.next_renewal_date || today;
  let next = addCadence(base, existing.cadence, existing.custom_interval_days || 30);
  let guard = 0;
  while (next <= today && guard < 120) {
    base = next;
    next = addCadence(next, existing.cadence, existing.custom_interval_days || 30);
    guard += 1;
  }
  const patch = {
    status: 'active',
    last_charge_date: base,
    next_renewal_date: next,
  };
  if (amount !== undefined) patch.amount = amount;
  return updateSubscription(db, userId, id, patch);
}

export function findSubscriptionForMerchant(db, userId, merchantKey) {
  return (
    get(
      db,
      `SELECT * FROM subscriptions WHERE user_id = ? AND merchant_key = ?
       ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'trial' THEN 1 WHEN 'needs_review' THEN 2
         WHEN 'paused' THEN 3 ELSE 4 END, id DESC
       LIMIT 1`,
      userId,
      merchantKey
    ) || null
  );
}

export function listDetections(db, userId) {
  return all(
    db,
    `SELECT * FROM detections WHERE user_id = ? AND status = 'pending'
     ORDER BY confidence DESC, created_at DESC`,
    userId
  );
}

export function getDetection(db, userId, id) {
  return (
    get(db, 'SELECT * FROM detections WHERE id = ? AND user_id = ?', Number(id), userId) || null
  );
}

export function dismissDetection(db, userId, id) {
  const res = run(
    db,
    `UPDATE detections SET status = 'dismissed', updated_at = ?
     WHERE id = ? AND user_id = ? AND status = 'pending'`,
    nowIso(),
    Number(id),
    userId
  );
  return res.changes > 0;
}

export function applyDetection(db, userId, detection, { auto = false } = {}) {
  return transaction(db, () => {
    const now = nowIso();
    const existing = findSubscriptionForMerchant(db, userId, detection.merchant_key);
    const amount = detection.amount_cents;
    const currency = detection.currency || 'USD';
    const cadence = detection.cadence || 'monthly';
    const nextDate = detection.next_renewal_date || null;
    let subscription;
    let created = false;
    const changes = [];

    if (existing) {
      const patch = {};
      if (amount !== null && amount !== undefined && amount !== existing.amount_cents) {
        patch.amount_cents = amount;
        changes.push('amount');
      }
      if (currency && currency !== existing.currency) patch.currency = currency;
      if (cadence && cadence !== existing.cadence) {
        patch.cadence = cadence;
        changes.push('cadence');
      }
      if (detection.plan_name && detection.plan_name !== existing.plan_name) {
        patch.plan_name = detection.plan_name;
        changes.push('plan');
      }
      if (nextDate && nextDate !== existing.next_renewal_date) {
        patch.next_renewal_date = nextDate;
        changes.push('date');
      }
      if (['canceled', 'paused', 'needs_review'].includes(existing.status)) {
        patch.status = 'active';
        changes.push('reactivated');
      }
      if (Object.keys(patch).length) {
        const result = updateSubscription(db, userId, existing.id, patch);
        subscription = result.subscription;
      } else {
        subscription = existing;
      }
    } else {
      subscription = createSubscription(
        db,
        userId,
        {
          merchant_key: detection.merchant_key,
          merchant_name: detection.merchant_name,
          plan_name: detection.plan_name,
          amount_cents: amount ?? 0,
          currency,
          cadence,
          next_renewal_date: nextDate,
          started_on: null,
          last_charge_date: detection.source === 'bank' ? null : null,
          status: 'active',
        },
        { source: detection.source, confidence: detection.confidence }
      );
      created = true;
      changes.push('created');
    }

    run(
      db,
      `UPDATE detections SET status = 'confirmed', updated_at = ? WHERE id = ? AND user_id = ?`,
      now,
      detection.id,
      userId
    );

    if (created || changes.length) {
      const bits = [];
      if (created) bits.push('Added to your subscriptions');
      if (changes.includes('amount')) bits.push('price updated');
      if (changes.includes('plan')) bits.push('plan updated');
      if (changes.includes('date')) bits.push('renewal date updated');
      if (changes.includes('reactivated')) bits.push('reactivated');
      const title = created
        ? `New subscription detected: ${detection.merchant_name}`
        : `${detection.merchant_name} updated`;
      run(
        db,
        `INSERT INTO notifications (user_id, subscription_id, type, title, body, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        userId,
        subscription.id,
        created ? 'detected' : 'updated',
        title,
        `${bits.join(', ') || 'Details refreshed'}.${auto ? ' Applied automatically.' : ''}`,
        now
      );
    }

    return { subscription, created, changes };
  });
}

export function upsertDetection(db, userId, candidate, { source, autoThreshold, requireKnown = false } = {}) {
  const merchantKey = slugify(candidate.merchant_key);
  const merchantName = str(candidate.merchant_name, 120) || merchantKey;
  const planKey = slugify(candidate.plan_name || 'default');
  const dedupeKey = candidate.dedupe_key || `${merchantKey}:${planKey}`;
  const confidence = Math.max(0, Math.min(0.99, Number(candidate.confidence) || 0.4));
  const now = nowIso();

  const existingSub = findSubscriptionForMerchant(db, userId, merchantKey);
  const auto =
    (confidence >= (autoThreshold ?? Infinity) && (!requireKnown || candidate.known)) ||
    (Boolean(existingSub) && confidence >= 0.55);

  const existing = get(
    db,
    'SELECT * FROM detections WHERE user_id = ? AND dedupe_key = ?',
    userId,
    dedupeKey
  );

  if (existing && existing.status === 'dismissed' && !auto) {
    return { skipped: true, reason: 'dismissed' };
  }

  const fields = [
    merchantKey,
    merchantName,
    candidate.plan_name || null,
    candidate.amount_cents ?? null,
    candidate.currency || null,
    candidate.cadence || null,
    candidate.next_renewal_date || null,
    candidate.evidence ? JSON.stringify(candidate.evidence) : null,
    confidence,
    source,
    now,
  ];

  let detectionId;
  if (existing) {
    run(
      db,
      `UPDATE detections SET merchant_key = ?, merchant_name = ?, plan_name = ?, amount_cents = ?,
         currency = ?, cadence = ?, next_renewal_date = ?, evidence_json = ?, confidence = ?,
         source = ?, updated_at = ?, status = CASE WHEN status = 'confirmed' THEN 'confirmed'
           WHEN ? = 1 THEN 'pending' ELSE status END
       WHERE id = ? AND user_id = ?`,
      ...fields.slice(0, 10),
      now,
      auto ? 0 : 1,
      existing.id,
      userId
    );
    detectionId = existing.id;
  } else {
    const res = run(
      db,
      `INSERT INTO detections
        (user_id, dedupe_key, merchant_key, merchant_name, plan_name, amount_cents, currency,
         cadence, next_renewal_date, evidence_json, confidence, status, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      userId,
      dedupeKey,
      ...fields,
      now
    );
    detectionId = Number(res.lastInsertRowid);
  }

  let applied = null;
  if (auto) {
    const detection = getDetection(db, userId, detectionId);
    if (detection) applied = applyDetection(db, userId, detection, { auto: true });
  }

  return { detectionId, auto, applied };
}

export function confirmDetection(db, userId, id) {
  const detection = getDetection(db, userId, id);
  if (!detection || detection.status !== 'pending') return null;
  return applyDetection(db, userId, detection, { auto: false });
}

export function ingestTransactions(db, userId, rows, { provider = 'import', source = 'bank' } = {}) {
  if (!Array.isArray(rows)) throw new ValidationError('Transactions must be an array');
  let inserted = 0;
  let skipped = 0;
  const now = nowIso();

  transaction(db, () => {
    for (const row of rows.slice(0, 5000)) {
      const raw = str(row.merchant_raw ?? row.description ?? row.merchant, 200);
      if (!raw) {
        skipped += 1;
        continue;
      }
      const posted = String(row.posted_date ?? row.date ?? '').slice(0, 10);
      if (!isValidIsoDate(posted)) {
        skipped += 1;
        continue;
      }
      const amount = Math.abs(
        `${row.amount_cents ?? ''}` !== ''
          ? Math.round(Number(row.amount_cents) || 0)
          : centsFrom(row.amount, false)
      );
      const currency = currencyFrom(row.currency, 'USD');
      const merchant = normalizeMerchant(raw);
      const externalId =
        str(row.external_id ?? row.transaction_id ?? row.id, 200) ||
        sha256Hex(`${provider}|${raw}|${posted}|${amount}|${currency}`).slice(0, 32);
      const res = run(
        db,
        `INSERT INTO transactions
          (user_id, provider, provider_txn_id, merchant_raw, merchant_key, merchant_name,
           amount_cents, currency, posted_date, account_label, meta_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, provider, provider_txn_id) DO NOTHING`,
        userId,
        provider,
        externalId,
        raw,
        merchant.key,
        merchant.name,
        amount,
        currency,
        posted,
        str(row.account_label ?? row.account, 120) || null,
        row.meta ? JSON.stringify(row.meta) : null,
        now
      );
      if (res.changes > 0) inserted += 1;
      else skipped += 1;
    }
  });

  const tx = all(
    db,
    `SELECT merchant_key, merchant_name, amount_cents, currency, posted_date
     FROM transactions WHERE user_id = ? ORDER BY merchant_key, posted_date`,
    userId
  );
  const groups = groupByMerchant(tx);
  const candidates = [];
  const results = [];
  for (const [merchantKey, group] of groups) {
    const analysis = analyzeStream(group);
    if (!analysis) continue;
    if (analysis.confidence < 0.4) continue;
    const merchant = getMerchant(merchantKey);
    const candidate = {
      merchant_key: merchantKey,
      merchant_name: group[group.length - 1].merchant_name,
      plan_name: null,
      amount_cents: analysis.priceChange
        ? analysis.priceChange.to_cents
        : analysis.medianAmountCents,
      currency: analysis.currency,
      cadence: analysis.cadence,
      next_renewal_date: analysis.nextDate,
      confidence: analysis.confidence,
      known: Boolean(merchant),
      evidence: {
        chargeCount: analysis.chargeCount,
        intervalDays: analysis.intervalDays,
        consistency: analysis.consistency,
        amountConsistency: analysis.amountConsistency,
        priceChange: analysis.priceChange,
        reactivated: analysis.reactivated,
      },
    };
    candidates.push(candidate);
    results.push(
      upsertDetection(db, userId, candidate, {
        source,
        autoThreshold: AUTO_BANK_CONFIDENCE,
        requireKnown: true,
      })
    );
  }

  return { inserted, skipped, candidates: candidates.length, results };
}

export function ingestEmailCandidate(db, userId, candidate) {
  return upsertDetection(db, userId, candidate, {
    source: 'email',
    autoThreshold: AUTO_EMAIL_CONFIDENCE,
    requireKnown: false,
  });
}

export function annotateSubscription(row) {
  const merchant = getMerchant(row.merchant_key);
  const monthly = monthlyCents(row.amount_cents, row.cadence, row.custom_interval_days || 30);
  return {
    ...row,
    category: merchant?.category || 'Other',
    site: merchant?.site || null,
    cancel_url: merchant?.cancelUrl || null,
    monthly_cents: monthly,
    yearly_cents: yearlyCents(row.amount_cents, row.cadence, row.custom_interval_days || 30),
  };
}

export function summarize(db, userId, currency = 'USD', timeZone = 'UTC') {
  const subs = listSubscriptions(db, userId).map(annotateSubscription);
  const today = todayInTz(timeZone);
  const active = subs.filter((s) => ACTIVE_STATUSES.has(s.status));
  const byCurrency = new Map();
  for (const s of active) {
    byCurrency.set(
      s.currency,
      (byCurrency.get(s.currency) || 0) + monthlyCents(s.amount_cents, s.cadence, s.custom_interval_days || 30)
    );
  }
  const byCategory = new Map();
  for (const s of active) {
    if (s.currency !== currency) continue;
    const key = s.category || 'Other';
    byCategory.set(key, (byCategory.get(key) || 0) + s.monthly_cents);
  }
  const upcoming = active
    .filter((s) => s.next_renewal_date && s.next_renewal_date >= today && s.next_renewal_date <= addDays(today, 30))
    .sort((a, b) => a.next_renewal_date.localeCompare(b.next_renewal_date));
  const next = active
    .filter((s) => s.next_renewal_date)
    .sort((a, b) => a.next_renewal_date.localeCompare(b.next_renewal_date))[0] || null;
  const pending = get(db, "SELECT COUNT(*) AS n FROM detections WHERE user_id = ? AND status = 'pending'", userId);

  return {
    today,
    currency,
    active_count: active.length,
    total_count: subs.length,
    canceled_count: subs.filter((s) => s.status === 'canceled').length,
    monthly_by_currency: [...byCurrency.entries()].map(([curr, cents]) => ({ currency: curr, cents })),
    monthly_cents: byCurrency.get(currency) || 0,
    yearly_cents: (byCurrency.get(currency) || 0) * 12,
    next,
    upcoming,
    by_category: [...byCategory.entries()]
      .map(([category, cents]) => ({ category, cents }))
      .sort((a, b) => b.cents - a.cents),
    pending_detections: pending?.n || 0,
  };
}

export function dashboardData(db, user) {
  const subs = listSubscriptions(db, user.id).map(annotateSubscription);
  const today = todayInTz(user.timezone || 'UTC');
  const decorated = subs.map((s) => {
    let days = null;
    if (s.next_renewal_date) {
      days = Math.round(
        (Date.parse(`${s.next_renewal_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
          86400000
      );
    }
    return { ...s, days_until: days };
  });
  const detections = listDetections(db, user.id);
  const notifications = all(
    db,
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
    user.id
  );
  return {
    subscriptions: decorated,
    detections,
    notifications,
    unread: notifications.filter((n) => !n.read_at).length,
    summary: summarize(db, user.id, user.currency || 'USD', user.timezone || 'UTC'),
  };
}

export function exportUserData(db, userId) {
  const user = get(
    db,
    `SELECT id, email, timezone, currency, reminder_days, created_at FROM users WHERE id = ?`,
    userId
  );
  return {
    exported_at: nowIso(),
    user,
    subscriptions: all(db, 'SELECT * FROM subscriptions WHERE user_id = ?', userId),
    events: all(db, 'SELECT * FROM subscription_events WHERE user_id = ?', userId),
    detections: all(db, 'SELECT * FROM detections WHERE user_id = ?', userId),
    transactions: all(db, 'SELECT * FROM transactions WHERE user_id = ?', userId),
    notifications: all(db, 'SELECT * FROM notifications WHERE user_id = ?', userId),
  };
}
