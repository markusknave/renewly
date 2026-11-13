import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { parseImportFile, importRows, recategorizeRows, analyzeRows } from '../public/js/import.js';
import { parseCsv } from '../public/js/importers/csv.js';
import { readXlsx, readZip } from '../public/js/importers/xlsx.js';
import { extractPdfText } from '../public/js/importers/pdf.js';
import { readMmbak, readSqliteTables } from '../public/js/importers/sqlite.js';
import { MAX_IMPORT_BYTES } from '../public/js/importers/limits.js';
import { rowsToTransactions, linesToTransactions, parseAnyDate, parseMoney } from '../public/js/importers/table.js';
import { buildReport, toPdf, toXlsx } from '../public/js/export.js';
import { methodBalance } from '../public/js/finance.js';
import { createMemoryBackend } from '../public/js/db.js';
import { listTransactions, listPaymentMethods, savePaymentMethod } from '../public/js/store.js';

const methods = [
	{ id: 1, label: 'BPI Debit' },
	{ id: 2, label: 'Maya' },
];

function fileLike(name, bytes, type = '') {
	const buffer = bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(bytes);
	return {
		name,
		type,
		arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
	};
}

function sampleReport() {
	return buildReport({
		methods,
		goals: [],
		from: '2026-11-01',
		to: '2026-11-30',
		today: '2026-11-12',
		transactions: [
			{ id: 1, type: 'expense', date: '2026-11-01', amountCents: 12_550, paymentMethodId: 1, category: 'food', merchant: 'Jollibee' },
			{ id: 2, type: 'expense', date: '2026-11-02', amountCents: 89_900, paymentMethodId: 2, category: 'shopping', merchant: 'Uniqlo' },
		],
	});
}

test('CSV parser handles quotes, delimiters, and CRLF', () => {
	const rows = parseCsv('Date,Description,Amount\r\n2026-11-01,"Jollibee, SM",-125.50\r\n2026-11-02,Uniqlo,899.00\r\n');
	assert.deepEqual(rows[0], ['Date', 'Description', 'Amount']);
	assert.deepEqual(rows[1], ['2026-11-01', 'Jollibee, SM', '-125.50']);
	assert.deepEqual(rows[2], ['2026-11-02', 'Uniqlo', '899.00']);

	const semicolon = parseCsv('Date;Description;Amount\n2026-11-01;Lunch;125.00\n');
	assert.equal(semicolon[1][1], 'Lunch');
});

test('table mapping infers categories, methods, expenses, and income', () => {
	const rows = [
		['Date', 'Description', 'Amount', 'Category', 'Account'],
		['2026-11-01', 'Jollibee, SM', '-125.50', 'Food', 'BPI Debit'],
		['2026-11-02', 'Uniqlo', '899.00', 'Shopping', 'Maya'],
		['2026-11-03', 'Salary', '50000.00', 'Income', 'Maya'],
	];
	const result = rowsToTransactions(rows, { methods, defaultMethodId: 1 });
	assert.equal(result.stats.valid, 3);
	assert.equal(result.stats.expenseCount, 2);
	assert.equal(result.stats.incomeCount, 1);
	assert.equal(result.stats.expenseCents, 102_450);
	assert.equal(result.stats.incomeCents, 5_000_000);
	assert.equal(result.rows[0].category, 'food');
	assert.equal(result.rows[0].paymentMethodId, 1);
	assert.equal(result.rows[0].type, 'expense');
	assert.equal(result.rows[1].category, 'shopping');
	assert.equal(result.rows[1].paymentMethodId, 2);
	assert.equal(result.rows[2].type, 'income');
	assert.equal(result.rows[2].category, 'income');
	assert.equal(result.rows[2].amountCents, 5_000_000);
});

test('debit/credit columns become expenses and income', () => {
	const rows = [
		['Date', 'Description', 'Debit', 'Credit', 'Account'],
		['2026-11-01', 'Lunch', '125.00', '', 'BPI Debit'],
		['2026-11-02', 'Refund', '', '50.00', 'BPI Debit'],
		['2026-11-03', 'Salary', '0.00', '50000.00', 'BPI Debit'],
	];
	const result = rowsToTransactions(rows, { methods });
	assert.equal(result.rows.length, 3);
	assert.equal(result.rows[0].type, 'expense');
	assert.equal(result.rows[0].amountCents, 12_500);
	assert.equal(result.rows[1].type, 'income');
	assert.equal(result.rows[1].amountCents, 5_000);
	assert.equal(result.rows[2].type, 'income');
	assert.equal(result.rows[2].amountCents, 5_000_000);
	assert.equal(result.stats.expenseCount, 1);
	assert.equal(result.stats.incomeCount, 2);
});

