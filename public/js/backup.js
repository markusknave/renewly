// Export/import for the on-device database.
//
// Export builds a plain JSON document; import validates and normalizes it, then
// writes it through the store so the same rules apply as manual entry. Both
// directions are plain data so they can be tested without a browser.

import {
	GOAL_COLORS,
	MAX_DISPLAY_NAME,
	MAX_EXPENSE_MERCHANT,
	MAX_GOAL_NAME,
	MAX_GROUP_NAME_LENGTH,
	MAX_METHOD_LABEL_LENGTH,
	MAX_TRANSACTION_NOTES,
	saveSettings,
} from './store.js';
import { CATEGORY_KEYS, INCOME_CATEGORY } from './lib/categories.js';
import { INSTRUMENTS } from './lib/cardThemes.js';
import { INTEREST_FREQUENCIES, TRANSACTION_TYPES } from './finance.js';

export const EXPORT_APP = 'renewly';
export const EXPORT_VERSION = 4;
export const SUPPORTED_IMPORT_VERSIONS = [1, 2, 3, 4];

const PAYMENT_KINDS = ['card', 'ewallet', 'bank', 'cash', 'other'];
const SUBSCRIPTION_KINDS = ['recurring', 'one_time'];
const STATUSES = ['active', 'trial', 'paused', 'canceled'];
const CADENCES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'custom'];
const SOURCES = ['manual', 'catalog'];
const NETWORKS = ['visa', 'mastercard', 'other'];
const DEFAULT_SETTINGS = { currency: 'PHP', timezone: 'Asia/Manila', reminderDays: [7, 3, 1] };

function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max) {
	return String(value ?? '')
		.trim()
		.slice(0, max);
}

function digits(value, max) {
	return String(value ?? '')
		.replace(/\D/g, '')
		.slice(0, max);
}

function isIsoDate(value) {
	if (typeof value !== 'string') return false;
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;
	const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
	return (
		date.getUTCFullYear() === Number(match[1]) &&
		date.getUTCMonth() === Number(match[2]) - 1 &&
		date.getUTCDate() === Number(match[3])
	);
}

function dateOrNull(value) {
	return isIsoDate(value) ? value : null;
}

function integerOr(value, fallback) {
	const number = typeof value === 'string' && value.trim() ? Number(value) : value;
	return Number.isInteger(number) ? number : fallback;
}

