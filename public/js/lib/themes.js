// Appearance system: five ready-made palettes plus a custom accent/background,
// and ten bundled Google Fonts.
//
// Font shortlist is the most-used/most-loved Google Fonts across the 2025–2026
// roundups (Google Fonts analytics, DreamHost, GreenGeeks, Speckyboy): Poppins,
// Inter, Roboto, Open Sans, Montserrat, Lato, Nunito Sans, DM Sans, Work Sans,
// and Manrope. Every family is bundled as local WOFF2 so themes keep working
// offline in the Android WebView.

export const THEMES = [
	{
		id: 'ivory',
		name: 'Ivory',
		description: 'Warm cream, plum ink, and a soft peach accent.',
		mode: 'light',
		swatches: ['#f7f3ec', '#fffdf9', '#6d4aff', '#f2b880'],
		colors: {
			bg: '#f7f3ec',
			bgSoft: '#efe8dc',
			surface: '#fffdf9',
			surface2: '#f3ece1',
			ink: '#241c2b',
			muted: '#7c7182',
			line: '#e8dfd2',
			brand: '#6d4aff',
			brand2: '#8c6bff',
			brandInk: '#ffffff',
			accent: '#f2b880',
			success: '#2f8f62',
			warning: '#b7791f',
			danger: '#c2414b',
			heroA: '#6d4aff',
			heroB: '#9a6bff',
		},
	},
	{
		id: 'linen',
		name: 'Linen',
		description: 'Calm white, sage, and deep forest green.',
		mode: 'light',
		swatches: ['#f4f6f1', '#fdfefb', '#2f6b52', '#b8cf9f'],
		colors: {
			bg: '#f4f6f1',
			bgSoft: '#e8eee2',
			surface: '#fdfefb',
			surface2: '#eef3e9',
			ink: '#18251e',
			muted: '#6f7d72',
			line: '#dde6d7',
			brand: '#2f6b52',
			brand2: '#4f8a6d',
			brandInk: '#ffffff',
			accent: '#b8cf9f',
			success: '#2f7d54',
			warning: '#9a6b1f',
			danger: '#b4454e',
			heroA: '#295f49',
			heroB: '#5b9074',
		},
	},
	{
		id: 'bloom',
		name: 'Bloom',
		description: 'Blush paper, rosewood ink, and berry accents.',
		mode: 'light',
		swatches: ['#faf1f2', '#fffafb', '#9d3f5a', '#e9b7c4'],
		colors: {
			bg: '#faf1f2',
			bgSoft: '#f3e2e5',
			surface: '#fffafb',
			surface2: '#f8e9ec',
			ink: '#2b1c22',
			muted: '#836d76',
			line: '#eddadd',
			brand: '#9d3f5a',
			brand2: '#bd5b76',
			brandInk: '#ffffff',
			accent: '#e9b7c4',
			success: '#387a5a',
			warning: '#a86a24',
			danger: '#b23a48',
			heroA: '#8f3451',
			heroB: '#c46c84',
		},
	},
	{
		id: 'tide',
		name: 'Tide',
		description: 'Cool mist, ocean teal, and ink navy.',
		mode: 'light',
		swatches: ['#eef4f5', '#fbfdfd', '#0f6e79', '#a8d8dd'],
		colors: {
			bg: '#eef4f5',
			bgSoft: '#deeaec',
			surface: '#fbfdfd',
			surface2: '#e8f1f3',
			ink: '#12242a',
			muted: '#63787e',
			line: '#d6e4e7',
			brand: '#0f6e79',
			brand2: '#2a929c',
			brandInk: '#ffffff',
			accent: '#a8d8dd',
			success: '#287a5c',
			warning: '#9a6b1f',
			danger: '#b6434f',
			heroA: '#0d616b',
			heroB: '#3b98a1',
		},
	},
	{
		id: 'midnight',
		name: 'Midnight',
		description: 'Deep charcoal, warm text, and lilac highlights.',
		mode: 'dark',
		swatches: ['#121216', '#1c1c22', '#b9a4ff', '#2b2b34'],
		colors: {
			bg: '#121216',
			bgSoft: '#0c0c10',
			surface: '#1c1c22',
			surface2: '#24242c',
			ink: '#f4f1ea',
			muted: '#a49fae',
			line: '#303039',
			brand: '#b9a4ff',
			brand2: '#8f78e8',
			brandInk: '#1a1329',
			accent: '#e7c58f',
			success: '#71c99b',
			warning: '#e3b15f',
			danger: '#f08a92',
			heroA: '#2a2440',
			heroB: '#4b3d72',
		},
	},
];

export const FONTS = [
	{ id: 'poppins', name: 'Poppins', stack: "'Poppins', system-ui, sans-serif", note: 'Geometric · rounded' },
	{ id: 'inter', name: 'Inter', stack: "'Inter', system-ui, sans-serif", note: 'Neutral · UI favourite' },
	{ id: 'roboto', name: 'Roboto', stack: "'Roboto', system-ui, sans-serif", note: 'Android default · compact' },
	{ id: 'open-sans', name: 'Open Sans', stack: "'Open Sans', system-ui, sans-serif", note: 'Friendly · highly legible' },
	{ id: 'montserrat', name: 'Montserrat', stack: "'Montserrat', system-ui, sans-serif", note: 'Editorial · confident' },
	{ id: 'lato', name: 'Lato', stack: "'Lato', system-ui, sans-serif", note: 'Humanist · warm' },
	{ id: 'nunito-sans', name: 'Nunito Sans', stack: "'Nunito Sans', system-ui, sans-serif", note: 'Soft · approachable' },
	{ id: 'dm-sans', name: 'DM Sans', stack: "'DM Sans', system-ui, sans-serif", note: 'Low-contrast · modern' },
	{ id: 'work-sans', name: 'Work Sans', stack: "'Work Sans', system-ui, sans-serif", note: 'Grotesque · crisp' },
	{ id: 'manrope', name: 'Manrope', stack: "'Manrope', system-ui, sans-serif", note: 'Semi-geometric · tidy' },
];