test('explicit type columns map income and expenses', () => {
	const rows = [
		['Date', 'Description', 'Amount', 'Type'],
		['2026-11-01', 'Lunch', '125.00', 'Expense'],
		['2026-11-02', 'Salary', '50000.00', 'Income'],
	];
	const result = rowsToTransactions(rows, { methods, defaultMethodId: 1 });
	assert.equal(result.rows.length, 2);
	assert.equal(result.rows[0].type, 'expense');
	assert.equal(result.rows[0].amountCents, 12_500);
	assert.equal(result.rows[1].type, 'income');
	assert.equal(result.rows[1].amountCents, 5_000_000);
	assert.equal(result.stats.expenseCount, 1);
	assert.equal(result.stats.incomeCount, 1);

	const signed = rowsToTransactions([
		['Date', 'Description', 'Amount'],
		['2026-11-01', 'Lunch', '-125.00'],
		['2026-11-02', 'Salary', '50000.00'],
	], { methods });
	assert.equal(signed.rows[0].type, 'expense');
	assert.equal(signed.rows[1].type, 'income');
});

test('date and money parsing cover local, epoch, Excel, and currency formats', () => {
	assert.equal(parseAnyDate('2026-11-12'), '2026-11-12');
	assert.equal(parseAnyDate('11/12/2026'), '2026-11-12');
	assert.equal(parseAnyDate('Nov 12, 2026'), '2026-11-12');
	assert.equal(parseAnyDate(1_762_000_000), '2025-11-01');
	assert.equal(parseAnyDate(45_000), '2023-03-15');
	assert.equal(parseMoney('₱1,234.56'), 123_456);
	assert.equal(parseMoney('(1,234.56)'), 123_456);
	assert.equal(parseMoney(1234.56), 123_456);
});

test('XLSX writer output reads back as a table and maps to expenses', async () => {
	const bytes = await toXlsx(sampleReport());
	const table = await readXlsx(bytes);
	assert.equal(table[0][0], 'Date');
	const result = rowsToTransactions(table, { methods, defaultMethodId: 1 });
	assert.equal(result.stats.valid, 2);
	assert.deepEqual(result.rows.map((row) => row.amountCents), [89_900, 12_550]);
	assert.equal(result.rows[0].paymentMethodId, 2);
});

test('PDF writer output extracts text lines and maps to expenses', async () => {
	const bytes = toPdf(sampleReport());
	const lines = await extractPdfText(bytes);
	assert.ok(lines.some((line) => line.includes('Uniqlo')));
	const result = linesToTransactions(lines, { methods, defaultMethodId: 1 });
	assert.equal(result.stats.valid, 2);
	assert.deepEqual(result.rows.map((row) => row.amountCents), [89_900, 12_550]);
	assert.equal(result.rows[0].merchant, 'Uniqlo');
	assert.equal(result.rows[1].merchant, 'Jollibee');

	const income = linesToTransactions(['2026-11-03 Salary 50000.00'], { methods, defaultMethodId: 1 });
	assert.equal(income.rows.length, 1);
	assert.equal(income.rows[0].type, 'income');
	assert.equal(income.rows[0].amountCents, 5_000_000);
	assert.equal(income.rows[0].category, 'income');
});

