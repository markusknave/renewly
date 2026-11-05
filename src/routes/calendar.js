import { findUserByCalendarToken } from '../auth.js';
import { all } from '../db.js';
import { addCadence, addDays, formatMoney } from '../lib/dates.js';
import { CADENCE_LABELS } from '../lib/dates.js';
import { AppError } from '../lib/errors.js';

function icsEscape(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function compactDate(iso) {
  return String(iso).replace(/-/g, '');
}

function utcStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function foldLine(line) {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const parts = [];
  let current = '';
  for (const char of line) {
    if (Buffer.byteLength(current + char, 'utf8') > 74) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function registerCalendarRoutes(router) {
  router.get('/calendar/:file', (ctx) => {
    if (!ctx.limiter.check(`ics:${ctx.ip}`, 120, 60_000)) {
      throw new AppError(429, 'Too many calendar requests');
    }
    const token = String(ctx.params.file || '').replace(/\.ics$/i, '');
    const user = findUserByCalendarToken(ctx.db, token);
    if (!user) {
      ctx.res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      ctx.res.end('Calendar not found');
      return;
    }

    const subs = all(
      ctx.db,
      `SELECT * FROM subscriptions
       WHERE user_id = ? AND status IN ('active','trial','needs_review')
         AND next_renewal_date IS NOT NULL
       ORDER BY next_renewal_date`,
      user.id
    );

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Renewly//Subscription Renewals//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${icsEscape('Renewly subscriptions')}`,
      'X-WR-TIMEZONE:UTC',
    ];
    const stamp = utcStamp();

    for (const sub of subs) {
      let date = sub.next_renewal_date;
      for (let i = 0; i < 12 && date; i += 1) {
        const summary = `${sub.merchant_name} renewal${sub.plan_name ? ` (${sub.plan_name})` : ''}`;
        const description = [
          formatMoney(sub.amount_cents, sub.currency),
          CADENCE_LABELS[sub.cadence] || sub.cadence,
          'Renewly',
        ].join(' - ');
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:sub-${sub.id}-${compactDate(date)}@renewly`);
        lines.push(`DTSTAMP:${stamp}`);
        lines.push(`DTSTART;VALUE=DATE:${compactDate(date)}`);
        lines.push(`DTEND;VALUE=DATE:${compactDate(addDays(date, 1))}`);
        lines.push(`SUMMARY:${icsEscape(summary)}`);
        lines.push(`DESCRIPTION:${icsEscape(description)}`);
        lines.push('STATUS:CONFIRMED');
        lines.push('TRANSP:TRANSPARENT');
        lines.push('BEGIN:VALARM');
        lines.push('TRIGGER:-P7D');
        lines.push('ACTION:DISPLAY');
        lines.push(`DESCRIPTION:${icsEscape(summary)}`);
        lines.push('END:VALARM');
        lines.push('END:VEVENT');
        date = addCadence(date, sub.cadence, sub.custom_interval_days || 30);
      }
    }

    lines.push('END:VCALENDAR');
    const body = `${lines.map(foldLine).join('\r\n')}\r\n`;
    ctx.res.writeHead(200, {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="renewly.ics"',
      'content-length': Buffer.byteLength(body),
    });
    ctx.res.end(body);
  });
}
