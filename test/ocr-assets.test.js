import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the bundled OCR model uses the path Android leaves intact', () => {
	const model = readFileSync(
		new URL('../public/vendor/tesseract/lang/eng.traineddata', import.meta.url)
	);
	assert.ok(model.length > 1_000_000);
	assert.equal(model[0] === 0x1f && model[1] === 0x8b, false, 'model must not be gzipped');
	const serviceWorker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
	assert.match(serviceWorker, /'\.\/vendor\/tesseract\/lang\/eng\.traineddata'/);
	assert.doesNotMatch(serviceWorker, /eng\.traineddata\.gz/);
});