test('MMBAK reads ZIP or plain SQLite Money Manager rows', async () => {
	const directory = mkdtempSync(join(tmpdir(), 'renewly-mmbak-'));
	const path = join(directory, 'backup.mmbak');
	const db = new DatabaseSync(path);
	db.exec(`
		CREATE TABLE ZINOUTCOME (uid INTEGER PRIMARY KEY, ZMONEY REAL, WDATE INTEGER, DO_TYPE INTEGER, ZCATEGORY INTEGER, ZASSET INTEGER, ZCONTENT TEXT, IS_DEL INTEGER);
		CREATE TABLE ZCATEGORY (uid INTEGER PRIMARY KEY, ZNAME TEXT);
		CREATE TABLE ZASSETS (uid INTEGER PRIMARY KEY, NIC_NAME TEXT);
		INSERT INTO ZCATEGORY (uid, ZNAME) VALUES (10, 'Food & Drinks'), (11, 'Shopping');
		INSERT INTO ZASSETS (uid, NIC_NAME) VALUES (20, 'BPI Debit'), (21, 'Maya');
		INSERT INTO ZINOUTCOME (ZMONEY, WDATE, DO_TYPE, ZCATEGORY, ZASSET, ZCONTENT, IS_DEL) VALUES
			(125.50, 1761955200, 1, 10, 20, 'Jollibee lunch', 0),
			(899.00, 1762041600, 1, 11, 21, 'Uniqlo shirt', 0),
			(50000.00, 1762128000, 0, 11, 21, 'Salary', 0),
			(999.00, 1762214400, 1, 10, 20, 'Deleted', 1);
	`);
	db.close();
	try {
		const bytes = readFileSync(path);
		const result = await readMmbak(bytes, { methods, defaultMethodId: 1 });
		assert.equal(result.rows.length, 3);
		assert.equal(result.stats.expenseCount, 2);
		assert.equal(result.stats.incomeCount, 1);
		assert.equal(result.stats.incomeCents, 5_000_000);
		assert.equal(result.rows[0].category, 'food');
		assert.equal(result.rows[0].paymentMethodId, 1);
		assert.equal(result.rows[0].type, 'expense');
		assert.equal(result.rows[1].paymentMethodId, 2);
		assert.equal(result.rows[1].merchant, 'Uniqlo shirt');
		assert.equal(result.rows[2].type, 'income');
		assert.equal(result.rows[2].merchant, 'Salary');
		assert.equal(result.rows[2].category, 'income');
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test('JSON import handles Renewly backups and generic arrays', async () => {
	const backup = {
		app: 'renewly',
		version: 4,
		transactions: [
			{ type: 'expense', date: '2026-11-01', amountCents: 12_550, merchant: 'Jollibee', category: 'food', paymentMethodId: 1, notes: '' },
			{ type: 'income', date: '2026-11-02', amountCents: 50_000, merchant: 'Salary', paymentMethodId: 1, notes: '' },
			{ type: 'interest', date: '2026-11-02', amountCents: 100, merchant: 'Interest', paymentMethodId: 1 },
		],
		paymentMethods: [{ id: 1, label: 'BPI Debit' }],
	};
	const preview = await parseImportFile(fileLike('backup.json', JSON.stringify(backup), 'application/json'), { methods, defaultMethodId: 1 });
	assert.equal(preview.format, 'JSON');
	assert.equal(preview.rows.length, 2);
	assert.equal(preview.rows[0].amountCents, 12_550);
	assert.equal(preview.rows[0].type, 'expense');
	assert.equal(preview.rows[1].type, 'income');
	assert.equal(preview.rows[1].category, 'income');
	assert.equal(preview.stats.incomeCents, 50_000);

	const generic = await parseImportFile(
		fileLike('expenses.json', JSON.stringify([{ date: '2026-11-03', description: 'Grab ride', amount: 250, account: 'Maya' }]), 'application/json'),
		{ methods, defaultMethodId: 1 }
	);
	assert.equal(generic.rows.length, 1);
	assert.equal(generic.rows[0].category, 'transport');
	assert.equal(generic.rows[0].paymentMethodId, 2);
});

test('parseImportFile detects CSV, XLSX, and PDF files', async () => {
	const csv = await parseImportFile(
		fileLike('statement.csv', 'Date,Description,Amount,Account\n2026-11-01,Jollibee,125.50,BPI Debit\n', 'text/csv'),
		{ methods, defaultMethodId: 1 }
	);
	assert.equal(csv.format, 'CSV');
	assert.equal(csv.rows.length, 1);

	const xlsx = await parseImportFile(fileLike('statement.xlsx', await toXlsx(sampleReport())), { methods, defaultMethodId: 1 });
	assert.equal(xlsx.format, 'Excel');
	assert.equal(xlsx.rows.length, 2);

	const pdf = await parseImportFile(fileLike('statement.pdf', toPdf(sampleReport()), 'application/pdf'), { methods, defaultMethodId: 1 });
	assert.equal(pdf.format, 'PDF');
	assert.equal(pdf.rows.length, 2);
});

test('importRows commits expenses and income and skips duplicates', async () => {
	const db = createMemoryBackend();
	const account = await savePaymentMethod(db, { label: 'BPI Debit', kind: 'card', openingBalanceCents: 100_000, openingDate: '2026-11-01' });
	const rows = [
		{ type: 'expense', date: '2026-11-01', merchant: 'Jollibee', amountCents: 12_550, category: 'food', notes: '', paymentMethodId: account.id },
		{ type: 'expense', date: '2026-11-01', merchant: 'Jollibee', amountCents: 12_550, category: 'food', notes: '', paymentMethodId: account.id },
		{ type: 'income', date: '2026-11-02', merchant: 'Salary', amountCents: 50_000, category: 'income', notes: '', paymentMethodId: account.id },
	];
	const first = await importRows(db, rows, { existing: [] });
	assert.deepEqual(first, {
		imported: 2,
		importedExpense: 1,
		importedIncome: 1,
		importedTransfer: 0,
		skipped: 1,
		failed: 0,
		needsAccount: 0,
		createdMethods: [],
	});
	const second = await importRows(db, rows, { existing: await listTransactions(db) });
	assert.deepEqual(second, {
		imported: 0,
		importedExpense: 0,
		importedIncome: 0,
		importedTransfer: 0,
		skipped: 3,
		failed: 0,
		needsAccount: 0,
		createdMethods: [],
	});
	const transactions = await listTransactions(db);
	assert.equal(transactions.length, 2);
	assert.equal(transactions.find((row) => row.type === 'expense').amountCents, 12_550);
	assert.equal(transactions.find((row) => row.type === 'income').amountCents, 50_000);
	assert.equal(transactions.find((row) => row.type === 'income').category, 'income');
	assert.equal(methodBalance(account, transactions, '2026-11-30'), 137_450);
});

test('imports create missing cards and wallets from the account column', async () => {
	const db = createMemoryBackend();
	const bpi = await savePaymentMethod(db, {
		label: 'BPI Debit',
		kind: 'card',
		openingBalanceCents: 100_000,
		openingDate: '2026-11-01',
	});
	const csv = [
		'Date,Description,Amount,Type,Account',
		'2026-11-02,Atome order,1200.00,Expense,Atome',
		'2026-11-03,Lunch,150.00,Expense,BPI Debit',
	].join('\n');
	const preview = await parseImportFile(
		fileLike('statement.csv', csv, 'text/csv'),
		{ methods: [bpi], defaultMethodId: bpi.id, today: '2026-11-13' }
	);
	assert.deepEqual(preview.missingMethods, [{ label: 'Atome', kind: 'credit' }]);
	const atomeRow = preview.rows.find((row) => row.merchant === 'Atome order');
	assert.equal(atomeRow.paymentMethodId, null);
	assert.equal(atomeRow.missingMethod, 'Atome');

	const result = await importRows(db, preview.rows, {
		defaultMethodId: bpi.id,
		existing: [],
		createMissingMethods: true,
		today: '2026-11-13',
	});
	assert.equal(result.createdMethods.length, 1);
	assert.equal(result.createdMethods[0].label, 'Atome');
	assert.equal(result.createdMethods[0].kind, 'credit');
	const methods = await listPaymentMethods(db);
	const atome = methods.find((method) => method.label === 'Atome');
	assert.equal(atome.kind, 'credit');
	assert.equal(atome.instrument, 'credit');
	assert.equal(atome.openingBalanceCents, 0);
	const transactions = await listTransactions(db);
	assert.equal(transactions.length, 2);
	assert.equal(methodBalance(atome, transactions, '2026-11-30'), -120_000);
	assert.equal(methodBalance(bpi, transactions, '2026-11-30'), 85_000);
});

test('missing accounts fall back to the default when creation is off', async () => {
	const db = createMemoryBackend();
	const bpi = await savePaymentMethod(db, { label: 'BPI Debit', kind: 'card', openingBalanceCents: 100_000 });
	const rows = [
		{
			type: 'expense',
			date: '2026-11-02',
			merchant: 'Atome order',
			amountCents: 120_000,
			category: 'shopping',
			notes: '',
			paymentMethodId: null,
			missingMethod: 'Atome',
		},
	];
	const result = await importRows(db, rows, {
		defaultMethodId: bpi.id,
		existing: [],
		createMissingMethods: false,
	});
	assert.deepEqual(result.createdMethods, []);
	assert.equal((await listPaymentMethods(db)).length, 1);
	const [transaction] = await listTransactions(db);
	assert.equal(transaction.paymentMethodId, bpi.id);
});

test('analyst helpers recategorize and summarize imported rows', () => {
	const rows = [
		{ type: 'expense', date: '2026-11-01', merchant: 'Grab ride', amountCents: 25_000, category: 'other', notes: '', paymentMethodId: 1 },
		{ type: 'expense', date: '2026-11-02', merchant: 'Meralco bill', amountCents: 150_000, category: 'other', notes: '', paymentMethodId: 1 },
	];
	const recategorized = recategorizeRows(rows);
	assert.equal(recategorized[0].category, 'transport');
	assert.equal(recategorized[1].category, 'bills');
	const analysis = analyzeRows(recategorized);
	assert.equal(analysis.count, 2);
	assert.equal(analysis.expenseCents, 175_000);
	assert.equal(analysis.categories[0].key, 'bills');
});

function varintBytes(value) {
	const bytes = [];
	do {
		bytes.unshift(value & 0x7f);
		value = Math.floor(value / 128);
	} while (value > 0);
	for (let index = 0; index < bytes.length - 1; index += 1) bytes[index] |= 0x80;
	return bytes;
}

function sqliteFixture(payloadLength, headerByte = 1, overflowPage = 0) {
	const pageSize = 4096;
	const bytes = new Uint8Array(pageSize * 5);
	bytes.set(new TextEncoder().encode('SQLite format 3\0'), 0);
	bytes[16] = 0x10;
	bytes[17] = 0x00;
	bytes[18] = 1;
	bytes[19] = 1;
	bytes[20] = 0;
	bytes[56] = 0;
	bytes[57] = 0;
	bytes[58] = 0;
	bytes[59] = 1;
	bytes[100] = 0x0d;
	bytes[103] = 0;
	bytes[104] = 1;
	bytes[108] = 0;
	bytes[109] = 200;
	let offset = 200;
	const lengthBytes = varintBytes(payloadLength);
	bytes.set(lengthBytes, offset);
	offset += lengthBytes.length;
	bytes[offset] = 1;
	offset += 1;
	bytes[offset] = headerByte;
	const usable = pageSize;
	const maxLocal = usable - 35;
	const minLocal = Math.max(0, Math.floor(((usable - 12) * 32) / 255) - 23);
	let local = payloadLength;
	if (payloadLength > maxLocal) {
		local = minLocal + ((payloadLength - minLocal) % (usable - 4));
		if (local > maxLocal) local = minLocal;
	}
	if (overflowPage) {
		const pointer = offset + local;
		bytes[pointer] = (overflowPage >>> 24) & 255;
		bytes[pointer + 1] = (overflowPage >>> 16) & 255;
		bytes[pointer + 2] = (overflowPage >>> 8) & 255;
		bytes[pointer + 3] = overflowPage & 255;
		bytes[pageSize] = (overflowPage >>> 24) & 255;
		bytes[pageSize + 1] = (overflowPage >>> 16) & 255;
		bytes[pageSize + 2] = (overflowPage >>> 8) & 255;
		bytes[pageSize + 3] = overflowPage & 255;
	}
	return bytes;
}

test('SQLite parser rejects invalid page sizes and short record headers', () => {
	const invalidPage = sqliteFixture(10);
	invalidPage[16] = 0;
	invalidPage[17] = 100;
	assert.throws(() => readSqliteTables(invalidPage), /invalid page size/);

	const shortHeader = sqliteFixture(10, 0x7f);
	assert.equal(readSqliteTables(shortHeader).size, 0);
});

test('SQLite parser stops cyclic overflow chains', () => {
	const cyclic = sqliteFixture(14_000, 1, 2);
	assert.throws(() => readSqliteTables(cyclic), /cyclic/);
});

test('ZIP and import size guards reject oversized input', async () => {
	const zip = new Uint8Array(22);
	zip.set([0x50, 0x4b, 0x05, 0x06], 0);
	zip[10] = 0xff;
	zip[11] = 0xff;
	await assert.rejects(readZip(zip), /more than/);

	const oversized = {
		name: 'statement.csv',
		size: MAX_IMPORT_BYTES + 1,
		arrayBuffer: async () => new ArrayBuffer(0),
	};
	await assert.rejects(parseImportFile(oversized), /larger than 25 MB/);
});

test('PDF parser caps the number of content streams', async () => {
	const raw = 'stream\nendstream\n'.repeat(300);
	await assert.rejects(extractPdfText(new TextEncoder().encode(raw)), /too many content streams/);
});
