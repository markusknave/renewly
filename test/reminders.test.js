import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, all, get } from '../src/db.js';
import { registerUser } from '../src/auth.js';
import { createSubscription } from '../src/domain/subscriptions.js';
import { runReminderCycle } from '../src/jobs/reminders.js';
import { addDays, todayInTz } from '../src/lib/dates.js';

test('reminder cycle creates reminders and notifications exactly once', async () => {
  const db = openDb(':memory:');
  const { user } = registerUser(db, {
    email: 'reminders@example.com',
    password: 'password1234',
    timezone: 'UTC',
    currency: 'USD',
    ip: '127.0.0.1',
  });
  createSubscription(db, user.id, {
    merchant_name: 'Netflix',
    amount: '15.49',
    currency: 'USD',
    cadence: 'monthly',
    next_renewal_date: addDays(todayInTz('UTC'), 1),
  });

  const notifier = {
    calls: [],
    async notifyUser(...args) {
      this.calls.push(args);
    },
  };

  const future = new Date(Date.now() + 3 * 86400000);
  const sent = await runReminderCycle(db, user, { notifier, now: future });
  assert.ok(sent >= 1);
  assert.ok(notifier.calls.length >= 1);

  const notes = all(db, 'SELECT * FROM notifications WHERE user_id = ?', user.id);
  assert.ok(notes.length >= 1);
  const pending = all(
    db,
    "SELECT * FROM reminders WHERE user_id = ? AND status = 'pending'",
    user.id
  );
  assert.equal(pending.length, 0);

  const secondRun = await runReminderCycle(db, user, { notifier, now: future });
  assert.equal(secondRun, 0);
  const notesAfter = all(db, 'SELECT * FROM notifications WHERE user_id = ?', user.id);
  assert.equal(notesAfter.length, notes.length);

  db.close();
});

test('overdue subscriptions are flagged for review', async () => {
  const db = openDb(':memory:');
  const { user } = registerUser(db, {
    email: 'overdue@example.com',
    password: 'password1234',
    timezone: 'UTC',
    currency: 'USD',
    ip: '127.0.0.1',
  });
  const sub = createSubscription(db, user.id, {
    merchant_name: 'Hulu',
    amount: '7.99',
    cadence: 'monthly',
    next_renewal_date: addDays(todayInTz('UTC'), -10),
  });
  const notifier = { async notifyUser() {} };
  await runReminderCycle(db, user, { notifier, now: new Date() });
  const after = get(db, 'SELECT * FROM subscriptions WHERE id = ?', sub.id);
  assert.equal(after.status, 'needs_review');
  db.close();
});
