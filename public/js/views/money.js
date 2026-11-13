// Payment-method screen: visual cards plus balances, rates, and compounding.

import { INTEREST_FREQUENCY_LABELS } from '../finance.js';
import {
	CARD_NETWORKS,
	CARD_NETWORK_LABELS,
	INSTRUMENTS,
	INSTRUMENT_LABELS,
	cardThemeFor,
	instrumentFor,
	instrumentLabel,
} from '../lib/cardThemes.js';
import { PAYMENT_KIND_LABELS } from '../store.js';
import { bankCard, breadcrumb, esc, icon, methodProviderField, options } from './shared.js';

function networkOptions(selected) {
	return [
		`<option value=""${!selected ? ' selected' : ''}>Auto from issuer</option>`,
		...CARD_NETWORKS.map(
			(network) =>
				`<option value="${network}"${selected === network ? ' selected' : ''}>${esc(
					CARD_NETWORK_LABELS[network]
				)}</option>`
		),
	].join('');
}

function frequencyOptions(selected) {
	return options(['none', 'daily', 'monthly'], selected || 'none', INTEREST_FREQUENCY_LABELS);
}

function methodFields(method) {
	const kind = method.kind || 'other';
	const opening = Number.isInteger(method.openingBalanceCents) ? (method.openingBalanceCents / 100).toFixed(2) : '';
	const rate = Number.isInteger(method.interestRateBps) ? (method.interestRateBps / 100).toFixed(2) : '';
	return `<div class="grid-3">
		<label>Type<select name="kind" data-method-kind>${options(
			['card', 'ewallet', 'bank', 'credit', 'cash', 'other'],
			kind,
			PAYMENT_KIND_LABELS
		)}</select></label>
		${methodProviderField(kind, method.label || '')}
		<label>Instrument<select name="instrument">${options(
			INSTRUMENTS,
			instrumentFor(kind, method.instrument),
			INSTRUMENT_LABELS
		)}</select></label>
		<label>Last 4<input type="text" name="last4" inputmode="numeric" maxlength="4" value="${esc(
			method.last4 || ''
		)}" placeholder="1234" /></label>
	</div>
	<div class="grid-3">
		<label data-network-field${kind === 'card' ? '' : ' hidden'}>Network<select name="network">${networkOptions(method.network || '')}</select></label>
		<label>Starting balance (PHP)<input type="text" name="openingBalance" inputmode="decimal" value="${esc(
			opening
		)}" placeholder="0.00" /></label>
		<label>Balance as of<input type="date" name="openingDate" value="${esc(method.openingDate || '')}" /></label>
	</div>
	<div class="grid-3">
		<label>Interest rate (% p.a.)<input type="text" name="interestRate" inputmode="decimal" value="${esc(
			rate
		)}" placeholder="3.25" /><span class="hint">Enter the advertised annual rate. 3.25 means 3.25% per year.</span></label>
		<label>Compounding<select name="interestFrequency">${frequencyOptions(
			method.interestFrequency
		)}</select></label>
		<label>Notes<input type="text" name="notes" maxlength="200" value="${esc(
			method.notes || ''
		)}" placeholder="Optional" /></label>
	</div>`;
}

export function cardsView({ methods = [], snapshots = [], today }) {
	const snapshotFor = (id) =>
		snapshots.find((snapshot) => Number(snapshot.method?.id ?? snapshot.id) === Number(id)) || null;
	const rows = methods
		.map((method) => {
			const theme = cardThemeFor(method.label, method.kind, method.network);
			return `<article class="method-card">
				${bankCard(method, snapshotFor(method.id))}
				<div class="method-meta">
					<span class="pill">${esc(PAYMENT_KIND_LABELS[method.kind] || method.kind)}</span>
					<span class="pill">${esc(instrumentLabel(method.instrument || instrumentFor(method.kind)))}</span>
					${
						method.interestFrequency && method.interestFrequency !== 'none'
							? `<span class="pill pill-interest">${esc(
									(method.interestRateBps / 100).toFixed(2)
								)}% p.a. · ${esc(INTEREST_FREQUENCY_LABELS[method.interestFrequency])}</span>`
							: '<span class="pill muted-pill">No interest</span>'
					}
				</div>
				<details class="method-edit">
					<summary>${icon('edit')} Edit ${esc(method.label)}</summary>
					<form class="stack compact" data-form="method" data-id="${method.id}">
						${methodFields(method)}
						<div class="form-actions">
							<button class="btn btn-small btn-danger" type="button" data-action="delete-method" data-id="${method.id}">Delete</button>
							<button class="btn btn-small btn-primary" type="submit">Save changes</button>
						</div>
					</form>
				</details>
			</article>`;
		})
		.join('');

	return `${breadcrumb([{ label: 'More', href: '#/more' }, { label: 'Cards & wallets' }])}<div class="page-head">
		<div><p class="eyebrow">Money</p><h1>Cards & wallets</h1><p class="muted">Balances and interest are simulated on this device. Renewly never asks for a full card number.</p></div>
		<div class="page-head-actions">
			<button class="btn" type="button" data-action="new-transfer">${icon('transfer')} Transfer money</button>
			<a class="btn" href="#/">Back to dashboard</a>
		</div>
	</div>
	<section class="panel">
		<div class="panel-head"><h2>Add a card, wallet, or credit line</h2></div>
		<form class="stack compact" data-form="method">
			${methodFields({ kind: 'card', label: '', openingDate: today || '' })}
			<div class="form-actions"><button class="btn btn-primary" type="submit">Add payment method</button></div>
		</form>
	</section>
	<section class="panel">
		<div class="panel-head"><h2>Your money</h2><span class="muted small">${methods.length} saved</span></div>
		${
			rows ||
			`<div class="empty"><h3>No payment methods yet</h3><p class="muted">Add a bank, card, e-wallet, or credit line, set its current balance, and optionally its annual interest rate.</p></div>`
		}
	</section>
	<section class="panel panel-muted">
		<div class="panel-head"><h2>How interest is calculated</h2></div>
		<p class="muted small">Interest uses the annual rate you enter against the running balance: daily compounding applies rate ÷ 365 each day, monthly compounding applies rate ÷ 12 at month end. Completed months are posted to the ledger automatically; the current month appears as pending on the card and is included in the balance. Rates are gross of the 20% final tax on Philippine deposit interest.</p>
	</section>`;
}
