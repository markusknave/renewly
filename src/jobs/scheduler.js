import { all } from '../db.js';
import { runReminderCycle } from './reminders.js';

export function startScheduler({ db, notifier, intervalMs = 15 * 60 * 1000 }) {
  let running = false;

  async function tick(now = new Date()) {
    if (running) return;
    running = true;
    try {
      const users = all(db, 'SELECT * FROM users');
      for (const user of users) {
        try {
          await runReminderCycle(db, user, { notifier, now });
        } catch (err) {
          console.error(`[scheduler] user ${user.id}:`, err.message);
        }
      }
    } finally {
      running = false;
    }
  }

  tick().catch((err) => console.error('[scheduler] initial run:', err.message));
  const timer = setInterval(() => {
    tick().catch((err) => console.error('[scheduler] tick:', err.message));
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    tick,
    stop() {
      clearInterval(timer);
    },
  };
}
