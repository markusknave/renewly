import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCadence,
  daysBetween,
  monthlyCents,
  parseAmount,
  parseDateLoose,
  todayInTz,
  yearlyCents,
} from '../public/js/lib/dates.js';

test('parseAmount handles common receipt formats', () => {
  assert.deepEqual(parseAmount('Total: $15.49'), { cents: 1549, currency: 'USD' });
  assert.deepEqual(parseAmount('Amount due €9,99'), { cents: 999, currency: 'EUR' });
  assert.deepEqual(parseAmount('Billed 1,299.00 USD'), { cents: 129900, currency: 'USD' });
  assert.deepEqual(parseAmount('£10'), { cents: 1000, currency: 'GBP' });
  assert.deepEqual(parseAmount('15,49', 'EUR'), { cents: 1549, currency: 'EUR' });
  assert.deepEqual(parseAmount('US$ 9.9'), { cents: 990, currency: 'USD' });
  assert.deepEqual(parseAmount('₱1,299.00'), { cents: 129900, currency: 'PHP' });
  assert.deepEqual(parseAmount('PHP 499'), { cents: 49900, currency: 'PHP' });
  assert.equal(parseAmount('no money here'), null);
});

test('parseDateLoose understands explicit and implicit formats', () => {
  assert.equal(parseDateLoose('December 3, 2026'), '2026-12-03');
  assert.equal(parseDateLoose('3 Dec 2026'), '2026-12-03');
  assert.equal(parseDateLoose('2026-03-09'), '2026-03-09');
  assert.equal(parseDateLoose('03/09/2026'), '2026-03-09');
  assert.equal(parseDateLoose('13/09/2026'), '2026-09-13');
});

test('addCadence is calendar aware and clamps month ends', () => {
  assert.equal(addCadence('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(addCadence('2028-01-31', 'monthly'), '2028-02-29');
  assert.equal(addCadence('2026-12-15', 'annual'), '2027-12-15');
  assert.equal(addCadence('2026-03-01', 'weekly'), '2026-03-08');
  assert.equal(addCadence('2026-03-01', 'custom', 45), '2026-04-15');
});

test('monthly and yearly normalization', () => {
  assert.equal(monthlyCents(12000, 'annual'), 1000);
  assert.equal(yearlyCents(12000, 'annual'), 12000);
  assert.equal(monthlyCents(3000, 'quarterly'), 1000);
  assert.equal(monthlyCents(1000, 'weekly'), 4333);
  assert.equal(daysBetween('2026-01-01', '2026-02-01'), 31);
});

test('todayInTz returns an ISO date', () => {
  assert.match(todayInTz('America/New_York'), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(todayInTz('not-a-zone'), /^\d{4}-\d{2}-\d{2}$/);
});
