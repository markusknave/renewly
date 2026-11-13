// Home dashboard: total money, the card carousel, month spending, recent
// activity, goals, and upcoming subscriptions.

import { formatDateHuman, formatMoney } from '../lib/dates.js';
import { categoryLabel } from '../lib/categories.js';
import { recentTransactions } from '../finance.js';
import {
	bankCard,
	categoryBadge,
	donut,
	emptyState,
	esc,
	icon,
	legend,
	progressBar,
	sparkline,
} from './shared.js';

function activityBadge(transaction) {
	if (transaction.type === 'interest') {
		return `<span class="cat-badge cat-badge-interest" style="--cat:#0d9488">${icon('trendUp')}</span>`;
	}
	if (transaction.type === 'goal_deposit' || transaction.type === 'goal_withdrawal') {
		return `<span class="cat-badge cat-badge-goal" style="--cat:#7c3aed">${icon('target')}</span>`;
	}
	if (transaction.type === 'transfer') {
		return `<span class="cat-badge" style="--cat:#2563eb">${icon('transfer')}</span>`;
	}
	if (transaction.type === 'income') {
		return `<span class="cat-badge cat-badge-income" style="--cat:#16a34a">${icon('arrowDown')}</span>`;
	}
	return categoryBadge(transaction.category);
}

function activityRow(transaction, methods) {
	const method = methods.find((row) => Number(row.id) === Number(transaction.paymentMethodId));
	const target = methods.find((row) => Number(row.id) === Number(transaction.toPaymentMethodId));
	const out = transaction.type === 'expense' || transaction.type === 'goal_deposit';
	const label =
		transaction.type === 'interest'
			? 'Interest earned'
			: transaction.type === 'goal_deposit'
				? transaction.merchant
				: transaction.type === 'goal_withdrawal'
					? transaction.merchant
					: transaction.type === 'transfer'
						? 'Account transfer'
						: transaction.merchant;
	const detail =
		transaction.type === 'expense'
			? `${categoryLabel(transaction.category)}${method ? ` · ${method.label}` : ''}`
			: transaction.type === 'transfer'
				? `${method ? method.label : 'Account'} → ${target ? target.label : 'Account'}`
				: transaction.type === 'interest'
					? `${method ? method.label : 'Payment method'} · automatic`
					: `${method ? method.label : 'No method'}`;
	return `<li class="activity-row">
		${activityBadge(transaction)}
		<div class="activity-main">
			<strong>${esc(label)}</strong>
			<span class="sub">${esc(detail)}</span>
		</div>
		<div class="activity-amount ${transaction.type === 'transfer' ? 'move' : out ? 'out' : 'in'}">${
			transaction.type === 'transfer' ? '⇄ ' : out ? '−' : '+'
		}${esc(formatMoney(transaction.amountCents, 'PHP'))}</div>
	</li>`;
}

function goalPreview(goalRows) {
	if (!goalRows.length) {
		return `<div class="empty compact-empty">
			<p class="muted small">No goals yet. Set a target, then move money from any card or wallet into it.</p>
			<button class="btn btn-small" type="button" data-action="new-goal">Create a goal</button>
		</div>`;
	}
	return `<ul class="goal-preview">${goalRows
		.slice(0, 3)
		.map(
			(row) => `<li>
				<div class="goal-preview-head">
					<strong>${esc(row.goal.name)}</strong>
					<span class="muted small">${esc(formatMoney(row.savedCents, 'PHP'))} of ${esc(
						formatMoney(row.targetCents, 'PHP')
					)}</span>
				</div>
				${progressBar(row.progress, `var(--goal-${row.goal.color || 'indigo'})`)}
			</li>`
		)
		.join('')}</ul>`;
}

function upcomingList(summary) {
	const rows = [...summary.overdue, ...summary.dueSoon].slice(0, 4);
	if (!rows.length) return '<p class="muted small">Nothing due in the reminder window.</p>';
	return `<ul class="upcoming">${rows
		.map(
			(subscription) => `<li>
				<span class="date-chip">${esc(formatDateHuman(subscription.nextRenewalDate))}</span>
				<span class="upcoming-name">${esc(subscription.merchantName)}<span class="sub">${esc(
					subscription.planName || (subscription.kind === 'one_time' ? 'One-time' : 'Subscription')
				)}</span></span>
				<span class="upcoming-amount">${esc(formatMoney(subscription.amountCents, 'PHP'))}</span>
			</li>`
		)
		.join('')}</ul>`;
}

