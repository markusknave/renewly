import { openDb } from './db.js';
import * as store from './store.js';
import { findPlan, findPlatform, loadCatalog } from './catalog.js';
import {
	CADENCE_LABELS,
	formatMoney,
	parseNumericAmount,
	todayInTz,
} from './lib/dates.js';
import * as views from './views.js';

const app = document.getElementById('app');

const state = {
	db: null,
	subscriptions: [],
	methods: [],
	settings: { currency: 'PHP', timezone: 'Asia/Manila', reminderDays: [7, 3, 1] },
	catalog: null,
	flash: null,
	notifyPermission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
};

let renderToken = 0;

function parseRoute() {
	const raw = (location.hash || '#/').replace(/^#/, '');
	const [pathPart] = raw.split('?');
	const parts = pathPart.split('/').filter(Boolean);
	if (!parts.length) return { name: 'dashboard' };
	if (parts[0] === 'add') return { name: 'add', platformKey: parts[1] || '', planId: parts[2] || '' };
	if (parts[0] === 'edit') return { name: 'edit', id: Number(parts[1]) };
	if (parts[0] === 'catalog' || parts[0] === 'cards' || parts[0] === 'settings') {
		return { name: parts[0] };
	}
	return { name: 'dashboard' };
}

function slug(value) {
	return String(value || '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

function setNav(routeName) {
	const active = routeName === 'add' || routeName === 'edit' ? 'dashboard' : routeName;
	for (const link of document.querySelectorAll('[data-nav]')) {
		link.classList.toggle('on', link.dataset.nav === active);
	}
}

function banner(flash) {
	if (!flash) return '';
	return `<div class="banner ${flash.type === 'error' ? 'banner-error' : 'banner-ok'}">${views.esc(
		flash.message
	)}</div>`;
}

async function reload() {
	state.subscriptions = await store.listSubscriptions(state.db);
	state.methods = await store.listPaymentMethods(state.db);
	state.settings = await store.getSettings(state.db);
}

function today() {
	return todayInTz(state.settings.timezone || 'Asia/Manila');
}

async function render() {
	const token = ++renderToken;
	const route = parseRoute();
	const flash = state.flash;
	state.flash = null;
	setNav(route.name);
	const iso = today();
	const summary =
		route.name === 'dashboard'
			? store.summarize(state.subscriptions, { today: iso, reminderDays: state.settings.reminderDays })
			: null;

	let body = '';
	if (route.name === 'dashboard') {
		body = views.dashboardView({
			subscriptions: state.subscriptions,
			summary,
			methods: state.methods,
			settings: state.settings,
			today: iso,
		});
	} else if (route.name === 'add') {
		const defaults = { kind: 'recurring', status: 'active', currency: 'PHP' };
		if (state.catalog && route.platformKey) {
			const platform = findPlatform(state.catalog, route.platformKey);
			if (platform) {
				defaults.merchantKey = platform.key;
				defaults.merchantName = platform.name;
				const plan = findPlan(platform, route.planId);
				if (plan) {
					defaults.planId = plan.id;
					defaults.planName = plan.name;
					defaults.amountCents = plan.amountCents;
					defaults.cadence = plan.cadence;
					defaults.source = 'catalog';
				}
			}
		}
		body = views.formView({ sub: defaults, methods: state.methods, catalog: state.catalog, today: iso });
	} else if (route.name === 'edit') {
		const sub = await store.getSubscription(state.db, route.id);
		if (token !== renderToken) return;
		body = sub
			? views.formView({ sub, methods: state.methods, catalog: state.catalog, today: iso })
			: views.missingView();
	} else if (route.name === 'catalog') {
		body = views.catalogView({ catalog: state.catalog, today: iso });
	} else if (route.name === 'cards') {
		body = views.cardsView({ methods: state.methods });
	} else if (route.name === 'settings') {
		body = views.settingsView({
			settings: state.settings,
			catalog: state.catalog,
			stats: summary,
			notifyPermission: state.notifyPermission,
			subscriptionCount: state.subscriptions.length,
		});
	}

	if (token !== renderToken) return;
	app.innerHTML = banner(flash) + body;
	if (route.name === 'catalog') filterCatalog();
	if (route.name === 'dashboard') maybeNotify(summary, iso);
	window.scrollTo({ top: 0, behavior: 'instant' });
}

function filterCatalog() {
	const search = app.querySelector('[data-catalog-search]');
	const query = (search?.value || '').trim().toLowerCase();
	const chip = app.querySelector('[data-catalog-filter].on');
	const category = chip ? chip.dataset.catalogFilter : '';
	for (const card of app.querySelectorAll('[data-platform-card]')) {
		const matchesCategory = !category || card.dataset.category === category;
		const matchesPlatform = !query || card.dataset.name.includes(query);
		let visibleRows = 0;
		for (const row of card.querySelectorAll('[data-plan-row]')) {
			const visible = matchesCategory && (matchesPlatform || row.dataset.name.includes(query));
			row.hidden = !visible;
			if (visible) visibleRows += 1;
		}
		card.hidden = !matchesCategory || visibleRows === 0;
	}
}

function maybeNotify(summary, iso) {
	if (!summary || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
	const due = [...summary.overdue, ...summary.dueSoon];
	if (!due.length) return;
	const key = `renewly.notified.${iso}`;
	try {
		if (localStorage.getItem(key)) return;
		localStorage.setItem(key, '1');
	} catch {
		// Storage can be unavailable in private mode; notify anyway.
	}
	const names = due.slice(0, 3).map((s) => s.merchantName).join(', ');
	new Notification('Renewly', {
		body: `${due.length} subscription${due.length === 1 ? '' : 's'} need attention: ${names}`,
		icon: './icons/app-192.png',
	});
}

function readNumber(value) {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function subscriptionInput(form) {
	const fd = new FormData(form);
	const kind = fd.get('kind') === 'one_time' ? 'one_time' : 'recurring';
	const platformKey = String(fd.get('platformKey') || '');
	const merchantName = String(fd.get('merchantName') || '').trim();
	const amountCents = parseNumericAmount(fd.get('amount'));
	return {
		id: form.dataset.id ? Number(form.dataset.id) : undefined,
		kind,
		merchantKey: platformKey || slug(merchantName),
		merchantName,
		planId: platformKey ? String(fd.get('planId') || '') || null : null,
		planName: String(fd.get('planName') || '').trim(),
		amountCents: amountCents ?? 0,
		currency: 'PHP',
		cadence: kind === 'one_time' ? null : String(fd.get('cadence') || 'monthly'),
		customIntervalDays: kind === 'recurring' && fd.get('cadence') === 'custom' ? readNumber(fd.get('customIntervalDays')) : null,
		status: String(fd.get('status') || 'active'),
		nextRenewalDate: String(fd.get('nextRenewalDate') || '') || null,
		startedOn: String(fd.get('startedOn') || '') || null,
		lastChargeDate: null,
		notes: String(fd.get('notes') || '').trim(),
		paymentMethodId: readNumber(fd.get('paymentMethodId')),
		source: platformKey ? 'catalog' : 'manual',
	};
}

function methodInput(form) {
	const fd = new FormData(form);
	return {
		id: form.dataset.id ? Number(form.dataset.id) : undefined,
		label: String(fd.get('label') || '').trim(),
		kind: String(fd.get('kind') || 'other'),
		last4: String(fd.get('last4') || '').replace(/\D/g, '').slice(0, 4),
		notes: String(fd.get('notes') || '').trim(),
	};
}

async function onSubmit(event) {
	const form = event.target.closest('form[data-form]');
	if (!form) return;
	event.preventDefault();
	try {
		const type = form.dataset.form;
		if (type === 'subscription') {
			await store.saveSubscription(state.db, subscriptionInput(form));
			state.flash = { type: 'ok', message: 'Subscription saved' };
			await reload();
			location.hash = '#/';
			return;
		}
		if (type === 'method') {
			await store.savePaymentMethod(state.db, methodInput(form));
			state.flash = { type: 'ok', message: 'Payment method saved' };
			await reload();
			await render();
			return;
		}
		if (type === 'settings') {
			const fd = new FormData(form);
			const days = String(fd.get('reminderDays') || '')
				.split(',')
				.map((part) => Number(part.trim()))
				.filter((n) => Number.isInteger(n) && n > 0 && n <= 365);
			await store.saveSettings(state.db, {
				timezone: String(fd.get('timezone') || '').trim() || 'Asia/Manila',
				reminderDays: days.length ? days : [7, 3, 1],
			});
			state.flash = { type: 'ok', message: 'Settings saved' };
			await reload();
			await render();
		}
	} catch (err) {
		state.flash = { type: 'error', message: err?.message || 'Could not save' };
		await render();
	}
}

async function deleteSubscription(id) {
	if (!confirm('Delete this subscription?')) return;
	await store.deleteSubscription(state.db, id);
	state.flash = { type: 'ok', message: 'Subscription deleted' };
	await reload();
	if (parseRoute().name === 'edit') location.hash = '#/';
	else await render();
}

async function deleteMethod(id) {
	if (!confirm('Delete this payment method? Subscriptions using it will show no method.')) return;
	await store.deletePaymentMethod(state.db, id);
	state.flash = { type: 'ok', message: 'Payment method deleted' };
	await reload();
	await render();
}

async function exportData() {
	const data = {
		app: 'renewly',
		version: 1,
		exportedAt: new Date().toISOString(),
		settings: state.settings,
		paymentMethods: state.methods,
		subscriptions: state.subscriptions,
	};
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = `renewly-${today()}.json`;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importData(file) {
	const parsed = JSON.parse(await file.text());
	if (parsed?.app !== 'renewly' || !Array.isArray(parsed.subscriptions)) {
		throw new Error('Not a Renewly export file');
	}
	if (!confirm('Replace all data on this device with the imported file?')) return;
	await state.db.clear('subscriptions');
	await state.db.clear('paymentMethods');
	await state.db.clear('settings');
	const idMap = new Map();
	for (const method of parsed.paymentMethods || []) {
		const oldId = method.id;
		const key = await state.db.put('paymentMethods', {
			label: String(method.label || 'Method').slice(0, 80),
			kind: String(method.kind || 'other'),
			last4: String(method.last4 || '').replace(/\D/g, '').slice(0, 4),
			notes: String(method.notes || '').slice(0, 200),
			createdAt: method.createdAt || new Date().toISOString(),
		});
		if (oldId !== undefined) idMap.set(oldId, Number(key));
	}
	for (const sub of parsed.subscriptions) {
		const kind = sub.kind === 'one_time' ? 'one_time' : 'recurring';
		await state.db.put('subscriptions', {
			kind,
			merchantKey: String(sub.merchantKey || slug(sub.merchantName)),
			merchantName: String(sub.merchantName || 'Unknown').slice(0, 120),
			planId: sub.planId || null,
			planName: String(sub.planName || '').slice(0, 120),
			amountCents: Number.isInteger(sub.amountCents) ? sub.amountCents : 0,
			currency: 'PHP',
			cadence: kind === 'one_time' ? null : sub.cadence || 'monthly',
			customIntervalDays: sub.customIntervalDays ?? null,
			status: ['active', 'trial', 'paused', 'canceled'].includes(sub.status) ? sub.status : 'active',
			nextRenewalDate: sub.nextRenewalDate || null,
			startedOn: sub.startedOn || null,
			lastChargeDate: sub.lastChargeDate || null,
			notes: String(sub.notes || '').slice(0, 2000),
			paymentMethodId: sub.paymentMethodId != null ? idMap.get(sub.paymentMethodId) ?? null : null,
			source: sub.source === 'catalog' ? 'catalog' : 'manual',
			createdAt: sub.createdAt || new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
	}
	if (parsed.settings) {
		await store.saveSettings(state.db, {
			currency: 'PHP',
			timezone: String(parsed.settings.timezone || 'Asia/Manila'),
			reminderDays: Array.isArray(parsed.settings.reminderDays)
				? parsed.settings.reminderDays
				: [7, 3, 1],
		});
	}
	state.flash = { type: 'ok', message: 'Data imported' };
	await reload();
	await render();
}

async function clearData() {
	if (!confirm('Erase every subscription, payment method, and setting on this device?')) return;
	if (!confirm('This cannot be undone. Continue?')) return;
	await state.db.clear('subscriptions');
	await state.db.clear('paymentMethods');
	await state.db.clear('settings');
	state.flash = { type: 'ok', message: 'All data erased' };
	await reload();
	await render();
}

async function onClick(event) {
	const trigger = event.target.closest('[data-action]');
	if (trigger) {
		const action = trigger.dataset.action;
		try {
			if (action === 'delete-sub') await deleteSubscription(Number(trigger.dataset.id));
			else if (action === 'delete-method') await deleteMethod(Number(trigger.dataset.id));
			else if (action === 'export') await exportData();
			else if (action === 'import') document.getElementById('import-file')?.click();
			else if (action === 'clear-data') await clearData();
			else if (action === 'enable-notifications') {
				if (typeof Notification === 'undefined') {
					state.flash = { type: 'error', message: 'Notifications are not supported here' };
				} else {
					state.notifyPermission = await Notification.requestPermission();
					state.flash = {
						type: state.notifyPermission === 'granted' ? 'ok' : 'error',
						message:
							state.notifyPermission === 'granted'
								? 'Notifications enabled'
								: 'Notifications were not granted',
					};
				}
				await render();
			}
		} catch (err) {
			state.flash = { type: 'error', message: err?.message || 'Action failed' };
			await render();
		}
		return;
	}
	const chip = event.target.closest('[data-catalog-filter]');
	if (chip) {
		for (const other of app.querySelectorAll('[data-catalog-filter]')) other.classList.remove('on');
		chip.classList.add('on');
		filterCatalog();
	}
}

function onChange(event) {
	const target = event.target;
	if (target.id === 'import-file' && target.files?.[0]) {
		importData(target.files[0]).catch((err) => {
			state.flash = { type: 'error', message: err?.message || 'Import failed' };
			render();
		});
		return;
	}
	const form = target.closest('form');
	if (!form) return;
	if (target.matches('[data-platform]')) {
		const platform = findPlatform(state.catalog, target.value);
		const planSelect = form.querySelector('[data-plan]');
		if (!platform) {
			planSelect.innerHTML = '<option value="">Manual / no catalog plan</option>';
			planSelect.disabled = true;
			return;
		}
		planSelect.disabled = false;
		planSelect.innerHTML =
			'<option value="">Manual / no catalog plan</option>' +
			platform.plans
				.map(
					(plan) =>
						`<option value="${views.esc(plan.id)}">${views.esc(plan.name)} — ${views.esc(
							formatMoney(plan.amountCents, plan.currency)
						)} ${views.esc(CADENCE_LABELS[plan.cadence] ?? plan.cadence)}</option>`
				)
				.join('');
		const nameInput = form.querySelector('[name="merchantName"]');
		const planNameInput = form.querySelector('[name="planName"]');
		const amountInput = form.querySelector('[name="amount"]');
		if (nameInput) nameInput.value = platform.name;
		if (planNameInput) planNameInput.value = '';
		if (amountInput) amountInput.value = '';
		return;
	}
	if (target.matches('[data-plan]')) {
		const platformKey = form.querySelector('[data-platform]')?.value;
		const platform = findPlatform(state.catalog, platformKey);
		const plan = findPlan(platform, target.value);
		if (!plan) return;
		const planName = form.querySelector('[name="planName"]');
		const amount = form.querySelector('[name="amount"]');
		const cadence = form.querySelector('[name="cadence"]');
		if (planName) planName.value = plan.name;
		if (amount) amount.value = (plan.amountCents / 100).toFixed(2);
		if (cadence) cadence.value = plan.cadence;
		return;
	}
	if (target.matches('[data-kind]')) {
		const oneTime = target.value === 'one_time';
		const wrap = form.querySelector('[data-cadence-wrap]');
		const cadence = form.querySelector('[name="cadence"]');
		const label = form.querySelector('[data-date-label]');
		if (wrap) wrap.hidden = oneTime;
		if (cadence) cadence.disabled = oneTime;
		if (label) label.textContent = oneTime ? 'Expires on' : 'Next renewal';
		return;
	}
	if (target.matches('[name="cadence"]')) {
		const custom = form.querySelector('[data-custom-wrap]');
		if (custom) custom.hidden = target.value !== 'custom';
	}
}

function onInput(event) {
	if (event.target.matches('[data-catalog-search]')) filterCatalog();
}

async function boot() {
	try {
		state.db = await openDb();
	} catch (err) {
		app.innerHTML = `<section class="panel"><h1>Storage unavailable</h1><p class="muted">Renewly needs IndexedDB. Turn off private browsing or free up storage and reload.</p><p class="tiny muted">${views.esc(
			err?.message || String(err)
		)}</p></section>`;
		return;
	}
	try {
		state.catalog = await loadCatalog();
	} catch {
		state.catalog = null;
	}
	await reload();
	await render();
	addEventListener('hashchange', () => render());
	app.addEventListener('click', onClick);
	app.addEventListener('submit', onSubmit);
	app.addEventListener('change', onChange);
	app.addEventListener('input', onInput);
	if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
		navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
	}
}

boot();
