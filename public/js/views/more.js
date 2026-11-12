// "More" hub: the subscription and configuration screens live here so the
// bottom navigation can stay focused on money.

import { formatMoney } from '../lib/dates.js';
import { esc, icon } from './shared.js';

function tile({ href, iconName, title, body, meta }) {
	return `<a class="more-tile" href="${href}">
		<span class="more-icon">${icon(iconName)}</span>
		<span class="more-copy">
			<strong>${esc(title)}</strong>
			<span class="muted small">${esc(body)}</span>
		</span>
		${meta ? `<span class="more-meta">${esc(meta)}</span>` : ''}
		${icon('chevron', 'more-chevron')}
	</a>`;
}

export function moreView({ methods = [], goals = [], subscriptions = [], transactions = [], settings }) {
	return `<div class="page-head">
		<div><p class="eyebrow">More</p><h1>Everything else</h1><p class="muted">Subscriptions, accounts, and local settings.</p></div>
	</div>
	<section class="more-summary">
		<div><span class="muted small">Payment methods</span><strong>${methods.length}</strong></div>
		<div><span class="muted small">Subscriptions</span><strong>${subscriptions.length}</strong></div>
		<div><span class="muted small">Goals</span><strong>${goals.length}</strong></div>
		<div><span class="muted small">Ledger entries</span><strong>${transactions.length}</strong></div>
	</section>
	<section class="more-grid">
		${tile({
			href: '#/subscriptions',
			iconName: 'refresh',
			title: 'Subscriptions',
			body: 'Renewals, trials, one-time deals, and reminder timing.',
			meta: `${subscriptions.length}`,
		})}
		${tile({
			href: '#/cards',
			iconName: 'card',
			title: 'Cards & wallets',
			body: 'Balances, interest rates, compounding, and card designs.',
			meta: `${methods.length}`,
		})}
		${tile({
			href: '#/goals',
			iconName: 'target',
			title: 'Goals',
			body: 'Targets funded from any card or wallet inside the app.',
			meta: `${goals.length}`,
		})}
		${tile({
			href: '#/expenses',
			iconName: 'receipt',
			title: 'Expenses & reports',
			body: 'Filter by date, then export CSV, Excel, or PDF.',
			meta: `${transactions.filter((transaction) => transaction.type === 'expense').length}`,
		})}
		${tile({
			href: '#/catalog',
			iconName: 'grid',
			title: 'Plan catalog',
			body: 'Philippine prices for mainstream subscription platforms.',
		})}
		${tile({
			href: '#/groups',
			iconName: 'wallet',
			title: 'Subscription groups',
			body: 'Cars, Home, Family, and who pays for what.',
		})}
		${tile({
			href: '#/settings',
			iconName: 'shield',
			title: 'Settings & backup',
			body: `Time zone ${settings?.timezone || 'Asia/Manila'} · JSON export and import.`,
		})}
	</section>
	<section class="panel panel-muted">
		<div class="panel-head"><h2>About this build</h2><span class="pill">beta-1.1</span></div>
		<p class="muted small">Renewly is a local-only money tracker. Balances are derived from the starting balance you enter plus the transactions you log and the interest the app accrues. It is not connected to any bank; figures are only as accurate as your entries.</p>
		<p class="muted small">Interest uses the annual rate you enter (gross of the 20% final tax). Card artwork is an original CSS recreation inspired by each issuer's public colours, not official bank artwork.</p>
	</section>`;
}
