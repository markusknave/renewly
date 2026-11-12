// Shared view helpers: escaping, icons, bank-card art, charts, and the
// subscription row fragments used by more than one screen.

import { CADENCE_LABELS, formatDateHuman, formatMoney } from '../lib/dates.js';
import { CUSTOM_PROVIDER, providersFor } from '../lib/providers.js';
import { PAYMENT_KIND_LABELS, UNGROUPED_LABEL } from '../store.js';
import {
	CARD_NETWORK_LABELS,
	cardThemeFor,
	instrumentFor,
	instrumentLabel,
} from '../lib/cardThemes.js';
import { categoryInfo } from '../lib/categories.js';

const STATUS_LABELS = {
	active: 'Active',
	trial: 'Trial',
	paused: 'Paused',
	canceled: 'Canceled',
};

const STATUS_CLASS = {
	active: 'pill-active',
	trial: 'pill-trial',
	paused: 'pill-paused',
	canceled: 'pill-canceled',
};

export function esc(value) {
	return String(value ?? '').replace(
		/[&<>"']/g,
		(ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
	);
}

export function options(values, selected, labels = {}) {
	return values
		.map(
			(v) =>
				`<option value="${esc(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(
					labels[v] ?? v
				)}</option>`
		)
		.join('');
}

const ICONS = {
	home: '<path d="M3 10.4 12 3l9 7.4"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-6h5v6"/>',
	receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
	target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
	sparkles: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
	grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
	plus: '<path d="M12 5v14M5 12h14"/>',
	close: '<path d="M6 6l12 12M18 6 6 18"/>',
	search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
	edit: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
	trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
	download: '<path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M5 19h14"/>',
	shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="m9 12 2 2 4-4"/>',
	check: '<path d="m5 12 4.5 4.5L19 7"/>',
	wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><path d="M16 14.5h2"/>',
	card: '<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M3 10h18"/><path d="M7 15h3"/>',
	calendar: '<rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
	arrowDown: '<path d="M12 4v16"/><path d="m6 14 6 6 6-6"/>',
	arrowUp: '<path d="M12 20V4"/><path d="m6 10 6-6 6 6"/>',
	trendUp: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
	trendDown: '<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
	food: '<path d="M6 3v8a3 3 0 0 0 6 0V3"/><path d="M9 11v10"/><path d="M17 3c-1.5 2-2 4-2 6 0 1.5 1 2.5 2 3v9"/>',
	basket: '<path d="M4 9h16l-1.5 11h-13z"/><path d="m8 9 3-6M16 9l-3-6"/><path d="M9 13v4M15 13v4"/>',
	car: '<path d="M4 16v-3l2-5h12l2 5v3"/><path d="M3 16h18"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/>',
	bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
	bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
	heart: '<path d="M12 20s-7-4.5-7-9.5A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 3.5C19 15.5 12 20 12 20z"/>',
	play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
	book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/>',
	plane: '<path d="M3 13l18-7-7 18-3-8z"/><path d="m11 16 3-3"/>',
	dots: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
	chevron: '<path d="m9 6 6 6-6 6"/>',
	refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
};

export function icon(name, className = 'icon') {
	const body = ICONS[name] || ICONS.dots;
	return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function categoryBadge(key) {
	const category = categoryInfo(key);
	return `<span class="cat-badge" style="--cat:${category.color}">${icon(category.icon)}</span>`;
}

export function providerOptions(kind, selected) {
	const names = providersFor(kind);
	const current = String(selected || '');
	const listed = names.includes(current);
	const parts = [];
	if (!current) parts.push('<option value="" selected>Choose…</option>');
	for (const name of names) {
		parts.push(
			`<option value="${esc(name)}"${name === current ? ' selected' : ''}>${esc(name)}</option>`
		);
	}
	parts.push(
		`<option value="${CUSTOM_PROVIDER}"${current && !listed ? ' selected' : ''}>Other / custom…</option>`
	);
	return parts.join('');
}

export function methodProviderField(kind, label) {
	const custom = Boolean(label) && !providersFor(kind).includes(label);
	return `<label>Bank / E-wallet
		<select name="provider" data-method-provider>${providerOptions(kind, label)}</select>
	</label>
	<label data-custom-method-label${custom ? '' : ' hidden'}>Custom label
		<input type="text" name="customLabel" maxlength="60" value="${
			custom ? esc(label) : ''
		}" placeholder="Bank or wallet name" />
	</label>`;
}

export function avatar(name) {
	const letter = String(name || '?').trim().charAt(0).toUpperCase() || '?';
	return `<span class="avatar" aria-hidden="true">${esc(letter)}</span>`;
}

export function relative(iso, today) {
	if (!iso) return '';
	const a = Date.parse(`${today}T00:00:00Z`);
	const b = Date.parse(`${iso}T00:00:00Z`);
	if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
	const days = Math.round((b - a) / 86_400_000);
	if (days === 0) return 'today';
	if (days === 1) return 'tomorrow';
	if (days === -1) return 'yesterday';
	if (days > 1) return `in ${days} days`;
	return `${Math.abs(days)} days ago`;
}

export function statusPill(sub, today) {
	if (sub.kind === 'one_time' && sub.nextRenewalDate && sub.nextRenewalDate < today) {
		return '<span class="pill pill-canceled">Expired</span>';
	}
	const status = STATUS_LABELS[sub.status] ? sub.status : 'active';
	return `<span class="pill ${STATUS_CLASS[status]}">${esc(STATUS_LABELS[status])}</span>`;
}

export function dateLabel(sub, today) {
	if (!sub.nextRenewalDate) return '<span class="muted">Not set</span>';
	const verb = sub.kind === 'one_time' ? 'Expires' : 'Renews';
	return `<strong>${verb} ${esc(formatDateHuman(sub.nextRenewalDate))}</strong>
		<span class="sub">${esc(relative(sub.nextRenewalDate, today))}</span>`;
}

export function costLabel(sub) {
	const money = formatMoney(sub.amountCents, sub.currency || 'PHP');
	if (sub.kind === 'one_time') return `${money}<span class="sub">one-time</span>`;
	const label = CADENCE_LABELS[sub.cadence] || sub.cadence || '';
	return `${money}<span class="sub">${esc(label)}</span>`;
}

export function methodLabel(methods, id) {
	const found = methods.find((m) => m.id === id);
	if (!found) return '<span class="muted">—</span>';
	const kind = PAYMENT_KIND_LABELS[found.kind] || found.kind || 'Other';
	return `${esc(found.label)}<span class="sub">${esc(
		found.last4 ? `•••• ${found.last4}` : kind
	)}</span>`;
}

export function groupName(groups, id) {
	const found = groups.find((group) => group.id === id);
	return found ? found.name : UNGROUPED_LABEL;
}

export function subscriptionSub(sub, groups) {
	const plan = sub.planName || (sub.kind === 'one_time' ? 'One-time' : 'No plan');
	const owner = sub.trackedFor ? ` · for ${sub.trackedFor}` : '';
	return groups.some((group) => String(group.id) === String(sub.groupId))
		? `${plan} · ${groupName(groups, sub.groupId)}${owner}`
		: `${plan}${owner}`;
}

export function subscriptionRows(subscriptions, methods, today, groups = []) {
	return subscriptions
		.map(
			(s) => `<tr>
				<td><span class="merchant">${avatar(s.merchantName)}<span><span class="merchant-name" title="${esc(
					s.merchantName
				)}">${esc(s.merchantName)}</span><span class="sub">${esc(
					subscriptionSub(s, groups)
				)}</span></span></span></td>
				<td class="num">${costLabel(s)}</td>
				<td>${dateLabel(s, today)}</td>
				<td>${methodLabel(methods, s.paymentMethodId)}</td>
				<td>${statusPill(s, today)}</td>
				<td class="actions-head">
					<div class="row-actions">
						<a class="link" href="#/edit/${s.id}">Edit</a>
						<button class="link danger" type="button" data-action="delete-sub" data-id="${s.id}">Delete</button>
					</div>
				</td>
			</tr>`
		)
		.join('');
}

export function bankCard(method, snapshot, { compact = false, showBalance = true } = {}) {
	const theme = cardThemeFor(method.label, method.kind, method.network);
	const instrument = method.instrument || instrumentFor(method.kind);
	const total = snapshot?.totalCents ?? 0;
	const pending = snapshot?.pendingCents ?? 0;
	return `<article class="bank-card${compact ? ' bank-card-compact' : ''}" style="--card-a:${theme.c1};--card-b:${theme.c2};--card-ink:${theme.ink};--card-accent:${theme.accent}">
		<span class="bank-card-pattern pattern-${theme.pattern}" aria-hidden="true"></span>
		<header class="bank-card-top">
			<span class="bank-card-issuer">${esc(theme.issuer)}</span>
			<span class="bank-card-instrument">${esc(instrumentLabel(instrument))}</span>
		</header>
		<div class="bank-card-chip" aria-hidden="true"><span></span><span></span><span></span></div>
		${
			showBalance
				? `<div class="bank-card-balance">
					<span class="bank-card-label">Available</span>
					<strong>${esc(formatMoney(total, 'PHP'))}</strong>
					${
						pending > 0
							? `<span class="bank-card-pending">+${esc(formatMoney(pending, 'PHP'))} interest accruing</span>`
							: ''
					}
				</div>`
				: ''
		}
		<footer class="bank-card-bottom">
			<span class="bank-card-number">${method.last4 ? `•••• ${esc(method.last4)}` : esc(instrumentLabel(instrument))}</span>
			<span class="bank-card-holder">${esc(method.label)}</span>
			<span class="bank-card-network">${esc(CARD_NETWORK_LABELS[theme.network] || '')}</span>
		</footer>
	</article>`;
}

export function donut(categories, totalCents, caption = 'this month') {
	const rows = (categories || []).filter((category) => category.amountCents > 0).slice(0, 6);
	if (!rows.length) {
		return `<div class="donut donut-empty"><div class="donut-hole"><strong>${esc(
			formatMoney(0, 'PHP')
		)}</strong><span>${esc(caption)}</span></div></div>`;
	}
	let cursor = 0;
	const stops = [];
	for (const row of rows) {
		const start = cursor;
		cursor += row.share;
		stops.push(`${row.color} ${start.toFixed(2)}% ${Math.min(100, cursor).toFixed(2)}%`);
	}
	if (cursor < 100) stops.push(`var(--line) ${cursor.toFixed(2)}% 100%`);
	return `<div class="donut" style="background:conic-gradient(${stops.join(',')})">
		<div class="donut-hole"><strong>${esc(formatMoney(totalCents, 'PHP'))}</strong><span>${esc(caption)}</span></div>
	</div>`;
}

export function legend(categories, totalCents) {
	const rows = (categories || []).filter((category) => category.amountCents > 0).slice(0, 5);
	if (!rows.length) return '<p class="muted small">No expenses yet in this period.</p>';
	return `<ul class="legend">${rows
		.map(
			(row) => `<li><span class="legend-dot" style="--cat:${row.color}"></span>
				<span class="legend-name">${esc(row.label)}</span>
				<span class="legend-value">${esc(formatMoney(row.amountCents, 'PHP'))}</span>
				<span class="legend-share">${Math.round(row.share)}%</span></li>`
		)
		.join('')}</ul>`;
}

export function sparkline(series, { width = 320, height = 64 } = {}) {
	const points = (series || []).map((point) => Math.max(0, Number(point.amountCents) || 0));
	if (!points.length) points.push(0);
	const max = Math.max(1, ...points);
	const step = points.length > 1 ? width / (points.length - 1) : width;
	const coords = points.map((value, index) => {
		const x = index * step;
		const y = height - 6 - (value / max) * (height - 14);
		return `${x.toFixed(1)},${y.toFixed(1)}`;
	});
	const line = `M${coords.join(' L')}`;
	const area = `${line} L${width},${height} L0,${height} Z`;
	return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
		<path class="spark-area" d="${area}"/>
		<path class="spark-line" d="${line}"/>
	</svg>`;
}

export function progressBar(percent, color = 'var(--brand)') {
	const value = Math.max(0, Math.min(100, Number(percent) || 0));
	return `<div class="progress" role="progressbar" aria-valuenow="${Math.round(value)}" aria-valuemin="0" aria-valuemax="100" style="--pct:${value}%;--progress:${color}"><span></span></div>`;
}

export function emptyState(title, body, action = '') {
	return `<div class="empty"><h3>${esc(title)}</h3><p class="muted">${esc(body)}</p>${action}</div>`;
}
