// Expense and income categories. Keys are stored in the ledger; labels, colors,
// and icons are presentation only. Keywords power the offline chat's category
// questions and the import analyst. Users can add their own categories from the
// entry form; those live in settings and are registered here at boot.

export const EXPENSE_CATEGORIES = [
	{
		key: 'food',
		label: 'Food & drinks',
		color: '#f97316',
		icon: 'food',
		keywords: ['food', 'eat', 'eating', 'restaurant', 'coffee', 'cafe', 'lunch', 'dinner', 'breakfast', 'snack', 'grabfood', 'foodpanda', 'burger', 'pizza', 'chicken', 'spaghetti', 'pasta', 'meal', 'drinks', 'beverage', 'jollibee', 'mcdo', 'mcdonald', 'kfc', 'chowking', 'starbucks', 'milk tea'],
	},
	{
		key: 'groceries',
		label: 'Groceries',
		color: '#22c55e',
		icon: 'basket',
		keywords: ['grocery', 'groceries', 'market', 'supermarket', 'palengke', 'sm', 'puregold', 'robinsons'],
	},
	{
		key: 'transport',
		label: 'Transportation',
		color: '#0ea5e9',
		icon: 'car',
		keywords: ['transport', 'transportation', 'grab', 'joyride', 'taxi', 'jeep', 'jeepney', 'bus', 'mrt', 'lrt', 'fare', 'gas', 'fuel', 'parking', 'toll'],
	},
	{
		key: 'bills',
		label: 'Bills & utilities',
		color: '#6366f1',
		icon: 'bolt',
		keywords: ['bill', 'bills', 'electric', 'electricity', 'water', 'internet', 'wifi', 'phone', 'load', 'meralco', 'maynilad', 'rent', 'utility', 'utilities'],
	},
	{
		key: 'shopping',
		label: 'Shopping',
		color: '#ec4899',
		icon: 'bag',
		keywords: ['shop', 'shopping', 'shirt', 'clothes', 'lazada', 'shopee', 'mall', 'shoes', 'gadget', 'electronics'],
	},
	{
		key: 'health',
		label: 'Health',
		color: '#ef4444',
		icon: 'heart',
		keywords: ['health', 'medicine', 'pharmacy', 'doctor', 'hospital', 'gym', 'dental', 'clinic', 'vitamins'],
	},
	{
		key: 'family',
		label: 'Family',
		color: '#db2777',
		icon: 'users',
		keywords: ['family', 'kids', 'child', 'children', 'school fees', 'allowance', 'parents', 'tuition'],
	},
	{
		key: 'social',
		label: 'Social',
		color: '#8b5cf6',
		icon: 'social',
		keywords: ['social', 'friends', 'night out', 'party', 'birthday', 'wedding', 'reunion', 'outing', 'drinks out'],
	},
	{
		key: 'entertainment',
		label: 'Entertainment',
		color: '#a855f7',
		icon: 'play',
		keywords: ['entertainment', 'movie', 'cinema', 'game', 'gaming', 'concert', 'netflix', 'spotify', 'youtube', 'subscription', 'subscriptions'],
	},
	{
		key: 'education',
		label: 'Education',
		color: '#14b8a6',
		icon: 'book',
		keywords: ['education', 'school', 'tuition', 'book', 'books', 'course', 'class', 'training'],
	},
	{
		key: 'travel',
		label: 'Travel',
		color: '#f59e0b',
		icon: 'plane',
		keywords: ['travel', 'flight', 'airfare', 'hotel', 'airbnb', 'vacation', 'trip', 'cebu', 'baguio'],
	},
	{
		key: 'home',
		label: 'Home',
		color: '#64748b',
		icon: 'home',
		keywords: ['home', 'house', 'furniture', 'repair', 'appliance', 'condo', 'laundry'],
	},
	{
		key: 'other',
		label: 'Other',
		color: '#94a3b8',
		icon: 'dots',
		keywords: ['other', 'misc', 'miscellaneous', 'fee', 'fees', 'cash', 'gift', 'donation'],
	},
];

// The legacy key stays valid so older income rows keep their label, and it is
// the safe fallback when an income row arrives without a recognised category.
export const INCOME_CATEGORY = 'income';