function slugify(value) {
	const slug = String(value ?? '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 120);
	return slug || 'merchant';
}

export function buildExport(
	{ settings, groups, paymentMethods, subscriptions, goals, transactions },
	now = new Date()
) {
	return {
		app: EXPORT_APP,
		version: EXPORT_VERSION,
		exportedAt: now.toISOString(),
		settings: {
			currency: 'PHP',
			timezone: settings?.timezone || DEFAULT_SETTINGS.timezone,
			reminderDays: Array.isArray(settings?.reminderDays)
				? settings.reminderDays
				: DEFAULT_SETTINGS.reminderDays,
		},
		groups: (groups || []).map((group) => ({
			id: group.id,
			name: group.name,
			createdAt: group.createdAt ?? null,
		})),
		paymentMethods: (paymentMethods || []).map((method) => ({
			id: method.id,
			label: method.label,
			kind: method.kind,
			last4: method.last4 ?? '',
			notes: method.notes ?? '',
			openingBalanceCents: integerOr(method.openingBalanceCents, 0),
			openingDate: method.openingDate ?? null,
			interestRateBps: integerOr(method.interestRateBps, 0),
			interestFrequency: INTEREST_FREQUENCIES.includes(method.interestFrequency)
				? method.interestFrequency
				: 'none',
			network: NETWORKS.includes(method.network) ? method.network : '',
			instrument: INSTRUMENTS.includes(method.instrument) ? method.instrument : '',
			createdAt: method.createdAt ?? null,
		})),
		goals: (goals || []).map((goal) => ({
			id: goal.id,
			name: goal.name,
			targetCents: integerOr(goal.targetCents, 0),
			deadline: goal.deadline ?? null,
			note: goal.note ?? '',
			color: GOAL_COLORS.includes(goal.color) ? goal.color : 'indigo',
			createdAt: goal.createdAt ?? null,
		})),
		transactions: (transactions || []).map((transaction) => ({
			id: transaction.id,
			type: transaction.type,
			date: transaction.date,
			amountCents: integerOr(transaction.amountCents, 0),
			paymentMethodId: transaction.paymentMethodId ?? null,
			goalId: transaction.goalId ?? null,
			category: transaction.category ?? 'other',
			merchant: transaction.merchant ?? '',
			notes: transaction.notes ?? '',
			auto: Boolean(transaction.auto),
			autoKey: transaction.autoKey ?? null,
			createdAt: transaction.createdAt ?? null,
		})),
		subscriptions: (subscriptions || []).map((subscription) => ({
			id: subscription.id,
			kind: subscription.kind,
			merchantKey: subscription.merchantKey,
			merchantName: subscription.merchantName,
			planId: subscription.planId ?? null,
			planName: subscription.planName ?? '',
			amountCents: subscription.amountCents,
			currency: 'PHP',
			cadence: subscription.cadence ?? null,
			customIntervalDays: subscription.customIntervalDays ?? null,
			status: subscription.status,
			nextRenewalDate: subscription.nextRenewalDate ?? null,
			startedOn: subscription.startedOn ?? null,
			lastChargeDate: subscription.lastChargeDate ?? null,
			notes: subscription.notes ?? '',
			paymentMethodId: subscription.paymentMethodId ?? null,
			groupId: subscription.groupId ?? null,
			trackedFor: subscription.trackedFor ?? null,
			source: subscription.source ?? 'manual',
		})),
	};
}

export function serializeExport(data) {
	return `${JSON.stringify(data, null, 2)}\n`;
}

export function parseBackup(source) {
	const raw = typeof source === 'string' ? source.trim() : '';
	if (!raw) throw new Error('The backup is empty.');
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error('That file is not valid JSON.');
	}
	if (!isPlainObject(parsed) || parsed.app !== EXPORT_APP) {
		throw new Error('Not a Renewly backup file.');
	}
	const version = Number(parsed.version ?? 1);
	if (!SUPPORTED_IMPORT_VERSIONS.includes(version)) {
		throw new Error(`Backup version ${parsed.version} is not supported by this app.`);
	}
	if (!Array.isArray(parsed.subscriptions)) {
		throw new Error('The backup has no subscriptions list.');
	}
	return parsed;
}

function validTimezone(zone) {
	if (typeof zone !== 'string' || !zone.trim()) return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: zone.trim() });
		return true;
	} catch {
		return false;
	}
}

