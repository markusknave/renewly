#!/usr/bin/env node
// Local security gate. CI runs the deeper scanners; this catches the mistakes
// that must never reach a commit: signing material, literal signing passwords,
// and dangerous workflow triggers.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';

const problems = [];

function fail(message) {
	problems.push(message);
}

let tracked = [];
try {
	tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
} catch {
	fail('Could not list tracked files. Run this from a git checkout.');
}

const signingExtensions = new Set(['.jks', '.keystore', '.p12']);
for (const file of tracked) {
	if (signingExtensions.has(extname(file).toLowerCase())) {
		fail(`Signing material is tracked: ${file}`);
	}
	if (file.startsWith('android/keystore/')) {
		fail(`Keystore directory content is tracked: ${file}`);
	}
}

const buildGradle = 'android/app/build.gradle';
if (existsSync(buildGradle)) {
	const source = readFileSync(buildGradle, 'utf8');
	if (/storePassword\s+['"]/.test(source) || /keyPassword\s+['"]/.test(source)) {
		fail('android/app/build.gradle contains a literal signing password.');
	}
	if (!/System\.getenv\('RENEWLY_KEYSTORE_FILE'\)/.test(source)) {
		fail('android/app/build.gradle does not read the keystore path from the environment.');
	}
}

const privateKeyPattern = /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/;
const textExtensions = new Set(['.js', '.mjs', '.json', '.md', '.gradle', '.yml', '.yaml', '.xml', '.java', '.properties', '.txt']);
for (const file of tracked) {
	if (!textExtensions.has(extname(file).toLowerCase())) continue;
	let source;
	try {
		source = readFileSync(file, 'utf8');
	} catch {
		continue;
	}
	if (privateKeyPattern.test(source)) fail(`Private key material found in ${file}`);
}

const workflows = tracked.filter((file) => file.startsWith('.github/workflows/') && /\.ya?ml$/.test(file));
for (const file of workflows) {
	const source = readFileSync(file, 'utf8');
	if (/pull_request_target\s*:/.test(source)) fail(`${file} uses pull_request_target.`);
	if (/workflow_run\s*:/.test(source)) fail(`${file} uses workflow_run.`);
	if (/permissions\s*:\s*write-all/.test(source)) fail(`${file} grants write-all permissions.`);
}

if (problems.length) {
	console.error('Security check failed:');
	for (const problem of problems) console.error(`- ${problem}`);
	process.exit(1);
}

console.log(`Security check passed (${tracked.length} tracked files, ${workflows.length} workflows).`);
