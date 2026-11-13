// Expenses screen: filters, ledger list, and CSV/XLSX/PDF export controls.

import { formatDateHuman, formatMoney } from '../lib/dates.js';
import { EXPENSE_CATEGORIES, categoryLabel } from '../lib/categories.js';
import { RANGE_PRESETS, transactionSignedCents } from '../finance.js';
import { esc, icon, options } from './shared.js';

const TYPE_LABELS = {
	expense: 'Expense',
	income: 'Income',
	transfer: 'Transfer',
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
	if (transaction.type === 'transfer') {
		return `<span class="cat-badge" style="--cat:#2563eb">${icon('transfer')}</span>`;
	}
	if (transaction.type === 'income') {
		return `<span class="cat-badge" style="--cat:#16a34a">${icon('arrowDown')}</span>`;
	}
	const category = EXPENSE_CATEGORIES.find((row) => row.key === transaction.category) || EXPENSE_CATEGORIES.at(-1);
	return `<span class="cat-badge" style="--cat:${category.color}">${icon(category.icon)}</span>`;
}

function rowHtml(transaction, methods) {
	const method = methods.find((row) => Number(row.id) === Number(transaction.paymentMethodId));
	const target = methods.find((row) => Number(row.id) === Number(transaction.toPaymentMethodId));
	const isTransfer = transaction.type === 'transfer';
	const out = transaction.type === 'expense' || transaction.type === 'goal_deposit';
	const title =
		transaction.type === 'interest'
			? 'Interest earned'
			: transaction.merchant || TYPE_LABELS[transaction.type] || 'Entry';
	const detail = isTransfer
		? `${method ? method.label : 'Account'} → ${target ? target.label : 'Account'}`
		: transaction.type === 'expense'
			? `${categoryLabel(transaction.category)}${method ? ` · ${method.label}` : ''}`
			: transaction.type === 'income'
				? `Income${method ? ` · ${method.label}` : ''}`
				: transaction.type === 'interest'
					? `${method ? method.label : 'Payment method'} · automatic`
					: `${TYPE_LABELS[transaction.type]}${method ? ` · ${method.label}` : ''}`;
	const search = `${title} ${detail} ${transaction.notes || ''}`.toLowerCase();
	const editable = transaction.type === 'expense' || transaction.type === 'income' || isTransfer;
	return `<li class="txn-row" data-txn data-type="${esc(transaction.type)}" data-category="${esc(
		transaction.category || ''
	)}" data-method="${esc(transaction.paymentMethodId ?? '')}" data-search="${esc(search)}" data-expense-amount="${
		transaction.type === 'expense' ? transaction.amountCents : 0
	}" data-income-amount="${transaction.type === 'income' ? transaction.amountCents : 0}" data-transfer-amount="${
		isTransfer ? transaction.amountCents : 0
	}">
		${badge(transaction)}
		<div class="txn-main">
			<strong>${esc(title)}</strong>
			<span class="sub">${esc(detail)}</span>
			${transaction.notes ? `<span class="txn-note">${esc(transaction.notes)}</span>` : ''}
		</div>
		<div class="txn-amount ${isTransfer ? 'move' : out ? 'out' : 'in'}">${
			isTransfer ? '⇄ ' : out ? '−' : '+'
		}${esc(formatMoney(transaction.amountCents, 'PHP'))}</div>
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
		return `<div class="empty"><h3>No transactions in this range</h3><p class="muted">Adjust the dates or add an expense, income, or transfer entry.</p><button class="btn btn-primary" type="button" data-action="new-expense">Add transaction</button></div>`;
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
	const methodOptions = methods
		.map(
			(method) =>
				`<option value="${method.id}">${esc(method.label)}${
					method.last4 ? ` ···· ${esc(method.last4)}` : ''
				}</option>`
		)
		.join('');
	return `<dialog class="dialog" id="expense-dialog" aria-labelledby="expense-dialog-title">
		<div class="dialog-head">
			<h2 id="expense-dialog-title" data-expense-dialog-title>Add expense</h2>
			<button class="icon-btn" type="button" data-action="close-expense" aria-label="Close">${icon('close')}</button>
		</div>
		<form class="stack" data-form="expense" data-id="">
			<label>Type
				<select name="type" data-expense-type>
					<option value="expense" selected>Expense</option>
					<option value="income">Income</option>
					<option value="transfer">Transfer between accounts</option>
				</select>
			</label>
			<div class="scan-row">
				<input type="file" id="expense-scan-file" accept="image/*" capture="environment" hidden />
				<button class="btn btn-small" type="button" data-action="scan-receipt" data-scan-button>${icon(
					'camera'
				)} Scan receipt</button>
				<img class="scan-thumb" data-scan-thumb alt="" hidden />
				<span class="muted tiny" data-scan-status>Photograph a receipt, payslip, or bank note to fill the fields.</span>
			</div>
			<div class="grid-2">
				<label>Date<input type="date" name="date" required value="${esc(today)}" /></label>
				<label>Amount (PHP)<input type="text" name="amount" inputmode="decimal" required placeholder="0.00" /></label>
			</div>
			<label>Description<input type="text" name="merchant" maxlength="60" placeholder="Lunch, Grab, Salary…" /></label>
			<div class="grid-2">
				<label data-expense-category-field>Category<select name="category">${options(
					EXPENSE_CATEGORIES.map((category) => category.key),
					'other',
					Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category.key, category.label]))
				)}</select></label>
				<label><span data-payment-method-label>Payment method</span>
					<select name="paymentMethodId">
						<option value="">No method</option>
						${methodOptions}
					</select>
				</label>
			</div>
			<label data-transfer-target-field hidden>To account
				<select name="toPaymentMethodId">
					<option value="">Choose an account</option>
					${methodOptions}
				</select>
			</label>
			<label>Notes<textarea name="notes" rows="2" maxlength="500" placeholder="Optional"></textarea></label>
			<p class="banner banner-error" data-dialog-error role="alert" hidden></p>
			<p class="hint" data-expense-hint>Saving subtracts the amount from the selected card or wallet. Interest and goal transfers stay automatic.</p>
			<div class="form-actions">
				<button class="btn" type="button" data-action="close-expense">Cancel</button>
				<button class="btn btn-primary" type="submit" data-expense-submit>Save expense</button>
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
			<h1>Transactions</h1>
			<p class="muted">Every expense, income, and account transfer, with exports for the range you choose.</p>
		</div>
		<div class="page-head-actions">
			<a class="btn" href="#/import">${icon('download')} Import</a>
			<button class="btn btn-primary" type="button" data-action="new-expense">${icon('plus')} Add transaction</button>
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
			<label>Type<select data-expense-type-filter>${options(
				['', 'expense', 'income', 'transfer'],
				filters.type || '',
				{ '': 'All types', expense: 'Expenses', income: 'Income', transfer: 'Transfers' }
			)}</select></label>
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
				)}</span> · <span data-income-count>${summary.incomeCount ?? 0}</span> income · <span data-income-total>${esc(
					formatMoney(summary.incomeCents, 'PHP')
				)}</span> · <span data-transfer-count>${summary.transferCount ?? 0}</span> transfer${
					summary.transferCount === 1 ? '' : 's'
				} · <span data-transfer-total>${esc(
					formatMoney(summary.transferCents ?? 0, 'PHP')
				)}</span> · Net <span data-net-total>${esc(
					formatMoney(summary.incomeCents - summary.expenseCents, 'PHP')
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
