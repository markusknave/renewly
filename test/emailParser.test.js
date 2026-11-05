import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRawEmail, parseReceiptEmail } from '../src/domain/emailParser.js';

test('parses a Netflix receipt with amount, plan, and renewal date', () => {
  const parsed = parseReceiptEmail({
    from: 'Netflix <info@netflix.com>',
    subject: 'Your Netflix receipt',
    text: 'Hi there, your Premium plan payment of $22.99 was received. Your next payment is on January 15, 2027.',
    today: '2026-06-01',
  });
  assert.ok(parsed);
  assert.equal(parsed.cancelled, false);
  assert.equal(parsed.merchant_key, 'netflix');
  assert.equal(parsed.plan_name, 'Premium');
  assert.equal(parsed.amount_cents, 2299);
  assert.equal(parsed.currency, 'USD');
  assert.equal(parsed.next_renewal_date, '2027-01-15');
  assert.equal(parsed.date_estimated, false);
  assert.ok(parsed.confidence >= 0.7);
});

test('parses annual billing and foreign currency', () => {
  const parsed = parseReceiptEmail({
    from: 'Spotify <no-reply@spotify.com>',
    subject: 'Your Spotify receipt',
    text: 'Your Premium plan will renew on December 3, 2026. Total: £119.88 per year.',
    today: '2026-06-01',
  });
  assert.ok(parsed);
  assert.equal(parsed.merchant_key, 'spotify');
  assert.equal(parsed.cadence, 'annual');
  assert.equal(parsed.amount_cents, 11988);
  assert.equal(parsed.currency, 'GBP');
  assert.equal(parsed.next_renewal_date, '2026-12-03');
});

test('reads a raw multipart email and extracts the text part', () => {
  const raw = [
    'From: Spotify <no-reply@spotify.com>',
    'To: renewly+token1234567890@in.renewly.local',
    'Subject: Your receipt',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="abc"',
    '',
    '--abc',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Your Premium plan total: $9.99 per month. Renews on November 2, 2026.',
    '--abc',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<html><body><p>$9.99</p></body></html>',
    '--abc--',
    '',
  ].join('\r\n');
  const mail = parseRawEmail(raw);
  assert.equal(mail.subject, 'Your receipt');
  assert.match(mail.text, /Premium plan total/);

  const parsed = parseReceiptEmail({ raw, today: '2026-06-01' });
  assert.ok(parsed);
  assert.equal(parsed.merchant_key, 'spotify');
  assert.equal(parsed.amount_cents, 999);
  assert.equal(parsed.cadence, 'monthly');
  assert.equal(parsed.next_renewal_date, '2026-11-02');
});

test('detects a cancellation email', () => {
  const parsed = parseReceiptEmail({
    from: 'Netflix <info@netflix.com>',
    subject: 'Your subscription has been canceled',
    text: 'Your Netflix subscription has been canceled as requested.',
  });
  assert.ok(parsed);
  assert.equal(parsed.cancelled, true);
  assert.equal(parsed.merchant_key, 'netflix');
});

test('ignores marketing email with no money or renewal date', () => {
  const parsed = parseReceiptEmail({
    from: 'Netflix <info@netflix.com>',
    subject: 'New releases this week',
    text: 'Stream the latest shows this weekend. Upgrade your plan anytime.',
  });
  assert.equal(parsed, null);
});

test('estimates the next date when the receipt has an amount but no date', () => {
  const parsed = parseReceiptEmail({
    from: 'Spotify <no-reply@spotify.com>',
    subject: 'Your receipt',
    text: 'Your Premium plan total is $9.99 per month.',
    today: '2026-03-03',
  });
  assert.ok(parsed);
  assert.equal(parsed.date_estimated, true);
  assert.equal(parsed.next_renewal_date, '2026-04-03');
});
