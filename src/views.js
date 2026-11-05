import { config } from './config.js';
import {
  CADENCE_LABELS,
  formatDateHuman,
  formatMoney,
  relativeDays,
} from './lib/dates.js';
import { escapeHtml as esc } from './http.js';
import { MERCHANTS } from './domain/merchants.js';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR', 'PHP', 'CHF', 'SEK', 'NOK', 'DKK', 'NZD', 'SGD', 'HKD', 'BRL', 'MXN', 'ZAR'];
const CADENCE_OPTIONS = ['monthly', 'annual', 'quarterly', 'semiannual', 'weekly', 'biweekly', 'custom'];
const STATUS_OPTIONS = ['active', 'trial', 'paused', 'canceled', 'needs_review'];

function csrfField(token) {
  return `<input type="hidden" name="_csrf" value="${esc(token)}">`;
}

function options(values, selected, labels = {}) {
  return values
    .map(
      (v) =>
        `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(labels[v] || v)}</option>`
    )
    .join('');
}

function statusPill(status) {
  const label = {
    active: 'Active',
    trial: 'Trial',
    paused: 'Paused',
    canceled: 'Canceled',
    needs_review: 'Needs review',
  }[status] || status;
  return `<span class="pill pill-${esc(status)}">${esc(label)}</span>`;
}

function nextLabel(s) {
  if (!s.next_renewal_date) return '<span class="muted">Not set</span>';
  if (s.days_until === null || s.days_until === undefined) return esc(formatDateHuman(s.next_renewal_date));
  const when =
    s.days_until < 0
      ? `overdue ${Math.abs(s.days_until)}d`
      : s.days_until === 0
        ? 'today'
        : s.days_until === 1
          ? 'tomorrow'
          : `in ${s.days_until} days`;
  const cls = s.days_until < 0 ? 'text-danger' : s.days_until <= 3 ? 'text-warn' : '';
  return `<span class="${cls}">${esc(formatDateHuman(s.next_renewal_date))}</span><span class="sub">${esc(when)}</span>`;
}

