import { test } from 'vitest';
import assert from 'node:assert/strict';

import { createMemoryBackend } from '../public/js/db.js';
import {
	deletePaymentMethod,
	listPaymentMethods,
	listTransactions,
	saveExpense,
	saveGoal,
	saveGoalTransfer,
	savePaymentMethod,
	deleteGoal,
} from '../public/js/store.js';
import {
	accrueInterest,
	buildInterestPlan,
	goalSavedCents,
	goalSnapshot,
	methodBalance,
	methodSnapshot,
	rangeForPreset,
	summarizePeriod,
	totalBalance,
	transactionSignedCents,
} from '../public/js/finance.js';

function method(overrides = {}) {
	return {
		id: 1,
		label: 'Test',
		kind: 'card',
		openingBalanceCents: 0,
		openingDate: '2026-11-01',
		interestRateBps: 0,
		interestFrequency: 'none',
		...overrides,
	};
}

test('signed cents follow the ledger direction of each transaction type', () => {
	assert.equal(transactionSignedCents({ type: 'expense', amountCents: 100 }), -100);
	assert.equal(transactionSignedCents({ type: 'goal_deposit', amountCents: 100 }), -100);
	assert.equal(transactionSignedCents({ type: 'income', amountCents: 100 }), 100);
	assert.equal(transactionSignedCents({ type: 'interest', amountCents: 100 }), 100);
	assert.equal(transactionSignedCents({ type: 'goal_withdrawal', amountCents: 100 }), 100);
	assert.equal(transactionSignedCents({ type: 'unknown', amountCents: 100 }), 0);
});

test('method balances combine the opening balance and ledger rows through a date', () => {
	const account = method({ openingBalanceCents: 100_000 });
	const rows = [
		{ type: 'expense', date: '2026-11-02', amountCents: 10_000, paymentMethodId: 1 },
		{ type: 'interest', date: '2026-11-03', amountCents: 500, paymentMethodId: 1, auto: true },
		{ type: 'goal_deposit', date: '2026-11-04', amountCents: 20_000, paymentMethodId: 1, goalId: 1 },
		{ type: 'goal_withdrawal', date: '2026-11-05', amountCents: 5_000, paymentMethodId: 1, goalId: 1 },
		{ type: 'income', date: '2026-11-06', amountCents: 1_000, paymentMethodId: 1 },
		{ type: 'expense', date: '2026-11-07', amountCents: 9_999, paymentMethodId: 2 },
	];
	assert.equal(methodBalance(account, rows, '2026-11-05'), 75_500);
	assert.equal(methodBalance(account, rows, '2026-11-06'), 76_500);
	assert.equal(methodBalance(account, rows, '2026-11-01'), 100_000);
});

test('daily compounding accrues cents per day and holds the current month as pending', () => {
	const account = method({
		id: 2,
		openingBalanceCents: 5_000_000,
		openingDate: '2026-11-01',
		interestRateBps: 325,
		interestFrequency: 'daily',
	});

	const twoDays = buildInterestPlan(account, [], '2026-11-02');
	assert.deepEqual(twoDays.entries, []);
	// Day 1: 5,000,000 × 325 ÷ 3,650,000 = 445.205 → 445 cents.
	// Day 2 compounds on 5,000,445 and rounds to 445 again.
	assert.equal(twoDays.pendingCents, 890);

	const monthEnd = buildInterestPlan(account, [], '2026-11-30');
	assert.equal(monthEnd.pendingCents, 0);
	assert.equal(monthEnd.entries.length, 1);
	assert.equal(monthEnd.entries[0].key, 'interest:2:2026-11');
	assert.ok(monthEnd.entries[0].amountCents > 0);
});

test('monthly compounding posts at month end and compounds the balance', () => {
	const account = method({
		id: 3,
		openingBalanceCents: 10_000_000,
		openingDate: '2026-09-01',
		interestRateBps: 300,
		interestFrequency: 'monthly',
	});
	const plan = buildInterestPlan(account, [], '2026-11-02');
	assert.deepEqual(
		plan.entries.map((entry) => [entry.key, entry.amountCents]),
		[
			['interest:3:2026-09', 25_000],
			['interest:3:2026-10', 25_063],
		]
	);
	assert.equal(plan.pendingCents, 0);
});

