// Expenses screen: filters, ledger list, and CSV/XLSX/PDF export controls.

import { formatDateHuman, formatMoney } from '../lib/dates.js';
import { EXPENSE_CATEGORIES, categoryLabel } from '../lib/categories.js';
import { RANGE_PRESETS, transactionSignedCents } from '../finance.js';
import { esc, icon, options } from './shared.js';

const TYPE_LABELS = {
	expense: 'Expense',
	income: 'Income',
	interest: 'Interest',
	goal_deposit: 'To goal',
	goal_withdrawal: 'From goal',
};

function badge(transaction) {
	if (transaction.type === 'interest') {
		return `<span class="cat-badge" style="--cat:#0d9488">${icon('trendUp')}</span>`;
	}
	if (transaction.type === 'goal_deposit' || transaction.type === 'goal_withdrawal') {
		return `<span class="cat-badge" style="--cat:#7c3aed">${icon('target')}</span>`;
	}
	if (transaction.type === 'income') {
		return `<span class="cat-badge" style="--cat:#16a34a">${icon('arrowDown')}</span>`;
	}
	const category = EXPENSE_CATEGORIES.find((row) => row.key === transaction.category) || EXPENSE_CATEGORIES.at(-1);
	return `<span class="cat-badge" style="--cat:${category.color}">${icon(category.icon)}</span>`;
}

function rowHtml(transaction, methods) {
	const method = methods.find((row) => Number(row.id) === Number(transaction.paymentMethodId));
	const out = transaction.type === 'expense' || transaction.type === 'goal_deposit';
	const title =
		transaction.type === 'interest'
			? 'Interest earned'
			: transaction.type === 'income'
				? 'Income'
				: transaction.merchant;
	const detail =
		transaction.type === 'expense'
			? `${categoryLabel(transaction.category)}${method ? ` · ${method.label}` : ''}`
			: transaction.type === 'interest'
				? `${method ? method.label : 'Payment method'} · automatic`
				: `${TYPE_LABELS[transaction.type]}${method ? ` · ${method.label}` : ''}`;
	const search = `${title} ${detail} ${transaction.notes || ''}`.toLowerCase();
	const editable = transaction.type === 'expense';
	return `<li class="txn-row" data-txn data-type="${esc(transaction.type)}" data-category="${esc(
		transaction.category || ''
	)}" data-method="${esc(transaction.paymentMethodId ?? '')}" data-search="${esc(search)}" data-expense-amount="${
		transaction.type === 'expense' ? transaction.amountCents : 0
	}">
		${badge(transaction)}
		<div class="txn-main">
			<strong>${esc(title)}</strong>
			<span class="sub">${esc(detail)}</span>
			${transaction.notes ? `<span class="txn-note">${esc(transaction.notes)}</span>` : ''}
		</div>
		<div class="txn-amount ${out ? 'out' : 'in'}">${out ? '−' : '+'}${esc(
			formatMoney(transaction.amountCents, 'PHP')
		)}</div>
		${
			editable
				? `<div class="txn-actions">
					<button class="icon-btn" type="button" data-action="edit-expense" data-id="${transaction.id}" aria-label="Edit ${esc(
						title
					)}">${icon('edit')}</button>
					<button class="icon-btn danger" type="button" data-action="delete-expense" data-id="${transaction.id}" aria-label="Delete ${esc(
						title
					)}">${icon('trash')}</button>
				</div>`
				: '<div class="txn-actions"></div>'
		}
	</li>`;
}

function groupedList(rows, methods) {
	if (!rows.length) {
		return `<div class="empty"><h3>No transactions in this range</h3><p class="muted">Adjust the dates or add an expense.</p><button class="btn btn-primary" type="button" data-action="new-expense">Add expense</button></div>`;
	}
	const groups = new Map();
	for (const transaction of rows) {
		if (!groups.has(transaction.date)) groups.set(transaction.date, []);
		groups.get(transaction.date).push(transaction);
	}
	return [...groups.entries()]
		.map(([date, transactions]) => {
			const total = transactions.reduce(
				(sum, transaction) => sum + transactionSignedCents(transaction),
				0
			);
			return `<div class="txn-group" data-date-group>
				<div class="txn-date"><span>${esc(formatDateHuman(date))}</span><strong>${esc(
					formatMoney(total, 'PHP')
				)}</strong></div>
				<ul class="txn-list">${transactions.map((transaction) => rowHtml(transaction, methods)).join('')}</ul>
			</div>`;
		})
		.join('');
}

