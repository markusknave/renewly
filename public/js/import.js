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
import { detectCategory } from './lib/categories.js';

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
		.filter((transaction) => transaction && transaction.type === 'expense')
		.map((transaction) => {
			const methodText = methodNames.get(String(transaction.paymentMethodId ?? '')) || '';
			const paymentMethodId = matchMethod(methodText, options.methods) ?? options.defaultMethodId ?? null;
			return {
				date: transaction.date,
				merchant: String(transaction.merchant || 'Imported expense').slice(0, 60),
				amountCents: Number(transaction.amountCents) || 0,
				category: mapCategory(transaction.category) || detectCategory(transaction.merchant || '') || 'other',
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
		return {
			rows: finalized.rows,
			stats: {
				total: (data.transactions || []).length,
				valid: finalized.rows.filter((row) => !row.duplicate).length,
				invalid: Math.max(0, (data.transactions || []).length - rows.length),
				duplicates: finalized.duplicates,
				creditsSkipped: 0,
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
	const valid = rows.filter((row) => !row.duplicate);
	if (!valid.length) {
		return { count: 0, totalCents: 0, categories: [], from: null, to: null };
	}
	const dates = valid.map((row) => row.date).sort();
	const summary = summarizePeriod(
		valid.map((row) => ({ ...row, type: 'expense' })),
		{ from: dates[0], to: dates[dates.length - 1] }
	);
	return {
		count: valid.length,
		totalCents: summary.expenseCents,
		categories: summary.categories.slice(0, 4),
		from: dates[0],
		to: dates[dates.length - 1],
	};
}

function warningsFor(stats, extra = []) {
	const warnings = [...extra];
	if (stats.creditsSkipped) {
		warnings.push(`${stats.creditsSkipped} credit or deposit row${stats.creditsSkipped === 1 ? '' : 's'} skipped; this import adds expenses only.`);
	}
	if (stats.invalid) {
		warnings.push(`${stats.invalid} row${stats.invalid === 1 ? '' : 's'} could not be read as an expense and will be skipped.`);
	}
	if (stats.duplicates) {
		warnings.push(`${stats.duplicates} row${stats.duplicates === 1 ? '' : 's'} already exist and are excluded by default.`);
	}
	return warnings;
}

export async function parseImportFile(file, options = {}) {
	const name = String(file?.name || 'import');
	const extension = name.toLowerCase().split('.').pop() || '';
	const bytes = new Uint8Array(await file.arrayBuffer());
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
	const stats = result.stats || { total: rows.length, valid: rows.length, invalid: 0, duplicates: 0, creditsSkipped: 0 };
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
			.filter((row) => row && row.type === 'expense')
			.map((row) =>
				duplicateKey(
					{ date: row.date, amountCents: row.amountCents, merchant: row.merchant },
					row.paymentMethodId ?? null
				)
			)
	);
	let imported = 0;
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
				date: row.date,
				merchant: row.merchant,
				category: row.category,
				amountCents: row.amountCents,
				paymentMethodId,
				notes: row.notes || '',
			});
			keys.add(key);
			imported += 1;
		} catch {
			failed += 1;
		}
	}
	return { imported, skipped, failed };
}

export function recategorizeRows(rows) {
	return (rows || []).map((row) => ({
		...row,
		category: detectCategory(`${row.merchant} ${row.notes || ''}`) || row.category || 'other',
	}));
}

export function analyzeRows(rows) {
	return analyze(rows);
}
