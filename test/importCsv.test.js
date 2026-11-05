import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, rowsFromCsv } from '../src/domain/importCsv.js';

test('parses quoted CSV fields and normalizes amounts', () => {
  const csv = [
    'Description,Date,Amount,Currency',
    'NFLX*NETFLIX.COM,2026-01-03,-15.49,USD',
    '"Blue Bottle, Inc.",2026-01-04,"1,299.00",USD',
  ].join('\n');
  const { headers, rows } = parseCsv(csv);
  assert.deepEqual(headers, ['description', 'date', 'amount', 'currency']);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].description, 'Blue Bottle, Inc.');

  const normalized = rowsFromCsv(csv, { today: '2026-03-03' });
  assert.equal(normalized.ignored, 0);
  assert.equal(normalized.rows.length, 2);
  assert.equal(normalized.rows[0].amount_cents, 1549);
  assert.equal(normalized.rows[0].posted_date, '2026-01-03');
  assert.equal(normalized.rows[1].amount_cents, 129900);
});

test('reports missing required columns', () => {
  const result = rowsFromCsv('foo,bar\n1,2');
  assert.ok(result.error);
  assert.equal(result.rows.length, 0);
});
