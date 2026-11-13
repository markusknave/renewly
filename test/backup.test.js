import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
	applyBackup,
	buildExport,
	EXPORT_VERSION,
	normalizeBackup,
	parseBackup,
	serializeExport,
} from '../public/js/backup.js';
import { createMemoryBackend } from '../public/js/db.js';
import {
	getSettings,
	listGoals,
	listGroups,
	listPaymentMethods,
	listSubscriptions,
	listTransactions,
	saveExpense,
	saveGoal,
	saveGoalTransfer,
	saveGroup,
	savePaymentMethod,
	saveSettings,
	saveSubscription,
} from '../public/js/store.js';

function input(overrides = {}) {
	return {
		kind: 'recurring',
		merchantKey: 'netflix',
		merchantName: 'Netflix',
		planId: 'standard',
		planName: 'Standard',
		amountCents: 44900,
		cadence: 'monthly',
		status: 'active',
		nextRenewalDate: '2026-12-01',
		...overrides,
	};
}

test('export/import round-trips groups, methods, owners, and settings', async () => {
	const source = createMemoryBackend();
	const group = await saveGroup(source, { name: 'Family' });
	const method = await savePaymentMethod(source, { label: 'GCash', kind: 'ewallet' });
	const mine = await saveSubscription(source, input({ groupId: group.id, paymentMethodId: method.id }));
	const theirs = await saveSubscription(
		source,
		input({ trackedFor: 'Mom', groupId: group.id, paymentMethodId: method.id })
	);
	await saveSettings(source, { timezone: 'Asia/Tokyo', reminderDays: [5, 1] });

	const text = serializeExport(
		buildExport({
			settings: await getSettings(source),
			groups: await listGroups(source),
			paymentMethods: await listPaymentMethods(source),
			subscriptions: await listSubscriptions(source),
		})
	);
	assert.match(text, /"app": "renewly"/);
	assert.match(text, new RegExp(`"version": ${EXPORT_VERSION}`));

	const target = createMemoryBackend();
	const result = await applyBackup(target, normalizeBackup(parseBackup(text)));
	assert.deepEqual(result, {
		imported: 2,
		groups: 1,
		paymentMethods: 1,
		goals: 0,
		transactions: 0,
	});

	const [importedGroup] = await listGroups(target);
	assert.equal(importedGroup.name, 'Family');
	const [importedMethod] = await listPaymentMethods(target);
	assert.equal(importedMethod.label, 'GCash');

	const rows = await listSubscriptions(target);
	assert.equal(rows.length, 2);
	assert.equal(rows.find((row) => row.id === theirs.id).trackedFor, 'Mom');
	assert.equal(rows.find((row) => row.id === mine.id).trackedFor, null);
	for (const row of rows) {
		assert.equal(row.groupId, importedGroup.id);
		assert.equal(row.paymentMethodId, importedMethod.id);
	}
	assert.deepEqual(await getSettings(target), {
		currency: 'PHP',
		timezone: 'Asia/Tokyo',
		reminderDays: [1, 5],
		theme: 'ivory',
		font: 'poppins',
		customAccent: '#6d4aff',
		customBackground: '#f7f3ec',
	});
});

test('version 1 backups import without groups and clamp long names', async () => {
	const legacy = {
		app: 'renewly',
		version: 1,
		settings: { timezone: 'Asia/Manila', reminderDays: [7] },
		subscriptions: [
			{
				kind: 'recurring',
				merchantName: 'A very long legacy subscription name',
				amountCents: 19900,
				cadence: 'monthly',
				status: 'active',
			},
		],
	};
	const normalized = normalizeBackup(parseBackup(JSON.stringify(legacy)));
	assert.equal(normalized.subscriptions[0].merchantName.length, 25);
	assert.equal(normalized.groups.length, 0);

	const db = createMemoryBackend();
	await applyBackup(db, normalized);
	const [row] = await listSubscriptions(db);
	assert.equal(row.merchantName.length, 25);
	assert.equal(row.planName, '');
	assert.equal(row.groupId, null);
});