// Rewrites every record into the current shape: old ids are dropped (the caller
// remaps references), names are clamped to the current UI limits, and unknown
// enum values fall back to safe defaults.
export function normalizeBackup(parsed) {
	const source = isPlainObject(parsed) ? parsed : {};

	const settingsSource = isPlainObject(source.settings) ? source.settings : {};
	const reminderDays = Array.isArray(settingsSource.reminderDays)
		? [...new Set(settingsSource.reminderDays.filter((day) => Number.isInteger(day) && day >= 0))].sort(
				(a, b) => a - b
			)
		: [...DEFAULT_SETTINGS.reminderDays];
	const timezone = text(settingsSource.timezone, 80);
	const settings = {
		currency: 'PHP',
		timezone: validTimezone(timezone) ? timezone : DEFAULT_SETTINGS.timezone,
		reminderDays: reminderDays.length ? reminderDays : [...DEFAULT_SETTINGS.reminderDays],
	};

	const groups = (Array.isArray(source.groups) ? source.groups : [])
		.filter(isPlainObject)
		.map((group) => ({
			oldId: group.id ?? null,
			name: text(group.name, MAX_GROUP_NAME_LENGTH) || 'Group',
			createdAt: group.createdAt ?? null,
		}));

	const paymentMethods = (Array.isArray(source.paymentMethods) ? source.paymentMethods : [])
		.filter(isPlainObject)
		.map((method) => ({
			oldId: method.id ?? null,
			label: text(method.label, MAX_METHOD_LABEL_LENGTH) || 'Method',
			kind: PAYMENT_KINDS.includes(method.kind) ? method.kind : 'other',
			last4: digits(method.last4, 4),
			notes: text(method.notes, 200),
			openingBalanceCents: Math.max(0, integerOr(method.openingBalanceCents, 0)),
			openingDate: dateOrNull(method.openingDate),
			interestRateBps: Math.min(10_000, Math.max(0, integerOr(method.interestRateBps, 0))),
			interestFrequency: INTEREST_FREQUENCIES.includes(method.interestFrequency)
				? method.interestFrequency
				: 'none',
			network: NETWORKS.includes(method.network) ? method.network : '',
			instrument: INSTRUMENTS.includes(method.instrument) ? method.instrument : '',
			createdAt: method.createdAt ?? null,
		}));

	const goals = (Array.isArray(source.goals) ? source.goals : [])
		.filter(isPlainObject)
		.map((goal) => ({
			oldId: goal.id ?? null,
			name: text(goal.name, MAX_GOAL_NAME) || 'Goal',
			targetCents: Math.max(0, integerOr(goal.targetCents, 0)),
			deadline: dateOrNull(goal.deadline),
			note: text(goal.note, 200),
			color: GOAL_COLORS.includes(goal.color) ? goal.color : 'indigo',
			createdAt: goal.createdAt ?? null,
		}))
		.filter((goal) => goal.targetCents > 0);

	const transactions = (Array.isArray(source.transactions) ? source.transactions : [])
		.filter(isPlainObject)
		.map((transaction) => {
			const type = TRANSACTION_TYPES.includes(transaction.type) ? transaction.type : null;
			const amount = integerOr(transaction.amountCents, 0);
			if (!type || amount <= 0 || !isIsoDate(transaction.date)) return null;
			const auto = Boolean(transaction.auto) && type === 'interest';
			return {
				oldId: transaction.id ?? null,
				type,
				date: transaction.date,
				amountCents: amount,
				oldPaymentMethodId: transaction.paymentMethodId ?? null,
				oldGoalId: transaction.goalId ?? null,
				category: type === 'income'
					? INCOME_CATEGORY
					: CATEGORY_KEYS.includes(transaction.category) ? transaction.category : 'other',
				merchant: text(transaction.merchant, MAX_EXPENSE_MERCHANT) || (type === 'interest' ? 'Interest earned' : 'Entry'),
				notes: text(transaction.notes, MAX_TRANSACTION_NOTES),
				auto,
				autoKey: auto ? text(transaction.autoKey, 80) || null : null,
				createdAt: transaction.createdAt ?? null,
			};
		})
		.filter(Boolean);

	const subscriptions = (Array.isArray(source.subscriptions) ? source.subscriptions : [])
		.filter(isPlainObject)
		.map((subscription) => {
			const kind = SUBSCRIPTION_KINDS.includes(subscription.kind) ? subscription.kind : 'recurring';
			const rawAmount = Number(subscription.amountCents);
			const cadence = kind === 'one_time'
				? null
				: CADENCES.includes(subscription.cadence)
					? subscription.cadence
					: 'monthly';
			const customDays = Number(subscription.customIntervalDays);
			const merchantName = text(subscription.merchantName, MAX_DISPLAY_NAME) || 'Unknown';
			return {
				kind,
				merchantKey: text(subscription.merchantKey, 120) || slugify(merchantName),
				merchantName,
				planId: subscription.planId ? String(subscription.planId).slice(0, 120) : null,
				planName: text(subscription.planName, 120),
				amountCents: Number.isInteger(rawAmount) && rawAmount >= 0 ? rawAmount : 0,
				currency: 'PHP',
				cadence,
				customIntervalDays:
					cadence === 'custom' && Number.isInteger(customDays) && customDays >= 1
						? customDays
						: null,
				status: STATUSES.includes(subscription.status) ? subscription.status : 'active',
				nextRenewalDate: dateOrNull(subscription.nextRenewalDate),
				startedOn: dateOrNull(subscription.startedOn),
				lastChargeDate: dateOrNull(subscription.lastChargeDate),
				notes: text(subscription.notes, 2000),
				paymentMethodId: subscription.paymentMethodId ?? null,
				groupId: subscription.groupId ?? null,
				trackedFor: text(subscription.trackedFor, MAX_DISPLAY_NAME) || null,
				source: SOURCES.includes(subscription.source) ? subscription.source : 'manual',
				createdAt: subscription.createdAt ?? null,
			};
		});

	return { settings, groups, paymentMethods, goals, subscriptions, transactions };
}