export function homeView({
	today,
	settings,
	methods = [],
	snapshots = [],
	totalCents = 0,
	month,
	lastMonth,
	interestEarnedCents = 0,
	pendingInterestCents = 0,
	goalRows = [],
	subscriptionSummary,
	transactions = [],
	sparkSeries = [],
	greeting = 'Your money',
}) {
	const snapshotFor = (id) =>
		snapshots.find((snapshot) => Number(snapshot.method?.id ?? snapshot.id) === Number(id)) || null;
	const recent = recentTransactions(transactions, 6);
	const sparkDays = (sparkSeries || []).filter((point) => point.amountCents > 0).length;
	const cards = methods.length
		? methods
				.map((method) => bankCard(method, snapshotFor(method.id), { compact: true }))
				.join('')
		: '';

	return `<div class="page-head home-head">
		<div>
			<p class="eyebrow">${esc(greeting)}</p>
			<h1>Everything in one place</h1>
			<p class="muted">Balances, daily spending, goals, and what renews next.</p>
		</div>
		<div class="page-head-actions">
			<button class="btn btn-primary" type="button" data-action="new-expense">${icon('plus')} Add expense</button>
		</div>
	</div>

	<section class="hero">
		<div class="hero-head">
			<span>Total available</span>
			<span class="privacy-chip">${icon('shield')} On this device</span>
		</div>
		<div class="hero-value">${esc(formatMoney(totalCents, 'PHP'))}</div>
		<div class="hero-meta">
			<span>${methods.length} account${methods.length === 1 ? '' : 's'}</span>
			<span>${month.count} expense${month.count === 1 ? '' : 's'} this month</span>
			<span>${esc(formatMoney(interestEarnedCents, 'PHP'))} interest earned</span>
		</div>
		${sparkDays >= 2 ? sparkline(sparkSeries, { width: 340, height: 62 }) : ''}
	</section>

	<section class="section-block">
		<div class="section-head">
			<h2>Your cards</h2>
			<a class="link" href="#/cards">Manage</a>
		</div>
		${
			cards
				? `<div class="card-carousel">${cards}</div>`
				: emptyState(
						'No payment methods yet',
						'Add a bank, card, or e-wallet with its current balance to see it here.',
						'<p><a class="btn btn-primary" href="#/cards">Add a payment method</a></p>'
					)
		}
	</section>

	<section class="stat-row">
		<div class="mini-stat">
			<span class="mini-stat-icon spend">${icon('arrowUp')}</span>
			<span class="mini-stat-label">Spent this month</span>
			<strong>${esc(formatMoney(month.expenseCents, 'PHP'))}</strong>
			<span class="mini-stat-sub">${
				lastMonth.expenseCents > 0
					? `${month.expenseCents <= lastMonth.expenseCents ? 'Down' : 'Up'} from ${esc(
							formatMoney(lastMonth.expenseCents, 'PHP')
						)} last month`
					: 'No last-month baseline'
			}</span>
		</div>
		<div class="mini-stat">
			<span class="mini-stat-icon daily">${icon('calendar')}</span>
			<span class="mini-stat-label">Daily average</span>
			<strong>${esc(formatMoney(Math.round(month.expenseCents / Math.max(1, Number(today.slice(8, 10)))), 'PHP'))}</strong>
			<span class="mini-stat-sub">Based on this month so far</span>
		</div>
		<div class="mini-stat">
			<span class="mini-stat-icon subs">${icon('refresh')}</span>
			<span class="mini-stat-label">Subscriptions</span>
			<strong>${esc(formatMoney(subscriptionSummary?.monthlyCents || 0, 'PHP'))}</strong>
			<span class="mini-stat-sub">${subscriptionSummary?.dueSoonCount || 0} due soon · ${
				subscriptionSummary?.overdueCount || 0
			} overdue</span>
		</div>
		<div class="mini-stat">
			<span class="mini-stat-icon interest">${icon('trendUp')}</span>
			<span class="mini-stat-label">Interest this month</span>
			<strong>${esc(formatMoney(pendingInterestCents, 'PHP'))}</strong>
			<span class="mini-stat-sub">Accruing automatically</span>
		</div>
	</section>

	<div class="home-grid">
		<section class="panel">
			<div class="panel-head">
				<h2>Where it goes</h2>
				<a class="link" href="#/insights">Insights</a>
			</div>
			<div class="donut-row">
				${donut(month.categories, month.expenseCents, 'this month')}
				${legend(month.categories, month.expenseCents)}
			</div>
		</section>

		<section class="panel">
			<div class="panel-head">
				<h2>Recent activity</h2>
				<a class="link" href="#/expenses">View all</a>
			</div>
			${
				recent.length
					? `<ul class="activity-list">${recent.map((transaction) => activityRow(transaction, methods)).join('')}</ul>`
					: `<div class="empty compact-empty"><p class="muted small">Nothing logged yet. Add your first expense to start the tracker.</p><button class="btn btn-small" type="button" data-action="new-expense">Add expense</button></div>`
			}
		</section>

		<section class="panel">
			<div class="panel-head">
				<h2>Goals</h2>
				<a class="link" href="#/goals">Open goals</a>
			</div>
			${goalPreview(goalRows)}
		</section>

		<section class="panel">
			<div class="panel-head">
				<h2>Renewing soon</h2>
				<a class="link" href="#/subscriptions">Subscriptions</a>
			</div>
			${upcomingList(subscriptionSummary || { overdue: [], dueSoon: [] })}
		</section>
	</div>

	<section class="quick-actions">
		<button class="quick-action" type="button" data-action="new-expense">${icon('receipt')}<span>Log expense</span></button>
		<button class="quick-action" type="button" data-action="new-goal">${icon('target')}<span>New goal</span></button>
		<button class="quick-action" type="button" data-action="new-transfer">${icon('transfer')}<span>Transfer money</span></button>
		<a class="quick-action" href="#/insights">${icon('sparkles')}<span>Ask the analyst</span></a>
	</section>`;
}
