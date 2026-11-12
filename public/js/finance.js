// Money math for the expense tracker: payment-method balances, interest
// accrual, goal progress, and period summaries. Everything here is pure and
// deterministic so it can be tested without a browser.

import { addDays, isValidIsoDate, todayInTz } from './lib/dates.js';
import { EXPENSE_CATEGORIES, categoryInfo } from './lib/categories.js';

export const TRANSACTION_TYPES = ['expense', 'income', 'interest', 'goal_deposit', 'goal_withdrawal'];
export const INTEREST_FREQUENCIES = ['none', 'daily', 'monthly'];
export const INTEREST_FREQUENCY_LABELS = {
	none: 'No interest',
	daily: 'Daily compounding',
	monthly: 'Monthly compounding',
};

const DAY_MS = 86_400_000;
const MAX_ACCRUAL_DAYS = 20_000;

export function localIsoToday() {
	return todayInTz('UTC');
}

export function isDate(value) {
	return isValidIsoDate(value);
}

function integer(value, fallback = 0) {
	const number = typeof value === 'string' && value.trim() ? Number(value) : value;
	return Number.isInteger(number) ? number : fallback;
}

export function transactionSignedCents(transaction) {
	const amount = integer(transaction?.amountCents);
	switch (transaction?.type) {
		case 'income':
		case 'interest':
		case 'goal_withdrawal':
			return amount;
		case 'expense':
		case 'goal_deposit':
			return -amount;
		default:
			return 0;
	}
}

export function methodOpeningCents(method) {
	const value = integer(method?.openingBalanceCents);
	return value > 0 ? value : 0;
}

export function methodOpeningDate(method) {
	if (isDate(method?.openingDate)) return method.openingDate;
	const created = String(method?.createdAt || '').slice(0, 10);
	return isDate(created) ? created : null;
}

// Balance of one payment method through a date. Interest entries that the
// accrual pass persisted are ordinary ledger rows, so they are included here.
export function methodBalance(method, transactions, through = null) {
	const id = Number(method?.id);
	if (!Number.isInteger(id)) return 0;
	const openingDate = methodOpeningDate(method);
	let balance = methodOpeningCents(method);
	for (const transaction of Array.isArray(transactions) ? transactions : []) {
		if (Number(transaction?.paymentMethodId) !== id) continue;
		if (!isDate(transaction?.date)) continue;
		if (openingDate && transaction.date < openingDate) continue;
		if (through && transaction.date > through) continue;
		balance += transactionSignedCents(transaction);
	}
	return balance;
}

