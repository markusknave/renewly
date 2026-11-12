import { openDb } from './db.js';
import * as store from './store.js';
import * as finance from './finance.js';
import { answerQuestion, buildInsights } from './insights.js';
import * as report from './export.js';
import * as notifications from './notifications.js';
import * as backup from './backup.js';
import { CUSTOM_PROVIDER } from './lib/providers.js';
import { findPlan, findPlatform, loadCatalog } from './catalog.js';
import { formatMoney, parseNumericAmount, todayInTz } from './lib/dates.js';
import { EXPENSE_CATEGORIES } from './lib/categories.js';
import * as views from './views.js';

const app = document.getElementById('app');

const state = {
	db: null,
	subscriptions: [],
	groups: [],
	methods: [],
	transactions: [],
	goals: [],
	groupFilter: '',
	settings: { currency: 'PHP', timezone: 'Asia/Manila', reminderDays: [7, 3, 1] },
	catalog: null,
	flash: null,
	formDraft: null,
	notifyPermission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
	filters: { preset: 'this_month', from: '', to: '', category: '', methodId: '', query: '' },
	chat: [],
	pendingExpenseOpen: false,
	pendingGoalOpen: false,
};

let renderToken = 0;

function todayIso() {
	return todayInTz(state.settings.timezone || 'Asia/Manila');
}

