// "More" hub: grouped destinations so the five-item bottom bar stays focused
// on the money people check every day.

import { esc, icon } from './shared.js';

function tile({ href, iconName, title, body, meta, tone = '' }) {
	return `<a class="more-tile${tone ? ` tone-${tone}` : ''}" href="${href}">
		<span class="more-icon">${icon(iconName)}</span>
		<span class="more-copy">
			<strong>${esc(title)}</strong>
			<span class="muted small">${esc(body)}</span>
		</span>
		${meta ? `<span class="more-meta">${esc(meta)}</span>` : ''}
		${icon('chevron', 'more-chevron')}
	</a>`;
}

function group(title, caption, tiles) {
	return `<section class="more-group">
		<div class="section-head">
			<div><h2>${esc(title)}</h2><p class="muted small">${esc(caption)}</p></div>
		</div>
		<div class="more-grid">${tiles.join('')}</div>
	</section>`;
}

export function moreView({ methods = [], goals = [], subscriptions = [], transactions = [], settings }) {
	return `<div class="page-head">
		<div><p class="eyebrow">More</p><h1>Everything else, neatly grouped</h1><p class="muted">Subscriptions, accounts, tools, and the look of your tracker.</p></div>
	</div>
	<section class="more-summary">
		<div><span class="muted small">Accounts</span><strong>${methods.length}</strong></div>
		<div><span class="muted small">Subscriptions</span><strong>${subscriptions.length}</strong></div>
		<div><span class="muted small">Goals</span><strong>${goals.length}</strong></div>
		<div><span class="muted small">Ledger rows</span><strong>${transactions.length}</strong></div>
	</section>

	${group('Daily money', 'The screens you touch most.', [
		tile({
			href: '#/expenses',
			iconName: 'receipt',
			title: 'Transactions',
			body: 'Expenses, income, transfers, filters, and exports.',
			meta: `${transactions.filter((transaction) => transaction.type === 'expense').length}`,
		}),
		tile({
			href: '#/cards',
			iconName: 'card',
			title: 'Cards & wallets',
			body: 'Balances, interest, card designs, and transfers between any accounts.',
			meta: `${methods.length}`,
		}),
		tile({
			href: '#/goals',
			iconName: 'target',
			title: 'Goals',
			body: 'Targets funded from any card or wallet.',
			meta: `${goals.length}`,
		}),
	])}

	${group('Recurring', 'What renews, and who pays for it.', [
		tile({
			href: '#/subscriptions',
			iconName: 'refresh',
			title: 'Subscriptions',
			body: 'Renewals, trials, one-time deals, and reminder timing.',
			meta: `${subscriptions.length}`,
		}),
		tile({
			href: '#/groups',
			iconName: 'wallet',
			title: 'Groups',
			body: 'Cars, Home, Family, and shared payment methods.',
		}),
		tile({
			href: '#/catalog',
			iconName: 'grid',
			title: 'Plan catalog',
			body: 'Philippine prices for mainstream platforms.',
		}),
	])}

	${group('Tools', 'Read data in, get answers out.', [
		tile({
			href: '#/import',
			iconName: 'download',
			title: 'Import transactions',
			body: 'CSV, PDF, Excel, JSON, or Money Manager backups.',
		}),
		tile({
			href: '#/insights',
			iconName: 'sparkles',
			title: 'Local analyst',
			body: 'Forecasts and answers computed on this device.',
		}),
	])}

	${group('App', 'Make Renewly feel like yours.', [
		tile({
			href: '#/appearance',
			iconName: 'sparkles',
			title: 'Appearance',
			body: 'Five themes, custom colours, and ten bundled fonts.',
			meta: `${settings?.theme || 'ivory'}`,
			tone: 'accent',
		}),
		tile({
			href: '#/settings',
			iconName: 'shield',
			title: 'Settings & backup',
			body: `Time zone ${settings?.timezone || 'Asia/Manila'} · JSON export and import.`,
		}),
	])}

	<section class="panel panel-muted">
		<div class="panel-head"><h2>About this build</h2><span class="pill">beta-2.2</span></div>
		<p class="muted small">Renewly is a local-only money tracker. Balances are derived from the starting balance you enter plus the transactions you log, transfers you move, and interest the app accrues. It is not connected to any bank; figures are only as accurate as your entries.</p>
		<p class="muted small">Interest uses the annual rate you enter (gross of the 20% final tax).</p>
	</section>`;
}
