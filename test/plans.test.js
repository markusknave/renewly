import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(
  readFileSync(path.join(root, 'public/data/plans.json'), 'utf8')
);
const sources = JSON.parse(
  readFileSync(path.join(root, 'scripts/plans.sources.json'), 'utf8')
);

const CADENCES = [
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
  'custom',
];
const CATEGORIES = [
  'streaming',
  'music',
  'ai',
  'software',
  'cloud-storage',
  'gaming',
  'memberships',
  'fitness',
];
const HTTPS = /^https:\/\/[^\s]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CURRENCY = /^[A-Z]{3}$/;

const plans = catalog.platforms.flatMap((platform) =>
  platform.plans.map((plan) => ({ platform, plan }))
);

test('catalog has the expected top-level shape', () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.region, 'PH');
  assert.equal(catalog.currency, 'PHP');
  assert.match(catalog.generatedAt, ISO_DATETIME);
  assert.ok(Array.isArray(catalog.platforms));
});

test('fx block describes a usable USD -> PHP rate', () => {
  assert.equal(catalog.fx.base, 'USD');
  assert.equal(typeof catalog.fx.rate, 'number');
  assert.ok(Number.isFinite(catalog.fx.rate));
  assert.ok(catalog.fx.rate > 0);
  assert.match(catalog.fx.fetchedAt, ISO_DATETIME);
  assert.match(catalog.fx.source, HTTPS);
});

test('catalog covers at least 15 unique platforms and every category', () => {
  assert.ok(catalog.platforms.length >= 15);
  const keys = catalog.platforms.map((platform) => platform.key);
  assert.equal(new Set(keys).size, keys.length);
  const categories = new Set(
    catalog.platforms.map((platform) => platform.category)
  );
  for (const category of CATEGORIES) {
    assert.ok(categories.has(category), `missing category: ${category}`);
  }
});

test('platforms carry the fields the UI relies on', () => {
  for (const platform of catalog.platforms) {
    assert.match(platform.key, SLUG);
    assert.equal(typeof platform.name, 'string');
    assert.ok(platform.name.length > 0);
    assert.ok(CATEGORIES.includes(platform.category));
    assert.match(platform.site, HTTPS);
    assert.equal(typeof platform.managePath, 'string');
    assert.ok(platform.managePath.startsWith('/'));
    assert.ok(Array.isArray(platform.plans));
    assert.ok(platform.plans.length > 0);
  }
});

test('plan ids are unique per platform', () => {
  for (const platform of catalog.platforms) {
    const ids = platform.plans.map((plan) => plan.id);
    assert.equal(
      new Set(ids).size,
      ids.length,
      `duplicate plan id on ${platform.key}`
    );
  }
});

test('every plan has a valid PHP-normalized price and cadence', () => {
  for (const { platform, plan } of plans) {
    const label = `${platform.key}/${plan.id}`;
    assert.match(plan.id, SLUG, label);
    assert.equal(typeof plan.name, 'string', label);
    assert.ok(plan.name.length > 0, label);
    assert.equal(plan.currency, 'PHP', label);
    assert.ok(Number.isInteger(plan.amountCents), label);
    assert.ok(plan.amountCents >= 0, label);
    assert.ok(CADENCES.includes(plan.cadence), label);
    assert.match(plan.sourceUrl, HTTPS, label);
    assert.match(plan.verifiedAt, ISO_DATE, label);
    assert.ok(!Number.isNaN(Date.parse(plan.verifiedAt)), label);
  }
});

test('native prices are well formed and agree with PHP amounts', () => {
  for (const { platform, plan } of plans) {
    const label = `${platform.key}/${plan.id}`;
    assert.equal(typeof plan.native, 'object', label);
    assert.ok(Number.isInteger(plan.native.amountCents), label);
    assert.ok(plan.native.amountCents >= 0, label);
    assert.match(plan.native.currency, CURRENCY, label);
    assert.equal(typeof plan.native.amountText, 'string', label);
    assert.ok(plan.native.amountText.length > 0, label);

    if (plan.native.currency === 'PHP') {
      assert.equal(plan.amountCents, plan.native.amountCents, label);
    } else if (plan.native.currency === 'USD') {
      assert.equal(
        plan.amountCents,
        Math.round(plan.native.amountCents * catalog.fx.rate),
        label
      );
    }
  }
});

test('sources manifest maps every plan to one https source', () => {
  assert.equal(sources.schemaVersion, 1);
  assert.ok(Array.isArray(sources.entries));

  const planByKey = new Map(
    plans.map(({ platform, plan }) => [`${platform.key}/${plan.id}`, plan])
  );
  const seen = new Set();

  for (const entry of sources.entries) {
    const key = `${entry.platformKey}/${entry.planId}`;
    assert.ok(planByKey.has(key), `unknown plan in sources: ${key}`);
    assert.ok(!seen.has(key), `duplicate source entry: ${key}`);
    seen.add(key);

    const plan = planByKey.get(key);
    assert.match(entry.sourceUrl, HTTPS, key);
    assert.equal(entry.sourceUrl, plan.sourceUrl, key);
    if (entry.extract !== undefined) {
      assert.equal(typeof entry.extract, 'string', key);
      assert.doesNotThrow(() => new RegExp(entry.extract), key);
    }
  }

  for (const { platform, plan } of plans) {
    assert.ok(
      seen.has(`${platform.key}/${plan.id}`),
      `missing source entry: ${platform.key}/${plan.id}`
    );
  }
});