test('accrual is idempotent, posts completed months, and removes stale rows', async () => {
	const db = createMemoryBackend();
	const account = await savePaymentMethod(db, {
		label: 'BPI',
		kind: 'card',
		openingBalanceCents: 10_000_000,
		openingDate: '2026-09-01',
		interestRateBps: 300,
		interestFrequency: 'monthly',
	});

	let transactions = await listTransactions(db);
	const first = await accrueInterest(db, [account], transactions, '2026-11-02');
	assert.deepEqual(first, { created: 2, updated: 0, removed: 0 });

	transactions = await listTransactions(db);
	assert.equal(transactions.length, 2);
	assert.equal(methodBalance(account, transactions, '2026-11-02'), 10_050_063);
	assert.equal(methodSnapshot(account, transactions, '2026-11-02').totalCents, 10_050_063);

	const second = await accrueInterest(db, [account], transactions, '2026-11-02');
	assert.deepEqual(second, { created: 0, updated: 0, removed: 0 });

	const zeroRate = await savePaymentMethod(db, { ...account, interestRateBps: 0 });
	const third = await accrueInterest(db, [zeroRate], transactions, '2026-11-02');
	assert.equal(third.removed, 2);
	assert.equal((await listTransactions(db)).length, 0);
});

test('a logged expense reduces the pending interest base', () => {
	const account = method({
		id: 4,
		openingBalanceCents: 5_000_000,
		openingDate: '2026-11-01',
		interestRateBps: 325,
		interestFrequency: 'daily',
	});
	const withoutSpend = buildInterestPlan(account, [], '2026-11-03').pendingCents;
	const withSpend = buildInterestPlan(
		account,
		[{ type: 'expense', date: '2026-11-02', amountCents: 1_000_000, paymentMethodId: 4 }],
		'2026-11-03'
	).pendingCents;
	assert.ok(withSpend < withoutSpend);
	assert.ok(withSpend > 0);
});

test('goal transfers move money between a method and a goal', async () => {
	const db = createMemoryBackend();
	const account = await savePaymentMethod(db, {
		label: 'GCash',
		kind: 'ewallet',
		openingBalanceCents: 100_000,
		openingDate: '2026-11-01',
	});
	const goal = await saveGoal(db, { name: 'Emergency fund', targetCents: 50_000 });

	await saveGoalTransfer(db, {
		goalId: goal.id,
		paymentMethodId: account.id,
		amountCents: 10_000,
		date: '2026-11-12',
		direction: 'to_goal',
	});
	let transactions = await listTransactions(db);
	assert.equal(goalSavedCents(goal.id, transactions), 10_000);
	assert.equal(methodBalance(account, transactions, '2026-11-12'), 90_000);
	assert.equal(goalSnapshot(goal, transactions, '2026-11-12').progress, 20);

	await assert.rejects(
		() =>
			saveGoalTransfer(db, {
				goalId: goal.id,
				paymentMethodId: account.id,
				amountCents: 500_000,
				date: '2026-11-12',
				direction: 'to_goal',
			}),
		/more than the available balance/
	);
	await assert.rejects(
		() =>
			saveGoalTransfer(db, {
				goalId: goal.id,
				paymentMethodId: account.id,
				amountCents: 20_000,
				date: '2026-11-12',
				direction: 'from_goal',
			}),
		/more than this goal has saved/
	);

	await saveGoalTransfer(db, {
		goalId: goal.id,
		paymentMethodId: account.id,
		amountCents: 4_000,
		date: '2026-11-12',
		direction: 'from_goal',
	});
	transactions = await listTransactions(db);
	assert.equal(goalSavedCents(goal.id, transactions), 6_000);
	assert.equal(methodBalance(account, transactions, '2026-11-12'), 94_000);

	await deleteGoal(db, goal.id);
	transactions = await listTransactions(db);
	assert.equal(goalSavedCents(goal.id, transactions), 0);
	assert.equal(methodBalance(account, transactions, '2026-11-12'), 100_000);
});

