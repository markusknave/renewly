import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStream } from '../src/domain/recurring.js';

function stream(amounts, dates, currency = 'USD') {
  return amounts.map((amount, i) => ({
    amount_cents: amount,
    currency,
    posted_date: dates[i],
  }));
}

test('detects a monthly streaming charge', () => {
  const result = analyzeStream(
    stream(
      [1549, 1549, 1549, 1549, 1549],
      ['2026-01-03', '2026-02-03', '2026-03-03', '2026-04-03', '2026-05-03']
    )
  );
  assert.ok(result);
  assert.equal(result.cadence, 'monthly');
  assert.equal(result.nextDate, '2026-06-03');
  assert.equal(result.medianAmountCents, 1549);
  assert.ok(result.confidence > 0.9);
  assert.equal(result.priceChange, null);
});

test('detects annual billing', () => {
  const result = analyzeStream(
    stream(
      [13900, 13900, 13900],
      ['2025-03-01', '2026-03-01', '2027-03-01']
    )
  );
  assert.ok(result);
  assert.equal(result.cadence, 'annual');
  assert.equal(result.nextDate, '2028-03-01');
});

test('flags a price increase on the latest charge', () => {
  const result = analyzeStream(
    stream([1549, 1549, 1799], ['2026-01-03', '2026-02-03', '2026-03-03'])
  );
  assert.ok(result);
  assert.deepEqual(result.priceChange, {
    from_cents: 1549,
    to_cents: 1799,
    date: '2026-03-03',
  });
});

test('returns null for a single charge and low confidence for noise', () => {
  assert.equal(
    analyzeStream(stream([999], ['2026-01-01'])),
    null
  );
  const noisy = analyzeStream(
    stream([1000, 50000], ['2026-01-01', '2026-04-01'])
  );
  assert.ok(noisy);
  assert.ok(noisy.confidence < 0.4);
});
