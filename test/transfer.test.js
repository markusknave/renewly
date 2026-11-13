import { test } from 'vitest';
import assert from 'node:assert/strict';

import { createMemoryBackend } from '../public/js/db.js';
import {
	deletePaymentMethod,
	listPaymentMethods,
	listTransactions,
	saveExpense,
	savePaymentMethod,
	validateExpenseInput,
} from '../public/js/store.js';
import {
	buildInterestPlan,
	methodBalance,
	methodSignedCents,
	summarizePeriod,
	transactionSignedCents,
} from '../public/js/finance.js';
import { rowsToTransactions } from '../public/js/importers/table.js';
import { importRows } from '../public/js/import.js';
import { applyBackup, buildExport, normalizeBackup, parseBackup, serializeExport } from '../public/js/backup.js';
import { buildReport, toCsv } from '../public/js/export.js';

async function accounts() {
	const db = createMemoryBackend();
	const bpi = await savePaymentMethod(db, {
		label: 'BPI Debit',
		kind: 'bank',
		openingBalanceCents: 1_000_000,
		openingDate: '2026-11-01',
	});
	const maya = await savePaymentMethod(db, {
		label: 'Maya',
		kind: 'ewallet',
		openingBalanceCents: 0,
		openingDate: '2026-11-01',
	});
	return { db, bpi, maya };
}

test('a transfer debits the source, credits the destination, and leaves the total unchanged', async () => {
	const { db, bpi, maya } = await accounts();
	const transfer = await saveExpense(db, {
		type: 'transfer',
		date: '2026-11-02',
		merchant: 'Move to Maya',
		amountCents: 250_000,
		paymentMethodId: bpi.id,
		toPaymentMethodId: maya.id,
	});
	assert.equal(transfer.type, 'transfer');
	assert.equal(transfer.category, 'other');
	assert.equal(transfer.toPaymentMethodId, maya.id);

	const rows = await listTransactions(db);
	assert.equal(methodBalance(bpi, rows, '2026-11-02'), 750_000);
	assert.equal(methodBalance(maya, rows, '2026-11-02'), 250_000);
	assert.equal(methodBalance(bpi, rows, '2026-11-02') + methodBalance(maya, rows, '2026-11-02'), 1_000_000);
	assert.equal(transactionSignedCents(rows[0]), 0);
	assert.equal(methodSignedCents(rows[0], bpi.id), -250_000);
	assert.equal(methodSignedCents(rows[0], maya.id), 250_000);

	const summary = summarizePeriod(rows, { from: '2026-11-01', to: '2026-11-30' });
	assert.equal(summary.expenseCents, 0);
	assert.equal(summary.incomeCents, 0);
	assert.equal(summary.netCents, 0);
	assert.equal(summary.transferCount, 1);
	assert.equal(summary.transferCents, 250_000);
});

test('incoming transfers increase the interest base of the receiving account', async () => {
	const { db, bpi, maya } = await accounts();
	const saving = await savePaymentMethod(db, {
		...maya,
		interestRateBps: 300,
		interestFrequency: 'daily',
	});
	const without = buildInterestPlan(saving, [], '2026-11-05').pendingCents;
	await saveExpense(db, {
		type: 'transfer',
		date: '2026-11-02',
		amountCents: 500_000,
		paymentMethodId: bpi.id,
		toPaymentMethodId: maya.id,
	});
	const withTransfer = buildInterestPlan(saving, await listTransactions(db), '2026-11-05').pendingCents;
	assert.ok(withTransfer > without);
});

