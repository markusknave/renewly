import { CADENCE_LABELS, formatDateHuman, formatMoney } from './lib/dates.js';
import { catalogCategories } from './catalog.js';
import { PAYMENT_KIND_LABELS, summarizeGroups, UNGROUPED_LABEL } from './store.js';

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

function categoryLabel(category) {
	return String(category || 'Other')
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((word) => (word.toLowerCase() === 'ai' ? 'AI' : word.charAt(0).toUpperCase() + word.slice(1)))
		.join(' ');
}

function options(values, selected, labels = {}) {
	return values
		.map(
			(v) =>
				`<option value="${esc(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(
					labels[v] ?? v
				)}</option>`
		)
		.join('');
}

function avatar(name) {
	const letter = String(name || '?').trim().charAt(0).toUpperCase() || '?';
	return `<span class="avatar" aria-hidden="true">${esc(letter)}</span>`;
}

function relative(iso, today) {
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

function statusPill(sub, today) {
	if (sub.kind === 'one_time' && sub.nextRenewalDate && sub.nextRenewalDate < today) {
		return '<span class="pill pill-canceled">Expired</span>';
	}
	const status = STATUS_LABELS[sub.status] ? sub.status : 'active';
	return `<span class="pill ${STATUS_CLASS[status]}">${esc(STATUS_LABELS[status])}</span>`;
}

function dateLabel(sub, today) {
	if (!sub.nextRenewalDate) return '<span class="muted">Not set</span>';
	const verb = sub.kind === 'one_time' ? 'Expires' : 'Renews';
	return `<strong>${verb} ${esc(formatDateHuman(sub.nextRenewalDate))}</strong>
		<span class="sub">${esc(relative(sub.nextRenewalDate, today))}</span>`;
}

function costLabel(sub) {
	const money = formatMoney(sub.amountCents, sub.currency || 'PHP');
	if (sub.kind === 'one_time') return `${money}<span class="sub">one-time</span>`;
	const label = CADENCE_LABELS[sub.cadence] || sub.cadence || '';
	return `${money}<span class="sub">${esc(label)}</span>`;
}

function methodLabel(methods, id) {
	const found = methods.find((m) => m.id === id);
	if (!found) return '<span class="muted">—</span>';
	const kind = PAYMENT_KIND_LABELS[found.kind] || found.kind || 'Other';
	return `${esc(found.label)}<span class="sub">${esc(
		found.last4 ? `•••• ${found.last4}` : kind
	)}</span>`;
}

function groupName(groups, id) {
	const found = groups.find((group) => group.id === id);
	return found ? found.name : UNGROUPED_LABEL;
}

function subscriptionSub(sub, groups) {
	const plan = sub.planName || (sub.kind === 'one_time' ? 'One-time' : 'No plan');
	return groups.some((group) => group.id === sub.groupId)
		? `${plan} · ${groupName(groups, sub.groupId)}`
		: plan;
}

function summaryCards(summary, settings) {
	const next = summary.next;
	return `<section class="cards" aria-label="Summary">
		<div class="card">
			<div class="card-label">Monthly recurring</div>
			<div class="card-value">${esc(formatMoney(summary.monthlyCents, settings.currency))}</div>
			<div class="card-sub">One-time deals excluded</div>
		</div>
		<div class="card">
			<div class="card-label">Yearly recurring</div>
			<div class="card-value">${esc(formatMoney(summary.yearlyCents, settings.currency))}</div>
			<div class="card-sub">Normalized from billing cycle</div>
		</div>
		<div class="card">
			<div class="card-label">Active</div>
			<div class="card-value">${summary.activeCount}</div>
			<div class="card-sub">${summary.dueSoonCount} due soon · ${summary.overdueCount} overdue</div>
		</div>
		<div class="card">
			<div class="card-label">Next renewal</div>
			<div class="card-value small-value">${next ? esc(next.merchantName) : 'None scheduled'}</div>
			<div class="card-sub">${next ? esc(formatDateHuman(next.nextRenewalDate)) : 'Add a date to get reminders'}</div>
		</div>
	</section>`;
}

function dueSection(summary, today) {
	const rows = [...summary.overdue, ...summary.dueSoon];
	if (!rows.length) return '';
	return `<section class="panel">
		<div class="panel-head">
			<h2>Needs attention</h2>
			<span class="muted small">Overdue and due within reminder window</span>
		</div>
		<ul class="timeline">${rows
			.map(
				(s) => `<li>
					<span class="date-chip">${esc(formatDateHuman(s.nextRenewalDate))}</span>
					<span class="timeline-name">${esc(s.merchantName)}<span class="sub">${esc(
						s.kind === 'one_time' ? 'one-time deal' : s.planName || 'subscription'
					)} · ${esc(relative(s.nextRenewalDate, today))}</span></span>
					<span class="timeline-amount">${esc(formatMoney(s.amountCents, s.currency))}</span>
				</li>`
			)
			.join('')}</ul>
	</section>`;
}

function groupFilterBar(groups, groupFilter, subscriptions) {
	const hasUngrouped = subscriptions.some((sub) => !groups.some((group) => group.id === sub.groupId));
	if (!groups.length && !hasUngrouped) return '';
	const all = `<button class="chip${!groupFilter ? ' on' : ''}" type="button" data-group-filter="">All groups</button>`;
	const chips = groups.map(
		(group) =>
			`<button class="chip${String(groupFilter) === String(group.id) ? ' on' : ''}" type="button" data-group-filter="${group.id}">${esc(
				group.name
			)}</button>`
	);
	if (hasUngrouped) {
		chips.push(
			`<button class="chip${groupFilter === 'none' ? ' on' : ''}" type="button" data-group-filter="none">${esc(
				UNGROUPED_LABEL
			)}</button>`
		);
	}
	return `<div class="toolbar group-filter" role="group" aria-label="Filter by group">${all}${chips.join('')}</div>`;
}

function subscriptionRows(subscriptions, methods, today, groups = []) {
	return subscriptions
		.map(
			(s) => `<tr>
				<td><span class="merchant">${avatar(s.merchantName)}<span>${esc(s.merchantName)}<span class="sub">${esc(
					subscriptionSub(s, groups)
				)}</span></span></span></td>
				<td class="num">${costLabel(s)}</td>
				<td>${dateLabel(s, today)}</td>
				<td>${methodLabel(methods, s.paymentMethodId)}</td>
				<td>${statusPill(s, today)}</td>
				<td class="actions-head">
					<div class="actions">
						<a class="link" href="#/edit/${s.id}">Edit</a>
						<button class="link danger" type="button" data-action="delete-sub" data-id="${s.id}">Delete</button>
					</div>
				</td>
			</tr>`
		)
		.join('');
}

export function dashboardView({ subscriptions, summary, methods, groups = [], groupFilter = '', settings, today }) {
	const active = subscriptions.filter((s) => s.status !== 'canceled');
	const canceled = subscriptions.filter((s) => s.status === 'canceled');
	return `<div class="page-head">
		<div>
			<h1>Your subscriptions</h1>
			<p class="muted">Everything renewing or expiring, sorted by what needs attention first.</p>
		</div>
		<div class="page-head-actions">
			<a class="btn btn-primary" href="#/add">Add subscription</a>
		</div>
	</div>
	${groupFilterBar(groups, groupFilter, subscriptions)}
	${summaryCards(summary, settings)}
	${dueSection(summary, today)}
	<section class="panel">
		<div class="panel-head">
			<h2>Tracked</h2>
			<span class="muted small">${active.length} active · ${canceled.length} canceled</span>
		</div>
		${
			active.length
				? `<div class="table-wrap"><table class="subs-table">
					<thead><tr><th>Service</th><th>Cost</th><th>Next</th><th>Paid with</th><th>Status</th><th></th></tr></thead>
					<tbody>${subscriptionRows(active, methods, today, groups)}</tbody>
				</table></div>`
				: `<div class="empty">
					<h3>No subscriptions yet</h3>
					<p class="muted">Add one manually, or pick a plan from the catalog to prefill the price.</p>
					<p><a class="btn btn-primary" href="#/add">Add subscription</a> <a class="btn" href="#/catalog">Browse catalog</a></p>
				</div>`
		}
	</section>
	${
		canceled.length
			? `<section class="panel"><details>
				<summary><h2 class="inline-h2">Canceled (${canceled.length})</h2></summary>
				<div class="table-wrap"><table class="subs-table"><tbody>${subscriptionRows(
					canceled,
					methods,
					today,
					groups
				)}</tbody></table></div>
			</details></section>`
			: ''
	}`;
}

function platformOptions(catalog, selected) {
	const platforms = [...(catalog?.platforms ?? [])].sort((a, b) => a.name.localeCompare(b.name));
	const groups = new Map();
	for (const p of platforms) {
		const category = p.category || 'Other';
		if (!groups.has(category)) groups.set(category, []);
		groups.get(category).push(p);
	}
	const parts = [`<option value=""${selected ? '' : ' selected'}>Other / manual entry</option>`];
	for (const [category, items] of [...groups.entries()].sort((a, b) =>
		categoryLabel(a[0]).localeCompare(categoryLabel(b[0]))
	)) {
		parts.push(
			`<optgroup label="${esc(categoryLabel(category))}">${items
				.map(
					(p) =>
						`<option value="${esc(p.key)}"${p.key === selected ? ' selected' : ''}>${esc(p.name)}</option>`
				)
				.join('')}</optgroup>`
		);
	}
	return parts.join('');
}

function planOptions(platform, selected) {
	const plans = platform?.plans ?? [];
	return [
		`<option value=""${selected ? '' : ' selected'}>Manual / no catalog plan</option>`,
		...plans.map(
			(p) =>
				`<option value="${esc(p.id)}"${p.id === selected ? ' selected' : ''}>${esc(p.name)} — ${esc(
					formatMoney(p.amountCents, p.currency)
				)} ${esc(CADENCE_LABELS[p.cadence] ?? p.cadence)}</option>`
		),
	].join('');
}

export function formView({ sub, methods, groups = [], catalog, today }) {
	const s = {
		id: null,
		kind: 'recurring',
		merchantKey: '',
		merchantName: '',
		planId: '',
		planName: '',
		amountCents: 0,
		cadence: 'monthly',
		customIntervalDays: '',
		status: 'active',
		nextRenewalDate: '',
		startedOn: '',
		notes: '',
		paymentMethodId: '',
		groupId: '',
		...(sub || {}),
	};
	const platform = catalog?.platforms?.find((p) => p.key === s.merchantKey) || null;
	const kind = s.kind === 'one_time' ? 'one_time' : 'recurring';
	const amountValue = Number.isInteger(s.amountCents) && s.amountCents > 0 ? (s.amountCents / 100).toFixed(2) : '';
	const editing = Boolean(s.id);
	const dateText = kind === 'one_time' ? 'Expires on' : 'Next renewal';
	const cadenceDisabled = kind === 'one_time' ? ' disabled' : '';
	return `<div class="page-head">
		<div>
			<h1>${editing ? 'Edit subscription' : 'Add subscription'}</h1>
			<p class="muted">All values are stored on this device. Prices are in Philippine pesos.</p>
		</div>
		<div class="page-head-actions"><a class="btn" href="#/">Back</a></div>
	</div>
	<section class="panel">
		<form class="stack" data-form="subscription"${editing ? ` data-id="${s.id}"` : ''}>
			<div class="grid-2">
				<label>Platform
					<select name="platformKey" data-platform>${platformOptions(catalog, platform ? platform.key : '')}</select>
				</label>
				<label>Service name
					<input type="text" name="merchantName" maxlength="120" required value="${esc(
						s.merchantName || platform?.name || ''
					)}" placeholder="Netflix" />
				</label>
			</div>
			<div class="grid-2">
				<label>Plan
					<select name="planId" data-plan${platform ? '' : ' disabled'}>${planOptions(platform, s.planId)}</select>
					<span class="hint">${platform ? 'Pick a plan to prefill the price and billing cycle.' : 'Choose a platform to use catalog plans.'}</span>
				</label>
				<label>Plan name
					<input type="text" name="planName" maxlength="120" value="${esc(s.planName)}" placeholder="Standard" />
				</label>
			</div>
			<div class="grid-3">
				<label>Type
					<select name="kind" data-kind>
						<option value="recurring"${kind === 'recurring' ? ' selected' : ''}>Recurring</option>
						<option value="one_time"${kind === 'one_time' ? ' selected' : ''}>One-time deal</option>
					</select>
				</label>
				<label>Amount (PHP)
					<input type="text" name="amount" inputmode="decimal" value="${esc(amountValue)}" placeholder="149.00" />
				</label>
				<label>Payment method
					<select name="paymentMethodId">
						<option value="">Not set</option>
						${methods
							.map(
								(m) =>
									`<option value="${m.id}"${
										Number(s.paymentMethodId) === m.id ? ' selected' : ''
									}>${esc(m.label)}${m.last4 ? ` ···· ${esc(m.last4)}` : ''}</option>`
							)
							.join('')}
					</select>
				</label>
			</div>
			<div class="grid-3" data-cadence-wrap${kind === 'one_time' ? ' hidden' : ''}>
				<label>Billing cycle
					<select name="cadence"${cadenceDisabled}>${options(
						['weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'custom'],
						s.cadence || 'monthly',
						CADENCE_LABELS
					)}</select>
				</label>
				<label data-custom-wrap${s.cadence === 'custom' ? '' : ' hidden'}>Custom days
					<input type="number" name="customIntervalDays" min="1" max="3650" value="${esc(
						s.customIntervalDays ?? ''
					)}" />
				</label>
			</div>
			<div class="grid-3">
				<label><span data-date-label>${dateText}</span>
					<input type="date" name="nextRenewalDate" value="${esc(s.nextRenewalDate || '')}" />
				</label>
				<label>Started on
					<input type="date" name="startedOn" value="${esc(s.startedOn || '')}" />
				</label>
				<label>Status
					<select name="status">${options(['active', 'trial', 'paused', 'canceled'], s.status || 'active', STATUS_LABELS)}</select>
				</label>
				<label>Group
					<select name="groupId">
						<option value="">${esc(UNGROUPED_LABEL)}</option>
						${groups
							.map(
								(group) =>
									`<option value="${group.id}"${
										Number(s.groupId) === group.id ? ' selected' : ''
									}>${esc(group.name)}</option>`
							)
							.join('')}
					</select>
					<span class="hint">Create groups on the Groups tab.</span>
				</label>
			</div>
			<label>Notes
				<textarea name="notes" rows="2" maxlength="2000">${esc(s.notes || '')}</textarea>
			</label>
			<div class="form-actions">
				${editing ? `<button class="btn btn-danger" type="button" data-action="delete-sub" data-id="${s.id}">Delete</button>` : ''}
				<button class="btn btn-primary" type="submit">${editing ? 'Save changes' : 'Add subscription'}</button>
			</div>
		</form>
	</section>`;
}

export function catalogView({ catalog, today }) {
	if (!catalog) {
		return `<div class="page-head"><div><h1>Catalog</h1><p class="muted">Plan prices are bundled with the app.</p></div></div>
		<section class="panel"><div class="empty"><h3>Catalog unavailable</h3><p class="muted">The bundled plan catalog could not be loaded. You can still add subscriptions manually.</p><p><a class="btn btn-primary" href="#/add">Add manually</a></p></div></section>`;
	}
	const categories = catalogCategories(catalog);
	const platforms = [...catalog.platforms].sort((a, b) => a.name.localeCompare(b.name));
	const cards = platforms
		.map((p) => {
			const rows = p.plans
				.map(
					(plan) => `<tr data-plan-row data-name="${esc(
						`${p.name} ${plan.name}`.toLowerCase()
					)}"><td>${esc(plan.name)}${
						plan.native && plan.native.currency !== 'PHP'
							? `<span class="sub">${esc(plan.native.amountText || '')}</span>`
							: ''
					}</td><td class="num">${esc(formatMoney(plan.amountCents, plan.currency))}<span class="sub">${esc(
						CADENCE_LABELS[plan.cadence] ?? plan.cadence
					)}</span></td><td class="tiny muted">Verified ${esc(plan.verifiedAt)}</td><td class="actions-head"><a class="btn btn-small" href="#/add/${esc(
						p.key
					)}/${esc(plan.id)}">Use</a></td></tr>`
				)
				.join('');
			const verified = p.plans.reduce((max, plan) => (plan.verifiedAt > max ? plan.verifiedAt : max), '');
			const source = p.plans[0]?.sourceUrl;
			return `<section class="panel" data-platform-card data-name="${esc(
				p.name.toLowerCase()
			)}" data-category="${esc(p.category || 'Other')}">
				<div class="panel-head">
					<div><h2>${esc(p.name)}</h2><p class="sub">${esc(categoryLabel(p.category))} · <a href="${esc(
						p.site
					)}" target="_blank" rel="noopener">site</a></p></div>
				</div>
				<div class="table-wrap"><table class="subs-table"><tbody>${rows}</tbody></table></div>
				<p class="tiny muted">Prices checked ${esc(verified || 'unknown')} · <a href="${esc(
					source
				)}" target="_blank" rel="noopener">source</a></p>
			</section>`;
		})
		.join('');
	const fx = catalog.fx
		? `USD prices converted at ₱${Number(catalog.fx.rate).toFixed(2)} (${esc(catalog.fx.fetchedAt)}).`
		: '';
	return `<div class="page-head">
		<div><h1>Plan catalog</h1><p class="muted">Public plan prices for mainstream platforms, normalized to PHP. ${esc(
			fx
		)}</p></div>
	</div>
	<div class="toolbar">
		<input type="search" data-catalog-search placeholder="Search platform or plan" aria-label="Search catalog" />
		<button class="chip on" type="button" data-catalog-filter="">All</button>
		${categories
			.map(
				(c) =>
					`<button class="chip" type="button" data-catalog-filter="${esc(c)}">${esc(
						categoryLabel(c)
					)}</button>`
			)
			.join('')}
	</div>
	${cards || '<section class="panel"><p class="muted">No platforms in the catalog.</p></section>'}`;
}

export function cardsView({ methods }) {
	const rows = methods
		.map(
			(m) => `<form class="method-row" data-form="method" data-id="${m.id}">
				<label>Label<input type="text" name="label" maxlength="80" required value="${esc(m.label)}" /></label>
				<label>Type<select name="kind">${options(
					['card', 'ewallet', 'bank', 'cash', 'other'],
					m.kind || 'card',
					PAYMENT_KIND_LABELS
				)}</select></label>
				<label>Last 4<input type="text" name="last4" inputmode="numeric" maxlength="4" value="${esc(
					m.last4 || ''
				)}" placeholder="1234" /></label>
				<label>Notes<input type="text" name="notes" maxlength="200" value="${esc(m.notes || '')}" /></label>
				<div class="actions">
					<button class="btn btn-small" type="submit">Save</button>
					<button class="link danger" type="button" data-action="delete-method" data-id="${m.id}">Delete</button>
				</div>
			</form>`
		)
		.join('');
	return `<div class="page-head"><div><h1>Payment methods</h1><p class="muted">Labels only. Renewly never asks for a card number.</p></div></div>
	<section class="panel">
		<div class="panel-head"><h2>Add a method</h2></div>
		<form class="grid-4" data-form="method">
			<label>Label<input type="text" name="label" maxlength="80" required placeholder="BPI Visa" /></label>
			<label>Type<select name="kind">${options(
				['card', 'ewallet', 'bank', 'cash', 'other'],
				'card',
				PAYMENT_KIND_LABELS
			)}</select></label>
			<label>Last 4<input type="text" name="last4" inputmode="numeric" maxlength="4" placeholder="1234" /></label>
			<label>Notes<input type="text" name="notes" maxlength="200" /></label>
			<div class="form-actions"><button class="btn btn-primary" type="submit">Add</button></div>
		</form>
	</section>
	<section class="panel">
		<div class="panel-head"><h2>Saved methods</h2><span class="muted small">${methods.length}</span></div>
		${
			rows ||
			'<p class="muted small">No payment methods yet. Add one to label which card or e-wallet pays each subscription.</p>'
		}
	</section>`;
}

function methodBreakdown(methodCounts, methods, subscriptions) {
	if (!methodCounts.length) return '<p class="muted small">No subscriptions in this group yet.</p>';
	return `<div class="group-methods" aria-label="Payment methods used in this group">${methodCounts
		.map(({ paymentMethodId, count }) => {
			const method = methods.find((m) => m.id === paymentMethodId);
			const label = method ? method.label : 'No payment method';
			const detail = method?.last4
				? ` ···· ${method.last4}`
				: method
					? ` · ${PAYMENT_KIND_LABELS[method.kind] || method.kind}`
					: '';
			const names = subscriptions
				.filter((sub) => (sub.paymentMethodId ?? null) === paymentMethodId)
				.map((sub) => sub.merchantName)
				.join(', ');
			return `<span class="pill pill-group" title="${esc(names)}">${esc(label + detail)} <span class="count">${count}</span></span>`;
		})
		.join('')}</div>`;
}

export function groupsView({ groups, subscriptions, methods, today }) {
	const summaries = summarizeGroups(groups, subscriptions);
	const ungrouped = subscriptions.filter((sub) => !groups.some((group) => group.id === sub.groupId));
	const panels = summaries
		.map(
			(group) => `<section class="panel">
				<div class="panel-head group-head">
					<form class="group-rename" data-form="group" data-id="${group.id}">
						<input type="text" name="name" maxlength="60" required aria-label="Group name" value="${esc(
							group.name
						)}" />
						<button class="btn btn-small" type="submit">Rename</button>
					</form>
					<div class="actions">
						<span class="muted small">${group.subscriptionCount} subscription${
							group.subscriptionCount === 1 ? '' : 's'
						}</span>
						<button class="link danger" type="button" data-action="delete-group" data-id="${group.id}">Delete</button>
					</div>
				</div>
				<div class="group-methods-wrap">
					<span class="muted small">Paid with</span>
					${methodBreakdown(group.methodCounts, methods, group.subscriptions)}
				</div>
				${
					group.subscriptionCount
						? `<div class="table-wrap"><table class="subs-table">
							<thead><tr><th>Service</th><th>Cost</th><th>Next</th><th>Paid with</th><th>Status</th><th></th></tr></thead>
							<tbody>${subscriptionRows(group.subscriptions, methods, today, groups)}</tbody>
						</table></div>`
						: '<p class="muted small">No subscriptions assigned. Edit a subscription and pick this group.</p>'
				}
			</section>`
		)
		.join('');
	const ungroupedPanel = ungrouped.length
		? `<section class="panel">
				<div class="panel-head"><h2>${esc(UNGROUPED_LABEL)}</h2><span class="muted small">${ungrouped.length} subscription${
					ungrouped.length === 1 ? '' : 's'
				}</span></div>
				<div class="table-wrap"><table class="subs-table"><tbody>${subscriptionRows(
					ungrouped,
					methods,
					today,
					groups
				)}</tbody></table></div>
			</section>`
		: '';
	return `<div class="page-head">
		<div>
			<h1>Groups</h1>
			<p class="muted">Split subscriptions into lists such as Cars, Home, or Family, and see which payment method pays what.</p>
		</div>
	</div>
	<section class="panel">
		<div class="panel-head"><h2>New group</h2></div>
		<form class="grid-4" data-form="group">
			<label>Group name<input type="text" name="name" maxlength="60" required placeholder="Cars" /></label>
			<div class="form-actions"><button class="btn btn-primary" type="submit">Create group</button></div>
		</form>
		<p class="hint">Group names are stored on this device. Delete a group to keep its subscriptions and move them to ${esc(
			UNGROUPED_LABEL
		)}.</p>
	</section>
	${
		panels ||
		`<section class="panel"><div class="empty"><h3>No groups yet</h3><p class="muted">Create a group like Cars, then assign subscriptions to it from the subscription form.</p></div></section>`
	}
	${ungroupedPanel}`;
}

export function settingsView({ settings, catalog, stats, notifyPermission, subscriptionCount }) {
	const reminderDays = (settings.reminderDays || []).join(', ');
	const catalogInfo = catalog
		? `Catalog ${esc(catalog.generatedAt || 'unknown')} · ${catalog.platforms.length} platforms · region ${esc(
				catalog.region
			)}`
		: 'Catalog unavailable';
	return `<div class="page-head"><div><h1>Settings</h1><p class="muted">Everything is stored in this browser profile on this device.</p></div></div>
	<section class="panel">
		<div class="panel-head"><h2>Profile</h2></div>
		<form class="stack" data-form="settings">
			<div class="grid-2">
				<label>Time zone
					<input type="text" name="timezone" value="${esc(settings.timezone)}" placeholder="Asia/Manila" />
					<span class="hint">Used to decide what "today" means on the dashboard.</span>
				</label>
				<label>Reminder days
					<input type="text" name="reminderDays" value="${esc(reminderDays)}" placeholder="7, 3, 1" />
					<span class="hint">Comma-separated days before a renewal or expiry.</span>
				</label>
			</div>
			<div class="form-actions"><button class="btn btn-primary" type="submit">Save settings</button></div>
		</form>
	</section>
	<section class="panel">
		<div class="panel-head"><h2>Notifications</h2></div>
		<p class="muted small">On Android, Renewly schedules local reminders for each renewal and they fire even when the app is closed. On the web, notifications only fire while Renewly is open. Reminder timing comes from the reminder days above.</p>
		<button class="btn" type="button" data-action="enable-notifications">${
			notifyPermission === 'granted'
				? 'Notifications enabled'
				: notifyPermission === 'denied'
					? 'Notifications blocked in settings'
					: notifyPermission === 'unsupported'
						? 'Notifications not supported here'
						: 'Enable notifications'
		}</button>
	</section>
	<section class="panel">
		<div class="panel-head"><h2>Your data</h2><span class="muted small">${subscriptionCount} subscriptions</span></div>
		<div class="actions">
			<button class="btn" type="button" data-action="export">Export JSON</button>
			<button class="btn" type="button" data-action="import">Import JSON</button>
			<button class="btn btn-danger" type="button" data-action="clear-data">Erase all data</button>
		</div>
		<input type="file" id="import-file" accept="application/json,.json" hidden />
		<p class="hint">Export is a plain JSON file. Import replaces everything currently on this device.</p>
	</section>
	<section class="panel">
		<div class="panel-head"><h2>About</h2></div>
		<p class="muted small">${esc(catalogInfo)}</p>
		<p class="muted small">Renewly runs entirely offline. No account, no server, no email forwarding.</p>
	</section>`;
}

export function missingView() {
	return `<section class="panel"><div class="empty">
		<h3>Subscription not found</h3>
		<p class="muted">It may have been deleted on this device.</p>
		<p><a class="btn btn-primary" href="#/">Back to subscriptions</a></p>
	</div></section>`;
}
