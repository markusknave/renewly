// Loads the bundled plan catalog. The app never scrapes at runtime; the JSON is
// refreshed on a computer with scripts/refresh-plans.mjs and shipped as an asset.

let cached = null;
let pending = null;

export async function loadCatalog() {
	if (cached) return cached;
	if (pending) return pending;
	pending = (async () => {
		const url = new URL('../data/plans.json', import.meta.url);
		const res = await fetch(url, { cache: 'no-cache' });
		if (!res.ok) throw new Error(`Catalog unavailable (${res.status})`);
		const data = await res.json();
		if (!data || !Array.isArray(data.platforms)) throw new Error('Catalog is malformed');
		cached = data;
		return data;
	})();
	try {
		return await pending;
	} finally {
		pending = null;
	}
}

export function findPlatform(catalog, key) {
	return catalog?.platforms?.find((p) => p.key === key) || null;
}

export function findPlan(platform, planId) {
	return platform?.plans?.find((p) => p.id === planId) || null;
}

export function catalogCategories(catalog) {
	const seen = new Set();
	for (const p of catalog?.platforms ?? []) seen.add(p.category || 'Other');
	return [...seen].sort((a, b) => a.localeCompare(b));
}

