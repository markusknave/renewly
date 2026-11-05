import { config } from '../config.js';
import { all, nowIso, run, transaction } from '../db.js';
import { addDays, formatMoney, relativeDays, todayInTz } from '../lib/dates.js';
import { recordEvent } from '../domain/subscriptions.js';

export function parseReminderDays(value) {
  const nums = String(value || '7,3,1')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 90);
  const unique = [...new Set(nums.length ? nums : [7, 3, 1])];
  return unique.sort((a, b) => b - a);
}

export function syncReminders(db, user) {
  const days = parseReminderDays(user.reminder_days);
  const subs = all(
    db,
    `SELECT * FROM subscriptions
     WHERE user_id = ? AND status IN ('active','trial','needs_review')
       AND next_renewal_date IS NOT NULL`,
    user.id
  );
  transaction(db, () => {
    run(db, "DELETE FROM reminders WHERE user_id = ? AND status = 'pending'", user.id);
    for (const sub of subs) {
      for (const d of days) {
        const fireDate = addDays(sub.next_renewal_date, -d);
        if (!fireDate) continue;
        const fireAt = `${fireDate}T09:00:00.000Z`;
        run(
          db,
          `INSERT INTO reminders (user_id, subscription_id, fire_at, days_before, status, sent_at)
           VALUES (?, ?, ?, ?, 'pending', NULL)
           ON CONFLICT(subscription_id, fire_at, days_before) DO NOTHING`,
          user.id,
          sub.id,
          fireAt,
          d
        );
      }
    }
  });
  return subs.length;
}

async function flagOverdue(db, user, notifier) {
  const today = todayInTz(user.timezone || 'UTC');
  const cutoff = addDays(today, -3);
  const stale = all(
    db,
    `SELECT * FROM subscriptions
     WHERE user_id = ? AND status IN ('active','trial') AND next_renewal_date IS NOT NULL
       AND next_renewal_date < ?`,
    user.id,
    cutoff
  );
  for (const sub of stale) {
    const now = nowIso();
    run(
      db,
      "UPDATE subscriptions SET status = 'needs_review', updated_at = ? WHERE id = ? AND user_id = ?",
      now,
      sub.id,
      user.id
    );
    recordEvent(db, user.id, sub.id, 'needs_review', {
      effectiveDate: sub.next_renewal_date,
      meta: { reason: 'renewal date passed' },
    });
    run(
      db,
      `INSERT INTO notifications (user_id, subscription_id, type, title, body, created_at)
       VALUES (?, ?, 'needs_review', ?, ?, ?)`,
      user.id,
      sub.id,
      `${sub.merchant_name} needs a check-in`,
      `The renewal date (${sub.next_renewal_date}) has passed. Mark it renewed or canceled.`,
      now
    );
    await notifier
      .notifyUser(user, {
        title: `${sub.merchant_name} needs a check-in`,
        body: `The renewal date (${sub.next_renewal_date}) has passed. Confirm whether it renewed.`,
        url: `${config.baseUrl}/dashboard`,
      })
      .catch(() => {});
  }
  return stale.length;
}

async function sendDueReminders(db, user, notifier, now) {
  const due = all(
    db,
    `SELECT r.*, s.merchant_name, s.amount_cents, s.currency, s.next_renewal_date,
            s.status AS sub_status
     FROM reminders r JOIN subscriptions s ON s.id = r.subscription_id
     WHERE r.user_id = ? AND r.status = 'pending' AND r.fire_at <= ?
     ORDER BY r.fire_at`,
    user.id,
    now.toISOString()
  );

  let sent = 0;
  const today = todayInTz(user.timezone || 'UTC');
  for (const reminder of due) {
    const stamp = nowIso();
    if (!['active', 'trial', 'needs_review'].includes(reminder.sub_status)) {
      run(db, "UPDATE reminders SET status = 'sent', sent_at = ? WHERE id = ?", stamp, reminder.id);
      continue;
    }
    const when = relativeDays(reminder.next_renewal_date, today);
    const amount = formatMoney(reminder.amount_cents, reminder.currency);
    const title =
      reminder.days_before === 0
        ? `${reminder.merchant_name} renews today`
        : `${reminder.merchant_name} renews ${when}`;
    const body = `${reminder.merchant_name} (${amount}) is due ${when} on ${reminder.next_renewal_date}.`;
    run(
      db,
      `INSERT INTO notifications (user_id, subscription_id, type, title, body, created_at)
       VALUES (?, ?, 'reminder', ?, ?, ?)`,
      user.id,
      reminder.subscription_id,
      title,
      body,
      stamp
    );
    run(db, "UPDATE reminders SET status = 'sent', sent_at = ? WHERE id = ?", stamp, reminder.id);
    sent += 1;
    await notifier
      .notifyUser(user, { title, body, url: `${config.baseUrl}/dashboard` })
      .catch(() => {});
  }
  return sent;
}

export async function runReminderCycle(db, user, { notifier, now = new Date() } = {}) {
  syncReminders(db, user);
  await flagOverdue(db, user, notifier);
  return sendDueReminders(db, user, notifier, now);
}
