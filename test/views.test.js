import test from 'node:test';
import assert from 'node:assert/strict';

import { providersFor } from '../public/js/lib/providers.js';
import { listTimezones, timezoneLabel, timezoneOffset, timezoneOptions } from '../public/js/lib/timezones.js';
import {
	dashboardView,
	formView,
	groupsView,
	settingsView,
	cardsView,
	providerOptions,
} from '../public/js/views.js';
import { summarize } from '../public/js/store.js';

const settings = { currency: 'PHP', timezone: 'Asia/Manila', reminderDays: [7, 3, 1] };
const today = '2026-11-12';

function subscription(overrides = {}) {
	return {
		id: 1,
		kind: 'recurring',
		merchantKey: 'netflix',
		merchantName: 'Netflix',
		planId: 'standard',
		planName: 'Standard',
		amountCents: 44900,
		currency: 'PHP',
		cadence: 'monthly',
		status: 'active',
		nextRenewalDate: '2026-12-01',
		groupId: 1,
		trackedFor: null,
		...overrides,
	};
}

test('Philippine provider lists follow the selected payment type', () => {
	const wallets = providersFor('ewallet');
	assert.ok(wallets.includes('GCash'));
	assert.ok(wallets.includes('Maya'));
	assert.ok(wallets.includes('GrabPay'));
	assert.ok(wallets.includes('ShopeePay'));
	assert.ok(!wallets.includes('BDO Unibank'));

	const cards = providersFor('card');
	assert.ok(cards.includes('BDO Unibank'));
	assert.ok(cards.includes('Metrobank'));
	assert.ok(!cards.includes('GCash'));

	const banks = providersFor('bank');
	assert.ok(banks.includes('Land Bank of the Philippines'));
	assert.ok(banks.includes('UnionBank of the Philippines'));

	assert.deepEqual(providersFor('cash'), ['Cash']);
	assert.deepEqual(providersFor('other'), ['Other']);
	assert.deepEqual(providersFor('unknown'), ['Other']);
});

test('provider select keeps a custom label selectable for older data', () => {
	const listed = providerOptions('ewallet', 'GCash');
	assert.match(listed, /<option value="GCash" selected>GCash<\/option>/);
	assert.match(listed, /value="__custom">Other \/ custom…/);

	const custom = providerOptions('card', 'BPI Visa');
	assert.match(custom, /<option value="__custom" selected>Other \/ custom…/);
});

test('timezone list covers Philippine, DST, and UTC zones', () => {
	const zones = listTimezones();
	assert.equal(zones[0], 'Asia/Manila');
	assert.ok(zones.includes('America/New_York'));
	assert.ok(zones.includes('Europe/London'));
	assert.ok(zones.includes('UTC'));
	assert.ok(zones.length > 100);

	// Offsets follow the instant, so DST is reflected.
	assert.equal(timezoneOffset('America/New_York', new Date('2026-07-01T12:00:00Z')), '-04:00');
	assert.equal(timezoneOffset('America/New_York', new Date('2026-01-15T12:00:00Z')), '-05:00');
	assert.equal(timezoneOffset('Asia/Manila', new Date('2026-07-01T12:00:00Z')), '+08:00');
	assert.match(timezoneLabel('Europe/London', new Date('2026-07-01T12:00:00Z')), /UTC\+01:00/);
});

test('timezone options include the saved alias and label offsets', () => {
	const options = timezoneOptions('Asia/Manila');
	assert.equal(options[0].value, 'Asia/Manila');
	assert.match(options[0].label, /^Asia\/Manila \(UTC\+08:00\)$/);

	const legacy = timezoneOptions('Asia/Calcutta');
	assert.ok(legacy.some((option) => option.value === 'Asia/Calcutta'));
});

test('dashboard keeps the Ungrouped chip while a group is selected', () => {
	const groups = [
		{ id: 1, name: 'Cars' },
		{ id: 2, name: 'Home' },
	];
	const all = [
		subscription({ id: 1, groupId: 1 }),
		subscription({ id: 2, merchantName: 'Shell', merchantKey: 'shell', planId: null, planName: '', groupId: null }),
	];
	const filtered = all.filter((row) => row.groupId === 1);
	const html = dashboardView({
		subscriptions: filtered,
		allSubscriptions: all,
		summary: summarize(filtered, { today, reminderDays: [7] }),
		methods: [],
		groups,
		groupFilter: '1',
		settings,
		today,
	});
	assert.match(html, /data-group-filter="none"/);
	assert.match(html, /data-group-filter="1" class="chip on"|class="chip on" type="button" data-group-filter="1"/);
});

test('subscription form caps names at 25 characters and asks who a duplicate is for', () => {
	const html = formView({
		sub: { merchantName: 'Netflix', trackedFor: '' },
		methods: [],
		groups: [],
		catalog: null,
		today,
	});
	assert.match(html, /name="merchantName" maxlength="25"/);
	assert.match(html, /name="trackedFor" maxlength="25"/);

	const duplicate = formView({
		sub: { merchantName: 'Netflix' },
		methods: [],
		groups: [],
		catalog: null,
		today,
		duplicate: { merchantName: 'Netflix', planName: 'Standard', trackedFor: null },
	});
	assert.match(duplicate, /is already in your tracker/);
	assert.match(duplicate, /name="trackedFor" maxlength="25"[^>]*required/);
});

test('group screen aligns the create field and button in one row', () => {
	const html = groupsView({
		groups: [{ id: 1, name: 'Cars' }],
		subscriptions: [],
		methods: [],
		today,
	});
	assert.match(html, /<form class="group-create" data-form="group">/);
	assert.match(html, /name="name" maxlength="25"/);
	assert.match(html, /group-methods-label">Paid with</);
	assert.match(html, /group-methods-empty">No subscriptions in this group yet\./);
});

test('settings puts the three data buttons in one row and uses a zone select', () => {
	const html = settingsView({
		settings,
		catalog: { generatedAt: '2026-11-12T00:00:00+08:00', platforms: [], region: 'PH' },
		stats: null,
		notifyPermission: 'default',
		subscriptionCount: 0,
	});
	const row = html.match(/<div class="data-actions">([\s\S]*?)<\/div>/);
	assert.ok(row, 'data-actions row is missing');
	assert.equal((row[1].match(/data-action="(export|import|clear-data)"/g) || []).length, 3);
	assert.match(html, /<select name="timezone">/);
	assert.match(html, /<option value="Asia\/Manila" selected>/);
	assert.match(html, /id="import-dialog"/);
	assert.match(html, /id="import-file"/);
});

test('payment method screen filters providers by type', () => {
	const html = cardsView({
		methods: [
			{ id: 1, label: 'GCash', kind: 'ewallet', last4: '', notes: '' },
			{ id: 2, label: 'BPI Visa', kind: 'card', last4: '4242', notes: '' },
		],
	});
	assert.match(html, /<select name="provider" data-method-provider>/);
	assert.match(html, /<option value="GCash" selected>GCash<\/option>/);
	assert.match(html, /<option value="__custom" selected>Other \/ custom…<\/option>/);
	assert.match(html, /data-custom-method-label/);
});