export const INCOME_CATEGORIES = [
	{
		key: 'salary',
		label: 'Salary',
		color: '#0ea5e9',
		icon: 'wallet',
		keywords: ['salary', 'payroll', 'wage', 'sweldo', 'bonus', '13th month', 'paycheck'],
	},
	{
		key: 'payments',
		label: 'Payments',
		color: '#0d9488',
		icon: 'check',
		keywords: ['payment', 'invoice paid', 'client payment', 'payout'],
	},
	{
		key: 'grants',
		label: 'Grants',
		color: '#f59e0b',
		icon: 'gift',
		keywords: ['grant', 'scholarship', 'aid', 'stipend', 'subsidy'],
	},
	{
		key: 'refunds',
		label: 'Refunds',
		color: '#7c3aed',
		icon: 'refresh',
		keywords: ['refund', 'reimburse', 'cashback', 'returned', 'rebate'],
	},
	{
		key: 'investment',
		label: 'Investment',
		color: '#2563eb',
		icon: 'trendUp',
		keywords: ['dividend', 'investment', 'stock', 'crypto', 'capital gain', 'interest income'],
	},
	{
		key: INCOME_CATEGORY,
		label: 'Other income',
		color: '#16a34a',
		icon: 'arrowDown',
		keywords: ['income', 'other'],
	},
];

// Icon glossary offered when creating a category. `icon` in shared.js must
// carry a matching path.
export const CATEGORY_ICONS = [
	{ key: 'food', label: 'Food' },
	{ key: 'coffee', label: 'Coffee' },
	{ key: 'basket', label: 'Groceries' },
	{ key: 'car', label: 'Transport' },
	{ key: 'bus', label: 'Commute' },
	{ key: 'bolt', label: 'Utilities' },
	{ key: 'wifi', label: 'Internet' },
	{ key: 'phone', label: 'Phone' },
	{ key: 'home', label: 'Home' },
	{ key: 'key', label: 'Rent' },
	{ key: 'bag', label: 'Shopping' },
	{ key: 'shirt', label: 'Clothing' },
	{ key: 'heart', label: 'Health' },
	{ key: 'users', label: 'Family' },
	{ key: 'social', label: 'Social' },
	{ key: 'baby', label: 'Childcare' },
	{ key: 'paw', label: 'Pets' },
	{ key: 'play', label: 'Games' },
	{ key: 'music', label: 'Music' },
	{ key: 'book', label: 'Education' },
	{ key: 'plane', label: 'Travel' },
	{ key: 'dumbbell', label: 'Fitness' },
	{ key: 'tools', label: 'Repairs' },
	{ key: 'shield', label: 'Insurance' },
	{ key: 'wallet', label: 'Salary' },
	{ key: 'check', label: 'Payments' },
	{ key: 'gift', label: 'Grants' },
	{ key: 'refresh', label: 'Refunds' },
	{ key: 'trendUp', label: 'Investment' },
	{ key: 'target', label: 'Savings' },
	{ key: 'receipt', label: 'Fees' },
	{ key: 'dots', label: 'Other' },
];

export const CATEGORY_KEYS = EXPENSE_CATEGORIES.map((category) => category.key);
export const INCOME_CATEGORY_KEYS = INCOME_CATEGORIES.map((category) => category.key);

const EXPENSE_BY_KEY = new Map(EXPENSE_CATEGORIES.map((category) => [category.key, category]));
const INCOME_BY_KEY = new Map(INCOME_CATEGORIES.map((category) => [category.key, category]));
const ICON_KEYS = new Set(CATEGORY_ICONS.map((icon) => icon.key));
const BUILT_IN_KEYS = new Set([...CATEGORY_KEYS, ...INCOME_CATEGORY_KEYS]);

export const CATEGORY_PALETTE = [
	'#2563eb', '#0d9488', '#ea580c', '#db2777', '#7c3aed', '#16a34a',
	'#dc2626', '#ca8a04', '#0891b2', '#9333ea', '#4d7c0f', '#be123c',
];
export const MAX_CATEGORY_LABEL = 30;
const MAX_CUSTOM_CATEGORIES = 60;

let customCategories = [];