test('transfers validate both accounts and the available source balance', async () => {
	const { db, bpi, maya } = await accounts();
	const missing = validateExpenseInput({
		type: 'transfer',
		date: '2026-11-02',
		amountCents: 10_000,
		paymentMethodId: bpi.id,
	});
	assert.ok(missing.errors.toPaymentMethodId);

	const same = validateExpenseInput({
		type: 'transfer',
		date: '2026-11-02',
		amountCents: 10_000,
		paymentMethodId: bpi.id,
		toPaymentMethodId: bpi.id,
	});
	assert.match(same.errors.toPaymentMethodId, /different/);

	await assert.rejects(
		() =>
			saveExpense(db, {
				type: 'transfer',
				date: '2026-11-02',
				amountCents: 10_000,
				paymentMethodId: bpi.id,
				toPaymentMethodId: 999,
			}),
		/Destination account not found/
	);
	await assert.rejects(
		() =>
			saveExpense(db, {
				type: 'transfer',
				date: '2026-11-02',
				amountCents: 1_500_000,
				paymentMethodId: bpi.id,
				toPaymentMethodId: maya.id,
			}),
		/more than the available balance/
	);

	const created = await saveExpense(db, {
		type: 'transfer',
		date: '2026-11-02',
		amountCents: 100_000,
		paymentMethodId: bpi.id,
		toPaymentMethodId: maya.id,
	});
	const edited = await saveExpense(db, {
		...created,
		amountCents: 50_000,
	});
	assert.equal(edited.id, created.id);
	assert.equal(methodBalance(bpi, await listTransactions(db), '2026-11-02'), 950_000);
});

test('deleting an account removes the transfers that involve it', async () => {
	const { db, bpi, maya } = await accounts();
	await saveExpense(db, {
		type: 'transfer',
		date: '2026-11-02',
		amountCents: 200_000,
		paymentMethodId: bpi.id,
		toPaymentMethodId: maya.id,
	});
	assert.equal((await listTransactions(db)).length, 1);
	assert.equal(await deletePaymentMethod(db, maya.id), true);
	assert.equal((await listTransactions(db)).length, 0);
	assert.equal((await listPaymentMethods(db)).length, 1);
	assert.equal(methodBalance(bpi, [], '2026-11-02'), 1_000_000);
});

test('statement import recognizes transfers in both directions', () => {
	const methods = [
		{ id: 1, label: 'BPI Debit' },
		{ id: 2, label: 'Maya' },
	];
	const rows = [
		['Date', 'Description', 'Amount', 'Type', 'Account'],
		['2026-11-02', 'INSTAPAY TRANSFER TO MAYA', '2,500.00', 'Transfer', 'BPI Debit'],
		['2026-11-03', 'INSTAPAY TRANSFER FROM BPI DEBIT', '500.00', 'Transfer', 'Maya'],
		['2026-11-04', 'TRANSFER TO UNKNOWN BANK', '100.00', 'Transfer', 'BPI Debit'],
	];
	const result = rowsToTransactions(rows, { methods });
	assert.equal(result.rows.length, 3);
	assert.deepEqual(
		result.rows.map((row) => row.type),
		['transfer', 'transfer', 'transfer']
	);
	assert.equal(result.rows[0].paymentMethodId, 1);
	assert.equal(result.rows[0].transferMethodId, 2);
	assert.equal(result.rows[0].direction, 'out');
	assert.equal(result.rows[1].paymentMethodId, 2);
	assert.equal(result.rows[1].transferMethodId, 1);
	assert.equal(result.rows[1].direction, 'in');
	assert.equal(result.rows[2].transferMethodId, null);
	assert.equal(result.stats.transferCount, 3);
	assert.equal(result.stats.transferCents, 310_000);
	assert.equal(result.stats.transfersMissingAccount, 1);
});

test('importRows commits transfers and reports rows that still need an account', async () => {
	const { db, bpi, maya } = await accounts();
	const rows = [
		{
			type: 'transfer',
			date: '2026-11-02',
			merchant: 'Transfer to Maya',
			amountCents: 250_000,
			category: 'other',
			notes: '',
			paymentMethodId: bpi.id,
			transferMethodId: maya.id,
			direction: 'out',
		},
		{
			type: 'transfer',
			date: '2026-11-03',
			merchant: 'Transfer to unknown',
			amountCents: 100_000,
			category: 'other',
			notes: '',
			paymentMethodId: bpi.id,
			transferMethodId: null,
			direction: 'out',
		},
	];
	const result = await importRows(db, rows, { existing: [] });
	assert.deepEqual(result, {
		imported: 1,
		importedExpense: 0,
		importedIncome: 0,
		importedTransfer: 1,
		skipped: 0,
		failed: 0,
		needsAccount: 1,
	});
	const transactions = await listTransactions(db);
	assert.equal(transactions.length, 1);
	assert.equal(methodBalance(bpi, transactions, '2026-11-30'), 750_000);
	assert.equal(methodBalance(maya, transactions, '2026-11-30'), 250_000);
});

