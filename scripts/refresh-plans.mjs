#!/usr/bin/env node
// Refreshes the plan catalog's price fingerprints.
//
// Each entry in plans.sources.json either names an `extract` regex (first
// capture group is the native price) or is fingerprinted by page SHA-256.
// A reachable source that no longer matches its catalog price is drift and
// makes the command exit 1. Network failures are reported, never fatal.

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const catalogPath = path.join(root, 'public/data/plans.json');
const sourcesPath = path.join(root, 'scripts/plans.sources.json');
const fxUrl = 'https://open.er-api.com/v6/latest/USD';

const userAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
const requestTimeoutMs = 20_000;

const flags = new Set(process.argv.slice(2));
const knownFlags = new Set(['--write', '--dry-run', '--fx', '--help']);

function usage() {
  console.log(`Usage: node scripts/refresh-plans.mjs [--write] [--dry-run] [--fx]

  --write    persist refreshed fingerprints (or the new FX rate with --fx)
  --dry-run  report only; this is the default
  --fx       refresh only the USD->PHP rate and PHP-normalized prices
  --help     show this message`);
}

function fail(message) {
  console.error(`refresh-plans: ${message}`);
  process.exitCode = 1;
}

function isoNow() {
  // The catalog is Philippine-facing; keep timestamps in UTC+08:00.
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().replace('Z', '+08:00');
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function fetchPage(url, cache) {
  if (cache.has(url)) return cache.get(url);

  let result;
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': userAgent,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-PH,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    const body = await response.text();
    result = response.ok
      ? { ok: true, body }
      : { ok: false, error: `HTTP ${response.status}` };
  } catch (error) {
    result = { ok: false, error: error?.message || String(error) };
  }

  cache.set(url, result);
  return result;
}

function sha256(body) {
  return createHash('sha256').update(body).digest('hex');
}

function shortHash(hash) {
  return hash ? `sha256:${hash.slice(0, 12)}` : 'none';
}

function parseAmount(text) {
  const cleaned = String(text).replace(/,/g, '').replace(/[^\d.]/g, '');
  if (cleaned === '' || cleaned === '.') return Number.NaN;
  return Number.parseFloat(cleaned);
}

function sameAmount(extracted, expectedCents) {
  return Math.abs(extracted - expectedCents / 100) < 0.005;
}

function money(cents, currency) {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function indexPlans(catalog) {
  const index = new Map();
  for (const platform of catalog.platforms || []) {
    for (const plan of platform.plans || []) {
      index.set(`${platform.key}/${plan.id}`, { platform, plan });
    }
  }
  return index;
}

async function refreshFx({ write }) {
  const catalog = await readJson(catalogPath);

  let payload;
  try {
    const response = await fetch(fxUrl, {
      headers: { 'user-agent': userAgent, accept: 'application/json' },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await response.json();
  } catch (error) {
    fail(`could not fetch FX rate: ${error?.message || error}`);
    return;
  }

  const rate = Number(payload?.rates?.PHP);
  if (payload?.result !== 'success' || !Number.isFinite(rate) || rate <= 0) {
    fail('FX response did not contain a usable USD->PHP rate');
    return;
  }

  const previousRate = Number(catalog.fx?.rate);
  catalog.fx = {
    base: 'USD',
    rate,
    fetchedAt: isoNow(),
    source: fxUrl,
  };

  let changed = 0;
  for (const platform of catalog.platforms || []) {
    for (const plan of platform.plans || []) {
      if (plan.native?.currency !== 'USD') continue;
      const next = Math.round(plan.native.amountCents * rate);
      const planChanged = next !== plan.amountCents;
      if (planChanged) changed += 1;
      console.log(
        `${planChanged ? 'changed' : 'unchanged'}\t${platform.key}/${plan.id}\t` +
          `${money(plan.amountCents, 'PHP')} -> ${money(next, 'PHP')}`
      );
      plan.amountCents = next;
    }
  }

  console.log(
    `\nFX ${Number.isFinite(previousRate) ? previousRate : '?'} -> ${rate} ` +
      `(${changed} plan price(s) recalculated)`
  );

  if (!write) {
    console.log('dry run: pass --write to persist the new rate');
    return;
  }

  catalog.generatedAt = isoNow();
  await writeJson(catalogPath, catalog);
  console.log(`wrote ${path.relative(root, catalogPath)}`);
}

async function refreshSources({ write }) {
  const [catalog, sources] = await Promise.all([
    readJson(catalogPath),
    readJson(sourcesPath),
  ]);
  const plans = indexPlans(catalog);
  const cache = new Map();
  const now = isoNow();

  let changed = 0;
  let unchanged = 0;
  let unreachable = 0;
  let missing = 0;
  let checked = 0;

  for (const entry of sources.entries || []) {
    const key = `${entry.platformKey}/${entry.planId}`;
    const found = plans.get(key);
    if (!found) {
      console.log(`[missing]\t${key}\tno matching catalog plan`);
      missing += 1;
      continue;
    }

    const { plan } = found;
    checked += 1;
    const page = await fetchPage(entry.sourceUrl, cache);
    const native = money(plan.native.amountCents, plan.native.currency);

    if (!page.ok) {
      unreachable += 1;
      console.log(
        `[unreachable]\t${key}\t${entry.sourceUrl}\t${page.error}\tnative ${native}`
      );
      continue;
    }

    const hash = sha256(page.body);
    let priceText = null;
    let status;
    let extracted;
    let current = money(plan.amountCents, 'PHP');

    if (entry.extract) {
      let match;
      try {
        match = new RegExp(entry.extract, 'i').exec(page.body);
      } catch (error) {
        console.log(
          `[changed]\t${key}\tinvalid extract regex: ${error?.message || error}`
        );
        changed += 1;
        continue;
      }

      if (!match) {
        status = 'changed';
        extracted = 'no-match';
      } else {
        priceText = match[1];
        const amount = parseAmount(priceText);
        status = sameAmount(amount, plan.native.amountCents)
          ? 'unchanged'
          : 'changed';
        extracted = Number.isFinite(amount)
          ? `${amount.toFixed(2)} ${plan.native.currency}`
          : `unparseable (${priceText})`;
      }
    } else {
      const stored = plan.fetched?.sha256;
      status = stored && stored === hash ? 'unchanged' : 'changed';
      extracted = shortHash(hash);
      current = shortHash(stored);
    }

    if (status === 'changed') changed += 1;
    else unchanged += 1;
    console.log(
      `[${status}]\t${key}\textracted ${extracted}\tcurrent ${current}\t` +
        `native ${native}\t${entry.sourceUrl}`
    );

    if (write) {
      plan.fetched = { at: now, priceText, sha256: hash };
    }
  }

  console.log(
    `\n${checked} plan(s) checked: ${changed} changed, ` +
      `${unchanged} unchanged, ${unreachable} unreachable` +
      (missing ? `, ${missing} missing` : '')
  );

  if (!write) {
    console.log('dry run: pass --write to persist fingerprints');
  } else {
    catalog.generatedAt = now;
    await writeJson(catalogPath, catalog);
    console.log(`wrote ${path.relative(root, catalogPath)}`);
  }

  if (changed > 0 || missing > 0) process.exitCode = 1;
}

for (const flag of flags) {
  if (!knownFlags.has(flag)) {
    console.error(`unknown option: ${flag}`);
    usage();
    process.exit(2);
  }
}

const write = flags.has('--write') && !flags.has('--dry-run');

if (flags.has('--help')) {
  usage();
} else if (flags.has('--fx')) {
  await refreshFx({ write });
} else {
  await refreshSources({ write });
}
