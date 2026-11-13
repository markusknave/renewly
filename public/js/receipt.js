// Turns OCR text from a receipt, payslip, or transfer confirmation into the
// fields the transaction dialog needs. Pure and deterministic: the caller
// always shows the parsed values in the form for review before saving.

import { isValidIsoDate, parseDateLoose, parseNumericAmount } from './lib/dates.js';
import { detectCategory } from './lib/categories.js';
import { matchTransferMethod } from './importers/table.js';

const MONEY = /(?:₱|php|p)?\s*(\d[\d,]*(?:\.\d{1,2})?)/i;
const DECIMAL_MONEY = /(?:₱|php|p)?\s*(\d[\d,]*\.\d{2})/i;

const TOTAL_LABELS = [
	[/(?:grand\s+total|total\s+amount\s+due|total\s+due|amount\s+due|amount\s+payable)/i, 100],
	[/(?:net\s+pay|net\s+income|take\s+home(?:\s+pay)?|net\s+amount)/i, 100],
	[/(?:total\s+paid|amount\s+paid|paid\s+total)/i, 80],
	[/(?:^|\s)total(?:\s+php|\s+pesos)?(?:\s*[:#]|\s|$)/i, 60],
	[/(?:amount\s+sent|amount\s+received|amount\s+transferred|transfer\s+amount)/i, 90],
	[/(?:^|\s)amount(?:\s*:|\s|$)/i, 30],
];

const INCOME_HINT = /\b(net\s+pay|net\s+income|take\s+home|payslip|salary|payroll|gross\s+pay|earnings)\b/i;
const TRANSFER_HINT = /\b(instapay|pesonet|fund\s+transfer|transfer\s+(?:to|from)|sent\s+via|received\s+from)\b/i;
const TRANSFER_IN_HINT = /\b(received|credited|incoming|transfer\s+from|fund\s+transfer\s+from)\b/i;

const DATE_HINT = /(?:pay\s*date|date\s*issued|issue\s*date|transaction\s*date|posted\s*date|receipt\s*date|date)/i;
const MERCHANT_STOP = /^(receipt|invoice|official\s+receipt|sales\s+invoice|payslip|payment\s+receipt|transaction\s+receipt|thank\s+you|welcome|customer\s+copy|store\s+copy|vat\s+receipt|provisional\s+receipt|cash\s+receipt|delivery\s+receipt|order\s+slip|statement|bank\s+statement|confirmation|reference|ref\s*no|control\s+no|tin|vat\s+reg|tel|phone|address|branch|date|time|cashier|server|table|terminal|amount|total|subtotal|vatable|vat\s+exempt|zero\s+rated|discount|change|cash|card|balance|description|qty|quantity|price|item)\b/i;

function linesOf(text) {
	return String(text || '')
		.replace(/\r/g, '\n')
		.split('\n')
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter(Boolean);
}

function moneyFrom(line) {
	const match = String(line).match(DECIMAL_MONEY) || String(line).match(MONEY);
	if (!match) return null;
	const cents = parseNumericAmount(match[1]);
	if (!Number.isInteger(cents) || cents <= 0) return null;
	// Reject phone numbers and years that OCR attached to a label.
	if (!/\./.test(match[1]) && match[1].replace(/\D/g, '').length > 7) return null;
	return cents;
}

function amountFor(lines, { income = false } = {}) {
	let best = null;
	lines.forEach((line, index) => {
		for (const [pattern, score] of TOTAL_LABELS) {
			const match = line.match(pattern);
			if (!match) continue;
			const after = line.slice(match.index + match[0].length);
			const cents = moneyFrom(after) ?? moneyFrom(line);
			if (!cents) continue;
			const incomeBonus = income && score >= 100 && /net\s+pay|net\s+income|take\s+home|net\s+amount/i.test(match[0]) ? 25 : 0;
			const candidate = { cents, score: score + incomeBonus, index };
			if (!best || candidate.score > best.score || (candidate.score === best.score && index > best.index)) {
				best = candidate;
			}
			break;
		}
	});
	if (best) return best.cents;

	// Fallback: the largest conventional money value in the lower half of the
	// document. This catches receipts whose total label OCR mangled.
	const start = Math.floor(lines.length / 2);
	let largest = null;
	for (const line of lines.slice(start)) {
		if (/\b(subtotal|vat|tax|discount|change|cash|tendered|balance|tip|shipping)\b/i.test(line)) continue;
		for (const match of line.matchAll(new RegExp(DECIMAL_MONEY.source, 'gi'))) {
			const cents = parseNumericAmount(match[1]);
			if (Number.isInteger(cents) && cents > 0 && (!largest || cents > largest)) largest = cents;
		}
	}
	return largest;
}

function dateFor(lines, today) {
	const candidates = [];
	for (const line of lines.slice(0, 16)) {
		if (!DATE_HINT.test(line) && candidates.length > 3) continue;
		const date = parseDateLoose(line, { today });
		if (!date) continue;
		const hinted = DATE_HINT.test(line);
		const future = date > today;
		candidates.push({ date, hinted, future });
	}
	const usable = candidates.filter((candidate) => !candidate.future);
	const hinted = usable.find((candidate) => candidate.hinted);
	if (hinted) return hinted.date;
	if (usable.length) return usable[0].date;
	return null;
}

function merchantFor(lines, type) {
	const candidates = lines
		.slice(0, 14)
		.map((line) => line.replace(/^[^a-z0-9]+|[^a-z0-9)]+$/gi, '').trim())
		.filter((line) => line.length >= 3 && line.length <= 48)
		.filter((line) => (line.match(/[a-z]/gi) || []).length >= 2)
		.filter((line) => !MERCHANT_STOP.test(line))
		.filter((line) => !/^\d[\d\s.,:/-]*$/.test(line))
		.filter((line) => !/\b\d{2}[/-]\d{2}[/-]\d{2,4}\b/.test(line))
		.filter((line) => !/(?:₱|php)\s*\d/i.test(line));
	if (!candidates.length) {
		return type === 'income' ? 'Scanned income' : type === 'transfer' ? 'Account transfer' : 'Scanned expense';
	}
	const employer = candidates.find((line) => /inc\.?$|corp\.?$|corporation|company|enterprises|holdings/i.test(line));
	return (type === 'income' ? employer || candidates[0] : candidates[0]).slice(0, 60);
}

function transferFor(text, methods) {
	if (!TRANSFER_HINT.test(text)) return null;
	const direction = TRANSFER_IN_HINT.test(text) ? 'in' : 'out';
	const transferMethodId = matchTransferMethod(text, methods, null);
	return { direction, transferMethodId };
}

export function parseReceipt(text, { today, methods = [] } = {}) {
	const raw = String(text || '').trim();
	const lines = linesOf(raw);
	const day = isValidIsoDate(today) ? today : new Date().toISOString().slice(0, 10);
	const warnings = [];

	const transfer = transferFor(raw, methods);
	const type = INCOME_HINT.test(raw) ? 'income' : transfer ? 'transfer' : 'expense';
	const date = dateFor(lines, day);
	if (!date) warnings.push('No date was readable; today is filled in.');
	const amountCents = amountFor(lines, { income: type === 'income' });
	if (!amountCents) warnings.push('No total was readable; enter the amount manually.');
	const merchant = merchantFor(lines, type);

	let category = 'other';
	if (type === 'income') category = 'income';
	else if (type === 'expense') {
		category = detectCategory(merchant) || detectCategory(raw.slice(0, 600)) || 'other';
	}

	let description = merchant;
	if (type === 'transfer') {
		const counterpart = methods.find((method) => method.id === transfer?.transferMethodId);
		if (transfer?.direction === 'in') {
			description = counterpart ? `Transfer from ${counterpart.label}` : 'Incoming transfer';
		} else {
			description = counterpart ? `Transfer to ${counterpart.label}` : 'Account transfer';
		}
	}
	if (!transfer && type === 'expense' && !lines.length) {
		warnings.push('The photo did not contain readable text.');
	}

	return {
		type,
		date: date || day,
		amountCents: amountCents || null,
		merchant: description.slice(0, 60),
		category,
		notes: 'Scanned from a photo',
		direction: type === 'transfer' ? transfer?.direction || 'out' : null,
		transferMethodId: type === 'transfer' ? transfer?.transferMethodId ?? null : null,
		warnings,
	};
}
