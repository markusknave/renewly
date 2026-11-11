// Export/import for the on-device database.
//
// Export builds a plain JSON document; import validates and normalizes it, then
// writes it through the store so the same rules apply as manual entry. Both
// directions are plain data so they can be tested without a browser.

import {
	MAX_DISPLAY_NAME,
	MAX_GROUP_NAME_LENGTH,
	MAX_METHOD_LABEL_LENGTH,
	saveSettings,
} from './store.js';

export const EXPORT_APP = 'renewly';
export const EXPORT_VERSION = 3;
export const SUPPORTED_IMPORT_VERSIONS = [1, 2, 3];

const PAYMENT_KINDS = ['card', 'ewallet', 'bank', 'cash', 'other'];
const SUBSCRIPTION_KINDS = ['recurring', 'one_time'];
const STATUSES = ['active', 'trial', 'paused', 'canceled'];
const CADENCES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'custom'];
const SOURCES = ['manual', 'catalog'];
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
	{ settings, groups, paymentMethods, subscriptions },
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
			createdAt: method.createdAt ?? null,
		}));

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

	return { settings, groups, paymentMethods, subscriptions };
}

export async function applyBackup(db, backup, now = new Date()) {
	await db.clear('subscriptions');
	await db.clear('paymentMethods');
	await db.clear('groups');
	await db.clear('settings');

	const stamp = now.toISOString();
	const methodIds = new Map();
	for (const method of backup.paymentMethods) {
		const key = await db.put('paymentMethods', {
			label: method.label,
			kind: method.kind,
			last4: method.last4,
			notes: method.notes,
			createdAt: method.createdAt || stamp,
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

	await saveSettings(db, backup.settings);

	return {
		imported,
		groups: backup.groups.length,
		paymentMethods: backup.paymentMethods.length,
	};
}
