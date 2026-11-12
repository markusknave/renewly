// Import orchestrator: detects the file type, extracts rows, maps them to
// expenses with the local analyst's category keywords, and commits them with
// duplicate protection.

import * as store from './store.js';
import { summarizePeriod } from './finance.js';
import { readCsv } from './importers/csv.js';
import { readXlsx } from './importers/xlsx.js';
import { extractPdfText } from './importers/pdf.js';
import { readMmbak } from './importers/sqlite.js';
import {
	duplicateKey,
	finalizeRows,
	linesToTransactions,
	mapCategory,
	matchMethod,
	rowsToTransactions,
} from './importers/table.js';
import { detectCategory, INCOME_CATEGORY } from './lib/categories.js';
import { MAX_IMPORT_BYTES } from './importers/limits.js';

export const IMPORT_ACCEPT = '.csv,.tsv,.txt,.pdf,.xlsx,.xls,.json,.mbak,.mmbak,.sqlite,.db';

function formatLabel(extension) {
	switch (extension) {
		case 'csv':
		case 'tsv':
		case 'txt':
			return 'CSV';
		case 'xlsx':
		case 'xls':
			return 'Excel';
		case 'pdf':
			return 'PDF';
		case 'json':
			return 'JSON';
		case 'mbak':
		case 'mmbak':
		case 'sqlite':
		case 'db':
			return 'Money Manager';
		default:
			return 'File';
	}
}

function textFrom(bytes) {
	return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function renewlyBackupRows(data, options) {
	const methodNames = new Map(
		(Array.isArray(data.paymentMethods) ? data.paymentMethods : []).map((method) => [
			String(method.id),
			String(method.label || ''),
		])
	);
	const rows = (Array.isArray(data.transactions) ? data.transactions : [])
		.filter((transaction) => transaction && (transaction.type === 'expense' || transaction.type === 'income'))
		.map((transaction) => {
			const type = transaction.type === 'income' ? 'income' : 'expense';
			const methodText = methodNames.get(String(transaction.paymentMethodId ?? '')) || '';
			const paymentMethodId = matchMethod(methodText, options.methods) ?? options.defaultMethodId ?? null;
			return {
				type,
				date: transaction.date,
				merchant: String(transaction.merchant || (type === 'income' ? 'Imported income' : 'Imported expense')).slice(0, 60),
				amountCents: Number(transaction.amountCents) || 0,
				category: type === 'income'
					? INCOME_CATEGORY
					: mapCategory(transaction.category) || detectCategory(transaction.merchant || '') || 'other',
				notes: String(transaction.notes || '').slice(0, 500),
				paymentMethodId,
				methodLabel: options.methods.find((method) => method.id === paymentMethodId)?.label || '',
				source: 'Renewly JSON import',
			};
		})
		.filter((row) => row.date && row.amountCents > 0);
	return rows;
}

function objectsToRows(objects, options) {
	const keys = [];
	const seen = new Set();
	for (const object of objects) {
		for (const key of Object.keys(object || {})) {
			if (!seen.has(key)) {
				seen.add(key);
				keys.push(key);
			}
		}
	}
	const rows = [keys, ...objects.map((object) => keys.map((key) => object?.[key] ?? ''))];
	return rowsToTransactions(rows, options);
}

function readJson(text, options) {
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error('That file is not valid JSON.');
	}
	if (data && data.app === 'renewly') {
		const rows = renewlyBackupRows(data, options);
		const finalized = finalizeRows(rows, options.existing);
		const valid = finalized.rows.filter((row) => !row.duplicate);
		const transactions = Array.isArray(data.transactions) ? data.transactions : [];
		const skippedKnown = transactions.filter((transaction) =>
			transaction && ['interest', 'goal_deposit', 'goal_withdrawal'].includes(transaction.type)
		).length;
		return {
			rows: finalized.rows,
			stats: {
				total: transactions.length,
				valid: valid.length,
				invalid: Math.max(0, transactions.length - rows.length - skippedKnown),
				duplicates: finalized.duplicates,
				expenseCount: valid.filter((row) => row.type === 'expense').length,
				incomeCount: valid.filter((row) => row.type === 'income').length,
				expenseCents: valid.filter((row) => row.type === 'expense').reduce((sum, row) => sum + row.amountCents, 0),
				incomeCents: valid.filter((row) => row.type === 'income').reduce((sum, row) => sum + row.amountCents, 0),
			},
			warnings: [],
		};
	}
	if (Array.isArray(data)) {
		if (data.every((item) => Array.isArray(item))) return rowsToTransactions(data, options);
		if (data.every((item) => item && typeof item === 'object')) return objectsToRows(data, options);
		throw new Error('The JSON array does not contain expense objects or rows.');
	}
	for (const key of ['transactions', 'expenses', 'items', 'data', 'rows']) {
		if (Array.isArray(data?.[key])) {
			const list = data[key];
			if (list.every((item) => Array.isArray(item))) return rowsToTransactions(list, options);
			return objectsToRows(list.filter((item) => item && typeof item === 'object'), options);
		}
	}
	throw new Error('No transactions array was found in the JSON file.');
}

