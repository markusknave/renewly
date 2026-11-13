// Payment providers available in the Philippines. The payment-method form uses
// this list to offer a bank, wallet, card issuer, or credit line per type
// instead of asking people to type the name, which is where most label typos
// and duplicates came from.

const BANK_KINDS = ['bank', 'card'];
const EWALLET_KINDS = ['ewallet'];
const CREDIT_KINDS = ['credit'];

// One entry per provider. `kinds` decides which payment types offer it, so
// picking Card lists card-issuing banks while picking Credit lists BNPL and
// credit-line providers such as Atome.
const PROVIDERS = [
	{ name: 'Akulaku', kinds: CREDIT_KINDS },
	{ name: 'Al-Amanah Islamic Investment Bank', kinds: BANK_KINDS },
	{ name: 'American Express', kinds: ['card'] },
	{ name: 'Asia United Bank (AUB)', kinds: BANK_KINDS },
	{ name: 'Atome', kinds: CREDIT_KINDS },
	{ name: 'Bank of China (Manila)', kinds: BANK_KINDS },
	{ name: 'Bank of Commerce', kinds: BANK_KINDS },
	{ name: 'Bank of Makati', kinds: BANK_KINDS },
	{ name: 'Bank of the Philippine Islands (BPI)', kinds: BANK_KINDS },
	{ name: 'BanKo', kinds: BANK_KINDS },
	{ name: 'Bayad', kinds: EWALLET_KINDS },
	{ name: 'BDO Unibank', kinds: BANK_KINDS },
	{ name: 'BillEase', kinds: CREDIT_KINDS },
	{ name: 'Cashalo', kinds: CREDIT_KINDS },
	{ name: 'China Bank Savings', kinds: BANK_KINDS },
	{ name: 'Chinabank', kinds: BANK_KINDS },
	{ name: 'CIMB Bank', kinds: BANK_KINDS },
	{ name: 'Citibank', kinds: BANK_KINDS },
	{ name: 'City Savings Bank', kinds: BANK_KINDS },
	{ name: 'coins.ph', kinds: EWALLET_KINDS },
	{ name: 'CTBC Bank (Philippines)', kinds: BANK_KINDS },
	{ name: 'Development Bank of the Philippines (DBP)', kinds: BANK_KINDS },
	{ name: 'DiskarTech', kinds: ['bank', 'ewallet'] },
	{ name: 'EastWest Bank', kinds: BANK_KINDS },
	{ name: 'First Consolidated Bank', kinds: BANK_KINDS },
	{ name: 'GCash', kinds: EWALLET_KINDS },
	{ name: 'GLoan', kinds: CREDIT_KINDS },
	{ name: 'GoTyme Bank', kinds: BANK_KINDS },
	{ name: 'GrabPay', kinds: EWALLET_KINDS },
	{ name: 'Home Credit', kinds: CREDIT_KINDS },
	{ name: 'HSBC', kinds: BANK_KINDS },
	{ name: 'JuanCash', kinds: EWALLET_KINDS },
	{ name: 'JuanHand', kinds: CREDIT_KINDS },
	{ name: 'Komo', kinds: BANK_KINDS },
	{ name: 'Land Bank of the Philippines', kinds: BANK_KINDS },
	{ name: 'Lazada Wallet', kinds: EWALLET_KINDS },
	{ name: 'LazPayLater', kinds: CREDIT_KINDS },
	{ name: 'Malayan Bank', kinds: BANK_KINDS },
	{ name: 'MariBank', kinds: BANK_KINDS },
	{ name: 'Maybank', kinds: BANK_KINDS },
	{ name: 'Maya', kinds: EWALLET_KINDS },
	{ name: 'Maya Bank', kinds: BANK_KINDS },
	{ name: 'Maya Credit', kinds: CREDIT_KINDS },
	{ name: 'Metrobank', kinds: BANK_KINDS },
	{ name: 'MUFG Bank (Manila)', kinds: BANK_KINDS },
	{ name: 'Netbank', kinds: BANK_KINDS },
	{ name: 'Overseas Filipino Bank', kinds: BANK_KINDS },
	{ name: 'OwnBank', kinds: BANK_KINDS },
	{ name: 'PalawanPay', kinds: EWALLET_KINDS },
	{ name: 'PayPal', kinds: EWALLET_KINDS },
	{ name: 'PBCom (Philippine Bank of Communications)', kinds: BANK_KINDS },
	{ name: 'Philippine Business Bank', kinds: BANK_KINDS },
	{ name: 'Philippine National Bank (PNB)', kinds: BANK_KINDS },
	{ name: 'Philippine Savings Bank (PSBank)', kinds: BANK_KINDS },
	{ name: 'Philippine Trust Company (Philtrust Bank)', kinds: BANK_KINDS },
	{ name: 'Philippine Veterans Bank', kinds: BANK_KINDS },
	{ name: 'Producers Bank', kinds: BANK_KINDS },
	{ name: 'RCBC', kinds: BANK_KINDS },
	{ name: 'Robinsons Bank', kinds: BANK_KINDS },
	{ name: 'Salmon', kinds: CREDIT_KINDS },
	{ name: 'Security Bank', kinds: BANK_KINDS },
	{ name: 'ShopeePay', kinds: EWALLET_KINDS },
	{ name: 'SPayLater', kinds: CREDIT_KINDS },
	{ name: 'Standard Chartered', kinds: BANK_KINDS },
	{ name: 'Sterling Bank', kinds: BANK_KINDS },
	{ name: 'Tala', kinds: CREDIT_KINDS },
	{ name: 'Tonik', kinds: BANK_KINDS },
	{ name: 'UnaCash', kinds: CREDIT_KINDS },
	{ name: 'UnionBank of the Philippines', kinds: BANK_KINDS },
	{ name: 'UnionDigital Bank', kinds: BANK_KINDS },
	{ name: 'UNObank', kinds: BANK_KINDS },
	{ name: 'Wealthbank', kinds: BANK_KINDS },
	{ name: 'Wise', kinds: EWALLET_KINDS },
];

