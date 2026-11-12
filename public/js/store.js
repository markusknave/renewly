import { CATEGORY_KEYS } from './lib/categories.js';
import {
	INTEREST_FREQUENCIES,
	TRANSACTION_TYPES,
	goalSavedCents,
	methodSnapshot,
	sortTransactions,
} from './finance.js';

export const CADENCES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'custom'];
export const STATUSES = ['active', 'trial', 'paused', 'canceled'];
export const PAYMENT_KINDS = ['card', 'ewallet', 'bank', 'cash', 'other'];
export const PAYMENT_KIND_LABELS = {
  card: 'Card',
  ewallet: 'E-wallet',
  bank: 'Bank transfer',
  cash: 'Cash',
  other: 'Other',
};
export const KIND_LABELS = { recurring: 'Recurring', one_time: 'One-time' };
export const UNGROUPED_LABEL = 'Ungrouped';

const KINDS = ['recurring', 'one_time'];
const SOURCES = ['manual', 'catalog'];

const DEFAULT_SETTINGS = {
  currency: 'PHP',
  timezone: 'Asia/Manila',
  reminderDays: [7, 3, 1],
};

// Subscription and group names are capped at 25 characters: longer labels
// overflow the row, group chip, and group header layouts.
export const MAX_DISPLAY_NAME = 25;
export const MAX_GROUP_NAME_LENGTH = 25;
export const MAX_METHOD_LABEL_LENGTH = 60;
export const MAX_EXPENSE_MERCHANT = 60;
export const MAX_GOAL_NAME = 40;
export const MAX_TRANSACTION_NOTES = 500;
export const GOAL_COLORS = ['indigo', 'teal', 'amber', 'rose', 'sky', 'violet'];
const MAX_NAME_LENGTH = 120;
const MAX_NOTES_LENGTH = 2000;
const MAX_RATE_BPS = 10_000;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validIsoDate(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function normalizeDate(value, errors, field, label) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (validIsoDate(trimmed)) return trimmed;
  }
  errors[field] = `${label} must be a valid date (YYYY-MM-DD).`;
  return null;
}

function slugifyMerchant(name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_NAME_LENGTH);
  return slug || 'merchant';
}

function normalizeId(value, errors) {
  if (value === undefined || value === null || value === '' || value === 0 || value === '0') return 0;
  const id = typeof value === 'string' ? Number(value) : value;
  if (!Number.isInteger(id) || id < 1) {
    errors.id = 'Id is not valid.';
    return 0;
  }
  return id;
}

function toKey(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0) return id;
  }
  return null;
}

function throwIfErrors(errors) {
  const fields = Object.keys(errors);
  if (fields.length === 0) return;
  const error = new Error(errors[fields[0]]);
  error.errors = errors;
  throw error;
}

