import { openDb } from './db.js';
import * as store from './store.js';
import * as notifications from './notifications.js';
import * as backup from './backup.js';
import { CUSTOM_PROVIDER } from './lib/providers.js';
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
	groups: [],
	groupFilter: '',
	methods: [],
	settings: { currency: 'PHP', timezone: 'Asia/Manila', reminderDays: [7, 3, 1] },
	catalog: null,
	flash: null,
	// Set when a submitted subscription duplicates an existing tracker: the
	// form is re-rendered with its values plus the "tracked for" question.
	formDraft: null,
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
	if (parts[0] === 'catalog' || parts[0] === 'cards' || parts[0] === 'groups' || parts[0] === 'settings') {
		return { name: parts[0] };
	}
	return { name: 'dashboard' };
}

function routeKey(route) {
	if (route.name === 'add') return 'add';
	if (route.name === 'edit') return `edit:${route.id}`;
	return route.name;
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
	state.groups = await store.listGroups(state.db);
	state.methods = await store.listPaymentMethods(state.db);
	state.settings = await store.getSettings(state.db);
	if (state.groupFilter && state.groupFilter !== 'none'
		&& !state.groups.some((group) => String(group.id) === String(state.groupFilter))) {
		state.groupFilter = '';
	}
	await syncReminders();
}