function layout({ title, body, user = null, csrfToken, active = '', notice = '', error = '', wide = false }) {
  const nav = user
    ? `<nav class="nav">
        <a href="/dashboard" class="${active === 'dashboard' ? 'on' : ''}">Dashboard</a>
        <a href="/settings" class="${active === 'settings' ? 'on' : ''}">Settings</a>
        <form method="post" action="/logout" class="inline">
          ${csrfField(csrfToken)}
          <button type="submit" class="link">Sign out</button>
        </form>
      </nav>`
    : '';
  const banner = error
    ? `<div class="banner banner-error" role="alert">${esc(error)}</div>`
    : notice
      ? `<div class="banner banner-ok" role="status">${esc(notice)}</div>`
      : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="csrf-token" content="${esc(csrfToken || '')}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#4f46e5" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d12" media="(prefers-color-scheme: dark)">
<meta name="application-name" content="Renewly">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Renewly">
<title>${esc(title)} · Renewly</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/icons/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="topbar">
  <a class="brand" href="${user ? '/dashboard' : '/login'}">
    <span class="brand-mark" aria-hidden="true">R</span>
    <span>Renewly</span>
  </a>
  ${nav}
</header>
<main class="container${wide ? ' wide' : ''}">
  ${banner}
  ${body}
</main>
<script src="/app.js" defer></script>
</body>
</html>`;
}

export function authPage({ mode = 'login', csrfToken, notice = '', error = '' }) {
  const isRegister = mode === 'register';
  const body = `
  <section class="auth-wrap">
    <div class="auth-card">
      <h1>${isRegister ? 'Create your account' : 'Welcome back'}</h1>
      <p class="muted">${isRegister ? 'Track every subscription, renewal, and price change in one place.' : 'Sign in to see your renewals and spending.'}</p>
      <form method="post" action="${isRegister ? '/register' : '/login'}" class="stack" novalidate>
        ${csrfField(csrfToken)}
        <label>Email
          <input type="email" name="email" autocomplete="email" required maxlength="254" placeholder="you@example.com">
        </label>
        <label>Password
          <input type="password" name="password" autocomplete="${isRegister ? 'new-password' : 'current-password'}" required minlength="10" maxlength="200" placeholder="At least 10 characters">
        </label>
        ${
          isRegister
            ? `<label>Timezone
                <input type="text" name="timezone" id="tz-input" value="UTC" maxlength="64">
                <span class="hint">Used to decide what "today" means for reminders.</span>
              </label>
              <label>Currency
                <select name="currency">${options(CURRENCIES, 'USD')}</select>
              </label>`
            : ''
        }
        <button type="submit" class="btn btn-primary">${isRegister ? 'Create account' : 'Sign in'}</button>
      </form>
      <p class="muted small">
        ${isRegister ? 'Already have an account? <a href="/login">Sign in</a>.' : 'New here? <a href="/register">Create an account</a>.'}
      </p>
      <p class="muted tiny">Passwords are hashed with scrypt. Sessions are server-side and cookies are HttpOnly + SameSite=Strict.</p>
    </div>
  </section>`;
  return layout({ title: isRegister ? 'Create account' : 'Sign in', body, csrfToken, notice, error });
}

function summaryCards(summary, currency) {
  const next = summary.next;
  return `
  <section class="cards" aria-label="Summary">
    <div class="card">
      <div class="card-label">Monthly spend</div>
      <div class="card-value">${esc(formatMoney(summary.monthly_cents, currency))}</div>
      <div class="card-sub">${summary.active_count} active subscription${summary.active_count === 1 ? '' : 's'}</div>
    </div>
    <div class="card">
      <div class="card-label">Yearly projection</div>
      <div class="card-value">${esc(formatMoney(summary.yearly_cents, currency))}</div>
      <div class="card-sub">At current plans</div>
    </div>
    <div class="card">
      <div class="card-label">Upcoming (30 days)</div>
      <div class="card-value">${summary.upcoming.length}</div>
      <div class="card-sub">${summary.upcoming.length ? esc(formatMoney(summary.upcoming.reduce((n, s) => n + s.amount_cents, 0), currency)) + ' due' : 'Nothing due'}</div>
    </div>
    <div class="card">
      <div class="card-label">Next renewal</div>
      <div class="card-value small-value">${next ? esc(next.merchant_name) : '—'}</div>
      <div class="card-sub">${next ? esc(formatDateHuman(next.next_renewal_date)) + ' · ' + esc(relativeDays(next.next_renewal_date, summary.today)) : 'Add a subscription'}</div>
    </div>
  </section>`;
}

function detectionsSection(detections, csrfToken) {
  if (!detections.length) return '';
  const items = detections
    .map((d) => {
      let evidence = {};
      try {
        evidence = JSON.parse(d.evidence_json || '{}');
      } catch {
        evidence = {};
      }
      const meta = [
        d.amount_cents !== null ? formatMoney(d.amount_cents, d.currency || 'USD') : null,
        d.cadence ? CADENCE_LABELS[d.cadence] || d.cadence : null,
        d.next_renewal_date ? formatDateHuman(d.next_renewal_date) : null,
        `source: ${d.source}`,
        `confidence: ${Math.round((d.confidence || 0) * 100)}%`,
      ]
        .filter(Boolean)
        .map((x) => esc(x))
        .join(' · ');
      return `<li class="detection">
        <div class="detection-main">
          <strong>${esc(d.merchant_name)}</strong>
          ${d.plan_name ? `<span class="muted"> · ${esc(d.plan_name)}</span>` : ''}
          <div class="sub">${meta}</div>
          ${evidence.chargeCount ? `<div class="sub">${esc(String(evidence.chargeCount))} matching charges seen</div>` : ''}
        </div>
        <div class="detection-actions">
          <form method="post" action="/api/detections/${d.id}/confirm" class="inline">
            ${csrfField(csrfToken)}
            <button class="btn btn-small btn-primary" type="submit">Confirm</button>
          </form>
          <form method="post" action="/api/detections/${d.id}/dismiss" class="inline">
            ${csrfField(csrfToken)}
            <button class="btn btn-small" type="submit">Dismiss</button>
          </form>
        </div>
      </li>`;
    })
    .join('');
  return `<section class="panel panel-accent">
    <h2>Detected subscriptions</h2>
    <p class="muted small">These came from receipts or transaction patterns. Confirm to start tracking them.</p>
    <ul class="detection-list">${items}</ul>
  </section>`;
}

function subscriptionRow(s, csrfToken) {
  const editPayload = {
    id: s.id,
    merchant_name: s.merchant_name,
    merchant_key: s.merchant_key,
    plan_name: s.plan_name || '',
    amount: (Number(s.amount_cents) / 100).toFixed(2),
    currency: s.currency,
    cadence: s.cadence,
    custom_interval_days: s.custom_interval_days || '',
    status: s.status,
    next_renewal_date: s.next_renewal_date || '',
    started_on: s.started_on || '',
    notes: s.notes || '',
  };
  const initial = esc((s.merchant_name || '?').trim().charAt(0).toUpperCase());
  const actions = [];
  if (s.status === 'canceled' || s.status === 'paused') {
    actions.push(`<form method="post" action="/api/subscriptions/${s.id}/reactivate" class="inline">${csrfField(csrfToken)}<button class="link" type="submit">Reactivate</button></form>`);
  } else {
    actions.push(`<form method="post" action="/api/subscriptions/${s.id}/advance" class="inline">${csrfField(csrfToken)}<button class="link" type="submit">Mark renewed</button></form>`);
    actions.push(`<form method="post" action="/api/subscriptions/${s.id}/cancel" class="inline">${csrfField(csrfToken)}<button class="link" type="submit">Cancel</button></form>`);
  }
  actions.push(`<button type="button" class="link" data-edit="${esc(JSON.stringify(editPayload))}">Edit</button>`);
  if (s.cancel_url) {
    actions.push(`<a class="link" href="${esc(s.cancel_url)}" target="_blank" rel="noopener noreferrer">Manage</a>`);
  }
  actions.push(`<form method="post" action="/api/subscriptions/${s.id}/delete" class="inline" data-confirm="Delete ${esc(s.merchant_name)}? This cannot be undone.">${csrfField(csrfToken)}<button class="link danger" type="submit">Delete</button></form>`);

  return `<tr>
    <td>
      <div class="merchant">
        <span class="avatar">${initial}</span>
        <span>
          <strong>${esc(s.merchant_name)}</strong>
          <span class="sub">${esc(s.category || 'Other')}${s.plan_name ? ' · ' + esc(s.plan_name) : ''}</span>
        </span>
      </div>
    </td>
    <td class="num">
      <strong>${esc(formatMoney(s.amount_cents, s.currency))}</strong>
      <span class="sub">${esc(CADENCE_LABELS[s.cadence] || s.cadence)}</span>
    </td>
    <td>${nextLabel(s)}</td>
    <td>${statusPill(s.status)}</td>
    <td class="actions">${actions.join('')}</td>
  </tr>`;
}

function subscriptionForm({ csrfToken, formAction = '/api/subscriptions', id = '', defaults = {} }) {
  const d = {
    merchant_name: '',
    plan_name: '',
    amount: '',
    currency: 'USD',
    cadence: 'monthly',
    custom_interval_days: '',
    status: 'active',
    next_renewal_date: '',
    started_on: '',
    notes: '',
    ...defaults,
  };
  return `<form method="post" action="${esc(formAction)}" class="stack sub-form" novalidate>
    ${csrfField(csrfToken)}
    ${id ? `<input type="hidden" name="id" value="${esc(id)}">` : ''}
    <input type="hidden" name="_redirect" value="/dashboard">
    <div class="grid-2">
      <label>Service
        <input type="text" name="merchant_name" list="merchant-list" required maxlength="120" value="${esc(d.merchant_name)}" placeholder="Netflix">
      </label>
      <label>Plan <span class="hint-inline">(optional)</span>
        <input type="text" name="plan_name" maxlength="120" value="${esc(d.plan_name)}" placeholder="Standard">
      </label>
    </div>
    <div class="grid-3">
      <label>Amount
        <input type="text" name="amount" inputmode="decimal" value="${esc(d.amount)}" placeholder="15.49">
      </label>
      <label>Currency
        <select name="currency">${options(CURRENCIES, d.currency)}</select>
      </label>
      <label>Billing cycle
        <select name="cadence" data-cadence>${options(CADENCE_OPTIONS, d.cadence, CADENCE_LABELS)}</select>
      </label>
    </div>
    <div class="grid-3">
      <label data-custom-wrap>Custom days
        <input type="number" name="custom_interval_days" min="1" max="3650" value="${esc(d.custom_interval_days)}">
      </label>
      <label>Next renewal
        <input type="date" name="next_renewal_date" value="${esc(d.next_renewal_date)}">
      </label>
      <label>Status
        <select name="status">${options(STATUS_OPTIONS, d.status, { needs_review: 'Needs review' })}</select>
      </label>
    </div>
    <label>Started on <span class="hint-inline">(optional)</span>
      <input type="date" name="started_on" value="${esc(d.started_on)}">
    </label>
    <label>Notes <span class="hint-inline">(optional)</span>
      <textarea name="notes" rows="2" maxlength="2000">${esc(d.notes)}</textarea>
    </label>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">${id ? 'Save changes' : 'Add subscription'}</button>
    </div>
  </form>`;
}

function merchantDatalist() {
  return `<datalist id="merchant-list">${MERCHANTS.map((m) => `<option value="${esc(m.name)}"></option>`).join('')}</datalist>`;
}

export function dashboardPage({ user, data, csrfToken, notice = '', error = '', ingestAddress = '', calendarUrl = '' }) {
  const { summary, subscriptions, detections, notifications } = data;
  const currency = user.currency || 'USD';
  const activeSubs = subscriptions.filter((s) => !['canceled'].includes(s.status));
  const canceledSubs = subscriptions.filter((s) => s.status === 'canceled');
  const upcoming = summary.upcoming.slice(0, 6);

  const rows = subscriptions.length
    ? subscriptions.map((s) => subscriptionRow(s, csrfToken)).join('')
    : '';
  const canceledRows = canceledSubs.length
    ? canceledSubs.map((s) => subscriptionRow(s, csrfToken)).join('')
    : '';

  const body = `
  <div class="page-head">
    <div>
      <h1>Your subscriptions</h1>
      <p class="muted">Everything renewing, sorted by what needs attention first.</p>
    </div>
    <div class="page-head-actions">
      <button class="btn btn-primary" type="button" data-open-add>Add subscription</button>
    </div>
  </div>

  ${summaryCards(summary, currency)}

  ${detectionsSection(detections, csrfToken)}

  <section class="panel">
    <div class="panel-head">
      <h2>Upcoming renewals</h2>
      <span class="muted small">Next 30 days</span>
    </div>
    ${
      upcoming.length
        ? `<ul class="timeline">${upcoming
            .map(
              (s) => `<li>
                <span class="date-chip">${esc(formatDateHuman(s.next_renewal_date))}</span>
                <span class="timeline-name">${esc(s.merchant_name)}</span>
                <span class="timeline-amount">${esc(formatMoney(s.amount_cents, s.currency))}</span>
              </li>`
            )
            .join('')}</ul>`
        : '<p class="muted small">No renewals in the next 30 days.</p>'
    }
  </section>

  <section class="panel">
    <div class="panel-head">
      <h2>All subscriptions</h2>
      <span class="muted small">${activeSubs.length} tracked</span>
    </div>
    ${
      rows
        ? `<div class="table-wrap"><table class="subs-table">
            <thead><tr><th>Service</th><th>Cost</th><th>Next renewal</th><th>Status</th><th class="actions-head">Actions</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`
        : `<div class="empty">
            <h3>No subscriptions yet</h3>
            <p class="muted">Add one manually, forward a receipt email to your private address, or import a CSV from your bank.</p>
            <p class="small">Your forwarding address: <code>${esc(ingestAddress || 'available in Settings')}</code></p>
          </div>`
    }
  </section>

  ${
    canceledRows
      ? `<section class="panel">
          <details>
            <summary><h2 class="inline-h2">Canceled (${canceledSubs.length})</h2></summary>
            <div class="table-wrap"><table class="subs-table"><tbody>${canceledRows}</tbody></table></div>
          </details>
        </section>`
      : ''
  }

  <section class="panel">
    <div class="panel-head">
      <h2>Reminders</h2>
      <form method="post" action="/api/notifications/read" class="inline">
        ${csrfField(csrfToken)}
        <button class="link" type="submit">Mark all read</button>
      </form>
    </div>
    ${
      notifications.length
        ? `<ul class="notes">${notifications
            .slice(0, 8)
            .map(
              (n) => `<li class="${n.read_at ? '' : 'unread'}">
                <strong>${esc(n.title)}</strong>
                <span class="sub">${esc(n.body)}</span>
                <span class="sub">${esc(new Date(n.created_at).toLocaleString())}</span>
              </li>`
            )
            .join('')}</ul>`
        : '<p class="muted small">No reminders yet. Add a subscription with a renewal date.</p>'
    }
  </section>

  <section class="panel">
    <details class="add-panel">
      <summary>Add a subscription manually</summary>
      <p class="muted small">Use this when a receipt or bank feed has not caught it yet.</p>
      ${subscriptionForm({ csrfToken, defaults: { currency } })}
    </details>
  </section>

  <dialog id="edit-dialog" class="dialog">
    <div class="dialog-head">
      <h2>Edit subscription</h2>
      <button type="button" class="link" data-close-dialog>Close</button>
    </div>
    <div id="edit-form-wrap"></div>
  </dialog>

  <template id="edit-template">
    <div class="dialog-body">${subscriptionForm({ csrfToken, formAction: '/api/subscriptions/0' })}</div>
  </template>

  ${merchantDatalist()}
`;
  return layout({
    title: 'Dashboard',
    body,
    user,
    csrfToken,
    active: 'dashboard',
    notice,
    error,
    wide: true,
  });
}

export function settingsPage({ user, csrfToken, notice = '', error = '', ingestAddress = '', calendarUrl = '', ingestEnabled = false }) {
  const body = `
  <div class="page-head">
    <div>
      <h1>Settings</h1>
      <p class="muted">Sources, reminders, privacy, and security.</p>
    </div>
  </div>

  <section class="panel">
    <h2>Profile &amp; reminders</h2>
    <form method="post" action="/api/settings" class="stack" novalidate>
      ${csrfField(csrfToken)}
      <input type="hidden" name="_redirect" value="/settings">
      <div class="grid-2">
        <label>Email
          <input type="email" value="${esc(user.email)}" disabled>
        </label>
        <label>Currency
          <select name="currency">${options(CURRENCIES, user.currency)}</select>
        </label>
      </div>
      <div class="grid-2">
        <label>Timezone
          <input type="text" name="timezone" value="${esc(user.timezone)}" maxlength="64">
          <span class="hint">IANA timezone, e.g. America/New_York</span>
        </label>
        <label>Remind me (days before)
          <input type="text" name="reminder_days" value="${esc(user.reminder_days)}" maxlength="40">
          <span class="hint">Comma-separated, e.g. 7,3,1,0</span>
        </label>
      </div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Save settings</button></div>
    </form>
  </section>

  <section class="panel">
    <h2>Automatic detection</h2>
    <p class="muted small">Renewly learns about subscriptions from two sources. Both are idempotent and authenticated.</p>

    <div class="source">
      <h3>1. Receipt email forwarding</h3>
      <p class="muted small">Create a rule in Gmail/Outlook/Fastmail that forwards receipts to this address. Include the original sender so the merchant is recognized.</p>
      ${
        ingestAddress
          ? `<div class="copy-row">
              <code id="ingest-address">${esc(ingestAddress)}</code>
              <button type="button" class="btn btn-small" data-copy="ingest-address">Copy</button>
            </div>`
          : '<p class="text-warn small">Address unavailable. Rotate the token below.</p>'
      }
      <p class="muted tiny">Inbound webhook: <code>POST ${esc(config.baseUrl)}/webhooks/email</code> — point your provider here, or use <code>POST /webhooks/email/:token</code> for testing. Requests may be signed with <code>X-Renewly-Signature</code> (HMAC-SHA256 of the raw body).</p>
      <form method="post" action="/api/settings/rotate-ingest" class="inline">
        ${csrfField(csrfToken)}
        <input type="hidden" name="_redirect" value="/settings">
        <button class="link danger" type="submit" data-confirm="Rotate the forwarding address? Existing rules stop working.">Rotate address</button>
      </form>
    </div>

    <div class="source">
      <h3>2. Bank / card transaction feed</h3>
      <p class="muted small">Send normalized transactions to the webhook below. Renewly clusters repeating charges, infers the cycle, and detects price changes. CSV import is also available for statements.</p>
      <p class="muted tiny"><code>POST ${esc(config.baseUrl)}/webhooks/transactions</code> with <code>Authorization: Bearer &lt;forwarding token&gt;</code> or <code>/webhooks/transactions/:token</code>.</p>
      <details>
        <summary class="small">Example payload</summary>
        <pre class="code">${esc(`{
  "transactions": [
    {
      "merchant_raw": "NFLX*NETFLIX.COM",
      "amount": "15.49",
      "currency": "USD",
      "posted_date": "2026-03-03",
      "external_id": "txn_123"
    }
  ]
}`)}</pre>
      </details>
    </div>
  </section>

  <section class="panel">
    <h2>Calendar feed</h2>
    <p class="muted small">Subscribe from Google Calendar, Apple Calendar, or Outlook to see renewals as all-day events. Treat this URL as a secret: anyone with it can read your renewal list.</p>
    ${
      calendarUrl
        ? `<div class="copy-row">
            <code id="calendar-url">${esc(calendarUrl)}</code>
            <button type="button" class="btn btn-small" data-copy="calendar-url">Copy</button>
          </div>`
        : '<p class="text-warn small">Feed unavailable. Rotate the token below.</p>'
    }
    <form method="post" action="/api/settings/rotate-calendar" class="inline">
      ${csrfField(csrfToken)}
      <input type="hidden" name="_redirect" value="/settings">
      <button class="link danger" type="submit" data-confirm="Rotate the calendar link? Existing subscriptions to the feed stop working.">Rotate calendar link</button>
    </form>
  </section>

  <section class="panel">
    <h2>Import bank CSV</h2>
    <p class="muted small">Columns needed: a description/merchant, a date, and an amount. Common header names are auto-detected.</p>
    <form method="post" action="/api/import/csv" class="stack" data-csv-form>
      ${csrfField(csrfToken)}
      <input type="hidden" name="_redirect" value="/settings">
      <label>CSV file
        <input type="file" accept=".csv,text/csv" data-csv-file>
      </label>
      <label>Or paste CSV
        <textarea name="csv" rows="5" data-csv-text placeholder="Description,Date,Amount&#10;NFLX*NETFLIX.COM,2026-01-03,15.49"></textarea>
      </label>
      <div class="form-actions"><button class="btn" type="submit">Import transactions</button></div>
    </form>
  </section>

  <section class="panel">
    <h2>Data &amp; security</h2>
    <div class="grid-2">
      <div>
        <h3>Export</h3>
        <p class="muted small">Download everything Renewly stores for your account.</p>
        <a class="btn btn-small" href="/api/export">Download JSON</a>
      </div>
      <div>
        <h3>Change password</h3>
        <form method="post" action="/api/settings/password" class="stack compact">
          ${csrfField(csrfToken)}
          <input type="hidden" name="_redirect" value="/settings">
          <label>Current password
            <input type="password" name="current_password" autocomplete="current-password" required maxlength="200">
          </label>
          <label>New password
            <input type="password" name="new_password" autocomplete="new-password" required minlength="10" maxlength="200">
          </label>
          <div class="form-actions"><button class="btn btn-small" type="submit">Update password</button></div>
        </form>
      </div>
    </div>
    <hr>
    <h3 class="text-danger">Delete account</h3>
    <p class="muted small">This permanently removes your subscriptions, sessions, transactions, and tokens.</p>
    <form method="post" action="/api/account/delete" class="inline" data-confirm="Permanently delete your account and all data?">
      ${csrfField(csrfToken)}
      <input type="password" name="password" required maxlength="200" placeholder="Confirm password">
      <button class="btn btn-small btn-danger" type="submit">Delete everything</button>
    </form>
  </section>

  <section class="panel">
    <h2>Security notes</h2>
    <ul class="tight muted small">
      <li>Passwords are hashed with scrypt (N=32768, r=8, p=1) and unique salts.</li>
      <li>Sessions are opaque random tokens stored hashed server-side; cookies are HttpOnly, SameSite=Strict${user ? '' : ''}.</li>
      <li>All state-changing requests require a CSRF token bound to your session.</li>
      <li>Provider tokens and capability tokens are encrypted at rest with AES-256-GCM.</li>
      <li>Webhooks support HMAC-SHA256 signatures and are deduplicated for replay protection.</li>
      <li>All SQL is parameterized; HTML output is escaped; CSP blocks inline and third-party scripts.</li>
    </ul>
  </section>
`;
  return layout({ title: 'Settings', body, user, csrfToken, active: 'settings', notice, error });
}

export function messagePage({ title, message, user = null, csrfToken = '', status = 200 }) {
  const body = `<section class="panel"><h1>${esc(title)}</h1><p class="muted">${esc(message)}</p><p><a href="${user ? '/dashboard' : '/login'}">Back to ${user ? 'dashboard' : 'sign in'}</a></p></section>`;
  return layout({ title, body, user, csrfToken });
}
