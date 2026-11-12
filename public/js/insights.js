// Deterministic on-device analyst. No network calls, no telemetry, no model
// downloads, and no persisted chat: every answer is computed from the local
// ledger for the current question. Forecasts are simple moving averages and a
// least-squares trend, which is honest about what the data can support.

import { addDays, formatMoney, isValidIsoDate } from './lib/dates.js';
import { detectCategory, categoryLabel } from './lib/categories.js';
import {
	goalSnapshots,
	lastMonthRange,
	methodSnapshot,
	monthRange,
	rangeForPreset,
	summarizePeriod,
	totalBalance,
} from './finance.js';
import { summarize as summarizeSubscriptions } from './store.js';

export const SUGGESTED_PROMPTS = [
	'How much did I spend this month?',
	'Where is most of my money going?',
	'Will I reach my goals?',
	'Forecast my spending',
	'How can I save more?',
	'How much interest am I earning?',
];

const MONTHS = {
	january: 1, jan: 1,
	february: 2, feb: 2,
	march: 3, mar: 3,
	april: 4, apr: 4,
	may: 5,
	june: 6, jun: 6,
	july: 7, jul: 7,
	august: 8, aug: 8,
	september: 9, sep: 9, sept: 9,
	october: 10, oct: 10,
	november: 11, nov: 11,
	december: 12, dec: 12,
};

function money(cents) {
	return formatMoney(cents, 'PHP');
}

