import test from 'node:test';
import assert from 'node:assert/strict';

import {
	cardsView,
	expensesView,
	goalsView,
	homeView,
	importView,
	insightsView,
	moreView,
} from '../public/js/views.js';
import { buildInsights } from '../public/js/insights.js';
import { goalSnapshots, monthRange, summarizePeriod } from '../public/js/finance.js';
import { cardThemeFor, instrumentFor } from '../public/js/lib/cardThemes.js';
import { providersFor } from '../public/js/lib/providers.js';
import { detectCategory } from '../public/js/lib/categories.js';

const today = '2026-11-12';
const settings = { currency: 'PHP', timezone: 'Asia/Manila', reminderDays: [7, 3, 1] };
const methods = [
	{
		id: 1,
		label: 'MariBank',
		kind: 'card',
		last4: '4821',
		network: 'mastercard',
		openingBalanceCents: 5_000_000,
		openingDate: '2026-11-01',
		interestRateBps: 325,
		interestFrequency: 'daily',
	},
];
const transactions = [
	{ id: 1, type: 'expense', date: '2026-11-12', amountCents: 48_550, category: 'food', paymentMethodId: 1, merchant: 'Jollibee' },
	{ id: 2, type: 'expense', date: '2026-11-10', amountCents: 89_900, category: 'shopping', paymentMethodId: 1, merchant: 'Uniqlo' },
	{ id: 3, type: 'goal_deposit', date: '2026-11-11', amountCents: 1_000_000, goalId: 1, paymentMethodId: 1, merchant: 'To Japan trip' },
];
const goals = [{ id: 1, name: 'Japan trip', targetCents: 5_000_000, deadline: '2027-06-30', color: 'teal' }];
const snapshots = methods.map((method) => ({
	method,
	balanceCents: 4_000_000,
	pendingCents: 1_000,
	totalCents: 4_001_000,
	interestEarnedCents: 1_000,
}));
const month = summarizePeriod(transactions, monthRange(today));
const goalRows = goalSnapshots(goals, transactions, today);
const subscriptions = [
	{
		id: 1,
		kind: 'recurring',
		merchantName: 'Netflix',
		amountCents: 44_900,
		cadence: 'monthly',
		status: 'active',
		nextRenewalDate: '2026-11-20',
	},
];
const insights = buildInsights({ transactions, methods, goals, subscriptions, today, settings });

