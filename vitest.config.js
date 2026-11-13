import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/*.test.js'],
		environment: 'node',
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json-summary', 'html'],
			include: ['public/js/**/*.js'],
			exclude: ['public/js/views.js', 'public/js/importers/limits.js', 'public/js/ocr.js'],
			reportsDirectory: 'coverage',
			thresholds: {
				statements: 55,
				branches: 48,
				functions: 65,
				lines: 60,
			},
		},
	},
});
