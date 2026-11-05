import {
  addCadence,
  normalizeCadence,
  parseAmount,
  parseDateLoose,
  todayInTz,
} from '../lib/dates.js';
import { slugify, merchantFromEmail } from './merchants.js';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeQuotedPrintable(input) {
  return String(input)
    .replace(/=\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodePart(body, headerText) {
  const headers = String(headerText).toLowerCase();
  let out = body;
  if (headers.includes('base64')) {
    out = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  } else if (headers.includes('quoted-printable')) {
    out = decodeQuotedPrintable(body);
  }
  return out;
}

export function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeHeader(value) {
  return String(value).replace(/=\?([^?]+)\?([BbQq])\?([^?]+)\?=/g, (match, charset, enc, data) => {
    try {
      if (enc.toUpperCase() === 'B') {
        return Buffer.from(data, 'base64').toString('utf8');
      }
      return decodeQuotedPrintable(data.replace(/_/g, ' '));
    } catch {
      return match;
    }
  });
}

export function parseRawEmail(raw) {
  const text = String(raw || '').replace(/\r\n/g, '\n');
  const split = text.indexOf('\n\n');
  const headerBlock = split >= 0 ? text.slice(0, split) : '';
  const body = split >= 0 ? text.slice(split + 2) : text;
  const headers = {};
  for (const line of headerBlock.replace(/\n[ \t]+/g, ' ').split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
    }
  }

  const ctype = headers['content-type'] || '';
  let content = body;
  if (/multipart\//i.test(ctype)) {
    const boundary = /boundary="?([^";]+)"?/i.exec(ctype)?.[1];
    if (boundary) {
      const parts = body.split(new RegExp(`--${escapeRegex(boundary)}(?:--)?`, 'g'));
      let plain = '';
      let html = '';
      for (const part of parts) {
        const idx = part.indexOf('\n\n');
        if (idx < 0) continue;
        const partHeaders = part.slice(0, idx);
        const partBody = part.slice(idx + 2);
        const partType = (/content-type:\s*([^\n;]+)/i.exec(partHeaders) || [])[1] || '';
        if (/text\/plain/i.test(partType)) {
          plain += decodePart(partBody, partHeaders);
        } else if (/text\/html/i.test(partType)) {
          html += decodePart(partBody, partHeaders);
        }
      }
      content = plain.trim() || stripHtml(html);
    }
  } else {
    content = decodePart(body, `content-transfer-encoding: ${headers['content-transfer-encoding'] || ''}`);
    if (/text\/html/i.test(ctype)) content = stripHtml(content);
  }

  return {
    from: headers.from || '',
    to: headers.to || '',
    subject: decodeHeader(headers.subject || ''),
    date: headers.date || '',
    messageId: headers['message-id'] || '',
    text: String(content).trim(),
  };
}

function extractAmount(text) {
  const keywordPatterns = [
    /(?:total|amount due|amount charged|amount paid|charged|charge of|payment of|price|renews? at|billed|cost)\s*(?:of|:)?\s*((?:US\$|CA\$|A\$|NZ\$|S\$|HK\$|R\$|\$|€|£|¥|₹|₱)\s*\d[\d.,]*|\d[\d.,]*\s*(?:USD|EUR|GBP|CAD|AUD|JPY|INR|PHP|CHF|SEK|NOK|DKK|NZD|SGD|HKD|BRL|MXN|ZAR))/i,
    /((?:US\$|CA\$|A\$|NZ\$|S\$|HK\$|R\$|\$|€|£|¥|₹|₱)\s*\d[\d.,]*)\s*(?:per|\/)\s*(?:month|mo|year|yr|week)/i,
  ];
  for (const re of keywordPatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const parsed = parseAmount(m[1]);
      if (parsed) return { ...parsed, explicit: true };
    }
  }
  const parsed = parseAmount(text);
  if (parsed) return { ...parsed, explicit: false };
  return null;
}

function extractCadence(text) {
  const checks = [
    [/\b(bi-?weekly|every (?:two|2) weeks|fortnightly)\b/i, 'biweekly'],
    [/\b(weekly|every week|per week|\/week|\/wk)\b/i, 'weekly'],
    [/\b(quarterly|every (?:three|3) months|per quarter|\/quarter)\b/i, 'quarterly'],
    [/\b(semi-?annual|every (?:six|6) months|twice a year)\b/i, 'semiannual'],
    [/\b(annual(?:ly)?|yearly|per year|each year|a year|\/year|\/yr|12 months)\b/i, 'annual'],
    [/\b(monthly|per month|each month|a month|\/month|\/mo|every month)\b/i, 'monthly'],
  ];
  for (const [re, cadence] of checks) {
    const m = text.match(re);
    if (m) return { cadence, explicit: true, word: m[0] };
  }
  return { cadence: 'monthly', explicit: false, word: null };
}