function categorySlug(label) {
	return String(label || '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 32) || 'category';
}

// Normalizes whatever came from settings or a backup. Unknown fields are
// dropped, labels are clamped, and keys never collide with built-ins.
export function normalizeCustomCategories(value) {
	const rows = [];
	const seen = new Set();
	for (const entry of Array.isArray(value) ? value : []) {
		if (!entry || typeof entry !== 'object') continue;
		const label = String(entry.label ?? '').trim().slice(0, MAX_CATEGORY_LABEL);
		if (!label) continue;
		const type = entry.type === 'income' ? 'income' : 'expense';
		const rawKey = String(entry.key ?? '').trim().toLowerCase();
		const key = /^[a-z][a-z0-9-]{1,40}$/.test(rawKey) && rawKey.startsWith('custom-')
			? rawKey
			: customCategoryKey(label);
		if (BUILT_IN_KEYS.has(key) || seen.has(key)) continue;
		const color = /^#[0-9a-f]{6}$/i.test(String(entry.color ?? ''))
			? String(entry.color)
			: CATEGORY_PALETTE[rows.length % CATEGORY_PALETTE.length];
		const icon = ICON_KEYS.has(entry.icon) ? entry.icon : 'dots';
		seen.add(key);
		rows.push({ key, label, type, color, icon });
		if (rows.length >= MAX_CUSTOM_CATEGORIES) break;
	}
	return rows;
}

// A stable, collision-free key for a new category label.
export function customCategoryKey(label) {
	const base = `custom-${categorySlug(label)}`;
	const taken = new Set([...BUILT_IN_KEYS, ...customCategories.map((row) => row.key)]);
	if (!taken.has(base)) return base;
	let index = 2;
	while (taken.has(`${base}-${index}`)) index += 1;
	return `${base}-${index}`;
}

// Builds the record the settings screen saves. Throws on user-correctable
// input so the dialog can show the message.
export function buildCustomCategory({ label, type = 'expense', icon = 'dots', color = '' }) {
	const name = String(label ?? '').trim().slice(0, MAX_CATEGORY_LABEL);
	if (!name) throw new Error('Give the category a name.');
	const scope = type === 'income' ? 'income' : 'expense';
	const duplicate = categoriesFor(scope).some(
		(category) => category.label.toLowerCase() === name.toLowerCase()
	);
	if (duplicate) throw new Error(`A ${scope} category named ${name} already exists.`);
	return {
		key: customCategoryKey(name),
		label: name,
		type: scope,
		color: /^#[0-9a-f]{6}$/i.test(color)
			? color
			: CATEGORY_PALETTE[customCategories.length % CATEGORY_PALETTE.length],
		icon: ICON_KEYS.has(icon) ? icon : 'dots',
	};
}

export function setCustomCategories(value) {
	customCategories = normalizeCustomCategories(value);
}

export function getCustomCategories() {
	return customCategories.map((category) => ({ ...category }));
}

export function categoriesFor(type) {
	const scope = type === 'income' ? 'income' : 'expense';
	const builtIn = scope === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
	return [...builtIn, ...customCategories.filter((category) => category.type === scope)];
}

export function isCategoryKey(type, key) {
	const normalized = String(key ?? '');
	if (type === 'income') {
		return INCOME_BY_KEY.has(normalized)
			|| customCategories.some((category) => category.type === 'income' && category.key === normalized);
	}
	return EXPENSE_BY_KEY.has(normalized)
		|| customCategories.some((category) => category.type === 'expense' && category.key === normalized);
}

export function categoryInfo(key) {
	const normalized = String(key ?? '');
	const custom = customCategories.find((category) => category.key === normalized);
	if (custom) return custom;
	if (INCOME_BY_KEY.has(normalized)) return INCOME_BY_KEY.get(normalized);
	return EXPENSE_BY_KEY.get(normalized) || EXPENSE_BY_KEY.get('other');
}

export function categoryLabel(key) {
	return categoryInfo(key).label;
}

export function categoryColor(key) {
	return categoryInfo(key).color;
}

// Best-effort category from free text, used to prefill the expense form and to
// let the chat answer "how much did I spend on food".
export function detectCategory(text) {
	const source = String(text || '').toLowerCase();
	if (!source.trim()) return null;
	let best = null;
	for (const [category, keywords] of [
		...EXPENSE_CATEGORIES.map((category) => [category, category.keywords]),
		...customCategories
			.filter((category) => category.type === 'expense')
			.map((category) => [category, [category.label.toLowerCase()]]),
	]) {
		for (const keyword of keywords) {
			if (!source.includes(keyword)) continue;
			if (!best || keyword.length > best.length) best = { key: category.key, length: keyword.length };
		}
	}
	return best ? best.key : null;
}

// Best-effort income category, used when editing or importing income rows.
export function detectIncomeCategory(text) {
	const source = String(text || '').toLowerCase();
	if (!source.trim()) return null;
	let best = null;
	for (const category of INCOME_CATEGORIES) {
		if (category.key === INCOME_CATEGORY) continue;
		for (const keyword of category.keywords) {
			if (!source.includes(keyword)) continue;
			if (!best || keyword.length > best.length) best = { key: category.key, length: keyword.length };
		}
	}
	return best ? best.key : null;
}
