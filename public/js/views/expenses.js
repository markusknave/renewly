// Activity screen: money in and out, the entry dialogs, import review, and
// exports. Everything renders inside the app shell; dialogs are centered.

import { formatDateHuman, formatMoney } from '../lib/dates.js';
import {
	CATEGORY_ICONS,
	MAX_CATEGORY_LABEL,
	categoriesFor,
	categoryInfo,
	categoryLabel,
} from '../lib/categories.js';
import { RANGE_PRESETS, transactionSignedCents } from '../finance.js';
import { categoryBadge, esc, icon, options } from './shared.js';
import { importView } from './import.js';

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
	return categoryBadge(transaction.category);
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
		: transaction.type === 'expense' || transaction.type === 'income'
			? `${categoryLabel(transaction.category)}${method ? ` · ${method.label}` : ''}`
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

function categoryControl(key, type) {
	const info = categoryInfo(key);
	return `<div class="field" data-expense-category-field>
		<span class="field-label">Category</span>
		<input type="hidden" name="category" value="${esc(info.key)}" />
		<button class="category-control" type="button" data-action="open-category" aria-haspopup="dialog" aria-label="Choose category">
			<span class="category-control-art" data-category-badge>${categoryBadge(info.key)}</span>
			<span class="category-control-label" data-category-name>${esc(info.label)}</span>
			${icon('chevron', 'category-control-chevron')}
		</button>
		<span class="hint">${esc(type === 'income' ? 'Where this money came from.' : 'What this spending was for.')}</span>
	</div>`;
}

export function categoryPicker({ type = 'expense', selected = '' } = {}) {
	const rows = categoriesFor(type);
	return `<div class="category-picker" data-category-picker>
		<div class="category-grid" role="listbox" aria-label="${esc(type)} categories">
			${rows
				.map(
					(category) => `<button class="category-tile${
						category.key === selected ? ' is-selected' : ''
					}" type="button" data-action="pick-category" data-key="${esc(
						category.key
					)}" role="option" aria-selected="${category.key === selected}">
						<span class="cat-badge" style="--cat:${esc(category.color)}">${icon(category.icon)}</span>
						<span class="category-tile-label">${esc(category.label)}</span>
					</button>`
				)
				.join('')}
		</div>
		<button class="btn category-add" type="button" data-action="new-category">${icon('plus')} Add new category</button>
	</div>`;
}

export function categoryForm({ type = 'expense', icon: selectedIcon = 'dots', label = '' } = {}) {
	return `<form class="stack" data-form="category" data-type="${esc(type)}">
		<label>Name<input type="text" name="label" maxlength="${MAX_CATEGORY_LABEL}" required autocomplete="off" placeholder="e.g. Coffee" value="${esc(
			label
		)}" /></label>
		<div class="field">
			<span class="field-label">Icon</span>
			<div class="icon-grid" role="radiogroup" aria-label="Category icon">
				${CATEGORY_ICONS.map(
					(choice) => `<label class="icon-choice" title="${esc(choice.label)}">
						<input type="radio" name="icon" value="${esc(choice.key)}"${
							choice.key === selectedIcon ? ' checked' : ''
						} />
						<span class="icon-choice-art">${icon(choice.key)}</span>
					</label>`
				).join('')}
			</div>
			<span class="hint">Pick the picture that reads fastest for you.</span>
		</div>
		<p class="banner banner-error" data-dialog-error role="alert" hidden></p>
		<div class="form-actions">
			<button class="btn" type="button" data-action="back-to-categories">Back</button>
			<button class="btn btn-primary" type="submit">Save category</button>
		</div>
	</form>`;
}

export function categoryDialog() {
	return `<dialog class="dialog" id="category-dialog" aria-labelledby="category-dialog-title">
		<div class="dialog-head">
			<h2 id="category-dialog-title" data-category-title>Choose a category</h2>
			<button class="icon-btn" type="button" data-action="close-category" aria-label="Close">${icon('close')}</button>
		</div>
		<div class="dialog-body" data-category-content></div>
	</dialog>`;
}