async function syncReminders(options = {}) {
	try {
		await notifications.syncReminders({
			subscriptions: state.subscriptions,
			reminderDays: state.settings.reminderDays,
			today: today(),
			request: Boolean(options.request),
		});
	} catch {
		// Reminder scheduling must never block saving or rendering.
	}
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
	const filtered =
		route.name === 'dashboard' && state.groupFilter
			? state.subscriptions.filter((sub) =>
					state.groupFilter === 'none'
						? !state.groups.some((group) => group.id === sub.groupId)
						: String(sub.groupId) === String(state.groupFilter)
				)
			: state.subscriptions;
	const summary =
		route.name === 'dashboard'
			? store.summarize(filtered, { today: iso, reminderDays: state.settings.reminderDays })
			: null;
	const key = routeKey(route);
	const draft = state.formDraft && state.formDraft.route === key ? state.formDraft : null;
	const duplicate = draft?.duplicate ?? null;

	let body = '';
	if (route.name === 'dashboard') {
		body = views.dashboardView({
			subscriptions: filtered,
			allSubscriptions: state.subscriptions,
			summary,
			methods: state.methods,
			groups: state.groups,
			groupFilter: state.groupFilter,
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
		body = views.formView({
			sub: draft?.data || defaults,
			methods: state.methods,
			groups: state.groups,
			catalog: state.catalog,
			today: iso,
			duplicate:
				duplicate ||
				(defaults.merchantName
					? store.findDuplicateSubscription(state.subscriptions, defaults)
					: null),
		});
	} else if (route.name === 'edit') {
		const sub = await store.getSubscription(state.db, route.id);
		if (token !== renderToken) return;
		const editing = draft?.data || sub;
		body = editing
			? views.formView({
					sub: editing,
					methods: state.methods,
					groups: state.groups,
					catalog: state.catalog,
					today: iso,
					duplicate,
				})
			: views.missingView();
	} else if (route.name === 'catalog') {
		body = views.catalogView({ catalog: state.catalog, today: iso });
	} else if (route.name === 'cards') {
		body = views.cardsView({ methods: state.methods });
	} else if (route.name === 'groups') {
		body = views.groupsView({
			groups: state.groups,
			subscriptions: state.subscriptions,
			methods: state.methods,
			today: iso,
		});
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
	if (notifications.isNativeNotifications()) return;
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
		groupId: readNumber(fd.get('groupId')),
		trackedFor: String(fd.get('trackedFor') || '').trim() || null,
		source: platformKey ? 'catalog' : 'manual',
	};
}

function methodInput(form) {
	const fd = new FormData(form);
	const provider = String(fd.get('provider') || '');
	const label =
		provider === CUSTOM_PROVIDER
			? String(fd.get('customLabel') || '').trim()
			: provider.trim();
	return {
		id: form.dataset.id ? Number(form.dataset.id) : undefined,
		label,
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
			const input = subscriptionInput(form);
			// Same service, plan, and owner already tracked: stop and ask
			// whether this is a tracker for another person or group.
			const duplicate = store.findDuplicateSubscription(state.subscriptions, input);
			if (duplicate) {
				const route = parseRoute();
				state.formDraft = { route: routeKey(route), data: input, duplicate };
				await render();
				return;
			}
			state.formDraft = null;
			await store.saveSubscription(state.db, input);
			state.flash = { type: 'ok', message: 'Subscription saved' };
			await reload();
			if (state.notifyPermission === 'default') {
				await syncReminders({ request: true });
				state.notifyPermission = await notifications.permissionState();
			}
			location.hash = '#/';
			return;
		}
		if (type === 'method') {
			const input = methodInput(form);
			if (!input.label) throw new Error('Choose a bank or e-wallet, or pick Other and type a name.');
			await store.savePaymentMethod(state.db, input);
			state.flash = { type: 'ok', message: 'Payment method saved' };
			await reload();
			await render();
			return;
		}
		if (type === 'import') {
			const fd = new FormData(form);
			const text = String(fd.get('backupText') || '').trim();
			if (!text) throw new Error('Choose a backup file or paste its JSON first.');
			const file = form.querySelector('#import-file')?.files?.[0];
			await importBackupText(file ? await file.text() : text);
			return;
		}
		if (type === 'group') {
			const fd = new FormData(form);
			await store.saveGroup(state.db, {
				id: form.dataset.id ? Number(form.dataset.id) : undefined,
				name: String(fd.get('name') || '').trim(),
			});
			state.flash = { type: 'ok', message: form.dataset.id ? 'Group renamed' : 'Group created' };
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
		if (form.dataset.form === 'import') {
			showImportError(err?.message || 'Import failed');
			return;
		}
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

async function deleteGroup(id) {
	if (!confirm('Delete this group? Its subscriptions will move to Ungrouped.')) return;
	await store.deleteGroup(state.db, id);
	state.flash = { type: 'ok', message: 'Group deleted' };
	await reload();
	await render();
}

// Writes the backup where the platform can actually put a file. Android's
// WebView silently ignores `<a download>` for blob URLs, so native builds go
// through Filesystem + Share; browsers use the save picker when available and
// fall back to a download.
async function saveBackupFile(text, fileName) {
	const capacitor = globalThis.Capacitor;
	if (capacitor && typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform()) {
		const Filesystem = capacitor.Plugins?.Filesystem;
		const Share = capacitor.Plugins?.Share;
		if (Filesystem?.writeFile) {
			const { uri } = await Filesystem.writeFile({
				path: fileName,
				data: text,
				directory: 'CACHE',
				encoding: 'UTF8',
			});
			if (Share?.share && uri) {
				await Share.share({
					title: fileName,
					dialogTitle: 'Save Renewly backup',
					files: [uri],
				});
				return 'shared';
			}
			return 'saved';
		}
	}

	if (typeof globalThis.showSaveFilePicker === 'function') {
		try {
			const handle = await globalThis.showSaveFilePicker({
				suggestedName: fileName,
				types: [{ description: 'JSON backup', accept: { 'application/json': ['.json'] } }],
			});
			const writable = await handle.createWritable();
			await writable.write(text);
			await writable.close();
			return 'saved';
		} catch (err) {
			if (err?.name === 'AbortError') return 'cancelled';
			// Fall through to a plain download when the picker is blocked.
		}
	}

	const blob = new Blob([text], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	link.rel = 'noopener';
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 4000);
	return 'downloaded';
}

async function exportData() {
	const fileName = `renewly-${today()}.json`;
	const text = backup.serializeExport(
		backup.buildExport({
			settings: state.settings,
			groups: state.groups,
			paymentMethods: state.methods,
			subscriptions: state.subscriptions,
		})
	);
	const outcome = await saveBackupFile(text, fileName);
	if (outcome === 'cancelled') return;
	state.flash = {
		type: 'ok',
		message:
			outcome === 'downloaded'
				? `Backup downloaded as ${fileName}`
				: `Backup ready — save ${fileName} from the share sheet`,
	};
	await render();
}

function importDialog() {
	return document.getElementById('import-dialog');
}

function showImportError(message) {
	const dialog = importDialog();
	const target = document.getElementById('import-error');
	if (target) {
		target.textContent = message;
		target.hidden = false;
		return;
	}
	state.flash = { type: 'error', message };
	render();
	if (dialog) openImportDialog();
}

function openImportDialog() {
	const dialog = importDialog();
	if (!dialog) return;
	const error = document.getElementById('import-error');
	if (error) {
		error.hidden = true;
		error.textContent = '';
	}
	const textarea = dialog.querySelector('[name="backupText"]');
	if (textarea) textarea.value = '';
	if (typeof dialog.showModal === 'function') dialog.showModal();
	else dialog.setAttribute('open', '');
}

function closeImportDialog() {
	const dialog = importDialog();
	if (!dialog) return;
	if (typeof dialog.close === 'function') dialog.close();
	else dialog.removeAttribute('open');
}

async function importBackupText(text) {
	const normalized = backup.normalizeBackup(backup.parseBackup(text));
	if (!confirm('Replace all data on this device with the imported backup?')) return;
	const result = await backup.applyBackup(state.db, normalized);
	closeImportDialog();
	state.flash = {
		type: 'ok',
		message: `Imported ${result.imported} subscriptions, ${result.groups} groups, and ${result.paymentMethods} payment methods`,
	};
	await reload();
	await render();
}

async function clearData() {
	if (!confirm('Erase every subscription, group, payment method, and setting on this device?')) return;
	if (!confirm('This cannot be undone. Continue?')) return;
	await state.db.clear('subscriptions');
	await state.db.clear('paymentMethods');
	await state.db.clear('groups');
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
			else if (action === 'delete-group') await deleteGroup(Number(trigger.dataset.id));
			else if (action === 'export') await exportData();
			else if (action === 'import') openImportDialog();
			else if (action === 'close-import') closeImportDialog();
			else if (action === 'clear-data') await clearData();
			else if (action === 'enable-notifications') {
				state.notifyPermission = await notifications.requestPermission();
				if (state.notifyPermission === 'granted') await syncReminders({ request: true });
				state.flash = {
					type: state.notifyPermission === 'granted' ? 'ok' : 'error',
					message:
						state.notifyPermission === 'granted'
							? notifications.isNativeNotifications()
								? 'Notifications enabled — reminders are scheduled on this device'
								: 'Notifications enabled'
							: 'Notifications were not granted',
				};
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
		return;
	}
	const groupChip = event.target.closest('[data-group-filter]');
	if (groupChip) {
		state.groupFilter = groupChip.dataset.groupFilter;
		await render();
	}
}

async function onChange(event) {
	const target = event.target;
	if (target.id === 'import-file' && target.files?.[0]) {
		const file = target.files[0];
		try {
			await importBackupText(await file.text());
		} catch (err) {
			showImportError(err?.message || 'Import failed');
		} finally {
			target.value = '';
		}
		return;
	}
	const form = target.closest('form');
	if (!form) return;
	if (target.matches('[data-method-kind]')) {
		const providerSelect = form.querySelector('[data-method-provider]');
		if (providerSelect) providerSelect.innerHTML = views.providerOptions(target.value, '');
		const customWrap = form.querySelector('[data-custom-method-label]');
		if (customWrap) {
			customWrap.hidden = true;
			const customInput = customWrap.querySelector('input');
			if (customInput) customInput.value = '';
		}
		return;
	}
	if (target.matches('[data-method-provider]')) {
		const customWrap = form.querySelector('[data-custom-method-label]');
		if (customWrap) {
			customWrap.hidden = target.value !== CUSTOM_PROVIDER;
			if (!customWrap.hidden) customWrap.querySelector('input')?.focus();
		}
		return;
	}
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
	state.notifyPermission = await notifications.permissionState();
	if (
		notifications.isNativeNotifications()
		&& state.notifyPermission === 'default'
		&& state.subscriptions.length
	) {
		await syncReminders({ request: true });
		state.notifyPermission = await notifications.permissionState();
	}
	await notifications.listenForNotificationTaps((id) => {
		if (Number.isInteger(id) && id > 0) location.hash = `#/edit/${id}`;
	});
	await render();
	addEventListener('hashchange', () => {
		// Leaving the add/edit screen drops any duplicate-tracking draft.
		state.formDraft = null;
		render();
	});
	app.addEventListener('click', onClick);
	app.addEventListener('submit', onSubmit);
	app.addEventListener('change', onChange);
	app.addEventListener('input', onInput);
	if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
		navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
	}
}

boot();
