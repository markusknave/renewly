// Payment providers available in the Philippines. The payment-method form uses
// this list to offer a bank or e-wallet per type instead of asking people to
// type the name, which is where most label typos and duplicates came from.

const BANK_KINDS = ['bank', 'card'];
const EWALLET_KINDS = ['ewallet'];

// One entry per provider. `kinds` decides which payment types offer it, so
// picking Card lists card-issuing banks while picking E-wallet lists wallets.
const PROVIDERS = [
	{ name: 'American Express', kinds: ['card'] },
	{ name: 'Asia United Bank (AUB)', kinds: BANK_KINDS },
	{ name: 'Bank of Commerce', kinds: BANK_KINDS },
	{ name: 'Bank of Makati', kinds: BANK_KINDS },
	{ name: 'Bank of the Philippine Islands (BPI)', kinds: BANK_KINDS },
	{ name: 'BanKo', kinds: BANK_KINDS },
	{ name: 'Bayad', kinds: EWALLET_KINDS },
	{ name: 'BDO Unibank', kinds: BANK_KINDS },
	{ name: 'China Bank Savings', kinds: BANK_KINDS },
	{ name: 'Chinabank', kinds: BANK_KINDS },
	{ name: 'CIMB Bank', kinds: BANK_KINDS },
	{ name: 'Citibank', kinds: BANK_KINDS },
	{ name: 'City Savings Bank', kinds: BANK_KINDS },
	{ name: 'coins.ph', kinds: EWALLET_KINDS },
	{ name: 'Development Bank of the Philippines (DBP)', kinds: BANK_KINDS },
	{ name: 'DiskarTech', kinds: ['bank', 'ewallet'] },
	{ name: 'EastWest Bank', kinds: BANK_KINDS },
	{ name: 'GCash', kinds: EWALLET_KINDS },
	{ name: 'GoTyme Bank', kinds: BANK_KINDS },
	{ name: 'GrabPay', kinds: EWALLET_KINDS },
	{ name: 'HSBC', kinds: BANK_KINDS },
	{ name: 'JuanCash', kinds: EWALLET_KINDS },
	{ name: 'Komo', kinds: BANK_KINDS },
	{ name: 'Land Bank of the Philippines', kinds: BANK_KINDS },
	{ name: 'Lazada Wallet', kinds: EWALLET_KINDS },
	{ name: 'Malayan Bank', kinds: BANK_KINDS },
	{ name: 'MariBank', kinds: BANK_KINDS },
	{ name: 'Maybank', kinds: BANK_KINDS },
	{ name: 'Maya', kinds: EWALLET_KINDS },
	{ name: 'Maya Bank', kinds: BANK_KINDS },
	{ name: 'Metrobank', kinds: BANK_KINDS },
	{ name: 'Netbank', kinds: BANK_KINDS },
	{ name: 'Overseas Filipino Bank', kinds: BANK_KINDS },
	{ name: 'OwnBank', kinds: BANK_KINDS },
	{ name: 'PalawanPay', kinds: EWALLET_KINDS },
	{ name: 'PayPal', kinds: EWALLET_KINDS },
	{ name: 'Philippine Business Bank', kinds: BANK_KINDS },
	{ name: 'Philippine National Bank (PNB)', kinds: BANK_KINDS },
	{ name: 'Philippine Savings Bank (PSBank)', kinds: BANK_KINDS },
	{ name: 'RCBC', kinds: BANK_KINDS },
	{ name: 'Robinsons Bank', kinds: BANK_KINDS },
	{ name: 'SeaBank', kinds: BANK_KINDS },
	{ name: 'Security Bank', kinds: BANK_KINDS },
	{ name: 'ShopeePay', kinds: EWALLET_KINDS },
	{ name: 'Standard Chartered', kinds: BANK_KINDS },
	{ name: 'Sterling Bank', kinds: BANK_KINDS },
	{ name: 'Tonik', kinds: BANK_KINDS },
	{ name: 'UnionBank of the Philippines', kinds: BANK_KINDS },
	{ name: 'UnionDigital Bank', kinds: BANK_KINDS },
	{ name: 'UNObank', kinds: BANK_KINDS },
	{ name: 'Wealthbank', kinds: BANK_KINDS },
	{ name: 'Wise', kinds: EWALLET_KINDS },
];

const TYPE_FALLBACKS = {
	card: 'Card',
	ewallet: 'E-wallet',
	bank: 'Bank transfer',
	cash: 'Cash',
	other: 'Other',
};

export const CUSTOM_PROVIDER = '__custom';

// Providers offered for a payment type, alphabetically. Cash and Other keep a
// single generic choice; the custom field covers anything not listed.
export function providersFor(kind) {
	const normalized = String(kind || 'other');
	if (normalized === 'cash') return ['Cash'];
	const matches = PROVIDERS.filter((provider) => provider.kinds.includes(normalized)).map(
		(provider) => provider.name
	);
	if (!matches.length) return [TYPE_FALLBACKS.other];
	return [...new Set(matches)].sort((a, b) => a.localeCompare(b));
}

export function defaultProviderFor(kind) {
	return providersFor(kind)[0] ?? '';
}
