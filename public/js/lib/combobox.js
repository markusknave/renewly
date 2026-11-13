// Searchable select enhancement. Native <select> elements stay in the DOM so
// forms and existing handlers keep working unchanged; this adds a trigger, a
// search field, and a filtered option list on top of them.
//
// The enhancement is progressive: tests and non-DOM callers never import this
// module's side effects, and selects without data-searchable stay native.

const states = new WeakMap();
let openState = null;
let idCounter = 0;

function normalize(value) {
	return String(value ?? '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '');
}

function selectedText(select) {
	const option = select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
	const text = option ? option.textContent.trim() : '';
	return text || select.dataset.comboPlaceholder || 'Choose…';
}

function positionPanel(state) {
	const { trigger, panel } = state;
	if (panel.hidden || !trigger.isConnected) return;
	const rect = trigger.getBoundingClientRect();
	const width = Math.min(
		Math.max(rect.width, 230),
		Math.max(240, window.innerWidth - 16)
	);
	panel.style.width = `${width}px`;
	const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
	const below = window.innerHeight - rect.bottom - 12;
	const above = rect.top - 12;
	const flip = below < 170 && above > below;
	const height = Math.min(280, Math.max(170, flip ? above : below));
	panel.style.left = `${left}px`;
	panel.style.top = `${flip ? Math.max(8, rect.top - height - 6) : rect.bottom + 6}px`;
	panel.style.maxHeight = `${height}px`;
}

function closeOpen() {
	if (!openState) return;
	const state = openState;
	openState = null;
	state.panel.hidden = true;
	state.open = false;
	state.trigger.setAttribute('aria-expanded', 'false');
	state.wrapper.classList.remove('is-open');
	state.activeIndex = -1;
	for (const button of state.buttons) button.classList.remove('is-active');
}

function visibleButtons(state) {
	return state.buttons.filter((button) => !button.hidden && !button.disabled);
}

function setActive(state, index) {
	const options = visibleButtons(state);
	if (!options.length) {
		state.activeIndex = -1;
		return;
	}
	state.activeIndex = Math.max(0, Math.min(index, options.length - 1));
	state.buttons.forEach((button) => button.classList.remove('is-active'));
	const active = options[state.activeIndex];
	active.classList.add('is-active');
	active.scrollIntoView({ block: 'nearest' });
}

function filterList(state) {
	const query = normalize(state.search.value).trim();
	const tokens = query.split(/\s+/).filter(Boolean);
	for (const button of state.buttons) {
		const haystack = normalize(`${button.textContent} ${button.dataset.search || ''}`);
		button.hidden = tokens.length > 0 && !tokens.every((token) => haystack.includes(token));
	}
	const options = visibleButtons(state);
	state.empty.hidden = options.length > 0;
	state.activeIndex = -1;
	state.buttons.forEach((button) => button.classList.remove('is-active'));
}

function choose(state, value) {
	state.select.value = String(value);
	state.syncTrigger();
	state.select.dispatchEvent(new Event('input', { bubbles: true }));
	state.select.dispatchEvent(new Event('change', { bubbles: true }));
	closeOpen();
	state.trigger.focus();
}

function open(state) {
	if (state.select.disabled) return;
	if (openState && openState !== state) closeOpen();
	state.filterList();
	state.panel.hidden = false;
	state.open = true;
	state.trigger.setAttribute('aria-expanded', 'true');
	state.wrapper.classList.add('is-open');
	openState = state;
	positionPanel(state);
	state.search.value = '';
	state.filterList();
	const selected = state.buttons.find((button) => button.dataset.value === state.select.value);
	const selectedIndex = selected ? visibleButtons(state).indexOf(selected) : -1;
	setActive(state, selectedIndex >= 0 ? selectedIndex : 0);
	if (state.search.hidden) {
		visibleButtons(state)[state.activeIndex]?.focus({ preventScroll: true });
	} else {
		state.search.focus();
	}
}

function rebuild(state) {
	const { select, list } = state;
	list.replaceChildren();
	state.buttons = [];
	const options = [...select.options].filter((option) => !option.hidden);
	for (const option of options) {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'combo-option';
		button.dataset.value = option.value;
		button.dataset.search = option.dataset.search || '';
		button.setAttribute('role', 'option');
		button.tabIndex = -1;
		button.textContent = option.textContent.trim() || option.value;
		button.disabled = option.disabled;
		button.setAttribute('aria-selected', String(option.selected));
		button.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (!button.disabled) choose(state, button.dataset.value);
		});
		button.addEventListener('pointermove', () => {
			const index = visibleButtons(state).indexOf(button);
			if (index >= 0) setActive(state, index);
		});
		list.append(button);
		state.buttons.push(button);
	}
	state.syncTrigger();
	state.filterList();
}

