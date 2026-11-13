import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../android/app/src/main/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('Android manifest registers the quick-add widget receiver', () => {
	const manifest = read('AndroidManifest.xml');
	assert.match(manifest, /\.QuickAddWidget/);
	assert.match(manifest, /android\.appwidget\.action\.APPWIDGET_UPDATE/);
	assert.match(manifest, /@xml\/widget_quick_add_info/);
});

test('widget layout and metadata exist and open the add-expense route', () => {
	for (const path of [
		'java/com/renewly/app/QuickAddWidget.java',
		'java/com/renewly/app/QuickAddNavigation.java',
		'java/com/renewly/app/MainActivity.java',
		'res/layout/widget_quick_add.xml',
		'res/xml/widget_quick_add_info.xml',
		'res/drawable/widget_background.xml',
	]) {
		assert.ok(existsSync(new URL(path, root)), `missing ${path}`);
	}
	const activity = read('java/com/renewly/app/MainActivity.java');
	assert.match(activity, /QuickAddNavigation\.expensesUrl/);
	assert.match(activity, /QuickAddNavigation\.EXTRA_QUICK_ADD/);
	const navigation = read('java/com/renewly/app/QuickAddNavigation.java');
	assert.match(navigation, /#\/expenses\?new=1/);
	assert.match(navigation, /QUICK_ADD/);
	const provider = read('java/com/renewly/app/QuickAddWidget.java');
	assert.match(provider, /PendingIntent\.getActivity/);
	assert.match(provider, /R\.layout\.widget_quick_add/);
	const layout = read('res/layout/widget_quick_add.xml');
	assert.match(layout, /@drawable\/widget_background/);
	assert.match(layout, /widget_root/);
});