export function exportDialog({ from = '', to = '', count = 0 } = {}) {
	return `<dialog class="dialog" id="export-dialog" aria-labelledby="export-dialog-title">
		<div class="dialog-head">
			<h2 id="export-dialog-title">Export transactions</h2>
			<button class="icon-btn" type="button" data-action="close-export" aria-label="Close">${icon('close')}</button>
		</div>
		<div class="dialog-body stack">
			<p class="muted small">${count} entr${count === 1 ? 'y' : 'ies'} from ${esc(
				formatDateHuman(from) || from
			)} to ${esc(formatDateHuman(to) || to)}. Files are generated on this device.</p>
			<div class="export-options">
				<button class="export-option" type="button" data-action="export-report" data-format="csv">
					${icon('download')}<span><strong>CSV</strong><span class="sub">Widest compatibility</span></span>
				</button>
				<button class="export-option" type="button" data-action="export-report" data-format="xlsx">
					${icon('download')}<span><strong>Excel</strong><span class="sub">Formatted workbook</span></span>
				</button>
				<button class="export-option" type="button" data-action="export-report" data-format="pdf">
					${icon('download')}<span><strong>PDF</strong><span class="sub">Printable report</span></span>
				</button>
			</div>
			<button class="btn" type="button" data-action="export-backup">${icon('shield')} Full JSON backup</button>
			<p class="hint">Exports include interest and goal transfers in the selected range. The JSON backup carries every account, goal, subscription, and setting.</p>
		</div>
	</dialog>`;
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
			${categoryControl('other', 'expense')}
			<label><span data-payment-method-label>Payment method</span>
				<select name="paymentMethodId" data-searchable data-combo-placeholder="Search accounts…">
					<option value="">No method</option>
					${methodOptions}
				</select>
			</label>
			<label data-transfer-target-field hidden>To account
				<select name="toPaymentMethodId" data-searchable data-combo-placeholder="Search accounts…">
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
	importPreview = null,
	importBusy = false,
	importDefaultMethodId = null,
}) {
	const preset = filters.preset || 'this_month';
	const expenseCategories = categoriesFor('expense');
	const incomeCategories = categoriesFor('income');
	return `<div class="page-head activity-head">
		<div>
			<p class="eyebrow">Activity</p>
			<h1>Money in and out</h1>
			<p class="muted">Log expenses, income, and transfers, then review or export the ledger for the range you choose.</p>
		</div>
		<div class="page-head-actions">
			<button class="btn btn-small" type="button" data-action="open-import">${icon('upload')} Import</button>
			<button class="btn btn-small" type="button" data-action="open-export">${icon('download')} Export</button>
		</div>
	</div>

	<section class="entry-actions" aria-label="Add an entry">
		<button class="entry-action entry-expense" type="button" data-action="new-expense">${icon('plus')}<span>Expense</span></button>
		<button class="entry-action entry-income" type="button" data-action="new-income">${icon('plus')}<span>Income</span></button>
		<button class="entry-action entry-transfer" type="button" data-action="new-transfer">${icon('plus')}<span>Transfer funds</span></button>
	</section>

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
				<optgroup label="Expense">
					${expenseCategories
						.map(
							(category) =>
								`<option value="${esc(category.key)}"${
									filters.category === category.key ? ' selected' : ''
								}>${esc(category.label)}</option>`
						)
						.join('')}
				</optgroup>
				<optgroup label="Income">
					${incomeCategories
						.map(
							(category) =>
								`<option value="${esc(category.key)}"${
									filters.category === category.key ? ' selected' : ''
								}>${esc(category.label)}</option>`
						)
						.join('')}
				</optgroup>
			</select></label>
			<label>Method<select data-expense-method data-searchable data-combo-placeholder="Search accounts…">
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
	${categoryDialog()}
	${exportDialog({ from: range.from, to: range.to, count: rows.length })}
	${importView({
		methods,
		preview: importPreview,
		busy: importBusy,
		defaultMethodId: importDefaultMethodId,
	})}
	`;
}