export const DEFAULT_APPEARANCE = {
	theme: 'ivory',
	font: 'poppins',
	customAccent: '#6d4aff',
	customBackground: '#f7f3ec',
};

export const THEME_IDS = [...THEMES.map((theme) => theme.id), 'custom'];
export const FONT_IDS = FONTS.map((font) => font.id);

function clamp(value) {
	return Math.max(0, Math.min(255, Math.round(value)));
}

export function normalizeHex(value, fallback) {
	const text = String(value || '').trim();
	const match = /^#?([0-9a-f]{6})$/i.exec(text);
	return match ? `#${match[1].toLowerCase()}` : fallback;
}

function hexToRgb(hex) {
	const value = normalizeHex(hex, '#000000').slice(1);
	return {
		r: parseInt(value.slice(0, 2), 16),
		g: parseInt(value.slice(2, 4), 16),
		b: parseInt(value.slice(4, 6), 16),
	};
}

function rgbToHex({ r, g, b }) {
	return `#${[r, g, b].map((part) => clamp(part).toString(16).padStart(2, '0')).join('')}`;
}

/** Mixes `color` toward `target`; `weight` is the share of `target`. */
export function mix(color, target, weight) {
	const a = hexToRgb(color);
	const b = hexToRgb(target);
	const w = Math.max(0, Math.min(1, Number(weight) || 0));
	return rgbToHex({
		r: a.r + (b.r - a.r) * w,
		g: a.g + (b.g - a.g) * w,
		b: a.b + (b.b - a.b) * w,
	});
}

export function luminance(color) {
	const { r, g, b } = hexToRgb(color);
	const channel = (value) => {
		const v = value / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function readableInk(background) {
	return luminance(background) > 0.45 ? '#1f1a24' : '#faf7f1';
}

export function appearanceFromSettings(settings = {}) {
	const themeId = THEME_IDS.includes(settings.theme) ? settings.theme : DEFAULT_APPEARANCE.theme;
	const fontId = FONT_IDS.includes(settings.font) ? settings.font : DEFAULT_APPEARANCE.font;
	const font = FONTS.find((entry) => entry.id === fontId) || FONTS[0];
	const preset = THEMES.find((entry) => entry.id === themeId);
	if (preset) return { themeId, font, mode: preset.mode, colors: preset.colors };
	const accent = normalizeHex(settings.customAccent, DEFAULT_APPEARANCE.customAccent);
	const background = normalizeHex(settings.customBackground, DEFAULT_APPEARANCE.customBackground);
	const dark = luminance(background) < 0.42;
	const ink = readableInk(background);
	const surface = dark ? mix(background, '#ffffff', 0.08) : mix(background, '#ffffff', 0.72);
	const surface2 = dark ? mix(background, '#ffffff', 0.13) : mix(background, '#ffffff', 0.4);
	return {
		themeId: 'custom',
		font,
		mode: dark ? 'dark' : 'light',
		colors: {
			bg: background,
			bgSoft: dark ? mix(background, '#000000', 0.25) : mix(background, '#000000', 0.06),
			surface,
			surface2,
			ink,
			muted: mix(ink, background, 0.42),
			line: dark ? mix(background, '#ffffff', 0.17) : mix(background, '#000000', 0.13),
			brand: accent,
			brand2: mix(accent, dark ? '#ffffff' : '#000000', 0.16),
			brandInk: readableInk(accent),
			accent: mix(accent, background, 0.55),
			success: dark ? '#78c99c' : '#2f7d54',
			warning: dark ? '#e3b15f' : '#9a6b1f',
			danger: dark ? '#f08a92' : '#b6434f',
			heroA: accent,
			heroB: mix(accent, dark ? '#ffffff' : '#000000', 0.22),
		},
	};
}

export function appearanceCss(settings) {
	const { colors, font, themeId, mode } = appearanceFromSettings(settings);
	const vars = {
		'--bg': colors.bg,
		'--bg-soft': colors.bgSoft,
		'--surface': colors.surface,
		'--surface-2': colors.surface2,
		'--ink': colors.ink,
		'--muted': colors.muted,
		'--line': colors.line,
		'--brand': colors.brand,
		'--brand-2': colors.brand2,
		'--brand-ink': colors.brandInk,
		'--accent': colors.accent,
		'--success': colors.success,
		'--warning': colors.warning,
		'--danger': colors.danger,
		'--hero-a': colors.heroA,
		'--hero-b': colors.heroB,
		'--font-ui': font.stack,
	};
	return { themeId, mode, vars };
}

export function applyAppearance(settings) {
	if (typeof document === 'undefined') return appearanceCss(settings);
	const { themeId, mode, vars } = appearanceCss(settings);
	const root = document.documentElement;
	root.dataset.theme = themeId;
	root.dataset.colorMode = mode;
	for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute('content', vars['--bg']);
	return { themeId, mode, vars };
}