export function validateSubscriptionInput(input) {
  const errors = {};
  const source = isPlainObject(input) ? input : {};
  if (!isPlainObject(input)) errors.form = 'Subscription details are required.';

  const rawKind = source.kind === undefined || source.kind === null || source.kind === ''
    ? 'recurring'
    : source.kind;
  if (!KINDS.includes(rawKind)) errors.kind = 'Subscription type must be recurring or one_time.';
  const kind = KINDS.includes(rawKind) ? rawKind : 'recurring';

  const merchantName = trimString(source.merchantName);
  if (!merchantName) {
    errors.merchantName = 'Merchant name is required.';
  } else if (merchantName.length > MAX_DISPLAY_NAME) {
    errors.merchantName = `Subscription name must be ${MAX_DISPLAY_NAME} characters or fewer.`;
  }

  const merchantKey = trimString(source.merchantKey).slice(0, MAX_NAME_LENGTH)
    || slugifyMerchant(merchantName);

  const planId = source.planId === undefined || source.planId === null || source.planId === ''
    ? null
    : String(source.planId).trim() || null;

  const planName = trimString(source.planName);
  if (planName.length > MAX_NAME_LENGTH) {
    errors.planName = `Plan name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  const rawAmount = typeof source.amountCents === 'string' && source.amountCents.trim()
    ? Number(source.amountCents)
    : source.amountCents;
  if (!Number.isInteger(rawAmount) || rawAmount < 0) {
    errors.amountCents = 'Amount must be a whole number of cents (0 or more).';
  }
  const amountCents = Number.isInteger(rawAmount) && rawAmount >= 0 ? rawAmount : 0;

  let cadence = source.cadence === undefined || source.cadence === null || source.cadence === ''
    ? null
    : source.cadence;
  let customIntervalDays = null;
  if (kind === 'one_time') {
    if (cadence !== null) errors.cadence = 'One-time payments cannot have a cadence.';
    cadence = null;
  } else if (cadence === null) {
    errors.cadence = 'Choose a billing cadence.';
  } else if (!CADENCES.includes(cadence)) {
    errors.cadence = 'Billing cadence is not recognized.';
  } else if (cadence === 'custom') {
    const rawDays = typeof source.customIntervalDays === 'string' && source.customIntervalDays.trim()
      ? Number(source.customIntervalDays)
      : source.customIntervalDays;
    if (!Number.isInteger(rawDays) || rawDays < 1) {
      errors.customIntervalDays = 'Custom cadence needs a whole number of days (1 or more).';
    } else {
      customIntervalDays = rawDays;
    }
  }

  const rawStatus = source.status === undefined || source.status === null || source.status === ''
    ? 'active'
    : source.status;
  if (!STATUSES.includes(rawStatus)) errors.status = 'Status is not recognized.';
  const status = STATUSES.includes(rawStatus) ? rawStatus : 'active';

  const nextRenewalDate = normalizeDate(source.nextRenewalDate, errors, 'nextRenewalDate', 'Next renewal date');
  const startedOn = normalizeDate(source.startedOn, errors, 'startedOn', 'Start date');
  const lastChargeDate = normalizeDate(source.lastChargeDate, errors, 'lastChargeDate', 'Last charge date');

  const notes = trimString(source.notes);
  if (notes.length > MAX_NOTES_LENGTH) {
    errors.notes = `Notes must be ${MAX_NOTES_LENGTH} characters or fewer.`;
  }

  let paymentMethodId = null;
  if (source.paymentMethodId !== undefined && source.paymentMethodId !== null && source.paymentMethodId !== '') {
    const rawId = typeof source.paymentMethodId === 'string' ? Number(source.paymentMethodId) : source.paymentMethodId;
    if (Number.isInteger(rawId) && rawId > 0) {
      paymentMethodId = rawId;
    } else {
      errors.paymentMethodId = 'Payment method is not valid.';
    }
  }

  let groupId = null;
  if (source.groupId !== undefined && source.groupId !== null && source.groupId !== '') {
    const rawGroupId = typeof source.groupId === 'string' ? Number(source.groupId) : source.groupId;
    if (Number.isInteger(rawGroupId) && rawGroupId > 0) {
      groupId = rawGroupId;
    } else {
      errors.groupId = 'Group is not valid.';
    }
  }

  // Optional owner label: empty means "mine", a name means this record tracks
  // somebody else's subscription of the same type.
  const trackedFor = trimString(source.trackedFor);
  if (trackedFor.length > MAX_DISPLAY_NAME) {
    errors.trackedFor = `Tracked-for name must be ${MAX_DISPLAY_NAME} characters or fewer.`;
  }

  const rawSource = source.source === undefined || source.source === null || source.source === ''
    ? 'manual'
    : source.source;
  const sourceKind = SOURCES.includes(rawSource) ? rawSource : 'manual';

  const id = normalizeId(source.id, errors);

  const data = {
    kind,
    merchantKey,
    merchantName,
    planId,
    planName,
    amountCents,
    currency: 'PHP',
    cadence,
    customIntervalDays,
    status,
    nextRenewalDate,
    startedOn,
    lastChargeDate,
    notes,
    paymentMethodId,
    groupId,
    trackedFor: trackedFor || null,
    source: sourceKind,
  };
  if (id) data.id = id;

  return { errors, data };
}

function validateGroupInput(input) {
  const errors = {};
  const source = isPlainObject(input) ? input : {};
  if (!isPlainObject(input)) errors.form = 'Group details are required.';

  const name = trimString(source.name);
  if (!name) {
    errors.name = 'Group name is required.';
  } else if (name.length > MAX_GROUP_NAME_LENGTH) {
    errors.name = `Group name must be ${MAX_GROUP_NAME_LENGTH} characters or fewer.`;
  }

  const id = normalizeId(source.id, errors);

  const data = { name };
  if (id) data.id = id;

  return { errors, data };
}

function identityPart(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase();
}

// Two subscriptions are the same tracked item when they name the same service,
// the same plan, and the same owner ("tracked for" person or group).
export function subscriptionIdentity(subscription) {
  const source = isPlainObject(subscription) ? subscription : {};
  const merchant = identityPart(source.merchantKey || source.merchantName);
  const plan = identityPart(source.planId || source.planName);
  const owner = identityPart(source.trackedFor);
  return `${merchant}|${plan}|${owner}`;
}

export function findDuplicateSubscription(subscriptions, candidate) {
  const rows = Array.isArray(subscriptions) ? subscriptions : [];
  const target = subscriptionIdentity(candidate);
  const candidateId = Number(candidate?.id) || 0;
  return (
    rows.find(
      (row) =>
        row &&
        (Number(row.id) || 0) !== candidateId &&
        subscriptionIdentity(row) === target
    ) || null
  );
}

export async function listGroups(db) {
  const rows = await db.getAll('groups');
  return rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')) || (a.id || 0) - (b.id || 0));
}

export async function saveGroup(db, input) {
  const { errors, data } = validateGroupInput(input);
  throwIfErrors(errors);

  const groups = await db.getAll('groups');
  const nameKey = data.name.toLocaleLowerCase();
  const duplicate = groups.find(
    (group) => group.id !== data.id && String(group.name || '').trim().toLocaleLowerCase() === nameKey
  );
  if (duplicate) throw new Error('A group with that name already exists.');

  const now = new Date().toISOString();
  const id = data.id || 0;
  const existing = id ? await db.get('groups', id) : undefined;
  if (id && !existing) throw new Error('Group not found.');
  const record = { ...data };
  record.createdAt = existing && existing.createdAt ? existing.createdAt : now;
  record.updatedAt = now;

  if (id) record.id = id;
  const key = await db.put('groups', record);
  if (!id) record.id = key;
  return record;
}

export async function deleteGroup(db, id) {
  const key = toKey(id);
  if (key === null) return false;
  const existing = await db.get('groups', key);
  if (!existing) return false;
  await db.delete('groups', key);

  const now = new Date().toISOString();
  const subscriptions = await db.getAll('subscriptions');
  for (const subscription of subscriptions) {
    if (subscription.groupId !== key) continue;
    subscription.groupId = null;
    subscription.updatedAt = now;
    await db.put('subscriptions', subscription);
  }
  return true;
}

// Groups the subscriptions for the Groups screen and counts which payment
// method pays which subscriptions in each group.
export function summarizeGroups(groups, subscriptions) {
  const rows = Array.isArray(subscriptions) ? subscriptions : [];
  const groupsList = Array.isArray(groups) ? groups : [];
  return groupsList.map((group) => {
    const items = rows.filter((subscription) => subscription && subscription.groupId === group.id);
    const counts = new Map();
    for (const subscription of items) {
      const methodId = subscription.paymentMethodId ?? null;
      counts.set(methodId, (counts.get(methodId) || 0) + 1);
    }
    return {
      ...group,
      subscriptions: items,
      subscriptionCount: items.length,
      methodCounts: [...counts.entries()].map(([paymentMethodId, count]) => ({ paymentMethodId, count })),
    };
  });
}


function validatePaymentMethodInput(input) {
  const errors = {};
  const source = isPlainObject(input) ? input : {};
  if (!isPlainObject(input)) errors.form = 'Payment method details are required.';

  const label = trimString(source.label);
  if (!label) {
    errors.label = 'Label is required.';
  } else if (label.length > MAX_METHOD_LABEL_LENGTH) {
    errors.label = `Label must be ${MAX_METHOD_LABEL_LENGTH} characters or fewer.`;
  }

  const rawKind = source.kind === undefined || source.kind === null || source.kind === ''
    ? 'other'
    : source.kind;
  if (!PAYMENT_KINDS.includes(rawKind)) errors.kind = 'Payment method type is not recognized.';
  const kind = PAYMENT_KINDS.includes(rawKind) ? rawKind : 'other';

  const last4 = trimString(source.last4);
  if (last4.length > 4) errors.last4 = 'Last 4 must be 4 characters or fewer.';

  const notes = trimString(source.notes);
  if (notes.length > MAX_NOTES_LENGTH) {
    errors.notes = `Notes must be ${MAX_NOTES_LENGTH} characters or fewer.`;
  }

  const rawOpening = source.openingBalanceCents === undefined || source.openingBalanceCents === null
    || source.openingBalanceCents === ''
    ? 0
    : typeof source.openingBalanceCents === 'string'
      ? Number(source.openingBalanceCents)
      : source.openingBalanceCents;
  if (!Number.isInteger(rawOpening) || rawOpening < 0) {
    errors.openingBalanceCents = 'Starting balance must be a whole number of cents (0 or more).';
  }
  const openingBalanceCents = Number.isInteger(rawOpening) && rawOpening >= 0 ? rawOpening : 0;

  const openingDate = normalizeDate(source.openingDate, errors, 'openingDate', 'Balance date');

  const rawRate = source.interestRateBps === undefined || source.interestRateBps === null
    || source.interestRateBps === ''
    ? 0
    : typeof source.interestRateBps === 'string'
      ? Number(source.interestRateBps)
      : source.interestRateBps;
  if (!Number.isInteger(rawRate) || rawRate < 0 || rawRate > MAX_RATE_BPS) {
    errors.interestRateBps = 'Interest rate must be a whole number of basis points between 0 and 10000.';
  }
  const interestRateBps = Number.isInteger(rawRate) && rawRate >= 0 && rawRate <= MAX_RATE_BPS ? rawRate : 0;

  const rawFrequency = source.interestFrequency === undefined || source.interestFrequency === null
    || source.interestFrequency === ''
    ? 'none'
    : source.interestFrequency;
  if (!INTEREST_FREQUENCIES.includes(rawFrequency)) {
    errors.interestFrequency = 'Interest frequency must be none, daily, or monthly.';
  }
  const interestFrequency = INTEREST_FREQUENCIES.includes(rawFrequency) ? rawFrequency : 'none';

  const network = ['visa', 'mastercard', 'other'].includes(source.network) ? source.network : '';

  const id = normalizeId(source.id, errors);

  const data = {
    label,
    kind,
    last4,
    notes,
    openingBalanceCents,
    openingDate,
    interestRateBps,
    interestFrequency,
    network,
  };
  if (id) data.id = id;

  return { errors, data };
}

export async function listSubscriptions(db) {
  const rows = await db.getAll('subscriptions');
  return rows.sort(compareSubscriptions);
}

function compareSubscriptions(a, b) {
  const dateA = validIsoDate(a.nextRenewalDate) ? a.nextRenewalDate : null;
  const dateB = validIsoDate(b.nextRenewalDate) ? b.nextRenewalDate : null;
  if (dateA !== dateB) {
    if (dateA === null) return 1;
    if (dateB === null) return -1;
    return dateA < dateB ? -1 : 1;
  }

  const byName = String(a.merchantName || '').localeCompare(String(b.merchantName || ''));
  if (byName !== 0) return byName;
  return (a.id || 0) - (b.id || 0);
}

export async function getSubscription(db, id) {
  const key = toKey(id);
  if (key === null) return undefined;
  return db.get('subscriptions', key);
}

export async function saveSubscription(db, input) {
  const { errors, data } = validateSubscriptionInput(input);

  if (!errors.paymentMethodId && data.paymentMethodId !== null) {
    const method = await db.get('paymentMethods', data.paymentMethodId);
    if (!method) errors.paymentMethodId = 'Payment method not found.';
  }
  if (!errors.groupId && data.groupId !== null) {
    const group = await db.get('groups', data.groupId);
    if (!group) errors.groupId = 'Group not found.';
  }

  // Guard the data layer too: the form asks first, but imports and other
  // callers must not create a second tracker for the same type and owner.
  if (!errors.duplicate) {
    const existingRows = await db.getAll('subscriptions');
    const duplicate = findDuplicateSubscription(existingRows, data);
    if (duplicate) {
      errors.duplicate = duplicate.trackedFor
        ? `${data.merchantName} is already tracked for ${duplicate.trackedFor}.`
        : `${data.merchantName} is already in your tracker. Set who this one is for to track someone else's subscription.`;
    }
  }

  throwIfErrors(errors);

  const now = new Date().toISOString();
  const id = data.id || 0;
  const existing = id ? await db.get('subscriptions', id) : undefined;
  const record = { ...data };
  record.createdAt = existing && existing.createdAt ? existing.createdAt : now;
  record.updatedAt = now;

  if (id) record.id = id;
  const key = await db.put('subscriptions', record);
  if (!id) record.id = key;
  return record;
}

