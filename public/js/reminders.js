import { addDays, CADENCE_LABELS, formatMoney, isValidIsoDate } from './lib/dates.js';

export const REMINDER_HOUR = 9;
const DEFAULT_LIMIT = 60;

function localToday() {
	const now = new Date();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${now.getFullYear()}-${month}-${day}`;
}

// Deterministic positive 32-bit id so a reschedule replaces the same reminder
// instead of stacking a duplicate.
export function reminderId(subscriptionId, daysBefore, date) {
	const input = `${subscriptionId}:${daysBefore}:${date}`;
	let hash = 2166136261;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) % 2147483000 + 1;
}

function reminderText(subscription, daysBefore) {
	const oneTime = subscription.kind === 'one_time';
	const verb = oneTime ? 'expires' : 'renews';
	const when = daysBefore === 0 ? 'today' : `in ${daysBefore} day${daysBefore === 1 ? '' : 's'}`;
	const title = `${subscription.merchantName} ${verb} ${when}`;

	const amount = formatMoney(subscription.amountCents, subscription.currency || 'PHP');
	const cadence = oneTime
		? 'one-time'
		: CADENCE_LABELS[subscription.cadence] ?? subscription.cadence ?? '';
	const plan = subscription.planName ? `${subscription.planName} · ` : '';
	const body = `${plan}${amount}${cadence ? ` · ${cadence}` : ''}`;
	return { title, body };
}

// One notification per subscription per configured reminder day, at 09:00
// device-local time. Past occurrences and inactive subscriptions are skipped.
export function reminderSchedule(subscriptions, options = {}) {
	const settings = options || {};
	const today = isValidIsoDate(settings.today) ? settings.today : localToday();
	const now = settings.now instanceof Date ? settings.now : new Date();
	const limit = Number.isInteger(settings.limit) && settings.limit > 0 ? settings.limit : DEFAULT_LIMIT;

	const rawDays = Array.isArray(settings.reminderDays) ? settings.reminderDays : [settings.reminderDays];
	const reminderDays = [...new Set(rawDays.filter((day) => Number.isInteger(day) && day >= 0))].sort(
		(a, b) => b - a
	);
	if (!reminderDays.length) return [];

	const entries = [];
	const usedIds = new Set();
	for (const subscription of Array.isArray(subscriptions) ? subscriptions : []) {
		if (!subscription) continue;
		if (subscription.status !== 'active' && subscription.status !== 'trial') continue;
		if (!isValidIsoDate(subscription.nextRenewalDate)) continue;

		for (const daysBefore of reminderDays) {
			const date = addDays(subscription.nextRenewalDate, -daysBefore);
			if (!date || date < today) continue;

			const at = new Date(`${date}T${String(REMINDER_HOUR).padStart(2, '0')}:00:00`);
			if (!Number.isFinite(at.getTime()) || at.getTime() <= now.getTime()) continue;

			let id = reminderId(subscription.id, daysBefore, date);
			while (usedIds.has(id)) id = (id % 2147483000) + 1;
			usedIds.add(id);

			const text = reminderText(subscription, daysBefore);
			entries.push({
				id,
				subscriptionId: subscription.id,
				daysBefore,
				date,
				at,
				title: text.title,
				body: text.body,
			});
		}
	}

	entries.sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id);
	return entries.slice(0, limit);
}