function lastDayOfMonth(iso) {
	const [year, month] = iso.split('-').map(Number);
	return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function monthKey(iso) {
	return iso.slice(0, 7);
}

function addMonthsIso(iso, months) {
	if (!isDate(iso)) return null;
	const [year, month, day] = iso.split('-').map(Number);
	const target = month - 1 + Number(months);
	const ty = year + Math.floor(target / 12);
	const tm = ((target % 12) + 12) % 12;
	const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
	return new Date(Date.UTC(ty, tm, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

// Completed months are persisted as one interest transaction each. The current
// month's daily interest is returned as `pendingCents` and added to the card
// balance at render time, so no partial rows are ever written.
export function buildInterestPlan(method, transactions, today = localIsoToday()) {
	const empty = { entries: [], pendingCents: 0 };
	const rate = integer(method?.interestRateBps);
	const frequency = INTEREST_FREQUENCIES.includes(method?.interestFrequency)
		? method.interestFrequency
		: 'none';
	if (frequency === 'none' || rate <= 0) return empty;

	const start = methodOpeningDate(method);
	if (!start || !isDate(today) || start > today) return empty;

	const id = Number(method?.id);
	const opening = methodOpeningCents(method);
	const nonAuto = (Array.isArray(transactions) ? transactions : [])
		.filter(
			(transaction) =>
				Number(transaction?.paymentMethodId) === id &&
				!transaction?.auto &&
				isDate(transaction?.date) &&
				transaction.date >= start &&
				transaction.date <= today
		)
		.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id || 0) - (b.id || 0)));

	const currentMonth = monthKey(today);
	const currentMonthClosed = today === lastDayOfMonth(today);
	const months = new Map();
	let balance = opening;
	let index = 0;
	let pending = 0;
	let days = 0;

	for (let day = start; day <= today; day = addDays(day, 1)) {
		days += 1;
		if (days > MAX_ACCRUAL_DAYS) break;
		while (index < nonAuto.length && nonAuto[index].date < day) {
			balance += transactionSignedCents(nonAuto[index]);
			index += 1;
		}

		const base = Math.max(0, balance);
		let interest = 0;
		if (frequency === 'daily') {
			interest = Math.round((base * rate) / 3_650_000);
		} else if (frequency === 'monthly' && day === lastDayOfMonth(day)) {
			interest = Math.round((base * rate) / 120_000);
		}
		if (interest <= 0) continue;

		balance += interest;
		const key = monthKey(day);
		const monthComplete = key < currentMonth || currentMonthClosed;
		if (key === currentMonth && !monthComplete) {
			pending += interest;
			continue;
		}

		const entry = months.get(key) || { amountCents: 0, date: day };
		entry.amountCents += interest;
		entry.date = day;
		months.set(key, entry);
	}

	const entries = [...months.entries()]
		.map(([key, entry]) => ({
			key: `interest:${id}:${key}`,
			date: entry.date,
			amountCents: entry.amountCents,
		}))
		.sort((a, b) => (a.date < b.date ? -1 : 1));

	return { entries, pendingCents: pending };
}

export function pendingInterest(method, transactions, today = localIsoToday()) {
	return buildInterestPlan(method, transactions, today).pendingCents;
}

export function interestEarnedCents(method, transactions, today = localIsoToday()) {
	const id = Number(method?.id);
	const persisted = (Array.isArray(transactions) ? transactions : []).reduce((sum, transaction) => {
		if (Number(transaction?.paymentMethodId) !== id) return sum;
		if (transaction?.type !== 'interest' || !transaction.auto) return sum;
		if (isDate(transaction.date) && transaction.date > today) return sum;
		return sum + integer(transaction.amountCents);
	}, 0);
	return persisted + pendingInterest(method, transactions, today);
}

export function methodSnapshot(method, transactions, today = localIsoToday()) {
	const balanceCents = methodBalance(method, transactions, today);
	const plan = buildInterestPlan(method, transactions, today);
	const interest = interestEarnedCents(method, transactions, today);
	return {
		method,
		balanceCents,
		pendingCents: plan.pendingCents,
		totalCents: balanceCents + plan.pendingCents,
		interestEarnedCents: interest,
	};
}

export function totalBalance(methods, transactions, today = localIsoToday()) {
	return (Array.isArray(methods) ? methods : []).reduce(
		(sum, method) => sum + methodSnapshot(method, transactions, today).totalCents,
		0
	);
}

// Writes/updates the auto interest rows for every method and removes stale
// ones. Idempotent: rerunning with the same inputs changes nothing.
export async function accrueInterest(db, methods, transactions, today = localIsoToday(), now = new Date()) {
	const stamp = now.toISOString();
	const rows = Array.isArray(transactions) ? transactions : [];
	let created = 0;
	let updated = 0;
	let removed = 0;

	for (const method of Array.isArray(methods) ? methods : []) {
		const plan = buildInterestPlan(method, rows, today);
		const wanted = new Map(plan.entries.map((entry) => [entry.key, entry]));
		const existing = rows.filter(
			(transaction) =>
				transaction?.auto &&
				transaction?.type === 'interest' &&
				Number(transaction.paymentMethodId) === Number(method.id)
		);
		const seen = new Set();

		for (const transaction of existing) {
			seen.add(transaction.autoKey);
			if (!wanted.has(transaction.autoKey)) {
				await db.delete('transactions', transaction.id);
				removed += 1;
			}
		}

		for (const entry of plan.entries) {
			const previous = existing.find((transaction) => transaction.autoKey === entry.key);
			if (!previous) {
				await db.put('transactions', {
					type: 'interest',
					date: entry.date,
					amountCents: entry.amountCents,
					paymentMethodId: Number(method.id),
					goalId: null,
					category: 'interest',
					merchant: 'Interest earned',
					notes: '',
					auto: true,
					autoKey: entry.key,
					createdAt: stamp,
					updatedAt: stamp,
				});
				created += 1;
			} else if (previous.amountCents !== entry.amountCents || previous.date !== entry.date) {
				await db.put('transactions', {
					...previous,
					date: entry.date,
					amountCents: entry.amountCents,
					updatedAt: stamp,
				});
				updated += 1;
			}
		}
	}

	return { created, updated, removed };
}

export function goalSavedCents(goalId, transactions) {
	const id = Number(goalId);
	return (Array.isArray(transactions) ? transactions : []).reduce((sum, transaction) => {
		if (Number(transaction?.goalId) !== id) return sum;
		if (transaction?.type === 'goal_deposit') return sum + integer(transaction.amountCents);
		if (transaction?.type === 'goal_withdrawal') return sum - integer(transaction.amountCents);
		return sum;
	}, 0);
}

function monthsBetween(fromIso, toIso) {
	const from = Date.parse(`${fromIso}T00:00:00Z`);
	const to = Date.parse(`${toIso}T00:00:00Z`);
	if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
	return Math.max(0, Math.ceil((to - from) / (DAY_MS * 30.4375)));
}

export function goalSnapshot(goal, transactions, today = localIsoToday()) {
	const targetCents = Math.max(0, integer(goal?.targetCents));
	const savedCents = Math.max(0, goalSavedCents(goal?.id, transactions));
	const remainingCents = Math.max(0, targetCents - savedCents);
	const progress = targetCents > 0 ? Math.min(100, (savedCents / targetCents) * 100) : 0;
	const contributions = (Array.isArray(transactions) ? transactions : []).filter((transaction) => {
		if (Number(transaction?.goalId) !== Number(goal?.id)) return false;
		if (transaction?.type !== 'goal_deposit') return false;
		if (!isDate(transaction.date)) return false;
		return transaction.date <= today && transaction.date >= addDays(today, -89);
	});
	const contributed90 = contributions.reduce((sum, transaction) => sum + integer(transaction.amountCents), 0);
	const averageMonthlyCents = Math.round(contributed90 / 3);
	const deadline = isDate(goal?.deadline) ? goal.deadline : null;
	const monthsLeft = deadline ? Math.max(1, monthsBetween(today, deadline)) : null;
	const requiredMonthlyCents = monthsLeft ? Math.ceil(remainingCents / monthsLeft) : 0;
	const monthsToTarget = averageMonthlyCents > 0 ? Math.ceil(remainingCents / averageMonthlyCents) : null;
	const projectedDate = monthsToTarget !== null ? addMonthsIso(today, monthsToTarget) : null;
	const feasible = deadline
		? averageMonthlyCents >= requiredMonthlyCents && remainingCents >= 0
		: averageMonthlyCents > 0;
	const shortfallCents = deadline ? Math.max(0, requiredMonthlyCents - averageMonthlyCents) : 0;

	return {
		goal,
		targetCents,
		savedCents,
		remainingCents,
		progress,
		averageMonthlyCents,
		monthsLeft,
		requiredMonthlyCents,
		monthsToTarget,
		projectedDate,
		feasible,
		shortfallCents,
		complete: remainingCents === 0,
	};
}

export function goalSnapshots(goals, transactions, today = localIsoToday()) {
	return (Array.isArray(goals) ? goals : []).map((goal) => goalSnapshot(goal, transactions, today));
}

export function monthRange(today = localIsoToday()) {
	const iso = isDate(today) ? today : localIsoToday();
	return { from: `${iso.slice(0, 7)}-01`, to: iso, preset: 'this_month' };
}

export function lastMonthRange(today = localIsoToday()) {
	const iso = isDate(today) ? today : localIsoToday();
	const first = `${iso.slice(0, 7)}-01`;
	const previousEnd = addDays(first, -1);
	return { from: `${previousEnd.slice(0, 7)}-01`, to: previousEnd, preset: 'last_month' };
}

export function rangeForPreset(preset, today = localIsoToday(), custom = {}) {
	const iso = isDate(today) ? today : localIsoToday();
	switch (preset) {
		case 'today':
			return { from: iso, to: iso, preset };
		case 'last_7':
			return { from: addDays(iso, -6), to: iso, preset };
		case 'last_30':
			return { from: addDays(iso, -29), to: iso, preset };
		case 'last_month':
			return lastMonthRange(iso);
		case 'this_year':
			return { from: `${iso.slice(0, 4)}-01-01`, to: iso, preset };
		case 'all':
			return { from: '1970-01-01', to: iso, preset };
		case 'custom': {
			const from = isDate(custom.from) ? custom.from : `${iso.slice(0, 7)}-01`;
			const to = isDate(custom.to) ? custom.to : iso;
			return from <= to ? { from, to, preset } : { from: to, to: from, preset };
		}
		default:
			return monthRange(iso);
	}
}

export const RANGE_PRESETS = [
	['this_month', 'This month'],
	['last_month', 'Last month'],
	['last_7', 'Last 7 days'],
	['last_30', 'Last 30 days'],
	['this_year', 'This year'],
	['all', 'All time'],
	['custom', 'Custom range'],
];

export function inRange(transaction, from, to) {
	if (!transaction || !isDate(transaction.date)) return false;
	if (from && transaction.date < from) return false;
	if (to && transaction.date > to) return false;
	return true;
}

export function sortTransactions(transactions) {
	return [...(Array.isArray(transactions) ? transactions : [])].sort((a, b) => {
		if (a.date !== b.date) return a.date < b.date ? 1 : -1;
		return (b.id || 0) - (a.id || 0);
	});
}

export function summarizePeriod(transactions, { from, to } = {}) {
	const rows = (Array.isArray(transactions) ? transactions : []).filter((transaction) =>
		inRange(transaction, from, to)
	);
	const categories = new Map();
	const methods = new Map();
	const days = new Map();
	let expenseCents = 0;
	let incomeCents = 0;
	let interestCents = 0;
	let goalDepositCents = 0;
	let goalWithdrawalCents = 0;
	let largest = null;

	for (const transaction of rows) {
		const amount = Math.max(0, integer(transaction.amountCents));
		if (transaction.type === 'expense') {
			expenseCents += amount;
			const key = categoryInfo(transaction.category).key;
			const entry = categories.get(key) || {
				key,
				label: categoryInfo(key).label,
				color: categoryInfo(key).color,
				amountCents: 0,
				count: 0,
			};
			entry.amountCents += amount;
			entry.count += 1;
			categories.set(key, entry);

			const methodId = transaction.paymentMethodId ?? null;
			methods.set(methodId, (methods.get(methodId) || 0) + amount);
			days.set(transaction.date, (days.get(transaction.date) || 0) + amount);

			if (!largest || amount > largest.amountCents) largest = transaction;
		} else if (transaction.type === 'income') {
			incomeCents += amount;
		} else if (transaction.type === 'interest') {
			interestCents += amount;
		} else if (transaction.type === 'goal_deposit') {
			goalDepositCents += amount;
		} else if (transaction.type === 'goal_withdrawal') {
			goalWithdrawalCents += amount;
		}
	}

	const categoryRows = [...categories.values()]
		.map((entry) => ({
			...entry,
			share: expenseCents > 0 ? (entry.amountCents / expenseCents) * 100 : 0,
		}))
		.sort((a, b) => b.amountCents - a.amountCents);

	const merchants = new Map();
	for (const transaction of rows) {
		if (transaction.type !== 'expense') continue;
		const key = String(transaction.merchant || 'Unknown').trim();
		merchants.set(key, (merchants.get(key) || 0) + Math.max(0, integer(transaction.amountCents)));
	}
	const topMerchant = [...merchants.entries()].sort((a, b) => b[1] - a[1])[0] || null;

	return {
		from: from || null,
		to: to || null,
		rows: sortTransactions(rows),
		count: rows.filter((transaction) => transaction.type === 'expense').length,
		expenseCents,
		incomeCents,
		interestCents,
		goalDepositCents,
		goalWithdrawalCents,
		netCents: incomeCents + interestCents - expenseCents,
		categories: categoryRows,
		methodTotals: [...methods.entries()].map(([paymentMethodId, amountCents]) => ({
			paymentMethodId,
			amountCents,
		})),
		daily: [...days.entries()]
			.sort((a, b) => (a[0] < b[0] ? -1 : 1))
			.map(([date, amountCents]) => ({ date, amountCents })),
		largest,
		topMerchant: topMerchant ? { merchant: topMerchant[0], amountCents: topMerchant[1] } : null,
	};
}

export function dailySeries(transactions, from, to) {
	const byDate = new Map();
	for (const transaction of Array.isArray(transactions) ? transactions : []) {
		if (transaction?.type !== 'expense') continue;
		if (!inRange(transaction, from, to)) continue;
		byDate.set(transaction.date, (byDate.get(transaction.date) || 0) + Math.max(0, integer(transaction.amountCents)));
	}
	const series = [];
	for (let day = from; day <= to; day = addDays(day, 1)) {
		series.push({ date: day, amountCents: byDate.get(day) || 0 });
	}
	return series;
}

export function recentTransactions(transactions, limit = 6) {
	return sortTransactions(transactions).slice(0, Math.max(0, limit));
}

export function averageDailySpend(transactions, today = localIsoToday(), days = 30) {
	const from = addDays(today, -(Math.max(1, days) - 1));
	const summary = summarizePeriod(transactions, { from, to: today });
	return summary.expenseCents / Math.max(1, days);
}

export function expenseCategoriesWithTotals(summary) {
	const totals = new Map(summary.categories.map((entry) => [entry.key, entry]));
	return EXPENSE_CATEGORIES.map((category) => ({
		...category,
		amountCents: totals.get(category.key)?.amountCents || 0,
		count: totals.get(category.key)?.count || 0,
		share: totals.get(category.key)?.share || 0,
	}));
}
