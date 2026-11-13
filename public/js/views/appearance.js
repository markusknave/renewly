// Appearance screen: five presets, an editable custom palette, and ten bundled
// fonts. Changes apply immediately and are saved with the settings form.

import { DEFAULT_APPEARANCE, FONTS, THEMES } from '../lib/themes.js';
import { breadcrumb, esc, icon } from './shared.js';

function themeCard(theme, selected) {
	return `<label class="theme-card${selected === theme.id ? ' is-active' : ''}" data-theme-card="${theme.id}">
		<input type="radio" name="theme" value="${theme.id}" data-theme-choice${selected === theme.id ? ' checked' : ''} />
		<span class="theme-swatch" aria-hidden="true">
			${theme.swatches
				.map((color) => `<span style="background:${esc(color)}"></span>`)
				.join('')}
		</span>
		<span class="theme-copy">
			<strong>${esc(theme.name)}</strong>
			<span class="muted tiny">${esc(theme.description)}</span>
		</span>
		<span class="theme-check">${icon('check')}</span>
	</label>`;
}

function fontCard(font, selected) {
	return `<label class="font-card${selected === font.id ? ' is-active' : ''}" data-font-card="${font.id}">
		<input type="radio" name="font" value="${font.id}" data-font-choice${selected === font.id ? ' checked' : ''} />
		<span class="font-sample" style="font-family:${esc(font.stack)}">Aa</span>
		<span class="font-copy"><strong style="font-family:${esc(font.stack)}">${esc(font.name)}</strong><span class="muted tiny">${esc(
			font.note
		)}</span></span>
	</label>`;
}

export function appearanceView({ settings = {} }) {
	const selectedTheme = settings.theme || DEFAULT_APPEARANCE.theme;
	const selectedFont = settings.font || DEFAULT_APPEARANCE.font;
	const accent = settings.customAccent || DEFAULT_APPEARANCE.customAccent;
	const background = settings.customBackground || DEFAULT_APPEARANCE.customBackground;
	return `${breadcrumb([{ label: 'More', href: '#/more' }, { label: 'Appearance' }])}
	<div class="page-head">
		<div>
			<p class="eyebrow">Make it yours</p>
			<h1>Appearance</h1>
			<p class="muted">Pick a ready-made theme, or choose your own accent, background, and font. Everything is stored on this device.</p>
		</div>
		<div class="page-head-actions"><a class="btn" href="#/settings">${icon('shield')} Settings</a></div>
	</div>

	<form class="stack appearance-form" data-form="appearance">
		<section class="panel">
			<div class="panel-head"><h2>Theme</h2><span class="muted small">5 presets + custom</span></div>
			<div class="theme-grid">
				${THEMES.map((theme) => themeCard(theme, selectedTheme)).join('')}
			</div>
			<label class="theme-card theme-card-custom${selectedTheme === 'custom' ? ' is-active' : ''}" data-theme-card="custom">
				<input type="radio" name="theme" value="custom" data-theme-choice${selectedTheme === 'custom' ? ' checked' : ''} />
				<span class="theme-swatch custom-swatch" style="--custom-bg:${esc(background)};--custom-accent:${esc(accent)}" aria-hidden="true"></span>
				<span class="theme-copy">
					<strong>Custom</strong>
					<span class="muted tiny">Use your own accent and background.</span>
				</span>
				<span class="theme-check">${icon('check')}</span>
			</label>
			<div class="custom-palette" data-custom-palette>
				<label>Accent colour
					<span class="color-field"><input type="color" name="customAccent" value="${esc(accent)}" data-custom-accent /><code>${esc(
						accent
					)}</code></span>
				</label>
				<label>Background colour
					<span class="color-field"><input type="color" name="customBackground" value="${esc(
						background
					)}" data-custom-background /><code>${esc(background)}</code></span>
				</label>
			</div>
		</section>

		<section class="panel">
			<div class="panel-head"><h2>Font</h2><span class="muted small">10 most-loved Google Fonts</span></div>
			<div class="font-grid">${FONTS.map((font) => fontCard(font, selectedFont)).join('')}</div>
			<p class="hint">Fonts are bundled with the app, so they work offline in the Android build. Poppins is the default.</p>
		</section>

		<div class="form-actions sticky-actions">
			<a class="btn" href="#/more">Cancel</a>
			<button class="btn btn-primary" type="submit">${icon('check')} Save appearance</button>
		</div>
	</form>`;
}
