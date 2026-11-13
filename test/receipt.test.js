import { test } from 'vitest';
import assert from 'node:assert/strict';

import { parseReceipt } from '../public/js/receipt.js';

const methods = [
	{ id: 1, label: 'BPI Debit' },
	{ id: 2, label: 'Maya' },
	{ id: 3, label: 'GCash' },
];

test('a restaurant receipt fills the merchant, date, total, and food category', () => {
	const parsed = parseReceipt(
		`JOLLIBEE SM MEGAMALL
TIN 000-123-456-000
VAT REG TIN 000-123-456-000
DATE: 11/12/2026  TIME: 12:41
CASHIER: ANNA
1 YUM BURGER 75.00
1 JOLLY SPAGHETTI 90.00
2 REGULAR DRINKS 110.00
SUBTOTAL 275.00
VAT 32.95
TOTAL 307.95
CASH 500.00
CHANGE 192.05`,
		{ today: '2026-11-13', methods }
	);
	assert.equal(parsed.type, 'expense');
	assert.equal(parsed.date, '2026-11-12');
	assert.equal(parsed.amountCents, 30_795);
	assert.equal(parsed.merchant, 'JOLLIBEE SM MEGAMALL');
	assert.equal(parsed.category, 'food');
	assert.deepEqual(parsed.warnings, []);
});

test('grand total wins over subtotal and cash tendered', () => {
	const parsed = parseReceipt(
		`HARDWARE STORE
Date: 2026-11-10
SUBTOTAL 1,200.00
DISCOUNT 100.00
TOTAL 1,100.00
CASH 2,000.00
CHANGE 900.00`,
		{ today: '2026-11-13' }
	);
	assert.equal(parsed.amountCents, 110_000);
	assert.notEqual(parsed.amountCents, 120_000);
});

test('a payslip becomes income using net pay, not gross pay or deductions', () => {
	const parsed = parseReceipt(
		`ACME PHILIPPINES INC
PAYSLIP FOR NOVEMBER 2026
PAY DATE: 11/15/2026
EMPLOYEE: JUAN DELA CRUZ
BASIC PAY 45,000.00
ALLOWANCES 5,000.00
GROSS PAY 50,000.00
SSS 1,125.00
PHILHEALTH 900.00
PAG-IBIG 200.00
WITHHOLDING TAX 4,000.00
TOTAL DEDUCTIONS 6,225.00
NET PAY 43,775.00`,
		{ today: '2026-11-15', methods }
	);
	assert.equal(parsed.type, 'income');
	assert.equal(parsed.date, '2026-11-15');
	assert.equal(parsed.amountCents, 4_377_500);
	assert.equal(parsed.category, 'income');
	assert.match(parsed.merchant, /ACME/i);
});

test('a bank transfer note matches the other saved account and its direction', () => {
	const sent = parseReceipt(
		`INSTAPAY TRANSFER
Transaction date: 2026-11-13 08:15
Sent to MAYA
Amount: PHP 1,500.00
Reference No. 123456789`,
		{ today: '2026-11-13', methods }
	);
	assert.equal(sent.type, 'transfer');
	assert.equal(sent.direction, 'out');
	assert.equal(sent.transferMethodId, 2);
	assert.equal(sent.amountCents, 150_000);
	assert.equal(sent.merchant, 'Transfer to Maya');

	const received = parseReceipt(
		`Fund transfer received
Date: Nov 12, 2026
From BPI Debit
Amount received: 2,000.00`,
		{ today: '2026-11-13', methods }
	);
	assert.equal(received.type, 'transfer');
	assert.equal(received.direction, 'in');
	assert.equal(received.transferMethodId, 1);
	assert.equal(received.merchant, 'Transfer from BPI Debit');
});

test('unreadable photos return what was found plus warnings', () => {
	const parsed = parseReceipt('BLURRED TEXT 123', { today: '2026-11-13', methods });
	assert.equal(parsed.type, 'expense');
	assert.equal(parsed.amountCents, null);
	assert.equal(parsed.date, '2026-11-13');
	assert.ok(parsed.warnings.some((warning) => /total/i.test(warning)));

	const empty = parseReceipt('', { today: '2026-11-13', methods });
	assert.equal(empty.amountCents, null);
	assert.equal(empty.merchant, 'Scanned expense');
});
