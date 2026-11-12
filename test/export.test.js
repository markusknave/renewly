import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
	buildReport,
	reportFileName,
	reportSummaryLine,
	toCsv,
	toPdf,
	toXlsx,
} from '../public/js/export.js';

const methods = [
	{ id: 1, label: 'BPI Debit' },
	{ id: 2, label: 'Maya' },
];
const goals = [{ id: 1, name: 'Japan trip' }];

function sample() {
	return buildReport({
		methods,
		goals,
		from: '2026-11-01',
		to: '2026-11-30',
		today: '2026-11-12',
		generatedAt: '2026-11-12T10:00:00.000Z',
		transactions: [
			{
				id: 1,
				type: 'expense',
				date: '2026-11-01',
				amountCents: 12_550,
				paymentMethodId: 1,
				category: 'food',
				merchant: 'Jollibee, SM',
				notes: 'Lunch (with friends)',
			},
			{
				id: 2,
				type: 'expense',
				date: '2026-11-02',
				amountCents: 89_900,
				paymentMethodId: 2,
				category: 'shopping',
				merchant: 'Uniqlo "Sale"',
				notes: 'Line one\nLine two',
			},
			{
				id: 3,
				type: 'interest',
				date: '2026-10-31',
				amountCents: 1_250,
				paymentMethodId: 2,
				category: 'interest',
				merchant: 'Interest earned',
				auto: true,
			},
			{
				id: 4,
				type: 'goal_deposit',
				date: '2026-11-03',
				amountCents: 50_000,
				paymentMethodId: 1,
				goalId: 1,
				category: 'other',
				merchant: 'To Japan trip',
			},
			{
				id: 5,
				type: 'expense',
				date: '2026-12-01',
				amountCents: 99_999,
				paymentMethodId: 1,
				category: 'food',
				merchant: 'Outside range',
			},
		],
	});
}

test('reports filter by date and total only expenses as spend', () => {
	const report = sample();
	assert.equal(report.rows.length, 3);
	assert.deepEqual(report.totals, {
		expenseCents: 102_450,
		incomeCents: 0,
		netCents: -102_450,
		count: 3,
	});
	assert.equal(report.rows[0].date, '2026-11-03');
	assert.equal(report.rows.find((row) => row.description === 'Transfer to Japan trip').category, 'Goal transfer');
	assert.ok(report.rows.every((row) => row.date >= '2026-11-01' && row.date <= '2026-11-30'));
	assert.equal(reportFileName('pdf', report), 'renewly-expenses-2026-11-01-to-2026-11-30.pdf');
	assert.match(reportSummaryLine(report), /3 entries/);
});

test('CSV escapes commas, quotes, and newlines and includes a BOM', () => {
	const csv = toCsv(sample());
	assert.ok(csv.startsWith('\uFEFFDate,Description,Category,Type,Payment method,Amount (PHP),Notes'));
	assert.match(csv, /"Jollibee, SM"/);
	assert.match(csv, /"Uniqlo ""Sale"""/);
	assert.match(csv, /"Line one\nLine two"/);
	assert.match(csv, /Total spend,1024\.50/);
	assert.match(csv, /Income and interest,0\.00/);
	assert.match(csv, /Net,-1024\.50/);
});

