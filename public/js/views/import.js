// Import review screen: file drop zone, parsed preview, analyst summary, and
// duplicate-safe commit.

import { formatDateHuman, formatMoney } from '../lib/dates.js';
import { categoryLabel } from '../lib/categories.js';
import { PAYMENT_KIND_LABELS } from '../store.js';
import { IMPORT_ACCEPT } from '../import.js';
import { breadcrumb, esc, icon } from './shared.js';

function statusPill(row, defaultMethodId = null) {
	if (row.duplicate) return '<span class="pill pill-paused">Duplicate</span>';
	const source = row.paymentMethodId ?? defaultMethodId;
	if (row.type === 'transfer' && (!row.transferMethodId || !source)) {
		return '<span class="pill pill-paused">Needs account</span>';
	}
	return '<span class="pill pill-active">Ready</span>';
}

function accountOptions(methods, selected, excludeId = null) {
	return methods
		.filter((method) => String(method.id) !== String(excludeId ?? ''))
		.map(
			(method) =>
				`<option value="${method.id}"${
					String(selected) === String(method.id) ? ' selected' : ''
				}>${esc(method.label)}</option>`
		)
		.join('');
}

function transferOptions(row, methods, defaultMethodId = null) {
	const source = row.paymentMethodId ?? defaultMethodId ?? '';
	return `<div class="transfer-pair">
		<select class="import-transfer-select" data-import-transfer-source data-index="${
			row.index
		}" data-searchable data-combo-placeholder="Search source…" aria-label="Transfer source account">
			<option value="">From account…</option>
			${accountOptions(methods, source)}
		</select>
		<select class="import-transfer-select" data-import-transfer data-index="${
			row.index
		}" data-searchable data-combo-placeholder="Search destination…" aria-label="Transfer destination account">
			<option value="">To account…</option>
			${accountOptions(methods, row.transferMethodId, source)}
		</select>
	</div>`;
}

function previewRows(rows, methods, defaultMethodId = null) {
	if (!rows.length) return '<p class="muted small">No transaction rows were recognized.</p>';
	return `<div class="table-wrap"><table class="subs-table import-table">
		<thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Category</th><th>Account</th><th>Amount</th><th>Status</th></tr></thead>
		<tbody>${rows
			.slice(0, 100)
			.map(
				(row, index) => `<tr>
					<td class="num">${esc(row.date)}</td>
					<td><span class="merchant-name">${esc(row.merchant)}</span>${
						row.notes ? `<span class="sub">${esc(row.notes.slice(0, 80))}</span>` : ''
					}</td>
					<td><select data-import-type data-index="${index}">
						<option value="expense"${row.type === 'expense' ? ' selected' : ''}>Expense</option>
						<option value="income"${row.type === 'income' ? ' selected' : ''}>Income</option>
						<option value="transfer"${row.type === 'transfer' ? ' selected' : ''}>Transfer</option>
					</select></td>
					<td>${esc(categoryLabel(row.category))}</td>
					<td>${
						row.type === 'transfer'
							? transferOptions({ ...row, index }, methods, defaultMethodId)
							: esc(row.methodLabel || 'Default')
					}</td>
					<td class="num">${
						row.type === 'income' ? '+' : row.type === 'transfer' ? '⇄ ' : '−'
					}${esc(formatMoney(row.amountCents, 'PHP'))}</td>
					<td>${statusPill(row, defaultMethodId)}</td>
				</tr>`
			)
			.join('')}</tbody>
	</table></div>`;
}

function analysisPanel(analysis) {
	if (!analysis.count) return '';
	return `<section class="import-analysis">
		<div><span class="muted small">Expenses</span><strong>${analysis.expenseCount} · ${esc(
			formatMoney(analysis.expenseCents, 'PHP')
		)}</strong></div>
		<div><span class="muted small">Income</span><strong>${analysis.incomeCount} · ${esc(
			formatMoney(analysis.incomeCents, 'PHP')
		)}</strong></div>
		<div><span class="muted small">Transfers</span><strong>${analysis.transferCount || 0} · ${esc(
			formatMoney(analysis.transferCents || 0, 'PHP')
		)}</strong></div>
		<div><span class="muted small">Net</span><strong>${esc(formatMoney(analysis.netCents, 'PHP'))}</strong></div>
		<div><span class="muted small">Range</span><strong class="small-value">${esc(
			formatDateHuman(analysis.from)
		)} – ${esc(formatDateHuman(analysis.to))}</strong></div>
		<div><span class="muted small">Analyst top category</span><strong class="small-value">${
			analysis.categories[0]
				? `${esc(analysis.categories[0].label)} · ${Math.round(analysis.categories[0].share)}%`
				: '—'
		}</strong></div>
	</section>`;
}

