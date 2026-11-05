import {
  addCadence,
  addDays,
  cadenceFromIntervalDays,
  daysBetween,
  isValidIsoDate,
} from '../lib/dates.js';

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  let bestCount = -1;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

const STANDARD_CADENCES = new Set([
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
]);

/**
 * Analyze a stream of charges for one merchant and decide whether it looks
 * like a recurring subscription. Returns null when there is not enough signal.
 */
export function analyzeStream(transactions) {
  if (!Array.isArray(transactions)) return null;
  const rows = transactions
    .filter(
      (t) =>
        t &&
        isValidIsoDate(String(t.posted_date)) &&
        Number.isFinite(Number(t.amount_cents)) &&
        Number(t.amount_cents) >= 0
    )
    .slice()
    .sort((a, b) => String(a.posted_date).localeCompare(String(b.posted_date)));

  if (rows.length < 2) return null;

  const amounts = rows.map((r) => Math.round(Number(r.amount_cents)));
  const dates = rows.map((r) => String(r.posted_date));
  const intervals = [];
  for (let i = 1; i < dates.length; i += 1) {
    const d = daysBetween(dates[i - 1], dates[i]);
    if (d !== null && d > 0) intervals.push(d);
  }
  if (!intervals.length) return null;

  const medianInterval = median(intervals);
  if (!medianInterval) return null;

  const intervalTolerance = Math.max(4, medianInterval * 0.15);
  const consistentIntervals = intervals.filter(
    (d) => Math.abs(d - medianInterval) <= intervalTolerance
  ).length;
  const consistency = consistentIntervals / intervals.length;

  const medianAmount = median(amounts);
  if (!medianAmount || medianAmount <= 0) {
    // Free trials produce $0 charges; treat as low confidence.
    return null;
  }
  const amountTolerance = Math.max(50, medianAmount * 0.05);
  const amountConsistency =
    amounts.filter((a) => Math.abs(a - medianAmount) <= amountTolerance).length /
    amounts.length;

  let cadence = cadenceFromIntervalDays(medianInterval);
  let customIntervalDays = null;
  if (!cadence || (!STANDARD_CADENCES.has(cadence) && cadence !== 'custom')) {
    cadence = 'custom';
    customIntervalDays = Math.round(medianInterval);
  } else if (cadence === 'custom') {
    customIntervalDays = Math.round(medianInterval);
  }

  const chargeCount = rows.length;
  let confidence =
    0.35 + 0.15 * Math.min(chargeCount - 1, 4) +
    (STANDARD_CADENCES.has(cadence) ? 0.05 : 0);
  confidence *= 0.55 + 0.45 * consistency;
  confidence *= 0.6 + 0.4 * amountConsistency;
  if (medianInterval < 5 || medianInterval > 400) confidence *= 0.5;
  confidence = Math.max(0.02, Math.min(0.99, confidence));

  let priceChange = null;
  if (amounts.length >= 3) {
    const previous = amounts.slice(0, -1);
    const previousMedian = median(previous);
    const last = amounts[amounts.length - 1];
    const delta = last - previousMedian;
    if (
      previousMedian &&
      Math.abs(delta) >= Math.max(50, previousMedian * 0.05) &&
      Math.abs(delta) / previousMedian >= 0.05
    ) {
      priceChange = {
        from_cents: Math.round(previousMedian),
        to_cents: last,
        date: dates[dates.length - 1],
      };
    }
  }

  let reactivated = false;
  for (let i = 1; i < intervals.length; i += 1) {
    if (intervals[i] > medianInterval * 2.5) {
      reactivated = true;
      break;
    }
  }

  const lastDate = dates[dates.length - 1];
  const nextDate =
    cadence === 'custom'
      ? addDays(lastDate, customIntervalDays)
      : addCadence(lastDate, cadence);

  return {
    cadence,
    customIntervalDays,
    intervalDays: Math.round(medianInterval),
    confidence: Number(confidence.toFixed(3)),
    medianAmountCents: Math.round(medianAmount),
    currency: mostCommon(rows.map((r) => String(r.currency || 'USD').toUpperCase())) || 'USD',
    lastDate,
    nextDate,
    priceChange,
    reactivated,
    chargeCount,
    consistency: Number(consistency.toFixed(3)),
    amountConsistency: Number(amountConsistency.toFixed(3)),
  };
}

export function groupByMerchant(transactions) {
  const groups = new Map();
  for (const t of transactions) {
    const key = t.merchant_key;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return groups;
}