test('home dashboard shows total money, cards, charts, goals, and quick actions', () => {
	const html = homeView({
		today,
		settings,
		methods,
		snapshots,
		totalCents: 4_001_000,
		month,
		lastMonth: { ...month, expenseCents: 0, count: 0 },
		interestEarnedCents: 1_000,
		pendingInterestCents: 1_000,
		goalRows,
		subscriptionSummary: {
			monthlyCents: 44_900,
			dueSoonCount: 1,
			overdueCount: 0,
			dueSoon: [subscriptions[0]],
			overdue: [],
		},
		transactions,
		sparkSeries: [{ date: '2026-11-11', amountCents: 0 }, { date: '2026-11-12', amountCents: 48_550 }],
	});
	assert.match(html, /class="hero"/);
	assert.match(html, /₱40,010\.00/);
	assert.match(html, /class="bank-card/);
	assert.match(html, /MariBank/);
	assert.match(html, /class="donut"/);
	assert.match(html, /Japan trip/);
	assert.match(html, /data-action="new-expense"/);
	assert.match(html, /data-action="new-goal"/);
	assert.match(html, /Recent activity/);
	assert.match(html, /Netflix/);
});

test('home dashboard explains the empty state when no method exists', () => {
	const html = homeView({
		today,
		settings,
		methods: [],
		snapshots: [],
		totalCents: 0,
		month: { ...month, expenseCents: 0, count: 0, categories: [] },
		lastMonth: { expenseCents: 0 },
		goalRows: [],
		subscriptionSummary: { monthlyCents: 0, dueSoonCount: 0, overdueCount: 0, dueSoon: [], overdue: [] },
		transactions: [],
		sparkSeries: [],
	});
	assert.match(html, /No payment methods yet/);
	assert.match(html, /Add a payment method/);
});

test('expenses screen renders filters, exports, ledger rows, and the add dialog', () => {
	const range = monthRange(today);
	const summary = summarizePeriod(transactions, range);
	const html = expensesView({
		today,
		methods,
		filters: { preset: 'this_month', query: '', category: '', methodId: '' },
		range,
		summary,
		rows: transactions,
	});
	assert.match(html, /data-expense-preset/);
	assert.match(html, /data-expense-category/);
	assert.match(html, /data-expense-method/);
	assert.match(html, /data-expense-search/);
	assert.match(html, /data-format="csv"/);
	assert.match(html, /data-format="xlsx"/);
	assert.match(html, /data-format="pdf"/);
	assert.match(html, /data-action="edit-expense"/);
	assert.match(html, /Jollibee/);
	assert.match(html, /To Japan trip/);
	assert.match(html, /id="expense-dialog"/);
	assert.match(html, /data-dialog-error/);
});

test('goals screen renders progress, feasibility copy, and both dialogs', () => {
	const html = goalsView({ today, methods, goals, goalRows, transactions });
	assert.match(html, /class="goal-card"/);
	assert.match(html, /Japan trip/);
	assert.match(html, /class="goal-ring"/);
	assert.match(html, /data-action="transfer-goal"/);
	assert.match(html, /data-action="withdraw-goal"/);
	assert.match(html, /id="goal-dialog"/);
	assert.match(html, /id="transfer-dialog"/);
	assert.match(html, /No bank transfer happens/);
});

test('insights screen shows the privacy banner, forecast, tips, and chat', () => {
	const html = insightsView({ insights, goalRows, chat: [], methods });
	assert.match(html, /Private by construction/);
	assert.match(html, /cannot browse, call APIs/);
	assert.match(html, /class="forecast-chart"/);
	assert.match(html, /What stands out/);
	assert.match(html, /data-form="chat"/);
	assert.match(html, /data-chat-prompt=/);
	assert.match(html, /Goal feasibility/);
});

test('more hub links every secondary screen', () => {
	const html = moreView({ methods, goals, subscriptions, transactions, settings });
	for (const href of ['#/subscriptions', '#/cards', '#/goals', '#/expenses', '#/import', '#/catalog', '#/groups', '#/settings']) {
		assert.ok(html.includes(`href="${href}"`), `missing ${href}`);
	}
});

test('More modules expose a breadcrumb back to the hub', () => {
	const pages = [
		cardsView({ methods, snapshots, today }),
		moreView({ methods, goals, subscriptions, transactions, settings }),
	];
	const html = pages.join('');
	assert.ok(html.includes('aria-label="Breadcrumb"'));
	assert.ok(html.includes('href="#/more"'));
	assert.ok(html.includes('Cards &amp; wallets'));
});

test('SeaBank uses its current MariBank name', () => {
	const banks = providersFor('bank');
	assert.ok(banks.includes('MariBank'));
	assert.ok(!banks.includes('SeaBank'));
	assert.equal(cardThemeFor('MariBank', 'bank').key, 'maribank');
});

test('import review renders the drop zone, analyst summary, and commit form', () => {
	const html = importView({
		methods,
		defaultMethodId: 1,
		preview: {
			fileName: 'statement.csv',
			format: 'CSV',
			rows: [
				{
					date: '2026-11-01',
					merchant: 'Jollibee',
					amountCents: 12_550,
					category: 'food',
					notes: '',
					paymentMethodId: 1,
					methodLabel: 'MariBank',
					duplicate: false,
				},
				{
					date: '2026-11-02',
					merchant: 'Uniqlo',
					amountCents: 89_900,
					category: 'shopping',
					notes: '',
					paymentMethodId: 1,
					methodLabel: 'MariBank',
					duplicate: true,
				},
			],
			stats: { total: 2, valid: 1, invalid: 0, duplicates: 1, creditsSkipped: 0 },
			warnings: ['1 row already exists and is excluded by default.'],
			analysis: {
				count: 1,
				totalCents: 12_550,
				categories: [{ key: 'food', label: 'Food & drinks', amountCents: 12_550, share: 100 }],
				from: '2026-11-01',
				to: '2026-11-01',
			},
		},
	});
	assert.match(html, /id="expense-import-file"/);
	assert.match(html, /data-form="import-expenses"/);
	assert.match(html, /Re-run analyst/);
	assert.match(html, /Jollibee/);
	assert.match(html, /Duplicate/);
	assert.match(html, /Import 1 expense/);
	assert.match(html, /Analyst top category/);
});

test('import screen explains supported formats before a file is chosen', () => {
	const html = importView({ methods, preview: null });
	assert.match(html, /CSV, PDF, Excel/);
	assert.match(html, /Money Manager/);
	assert.match(html, /How matching works/);
});
test('payment method screen exposes balances, rates, compounding, and network', () => {
	const html = cardsView({ methods, snapshots, today });
	assert.match(html, /name="openingBalance"/);
	assert.match(html, /name="openingDate"/);
	assert.match(html, /name="interestRate"/);
	assert.match(html, /name="interestFrequency"/);
	assert.match(html, /name="instrument"/);
	assert.match(html, /<option value="debit" selected>Debit<\/option>/);
	assert.match(html, /name="network"/);
	assert.match(html, /MariBank/);
	assert.match(html, /3\.25% p\.a\./);
	assert.match(html, /data-custom-method-label/);
});

test('card themes recognize Philippine issuers and fall back by kind', () => {
	assert.equal(cardThemeFor('MariBank', 'card').key, 'maribank');
	assert.equal(cardThemeFor('Bank of the Philippine Islands (BPI)', 'card').key, 'bpi');
	assert.equal(cardThemeFor('GCash', 'ewallet').key, 'gcash');
	assert.equal(cardThemeFor('BPI Visa', 'card', 'visa').network, 'visa');
	assert.equal(cardThemeFor('Unknown card', 'card').key, 'card');
	assert.equal(cardThemeFor('Unknown wallet', 'ewallet').key, 'ewallet');
	assert.equal(instrumentFor('card'), 'debit');
	assert.equal(instrumentFor('bank'), 'account');
	assert.equal(instrumentFor('ewallet'), 'wallet');
	assert.equal(detectCategory('Jollibee lunch'), 'food');
	assert.equal(detectCategory('Meralco bill'), 'bills');
	assert.equal(detectCategory('random'), null);
});