export async function applyBackup(db, backup, now = new Date()) {
	await db.clear('subscriptions');
	await db.clear('paymentMethods');
	await db.clear('groups');
	await db.clear('goals');
	await db.clear('transactions');
	await db.clear('settings');

	const stamp = now.toISOString();
	const methodIds = new Map();
	for (const method of backup.paymentMethods) {
		const key = await db.put('paymentMethods', {
			label: method.label,
			kind: method.kind,
			last4: method.last4,
			notes: method.notes,
			openingBalanceCents: method.openingBalanceCents,
			openingDate: method.openingDate,
			interestRateBps: method.interestRateBps,
			interestFrequency: method.interestFrequency,
			network: method.network,
			instrument: method.instrument,
			createdAt: method.createdAt || stamp,
			updatedAt: stamp,
		});
		if (method.oldId !== null && method.oldId !== undefined) methodIds.set(method.oldId, Number(key));
	}

	const groupIds = new Map();
	for (const group of backup.groups) {
		const key = await db.put('groups', {
			name: group.name,
			createdAt: group.createdAt || stamp,
			updatedAt: stamp,
		});
		if (group.oldId !== null && group.oldId !== undefined) groupIds.set(group.oldId, Number(key));
	}

	const goalIds = new Map();
	for (const goal of backup.goals) {
		const key = await db.put('goals', {
			name: goal.name,
			targetCents: goal.targetCents,
			deadline: goal.deadline,
			note: goal.note,
			color: goal.color,
			createdAt: goal.createdAt || stamp,
			updatedAt: stamp,
		});
		if (goal.oldId !== null && goal.oldId !== undefined) goalIds.set(goal.oldId, Number(key));
	}

	let imported = 0;
	for (const subscription of backup.subscriptions) {
		const record = {
			kind: subscription.kind,
			merchantKey: subscription.merchantKey,
			merchantName: subscription.merchantName,
			planId: subscription.planId,
			planName: subscription.planName,
			amountCents: subscription.amountCents,
			currency: 'PHP',
			cadence: subscription.cadence,
			customIntervalDays: subscription.customIntervalDays,
			status: subscription.status,
			nextRenewalDate: subscription.nextRenewalDate,
			startedOn: subscription.startedOn,
			lastChargeDate: subscription.lastChargeDate,
			notes: subscription.notes,
			paymentMethodId:
				subscription.paymentMethodId != null
					? methodIds.get(subscription.paymentMethodId) ?? null
					: null,
			groupId: subscription.groupId != null ? groupIds.get(subscription.groupId) ?? null : null,
			trackedFor: subscription.trackedFor,
			source: subscription.source,
			createdAt: subscription.createdAt || stamp,
			updatedAt: stamp,
		};
		await db.put('subscriptions', record);
		imported += 1;
	}

	let transactions = 0;
	for (const transaction of backup.transactions) {
		const paymentMethodId =
			transaction.oldPaymentMethodId != null
				? methodIds.get(transaction.oldPaymentMethodId) ?? null
				: null;
		const goalId =
			transaction.oldGoalId != null ? goalIds.get(transaction.oldGoalId) ?? null : null;
		// Goal transfers without their goal would create money out of nothing.
		if (transaction.type.startsWith('goal_') && goalId === null) continue;
		await db.put('transactions', {
			type: transaction.type,
			date: transaction.date,
			amountCents: transaction.amountCents,
			paymentMethodId,
			goalId,
			category: transaction.category,
			merchant: transaction.merchant,
			notes: transaction.notes,
			auto: transaction.auto,
			autoKey: transaction.autoKey,
			createdAt: transaction.createdAt || stamp,
			updatedAt: stamp,
		});
		transactions += 1;
	}

	await saveSettings(db, backup.settings);

	return {
		imported,
		groups: backup.groups.length,
		paymentMethods: backup.paymentMethods.length,
		goals: backup.goals.length,
		transactions,
	};
}