export async function deleteSubscription(db, id) {
  const key = toKey(id);
  if (key === null) return false;
  const existing = await db.get('subscriptions', key);
  if (!existing) return false;
  await db.delete('subscriptions', key);
  return true;
}

export async function listPaymentMethods(db) {
  return db.getAll('paymentMethods');
}

export async function savePaymentMethod(db, input) {
  const { errors, data } = validatePaymentMethodInput(input);
  throwIfErrors(errors);

  const now = new Date().toISOString();
  const id = data.id || 0;
  const existing = id ? await db.get('paymentMethods', id) : undefined;
  const record = { ...data };
  record.createdAt = existing && existing.createdAt ? existing.createdAt : now;
  record.updatedAt = now;

  if (id) record.id = id;
  const key = await db.put('paymentMethods', record);
  if (!id) record.id = key;
  return record;
}

export async function deletePaymentMethod(db, id) {
  const key = toKey(id);
  if (key === null) return false;
  const existing = await db.get('paymentMethods', key);
  if (!existing) return false;

  await db.delete('paymentMethods', key);

  const now = new Date().toISOString();
  const subscriptions = await db.getAll('subscriptions');
  for (const subscription of subscriptions) {
    if (subscription.paymentMethodId !== key) continue;
    subscription.paymentMethodId = null;
    subscription.updatedAt = now;
    await db.put('subscriptions', subscription);
  }

  // Interest rows belong to the deleted method; spend and goal history stays,
  // with the method reference cleared so the ledger remains intact.
  const transactions = await db.getAll('transactions');
  for (const transaction of transactions) {
    if (Number(transaction.paymentMethodId) !== key) continue;
    if (transaction.auto && transaction.type === 'interest') {
      await db.delete('transactions', transaction.id);
      continue;
    }
    await db.put('transactions', {
      ...transaction,
      paymentMethodId: null,
      updatedAt: now,
    });
  }
  return true;
}