function daysInMonth(iso) {
	const [year, month] = iso.split('-').map(Number);
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function percent(value) {
	if (!Number.isFinite(value)) return 'n/a';
	return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function linearTrend(series) {
	if (series.length < 2) return 0;
	const n = series.length;
	const meanX = (n - 1) / 2;
	const meanY = series.reduce((sum, point) => sum + point.amountCents, 0) / n;
	let numerator = 0;
	let denominator = 0;
	for (let index = 0; index < n; index += 1) {
		numerator += (index - meanX) * (series[index].amountCents - meanY);
		denominator += (index - meanX) ** 2;
	}
	return denominator === 0 ? 0 : numerator / denominator;
}

export function buildInsights({ transactions, methods, goals, subscriptions, today, settings }) {
	const iso = isValidIsoDate(today) ? today : new Date().toISOString().slice(0, 10);
	const month = summarizePeriod(transactions, monthRange(iso));
	const lastMonth = summarizePeriod(transactions, lastMonthRange(iso));
	const last30 = summarizePeriod(transactions, rangeForPreset('last_30', iso));
	const previous30 = summarizePeriod(transactions, {
		from: addDays(iso, -59),
		to: addDays(iso, -30),
	});
	const dailyAvgCents = last30.expenseCents / 30;
	const remainingDays = Math.max(0, daysInMonth(iso) - Number(iso.slice(8, 10)));
	const projectedMonthCents = Math.round(month.expenseCents + dailyAvgCents * remainingDays);
	const changePct =
		lastMonth.expenseCents > 0
			? ((month.expenseCents - lastMonth.expenseCents) / lastMonth.expenseCents) * 100
			: null;
	const trendCentsPerDay = Math.round(linearTrend(last30.daily));
	const trendAdjustedDaily = Math.max(0, dailyAvgCents + trendCentsPerDay * 7);
	const forecastDaily =
		dailyAvgCents > 0 ? Math.max(dailyAvgCents * 0.5, trendAdjustedDaily) : 0;

	const subscriptionSummary = summarizeSubscriptions(subscriptions || [], {
		today: iso,
		reminderDays: settings?.reminderDays || [7, 3, 1],
	});
	const goalRows = goalSnapshots(goals || [], transactions, iso);
	const methodRows = (methods || []).map((method) => ({
		...methodSnapshot(method, transactions, iso),
		label: method.label,
	}));
	const pendingInterestCents = methodRows.reduce((sum, row) => sum + row.pendingCents, 0);
	const earnedInterestCents = methodRows.reduce((sum, row) => sum + row.interestEarnedCents, 0);
	const balanceCents = totalBalance(methods || [], transactions, iso);
	const topCategory = month.categories[0] || null;
	const topMerchant = month.topMerchant;
	const spendShare = (category) =>
		month.expenseCents > 0 ? (category.amountCents / month.expenseCents) * 100 : 0;

	const tips = [];
	if (!month.count) {
		tips.push({
			tone: 'info',
			title: 'Start with one expense today',
			body: 'Log a purchase or bill on the Expenses tab. After a few days this page can compare weeks, forecast month-end spending, and check your goals.',
		});
	}
	if (changePct !== null && changePct > 15) {
		tips.push({
			tone: 'warn',
			title: `Spending is up ${percent(changePct)} versus last month`,
			body: topCategory
				? `${topCategory.label} is the biggest driver at ${money(topCategory.amountCents)}. Trimming that category by 20% would save about ${money(
						Math.round(topCategory.amountCents * 0.2)
					)} this month.`
				: 'Review the largest entries in the Expenses tab before the month ends.',
		});
	}
	if (topCategory && spendShare(topCategory) > 35) {
		tips.push({
			tone: 'info',
			title: `${topCategory.label} is ${Math.round(spendShare(topCategory))}% of this month`,
			body: `A soft cap of ${money(
				Math.round(topCategory.amountCents * 0.8)
			)} for ${topCategory.label.toLowerCase()} would keep the rest of the month on track.`,
		});
	}
	if (subscriptionSummary.monthlyCents > 0 && dailyAvgCents > 0) {
		const monthlySpend = dailyAvgCents * 30;
		const share = monthlySpend > 0 ? (subscriptionSummary.monthlyCents / monthlySpend) * 100 : 0;
		if (share >= 12) {
			tips.push({
				tone: 'info',
				title: 'Subscriptions are a visible slice of your month',
				body: `${money(subscriptionSummary.monthlyCents)} per month is about ${Math.round(
					share
				)}% of your recent spending. Cancel or pause one you no longer use to free that amount for goals.`,
			});
		}
	}
	const infeasible = goalRows.filter((goal) => goal.goal.deadline && !goal.feasible && !goal.complete);
	if (infeasible.length) {
		const goal = infeasible[0];
		const cutCategory = topCategory?.key || 'other';
		tips.push({
			tone: 'warn',
			title: `${goal.goal.name} needs ${money(goal.requiredMonthlyCents)} a month`,
			body: `You are averaging ${money(goal.averageMonthlyCents)} toward it. Cutting ${money(
				goal.shortfallCents
			)} a month from ${categoryLabel(cutCategory).toLowerCase()} would close the gap by ${goal.goal.deadline}.`,
		});
	}
	if (pendingInterestCents > 0) {
		tips.push({
			tone: 'ok',
			title: 'Interest is already working for you',
			body: `${money(pendingInterestCents)} has accrued this month and will be posted automatically. It is included in your card balances.`,
		});
	}
	if (tips.length < 2 && dailyAvgCents > 0) {
		tips.push({
			tone: 'info',
			title: 'Your current pace',
			body: `At ${money(Math.round(dailyAvgCents))} a day, this month projects to ${money(
				projectedMonthCents
			)}. The next 30 days are forecast at about ${money(Math.round(dailyAvgCents * 30))}.`,
		});
	}

	const last30Series = last30.daily;
	const forecastSeries = [];
	for (let index = 29; index >= 0; index -= 1) {
		const date = addDays(iso, -index);
		const actual = last30Series.find((point) => point.date === date)?.amountCents || 0;
		forecastSeries.push({ date, amountCents: actual, projected: false });
	}
	for (let index = 1; index <= 30; index += 1) {
		forecastSeries.push({
			date: addDays(iso, index),
			amountCents: Math.round(forecastDaily),
			projected: true,
		});
	}

	return {
		today: iso,
		month,
		lastMonth,
		last30,
		dailyAvgCents,
		projectedMonthCents,
		changePct,
		trendCentsPerDay,
		topCategory,
		topMerchant,
		subscriptionSummary,
		subscriptionMonthlyCents: subscriptionSummary.monthlyCents,
		goalRows,
		methodRows,
		balanceCents,
		pendingInterestCents,
		earnedInterestCents,
		tips: tips.slice(0, 5),
		forecast: {
			next30Cents: Math.round(forecastDaily * 30),
			monthEndCents: projectedMonthCents,
			series: forecastSeries,
			trendCentsPerDay,
		},
	};
}

function periodFromQuestion(question, today) {
	const text = question.toLowerCase();
	let match = text.match(/last\s+(\d+)\s+days?/);
	if (match) {
		const days = Math.min(3650, Math.max(1, Number(match[1])));
		return { label: `the last ${days} days`, ...rangeForPreset('custom', today, { from: addDays(today, -(days - 1)), to: today }) };
	}
	if (/\byesterday\b/.test(text)) {
		const date = addDays(today, -1);
		return { label: 'yesterday', from: date, to: date };
	}
	if (/\btoday\b/.test(text)) return { label: 'today', ...rangeForPreset('today', today) };
	if (/\blast\s+month\b/.test(text)) return { label: 'last month', ...lastMonthRange(today) };
	if (/\b(this|current)\s+month\b/.test(text) || /\bmonth\s+to\s+date\b/.test(text)) {
		return { label: 'this month', ...monthRange(today) };
	}
	if (/\blast\s+week\b/.test(text)) return { label: 'the last 7 days', ...rangeForPreset('last_7', today) };
	if (/\bthis\s+week\b/.test(text)) return { label: 'the last 7 days', ...rangeForPreset('last_7', today) };
	if (/\blast\s+year\b/.test(text)) {
		const year = Number(today.slice(0, 4)) - 1;
		return { label: `${year}`, from: `${year}-01-01`, to: `${year}-12-31` };
	}
	if (/\bthis\s+year\b/.test(text)) return { label: 'this year', ...rangeForPreset('this_year', today) };
	if (/\ball\s+time\b/.test(text) || /\bever\b/.test(text)) {
		return { label: 'all time', ...rangeForPreset('all', today) };
	}
	const monthMatch = text.match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\b/);
	if (monthMatch) {
		const month = MONTHS[monthMatch[1]];
		const currentYear = Number(today.slice(0, 4));
		const currentMonth = Number(today.slice(5, 7));
		const year = month > currentMonth ? currentYear - 1 : currentYear;
		const from = `${year}-${String(month).padStart(2, '0')}-01`;
		const to = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(from)).padStart(2, '0')}`;
		return { label: `${from.slice(0, 7)}`, from, to };
	}
	return { label: 'this month', ...monthRange(today) };
}

function categoryBreakdown(summary) {
	if (!summary.categories.length) return 'No expenses in that range.';
	return summary.categories
		.slice(0, 4)
		.map(
			(category) =>
				`- ${category.label}: ${money(category.amountCents)} (${Math.round(category.share)}%)`
		)
		.join('\n');
}

function methodBalances(context) {
	const rows = (context.methods || []).map((method) => {
		const snapshot = methodSnapshot(method, context.transactions, context.today);
		return { label: method.label, total: snapshot.totalCents, pending: snapshot.pendingCents };
	});
	if (!rows.length) return 'No payment methods yet. Add one on the Payment methods page.';
	const total = rows.reduce((sum, row) => sum + row.total, 0);
	return [
		`Total available: ${money(total)}.`,
		...rows
			.sort((a, b) => b.total - a.total)
			.map(
				(row) =>
					`- ${row.label}: ${money(row.total)}${row.pending > 0 ? ` (includes ${money(row.pending)} pending interest)` : ''}`
			),
	].join('\n');
}

export function answerQuestion(question, context) {
	const raw = String(question || '').trim();
	if (!raw) return 'Ask me about your spending, balances, goals, interest, or what the rest of the month might look like.';
	const text = raw.toLowerCase();
	const today = context.today;
	const insights = context.insights;

	if (/^(hi|hello|hey|kumusta|kamusta)\b/.test(text)) {
		return 'Hi. I can read only the Renewly data on this device: spending, balances, goals, subscriptions, and interest. Nothing is sent anywhere. What do you want to check?';
	}
	if (/\b(help|what can you|capab|how do i use)\b/.test(text)) {
		return [
			'Ask about:',
			'- spending for a period, category, or merchant',
			'- balances on your cards and wallets',
			'- goal progress and whether the deadline is realistic',
			'- interest earned or still accruing',
			'- a forecast for the rest of the month',
			'- where to cut back',
		].join('\n');
	}
	if (/\b(balance|how much money|available|left on)\b/.test(text) && !/\bspend|spent\b/.test(text)) {
		return methodBalances(context);
	}
	if (/\b(interest|apr|per annum)\b/.test(text)) {
		const rows = (context.methods || []).filter((method) => method.interestFrequency && method.interestFrequency !== 'none');
		if (!rows.length) {
			return 'No payment method has interest enabled yet. Open Payment methods, edit a card, and set the annual rate plus daily or monthly compounding.';
		}
		return [
			`Interest earned so far: ${money(insights.earnedInterestCents)}.`,
			`Accruing this month: ${money(insights.pendingInterestCents)}.`,
			...rows.map((method) => {
				const snapshot = methodSnapshot(method, context.transactions, today);
				return `- ${method.label}: ${(method.interestRateBps / 100).toFixed(2)}% p.a., ${method.interestFrequency} compounding, ${money(
					snapshot.interestEarnedCents
				)} earned`;
			}),
		].join('\n');
	}
	if (/\b(goals?|targets?|save up|saving for)\b/.test(text)) {
		if (!insights.goalRows.length) return 'No goals yet. Create one on the Goals tab, then transfer money from any card or wallet to fund it.';
		return insights.goalRows
			.map((row) => {
				const goal = row.goal;
				if (row.complete) return `- ${goal.name}: complete. ${money(row.savedCents)} saved.`;
				const pace = row.averageMonthlyCents
					? `averaging ${money(row.averageMonthlyCents)}/month`
					: 'no contributions in the last 3 months';
				const deadline = goal.deadline
					? `, deadline ${goal.deadline} needs ${money(row.requiredMonthlyCents)}/month`
					: '';
				const verdict = goal.deadline
					? row.feasible
						? ' On track.'
						: ` Short by about ${money(row.shortfallCents)}/month.`
					: row.projectedDate
						? ` Projected ${row.projectedDate}.`
						: '';
				return `- ${goal.name}: ${money(row.savedCents)} of ${money(row.targetCents)} (${Math.round(
					row.progress
				)}%), ${pace}${deadline}.${verdict}`;
			})
			.join('\n');
	}
	if (/\b(forecast|predict|projection|project|end of month|next month|run out)\b/.test(text)) {
		const trend =
			insights.trendCentsPerDay > 0
				? 'trending up'
				: insights.trendCentsPerDay < 0
					? 'trending down'
					: 'roughly flat';
		const trendText =
			insights.trendCentsPerDay === 0
				? trend
				: `${trend} by ${money(Math.abs(insights.forecast.trendCentsPerDay))} per day`;
		return [
			`At ${money(Math.round(insights.dailyAvgCents))} per day over the last 30 days, this month projects to ${money(
				insights.projectedMonthCents
			)}.`,
			`The next 30 days are forecast at about ${money(insights.forecast.next30Cents)}, ${trendText}.`,
			insights.topCategory
				? `${insights.topCategory.label} is the largest category this month at ${money(insights.topCategory.amountCents)}.`
				: 'There is not enough data for a category split yet.',
			'This is a straight-line estimate from your own entries, not a guarantee.',
		].join('\n');
	}
	if (/\b(subscription|recurring|renewal|renewing)\b/.test(text)) {
		const summary = insights.subscriptionSummary;
		const due = [...summary.overdue, ...summary.dueSoon].slice(0, 3);
		return [
			`Subscriptions cost ${money(summary.monthlyCents)} per month (${money(summary.yearlyCents)} per year).`,
			`${summary.activeCount} active. ${summary.dueSoonCount} due soon, ${summary.overdueCount} overdue.`,
			...due.map(
				(subscription) =>
					`- ${subscription.merchantName}: ${money(subscription.amountCents)} on ${subscription.nextRenewalDate}`
			),
		].join('\n');
	}
	if (/\b(top|most|biggest|largest|where.*(going|spend)|category)\b/.test(text)) {
		const period = periodFromQuestion(text, today);
		const summary = summarizePeriod(context.transactions, period);
		if (!summary.expenseCents) return `No expenses recorded for ${period.label}.`;
		return [
			`For ${period.label}: ${money(summary.expenseCents)} across ${summary.count} expenses.`,
			categoryBreakdown(summary),
			summary.topMerchant
				? `Biggest single merchant: ${summary.topMerchant.merchant} at ${money(summary.topMerchant.amountCents)}.`
				: '',
		]
			.filter(Boolean)
			.join('\n');
	}
	if (/\b(save|saving|cut|reduce|recommend|advice|tip|budget)\b/.test(text)) {
		if (!insights.tips.length) return 'Keep logging expenses for a few more days and I can point at specific categories to trim.';
		return insights.tips.map((tip) => `- ${tip.title}. ${tip.body}`).join('\n');
	}
	if (/\b(spend|spent|expense|cost|bought|paid)\b/.test(text)) {
		const period = periodFromQuestion(text, today);
		const category = detectCategory(text);
		const summary = summarizePeriod(context.transactions, period);
		if (category) {
			const row = summary.categories.find((entry) => entry.key === category);
			const total = row ? row.amountCents : 0;
			return total
				? `You spent ${money(total)} on ${categoryLabel(category)} for ${period.label} across ${summary.count} expense${
						summary.count === 1 ? '' : 's'
					}.`
				: `No ${categoryLabel(category).toLowerCase()} expenses recorded for ${period.label}.`;
		}
		return [
			`For ${period.label} you spent ${money(summary.expenseCents)} across ${summary.count} expenses.`,
			summary.expenseCents
				? `That is ${money(Math.round(summary.expenseCents / Math.max(1, summary.count)))} per entry on average.`
				: '',
			categoryBreakdown(summary),
		]
			.filter(Boolean)
			.join('\n');
	}
	if (/\b(compare|change|versus|vs|more|less)\b/.test(text)) {
		if (insights.changePct === null) {
			return `This month has ${money(insights.month.expenseCents)} so far. There is no complete last-month baseline to compare yet.`;
		}
		return `This month is ${money(insights.month.expenseCents)} versus ${money(
			insights.lastMonth.expenseCents
		)} last month (${percent(insights.changePct)}). The daily average over 30 days is ${money(
			Math.round(insights.dailyAvgCents)
		)}.`;
	}

	const fallback = summarizePeriod(context.transactions, monthRange(today));
	return [
		`This month so far: ${money(fallback.expenseCents)} across ${fallback.count} expenses.`,
		insights.topCategory ? `Largest category: ${insights.topCategory.label} (${money(insights.topCategory.amountCents)}).` : '',
		'Try "forecast my spending", "will I reach my goals", or "how much did I spend on food last month".',
	]
		.filter(Boolean)
		.join('\n');
}