export function importView({ methods = [], preview = null, busy = false, defaultMethodId = null }) {
	const rows = preview?.rows || [];
	const ready = rows.filter(
		(row) =>
			!row.duplicate &&
			!(
				row.type === 'transfer' &&
				(!row.transferMethodId || (!row.paymentMethodId && !defaultMethodId))
			)
	).length;
	const duplicateCount = rows.filter((row) => row.duplicate).length;
	const stats = preview?.stats || null;
	const missingMethods = preview?.missingMethods || [];

	return `${breadcrumb([{ label: 'More', href: '#/more' }, { label: 'Import transactions' }])}
	<div class="page-head">
		<div>
			<p class="eyebrow">More · Import</p>
			<h1>Import transactions</h1>
			<p class="muted">Read a statement, preview what Renewly understood, then add expenses, income, and transfers. Everything stays on this device.</p>
		</div>
		<div class="page-head-actions"><a class="btn" href="#/expenses">Back to expenses</a></div>
	</div>

	<section class="panel">
		<label class="dropzone${busy ? ' is-busy' : ''}" for="expense-import-file">
			<input type="file" id="expense-import-file" accept="${IMPORT_ACCEPT}" hidden />
			<span class="dropzone-icon">${icon('download')}</span>
			<span class="dropzone-copy">
				<strong>${busy ? 'Reading file…' : 'Choose a file or drop it here'}</strong>
				<span class="muted small">CSV, PDF, Excel (.xlsx), JSON, or Money Manager .mbak/.mmbak</span>
			</span>
		</label>
		<p class="hint">PDF import reads selectable text. Scanned image statements need OCR first. Legacy .xls files should be saved as .xlsx or CSV. Files are capped at 25 MB. The local analyst infers categories and matches accounts; nothing is uploaded.</p>
	</section>

	${
		preview
			? `<section class="panel">
				<div class="panel-head">
					<h2>${esc(preview.fileName)}</h2>
					<span class="pill">${esc(preview.format)}</span>
				</div>
				<section class="import-stats">
					<div><span class="muted small">Rows read</span><strong>${stats?.total ?? rows.length}</strong></div>
					<div><span class="muted small">Ready</span><strong>${ready}</strong></div>
					<div><span class="muted small">Expenses</span><strong>${stats?.expenseCount ?? 0}</strong></div>
					<div><span class="muted small">Income</span><strong>${stats?.incomeCount ?? 0}</strong></div>
					<div><span class="muted small">Transfers</span><strong>${stats?.transferCount ?? 0}</strong></div>
					<div><span class="muted small">Duplicates</span><strong>${duplicateCount}</strong></div>
				</section>
				${analysisPanel(preview.analysis)}
				${
					preview.warnings.length
						? `<ul class="import-warnings">${preview.warnings
								.map((warning) => `<li>${esc(warning)}</li>`)
								.join('')}</ul>`
						: ''
				}
				<form class="stack" data-form="import-expenses">
					${
						missingMethods.length
							? `<label class="check-row">
								<input type="checkbox" name="createMissingMethods" value="1" checked />
								<span>Create ${missingMethods.length} missing account${
									missingMethods.length === 1 ? '' : 's'
								}: ${missingMethods
									.map(
										(method) =>
											`<strong>${esc(method.label)}</strong> <span class="muted small">${esc(
												PAYMENT_KIND_LABELS[method.kind] || method.kind
											)}</span>`
									)
									.join(', ')}</span>
							</label>`
							: ''
					}
					<div class="grid-2">
						<label>Payment method for rows without one
							<select name="defaultMethodId" data-searchable data-combo-placeholder="Search accounts…">
								<option value="">No method</option>
								${methods
									.map(
										(method) =>
											`<option value="${method.id}"${
												String(defaultMethodId) === String(method.id) ? ' selected' : ''
											}>${esc(method.label)}${method.last4 ? ` ···· ${esc(method.last4)}` : ''}</option>`
									)
									.join('')}
							</select>
						</label>
						<div class="import-actions">
							<button class="btn" type="button" data-action="recategorize-import">${icon('sparkles')} Re-run analyst</button>
							<button class="btn" type="button" data-action="clear-import">Clear</button>
						</div>
					</div>
					<p class="hint">The analyst matched categories from the description and notes. Use the Type column to correct a row before importing; transfers need a From and To account in the Account column. Unmatched account names can be created with the checkbox above. You can also edit any imported transaction afterward.</p>
					${previewRows(rows, methods, defaultMethodId)}
					${
						rows.length > 100
							? `<p class="muted tiny">Showing the first 100 of ${rows.length} rows. All ready rows will be imported.</p>`
							: ''
					}
					<div class="form-actions">
						<button class="btn btn-primary" type="submit"${ready ? '' : ' disabled'}>Import ${ready} transaction${
							ready === 1 ? '' : 's'
						}</button>
					</div>
				</form>
			</section>`
			: `<section class="panel panel-muted">
				<div class="panel-head"><h2>How matching works</h2></div>
				<ul class="tight">
					<li>Dates are read from ISO, local, month-name, epoch, and Excel serial formats.</li>
					<li>Debit, withdrawal, and expense rows become expenses; credit, deposit, salary, and income rows become income.</li>
					<li>Transfer, InstaPay, PESONet, and "sent to"/"received from" rows become transfers. Pick the other account in the preview when it is not named in the statement.</li>
					<li>Categories come from the file when present, otherwise the local analyst's keywords infer them.</li>
					<li>Account or card names are matched to your saved payment methods; unmatched rows use the default you pick.</li>
					<li>Rows already in the ledger are marked as duplicates and excluded.</li>
				</ul>
			</section>`
	}`;
}