function sanitizeSettings(value, base) {
  const source = isPlainObject(value) ? value : {};

  const currency = typeof source.currency === 'string' && /^[A-Z]{3}$/.test(source.currency.trim().toUpperCase())
    ? source.currency.trim().toUpperCase()
    : base.currency;

  const timezone = typeof source.timezone === 'string' && source.timezone.trim()
    ? source.timezone.trim()
    : base.timezone;

  const reminderDays = Array.isArray(source.reminderDays)
    ? [...new Set(source.reminderDays.filter((day) => Number.isInteger(day) && day >= 0))].sort((a, b) => a - b)
    : [...base.reminderDays];

  return { currency, timezone, reminderDays };
}

export async function getSettings(db) {
  const record = await db.get('settings', 'profile');
  return sanitizeSettings(record && record.value, DEFAULT_SETTINGS);
}

export async function saveSettings(db, patch) {
  if (!isPlainObject(patch)) throw new Error('Settings must be an object.');

  const current = await getSettings(db);
  const next = { ...current };

  if (patch.currency !== undefined) {
    const currency = typeof patch.currency === 'string' ? patch.currency.trim().toUpperCase() : '';
    if (currency !== 'PHP') throw new Error('Only PHP is supported.');
    next.currency = 'PHP';
  }

  if (patch.timezone !== undefined) {
    const timezone = typeof patch.timezone === 'string' ? patch.timezone.trim() : '';
    if (!timezone) throw new Error('Timezone is required.');
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      throw new Error('Timezone is not recognized.');
    }
    next.timezone = timezone;
  }

  if (patch.reminderDays !== undefined) {
    if (!Array.isArray(patch.reminderDays)) throw new Error('Reminder days must be a list of days.');
    const days = [];
    for (const day of patch.reminderDays) {
      if (!Number.isInteger(day) || day < 0) {
        throw new Error('Reminder days must be whole numbers of days (0 or more).');
      }
      days.push(day);
    }
    next.reminderDays = [...new Set(days)].sort((a, b) => a - b);
  }

  await db.put('settings', { key: 'profile', value: next });
  return next;
}

