// Import review dialog: file picker, parsed preview as readable rows, analyst
// summary, and duplicate-safe commit. Everything fits the dialog width; there
// is no horizontal scrolling.

import { formatDateHuman, formatMoney } from '../lib/dates.js';
import { categoryLabel } from '../lib/categories.js';
import { PAYMENT_KIND_LABELS } from '../store.js';
import { IMPORT_ACCEPT } from '../import.js';
import { categoryBadge, esc, icon } from './shared.js';

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

function transferFields(row, methods, defaultMethodId = null) {
	const source = row.paymentMethodId ?? defaultMethodId ?? '';
	return `<div class="import-transfer-pair">
		<label>From
			<select class="import-transfer-select" data-import-transfer-source data-index="${
				row.index
			}" data-searchable data-combo-placeholder="Search source…" aria-label="Transfer source account">
				<option value="">From account…</option>
				${accountOptions(methods, source)}
			</select>
		</label>
		<label>To
			<select class="import-transfer-select" data-import-transfer data-index="${
				row.index
			}" data-searchable data-combo-placeholder="Search destination…" aria-label="Transfer destination account">
				<option value="">To account…</option>
				${accountOptions(methods, row.transferMethodId, source)}
			</select>
		</label>
	</div>`;
}

function previewRows(rows, methods, defaultMethodId = null) {
	if (!rows.length) return '<p class="muted small">No transaction rows were recognized.</p>';
	return `<ul class="import-rows">${rows
		.slice(0, 100)
		.map(
			(row, index) => `<li class="import-row${row.duplicate ? ' is-duplicate' : ''}">
				<div class="import-row-top">
					<span class="import-date">${esc(formatDateHuman(row.date) || row.date)}</span>
					<span class="import-amount ${row.type === 'income' ? 'in' : row.type === 'transfer' ? 'move' : 'out'}">${
						row.type === 'income' ? '+' : row.type === 'transfer' ? '⇄ ' : '−'
					}${esc(formatMoney(row.amountCents, 'PHP'))}</span>
				</div>
				<div class="import-main">
					<strong class="import-merchant">${esc(row.merchant)}</strong>
					${row.notes ? `<span class="import-note">${esc(row.notes)}</span>` : ''}
				</div>
				<div class="import-fields">
					<label>Type
						<select data-import-type data-index="${index}">
							<option value="expense"${row.type === 'expense' ? ' selected' : ''}>Expense</option>
							<option value="income"${row.type === 'income' ? ' selected' : ''}>Income</option>
							<option value="transfer"${row.type === 'transfer' ? ' selected' : ''}>Transfer</option>
						</select>
					</label>
					<div class="field import-category">
						<span class="field-label">Category</span>
						<span class="import-category-value">${
							row.type === 'transfer'
								? '<span>—</span>'
								: `${categoryBadge(row.category)}<span>${esc(categoryLabel(row.category))}</span>`
						}</span>
					</div>
				</div>
				<div class="import-row-foot">
					<div class="import-account">
						${
							row.type === 'transfer'
								? transferFields({ ...row, index }, methods, defaultMethodId)
								: `<span class="field-label">Account</span><span class="import-account-value">${esc(
										row.methodLabel || 'Default account'
									)}</span>`
						}
					</div>
					<div class="import-status">${statusPill(row, defaultMethodId)}</div>
				</div>
			</li>`
		)
		.join('')}</ul>`;
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

	return `<dialog class="dialog dialog-wide" id="transaction-import-dialog" aria-labelledby="import-dialog-title">
		<div class="dialog-head">
			<h2 id="import-dialog-title">${preview ? 'Review import' : 'Import transactions'}</h2>
			<button class="icon-btn" type="button" data-action="close-transaction-import" aria-label="Close">${icon('close')}</button>
		</div>
		<div class="dialog-body">
			<label class="dropzone${busy ? ' is-busy' : ''}" for="expense-import-file">
				<input type="file" id="expense-import-file" accept="${IMPORT_ACCEPT}" hidden />
				<span class="dropzone-icon">${icon('download')}</span>
				<span class="dropzone-copy">
					<strong>${busy ? 'Reading file…' : 'Choose a file or drop it here'}</strong>
					<span class="muted small">CSV, PDF, Excel (.xlsx), JSON, or Money Manager .mbak/.mmbak</span>
				</span>
			</label>
			<p class="hint">PDF import reads selectable text. Scanned statements need OCR first. Files are capped at 25 MB. Everything stays on this device.</p>

			${
				preview
					? `<div class="import-review">
						<div class="import-file-head">
							<strong>${esc(preview.fileName)}</strong>
							<span class="pill">${esc(preview.format)}</span>
						</div>
						<section class="import-stats">
							<div><span class="muted small">Rows</span><strong>${stats?.total ?? rows.length}</strong></div>
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
							<div class="import-toolbar">
								<label>Default account
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
									<button class="btn btn-small" type="button" data-action="recategorize-import">${icon('sparkles')} Re-run analyst</button>
									<button class="btn btn-small" type="button" data-action="clear-import">Clear</button>
								</div>
							</div>
							<p class="hint">Check the type and category for each row. Transfers need a From and To account. Rows already in the ledger are skipped.</p>
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
					</div>`
					: `<section class="import-help">
						<div class="panel-head"><h3>How matching works</h3></div>
						<ul class="tight">
							<li>Dates are read from ISO, local, month-name, epoch, and Excel serial formats.</li>
							<li>Debit, withdrawal, and expense rows become expenses; credit, deposit, salary, and income rows become income.</li>
							<li>Transfer, InstaPay, PESONet, and "sent to"/"received from" rows become transfers. Pick the other account when it is not named in the statement.</li>
							<li>Categories come from the file when present, otherwise the local analyst's keywords infer them.</li>
							<li>Rows already in the ledger are marked as duplicates and excluded.</li>
						</ul>
					</section>`
			}
		</div>
	</dialog>`;
}
