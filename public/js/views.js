// View barrel. Screens are split by feature; this file keeps the import surface
// stable for app.js and the tests.

export {
	avatar,
	bankCard,
	categoryBadge,
	costLabel,
	dateLabel,
	donut,
	emptyState,
	esc,
	groupName,
	icon,
	legend,
	methodLabel,
	methodProviderField,
	options,
	progressBar,
	providerOptions,
	relative,
	sparkline,
	statusPill,
	subscriptionRows,
	subscriptionSub,
} from './views/shared.js';

export {
	catalogView,
	dashboardView,
	formView,
	groupsView,
	missingView,
	settingsView,
} from './views/subscriptions.js';

export { cardsView } from './views/money.js';
export { homeView } from './views/home.js';
export { expenseDialog, expensesView } from './views/expenses.js';
export { goalDialog, goalsView, transferDialog } from './views/goals.js';
export { insightsView } from './views/insights.js';
export { importView } from './views/import.js';
export { moreView } from './views/more.js';
