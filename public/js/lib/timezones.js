// Time-zone list for the settings dropdown. `Intl.supportedValuesOf('timeZone')`
// is the authoritative IANA list on modern engines (including zones that observe
// daylight saving); the curated fallback keeps older WebViews usable.

export const DEFAULT_TIMEZONE = 'Asia/Manila';

const FALLBACK_TIMEZONES = [
	'Africa/Abidjan',
	'Africa/Accra',
	'Africa/Algiers',
	'Africa/Cairo',
	'Africa/Casablanca',
	'Africa/Johannesburg',
	'Africa/Lagos',
	'Africa/Nairobi',
	'America/Anchorage',
	'America/Argentina/Buenos_Aires',
	'America/Bogota',
	'America/Chicago',
	'America/Denver',
	'America/Halifax',
	'America/Lima',
	'America/Los_Angeles',
	'America/Mexico_City',
	'America/New_York',
	'America/Phoenix',
	'America/Santiago',
	'America/Sao_Paulo',
	'America/St_Johns',
	'America/Toronto',
	'America/Vancouver',
	'Asia/Bangkok',
	'Asia/Dhaka',
	'Asia/Dubai',
	'Asia/Hong_Kong',
	'Asia/Jakarta',
	'Asia/Jerusalem',
	'Asia/Karachi',
	'Asia/Kathmandu',
	'Asia/Kolkata',
	'Asia/Kuala_Lumpur',
	'Asia/Manila',
	'Asia/Riyadh',
	'Asia/Seoul',
	'Asia/Shanghai',
	'Asia/Singapore',
	'Asia/Taipei',
	'Asia/Tokyo',
	'Asia/Yangon',
	'Australia/Adelaide',
	'Australia/Brisbane',
	'Australia/Darwin',
	'Australia/Hobart',
	'Australia/Melbourne',
	'Australia/Perth',
	'Australia/Sydney',
	'Europe/Amsterdam',
	'Europe/Athens',
	'Europe/Berlin',
	'Europe/Brussels',
	'Europe/Bucharest',
	'Europe/Budapest',
	'Europe/Dublin',
	'Europe/Helsinki',
	'Europe/Istanbul',
	'Europe/Lisbon',
	'Europe/London',
	'Europe/Madrid',
	'Europe/Moscow',
	'Europe/Oslo',
	'Europe/Paris',
	'Europe/Prague',
	'Europe/Rome',
	'Europe/Stockholm',
	'Europe/Vienna',
	'Europe/Warsaw',
	'Europe/Zurich',
	'Pacific/Auckland',
	'Pacific/Fiji',
	'Pacific/Guam',
	'Pacific/Honolulu',
	'Pacific/Port_Moresby',
	'UTC',
];

function supportedTimezones() {
	try {
		if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
			const zones = Intl.supportedValuesOf('timeZone');
			if (Array.isArray(zones) && zones.length) return zones;
		}
	} catch {
		// Older engines throw or return undefined; fall back to the curated list.
	}
	return [];
}

function isValidTimezone(zone) {
	if (typeof zone !== 'string' || !zone.trim()) return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}

function pad2(value) {
	return String(value).padStart(2, '0');
}

function offsetPart(timeZone, at) {
	const options = { timeZone, timeZoneName: 'longOffset' };
	try {
		const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(at);
		const raw = parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
		const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(raw);
		if (match) {
			return `${match[1]}${pad2(Number(match[2]))}:${match[3] ?? '00'}`;
		}
		if (/GMT/i.test(raw)) return '+00:00';
	} catch {
		// Fall through to the numeric computation below.
	}
	return offsetFromFormat(timeZone, at);
}

function offsetFromFormat(timeZone, at) {
	try {
		const formatted = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hour12: false,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		}).formatToParts(at);
		const get = (type) => Number(formatted.find((part) => part.type === type)?.value);
		const asUtc = Date.UTC(
			get('year'),
			get('month') - 1,
			get('day'),
			get('hour') % 24,
			get('minute'),
			get('second')
		);
		const minutes = Math.round((asUtc - at.getTime()) / 60_000);
		const sign = minutes < 0 ? '-' : '+';
		const absolute = Math.abs(minutes);
		return `${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`;
	} catch {
		return '+00:00';
	}
}

// Offset for the given instant, so a zone's daylight-saving offset is shown as
// it applies today rather than a fixed standard-time value.
export function timezoneOffset(timeZone, at = new Date()) {
	if (!isValidTimezone(timeZone)) return '+00:00';
	return offsetPart(timeZone, at);
}

export function timezoneLabel(timeZone, at = new Date()) {
	return `${timeZone} (UTC${timezoneOffset(timeZone, at)})`;
}

// Asia/Manila is pinned first because the app is Philippine-facing; everything
// else follows alphabetically.
export function listTimezones() {
	const seen = new Set([DEFAULT_TIMEZONE, ...FALLBACK_TIMEZONES, ...supportedTimezones()]);
	const zones = [...seen].filter(isValidTimezone);
	return zones.sort((a, b) => {
		if (a === DEFAULT_TIMEZONE) return -1;
		if (b === DEFAULT_TIMEZONE) return 1;
		return a.localeCompare(b);
	});
}

// Value/label pairs for the settings dropdown. The saved zone is always
// included, even when it is an alias the platform list omits.
export function timezoneOptions(selected, at = new Date()) {
	const zones = listTimezones();
	if (typeof selected === 'string' && selected.trim() && !zones.includes(selected.trim())) {
		zones.unshift(selected.trim());
	}
	return zones.map((zone) => ({ value: zone, label: timezoneLabel(zone, at) }));
}
