import { reminderSchedule } from './reminders.js';

const CHANNEL_ID = 'renewly-reminders';
const CHANNEL_NAME = 'Renewal reminders';

function nativePlugin() {
	const capacitor = globalThis.Capacitor;
	if (!capacitor || typeof capacitor.isNativePlatform !== 'function' || !capacitor.isNativePlatform()) {
		return null;
	}
	return capacitor.Plugins?.LocalNotifications ?? null;
}

export function isNativeNotifications() {
	return Boolean(nativePlugin());
}

function normalizePermission(display) {
	if (display === 'granted') return 'granted';
	if (display === 'denied') return 'denied';
	return 'default';
}

export async function permissionState() {
	const plugin = nativePlugin();
	if (plugin) {
		try {
			const result = await plugin.checkPermissions();
			return normalizePermission(result?.display);
		} catch {
			return 'unsupported';
		}
	}
	if (typeof Notification === 'undefined') return 'unsupported';
	return Notification.permission;
}

export async function requestPermission() {
	const plugin = nativePlugin();
	if (plugin) {
		try {
			const result = await plugin.requestPermissions();
			return normalizePermission(result?.display);
		} catch {
			return 'denied';
		}
	}
	if (typeof Notification === 'undefined') return 'unsupported';
	return Notification.requestPermission();
}

async function ensureChannel(plugin) {
	try {
		await plugin.createChannel({
			id: CHANNEL_ID,
			name: CHANNEL_NAME,
			description: 'Reminders before a subscription renews or an offer expires.',
			importance: 4,
			visibility: 1,
			vibration: true,
			lights: true,
		});
	} catch {
		// The channel may already exist or the platform may not need one.
	}
}

async function cancelPending(plugin) {
	try {
		const pending = await plugin.getPending();
		const notifications = Array.isArray(pending?.notifications) ? pending.notifications : [];
		if (!notifications.length) return;
		await plugin.cancel({
			notifications: notifications.map((notification) => ({ id: notification.id })),
		});
	} catch {
		// Nothing pending or permission not granted yet.
	}
}

// Schedules every future reminder in one pass. Android's AlarmManager wakes the
// app process for these notifications, so they fire even when the app is closed.
export async function syncReminders({ subscriptions, reminderDays, today, request = false }) {
	const plugin = nativePlugin();
	if (!plugin) return { native: false, scheduled: 0, permission: 'unsupported' };

	let permission = await permissionState();
	if (permission === 'default' && request) permission = await requestPermission();
	if (permission !== 'granted') return { native: true, scheduled: 0, permission };

	await ensureChannel(plugin);
	await cancelPending(plugin);

	const entries = reminderSchedule(subscriptions, { reminderDays, today });
	if (!entries.length) return { native: true, scheduled: 0, permission };

	const notifications = entries.map((entry) => ({
		id: entry.id,
		title: entry.title,
		body: entry.body,
		channelId: CHANNEL_ID,
		schedule: {
			at: entry.at,
			allowWhileIdle: true,
		},
		extra: {
			subscriptionId: entry.subscriptionId,
			reminderDate: entry.date,
		},
	}));

	try {
		await plugin.schedule({ notifications });
		return { native: true, scheduled: notifications.length, permission };
	} catch {
		// Exact-alarm permission can be unavailable; retry without the exact flag
		// by scheduling with a looser at value the plugin can still deliver.
		try {
			await plugin.schedule({
				notifications: notifications.map((notification) => ({
					...notification,
					schedule: { at: notification.schedule.at },
				})),
			});
			return { native: true, scheduled: notifications.length, permission };
		} catch {
			return { native: true, scheduled: 0, permission: 'denied' };
		}
	}
}

export async function listenForNotificationTaps(handler) {
	const plugin = nativePlugin();
	if (!plugin) return;
	try {
		await plugin.addListener('localNotificationActionPerformed', (event) => {
			const subscriptionId = event?.notification?.extra?.subscriptionId;
			if (subscriptionId) handler(Number(subscriptionId));
		});
	} catch {
		// Tapping still opens the app even if this listener is unavailable.
	}
}