test('goal snapshots flag an unreachable deadline and quantify the shortfall', () => {
	const goal = {
		id: 1,
		name: 'Japan trip',
		targetCents: 5_000_000,
		deadline: '2027-06-30',
		color: 'teal',
	};
	const transactions = [
		{
			type: 'goal_deposit',
			date: '2026-11-12',
			amountCents: 1_000_000,
			goalId: 1,
			paymentMethodId: 1,
		},
	];
	const snapshot = goalSnapshot(goal, transactions, '2026-11-12');
	assert.equal(snapshot.savedCents, 1_000_000);
	assert.equal(snapshot.remainingCents, 4_000_000);
	assert.equal(snapshot.averageMonthlyCents, 333_333);
	assert.equal(snapshot.feasible, false);
	assert.ok(snapshot.requiredMonthlyCents > snapshot.averageMonthlyCents);
	assert.equal(snapshot.shortfallCents, snapshot.requiredMonthlyCents - snapshot.averageMonthlyCents);
});

test('range presets resolve month boundaries and custom order', () => {
	assert.deepEqual(rangeForPreset('last_month', '2026-01-15'), {
		from: '2025-12-01',
		to: '2025-12-31',
		preset: 'last_month',
	});
	assert.deepEqual(rangeForPreset('last_7', '2026-11-12'), {
		from: '2026-11-06',
		to: '2026-11-12',
		preset: 'last_7',
	});
	assert.deepEqual(
		rangeForPreset('custom', '2026-11-12', { from: '2026-11-10', to: '2026-11-02' }),
		{ from: '2026-11-02', to: '2026-11-10', preset: 'custom' }
	);
	assert.equal(rangeForPreset('this_month', '2026-11-12').from, '2026-11-01');
});

test('period summaries split categories, methods, and net cash flow', () => {
	const transactions = [
		{ type: 'expense', date: '2026-11-01', amountCents: 10_000, category: 'food', paymentMethodId: 1, merchant: 'A' },
		{ type: 'expense', date: '2026-11-02', amountCents: 20_000, category: 'food', paymentMethodId: 2, merchant: 'B' },
		{ type: 'expense', date: '2026-11-03', amountCents: 5_000, category: 'transport', paymentMethodId: 1, merchant: 'C' },
		{ type: 'income', date: '2026-11-03', amountCents: 100_000, category: 'income', paymentMethodId: 1, merchant: 'Salary' },
		{ type: 'interest', date: '2026-11-03', amountCents: 500, paymentMethodId: 1, auto: true },
		{ type: 'goal_deposit', date: '2026-11-04', amountCents: 1_000, paymentMethodId: 1, goalId: 1 },
		{ type: 'expense', date: '2026-12-01', amountCents: 99_999, category: 'food', paymentMethodId: 1 },
	];
	const summary = summarizePeriod(transactions, { from: '2026-11-01', to: '2026-11-30' });
	assert.equal(summary.expenseCents, 35_000);
	assert.equal(summary.count, 3);
	assert.equal(summary.incomeCents, 100_000);
	assert.equal(summary.incomeCount, 1);
	assert.equal(summary.interestCents, 500);
	assert.equal(summary.netCents, 65_500);
	assert.equal(summary.categories[0].key, 'food');
	assert.equal(summary.categories[0].amountCents, 30_000);
	assert.equal(summary.categories[1].key, 'transport');
	assert.equal(summary.methodTotals.length, 2);
	assert.equal(summary.topMerchant.merchant, 'B');
	assert.equal(summary.rows.length, 6);
});

test('total balance includes pending interest', () => {
	const methods = [
		method({ id: 1, openingBalanceCents: 1_000_000 }),
		method({
			id: 2,
			openingBalanceCents: 5_000_000,
			interestRateBps: 325,
			interestFrequency: 'daily',
		}),
	];
	assert.ok(totalBalance(methods, [], '2026-11-02') > 6_000_000);
	assert.equal(totalBalance([], [], '2026-11-02'), 0);
});

test('deleting a payment method keeps the spend history and clears its reference', async () => {
	const db = createMemoryBackend();
	const account = await savePaymentMethod(db, {
		label: 'Maya',
		kind: 'ewallet',
		openingBalanceCents: 10_000,
		openingDate: '2026-11-01',
	});
	await saveExpense(db, {
		date: '2026-11-12',
		merchant: 'Lunch',
		category: 'food',
		amountCents: 2_500,
		paymentMethodId: account.id,
	});
	assert.equal(methodBalance(account, await listTransactions(db), '2026-11-12'), 7_500);

	await deletePaymentMethod(db, account.id);
	const [row] = await listTransactions(db);
	assert.equal(row.paymentMethodId, null);
	assert.equal((await listPaymentMethods(db)).length, 0);
});