function monthlyAmount(subscription) {
  const amount = Number(subscription.amountCents);
  if (!Number.isFinite(amount) || amount < 0) return 0;

  switch (subscription.cadence) {
    case 'weekly':
      return (amount * 52) / 12;
    case 'biweekly':
      return (amount * 26) / 12;
    case 'monthly':
      return amount;
    case 'quarterly':
      return amount / 3;
    case 'semiannual':
      return amount / 6;
    case 'annual':
      return amount / 12;
    case 'custom': {
      const days = Number(subscription.customIntervalDays);
      if (!Number.isInteger(days) || days < 1) return 0;
      return (amount * (365 / days)) / 12;
    }
    default:
      return 0;
  }
}

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function reminderWindow(reminderDays) {
  if (reminderDays === undefined || reminderDays === null) return DEFAULT_SETTINGS.reminderDays[0];
  if (typeof reminderDays === 'number') {
    return Number.isInteger(reminderDays) && reminderDays >= 0 ? reminderDays : 0;
  }
  if (Array.isArray(reminderDays)) {
    const days = reminderDays.filter((day) => Number.isInteger(day) && day >= 0);
    return days.length ? Math.max(...days) : 0;
  }
  return DEFAULT_SETTINGS.reminderDays[0];
}

export function summarize(subscriptions, options = {}) {
  const settings = options || {};
  const today = validIsoDate(settings.today) ? settings.today : localToday();
  const horizon = addDays(today, reminderWindow(settings.reminderDays));
  const rows = Array.isArray(subscriptions) ? subscriptions : [];

  let monthlyCents = 0;
  let yearlyCents = 0;
  let activeCount = 0;
  const dueSoon = [];
  const overdue = [];
  let next = null;

  for (const subscription of rows) {
    if (!subscription) continue;
    if (subscription.status !== 'active' && subscription.status !== 'trial') continue;
    activeCount += 1;

    const date = validIsoDate(subscription.nextRenewalDate) ? subscription.nextRenewalDate : null;
    if (date !== null) {
      if (date < today) {
        overdue.push(subscription);
      } else if (date <= horizon) {
        dueSoon.push(subscription);
      }
      if (date >= today && (next === null || compareSubscriptions(subscription, next) < 0)) {
        next = subscription;
      }
    }

    if (subscription.kind === 'recurring') {
      const monthly = Math.round(monthlyAmount(subscription));
      monthlyCents += monthly;
      yearlyCents += monthly * 12;
    }
  }

  dueSoon.sort(compareSubscriptions);
  overdue.sort(compareSubscriptions);

  return {
    monthlyCents,
    yearlyCents,
    activeCount,
    dueSoonCount: dueSoon.length,
    overdueCount: overdue.length,
    next,
    dueSoon,
    overdue,
  };
}