function extractPlan(text, merchantName) {
  const patterns = [
    /(?:your|the)\s+([A-Z][A-Za-z0-9+&.' -]{1,40}?)\s+(?:plan|subscription|membership|tier)\b/,
    /(?:plan|subscription|membership|tier)\s*(?:name)?\s*[:\-]\s*([A-Za-z0-9+&.' -]{2,40})/i,
    /\b(Standard with ads|Premium Plus|Premium|Standard|Ultimate|Family|Duo|Individual|Basic|Essential|Plus|Pro|Business|Enterprise|Student)\b(?:\s+(?:plan|subscription|membership))?/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    let value = (m[1] || '').trim().replace(/[.,;:]+$/, '');
    if (!value) continue;
    if (value.length < 2 || value.length > 60) continue;
    if (merchantName && value.toLowerCase() === String(merchantName).toLowerCase()) continue;
    if (/^(your|the|this|that|a|an)$/i.test(value)) continue;
    if (/^(month|year|week|day)$/i.test(value)) continue;
    return value;
  }
  return null;
}

function extractRenewalDate(text, today) {
  const keyword = /(renews?|renewal|next (?:payment|charge|billing|renewal)|valid until|expires?|expiration|billing (?:period )?ends|good (?:until|through)|due (?:on|by)?|will be charged|charge date|payment date|starts? (?:on|from))/gi;
  let m;
  while ((m = keyword.exec(text)) !== null) {
    const after = text.slice(m.index, m.index + 110);
    const before = text.slice(Math.max(0, m.index - 70), m.index + 40);
    const d = parseDateLoose(after, { today }) || parseDateLoose(before, { today });
    if (d) return d;
  }
  // Strong, unambiguous full date near renewal language.
  const full = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/;
  const fm = text.match(full);
  if (fm) return parseDateLoose(fm[0], { today });
  return null;
}

const RECEIPT_SIGNAL =
  /(receipt|invoice|payment|renewal|renews|billed|billing|subscription|membership|your plan|order confirmation|charged|purchase|trial (?:ends|ending))/i;

const CANCELLED_SIGNAL =
  /(?:subscription|membership|plan)[^.\n]{0,40}(?:has been|was|is)\s+(?:canceled|cancelled)|(?:we(?:'ve| have)? (?:canceled|cancelled) (?:your|the))|cancellation (?:is )?confirmed|your [a-z ]{0,30}(?:subscription|membership) (?:will )?ends? on/i;

export function parseReceiptEmail({
  from = '',
  to = '',
  subject = '',
  text = '',
  html = '',
  raw = '',
  date = '',
  defaultCurrency = 'USD',
  today = todayInTz('UTC'),
} = {}) {
  let parsed = {};
  if (raw) parsed = parseRawEmail(raw);
  const sender = from || parsed.from || '';
  const recipient = to || parsed.to || '';
  const subj = subject || parsed.subject || '';
  const body = text || parsed.text || (html ? stripHtml(html) : '');
  const dateHeader = date || parsed.date || '';
  const combined = `${subj}\n${body}`;

  if (!combined.trim() || combined.trim().length < 12) return null;

  const merchant = merchantFromEmail({ from: sender, subject: subj, text: body });

  const cancelled = CANCELLED_SIGNAL.test(combined) && !/cancel any ?time/i.test(combined);
  if (cancelled) {
    return {
      cancelled: true,
      merchant_key: merchant.key,
      merchant_name: merchant.name,
      known: merchant.known,
      subject: subj,
      message_id: parsed.messageId || '',
      evidence: { reason: 'cancellation email' },
    };
  }

  const amount = extractAmount(combined);
  const explicitDate = extractRenewalDate(combined, today);
  const hasReceiptSignal = RECEIPT_SIGNAL.test(combined);

  if (!amount && !explicitDate) return null;
  if (!hasReceiptSignal && !explicitDate) return null;
  if (!amount && !explicitDate) return null;

  const cadenceInfo = extractCadence(combined);
  const plan = extractPlan(combined, merchant.name);

  let receiptDate = today;
  const parsedHeaderDate = dateHeader ? parseDateLoose(dateHeader, { today }) : null;
  if (parsedHeaderDate) receiptDate = parsedHeaderDate;

  const nextDate =
    explicitDate ||
    addCadence(receiptDate, cadenceInfo.cadence, 30);

  let confidence = 0.35;
  if (merchant.known) confidence += 0.15;
  if (amount) confidence += 0.2;
  if (explicitDate) confidence += 0.2;
  if (cadenceInfo.explicit) confidence += 0.08;
  if (hasReceiptSignal) confidence += 0.07;
  if (!explicitDate) confidence -= 0.08;
  if (!amount) confidence -= 0.1;
  confidence = Math.max(0.05, Math.min(0.98, confidence));

  return {
    cancelled: false,
    merchant_key: merchant.key,
    merchant_name: merchant.name,
    known: merchant.known,
    plan_name: plan,
    amount_cents: amount ? amount.cents : null,
    currency: amount ? amount.currency : defaultCurrency,
    cadence: normalizeCadence(cadenceInfo.cadence),
    next_renewal_date: nextDate,
    date_estimated: !explicitDate,
    confidence: Number(confidence.toFixed(3)),
    message_id: parsed.messageId || '',
    evidence: {
      subject: subj,
      from: sender,
      to: recipient,
      amountExplicit: Boolean(amount?.explicit),
      cadenceWord: cadenceInfo.word,
      dateExplicit: Boolean(explicitDate),
    },
    dedupe_key: `${merchant.key}:${slugify(plan || 'default')}`,
  };
}
