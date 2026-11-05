import { parseDateLoose, parseNumericAmount, todayInTz } from '../lib/dates.js';

export function detectDelimiter(firstLine) {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const count = (firstLine.match(new RegExp(`\\${d}`, 'g')) || []).length;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(text, { delimiter } = {}) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  if (!source.trim()) return { headers: [], rows: [] };
  const firstLine = source.split(/\r?\n/, 1)[0] || '';
  const sep = delimiter || detectDelimiter(firstLine);

  const records = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      records.push(row);
      row = [];
    } else if (ch === '\r') {
      // skip; handled by \n
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  const cleaned = records.filter((r) => r.some((c) => String(c).trim() !== ''));
  if (!cleaned.length) return { headers: [], rows: [] };
  const headers = cleaned[0].map((h) => String(h).trim().toLowerCase());
  const rows = cleaned.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? String(r[idx]).trim() : '';
    });
    return obj;
  });
  return { headers, rows };
}

const ALIASES = {
  merchant_raw: ['merchant', 'description', 'name', 'payee', 'details', 'transaction description', 'memo', 'narrative'],
  posted_date: ['date', 'posted date', 'posting date', 'transaction date', 'posted_date', 'transaction_date'],
  amount: ['amount', 'transaction amount', 'value', 'debit', 'debit amount', 'charge'],
  currency: ['currency', 'currency code', 'ccy'],
  external_id: ['id', 'transaction id', 'transaction_id', 'reference', 'ref'],
  account_label: ['account', 'account name', 'card', 'account_label'],
};

function pick(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== '') return row[key];
  }
  return '';
}

export function rowsFromCsv(csvText, { defaultCurrency = 'USD', today = todayInTz('UTC') } = {}) {
  const { headers, rows } = parseCsv(csvText);
  if (!headers.length) return { rows: [], ignored: 0 };

  const present = new Set(headers);
  if (![...ALIASES.merchant_raw].some((k) => present.has(k))) {
    return { rows: [], ignored: rows.length, error: 'CSV needs a merchant/description column' };
  }
  if (![...ALIASES.posted_date].some((k) => present.has(k))) {
    return { rows: [], ignored: rows.length, error: 'CSV needs a date column' };
  }
  if (![...ALIASES.amount].some((k) => present.has(k))) {
    return { rows: [], ignored: rows.length, error: 'CSV needs an amount column' };
  }

  const out = [];
  let ignored = 0;
  for (const row of rows) {
    const merchant = pick(row, ALIASES.merchant_raw);
    const rawDate = pick(row, ALIASES.posted_date);
    const rawAmount = pick(row, ALIASES.amount);
    const date = parseDateLoose(rawDate, { today });
    const cents = parseNumericAmount(rawAmount);
    if (!merchant || !date || cents === null) {
      ignored += 1;
      continue;
    }
    out.push({
      merchant_raw: merchant,
      posted_date: date,
      amount_cents: Math.abs(cents),
      currency: (pick(row, ALIASES.currency) || defaultCurrency).toUpperCase(),
      external_id: pick(row, ALIASES.external_id) || undefined,
      account_label: pick(row, ALIASES.account_label) || undefined,
    });
  }
  return { rows: out, ignored };
}
