import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { get } from '../src/db.js';
import { revealCalendarToken, revealIngestToken } from '../src/auth.js';

let app;
let baseUrl;

before(async () => {
  app = createApp({
    dbFile: ':memory:',
    notifier: { async notifyUser() {} },
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${app.server.address().port}`;
});

after(() => {
  app.server.close();
  app.db.close();
});

function cookieFrom(res) {
  const list = res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie') || ''];
  const found = list.find((c) => c.startsWith('renewly_sid='));
  return found ? found.split(';')[0] : null;
}

function csrfFrom(html) {
  const match = html.match(/name="csrf-token" content="([^"]+)"/);
  return match ? match[1] : null;
}

async function call(path, { method = 'GET', cookie, csrf, json, form, headers = {} } = {}) {
  const h = { ...headers };
  let body;
  if (json !== undefined) {
    h['content-type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form !== undefined) {
    h['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }
  if (cookie) h.cookie = cookie;
  if (csrf) h['x-csrf-token'] = csrf;
  const res = await fetch(baseUrl + path, {
    method,
    headers: h,
    body,
    redirect: 'manual',
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, setCookie: cookieFrom(res) };
}

async function register(email) {
  const first = await call('/register');
  assert.equal(first.status, 200);
  const anonCookie = first.setCookie;
  const anonCsrf = csrfFrom(first.text);
  assert.ok(anonCookie && anonCsrf);

  const created = await call('/register', {
    method: 'POST',
    cookie: anonCookie,
    csrf: anonCsrf,
    json: {
      email,
      password: 'correcthorse123',
      timezone: 'UTC',
      currency: 'USD',
    },
  });
  assert.equal(created.status, 303);
  assert.equal(created.headers.get('location'), '/dashboard');
  assert.ok(created.setCookie);

  const dashboard = await call('/dashboard', { cookie: created.setCookie });
  assert.equal(dashboard.status, 200);
  assert.match(dashboard.text, /Your subscriptions/);
  return {
    cookie: created.setCookie,
    csrf: csrfFrom(dashboard.text),
    dashboard,
  };
}

test('security headers and cookie flags are set', async () => {
  const res = await call('/login');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie().join(';') : '';
  assert.match(raw, /HttpOnly/);
  assert.match(raw, /SameSite=Strict/);
});

test('serves installable PWA assets and mobile metadata', async () => {
  const manifest = await call('/manifest.webmanifest');
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get('content-type'), /application\/manifest\+json/);
  const parsed = JSON.parse(manifest.text);
  assert.equal(parsed.display, 'standalone');
  assert.equal(parsed.short_name, 'Renewly');
  assert.ok(parsed.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'));

  const serviceWorker = await call('/sw.js');
  assert.equal(serviceWorker.status, 200);
  assert.match(serviceWorker.headers.get('content-type'), /javascript/);
  assert.equal(serviceWorker.headers.get('cache-control'), 'no-cache');

  const icon = await fetch(`${baseUrl}/icons/app-512.png`);
  assert.equal(icon.status, 200);
  assert.equal(icon.headers.get('content-type'), 'image/png');

  const page = await call('/login');
  assert.match(page.text, /rel="manifest" href="\/manifest.webmanifest"/);
  assert.match(page.text, /viewport-fit=cover/);
  assert.match(page.text, /theme-color/);
});

test('full lifecycle: auth, CRUD, isolation, ingestion, calendar, export', async () => {
  const alice = await register('alice@example.com');
  const bob = await register('bob@example.com');

  const missingCsrf = await call('/api/subscriptions', {
    method: 'POST',
    cookie: alice.cookie,
    json: { merchant_name: 'Hulu', amount: '7.99' },
  });
  assert.equal(missingCsrf.status, 403);

  const added = await call('/api/subscriptions', {
    method: 'POST',
    cookie: alice.cookie,
    csrf: alice.csrf,
    json: {
      merchant_name: 'Netflix',
      plan_name: 'Standard',
      amount: '15.49',
      currency: 'USD',
      cadence: 'monthly',
      next_renewal_date: '2026-12-03',
      status: 'active',
    },
  });
  assert.equal(added.status, 201);
  const addedBody = JSON.parse(added.text);
  assert.equal(addedBody.subscription.merchant_key, 'netflix');
  const subscriptionId = addedBody.subscription.id;

  const list = await call('/api/subscriptions', { cookie: alice.cookie });
  assert.equal(list.status, 200);
  assert.equal(JSON.parse(list.text).subscriptions.length, 1);

  const idor = await call(`/api/subscriptions/${subscriptionId}`, { cookie: bob.cookie });
  assert.equal(idor.status, 404);

  const userA = get(app.db, 'SELECT * FROM users WHERE email = ?', 'alice@example.com');
  const ingestToken = revealIngestToken(userA);
  assert.ok(ingestToken);

  const emailHook = await call('/webhooks/email', {
    method: 'POST',
    json: {
      to: `renewly+${ingestToken}@in.renewly.local`,
      from: 'Netflix <info@netflix.com>',
      subject: 'Your Netflix receipt',
      text: 'Your Premium plan payment of $22.99 was received. Your next payment is on January 15, 2027.',
    },
  });
  assert.equal(emailHook.status, 202);
  const updated = get(
    app.db,
    "SELECT * FROM subscriptions WHERE user_id = ? AND merchant_key = 'netflix'",
    userA.id
  );
  assert.equal(updated.plan_name, 'Premium');
  assert.equal(updated.amount_cents, 2299);
  assert.equal(updated.next_renewal_date, '2027-01-15');

  const txs = ['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05', '2026-05-05'].map(
    (date, i) => ({
      merchant_raw: 'SPOTIFY USA',
      amount_cents: 999,
      currency: 'USD',
      posted_date: date,
      external_id: `spotify-${i}`,
    })
  );
  const txnHook = await call('/webhooks/transactions', {
    method: 'POST',
    headers: { authorization: `Bearer ${ingestToken}` },
    json: { transactions: txs },
  });
  assert.equal(txnHook.status, 202);
  const spotify = get(
    app.db,
    "SELECT * FROM subscriptions WHERE user_id = ? AND merchant_key = 'spotify'",
    userA.id
  );
  assert.ok(spotify);
  assert.equal(spotify.cadence, 'monthly');
  assert.equal(spotify.amount_cents, 999);

  const calendarToken = revealCalendarToken(userA);
  const calendar = await call(`/calendar/${calendarToken}.ics`);
  assert.equal(calendar.status, 200);
  assert.match(calendar.text, /BEGIN:VCALENDAR/);
  assert.match(calendar.text, /Netflix renewal/);

  const exported = await call('/api/export', { cookie: alice.cookie });
  assert.equal(exported.status, 200);
  const exportData = JSON.parse(exported.text);
  assert.equal(exportData.user.email, 'alice@example.com');
  assert.ok(exportData.subscriptions.length >= 2);

  const cancelled = await call('/webhooks/email', {
    method: 'POST',
    json: {
      to: `renewly+${ingestToken}@in.renewly.local`,
      from: 'Netflix <info@netflix.com>',
      subject: 'Your subscription has been canceled',
      text: 'Your Netflix subscription has been canceled as requested.',
    },
  });
  assert.equal(cancelled.status, 202);
  const canceledSub = get(
    app.db,
    "SELECT * FROM subscriptions WHERE user_id = ? AND merchant_key = 'netflix'",
    userA.id
  );
  assert.equal(canceledSub.status, 'canceled');

  const resubscribed = await call('/webhooks/email', {
    method: 'POST',
    json: {
      to: `renewly+${ingestToken}@in.renewly.local`,
      from: 'Netflix <info@netflix.com>',
      subject: 'Your Netflix receipt',
      text: 'Your Premium plan payment of $22.99 was received. Your next payment is on February 15, 2027.',
    },
  });
  assert.equal(resubscribed.status, 202);
  const activeAgain = get(
    app.db,
    "SELECT * FROM subscriptions WHERE user_id = ? AND merchant_key = 'netflix'",
    userA.id
  );
  assert.equal(activeAgain.status, 'active');
  assert.equal(activeAgain.next_renewal_date, '2027-02-15');

  const unknownHook = await call('/webhooks/email', {
    method: 'POST',
    json: {
      to: 'renewly+doesnotexist000000@in.renewly.local',
      from: 'Netflix <info@netflix.com>',
      subject: 'Receipt',
      text: 'Total $1.00',
    },
  });
  assert.equal(unknownHook.status, 202);
});

test('CSV import makes a reviewable detection, confirm works, and logout invalidates', async () => {
  const carol = await register('carol@example.com');
  const csv = [
    'Description,Date,Amount,Currency',
    'SPOTIFY USA,2026-01-05,-9.99,USD',
    'SPOTIFY USA,2026-02-05,-9.99,USD',
    'SPOTIFY USA,2026-03-05,-9.99,USD',
  ].join('\n');

  const imported = await call('/api/import/csv', {
    method: 'POST',
    cookie: carol.cookie,
    csrf: carol.csrf,
    form: { csv, _redirect: '/dashboard' },
  });
  assert.equal(imported.status, 303);
  assert.match(imported.headers.get('location'), /Imported\+3\+transactions/);

  const user = get(app.db, 'SELECT * FROM users WHERE email = ?', 'carol@example.com');
  const detection = get(
    app.db,
    "SELECT * FROM detections WHERE user_id = ? AND merchant_key = 'spotify' AND status = 'pending'",
    user.id
  );
  assert.ok(detection, 'three charges stay in the review queue');
  assert.ok(detection.confidence < 0.85);

  const dashboard = await call('/dashboard', { cookie: carol.cookie });
  assert.match(dashboard.text, /Review detected subscriptions|Needs review|Confirm/i);

  const confirmed = await call(`/api/detections/${detection.id}/confirm`, {
    method: 'POST',
    cookie: carol.cookie,
    csrf: carol.csrf,
    form: {},
  });
  assert.equal(confirmed.status, 303);

  const spotify = get(
    app.db,
    "SELECT * FROM subscriptions WHERE user_id = ? AND merchant_key = 'spotify'",
    user.id
  );
  assert.ok(spotify);
  assert.equal(spotify.amount_cents, 999);
  assert.equal(spotify.cadence, 'monthly');

  const fresh = await call('/dashboard', { cookie: carol.cookie });
  const logout = await call('/logout', {
    method: 'POST',
    cookie: carol.cookie,
    csrf: csrfFrom(fresh.text),
    form: {},
  });
  assert.equal(logout.status, 303);
  assert.match(logout.headers.get('location'), /^\/login\?msg=/);

  const after = await call('/dashboard', { cookie: carol.cookie });
  assert.equal(after.status, 303);
  assert.equal(after.headers.get('location'), '/login');
});