function analyze(rows) {
	const valid = rows
		.filter((row) => !row.duplicate)
		.map((row) => ({ ...row, type: row.type === 'income' ? 'income' : 'expense' }));
	if (!valid.length) {
		return {
			count: 0,
			expenseCount: 0,
			incomeCount: 0,
			expenseCents: 0,
			incomeCents: 0,
			netCents: 0,
			categories: [],
			from: null,
			to: null,
		};
	}
	const dates = valid.map((row) => row.date).sort();
	const summary = summarizePeriod(valid, { from: dates[0], to: dates[dates.length - 1] });
	return {
		count: valid.length,
		expenseCount: summary.count,
		incomeCount: valid.filter((row) => row.type === 'income').length,
		expenseCents: summary.expenseCents,
		incomeCents: summary.incomeCents,
		netCents: summary.netCents,
		categories: summary.categories.slice(0, 4),
		from: dates[0],
		to: dates[dates.length - 1],
	};
}

function warningsFor(stats, extra = []) {
	const warnings = [...extra];
	if (stats.invalid) {
		warnings.push(`${stats.invalid} row${stats.invalid === 1 ? '' : 's'} could not be read as a transaction and will be skipped.`);
	}
	if (stats.duplicates) {
		warnings.push(`${stats.duplicates} row${stats.duplicates === 1 ? '' : 's'} already exist and are excluded by default.`);
	}
	return warnings;
}

export async function parseImportFile(file, options = {}) {
	const name = String(file?.name || 'import');
	const extension = name.toLowerCase().split('.').pop() || '';
	if (Number(file?.size) > MAX_IMPORT_BYTES) {
		throw new Error(`Files larger than ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB are not imported.`);
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	if (bytes.byteLength > MAX_IMPORT_BYTES) {
		throw new Error(`Files larger than ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB are not imported.`);
	}
	const common = {
		today: options.today,
		methods: options.methods || [],
		defaultMethodId: options.defaultMethodId ?? null,
		existing: options.existing || [],
	};
	let result;
	let warnings = [];

	if (['csv', 'tsv', 'txt'].includes(extension) || /csv|tab-separated/i.test(file.type || '')) {
		result = rowsToTransactions(readCsv(bytes), { ...common, sourceLabel: 'CSV import' });
	} else if (extension === 'xlsx' || extension === 'xls' || /spreadsheet/i.test(file.type || '')) {
		if (extension === 'xls' && bytes[0] === 0xd0 && bytes[1] === 0xcf) {
			throw new Error('Legacy .xls files are not supported. Save the sheet as .xlsx or CSV and import that.');
		}
		result = rowsToTransactions(await readXlsx(bytes), { ...common, sourceLabel: 'Excel import' });
	} else if (extension === 'pdf' || file.type === 'application/pdf') {
		const lines = await extractPdfText(bytes);
		result = linesToTransactions(lines, { ...common, sourceLabel: 'PDF import' });
		warnings.push('PDF import reads selectable text. Scanned image statements need OCR first.');
	} else if (extension === 'json' || file.type === 'application/json') {
		result = readJson(textFrom(bytes), common);
	} else if (['mbak', 'mmbak', 'sqlite', 'db'].includes(extension)) {
		result = await readMmbak(bytes, common);
		warnings = result.warnings || [];
	} else {
		const text = textFrom(bytes).trim();
		if (text.startsWith('{') || text.startsWith('[')) {
			result = readJson(text, common);
		} else {
			result = rowsToTransactions(readCsv(bytes), { ...common, sourceLabel: 'CSV import' });
		}
	}

	const rows = result.rows || [];
	const stats = result.stats || {
		total: rows.length,
		valid: rows.length,
		invalid: 0,
		duplicates: 0,
		expenseCount: rows.filter((row) => row.type === 'expense').length,
		incomeCount: rows.filter((row) => row.type === 'income').length,
		expenseCents: rows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + row.amountCents, 0),
		incomeCents: rows.filter((row) => row.type === 'income').reduce((sum, row) => sum + row.amountCents, 0),
	};
	return {
		fileName: name,
		format: formatLabel(extension),
		rows,
		stats,
		warnings: warningsFor(stats, warnings),
		analysis: analyze(rows),
	};
}

export async function importRows(db, rows, options = {}) {
	const { defaultMethodId = null, existing = [] } = options;
	const keys = new Set(
		(existing || [])
			.filter((row) => row && (row.type === 'expense' || row.type === 'income'))
			.map((row) =>
				duplicateKey(
					{ date: row.date, type: row.type, amountCents: row.amountCents, merchant: row.merchant },
					row.paymentMethodId ?? null
				)
			)
	);
	let imported = 0;
	let importedExpense = 0;
	let importedIncome = 0;
	let skipped = 0;
	let failed = 0;
	for (const row of rows || []) {
		if (row.duplicate) {
			skipped += 1;
			continue;
		}
		const paymentMethodId = row.paymentMethodId ?? defaultMethodId ?? null;
		const key = duplicateKey(row, paymentMethodId);
		if (keys.has(key)) {
			skipped += 1;
			continue;
		}
		try {
			await store.saveExpense(db, {
				type: row.type,
				date: row.date,
				merchant: row.merchant,
				category: row.category,
				amountCents: row.amountCents,
				paymentMethodId,
				notes: row.notes || '',
			});
			keys.add(key);
			imported += 1;
			if (row.type === 'income') importedIncome += 1;
			else importedExpense += 1;
		} catch {
			failed += 1;
		}
	}
	return { imported, importedExpense, importedIncome, skipped, failed };
}

export function recategorizeRows(rows) {
	return (rows || []).map((row) => {
		const type = row.type === 'income' ? 'income' : 'expense';
		return {
			...row,
			type,
			category: type === 'income'
				? INCOME_CATEGORY
				: detectCategory(`${row.merchant} ${row.notes || ''}`) || row.category || 'other',
		};
	});
}

export function analyzeRows(rows) {
	return analyze(rows);
}
