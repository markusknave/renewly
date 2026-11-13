// Shared tabular import mapping: turn CSV/XLSX/JSON rows or PDF statement
// lines into expense or income transactions using headers, column inference,
// and the same category keywords the local analyst uses.

import { parseDateLoose, isValidIsoDate, parseNumericAmount } from '../lib/dates.js';
import { detectCategory, EXPENSE_CATEGORIES, INCOME_CATEGORY } from '../lib/categories.js';

const FIELD_ALIASES = {
	debit: ['debit', 'withdrawal', 'withdrawals', 'moneyout', 'outflow', 'charged', 'charge'],
	credit: ['credit', 'deposit', 'deposits', 'moneyin', 'inflow', 'paidin'],
	date: ['date', 'transactiondate', 'transdate', 'posteddate', 'postingdate', 'valuedate', 'datetime', 'timestamp', 'wdate', 'zdate', 'time'],
	description: ['description', 'merchant', 'payee', 'details', 'particulars', 'narration', 'memo', 'reference', 'transaction', 'item', 'name', 'content', 'zcontent'],
	amount: ['amount', 'amountphp', 'value', 'total', 'debitamount', 'transactionamount', 'zmoney', 'money'],
	category: ['category', 'categoryname', 'type', 'zcategory', 'ctgname', 'classification'],
	method: ['paymentmethod', 'account', 'accountname', 'card', 'source', 'bank', 'wallet', 'asset', 'zasset', 'instrument'],
	notes: ['notes', 'note', 'remarks', 'comment'],
	type: ['type', 'transactiontype', 'drcr', 'debitcredit', 'direction'],
};

const INCOME_TYPE = /^(credit|income|deposit|inflow|moneyin|paidin|in|salary|payroll|refund|interest)$/i;
const EXPENSE_TYPE = /^(debit|expense|withdrawal|withdraw|outflow|moneyout|charge|out|purchase|payment)$/i;
const TRANSFER_TYPE = /^(transfer|transfers|fundtransfer|banktransfer|accounttransfer|instapay|pesonet|sendmoney|remittance)$/i;
const INCOME_TEXT = /\b(salary|payroll|refund|interest\s+(?:earned|received)|cash\s+in|deposit|money\s+in|inflow|credit)\b/i;
const EXPENSE_TEXT = /\b(expense|purchase|payment|withdrawal|debit|money\s+out|outflow|charge)\b/i;
const TRANSFER_TEXT = /\b(transfer(?:red|s)?|fund\s+transfer|instapay|pesonet|sent\s+(?:to|via)|received\s+from|transfer\s+(?:to|from))\b/i;
const TRANSFER_IN_TEXT = /\b(received|received\s+from|credited|incoming|transfer\s+from|fund\s+transfer\s+from|cash\s+in)\b/i;
const TRANSFER_OUT_TEXT = /\b(sent|sent\s+to|transferred\s+to|transfer\s+to|outgoing|fund\s+transfer\s+to)\b/i;
const CREDIT_CARD_TEXT = /\bcredit\s*card\b/i;
const GENERIC_METHOD_TOKENS = new Set([
	'bank',
	'debit',
	'credit',
	'account',
	'wallet',
	'card',
	'cash',
	'other',
	'transfer',
]);