function attach(select) {
	const existing = states.get(select);
	if (existing) return existing;

	const wrapper = document.createElement('div');
	wrapper.className = 'combo';
	select.classList.add('combo-native');
	select.setAttribute('tabindex', '-1');
	select.parentNode.insertBefore(wrapper, select);
	wrapper.append(select);

	const trigger = document.createElement('button');
	trigger.type = 'button';
	trigger.className = 'combo-trigger';
	trigger.setAttribute('aria-haspopup', 'listbox');
	trigger.setAttribute('aria-expanded', 'false');
	const labelText = select.closest('label')
		? [...select.closest('label').childNodes]
				.filter((node) => node.nodeType === 3)
				.map((node) => node.textContent)
				.join(' ')
				.replace(/\s+/g, ' ')
				.trim()
		: '';
	trigger.setAttribute('aria-label', select.getAttribute('aria-label') || labelText || select.name || 'Choose an option');
	const value = document.createElement('span');
	value.className = 'combo-value';
	const caret = document.createElement('span');
	caret.className = 'combo-caret';
	caret.setAttribute('aria-hidden', 'true');
	trigger.append(value, caret);

	const panel = document.createElement('div');
	panel.className = 'combo-panel';
	panel.id = `combo-panel-${++idCounter}`;
	panel.hidden = true;
	panel.setAttribute('role', 'listbox');
	trigger.setAttribute('aria-controls', panel.id);

	const search = document.createElement('input');
	search.type = 'search';
	search.className = 'combo-search';
	search.autocomplete = 'off';
	search.spellcheck = false;
	search.placeholder = select.dataset.comboPlaceholder || 'Search…';
	search.setAttribute('aria-label', 'Search options');
	if (!select.hasAttribute('data-searchable')) search.hidden = true;

	const list = document.createElement('div');
	list.className = 'combo-list';
	const empty = document.createElement('p');
	empty.className = 'combo-empty';
	empty.textContent = 'No matches';
	empty.hidden = true;
	panel.append(search, list, empty);
	wrapper.append(trigger, panel);

	const state = {
		select,
		wrapper,
		trigger,
		panel,
		search,
		list,
		empty,
		buttons: [],
		open: false,
		activeIndex: -1,
		syncTrigger() {
			value.textContent = selectedText(select);
			trigger.disabled = select.disabled;
			trigger.title = selectedText(select);
			for (const button of state.buttons) {
				button.setAttribute('aria-selected', String(button.dataset.value === select.value));
			}
		},
		filterList: () => filterList(state),
	};
	states.set(select, state);

	trigger.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (state.open) closeOpen();
		else open(state);
	});
	trigger.addEventListener('keydown', (event) => {
		if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
			event.preventDefault();
			open(state);
		}
	});
	search.addEventListener('input', () => state.filterList());
	search.addEventListener('keydown', (event) => {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			setActive(state, state.activeIndex + 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			setActive(state, state.activeIndex - 1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			const options = visibleButtons(state);
			const active = options[state.activeIndex] || options[0];
			if (active) choose(state, active.dataset.value);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			closeOpen();
			trigger.focus();
		} else if (event.key === 'Tab') {
			closeOpen();
		}
	});
	panel.addEventListener('click', (event) => event.stopPropagation());
	panel.addEventListener('keydown', (event) => {
		if (!search.hidden) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			setActive(state, state.activeIndex + 1);
			visibleButtons(state)[state.activeIndex]?.focus({ preventScroll: true });
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			setActive(state, state.activeIndex - 1);
			visibleButtons(state)[state.activeIndex]?.focus({ preventScroll: true });
		} else if (event.key === 'Home' || event.key === 'End') {
			event.preventDefault();
			setActive(state, event.key === 'Home' ? 0 : visibleButtons(state).length - 1);
			visibleButtons(state)[state.activeIndex]?.focus({ preventScroll: true });
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			const options = visibleButtons(state);
			const active = options[state.activeIndex] || options[0];
			if (active) choose(state, active.dataset.value);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			closeOpen();
			trigger.focus();
		} else if (event.key === 'Tab') {
			closeOpen();
		}
	});
	select.addEventListener('change', () => state.syncTrigger());

	rebuild(state);
	return state;
}

export function enhanceSelect(select) {
	if (!select || select.multiple || select.size > 1) return;
	if (select.dataset.comboReady === '1') {
		refreshSelect(select);
		return;
	}
	select.dataset.comboReady = '1';
	attach(select);
}

export function refreshSelect(select) {
	const state = select ? states.get(select) : null;
	if (!state) return;
	rebuild(state);
	if (state.open) positionPanel(state);
}

export function refreshSelects(root = document) {
	if (!root?.querySelectorAll) return;
	if (root.matches?.('select[data-combo-ready="1"]')) refreshSelect(root);
	for (const select of root.querySelectorAll('select[data-combo-ready="1"]')) refreshSelect(select);
}

export function enhanceSelects(root = document) {
	if (!root?.querySelectorAll) return;
	if (openState && !document.contains(openState.trigger)) closeOpen();
	if (root.matches?.('select')) enhanceSelect(root);
	for (const select of root.querySelectorAll('select')) enhanceSelect(select);
}

if (typeof document !== 'undefined') {
	document.addEventListener(
		'pointerdown',
		(event) => {
			if (!openState) return;
			if (
				openState.wrapper.contains(event.target) ||
				openState.panel.contains(event.target)
			) {
				return;
			}
			closeOpen();
		},
		true
	);
	const reposition = () => {
		if (openState) positionPanel(openState);
	};
	window.addEventListener('scroll', reposition, true);
	window.addEventListener('resize', reposition);
}
