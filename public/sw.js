const CACHE_NAME = 'renewly-shell-v9';
const APP_ASSETS = [
	'./',
	'./index.html',
	'./styles.css',
	'./js/app.js',
	'./js/views.js',
	'./js/views/shared.js',
	'./js/views/home.js',
	'./js/views/expenses.js',
	'./js/views/goals.js',
	'./js/views/insights.js',
	'./js/views/import.js',
	'./js/views/money.js',
	'./js/views/more.js',
	'./js/views/subscriptions.js',
	'./js/store.js',
	'./js/db.js',
	'./js/finance.js',
	'./js/insights.js',
	'./js/import.js',
	'./js/export.js',
	'./js/importers/table.js',
	'./js/importers/csv.js',
	'./js/importers/xlsx.js',
	'./js/importers/pdf.js',
	'./js/importers/sqlite.js',
	'./js/importers/limits.js',
	'./js/catalog.js',
	'./js/backup.js',
	'./js/notifications.js',
	'./js/reminders.js',
	'./js/lib/dates.js',
	'./js/lib/providers.js',
	'./js/lib/timezones.js',
	'./js/lib/categories.js',
	'./js/lib/cardThemes.js',
	'./data/plans.json',
	'./manifest.webmanifest',
	'./favicon.svg',
	'./icons/app-192.png',
	'./icons/app-512.png',
	'./icons/app-maskable-512.png',
	'./icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(APP_ASSETS))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
			.then(() => self.clients.claim())
	);
});

async function networkFirst(request) {
	const cache = await caches.open(CACHE_NAME);
	try {
		const response = await fetch(request);
		if (response.ok) await cache.put(request, response.clone());
		return response;
	} catch {
		const cached = await cache.match(request);
		return cached || Response.error();
	}
}

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	if (request.mode === 'navigate') {
		event.respondWith(
			networkFirst(request).catch(async () => {
				const cache = await caches.open(CACHE_NAME);
				return (await cache.match('./index.html')) || (await cache.match('./'));
			})
		);
		return;
	}

	// App assets are served network-first so a deployed update is picked up on the
	// next load, with the cache as the offline fallback.
	event.respondWith(networkFirst(request));
});