export function expenseDialog({ methods = [], today }) {
	return `<dialog class="dialog" id="expense-dialog" aria-labelledby="expense-dialog-title">
		<div class="dialog-head">
			<h2 id="expense-dialog-title" data-expense-dialog-title>Add expense</h2>
			<button class="icon-btn" type="button" data-action="close-expense" aria-label="Close">${icon('close')}</button>
		</div>
		<form class="stack" data-form="expense" data-id="">
			<div class="grid-2">
				<label>Date<input type="date" name="date" required value="${esc(today)}" /></label>
				<label>Amount (PHP)<input type="text" name="amount" inputmode="decimal" required placeholder="0.00" /></label>
			</div>
			<label>Description<input type="text" name="merchant" maxlength="60" required placeholder="Lunch, Grab, Meralco…" /></label>
			<div class="grid-2">
				<label>Category<select name="category">${options(
					EXPENSE_CATEGORIES.map((category) => category.key),
					'other',
					Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category.key, category.label]))
				)}</select></label>
				<label>Payment method
					<select name="paymentMethodId">
						<option value="">No method</option>
						${methods
							.map(
								(method) =>
									`<option value="${method.id}">${esc(method.label)}${
										method.last4 ? ` ···· ${esc(method.last4)}` : ''
									}</option>`
							)
							.join('')}
					</select>
				</label>
			</div>
			<label>Notes<textarea name="notes" rows="2" maxlength="500" placeholder="Optional"></textarea></label>
			<p class="banner banner-error" data-dialog-error role="alert" hidden></p>
			<p class="hint">Saving subtracts the amount from the selected card or wallet. Interest and goal transfers stay automatic.</p>
			<div class="form-actions">
				<button class="btn" type="button" data-action="close-expense">Cancel</button>
				<button class="btn btn-primary" type="submit">Save expense</button>
			</div>
		</form>
	</dialog>`;
}

export function expensesView({
	today,
	methods = [],
	filters = {},
	range,
	summary,
	rows = [],
	categories = EXPENSE_CATEGORIES,
}) {
	const preset = filters.preset || 'this_month';
	return `<div class="page-head">
		<div>
			<p class="eyebrow">Expense tracker</p>
			<h1>Spending</h1>
			<p class="muted">Every purchase, bill, and fee, with exports for the range you choose.</p>
		</div>
		<div class="page-head-actions">
			<button class="btn btn-primary" type="button" data-action="new-expense">${icon('plus')} Add expense</button>
		</div>
	</div>

	<section class="panel filters-panel">
		<div class="filter-row">
			<label>Range<select data-expense-preset>${options(
				RANGE_PRESETS.map(([value]) => value),
				preset,
				Object.fromEntries(RANGE_PRESETS)
			)}</select></label>
			<label>From<input type="date" data-expense-from value="${esc(range.from)}" /></label>
			<label>To<input type="date" data-expense-to value="${esc(range.to)}" /></label>
			<label>Category<select data-expense-category>
				<option value="">All categories</option>
				${categories
					.map(
						(category) =>
							`<option value="${esc(category.key)}"${
								filters.category === category.key ? ' selected' : ''
							}>${esc(category.label)}</option>`
					)
					.join('')}
			</select></label>
			<label>Method<select data-expense-method>
				<option value="">All methods</option>
				${methods
					.map(
						(method) =>
							`<option value="${method.id}"${
								String(filters.methodId) === String(method.id) ? ' selected' : ''
							}>${esc(method.label)}</option>`
					)
					.join('')}
			</select></label>
			<label>Search<input type="search" data-expense-search value="${esc(
				filters.query || ''
			)}" placeholder="Merchant or note" /></label>
		</div>
		<div class="export-row">
			<div class="export-total">
				<span class="muted small"><span data-expense-count>${summary.count}</span> expense${
					summary.count === 1 ? '' : 's'
				} · <span data-expense-total>${esc(
					formatMoney(summary.expenseCents, 'PHP')
				)}</span></span>
				<span class="muted tiny">Exports include interest and goal transfers in this range.</span>
			</div>
			<div class="export-actions">
				<button class="btn btn-small" type="button" data-action="export-report" data-format="csv">${icon('download')} CSV</button>
				<button class="btn btn-small" type="button" data-action="export-report" data-format="xlsx">${icon('download')} Excel</button>
				<button class="btn btn-small" type="button" data-action="export-report" data-format="pdf">${icon('download')} PDF</button>
			</div>
		</div>
	</section>

	<section class="panel ledger-panel">
		<div class="panel-head">
			<h2>Transactions</h2>
			<span class="muted small">${esc(range.from)} → ${esc(range.to)}</span>
		</div>
		<div id="expense-list">${groupedList(rows, methods)}</div>
	</section>

	${expenseDialog({ methods, today })}
	`;
}
