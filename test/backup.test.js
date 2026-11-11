import test from 'node:test';
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
	listGroups,
	listPaymentMethods,
	listSubscriptions,
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
	assert.deepEqual(result, { imported: 2, groups: 1, paymentMethods: 1 });

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
