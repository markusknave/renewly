// Goals screen: targets, progress, monthly pace, and in-app transfers.

import { formatDateHuman, formatMoney } from '../lib/dates.js';
import { GOAL_COLORS, MAX_GOAL_NAME } from '../store.js';
import { esc, icon, options, progressBar } from './shared.js';

const COLOR_LABELS = {
	indigo: 'Indigo',
	teal: 'Teal',
	amber: 'Amber',
	rose: 'Rose',
	sky: 'Sky',
	violet: 'Violet',
};

function ring(percent, color) {
	return `<div class="goal-ring" style="--pct:${Math.max(0, Math.min(100, percent))}%;--goal:var(--goal-${color || 'indigo'})"><span>${Math.round(
		percent
	)}%</span></div>`;
}

function history(goal, transactions) {
	const rows = (transactions || [])
		.filter((transaction) => Number(transaction.goalId) === Number(goal.id))
		.sort((a, b) => (a.date < b.date ? 1 : -1))
		.slice(0, 4);
	if (!rows.length) return '<p class="muted tiny">No transfers yet.</p>';
	return `<ul class="goal-history">${rows
		.map(
			(transaction) => `<li>
				<span>${esc(formatDateHuman(transaction.date))} · ${
					transaction.type === 'goal_deposit' ? 'Added' : 'Withdrew'
				}</span>
				<strong>${transaction.type === 'goal_deposit' ? '+' : '−'}${esc(
					formatMoney(transaction.amountCents, 'PHP')
				)}</strong>
			</li>`
		)
		.join('')}</ul>`;
}

function goalCard(row, transactions) {
	const goal = row.goal;
	const verdict = row.complete
		? '<p class="goal-verdict ok">Goal reached. Move the money wherever you need it next.</p>'
		: goal.deadline
			? row.feasible
				? `<p class="goal-verdict ok">On track for ${esc(formatDateHuman(goal.deadline))} at the current pace.</p>`
				: `<p class="goal-verdict warn">Short about ${esc(
						formatMoney(row.shortfallCents, 'PHP')
					)} per month to hit ${esc(formatDateHuman(goal.deadline))}.</p>`
			: row.projectedDate
				? `<p class="goal-verdict">Projected to finish around ${esc(formatDateHuman(row.projectedDate))}.</p>`
				: '<p class="goal-verdict warn">Add money to start projecting a finish date.</p>';

	return `<article class="goal-card" style="--goal:var(--goal-${goal.color || 'indigo'})">
		<div class="goal-top">
			${ring(row.progress, goal.color)}
			<div class="goal-title">
				<h3>${esc(goal.name)}</h3>
				<p class="sub">${goal.deadline ? `Target ${esc(formatDateHuman(goal.deadline))}` : 'No deadline'}${
					goal.note ? ` · ${esc(goal.note)}` : ''
				}</p>
			</div>
		</div>
		<div class="goal-numbers">
			<strong>${esc(formatMoney(row.savedCents, 'PHP'))}</strong>
			<span class="muted small">of ${esc(formatMoney(row.targetCents, 'PHP'))}</span>
		</div>
		${progressBar(row.progress, `var(--goal-${goal.color || 'indigo'})`)}
		<div class="goal-stats">
			<div><span>Remaining</span><strong>${esc(formatMoney(row.remainingCents, 'PHP'))}</strong></div>
			<div><span>3-month pace</span><strong>${esc(formatMoney(row.averageMonthlyCents, 'PHP'))}/mo</strong></div>
			<div><span>${
				goal.deadline ? 'Needed / month' : 'Months at pace'
			}</span><strong>${
				goal.deadline
					? esc(formatMoney(row.requiredMonthlyCents, 'PHP'))
					: row.monthsToTarget === null
						? '—'
						: row.monthsToTarget
			}</strong></div>
		</div>
		${verdict}
		<div class="goal-actions">
			<button class="btn btn-small btn-primary" type="button" data-action="transfer-goal" data-id="${goal.id}">${icon(
				'plus'
			)} Add money</button>
			<button class="btn btn-small" type="button" data-action="withdraw-goal" data-id="${goal.id}">Withdraw</button>
			<button class="btn btn-small" type="button" data-action="edit-goal" data-id="${goal.id}">Edit</button>
			<button class="link danger" type="button" data-action="delete-goal" data-id="${goal.id}">Delete</button>
		</div>
		<details class="goal-history-wrap"><summary>Recent transfers</summary>${history(goal, transactions)}</details>
	</article>`;
}