// ---------------------------------------------------------------------------
// Expense ledger, goals, and in-app transfers
// ---------------------------------------------------------------------------

export function validateExpenseInput(input) {
  const errors = {};
  const source = isPlainObject(input) ? input : {};
  if (!isPlainObject(input)) errors.form = 'Expense details are required.';

  const date = normalizeDate(source.date, errors, 'date', 'Date');
  if (!date) errors.date = 'Date is required (YYYY-MM-DD).';

  const merchant = trimString(source.merchant);
  if (!merchant) {
    errors.merchant = 'Description is required.';
  } else if (merchant.length > MAX_EXPENSE_MERCHANT) {
    errors.merchant = `Description must be ${MAX_EXPENSE_MERCHANT} characters or fewer.`;
  }

  const category = trimString(source.category) || 'other';
  if (!CATEGORY_KEYS.includes(category)) errors.category = 'Category is not recognized.';

  const rawAmount = typeof source.amountCents === 'string' && source.amountCents.trim()
    ? Number(source.amountCents)
    : source.amountCents;
  if (!Number.isInteger(rawAmount) || rawAmount <= 0) {
    errors.amountCents = 'Amount must be a whole number of cents greater than 0.';
  }

  const notes = trimString(source.notes);
  if (notes.length > MAX_TRANSACTION_NOTES) {
    errors.notes = `Notes must be ${MAX_TRANSACTION_NOTES} characters or fewer.`;
  }

  let paymentMethodId = null;
  if (source.paymentMethodId !== undefined && source.paymentMethodId !== null && source.paymentMethodId !== '') {
    const rawId = typeof source.paymentMethodId === 'string' ? Number(source.paymentMethodId) : source.paymentMethodId;
    if (Number.isInteger(rawId) && rawId > 0) paymentMethodId = rawId;
    else errors.paymentMethodId = 'Payment method is not valid.';
  }

  const id = normalizeId(source.id, errors);

  const data = {
    type: 'expense',
    date,
    merchant,
    category,
    amountCents: Number.isInteger(rawAmount) && rawAmount > 0 ? rawAmount : 0,
    paymentMethodId,
    notes,
  };
  if (id) data.id = id;

  return { errors, data };
}