function parseRoute() {
	const raw = (location.hash || '#/').replace(/^#/, '');
	const [pathPart] = raw.split('?');
	const parts = pathPart.split('/').filter(Boolean);
	if (!parts.length) return { name: 'home' };
	if (parts[0] === 'add') return { name: 'add', platformKey: parts[1] || '', planId: parts[2] || '' };
	if (parts[0] === 'edit') return { name: 'edit', id: Number(parts[1]) };
	const known = ['expenses', 'goals', 'insights', 'more', 'subscriptions', 'catalog', 'cards', 'groups', 'settings'];
	if (known.includes(parts[0])) return { name: parts[0] };
	return { name: 'home' };
}

function routeKey(route) {
	if (route.name === 'add') return 'add';
	if (route.name === 'edit') return `edit:${route.id}`;
	return route.name;
}

function setNav(routeName) {
	const map = {
		home: 'home',
		expenses: 'expenses',
		goals: 'goals',
		insights: 'insights',
		more: 'more',
		subscriptions: 'more',
		cards: 'more',
		catalog: 'more',
		groups: 'more',
		settings: 'more',
		add: 'more',
		edit: 'more',
	};
	const active = map[routeName] || 'home';
	for (const link of document.querySelectorAll('[data-nav]')) {
		link.classList.toggle('on', link.dataset.nav === active || link.dataset.nav === routeName);
	}
}

function slug(value) {
	return String(value || '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
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
	state.goals = await store.listGoals(state.db);
	state.transactions = await store.listTransactions(state.db);
	state.settings = await store.getSettings(state.db);
	if (
		state.groupFilter
		&& state.groupFilter !== 'none'
		&& !state.groups.some((group) => String(group.id) === String(state.groupFilter))
	) {
		state.groupFilter = '';
	}
	try {
		await finance.accrueInterest(state.db, state.methods, state.transactions, todayIso());
		state.transactions = await store.listTransactions(state.db);
	} catch {
		// Interest accrual must never block saving or rendering.
	}
	await syncReminders();
}

async function syncReminders(options = {}) {
	try {
		await notifications.syncReminders({
			subscriptions: state.subscriptions,
			reminderDays: state.settings.reminderDays,
			today: todayIso(),
			request: Boolean(options.request),
		});
	} catch {
		// Reminder scheduling must never block saving or rendering.
	}
}

function filterTransactions(range) {
	const query = state.filters.query.trim().toLowerCase();
	return state.transactions.filter((transaction) => {
		if (!finance.inRange(transaction, range.from, range.to)) return false;
		if (state.filters.category && (transaction.type !== 'expense' || transaction.category !== state.filters.category)) {
			return false;
		}
		if (
			state.filters.methodId
			&& String(transaction.paymentMethodId ?? '') !== String(state.filters.methodId)
		) {
			return false;
		}
		if (query) {
			const haystack = `${transaction.merchant || ''} ${transaction.notes || ''} ${transaction.category || ''} ${
				transaction.type
			}`.toLowerCase();
			if (!haystack.includes(query)) return false;
		}
		return true;
	});
}

function greeting() {
	const hour = new Date().getHours();
	if (hour < 12) return 'Good morning';
	if (hour < 18) return 'Good afternoon';
	return 'Good evening';
}

async function render() {
	const token = ++renderToken;
	const route = parseRoute();
	const flash = state.flash;
	state.flash = null;
	setNav(route.name);
	const iso = todayIso();

	const snapshots = state.methods.map((method) => finance.methodSnapshot(method, state.transactions, iso));
	const totalCents = snapshots.reduce((sum, snapshot) => sum + snapshot.totalCents, 0);
	const interestEarnedCents = snapshots.reduce((sum, snapshot) => sum + snapshot.interestEarnedCents, 0);
	const pendingInterestCents = snapshots.reduce((sum, snapshot) => sum + snapshot.pendingCents, 0);
	const goalRows = finance.goalSnapshots(state.goals, state.transactions, iso);
	const month = finance.summarizePeriod(state.transactions, finance.monthRange(iso));
	const lastMonth = finance.summarizePeriod(state.transactions, finance.lastMonthRange(iso));
	const subscriptionSummary = store.summarize(state.subscriptions, {
		today: iso,
		reminderDays: state.settings.reminderDays,
	});
	const insightData = buildInsights({
		transactions: state.transactions,
		methods: state.methods,
		goals: state.goals,
		subscriptions: state.subscriptions,
		today: iso,
		settings: state.settings,
	});

	const range = finance.rangeForPreset(state.filters.preset, iso, {
		from: state.filters.from,
		to: state.filters.to,
	});
	state.filters.from = range.from;
	state.filters.to = range.to;
	const filtered = filterTransactions(range);
	const filteredSummary = finance.summarizePeriod(filtered, range);

	const groupFilteredSubscriptions = state.groupFilter
		? state.subscriptions.filter((sub) =>
				state.groupFilter === 'none'
					? !state.groups.some((group) => group.id === sub.groupId)
					: String(sub.groupId) === String(state.groupFilter)
			)
		: state.subscriptions;
	const subscriptionPageSummary = store.summarize(groupFilteredSubscriptions, {
		today: iso,
		reminderDays: state.settings.reminderDays,
	});

	const key = routeKey(route);
	const draft = state.formDraft && state.formDraft.route === key ? state.formDraft : null;
	const duplicate = draft?.duplicate ?? null;

	let body = '';
	if (route.name === 'home') {
		body = views.homeView({
			today: iso,
			settings: state.settings,
			methods: state.methods,
			snapshots,
			totalCents,
			month,
			lastMonth,
			interestEarnedCents,
			pendingInterestCents,
			goalRows,
			subscriptionSummary,
			transactions: state.transactions,
			sparkSeries: insightData.forecast.series.filter((point) => !point.projected),
			greeting: greeting(),
		});
	} else if (route.name === 'expenses') {
		body = views.expensesView({
			today: iso,
			methods: state.methods,
			filters: state.filters,
			range,
			summary: filteredSummary,
			rows: filtered,
			categories: EXPENSE_CATEGORIES,
		});
	} else if (route.name === 'goals') {
		body = views.goalsView({
			today: iso,
			methods: state.methods,
			goals: state.goals,
			goalRows,
			transactions: state.transactions,
		});
	} else if (route.name === 'insights') {
		body = views.insightsView({
			insights: insightData,
			goalRows,
			chat: state.chat,
			methods: state.methods,
		});
	} else if (route.name === 'more') {
		body = views.moreView({
			methods: state.methods,
			goals: state.goals,
			subscriptions: state.subscriptions,
			transactions: state.transactions,
			settings: state.settings,
		});
	} else if (route.name === 'subscriptions') {
		body = views.dashboardView({
			subscriptions: groupFilteredSubscriptions,
			allSubscriptions: state.subscriptions,
			summary: subscriptionPageSummary,
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
				duplicate
				|| (defaults.merchantName
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
		body = views.cardsView({ methods: state.methods, snapshots, today: iso });
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
			stats: null,
			notifyPermission: state.notifyPermission,
			subscriptionCount: state.subscriptions.length,
		});
	}

	if (token !== renderToken) return;
	app.innerHTML = banner(flash) + body;
	if (route.name === 'catalog') filterCatalog();
	if (route.name === 'home' || route.name === 'subscriptions') maybeNotify(subscriptionSummary, iso);

	if (route.name === 'expenses' && state.pendingExpenseOpen) {
		state.pendingExpenseOpen = false;
		openExpenseDialog();
	}
	if (route.name === 'goals' && state.pendingGoalOpen) {
		state.pendingGoalOpen = false;
		openGoalDialog();
	}
	if (route.name === 'insights' && state.chat.length) {
		const log = document.getElementById('chat-log');
		if (log) log.scrollIntoView({ block: 'center', behavior: 'smooth' });
	} else {
		window.scrollTo({ top: 0, behavior: 'instant' });
	}
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
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
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
		customIntervalDays:
			kind === 'recurring' && fd.get('cadence') === 'custom'
				? readNumber(fd.get('customIntervalDays'))
				: null,
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
		provider === CUSTOM_PROVIDER ? String(fd.get('customLabel') || '').trim() : provider.trim();
	const rateText = String(fd.get('interestRate') || '').trim();
	const rate = rateText ? Math.round(Number(rateText) * 100) : 0;
	return {
		id: form.dataset.id ? Number(form.dataset.id) : undefined,
		label,
		kind: String(fd.get('kind') || 'other'),
		last4: String(fd.get('last4') || '').replace(/\D/g, '').slice(0, 4),
		network: String(fd.get('network') || ''),
		instrument: String(fd.get('instrument') || ''),
		openingBalanceCents: parseNumericAmount(fd.get('openingBalance')) ?? 0,
		openingDate: String(fd.get('openingDate') || '') || null,
		interestRateBps: Number.isFinite(rate) ? rate : 0,
		interestFrequency: String(fd.get('interestFrequency') || 'none'),
		notes: String(fd.get('notes') || '').trim(),
	};
}

function expenseInput(form) {
	const fd = new FormData(form);
	return {
		id: form.dataset.id ? Number(form.dataset.id) : undefined,
		date: String(fd.get('date') || ''),
		merchant: String(fd.get('merchant') || '').trim(),
		category: String(fd.get('category') || 'other'),
		amountCents: parseNumericAmount(fd.get('amount')) ?? 0,
		paymentMethodId: readNumber(fd.get('paymentMethodId')),
		notes: String(fd.get('notes') || '').trim(),
	};
}

function goalInput(form) {
	const fd = new FormData(form);
	return {
		id: form.dataset.id ? Number(form.dataset.id) : undefined,
		name: String(fd.get('name') || '').trim(),
		targetCents: parseNumericAmount(fd.get('target')) ?? 0,
		deadline: String(fd.get('deadline') || '') || null,
		color: String(fd.get('color') || 'indigo'),
		note: String(fd.get('note') || '').trim(),
	};
}

function transferInput(form) {
	const fd = new FormData(form);
	return {
		goalId: readNumber(fd.get('goalSelect') || fd.get('goalId')),
		paymentMethodId: readNumber(fd.get('paymentMethodId')),
		direction: String(fd.get('direction') || 'to_goal'),
		amountCents: parseNumericAmount(fd.get('amount')) ?? 0,
		date: String(fd.get('date') || todayIso()),
	};
}

function dialogError(form, message) {
	const dialog = form.closest('dialog');
	const target = dialog?.querySelector('[data-dialog-error]');
	if (!target) return false;
	target.textContent = message;
	target.hidden = false;
	return true;
}

function showDialog(dialog) {
	if (!dialog) return;
	const error = dialog.querySelector('[data-dialog-error]');
	if (error) {
		error.hidden = true;
		error.textContent = '';
	}
	if (typeof dialog.showModal === 'function') dialog.showModal();
	else dialog.setAttribute('open', '');
}

function closeDialog(id) {
	const dialog = document.getElementById(id);
	if (!dialog) return;
	if (typeof dialog.close === 'function') dialog.close();
	else dialog.removeAttribute('open');
}

function openExpenseDialog(id = null) {
	const dialog = document.getElementById('expense-dialog');
	if (!dialog) return;
	const form = dialog.querySelector('form[data-form="expense"]');
	form.reset();
	form.dataset.id = '';
	const transaction = id ? state.transactions.find((row) => Number(row.id) === Number(id)) : null;
	const title = dialog.querySelector('[data-expense-dialog-title]');
	if (title) title.textContent = transaction ? 'Edit expense' : 'Add expense';
	form.elements.date.value = transaction?.date || todayIso();
	form.elements.paymentMethodId.value = transaction?.paymentMethodId ?? state.methods[0]?.id ?? '';
	if (transaction) {
		form.dataset.id = transaction.id;
		form.elements.amount.value = (transaction.amountCents / 100).toFixed(2);
		form.elements.merchant.value = transaction.merchant;
		form.elements.category.value = transaction.category;
		form.elements.notes.value = transaction.notes || '';
	}
	showDialog(dialog);
	const focus = form.elements.amount;
	if (focus) setTimeout(() => focus.focus(), 30);
}

function openGoalDialog(id = null) {
	const dialog = document.getElementById('goal-dialog');
	if (!dialog) return;
	const form = dialog.querySelector('form[data-form="goal"]');
	form.reset();
	form.dataset.id = '';
	const goal = id ? state.goals.find((row) => Number(row.id) === Number(id)) : null;
	const title = dialog.querySelector('[data-goal-dialog-title]');
	if (title) title.textContent = goal ? 'Edit goal' : 'New goal';
	if (goal) {
		form.dataset.id = goal.id;
		form.elements.name.value = goal.name;
		form.elements.target.value = (goal.targetCents / 100).toFixed(2);
		form.elements.deadline.value = goal.deadline || '';
		form.elements.color.value = goal.color || 'indigo';
		form.elements.note.value = goal.note || '';
	}
	showDialog(dialog);
}

function openTransferDialog(goalId, direction = 'to_goal') {
	if (!state.methods.length) {
		state.flash = { type: 'error', message: 'Add a payment method before moving money into a goal.' };
		render();
		return;
	}
	const dialog = document.getElementById('transfer-dialog');
	if (!dialog) return;
	const form = dialog.querySelector('form[data-form="transfer"]');
	form.reset();
	const goal = state.goals.find((row) => Number(row.id) === Number(goalId));
	const title = dialog.querySelector('[data-transfer-dialog-title]');
	if (title) title.textContent = goal ? `${direction === 'from_goal' ? 'Withdraw from' : 'Add money to'} ${goal.name}` : 'Move money';
	form.elements.goalSelect.value = goalId;
	form.elements.goalId.value = goalId;
	form.elements.direction.value = direction;
	form.elements.paymentMethodId.value = state.methods[0].id;
	form.elements.date.value = todayIso();
	showDialog(dialog);
}

async function newExpense() {
	if (parseRoute().name !== 'expenses') {
		state.pendingExpenseOpen = true;
		location.hash = '#/expenses';
		return;
	}
	openExpenseDialog();
}

async function newGoal() {
	if (parseRoute().name !== 'goals') {
		state.pendingGoalOpen = true;
		location.hash = '#/goals';
		return;
	}
	openGoalDialog();
}

function base64FromBytes(bytes) {
	let binary = '';
	const chunk = 0x8000;
	for (let index = 0; index < bytes.length; index += chunk) {
		binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
	}
	return btoa(binary);
}

// Writes a file where the platform can actually put it. Android's WebView
// silently ignores `<a download>` for blob URLs, so native builds go through
// Filesystem + Share; browsers use the save picker when available and fall
// back to a normal download.
async function saveFile({ data, fileName, mime, description }) {
	const capacitor = globalThis.Capacitor;
	if (capacitor && typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform()) {
		const Filesystem = capacitor.Plugins?.Filesystem;
		const Share = capacitor.Plugins?.Share;
		if (Filesystem?.writeFile) {
			const binary = data instanceof Uint8Array;
			const { uri } = await Filesystem.writeFile({
				path: fileName,
				data: binary ? base64FromBytes(data) : data,
				directory: 'CACHE',
				...(binary ? {} : { encoding: 'utf8' }),
			});
			if (Share?.share && uri) {
				await Share.share({
					title: fileName,
					dialogTitle: description || 'Save Renewly file',
					files: [uri],
				});
				return 'shared';
			}
			return 'saved';
		}
	}

	if (typeof globalThis.showSaveFilePicker === 'function') {
		try {
			const extension = fileName.slice(fileName.lastIndexOf('.'));
			const handle = await globalThis.showSaveFilePicker({
				suggestedName: fileName,
				types: [{ description: description || 'Renewly export', accept: { [mime]: [extension] } }],
			});
			const writable = await handle.createWritable();
			await writable.write(data);
			await writable.close();
			return 'saved';
		} catch (err) {
			if (err?.name === 'AbortError') return 'cancelled';
			// Fall through to a plain download when the picker is blocked.
		}
	}

	const blob = new Blob([data], { type: mime });
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
	const fileName = `renewly-${todayIso()}.json`;
	const text = backup.serializeExport(
		backup.buildExport({
			settings: state.settings,
			groups: state.groups,
			paymentMethods: state.methods,
			subscriptions: state.subscriptions,
			goals: state.goals,
			transactions: state.transactions,
		})
	);
	const outcome = await saveFile({
		data: text,
		fileName,
		mime: 'application/json',
		description: 'Renewly JSON backup',
	});
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

async function exportReport(format) {
	const iso = todayIso();
	const range = finance.rangeForPreset(state.filters.preset, iso, {
		from: state.filters.from,
		to: state.filters.to,
	});
	const built = report.buildReport({
		transactions: filterTransactions(range),
		methods: state.methods,
		goals: state.goals,
		from: range.from,
		to: range.to,
		today: iso,
		generatedAt: new Date().toISOString(),
	});
	if (!built.rows.length) {
		state.flash = { type: 'error', message: 'No transactions in this range to export.' };
		await render();
		return;
	}
	let data;
	let mime;
	let description;
	if (format === 'xlsx') {
		data = await report.toXlsx(built);
		mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
		description = 'Excel workbook';
	} else if (format === 'pdf') {
		data = report.toPdf(built);
		mime = 'application/pdf';
		description = 'PDF report';
	} else {
		data = report.toCsv(built);
		mime = 'text/csv';
		description = 'CSV file';
	}
	const fileName = report.reportFileName(format, built);
	const outcome = await saveFile({ data, fileName, mime, description });
	if (outcome === 'cancelled') return;
	state.flash = {
		type: 'ok',
		message:
			outcome === 'downloaded'
				? `Downloaded ${fileName} (${report.reportSummaryLine(built)})`
				: `Report ready — save ${fileName} from the share sheet`,
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
	state.chat = [];
	state.flash = {
		type: 'ok',
		message: `Imported ${result.imported} subscriptions, ${result.transactions} ledger entries, ${result.goals} goals, and ${result.paymentMethods} payment methods`,
	};
	await reload();
	await render();
}

async function clearData() {
	if (!confirm('Erase every subscription, expense, goal, payment method, and setting on this device?')) return;
	if (!confirm('This cannot be undone. Continue?')) return;
	await state.db.clear('subscriptions');
	await state.db.clear('paymentMethods');
	await state.db.clear('groups');
	await state.db.clear('transactions');
	await state.db.clear('goals');
	await state.db.clear('settings');
	state.chat = [];
	state.flash = { type: 'ok', message: 'All data erased' };
	await reload();
	await render();
}

async function deleteExpense(id) {
	if (!confirm('Delete this expense? The card balance will go back up.')) return;
	await store.deleteExpense(state.db, id);
	state.flash = { type: 'ok', message: 'Expense deleted' };
	await reload();
	await render();
}

async function deleteGoal(id) {
	if (!confirm('Delete this goal? Transfers into it will be removed and the money returns to the source payment methods.')) return;
	await store.deleteGoal(state.db, id);
	state.flash = { type: 'ok', message: 'Goal deleted' };
	await reload();
	await render();
}

async function onSubmit(event) {
	const form = event.target.closest('form[data-form]');
	if (!form) return;
	event.preventDefault();
	const type = form.dataset.form;
	try {
		if (type === 'subscription') {
			const input = subscriptionInput(form);
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
			if (location.hash === '#/subscriptions') await render();
			else location.hash = '#/subscriptions';
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
		if (type === 'expense') {
			const input = expenseInput(form);
			await store.saveExpense(state.db, input);
			closeDialog('expense-dialog');
			state.flash = { type: 'ok', message: input.id ? 'Expense updated' : 'Expense added' };
			await reload();
			await render();
			return;
		}
		if (type === 'goal') {
			const input = goalInput(form);
			await store.saveGoal(state.db, input);
			closeDialog('goal-dialog');
			state.flash = { type: 'ok', message: input.id ? 'Goal updated' : 'Goal created' };
			await reload();
			await render();
			return;
		}
		if (type === 'transfer') {
			const input = transferInput(form);
			await store.saveGoalTransfer(state.db, input);
			closeDialog('transfer-dialog');
			state.flash = {
				type: 'ok',
				message: input.direction === 'from_goal' ? 'Money returned to the payment method' : 'Money moved into the goal',
			};
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
				.filter((number) => Number.isInteger(number) && number > 0 && number <= 365);
			await store.saveSettings(state.db, {
				timezone: String(fd.get('timezone') || '').trim() || 'Asia/Manila',
				reminderDays: days.length ? days : [7, 3, 1],
			});
			state.flash = { type: 'ok', message: 'Settings saved' };
			await reload();
			await render();
			return;
		}
		if (type === 'chat') {
			const fd = new FormData(form);
			const question = String(fd.get('message') || '').trim();
			if (!question) return;
			const context = {
				transactions: state.transactions,
				methods: state.methods,
				goals: state.goals,
				subscriptions: state.subscriptions,
				today: todayIso(),
				settings: state.settings,
				insights: buildInsights({
					transactions: state.transactions,
					methods: state.methods,
					goals: state.goals,
					subscriptions: state.subscriptions,
					today: todayIso(),
					settings: state.settings,
				}),
			};
			state.chat.push({ role: 'user', text: question });
			state.chat.push({ role: 'assistant', text: answerQuestion(question, context) });
			form.reset();
			await render();
			return;
		}
	} catch (err) {
		if (type === 'import') {
			showImportError(err?.message || 'Import failed');
			return;
		}
		if (dialogError(form, err?.message || 'Could not save')) return;
		state.flash = { type: 'error', message: err?.message || 'Could not save' };
		await render();
	}
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
			else if (action === 'new-expense') await newExpense();
			else if (action === 'edit-expense') openExpenseDialog(Number(trigger.dataset.id));
			else if (action === 'delete-expense') await deleteExpense(Number(trigger.dataset.id));
			else if (action === 'close-expense') closeDialog('expense-dialog');
			else if (action === 'new-goal') await newGoal();
			else if (action === 'edit-goal') openGoalDialog(Number(trigger.dataset.id));
			else if (action === 'delete-goal') await deleteGoal(Number(trigger.dataset.id));
			else if (action === 'close-goal') closeDialog('goal-dialog');
			else if (action === 'transfer-goal') openTransferDialog(Number(trigger.dataset.id), 'to_goal');
			else if (action === 'withdraw-goal') openTransferDialog(Number(trigger.dataset.id), 'from_goal');
			else if (action === 'close-transfer') closeDialog('transfer-dialog');
			else if (action === 'export-report') await exportReport(trigger.dataset.format || 'csv');
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
	const prompt = event.target.closest('[data-chat-prompt]');
	if (prompt) {
		const form = document.querySelector('form[data-form="chat"]');
		if (form) form.elements.message.value = prompt.dataset.chatPrompt;
		if (form) form.requestSubmit();
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

function filterExpenseDom() {
	const list = document.getElementById('expense-list');
	if (!list) return;
	const query = state.filters.query.trim().toLowerCase();
	let count = 0;
	let total = 0;
	for (const row of list.querySelectorAll('[data-txn]')) {
		const matchCategory =
			!state.filters.category
			|| (row.dataset.type === 'expense' && row.dataset.category === state.filters.category);
		const matchMethod =
			!state.filters.methodId || row.dataset.method === String(state.filters.methodId);
		const matchQuery = !query || row.dataset.search.includes(query);
		const visible = matchCategory && matchMethod && matchQuery;
		row.hidden = !visible;
		if (visible) {
			if (row.dataset.type === 'expense') {
				count += 1;
				total += Number(row.dataset.expenseAmount) || 0;
			}
		}
	}
	for (const group of list.querySelectorAll('[data-date-group]')) {
		group.hidden = ![...group.querySelectorAll('[data-txn]')].some((row) => !row.hidden);
	}
	const countTarget = document.querySelector('[data-expense-count]');
	const totalTarget = document.querySelector('[data-expense-total]');
	if (countTarget) countTarget.textContent = String(count);
	if (totalTarget) totalTarget.textContent = formatMoney(total, 'PHP');
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

	if (target.matches('[data-expense-preset]')) {
		state.filters.preset = target.value;
		await render();
		return;
	}
	if (target.matches('[data-expense-from]')) {
		state.filters.preset = 'custom';
		state.filters.from = target.value;
		await render();
		return;
	}
	if (target.matches('[data-expense-to]')) {
		state.filters.preset = 'custom';
		state.filters.to = target.value;
		await render();
		return;
	}
	if (target.matches('[data-expense-category]')) {
		state.filters.category = target.value;
		filterExpenseDom();
		return;
	}
	if (target.matches('[data-expense-method]')) {
		state.filters.methodId = target.value;
		filterExpenseDom();
		return;
	}
	if (target.matches('[data-transfer-goal]')) {
		const form = target.closest('form');
		if (form?.elements.goalId) form.elements.goalId.value = target.value;
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
			'<option value="">Manual / no catalog plan</option>'
			+ platform.plans
				.map(
					(plan) =>
						`<option value="${views.esc(plan.id)}">${views.esc(plan.name)} — ${views.esc(
							formatMoney(plan.amountCents, plan.currency)
						)} ${views.esc(plan.cadence)}</option>`
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
	if (event.target.matches('[data-catalog-search]')) {
		filterCatalog();
		return;
	}
	if (event.target.matches('[data-expense-search]')) {
		state.filters.query = event.target.value;
		filterExpenseDom();
	}
}

async function deleteSubscription(id) {
	if (!confirm('Delete this subscription?')) return;
	await store.deleteSubscription(state.db, id);
	state.flash = { type: 'ok', message: 'Subscription deleted' };
	await reload();
	if (parseRoute().name === 'edit') location.hash = '#/subscriptions';
	else await render();
}

async function deleteMethod(id) {
	if (!confirm('Delete this payment method? Its card and interest history will be removed; logged spending stays in the ledger.')) return;
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
		state.formDraft = null;
		render();
	});
	document.addEventListener('click', onClick);
	document.addEventListener('submit', onSubmit);
	document.addEventListener('change', onChange);
	document.addEventListener('input', onInput);
	if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
		navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
	}
}

boot();