export function goalDialog({ today }) {
	return `<dialog class="dialog" id="goal-dialog" aria-labelledby="goal-dialog-title">
		<div class="dialog-head">
			<h2 id="goal-dialog-title" data-goal-dialog-title>New goal</h2>
			<button class="icon-btn" type="button" data-action="close-goal" aria-label="Close">${icon('close')}</button>
		</div>
		<form class="stack" data-form="goal" data-id="">
			<label>Goal name<input type="text" name="name" maxlength="${MAX_GOAL_NAME}" required placeholder="Japan trip" /></label>
			<div class="grid-2">
				<label>Target (PHP)<input type="text" name="target" inputmode="decimal" required placeholder="50000.00" /></label>
				<label>Target date<input type="date" name="deadline" /></label>
			</div>
			<label>Color<select name="color">${options(GOAL_COLORS, 'indigo', COLOR_LABELS)}</select></label>
			<label>Note<input type="text" name="note" maxlength="200" placeholder="Optional" /></label>
			<p class="banner banner-error" data-dialog-error role="alert" hidden></p>
			<div class="form-actions">
				<button class="btn" type="button" data-action="close-goal">Cancel</button>
				<button class="btn btn-primary" type="submit">Save goal</button>
			</div>
		</form>
	</dialog>`;
}

export function transferDialog({ today, methods = [], goals = [] }) {
	return `<dialog class="dialog" id="transfer-dialog" aria-labelledby="transfer-dialog-title">
		<div class="dialog-head">
			<h2 id="transfer-dialog-title" data-transfer-dialog-title>Move money</h2>
			<button class="icon-btn" type="button" data-action="close-transfer" aria-label="Close">${icon('close')}</button>
		</div>
		<form class="stack" data-form="transfer">
			<input type="hidden" name="goalId" value="" />
			<label>Goal<select name="goalSelect" data-transfer-goal>${goals
				.map((goal) => `<option value="${goal.id}">${esc(goal.name)}</option>`)
				.join('')}</select></label>
			<label>Direction<select name="direction">
				<option value="to_goal">Into the goal</option>
				<option value="from_goal">Back to a payment method</option>
			</select></label>
			<div class="grid-2">
				<label>Payment method<select name="paymentMethodId">${methods
					.map((method) => `<option value="${method.id}">${esc(method.label)}</option>`)
					.join('')}</select></label>
				<label>Amount (PHP)<input type="text" name="amount" inputmode="decimal" required placeholder="0.00" /></label>
			</div>
			<label>Date<input type="date" name="date" value="${esc(today)}" required /></label>
			<p class="banner banner-error" data-dialog-error role="alert" hidden></p>
			<p class="hint">This is an in-app move only. No bank transfer happens; the money stays in Renewly.</p>
			<div class="form-actions">
				<button class="btn" type="button" data-action="close-transfer">Cancel</button>
				<button class="btn btn-primary" type="submit">Move money</button>
			</div>
		</form>
	</dialog>`;
}

export function goalsView({ today, methods = [], goals = [], goalRows = [], transactions = [] }) {
	const totalSaved = goalRows.reduce((sum, row) => sum + row.savedCents, 0);
	const totalTarget = goalRows.reduce((sum, row) => sum + row.targetCents, 0);
	const cards = goalRows.map((row) => goalCard(row, transactions)).join('');

	return `<div class="page-head">
		<div><p class="eyebrow">Goals</p><h1>Save with a purpose</h1><p class="muted">Move money from any card or wallet into a goal. Nothing leaves this device.</p></div>
		<div class="page-head-actions"><button class="btn btn-primary" type="button" data-action="new-goal">${icon(
			'plus'
		)} New goal</button></div>
	</div>

	<section class="goal-summary">
		<div><span class="muted small">Saved across goals</span><strong>${esc(formatMoney(totalSaved, 'PHP'))}</strong></div>
		<div><span class="muted small">Total targets</span><strong>${esc(formatMoney(totalTarget, 'PHP'))}</strong></div>
		<div><span class="muted small">Goals</span><strong>${goalRows.length}</strong></div>
	</section>

	${
		cards
			? `<section class="goal-grid">${cards}</section>`
			: `<section class="panel">${`<div class="empty"><h3>No goals yet</h3><p class="muted">Create a target like an emergency fund or a trip, then fund it from any payment method.</p><button class="btn btn-primary" type="button" data-action="new-goal">Create a goal</button></div>`}</section>`
	}

	${goalDialog({ today })}
	${transferDialog({ today, methods, goals })}
	`;
}
