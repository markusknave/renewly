import { test } from 'vitest';
import assert from 'node:assert/strict';

import { inferPaymentKind, providersFor } from '../public/js/lib/providers.js';
import { cardThemeFor, instrumentFor } from '../public/js/lib/cardThemes.js';
import { normalizeBackup } from '../public/js/backup.js';

test('credit providers include Atome and other Philippine BNPL options', () => {
	const credit = providersFor('credit');
	for (const name of ['Atome', 'BillEase', 'Home Credit', 'Salmon', 'Tala', 'SPayLater', 'Maya Credit']) {
		assert.ok(credit.includes(name), `${name} should be offered for credit accounts`);
	}
	assert.ok(!credit.includes('GCash'));
	assert.ok(providersFor('bank').includes('BPI') === false);
	assert.ok(providersFor('bank').some((name) => name.includes('BPI')));
	assert.ok(providersFor('ewallet').includes('Maya'));
	assert.equal(instrumentFor('credit'), 'credit');
	assert.equal(cardThemeFor('Atome', 'credit').issuer, 'Atome');
});

test('inferPaymentKind classifies names found in imported statements', () => {
	assert.equal(inferPaymentKind('Atome'), 'credit');
	assert.equal(inferPaymentKind('BillEase Pay Later'), 'credit');
	assert.equal(inferPaymentKind('BPI Debit'), 'card');
	assert.equal(inferPaymentKind('Maya Bank'), 'bank');
	assert.equal(inferPaymentKind('GCash'), 'ewallet');
	assert.equal(inferPaymentKind('GCash GLoan'), 'credit');
	assert.equal(inferPaymentKind('Shopee SPayLater'), 'credit');
	assert.equal(inferPaymentKind('ShopeePay'), 'ewallet');
	assert.equal(inferPaymentKind('BPI Visa'), 'card');
	assert.equal(inferPaymentKind('Some Rural Bank'), 'bank');
	assert.equal(inferPaymentKind('Unknown Account'), 'other');
});

test('backups accept credit accounts', () => {
	const normalized = normalizeBackup({
		app: 'renewly',
		version: 5,
		paymentMethods: [{ id: 1, label: 'Atome', kind: 'credit', instrument: 'credit' }],
	});
	assert.equal(normalized.paymentMethods[0].kind, 'credit');
	assert.equal(normalized.paymentMethods[0].instrument, 'credit');
});