const TYPE_FALLBACKS = {
	card: 'Card',
	ewallet: 'E-wallet',
	bank: 'Bank account',
	credit: 'Credit / BNPL',
	cash: 'Cash',
	other: 'Other',
};

const GENERIC_PROVIDER_TOKENS = new Set([
	'bank',
	'banking',
	'credit',
	'debit',
	'card',
	'account',
	'wallet',
	'philippines',
	'philippine',
	'the',
	'and',
]);

export const CUSTOM_PROVIDER = '__custom';

function normalized(value) {
	return String(value ?? '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, ' ');
}

// Providers offered for a payment type, alphabetically. Cash and Other keep a
// single generic choice; the custom field covers anything not listed.
export function providersFor(kind) {
	const normalizedKind = String(kind || 'other');
	if (normalizedKind === 'cash') return ['Cash'];
	const matches = PROVIDERS.filter((provider) => provider.kinds.includes(normalizedKind)).map(
		(provider) => provider.name
	);
	if (!matches.length) return [TYPE_FALLBACKS.other];
	return [...new Set(matches)].sort((a, b) => a.localeCompare(b));
}

export function defaultProviderFor(kind) {
	return providersFor(kind)[0] ?? '';
}

// Best-effort provider type for an account name found in a statement. This is
// used when an import creates a missing card or wallet automatically.
export function inferPaymentKind(label) {
	const text = normalized(label);
	if (!text) return 'other';
	if (/\b(visa|mastercard|amex|card|debit|prepaid)\b/.test(text)) return 'card';
	if (/\b(bnpl|paylater|pay later|installment|loan)\b/.test(text)) return 'credit';
	if (
		/\b(gloan|spaylater|lazpaylater|atome|billease|home credit|salmon|tala|cashalo|akulaku|juanhand|unacash|maya credit)\b/.test(
			text
		)
	) {
		return 'credit';
	}
	let best = null;
	let bestScore = 0;
	for (const provider of PROVIDERS) {
		const name = normalized(provider.name);
		if (!name) continue;
		let score = 0;
		if (text === name) score = 1000;
		else if (text.includes(name)) score = 200 + name.length;
		else {
			for (const token of name.split(' ')) {
				if (token.length < 3 || GENERIC_PROVIDER_TOKENS.has(token)) continue;
				if (text.includes(token)) score += token.length;
			}
		}
		if (score > bestScore) {
			bestScore = score;
			best = provider;
		}
	}
	if (best) {
		if (best.kinds.includes('credit')) return 'credit';
		if (best.kinds.includes('ewallet') && !best.kinds.includes('bank')) return 'ewallet';
		if (best.kinds.includes('bank')) return 'bank';
		if (best.kinds.includes('card')) return 'card';
	}
	if (/\b(credit|bnpl|paylater|pay later|installment|loan)\b/.test(text)) return 'credit';
	if (/\b(wallet|gcash|maya|grabpay|shopeepay|paypal|wise|coins|palawan|bayad|juancash)\b/.test(text)) {
		return 'ewallet';
	}
	if (/\b(bank|savings|rural|thrift|credit union)\b/.test(text)) return 'bank';
	if (/\b(card|visa|mastercard|amex)\b/.test(text)) return 'card';
	return 'other';
}
