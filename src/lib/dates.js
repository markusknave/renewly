const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const CADENCES = new Set([
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
  'custom',
]);

export const CADENCE_LABELS = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semiannual: 'Every 6 months',
  annual: 'Yearly',
  custom: 'Custom',
};

const CURRENCY_SYMBOLS = [
  ['US$', 'USD'],
  ['CA$', 'CAD'],
  ['A$', 'AUD'],
  ['NZ$', 'NZD'],
  ['S$', 'SGD'],
  ['HK$', 'HKD'],
  ['R$', 'BRL'],
  ['$', 'USD'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['¥', 'JPY'],
  ['₹', 'INR'],
  ['₱', 'PHP'],
  ['₩', 'KRW'],
  ['₽', 'RUB'],
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 1970 || y > 3000 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function toIso(y, m, d) {
  const iso = `${y}-${pad2(m)}-${pad2(d)}`;
  return isValidIsoDate(iso) ? iso : null;
}

export function todayInTz(timeZone = 'UTC') {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function addDays(iso, days) {
  if (!isValidIsoDate(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days));
  return dt.toISOString().slice(0, 10);
}

function addMonths(iso, months) {
  if (!isValidIsoDate(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const target = m - 1 + Number(months);
  const ty = y + Math.floor(target / 12);
  const tm = ((target % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return toIso(ty, tm + 1, Math.min(d, lastDay));
}

export function addCadence(iso, cadence, customDays = 30) {
  switch (cadence) {
    case 'weekly':
      return addDays(iso, 7);
    case 'biweekly':
      return addDays(iso, 14);
    case 'monthly':
      return addMonths(iso, 1);
    case 'quarterly':
      return addMonths(iso, 3);
    case 'semiannual':
      return addMonths(iso, 6);
    case 'annual':
      return addMonths(iso, 12);
    case 'custom':
      return addDays(iso, Math.max(1, Number(customDays) || 30));
    default:
      return addMonths(iso, 1);
  }
}

export function daysBetween(fromIso, toIso) {
  if (!isValidIsoDate(fromIso) || !isValidIsoDate(toIso)) return null;
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function normalizeCadence(value, intervalDays) {
  const v = String(value || '').toLowerCase().trim();
  if (CADENCES.has(v)) return v;
  const aliases = {
    week: 'weekly',
    'every week': 'weekly',
    'per week': 'weekly',
    'every 2 weeks': 'biweekly',
    fortnightly: 'biweekly',
    'bi-weekly': 'biweekly',
    month: 'monthly',
    'per month': 'monthly',
    monthly: 'monthly',
    quarter: 'quarterly',
    'every 3 months': 'quarterly',
    'per quarter': 'quarterly',
    'every 6 months': 'semiannual',
    'semi-annual': 'semiannual',
    'half yearly': 'semiannual',
    year: 'annual',
    yearly: 'annual',
    annually: 'annual',
    'per year': 'annual',
    'per annum': 'annual',
  };
  if (aliases[v]) return aliases[v];
  if (Number.isFinite(Number(intervalDays)) && Number(intervalDays) > 0) {
    const d = Number(intervalDays);
    if (d >= 5 && d <= 9) return 'weekly';
    if (d >= 12 && d <= 17) return 'biweekly';
    if (d >= 25 && d <= 35) return 'monthly';
    if (d >= 80 && d <= 100) return 'quarterly';
    if (d >= 170 && d <= 200) return 'semiannual';
    if (d >= 350 && d <= 380) return 'annual';
    return 'custom';
  }
  return 'monthly';
}

export function cadenceFromIntervalDays(days) {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return null;
  if (d >= 5 && d <= 9) return 'weekly';
  if (d >= 12 && d <= 17) return 'biweekly';
  if (d >= 25 && d <= 35) return 'monthly';
  if (d >= 50 && d <= 70) return 'bimonthly';
  if (d >= 80 && d <= 100) return 'quarterly';
  if (d >= 170 && d <= 200) return 'semiannual';
  if (d >= 350 && d <= 380) return 'annual';
  return 'custom';
}

export function parseNumericAmount(raw) {
  let s = String(raw || '').replace(/[\s\u00a0]/g, '').replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let decSep = null;
  if (lastDot >= 0 && lastComma >= 0) {
    decSep = lastDot > lastComma ? '.' : ',';
  } else if (lastDot >= 0) {
    const after = s.length - lastDot - 1;
    decSep = after === 1 || after === 2 ? '.' : null;
  } else if (lastComma >= 0) {
    const after = s.length - lastComma - 1;
    decSep = after === 1 || after === 2 ? ',' : null;
  }
  if (decSep) {
    const idx = s.lastIndexOf(decSep);
    const intPart = s.slice(0, idx).replace(/[.,]/g, '');
    const frac = s.slice(idx + 1).replace(/[.,]/g, '');
    s = `${intPart}.${frac}`;
  } else {
    s = s.replace(/[.,]/g, '');
  }
  const num = Number(s);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

export function parseAmount(text, defaultCurrency = 'USD') {
  if (!text) return null;
  const source = String(text).replace(/\u00a0/g, ' ');
  let currency = null;
  const code = source.match(
    /\b(USD|EUR|GBP|CAD|AUD|JPY|INR|PHP|CHF|SEK|NOK|DKK|NZD|SGD|HKD|BRL|MXN|ZAR|KRW|RUB)\b/i
  );
  if (code) currency = code[1].toUpperCase();
  if (!currency) {
    for (const [symbol, curr] of CURRENCY_SYMBOLS) {
      if (source.includes(symbol)) {
        currency = curr;
        break;
      }
    }
  }
  currency = currency || defaultCurrency || 'USD';

  const patterns = [
    /(?:US\$|CA\$|A\$|NZ\$|S\$|HK\$|R\$|\$|€|£|¥|₹|₱|₩|₽)\s*(\d[\d.,]*)/i,
    /(?:USD|EUR|GBP|CAD|AUD|JPY|INR|PHP|CHF|SEK|NOK|DKK|NZD|SGD|HKD|BRL|MXN|ZAR|KRW|RUB)\s*(\d[\d.,]*)/i,
    /(\d[\d.,]*)\s*(?:USD|EUR|GBP|CAD|AUD|JPY|INR|PHP|CHF|SEK|NOK|DKK|NZD|SGD|HKD|BRL|MXN|ZAR|KRW|RUB)\b/i,
    /(\d[\d.,]*)\s*(?:US\$|CA\$|A\$|NZ\$|S\$|HK\$|R\$|\$|€|£|¥|₹|₱|₩|₽)/,
    /\b(\d{1,3}(?:[,.]\d{3})*[.,]\d{2})\b/,
    /\b(\d+[.,]\d{1,2})\b/,
  ];
  for (const re of patterns) {
    const m = source.match(re);
    if (!m) continue;
    let candidate = m[1];
    if (!/\d/.test(candidate)) continue;
    const cents = parseNumericAmount(candidate);
    if (cents === null) continue;
    if (cents > 100000000) continue;
    return { cents, currency };
  }
  return null;
}

export function parseDateLoose(input, { today = todayInTz('UTC') } = {}) {
  if (!input) return null;
  const s = String(input).replace(/\u00a0/g, ' ').trim();
  let m;

  m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) {
    const iso = toIso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (iso) return iso;
  }

  m = s.match(/\b(\d{4})\/(\d{1,2})\/(\d{1,2})\b/);
  if (m) {
    const iso = toIso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (iso) return iso;
  }

  const monthName = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

  m = s.match(new RegExp(`\\b${monthName}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'i'));
  if (m) {
    const iso = toIso(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));
    if (iso) return iso;
  }

  m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthName},?\\s+(\\d{4})\\b`, 'i'));
  if (m) {
    const iso = toIso(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
    if (iso) return iso;
  }

  m = s.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);
  if (m) {
    let month = Number(m[1]);
    let day = Number(m[2]);
    if (month > 12 && day <= 12) {
      month = Number(m[2]);
      day = Number(m[1]);
    }
    const iso = toIso(Number(m[3]), month, day);
    if (iso) return iso;
  }

  m = s.match(new RegExp(`\\b${monthName}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'));
  if (m) {
    return inferYear(MONTHS[m[1].toLowerCase()], Number(m[2]), today);
  }

  m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthName}\\b`, 'i'));
  if (m) {
    return inferYear(MONTHS[m[2].toLowerCase()], Number(m[1]), today);
  }

  m = s.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (m) {
    let month = Number(m[1]);
    let day = Number(m[2]);
    if (month > 12 && day <= 12) {
      month = Number(m[2]);
      day = Number(m[1]);
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return inferYear(month, day, today);
    }
  }

  return null;
}

function inferYear(month, day, today) {
  const baseYear = Number(String(today).slice(0, 4));
  for (const year of [baseYear, baseYear + 1]) {
    const iso = toIso(year, month, day);
    if (!iso) continue;
    const delta = daysBetween(today, iso);
    if (delta !== null && delta >= -7) return iso;
  }
  return toIso(baseYear + 1, month, day);
}

export function formatMoney(cents, currency = 'USD') {
  const value = (Number(cents) || 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency || 'USD').toUpperCase(),
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function formatDateHuman(iso) {
  if (!isValidIsoDate(iso)) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

export function formatDateShort(iso) {
  if (!isValidIsoDate(iso)) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

export function monthlyCents(amountCents, cadence, customDays = 30) {
  const amount = Number(amountCents) || 0;
  switch (cadence) {
    case 'weekly':
      return Math.round((amount * 52) / 12);
    case 'biweekly':
      return Math.round((amount * 26) / 12);
    case 'monthly':
      return amount;
    case 'quarterly':
      return Math.round(amount / 3);
    case 'semiannual':
      return Math.round(amount / 6);
    case 'annual':
      return Math.round(amount / 12);
    case 'custom': {
      const days = Math.max(1, Number(customDays) || 30);
      return Math.round((amount * (365.25 / days)) / 12);
    }
    default:
      return amount;
  }
}

export function yearlyCents(amountCents, cadence, customDays = 30) {
  return monthlyCents(amountCents, cadence, customDays) * 12;
}

export function relativeDays(iso, today = todayInTz('UTC')) {
  const delta = daysBetween(today, iso);
  if (delta === null) return '';
  if (delta === 0) return 'today';
  if (delta === 1) return 'tomorrow';
  if (delta === -1) return 'yesterday';
  if (delta > 1) return `in ${delta} days`;
  return `${Math.abs(delta)} days ago`;
}
