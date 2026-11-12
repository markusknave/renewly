// Expense categories. Keys are stored in the ledger; labels, colors, and icons
// are presentation only. Keywords power the offline chat's category questions.

export const EXPENSE_CATEGORIES = [
	{
		key: 'food',
		label: 'Food & drinks',
		color: '#f97316',
		icon: 'food',
		keywords: ['food', 'eat', 'eating', 'restaurant', 'coffee', 'cafe', 'lunch', 'dinner', 'breakfast', 'snack', 'grabfood', 'foodpanda'],
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
		label: 'Transport',
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

export const CATEGORY_KEYS = EXPENSE_CATEGORIES.map((category) => category.key);

const BY_KEY = new Map(EXPENSE_CATEGORIES.map((category) => [category.key, category]));

export function categoryInfo(key) {
	return BY_KEY.get(String(key || '')) || BY_KEY.get('other');
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
	for (const category of EXPENSE_CATEGORIES) {
		for (const keyword of category.keywords) {
			if (!source.includes(keyword)) continue;
			if (!best || keyword.length > best.length) best = { key: category.key, length: keyword.length };
		}
	}
	return best ? best.key : null;
}