test('CSV neutralizes formula text but keeps amounts numeric', () => {
	const report = buildReport({
		methods: [{ id: 1, label: '=HYPERLINK("https://evil.example")' }],
		goals: [],
		from: '2026-11-01',
		to: '2026-11-30',
		today: '2026-11-12',
		transactions: [
			{
				id: 1,
				type: 'expense',
				date: '2026-11-01',
				amountCents: 12_550,
				paymentMethodId: 1,
				category: 'food',
				merchant: '=HYPERLINK("https://evil.example","Open")',
				notes: '@SUM(A1:A2)',
			},
		],
	});
	const csv = toCsv(report);
	assert.match(csv, /'=HYPERLINK\(""https:\/\/evil\.example""\)/);
	assert.match(csv, /'@SUM\(A1:A2\)/);
	assert.match(csv, /,-125\.50,/);
	assert.doesNotMatch(csv, /,'-125\.50'/);
});

test('reports keep income positive and net of expenses', () => {
	const report = buildReport({
		methods,
		goals,
		from: '2026-11-01',
		to: '2026-11-30',
		today: '2026-11-12',
		transactions: [
			{ id: 1, type: 'expense', date: '2026-11-01', amountCents: 10_000, paymentMethodId: 1, category: 'food', merchant: 'Lunch' },
			{ id: 2, type: 'income', date: '2026-11-02', amountCents: 50_000, paymentMethodId: 1, category: 'income', merchant: 'Salary' },
			{ id: 3, type: 'interest', date: '2026-11-03', amountCents: 500, paymentMethodId: 1, category: 'interest', merchant: 'Interest earned' },
		],
	});
	assert.equal(report.rows.find((row) => row.description === 'Salary').amountCents, 50_000);
	assert.equal(report.totals.expenseCents, 10_000);
	assert.equal(report.totals.incomeCents, 50_500);
	assert.equal(report.totals.netCents, 40_500);
	const csv = toCsv(report);
	assert.match(csv, /Salary,Income,Income,BPI Debit,500\.00/);
	assert.match(csv, /Net,405\.00/);
});

test('XLSX output is a zip package with workbook parts', async () => {
	const bytes = await toXlsx(sample(), new Date('2026-11-12T10:00:00Z'));
	assert.ok(bytes instanceof Uint8Array);
	assert.ok(bytes.length > 1_000);
	assert.equal(bytes[0], 0x50);
	assert.equal(bytes[1], 0x4b);
	const names = new TextDecoder('latin1').decode(bytes);
	for (const part of [
		'[Content_Types].xml',
		'_rels/.rels',
		'xl/workbook.xml',
		'xl/_rels/workbook.xml.rels',
		'xl/styles.xml',
		'xl/worksheets/sheet1.xml',
	]) {
		assert.ok(names.includes(part), `missing ${part}`);
	}
	// Two local file headers and two central-directory entries per part.
	assert.ok((names.match(/PK\x03\x04/g) || []).length >= 6);
});

test('PDF output is a valid single-page document with ASCII text', () => {
	const bytes = toPdf(sample(), new Date('2026-11-12T10:00:00Z'));
	assert.ok(bytes.every((byte) => byte < 128), 'PDF must stay ASCII for the base-14 fonts');
	const text = new TextDecoder('ascii').decode(bytes);
	assert.ok(text.startsWith('%PDF-1.4\n'));
	assert.ok(text.endsWith('%%EOF\n'));
	assert.match(text, /\/Type \/Catalog/);
	assert.match(text, /\/BaseFont \/Helvetica-Bold/);
	assert.match(text, /Renewly expense report/);
	assert.match(text, /2026-11-01 to 2026-11-30/);
	assert.match(text, /1,024\.50/);
	assert.match(text, /\/Count 1/);
});

test('PDF paginates long reports and repeats the table header', () => {
	const report = buildReport({
		methods,
		goals,
		from: '2026-11-01',
		to: '2026-11-30',
		today: '2026-11-12',
		transactions: Array.from({ length: 140 }, (_, index) => ({
			id: index + 1,
			type: 'expense',
			date: '2026-11-12',
			amountCents: 1_000 + index,
			paymentMethodId: 1,
			category: 'food',
			merchant: `Merchant ${index + 1}`,
		})),
	});
	const text = new TextDecoder('ascii').decode(toPdf(report, new Date('2026-11-12T10:00:00Z')));
	const pageCount = Number(text.match(/\/Count (\d+)/)[1]);
	assert.ok(pageCount >= 3);
	assert.ok((text.match(/Description/g) || []).length >= pageCount);
	assert.match(text, /Page 2 of \d+/);
});
