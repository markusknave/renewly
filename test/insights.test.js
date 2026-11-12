import test from 'node:test';
import assert from 'node:assert/strict';

import { answerQuestion, buildInsights, SUGGESTED_PROMPTS } from '../public/js/insights.js';

const today = '2026-11-12';
const methods = [
	{
		id: 1,
		label: 'BPI',
		kind: 'card',
		openingBalanceCents: 1_000_000,
		openingDate: '2026-10-01',
		interestRateBps: 300,
		interestFrequency: 'daily',
	},
];
const goals = [
	{ id: 1, name: 'Japan trip', targetCents: 5_000_000, deadline: '2027-06-30', color: 'teal' },
];
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
const transactions = [
	{ id: 1, type: 'expense', date: '2026-11-01', amountCents: 10_000, category: 'food', paymentMethodId: 1, merchant: 'Jollibee' },
	{ id: 2, type: 'expense', date: '2026-11-05', amountCents: 20_000, category: 'food', paymentMethodId: 1, merchant: 'Groceries' },
	{ id: 3, type: 'expense', date: '2026-11-06', amountCents: 5_000, category: 'transport', paymentMethodId: 1, merchant: 'Grab' },
	{ id: 4, type: 'expense', date: '2026-10-15', amountCents: 50_000, category: 'food', paymentMethodId: 1, merchant: 'Old food' },
	{ id: 5, type: 'interest', date: '2026-10-31', amountCents: 1_000, category: 'interest', paymentMethodId: 1, auto: true },
	{ id: 6, type: 'goal_deposit', date: '2026-10-01', amountCents: 300_000, goalId: 1, paymentMethodId: 1, category: 'other', merchant: 'To Japan trip' },
];

function context() {
	return {
		transactions,
		methods,
		goals,
		subscriptions,
		today,
		settings: { reminderDays: [7, 3, 1], timezone: 'Asia/Manila' },
		insights: buildInsights({ transactions, methods, goals, subscriptions, today, settings: { reminderDays: [7, 3, 1] } }),
	};
}

test('insights summarize the month, last month, forecasts, and goal feasibility', () => {
	const insights = buildInsights({ transactions, methods, goals, subscriptions, today });
	assert.equal(insights.month.expenseCents, 35_000);
	assert.equal(insights.lastMonth.expenseCents, 50_000);
	assert.equal(insights.month.count, 3);
	assert.equal(insights.topCategory.key, 'food');
	assert.equal(insights.topCategory.amountCents, 30_000);
	assert.ok(insights.dailyAvgCents > 0);
	assert.ok(insights.projectedMonthCents > insights.month.expenseCents);
	assert.equal(insights.subscriptionMonthlyCents, 44_900);
	assert.equal(insights.goalRows[0].savedCents, 300_000);
	assert.equal(insights.goalRows[0].feasible, false);
	assert.ok(insights.balanceCents > 600_000);
	assert.ok(insights.pendingInterestCents > 0);
	assert.ok(insights.earnedInterestCents >= insights.pendingInterestCents);
	assert.ok(insights.forecast.next30Cents > 0);
	assert.ok(insights.forecast.series.some((point) => point.projected));
	assert.ok(insights.tips.some((tip) => tip.tone === 'warn'));
	assert.ok(insights.tips.some((tip) => /Japan trip/.test(tip.title)));
});

test('insights explain a month with no expenses instead of dividing by zero', () => {
	const empty = buildInsights({
		transactions: [],
		methods: [],
		goals: [],
		subscriptions: [],
		today,
	});
	assert.equal(empty.month.expenseCents, 0);
	assert.equal(empty.projectedMonthCents, 0);
	assert.equal(empty.topCategory, null);
	assert.equal(empty.tips[0].tone, 'info');
	assert.ok(empty.tips[0].title.includes('Start'));
});

test('chat answers spending questions from local data only', () => {
	const ctx = context();
	assert.match(answerQuestion('how much did I spend on food last month?', ctx), /₱500\.00/);
	assert.match(answerQuestion('how much did I spend this month', ctx), /₱350\.00/);
	assert.match(answerQuestion('what is my balance', ctx), /Total available/);
	assert.match(answerQuestion('what is my balance', ctx), /BPI/);
	assert.match(answerQuestion('forecast my spending', ctx), /projects to/);
	assert.match(answerQuestion('will I reach my goals', ctx), /Japan trip/);
	assert.match(answerQuestion('will I reach my goals', ctx), /Short by/);
	assert.match(answerQuestion('how much interest am I earning', ctx), /3\.00% p\.a\./);
	assert.match(answerQuestion('where is most of my money going', ctx), /Food & drinks/);
	assert.match(answerQuestion('how can I save more', ctx), /- /);
	assert.match(answerQuestion('help', ctx), /Ask about/);
	assert.match(answerQuestion('hello', ctx), /Nothing is sent anywhere/);
	assert.match(answerQuestion('random question', ctx), /This month so far/);
	assert.ok(SUGGESTED_PROMPTS.length >= 5);
});

test('chat refuses to invent an answer for an empty question', () => {
	const ctx = context();
	assert.match(answerQuestion('', ctx), /Ask me about/);
	assert.match(answerQuestion('   ', ctx), /Ask me about/);
});