export async function listTransactions(db) {
  return sortTransactions(await db.getAll('transactions'));
}

export async function getTransaction(db, id) {
  const key = toKey(id);
  if (key === null) return undefined;
  return db.get('transactions', key);
}

export async function saveExpense(db, input) {
  const { errors, data } = validateExpenseInput(input);

  if (!errors.paymentMethodId && data.paymentMethodId !== null) {
    const method = await db.get('paymentMethods', data.paymentMethodId);
    if (!method) errors.paymentMethodId = 'Payment method not found.';
  }

  throwIfErrors(errors);

  const now = new Date().toISOString();
  const id = data.id || 0;
  const existing = id ? await db.get('transactions', id) : undefined;
  const record = {
    ...data,
    goalId: null,
    auto: false,
    autoKey: null,
    createdAt: existing && existing.createdAt ? existing.createdAt : now,
    updatedAt: now,
  };
  if (id) record.id = id;
  const key = await db.put('transactions', record);
  if (!id) record.id = key;
  return record;
}

export async function deleteExpense(db, id) {
  const key = toKey(id);
  if (key === null) return false;
  const existing = await db.get('transactions', key);
  if (!existing) return false;
  if (existing.auto) return false;
  await db.delete('transactions', key);
  return true;
}

export function validateGoalInput(input) {
  const errors = {};
  const source = isPlainObject(input) ? input : {};
  if (!isPlainObject(input)) errors.form = 'Goal details are required.';

  const name = trimString(source.name);
  if (!name) {
    errors.name = 'Goal name is required.';
  } else if (name.length > MAX_GOAL_NAME) {
    errors.name = `Goal name must be ${MAX_GOAL_NAME} characters or fewer.`;
  }

  const rawTarget = typeof source.targetCents === 'string' && source.targetCents.trim()
    ? Number(source.targetCents)
    : source.targetCents;
  if (!Number.isInteger(rawTarget) || rawTarget <= 0) {
    errors.targetCents = 'Target must be a whole number of cents greater than 0.';
  }

  const deadline = normalizeDate(source.deadline, errors, 'deadline', 'Target date');
  const note = trimString(source.note);
  if (note.length > 200) errors.note = 'Note must be 200 characters or fewer.';
  const color = GOAL_COLORS.includes(source.color) ? source.color : 'indigo';
  const id = normalizeId(source.id, errors);

  const data = {
    name,
    targetCents: Number.isInteger(rawTarget) && rawTarget > 0 ? rawTarget : 0,
    deadline,
    note,
    color,
  };
  if (id) data.id = id;

  return { errors, data };
}