test('JSON backups preserve both sides of a transfer', async () => {
	const { db, bpi, maya } = await accounts();
	await saveExpense(db, {
		type: 'transfer',
		date: '2026-11-02',
		amountCents: 300_000,
		paymentMethodId: bpi.id,
		toPaymentMethodId: maya.id,
		notes: 'rent money',
	});
	const text = serializeExport(
		buildExport({
			settings: { currency: 'PHP', timezone: 'Asia/Manila', reminderDays: [7] },
			groups: [],
			paymentMethods: await listPaymentMethods(db),
			subscriptions: [],
			goals: [],
			transactions: await listTransactions(db),
		})
	);
	const parsed = JSON.parse(text);
	assert.equal(parsed.version, 5);
	assert.equal(parsed.transactions[0].toPaymentMethodId, maya.id);

	const target = createMemoryBackend();
	const result = await applyBackup(target, normalizeBackup(parseBackup(text)));
	assert.equal(result.transactions, 1);
	const [transfer] = await listTransactions(target);
	assert.equal(transfer.type, 'transfer');
	assert.notEqual(transfer.paymentMethodId, transfer.toPaymentMethodId);
	const methods = await listPaymentMethods(target);
	assert.equal(methodBalance(methods[0], [transfer], '2026-11-30'), 700_000);
	assert.equal(methodBalance(methods[1], [transfer], '2026-11-30'), 300_000);
});

test('one-sided transfers are dropped instead of creating money', async () => {
	const target = createMemoryBackend();
	const backup = normalizeBackup({
		app: 'renewly',
		version: 5,
		settings: { currency: 'PHP', timezone: 'Asia/Manila', reminderDays: [7] },
		paymentMethods: [{ id: 1, label: 'Only', kind: 'bank' }],
		transactions: [
			{
				id: 1,
				type: 'transfer',
				date: '2026-11-02',
				amountCents: 100_000,
				paymentMethodId: 1,
				toPaymentMethodId: 2,
			},
		],
	});
	const result = await applyBackup(target, backup);
	assert.equal(result.transactions, 0);
	assert.equal((await listTransactions(target)).length, 0);
});

test('reports show transfers with both accounts and exclude them from totals', async () => {
	const methods = [
		{ id: 1, label: 'BPI Debit' },
		{ id: 2, label: 'Maya' },
	];
	const report = buildReport({
		transactions: [
			{
				id: 1,
				type: 'transfer',
				date: '2026-11-02',
				amountCents: 250_000,
				paymentMethodId: 1,
				toPaymentMethodId: 2,
				merchant: 'Account transfer',
			},
			{ id: 2, type: 'expense', date: '2026-11-03', amountCents: 10_000, paymentMethodId: 1, category: 'food', merchant: 'Lunch' },
		],
		methods,
		goals: [],
		from: '2026-11-01',
		to: '2026-11-30',
		today: '2026-11-30',
	});
	const transfer = report.rows.find((row) => row.type === 'Transfer');
	assert.equal(transfer.type, 'Transfer');
	assert.equal(transfer.description, 'BPI Debit → Maya');
	assert.equal(transfer.method, 'BPI Debit → Maya');
	assert.equal(report.totals.expenseCents, 10_000);
	assert.equal(report.totals.incomeCents, 0);
	const csv = toCsv(report);
	assert.match(csv, /Transfer/);
	assert.match(csv, /BPI Debit → Maya/);
});
