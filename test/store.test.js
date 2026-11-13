import { test } from 'vitest';
import assert from 'node:assert/strict';

import { createMemoryBackend } from '../public/js/db.js';
import {
  CADENCES,
  STATUSES,
  PAYMENT_KINDS,
  PAYMENT_KIND_LABELS,
  KIND_LABELS,
  listSubscriptions,
  getSubscription,
  saveSubscription,
  deleteSubscription,
  listGroups,
  saveGroup,
  deleteGroup,
  summarizeGroups,
  listPaymentMethods,
  savePaymentMethod,
  deletePaymentMethod,
  findDuplicateSubscription,
  getSettings,
  saveSettings,
  validateSubscriptionInput,
  summarize,
  saveExpense,
} from '../public/js/store.js';

function subscriptionInput(overrides = {}) {
  return {
    kind: 'recurring',
    merchantName: 'Spotify',
    planName: 'Premium',
    amountCents: 14900,
    cadence: 'monthly',
    status: 'active',
    nextRenewalDate: '2026-12-01',
    startedOn: '2026-01-01',
    lastChargeDate: '2026-11-01',
    notes: '',
    ...overrides,
  };
}

test('exports the contract constants', () => {
  assert.deepEqual(CADENCES, ['weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'custom']);
  assert.deepEqual(STATUSES, ['active', 'trial', 'paused', 'canceled']);
  assert.deepEqual(PAYMENT_KINDS, ['card', 'ewallet', 'bank', 'cash', 'other']);
  assert.deepEqual(PAYMENT_KIND_LABELS, {
    card: 'Card',
    ewallet: 'E-wallet',
    bank: 'Bank transfer',
    cash: 'Cash',
    other: 'Other',
  });
  assert.deepEqual(KIND_LABELS, { recurring: 'Recurring', one_time: 'One-time' });
});

test('memory backend mimics autoIncrement, key paths, and cloning', async () => {
  const db = createMemoryBackend();

  assert.equal(await db.put('subscriptions', { merchantName: 'A' }), 1);
  assert.equal(await db.put('subscriptions', { merchantName: 'B' }), 2);
  assert.deepEqual(await db.get('subscriptions', 1), { id: 1, merchantName: 'A' });
  assert.equal(await db.get('subscriptions', 99), undefined);
  assert.deepEqual((await db.getAll('subscriptions')).map((row) => row.id), [1, 2]);

  assert.equal(await db.put('subscriptions', { id: 1, merchantName: 'A2' }), 1);
  assert.equal((await db.get('subscriptions', 1)).merchantName, 'A2');

  const original = { merchantName: 'Clone' };
  const cloneKey = await db.put('subscriptions', original);
  assert.equal(cloneKey, 3);
  original.merchantName = 'Mutated';
  assert.equal((await db.get('subscriptions', cloneKey)).merchantName, 'Clone');

  await db.delete('subscriptions', 2);
  assert.equal(await db.get('subscriptions', 2), undefined);

  await db.clear('subscriptions');
  assert.deepEqual(await db.getAll('subscriptions'), []);
  // clear() does not reset the autoIncrement generator, matching IndexedDB.
  assert.equal(await db.put('subscriptions', { merchantName: 'C' }), 4);

  await assert.rejects(() => db.getAll('missing'), /Unknown object store/);
  await db.put('settings', { key: 'profile', value: { currency: 'PHP' } });
  assert.deepEqual(await db.get('settings', 'profile'), { key: 'profile', value: { currency: 'PHP' } });
  await assert.rejects(() => db.put('settings', { value: {} }), /key/);
});

test('explicit ids advance the autoIncrement generator', async () => {
  const db = createMemoryBackend();
  assert.equal(await db.put('subscriptions', { id: 10, merchantName: 'X' }), 10);
  assert.equal(await db.put('subscriptions', { merchantName: 'Y' }), 11);
});

test('saveSubscription creates, normalizes, and updates records', async () => {
  const db = createMemoryBackend();

  const created = await saveSubscription(db, subscriptionInput({ merchantName: '  Spotify  ' }));
  assert.equal(created.id, 1);
  assert.equal(created.merchantName, 'Spotify');
  assert.equal(created.merchantKey, 'spotify');
  assert.equal(created.currency, 'PHP');
  assert.equal(created.source, 'manual');
  assert.equal(created.planId, null);
  assert.equal(created.customIntervalDays, null);
  assert.match(created.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(created.createdAt, created.updatedAt);
  assert.deepEqual(await getSubscription(db, created.id), created);

  const updated = await saveSubscription(db, { ...created, planName: 'Duo', amountCents: 18900 });
  assert.equal(updated.id, created.id);
  assert.equal(updated.planName, 'Duo');
  assert.equal(updated.amountCents, 18900);
  assert.equal(updated.createdAt, created.createdAt);
  assert.equal(typeof updated.updatedAt, 'string');
  assert.deepEqual(await getSubscription(db, created.id), updated);

  assert.equal(await deleteSubscription(db, created.id), true);
  assert.equal(await deleteSubscription(db, created.id), false);
  assert.equal(await getSubscription(db, created.id), undefined);
});

test('listSubscriptions sorts by date with undated records last', async () => {
  const db = createMemoryBackend();
  await saveSubscription(db, subscriptionInput({ merchantName: 'No Date', nextRenewalDate: null }));
  await saveSubscription(db, subscriptionInput({ merchantName: 'Later', nextRenewalDate: '2026-12-10' }));
  await saveSubscription(db, subscriptionInput({ merchantName: 'Sooner', nextRenewalDate: '2026-11-20' }));
  await saveSubscription(db, subscriptionInput({ merchantName: 'Also Sooner', nextRenewalDate: '2026-11-20' }));

  const rows = await listSubscriptions(db);
  assert.deepEqual(rows.map((row) => row.merchantName), ['Also Sooner', 'Sooner', 'Later', 'No Date']);
});

test('validateSubscriptionInput reports invalid fields and normalizes valid ones', () => {
  const empty = validateSubscriptionInput({});
  assert.equal(empty.errors.merchantName, 'Merchant name is required.');
  assert.ok(empty.errors.amountCents);
  assert.ok(empty.errors.cadence);

  assert.ok(validateSubscriptionInput(subscriptionInput({ amountCents: -1 })).errors.amountCents);
  assert.ok(validateSubscriptionInput(subscriptionInput({ amountCents: 12.5 })).errors.amountCents);
  assert.ok(validateSubscriptionInput(subscriptionInput({ merchantName: 'x'.repeat(121) })).errors.merchantName);
  assert.ok(validateSubscriptionInput(subscriptionInput({ planName: 'x'.repeat(121) })).errors.planName);
  assert.ok(validateSubscriptionInput(subscriptionInput({ notes: 'x'.repeat(2001) })).errors.notes);
  assert.ok(validateSubscriptionInput(subscriptionInput({ cadence: 'yearly' })).errors.cadence);
  assert.ok(validateSubscriptionInput(subscriptionInput({ status: 'cancelled' })).errors.status);
  assert.ok(validateSubscriptionInput(subscriptionInput({ paymentMethodId: 'abc' })).errors.paymentMethodId);
  assert.ok(validateSubscriptionInput(subscriptionInput({ id: -2 })).errors.id);

  const numericAmount = validateSubscriptionInput(subscriptionInput({ amountCents: '1500' }));
  assert.deepEqual(numericAmount.errors, {});
  assert.equal(numericAmount.data.amountCents, 1500);

  const oneTimeWithCadence = validateSubscriptionInput(subscriptionInput({ kind: 'one_time' }));
  assert.ok(oneTimeWithCadence.errors.cadence);

  const oneTime = validateSubscriptionInput(subscriptionInput({ kind: 'one_time', cadence: null }));
  assert.deepEqual(oneTime.errors, {});
  assert.equal(oneTime.data.kind, 'one_time');
  assert.equal(oneTime.data.cadence, null);
  assert.equal(oneTime.data.customIntervalDays, null);

  const customMissing = validateSubscriptionInput(subscriptionInput({ cadence: 'custom' }));
  assert.ok(customMissing.errors.customIntervalDays);

  const custom = validateSubscriptionInput(subscriptionInput({ cadence: 'custom', customIntervalDays: 45 }));
  assert.deepEqual(custom.errors, {});
  assert.equal(custom.data.customIntervalDays, 45);

  assert.ok(validateSubscriptionInput(subscriptionInput({ nextRenewalDate: '2026-02-30' })).errors.nextRenewalDate);
  assert.ok(validateSubscriptionInput(subscriptionInput({ startedOn: '2026-2-3' })).errors.startedOn);

  const emptyDate = validateSubscriptionInput(subscriptionInput({ lastChargeDate: '' }));
  assert.deepEqual(emptyDate.errors, {});
  assert.equal(emptyDate.data.lastChargeDate, null);
});

test('saveSubscription rejects invalid records without writing', async () => {
  const db = createMemoryBackend();

  await assert.rejects(
    () => saveSubscription(db, subscriptionInput({ amountCents: 12.5 })),
    /whole number/,
  );
  await assert.rejects(
    () => saveSubscription(db, subscriptionInput({ merchantName: '   ' })),
    /Merchant name is required/,
  );
  await assert.rejects(
    () => saveSubscription(db, subscriptionInput({ paymentMethodId: 42 })),
    /Payment method not found/,
  );
  assert.equal((await db.getAll('subscriptions')).length, 0);

  const error = await saveSubscription(db, subscriptionInput({ merchantName: '' })).catch((caught) => caught);
  assert.ok(error instanceof Error);
  assert.equal(error.errors.merchantName, 'Merchant name is required.');
});

test('groups persist, reject duplicates, and detach subscriptions on delete', async () => {
  const db = createMemoryBackend();

  const cars = await saveGroup(db, { name: '  Cars  ' });
  assert.equal(cars.name, 'Cars');
  assert.match(cars.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  await assert.rejects(() => saveGroup(db, { name: 'cars' }), /already exists/);
  await assert.rejects(() => saveGroup(db, { name: '   ' }), /Group name is required/);

  const home = await saveGroup(db, { name: 'Home' });
  assert.deepEqual((await listGroups(db)).map((group) => group.name), ['Cars', 'Home']);

  const subscription = await saveSubscription(db, subscriptionInput({ groupId: cars.id }));
  assert.equal(subscription.groupId, cars.id);
  await assert.rejects(
    () => saveSubscription(db, subscriptionInput({ groupId: 999 })),
    /Group not found/
  );

  const renamed = await saveGroup(db, { ...cars, name: 'Vehicles' });
  assert.equal(renamed.id, cars.id);
  assert.equal(renamed.name, 'Vehicles');
  assert.equal(renamed.createdAt, cars.createdAt);

  assert.equal(await deleteGroup(db, cars.id), true);
  assert.equal((await getSubscription(db, subscription.id)).groupId, null);
  assert.equal(await deleteGroup(db, cars.id), false);
  assert.deepEqual((await listGroups(db)).map((group) => group.name), ['Home']);
  assert.equal((await listGroups(db))[0].id, home.id);
});

test('summarizeGroups counts subscriptions and payment methods per group', async () => {
  const db = createMemoryBackend();
  const cars = await saveGroup(db, { name: 'Cars' });
  const home = await saveGroup(db, { name: 'Home' });
  const visa = await savePaymentMethod(db, { label: 'Visa', kind: 'card', last4: '4242' });
  const gcash = await savePaymentMethod(db, { label: 'GCash', kind: 'ewallet' });

  await saveSubscription(db, subscriptionInput({
    merchantName: 'Toyota',
    nextRenewalDate: '2026-11-20',
    groupId: cars.id,
    paymentMethodId: visa.id,
  }));
  await saveSubscription(db, subscriptionInput({
    merchantName: 'Shell',
    nextRenewalDate: '2026-11-21',
    groupId: cars.id,
    paymentMethodId: gcash.id,
  }));
  await saveSubscription(db, subscriptionInput({
    merchantName: 'Netflix',
    nextRenewalDate: '2026-11-22',
    groupId: home.id,
    paymentMethodId: visa.id,
  }));
  await saveSubscription(db, subscriptionInput({ merchantName: 'Unassigned', nextRenewalDate: '2026-11-23' }));

  const summaries = summarizeGroups(await listGroups(db), await listSubscriptions(db));
  const carSummary = summaries.find((group) => group.id === cars.id);
  assert.equal(carSummary.subscriptionCount, 2);
  assert.deepEqual(carSummary.methodCounts, [
    { paymentMethodId: visa.id, count: 1 },
    { paymentMethodId: gcash.id, count: 1 },
  ]);

  const homeSummary = summaries.find((group) => group.id === home.id);
  assert.equal(homeSummary.subscriptionCount, 1);
  assert.deepEqual(homeSummary.methodCounts, [{ paymentMethodId: visa.id, count: 1 }]);
});

test('payment methods persist and deleting one clears subscription references', async () => {
  const db = createMemoryBackend();

  const method = await savePaymentMethod(db, { label: '  Visa  ', kind: 'card', last4: '4242', notes: '' });
  assert.equal(method.id, 1);
  assert.equal(method.label, 'Visa');
  assert.match(method.createdAt, /^\d{4}-\d{2}-\d{2}T/);

  const second = await savePaymentMethod(db, { label: 'GCash', kind: 'ewallet' });
  assert.equal(second.id, 2);
  assert.equal(second.kind, 'ewallet');
  assert.equal(second.last4, '');
  assert.deepEqual((await listPaymentMethods(db)).map((row) => row.label), ['Visa', 'GCash']);

  const subscription = await saveSubscription(db, subscriptionInput({ paymentMethodId: method.id }));
  assert.equal(subscription.paymentMethodId, 1);

  const updatedMethod = await savePaymentMethod(db, { ...method, label: 'Visa Rewards' });
  assert.equal(updatedMethod.id, 1);
  assert.equal(updatedMethod.label, 'Visa Rewards');
  assert.equal(updatedMethod.createdAt, method.createdAt);

  assert.equal(await deletePaymentMethod(db, method.id), true);
  assert.equal((await getSubscription(db, subscription.id)).paymentMethodId, null);
  assert.equal(await deletePaymentMethod(db, method.id), false);
  assert.equal((await listPaymentMethods(db)).length, 1);
});

test('savePaymentMethod validates its fields', async () => {
  const db = createMemoryBackend();
  await assert.rejects(() => savePaymentMethod(db, {}), /Label is required/);
  await assert.rejects(() => savePaymentMethod(db, { label: 'X', kind: 'crypto' }), /not recognized/);
  await assert.rejects(() => savePaymentMethod(db, { label: 'X', last4: '12345' }), /4 characters/);
});

test('saveExpense stores expenses and income separately', async () => {
  const db = createMemoryBackend();
  const method = await savePaymentMethod(db, { label: 'BPI Debit', kind: 'card' });
  const income = await saveExpense(db, {
    type: 'income',
    date: '2026-11-13',
    merchant: 'Salary',
    amountCents: 50_000,
    category: 'food',
    paymentMethodId: method.id,
  });
  assert.equal(income.type, 'income');
  assert.equal(income.category, 'income');

  const expense = await saveExpense(db, {
    type: 'expense',
    date: '2026-11-13',
    merchant: 'Lunch',
    amountCents: 12_500,
    category: 'food',
    paymentMethodId: method.id,
  });
  assert.equal(expense.type, 'expense');
  assert.equal(expense.category, 'food');

  await assert.rejects(
    () => saveExpense(db, { type: 'refund', date: '2026-11-13', merchant: 'Bad', amountCents: 1 }),
    /Type must be expense, income, or transfer/
  );
});

test('settings return defaults and merge patches', async () => {
  const db = createMemoryBackend();

  const defaults = await getSettings(db);
  assert.deepEqual(defaults, { currency: 'PHP', timezone: 'Asia/Manila', reminderDays: [7, 3, 1] });
  defaults.reminderDays.push(99);
  assert.deepEqual((await getSettings(db)).reminderDays, [7, 3, 1]);

  const saved = await saveSettings(db, { reminderDays: [3, 1, 3] });
  assert.deepEqual(saved, { currency: 'PHP', timezone: 'Asia/Manila', reminderDays: [1, 3] });
  assert.deepEqual(await getSettings(db), saved);

  const merged = await saveSettings(db, { timezone: 'Asia/Tokyo' });
  assert.deepEqual(merged, { currency: 'PHP', timezone: 'Asia/Tokyo', reminderDays: [1, 3] });
  assert.equal((await getSettings(db)).timezone, 'Asia/Tokyo');

  await assert.rejects(() => saveSettings(db, { currency: 'USD' }), /PHP/);
  await assert.rejects(() => saveSettings(db, { timezone: 'Mars/Olympus' }), /Timezone/);
  await assert.rejects(() => saveSettings(db, { reminderDays: [-1] }), /Reminder days/);
  await assert.rejects(() => saveSettings(db, { reminderDays: '7' }), /list/);
});

test('summarize converts cadences and excludes one-time and inactive records', async () => {
  const db = createMemoryBackend();
  const today = '2026-11-09';
  const entries = [
    ['Weekly', { cadence: 'weekly', amountCents: 1200, nextRenewalDate: '2026-11-09' }],
    ['Biweekly', { cadence: 'biweekly', amountCents: 1000, nextRenewalDate: '2026-11-16' }],
    ['Monthly', { cadence: 'monthly', amountCents: 1500, nextRenewalDate: '2026-11-17' }],
    ['Quarterly', { cadence: 'quarterly', amountCents: 3000, nextRenewalDate: '2026-11-01' }],
    ['Semiannual', { cadence: 'semiannual', amountCents: 6000, nextRenewalDate: null }],
    ['Annual', { cadence: 'annual', amountCents: 12000, nextRenewalDate: '2026-11-10' }],
    ['Custom', { cadence: 'custom', customIntervalDays: 30, amountCents: 1200, nextRenewalDate: '2026-12-01' }],
    ['One-time', { kind: 'one_time', cadence: null, amountCents: 50000, nextRenewalDate: '2026-11-12' }],
    ['Paused', { status: 'paused', amountCents: 999900, nextRenewalDate: '2026-11-09' }],
    ['Canceled', { status: 'canceled', amountCents: 999900, nextRenewalDate: '2026-11-01' }],
  ];

  const created = [];
  for (const [merchantName, overrides] of entries) {
    created.push(await saveSubscription(db, subscriptionInput({ merchantName, ...overrides })));
  }

  const summary = summarize(created, { today, reminderDays: [7] });

  assert.equal(summary.monthlyCents, 13084);
  assert.equal(summary.yearlyCents, 157008);
  assert.equal(summary.activeCount, 8);
  assert.equal(summary.dueSoonCount, 4);
  assert.equal(summary.overdueCount, 1);
  assert.deepEqual(summary.dueSoon.map((row) => row.merchantName), ['Weekly', 'Annual', 'One-time', 'Biweekly']);
  assert.deepEqual(summary.overdue.map((row) => row.merchantName), ['Quarterly']);
  assert.equal(summary.next.merchantName, 'Weekly');
});

test('summarize ignores paused and canceled records for due tracking', async () => {
  const db = createMemoryBackend();
  const today = '2026-11-09';
  await saveSubscription(db, subscriptionInput({ merchantName: 'Paused', status: 'paused', nextRenewalDate: today }));
  await saveSubscription(db, subscriptionInput({ merchantName: 'Canceled', status: 'canceled', nextRenewalDate: '2026-10-01' }));

  const summary = summarize(await listSubscriptions(db), { today, reminderDays: [7] });
  assert.equal(summary.activeCount, 0);
  assert.equal(summary.dueSoonCount, 0);
  assert.equal(summary.overdueCount, 0);
  assert.equal(summary.next, null);
  assert.equal(summary.monthlyCents, 0);
  assert.equal(summary.yearlyCents, 0);
});

test('summarize treats the reminder window as inclusive and counts trials', async () => {
  const db = createMemoryBackend();
  const today = '2026-11-09';
  await saveSubscription(db, subscriptionInput({ merchantName: 'Today', status: 'trial', nextRenewalDate: today }));
  await saveSubscription(db, subscriptionInput({ merchantName: 'Boundary', nextRenewalDate: '2026-11-12' }));
  await saveSubscription(db, subscriptionInput({ merchantName: 'Outside', nextRenewalDate: '2026-11-13' }));
  await saveSubscription(db, subscriptionInput({ merchantName: 'Yesterday', nextRenewalDate: '2026-11-08' }));

  const rows = await listSubscriptions(db);
  const narrow = summarize(rows, { today, reminderDays: [3] });
  assert.equal(narrow.activeCount, 4);
  assert.equal(narrow.dueSoonCount, 2);
  assert.deepEqual(narrow.dueSoon.map((row) => row.merchantName), ['Today', 'Boundary']);
  assert.equal(narrow.overdueCount, 1);
  assert.equal(narrow.next.merchantName, 'Today');

  const sameDay = summarize(rows, { today, reminderDays: [0] });
  assert.equal(sameDay.dueSoonCount, 1);
  assert.equal(sameDay.next.merchantName, 'Today');
});

test('subscription and group names are capped at 25 characters', async () => {
  const db = createMemoryBackend();
  const twentyFive = 'x'.repeat(25);
  const twentySix = 'x'.repeat(26);

  const saved = await saveSubscription(db, subscriptionInput({ merchantName: twentyFive }));
  assert.equal(saved.merchantName.length, 25);
  await assert.rejects(
    () => saveSubscription(db, subscriptionInput({ merchantName: twentySix })),
    /25 characters or fewer/
  );
  await assert.rejects(
    () => saveSubscription(db, subscriptionInput({ merchantName: 'Car', trackedFor: twentySix })),
    /Tracked-for name must be 25 characters or fewer/
  );

  const group = await saveGroup(db, { name: twentyFive });
  assert.equal(group.name.length, 25);
  await assert.rejects(() => saveGroup(db, { name: twentySix }), /25 characters or fewer/);
});

test('a second tracker needs a different owner for the same service and plan', async () => {
  const db = createMemoryBackend();
  const mine = { merchantKey: 'netflix', merchantName: 'Netflix', planId: 'standard', planName: 'Standard' };

  const first = await saveSubscription(db, subscriptionInput(mine));
  await assert.rejects(
    () => saveSubscription(db, subscriptionInput(mine)),
    /already in your tracker/
  );

  const forMom = await saveSubscription(db, subscriptionInput({ ...mine, trackedFor: 'Mom' }));
  assert.equal(forMom.trackedFor, 'Mom');
  await assert.rejects(
    () => saveSubscription(db, subscriptionInput({ ...mine, trackedFor: 'mom' })),
    /already tracked for Mom/
  );

  // A different plan is a different subscription type.
  const premium = await saveSubscription(
    db,
    subscriptionInput({ ...mine, planId: 'premium', planName: 'Premium' })
  );
  assert.equal(premium.planId, 'premium');

  // Editing the same record does not trip its own guard.
  const renamed = await saveSubscription(
    db,
    subscriptionInput({ ...first, merchantName: 'Netflix PH' })
  );
  assert.equal(renamed.id, first.id);

  const rows = await listSubscriptions(db);
  assert.equal(rows.length, 3);
  assert.equal(findDuplicateSubscription(rows, { ...mine, id: first.id }), null);
});