function escapeRegex(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeHeader(value) {
	return String(value ?? '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '');
}

export function normalizeMerchant(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

function classifyType(typeText, categoryText, descriptionText = '') {
	const type = normalizeHeader(typeText);
	if (TRANSFER_TYPE.test(type)) return 'transfer';
	if (EXPENSE_TYPE.test(type)) return 'expense';
	if (INCOME_TYPE.test(type)) return 'income';
	const category = normalizeHeader(categoryText);
	if (TRANSFER_TYPE.test(category)) return 'transfer';
	if (EXPENSE_TYPE.test(category)) return 'expense';
	if (INCOME_TYPE.test(category)) return 'income';
	const text = `${categoryText} ${descriptionText}`.trim();
	if (!text) return null;
	if (INCOME_TEXT.test(text) && !CREDIT_CARD_TEXT.test(text)) return 'income';
	if (TRANSFER_TEXT.test(text) && !CREDIT_CARD_TEXT.test(text)) return 'transfer';
	if (EXPENSE_TEXT.test(text)) return 'expense';
	return null;
}

function cell(row, index) {
	if (!Array.isArray(row) || index < 0 || index >= row.length) return '';
	const value = row[index];
	return value === null || value === undefined ? '' : value;
}

function headerMatches(header, aliases) {
	const normalized = normalizeHeader(header);
	if (!normalized) return false;
	return aliases.some((alias) => normalized === alias || normalized.includes(alias));
}

export function detectHeaderRow(rows) {
	const limit = Math.min(10, rows.length);
	let best = { index: -1, score: 0 };
	for (let index = 0; index < limit; index += 1) {
		const row = rows[index];
		if (!Array.isArray(row)) continue;
		let score = 0;
		for (const value of row) {
			const normalized = normalizeHeader(value);
			if (!normalized) continue;
			for (const aliases of Object.values(FIELD_ALIASES)) {
				if (aliases.some((alias) => normalized === alias || normalized.includes(alias))) {
					score += 1;
					break;
				}
			}
		}
		if (score > best.score) best = { index, score };
	}
	return best.score >= 2 ? best.index : -1;
}

export function buildMapping(headerRow) {
	const mapping = {
		date: -1,
		description: -1,
		amount: -1,
		debit: -1,
		credit: -1,
		category: -1,
		method: -1,
		notes: -1,
		type: -1,
	};
	const columns = (headerRow || []).map((header) => ({ header, normalized: normalizeHeader(header) }));
	for (const field of ['debit', 'credit', 'date', 'description', 'amount', 'category', 'method', 'notes', 'type']) {
		if (mapping[field] >= 0) continue;
		const aliases = FIELD_ALIASES[field];
		const found = columns.findIndex((column) => headerMatches(column.header, aliases));
		if (found >= 0) mapping[field] = found;
	}
	return mapping;
}

function inferColumns(rows) {
	const sample = rows.slice(0, 30).filter(Array.isArray);
	const width = sample.reduce((max, row) => Math.max(max, row.length), 0);
	const scores = Array.from({ length: width }, () => ({ dates: 0, numbers: 0, textLength: 0, textCount: 0 }));
	for (const row of sample) {
		for (let index = 0; index < width; index += 1) {
			const value = cell(row, index);
			const text = String(value ?? '').trim();
			if (!text) continue;
			const plainNumber = typeof value === 'number' || /^\d+(\.\d+)?$/.test(text);
			if (!plainNumber && parseAnyDate(value)) scores[index].dates += 1;
			if (plainNumber || /^[-−(]?\s*[₱$]?\s*\d[\d,.]*\s*[)]?$/.test(text)) {
				scores[index].numbers += 1;
			} else {
				scores[index].textLength += text.length;
				scores[index].textCount += 1;
			}
		}
	}
	let date = -1;
	let amount = -1;
	let description = -1;
	let bestDate = 0;
	let bestAmount = 0;
	let bestText = 0;
	scores.forEach((score, index) => {
		if (score.dates > bestDate) {
			bestDate = score.dates;
			date = index;
		}
		if (score.numbers > bestAmount) {
			bestAmount = score.numbers;
			amount = index;
		}
		const average = score.textCount ? score.textLength / score.textCount : 0;
		if (average > bestText) {
			bestText = average;
			description = index;
		}
	});
	if (date === amount) amount = -1;
	if (description === date || description === amount) description = -1;
	return { date, amount, description };
}

export function parseAnyDate(value, today = new Date().toISOString().slice(0, 10)) {
	if (value === null || value === undefined || value === '') return null;
	const text = String(value).trim();
	if (!text) return null;

	const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
	if (isoMatch && isValidIsoDate(isoMatch[1])) return isoMatch[1];

	if (typeof value === 'number' || /^\d{8,13}$/.test(text)) {
		const number = Number(value);
		if (Number.isInteger(number)) {
			const digits = String(number);
			if (digits.length === 8) {
				const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
				if (isValidIsoDate(iso)) return iso;
			}
			if (digits.length === 10 || digits.length === 13) {
				const millis = digits.length === 10 ? number * 1000 : number;
				const date = new Date(millis);
				if (Number.isFinite(date.getTime())) {
					const iso = date.toISOString().slice(0, 10);
					const year = Number(iso.slice(0, 4));
					if (year >= 1970 && year <= 2100) return iso;
				}
			}
			// Excel serial dates (days since 1899-12-30).
			if (number > 20_000 && number < 80_000) {
				const date = new Date(Date.UTC(1899, 11, 30) + Math.round(number) * 86_400_000);
				return date.toISOString().slice(0, 10);
			}
		}
	}

	return parseDateLoose(text, { today });
}

export function parseMoney(value) {
	if (value === null || value === undefined || value === '') return null;
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) return null;
		return Math.round(Math.abs(value) * 100);
	}
	const text = String(value).trim();
	if (!text) return null;
	const cleaned = text.replace(/[()]/g, '').replace(/[^\d.,]/g, '');
	const cents = parseNumericAmount(cleaned);
	return cents === null ? null : Math.abs(cents);
}

export function mapCategory(value) {
	const text = String(value ?? '').trim();
	if (!text) return null;
	const normalized = normalizeHeader(text);
	for (const category of EXPENSE_CATEGORIES) {
		if (
			normalized.includes(normalizeHeader(category.key))
			|| normalized.includes(normalizeHeader(category.label))
			|| category.keywords.some((keyword) => normalized.includes(normalizeHeader(keyword)))
		) {
			return category.key;
		}
	}
	return detectCategory(text);
}

export function matchMethod(value, methods = []) {
	const normalized = normalizeHeader(value);
	if (!normalized) return null;
	for (const method of methods) {
		const label = normalizeHeader(method.label);
		if (label && (normalized.includes(label) || label.includes(normalized))) return method.id;
		if (method.last4 && normalized.includes(String(method.last4))) return method.id;
	}
	return null;
}

const GENERIC_METHOD_TEXT = /^(cash|card|credit|debit|account|wallet|bank|other|no method|none|n\/a|-)$/i;

// The account column can name a bank or wallet that is not saved yet. Keep a
// clean label so the import can offer to create it instead of silently using
// the default account.
export function missingMethodLabel(value, matchedId = null) {
	if (matchedId !== null && matchedId !== undefined) return null;
	const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
	if (!text || GENERIC_METHOD_TEXT.test(text)) return null;
	if (!/[a-z]/i.test(text)) return null;
	return text;
}

// Finds the other account named in a transfer description. It ignores generic
// words such as "bank" or "debit" so "BPI Debit" is not matched by every bank
// row, and it can skip the statement's own account.
export function matchTransferMethod(value, methods = [], excludeId = null) {
	const normalized = normalizeHeader(value);
	if (!normalized) return null;
	let bestId = null;
	let bestScore = 0;
	for (const method of methods) {
		if (excludeId !== null && String(method.id) === String(excludeId)) continue;
		const label = normalizeHeader(method.label);
		if (!label) continue;
		let score = 0;
		if (normalized.includes(label)) {
			score = label.length + 10;
		} else {
			for (const token of String(method.label || '')
				.toLowerCase()
				.split(/[^a-z0-9]+/)
				.filter((part) => part.length >= 3 && !GENERIC_METHOD_TOKENS.has(part))) {
				if (normalized.includes(token)) score += token.length;
			}
		}
		if (method.last4 && normalized.includes(String(method.last4))) score += 4;
		if (score > bestScore) {
			bestScore = score;
			bestId = method.id;
		}
	}
	return bestId;
}

export function transferDirection(text) {
	const value = String(text ?? '');
	if (TRANSFER_IN_TEXT.test(value) && !TRANSFER_OUT_TEXT.test(value)) return 'in';
	return 'out';
}

export function duplicateKey(row, paymentMethodId = null, transferMethodId = null) {
	const otherAccount = row?.type === 'transfer'
		? transferMethodId ?? row.transferMethodId ?? row.toPaymentMethodId ?? ''
		: '';
	return [
		row.date,
		row.type === 'income' ? 'income' : row.type === 'transfer' ? 'transfer' : 'expense',
		row.amountCents,
		normalizeMerchant(row.merchant),
		paymentMethodId ?? '',
		otherAccount ?? '',
	].join('|');
}

export function finalizeRows(rows, existing = []) {
	const keys = new Set(
		(Array.isArray(existing) ? existing : [])
			.filter((row) => row && ['expense', 'income', 'transfer'].includes(row.type))
			.map((row) =>
				duplicateKey(
					{ date: row.date, type: row.type, amountCents: row.amountCents, merchant: row.merchant },
					row.paymentMethodId ?? null,
					row.toPaymentMethodId ?? null
				)
			)
	);
	let duplicates = 0;
	const finalized = (Array.isArray(rows) ? rows : []).map((row) => {
		const key = duplicateKey(row, row.paymentMethodId ?? null, row.transferMethodId ?? null);
		if (keys.has(key)) {
			duplicates += 1;
			return { ...row, duplicate: true };
		}
		keys.add(key);
		return { ...row, duplicate: false };
	});
	return { rows: finalized, duplicates };
}

export function rowsToTransactions(rows, options = {}) {
	const {
		today = new Date().toISOString().slice(0, 10),
		methods = [],
		defaultMethodId = null,
		existing = [],
		headerIndex = detectHeaderRow(rows),
		mapping: providedMapping = null,
		sourceLabel = 'import',
	} = options;
	const mapping = providedMapping || (headerIndex >= 0 ? buildMapping(rows[headerIndex]) : {
		date: -1,
		description: -1,
		amount: -1,
		debit: -1,
		credit: -1,
		category: -1,
		method: -1,
		notes: -1,
		type: -1,
	});
	const inferred = inferColumns(headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows);
	if (mapping.date < 0) mapping.date = inferred.date;
	if (mapping.description < 0) mapping.description = inferred.description;
	if (mapping.amount < 0 && mapping.debit < 0 && mapping.credit < 0) mapping.amount = inferred.amount;

	const dataRows = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows;
	if (mapping.type < 0 && mapping.category >= 0) {
		const headerText = normalizeHeader(rows[headerIndex]?.[mapping.category]);
		const values = dataRows
			.slice(0, 20)
			.map((row) => String(cell(row, mapping.category) || '').trim())
			.filter(Boolean);
		const typeLike = values.filter((value) => /^(debit|credit|withdraw|deposit|moneyin|moneyout|income|expense|salary|refund|transfer|in|out)$/i.test(value)).length;
		const headerLooksType = /^(type|transactiontype|drcr|debitcredit|direction)$/.test(headerText);
		if (headerLooksType || (values.length > 0 && typeLike >= Math.ceil(values.length * 0.6))) {
			mapping.type = mapping.category;
			mapping.category = -1;
		}
	}
	const existingKeys = new Set(
		(Array.isArray(existing) ? existing : [])
			.filter((row) => row && ['expense', 'income', 'transfer'].includes(row.type))
			.map((row) =>
				duplicateKey(
					{ date: row.date, type: row.type, amountCents: row.amountCents, merchant: row.merchant },
					row.paymentMethodId ?? null,
					row.toPaymentMethodId ?? null
				)
			)
	);
	const seen = new Set();
	const transactions = [];
	let invalid = 0;
	let duplicates = 0;
	let expenseCount = 0;
	let incomeCount = 0;
	let expenseCents = 0;
	let incomeCents = 0;
	let transferCount = 0;
	let transferCents = 0;
	let transfersMissingAccount = 0;

	for (const row of dataRows) {
		if (!Array.isArray(row) || row.every((value) => String(value ?? '').trim() === '')) continue;
		const date = parseAnyDate(cell(row, mapping.date), today)
			|| inferDateFromRow(row, today);
		if (!date) {
			invalid += 1;
			continue;
		}
		const typeText = String(cell(row, mapping.type) || '');
		const categoryText = String(cell(row, mapping.category) || '').trim();
		const descriptionCell = String(cell(row, mapping.description) || '').trim();
		let type = classifyType(typeText, categoryText, descriptionCell);
		let direction = transferDirection(`${typeText} ${categoryText} ${descriptionCell}`);

		let amountCents = null;
		const debitText = mapping.debit >= 0 ? String(cell(row, mapping.debit) || '').trim() : '';
		const creditText = mapping.credit >= 0 ? String(cell(row, mapping.credit) || '').trim() : '';
		const debitCents = debitText ? parseMoney(debitText) : null;
		const creditCents = creditText ? parseMoney(creditText) : null;
		if (debitCents) {
			amountCents = debitCents;
			direction = 'out';
			if (type !== 'transfer') type = 'expense';
		} else if (creditCents) {
			amountCents = creditCents;
			direction = 'in';
			if (type !== 'transfer') type = 'income';
		} else if (debitText || creditText) {
			invalid += 1;
			continue;
		} else {
			const amountHeader = mapping.amount >= 0 ? String(rows[headerIndex]?.[mapping.amount] ?? '') : '';
			const centsColumn = /cents/i.test(normalizeHeader(amountHeader));
			const rawAmount = cell(row, mapping.amount);
			amountCents = centsColumn && typeof rawAmount === 'number'
				? Math.round(Math.abs(rawAmount))
				: parseMoney(rawAmount);
			if (!type) type = 'expense';
		}
		type = type === 'income' ? 'income' : type === 'transfer' ? 'transfer' : 'expense';
		if (!amountCents) {
			invalid += 1;
			continue;
		}

		const description = descriptionCell || row
			.filter((value, index) => index !== mapping.date && index !== mapping.amount && index !== mapping.debit && index !== mapping.credit)
			.map((value) => String(value ?? '').trim())
			.filter(Boolean)
			.join(' ')
			.slice(0, 60) || (type === 'income' ? 'Imported income' : type === 'transfer' ? 'Account transfer' : 'Imported expense');
		const notes = String(cell(row, mapping.notes) || '').trim().slice(0, 500);
		const category = type === 'income'
			? INCOME_CATEGORY
			: type === 'transfer'
				? 'other'
				: mapCategory(categoryText) || detectCategory(`${description} ${notes}`) || 'other';
		const methodText = String(cell(row, mapping.method) ?? '').trim();
		const matchedMethodId = matchMethod(methodText, methods);
		const missingMethod = missingMethodLabel(methodText, matchedMethodId);
		const paymentMethodId = matchedMethodId ?? (methodText ? null : defaultMethodId ?? null);
		const transferMethodId = type === 'transfer'
			? matchTransferMethod(
					`${description} ${notes} ${methodText}`,
					methods,
					paymentMethodId
				)
			: null;
		if (type === 'transfer' && transferMethodId === null) transfersMissingAccount += 1;
		const transaction = {
			type,
			date,
			merchant: description.slice(0, 60),
			amountCents,
			category,
			notes,
			paymentMethodId,
			transferMethodId,
			direction: type === 'transfer' ? direction : null,
			methodLabel:
				methods.find((method) => method.id === paymentMethodId)?.label ||
				missingMethod ||
				(methodText ? '' : methods.find((method) => method.id === defaultMethodId)?.label || ''),
			missingMethod,
			source: sourceLabel,
		};
		if (type === 'income') {
			incomeCount += 1;
			incomeCents += amountCents;
		} else if (type === 'transfer') {
			transferCount += 1;
			transferCents += amountCents;
		} else {
			expenseCount += 1;
			expenseCents += amountCents;
		}
		const key = duplicateKey(transaction, paymentMethodId, transferMethodId);
		if (existingKeys.has(key) || seen.has(key)) {
			transaction.duplicate = true;
			duplicates += 1;
		}
		seen.add(key);
		transactions.push(transaction);
	}

	return {
		rows: transactions,
		stats: {
			total: dataRows.length,
			valid: transactions.filter((row) => !row.duplicate).length,
			invalid,
			duplicates,
			expenseCount,
			incomeCount,
			expenseCents,
			incomeCents,
			transferCount,
			transferCents,
			transfersMissingAccount,
		},
	};
}

function inferDateFromRow(row, today) {
	for (const value of row) {
		const date = parseAnyDate(value, today);
		if (date) return date;
	}
	return null;
}

export function linesToTransactions(lines, options = {}) {
	const {
		today = new Date().toISOString().slice(0, 10),
		methods = [],
		defaultMethodId = null,
		existing = [],
		sourceLabel = 'PDF import',
	} = options;
	const existingKeys = new Set(
		(existing || [])
			.filter((row) => row && ['expense', 'income', 'transfer'].includes(row.type))
			.map((row) =>
				duplicateKey(
					{ date: row.date, type: row.type, amountCents: row.amountCents, merchant: row.merchant },
					row.paymentMethodId ?? null,
					row.toPaymentMethodId ?? null
				)
			)
	);
	const seen = new Set();
	const transactions = [];
	let invalid = 0;
	let duplicates = 0;
	let expenseCount = 0;
	let incomeCount = 0;
	let expenseCents = 0;
	let incomeCents = 0;
	let transferCount = 0;
	let transferCents = 0;
	let transfersMissingAccount = 0;

	const datePattern = /(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4})/i;
	const amountPattern = /([-−]?\s*(?:₱|php|p)?\s*\(?\d[\d,]*\.\d{2}\)?)\s*$/i;

	for (const rawLine of lines) {
		const line = String(rawLine || '').replace(/\s+/g, ' ').trim();
		if (!line || line.length < 8) continue;
		if (/^(date|description|amount|balance|total|subtotal|statement|page)\b/i.test(line)) continue;
		const dateMatch = line.match(datePattern);
		if (!dateMatch) {
			invalid += 1;
			continue;
		}
		const date = parseAnyDate(dateMatch[1], today);
		if (!date) {
			invalid += 1;
			continue;
		}
		const amountMatch = line.match(amountPattern);
		if (!amountMatch) {
			invalid += 1;
			continue;
		}
		const classified = classifyType('', '', line);
		const type = classified === 'income' ? 'income' : classified === 'transfer' ? 'transfer' : 'expense';
		const direction = transferDirection(line);
		const amountCents = parseMoney(amountMatch[1]);
		if (!amountCents) {
			invalid += 1;
			continue;
		}
		let rawDescription = line
			.replace(dateMatch[1], ' ')
			.replace(amountMatch[1], ' ')
			.replace(/\s{2,}/g, ' ')
			.replace(/^[\s|•·-]+|[\s|•·-]+$/g, '')
			.trim();
		if (!rawDescription) rawDescription = type === 'income' ? 'Imported PDF income' : 'Imported PDF expense';
		const methodText = methods.find((method) => matchMethod(rawDescription, [method]) === method.id)?.label || '';
		let description = rawDescription;
		if (methodText) {
			description = description.replace(new RegExp(`\\s+${escapeRegex(methodText)}$`, 'i'), '').trim();
		}
		description = description
			.replace(/\s+(expense|income|interest|goal transfer|transfer)\s*$/i, '')
			.trim();
		for (const category of EXPENSE_CATEGORIES) {
			description = description.replace(new RegExp(`\\s+${escapeRegex(category.label)}$`, 'i'), '').trim();
		}
		if (!description) description = rawDescription;
		const category = type === 'income'
			? INCOME_CATEGORY
			: type === 'transfer'
				? 'other'
				: detectCategory(rawDescription) || 'other';
		const paymentMethodId = matchMethod(methodText, methods) ?? defaultMethodId ?? null;
		const transferMethodId = type === 'transfer'
			? matchTransferMethod(rawDescription, methods, paymentMethodId)
			: null;
		if (type === 'transfer' && transferMethodId === null) transfersMissingAccount += 1;
		const transaction = {
			type,
			date,
			merchant: description.slice(0, 60),
			amountCents,
			category,
			notes: rawDescription.slice(0, 500),
			paymentMethodId,
			transferMethodId,
			direction: type === 'transfer' ? direction : null,
			methodLabel: methods.find((method) => method.id === paymentMethodId)?.label || '',
			source: sourceLabel,
		};
		if (type === 'income') {
			incomeCount += 1;
			incomeCents += amountCents;
		} else if (type === 'transfer') {
			transferCount += 1;
			transferCents += amountCents;
		} else {
			expenseCount += 1;
			expenseCents += amountCents;
		}
		const key = duplicateKey(transaction, paymentMethodId, transferMethodId);
		if (existingKeys.has(key) || seen.has(key)) {
			transaction.duplicate = true;
			duplicates += 1;
		}
		seen.add(key);
		transactions.push(transaction);
	}

	return {
		rows: transactions,
		stats: {
			total: lines.length,
			valid: transactions.filter((row) => !row.duplicate).length,
			invalid,
			duplicates,
			expenseCount,
			incomeCount,
			expenseCents,
			incomeCents,
			transferCount,
			transferCents,
			transfersMissingAccount,
		},
	};
}