test('normalize clamps group names and rejects unknown enum values', () => {
	const normalized = normalizeBackup({
		app: 'renewly',
		version: 2,
		settings: { timezone: 'Mars/Olympus', reminderDays: [-2, 3, 3] },
		groups: [{ name: 'x'.repeat(60) }],
		paymentMethods: [{ label: 'y'.repeat(90), kind: 'crypto', last4: '12ab34' }],
		subscriptions: [
			{
				kind: 'bogus',
				merchantName: 'Thing',
				amountCents: -5,
				cadence: 'yearly',
				status: 'cancelled',
				paymentMethodId: 99,
			},
		],
	});
	assert.equal(normalized.settings.timezone, 'Asia/Manila');
	assert.deepEqual(normalized.settings.reminderDays, [3]);
	assert.equal(normalized.groups[0].name.length, 25);
	assert.equal(normalized.paymentMethods[0].kind, 'other');
	assert.equal(normalized.paymentMethods[0].last4, '1234');
	assert.equal(normalized.subscriptions[0].kind, 'recurring');
	assert.equal(normalized.subscriptions[0].amountCents, 0);
	assert.equal(normalized.subscriptions[0].cadence, 'monthly');
	assert.equal(normalized.subscriptions[0].status, 'active');
});

test('parseBackup rejects files that are not Renewly backups', () => {
	assert.throws(() => parseBackup(''), /empty/);
	assert.throws(() => parseBackup('{oops'), /valid JSON/);
	assert.throws(() => parseBackup(JSON.stringify({ app: 'other', subscriptions: [] })), /Not a Renewly/);
	assert.throws(
		() => parseBackup(JSON.stringify({ app: 'renewly', version: 99, subscriptions: [] })),
		/not supported/
	);
	assert.throws(() => parseBackup(JSON.stringify({ app: 'renewly', version: 3 })), /no subscriptions/);
});

test('export omits runtime-only fields and keeps the stored shape', async () => {
	const db = createMemoryBackend();
	await saveSubscription(db, input());
	const data = buildExport({
		settings: await getSettings(db),
		groups: [],
		paymentMethods: [],
		subscriptions: await listSubscriptions(db),
	});
	const [row] = data.subscriptions;
	assert.equal(row.currency, 'PHP');
	assert.equal(row.merchantName, 'Netflix');
	assert.equal(row.trackedFor, null);
	assert.ok(!('updatedAt' in row));
});

test('version 4 backups round-trip ledger entries, goals, and card interest settings', async () => {
	const source = createMemoryBackend();
	const method = await savePaymentMethod(source, {
		label: 'MariBank',
		kind: 'card',
		last4: '4821',
		openingBalanceCents: 5_000_000,
		openingDate: '2026-11-01',
		interestRateBps: 325,
		interestFrequency: 'daily',
		network: 'mastercard',
	});
	const goal = await saveGoal(source, {
		name: 'Japan trip',
		targetCents: 5_000_000,
		deadline: '2027-06-30',
		color: 'teal',
	});
	await saveExpense(source, {
		date: '2026-11-12',
		merchant: 'Jollibee',
		category: 'food',
		amountCents: 48_550,
		paymentMethodId: method.id,
	});
	await saveGoalTransfer(source, {
		goalId: goal.id,
		paymentMethodId: method.id,
		amountCents: 1_000_000,
		date: '2026-11-12',
		direction: 'to_goal',
	});

	const text = serializeExport(
		buildExport({
			settings: await getSettings(source),
			groups: [],
			paymentMethods: await listPaymentMethods(source),
			subscriptions: [],
			goals: await listGoals(source),
			transactions: await listTransactions(source),
		})
	);
	const parsed = JSON.parse(text);
	assert.equal(parsed.version, 5);
	assert.equal(parsed.paymentMethods[0].interestRateBps, 325);
	assert.equal(parsed.paymentMethods[0].instrument, 'debit');
	assert.equal(parsed.goals[0].name, 'Japan trip');
	assert.equal(parsed.transactions.length, 2);

	const target = createMemoryBackend();
	const result = await applyBackup(target, normalizeBackup(parseBackup(text)));
	assert.equal(result.transactions, 2);
	assert.equal(result.goals, 1);

	const [importedMethod] = await listPaymentMethods(target);
	assert.equal(importedMethod.interestRateBps, 325);
	assert.equal(importedMethod.interestFrequency, 'daily');
	assert.equal(importedMethod.openingBalanceCents, 5_000_000);
	assert.equal(importedMethod.instrument, 'debit');

	const [importedGoal] = await listGoals(target);
	assert.equal(importedGoal.color, 'teal');
	const transactions = await listTransactions(target);
	assert.equal(transactions.length, 2);
	assert.ok(transactions.every((row) => row.paymentMethodId === importedMethod.id));
	assert.equal(transactions.find((row) => row.type === 'goal_deposit').goalId, importedGoal.id);
});
