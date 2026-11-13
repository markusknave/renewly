import { test } from 'vitest';
import assert from 'node:assert/strict';

import { createMemoryBackend } from '../public/js/db.js';
import { getSettings, saveSettings } from '../public/js/store.js';
import {
	FONTS,
	THEMES,
	appearanceCss,
	appearanceFromSettings,
	DEFAULT_APPEARANCE,
} from '../public/js/lib/themes.js';

test('appearance ships five themes, custom colours, and ten fonts including Poppins', () => {
	assert.equal(THEMES.length, 5);
	assert.deepEqual(THEMES.map((theme) => theme.id), ['ivory', 'linen', 'bloom', 'tide', 'midnight']);
	assert.equal(FONTS.length, 10);
	assert.ok(FONTS.some((font) => font.id === 'poppins'));
	const ivory = appearanceFromSettings({ theme: 'ivory', font: 'poppins' });
	assert.equal(ivory.mode, 'light');
	assert.equal(ivory.colors.bg, '#f7f3ec');
	assert.match(ivory.font.stack, /Poppins/);
	const midnight = appearanceFromSettings({ theme: 'midnight', font: 'inter' });
	assert.equal(midnight.mode, 'dark');
	assert.equal(midnight.colors.bg, '#121216');
});

test('custom appearance derives readable surfaces from any background', () => {
	const light = appearanceFromSettings({
		theme: 'custom',
		font: 'manrope',
		customAccent: '#e05a2b',
		customBackground: '#fff8ef',
	});
	assert.equal(light.themeId, 'custom');
	assert.equal(light.mode, 'light');
	assert.equal(light.colors.bg, '#fff8ef');
	assert.equal(light.colors.brand, '#e05a2b');
	assert.notEqual(light.colors.surface, light.colors.bg);
	assert.equal(light.font.id, 'manrope');

	const dark = appearanceFromSettings({
		theme: 'custom',
		font: 'dm-sans',
		customAccent: '#8fd6ff',
		customBackground: '#101820',
	});
	assert.equal(dark.mode, 'dark');
	assert.ok(dark.colors.ink.startsWith('#'));
	const css = appearanceCss({ theme: 'custom', font: 'dm-sans', customAccent: '#8fd6ff', customBackground: '#101820' });
	assert.equal(css.vars['--bg'], '#101820');
	assert.equal(css.vars['--brand'], '#8fd6ff');
	assert.match(css.vars['--font-ui'], /DM Sans/);
});

test('settings persist theme, font, and custom colours and reject unknown values', async () => {
	const db = createMemoryBackend();
	assert.equal((await getSettings(db)).theme, DEFAULT_APPEARANCE.theme);
	const saved = await saveSettings(db, {
		theme: 'bloom',
		font: 'lato',
		customAccent: '#123456',
		customBackground: '#abcdef',
	});
	assert.equal(saved.theme, 'bloom');
	assert.equal(saved.font, 'lato');
	assert.equal(saved.customAccent, '#123456');
	assert.equal(saved.customBackground, '#abcdef');
	await assert.rejects(() => saveSettings(db, { theme: 'neon' }), /Theme/);
	await assert.rejects(() => saveSettings(db, { font: 'comic-sans' }), /Font/);
	const sanitized = await saveSettings(db, { customAccent: 'not-a-colour' });
	assert.equal(sanitized.customAccent, '#123456');
});