export async function listGoals(db) {
  const rows = await db.getAll('goals');
  return rows.sort((a, b) => {
    const dateA = a.deadline || '9999-12-31';
    const dateB = b.deadline || '9999-12-31';
    if (dateA !== dateB) return dateA < dateB ? -1 : 1;
    return (a.id || 0) - (b.id || 0);
  });
}

export async function saveGoal(db, input) {
  const { errors, data } = validateGoalInput(input);
  throwIfErrors(errors);

  const goals = await db.getAll('goals');
  const nameKey = data.name.toLocaleLowerCase();
  const duplicate = goals.find(
    (goal) => goal.id !== data.id && String(goal.name || '').trim().toLocaleLowerCase() === nameKey
  );
  if (duplicate) throw new Error('A goal with that name already exists.');

  const now = new Date().toISOString();
  const id = data.id || 0;
  const existing = id ? await db.get('goals', id) : undefined;
  if (id && !existing) throw new Error('Goal not found.');
  const record = { ...data };
  record.createdAt = existing && existing.createdAt ? existing.createdAt : now;
  record.updatedAt = now;

  if (id) record.id = id;
  const key = await db.put('goals', record);
  if (!id) record.id = key;
  return record;
}

export async function deleteGoal(db, id) {
  const key = toKey(id);
  if (key === null) return false;
  const existing = await db.get('goals', key);
  if (!existing) return false;

  const transactions = await db.getAll('transactions');
  for (const transaction of transactions) {
    if (Number(transaction.goalId) !== key) continue;
    await db.delete('transactions', transaction.id);
  }
  await db.delete('goals', key);
  return true;
}

export async function saveGoalTransfer(db, input) {
  const source = isPlainObject(input) ? input : {};
  const errors = {};

  const goalId = toKey(source.goalId);
  if (goalId === null) errors.goalId = 'Goal is required.';
  const paymentMethodId = toKey(source.paymentMethodId);
  if (paymentMethodId === null) errors.paymentMethodId = 'Payment method is required.';

  const rawAmount = typeof source.amountCents === 'string' && source.amountCents.trim()
    ? Number(source.amountCents)
    : source.amountCents;
  if (!Number.isInteger(rawAmount) || rawAmount <= 0) {
    errors.amountCents = 'Amount must be a whole number of cents greater than 0.';
  }

  const date = normalizeDate(source.date, errors, 'date', 'Date');
  if (!date) errors.date = 'Date is required (YYYY-MM-DD).';

  const direction = source.direction === 'from_goal' ? 'from_goal' : 'to_goal';
  throwIfErrors(errors);

  const goal = await db.get('goals', goalId);
  if (!goal) throw new Error('Goal not found.');
  const method = await db.get('paymentMethods', paymentMethodId);
  if (!method) throw new Error('Payment method not found.');

  const transactions = await db.getAll('transactions');
  if (direction === 'to_goal') {
    const snapshot = methodSnapshot(method, transactions, date);
    if (rawAmount > snapshot.totalCents) {
      throw new Error('That is more than the available balance on this payment method.');
    }
  } else {
    const saved = goalSavedCents(goalId, transactions);
    if (rawAmount > saved) {
      throw new Error('That is more than this goal has saved.');
    }
  }

  const now = new Date().toISOString();
  const record = {
    type: direction === 'to_goal' ? 'goal_deposit' : 'goal_withdrawal',
    date,
    amountCents: rawAmount,
    paymentMethodId,
    goalId,
    category: 'other',
    merchant: direction === 'to_goal' ? `To ${goal.name}` : `From ${goal.name}`,
    notes: '',
    auto: false,
    autoKey: null,
    createdAt: now,
    updatedAt: now,
  };
  const key = await db.put('transactions', record);
  record.id = key;
  return record;
}
