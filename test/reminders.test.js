import test from 'node:test';
import assert from 'node:assert/strict';

import { reminderId, reminderSchedule } from '../public/js/reminders.js';

function sub(overrides = {}) {
	return {
		id: 1,
		merchantName: 'Netflix',
		planName: 'Standard',
		kind: 'recurring',
		status: 'active',
		cadence: 'monthly',
		amountCents: 44900,
		currency: 'PHP',
		nextRenewalDate: '2026-11-12',
		...overrides,
	};
}

test('reminderSchedule creates one entry per future reminder day', () => {
	const schedule = reminderSchedule(
		[sub()],
		{
			reminderDays: [7, 3, 1, 0],
			today: '2026-11-09',
			now: new Date('2026-11-09T08:00:00'),
		}
	);

	assert.deepEqual(schedule.map((entry) => entry.date), ['2026-11-09', '2026-11-11', '2026-11-12']);
	assert.deepEqual(schedule.map((entry) => entry.daysBefore), [3, 1, 0]);
	assert.equal(schedule[0].title, 'Netflix renews in 3 days');
	assert.equal(schedule[0].body, 'Standard · ₱449.00 · Monthly');
	assert.equal(schedule[1].title, 'Netflix renews in 1 day');
	assert.equal(schedule[2].title, 'Netflix renews today');
	assert.ok(schedule.every((entry) => entry.at.getHours() === 9));
	assert.equal(new Set(schedule.map((entry) => entry.id)).size, schedule.length);
});

test('reminderSchedule skips past, paused, canceled, and undated records', () => {
	const schedule = reminderSchedule(
		[
			sub({ id: 1, nextRenewalDate: '2026-11-09' }),
			sub({ id: 2, status: 'paused' }),
			sub({ id: 3, status: 'canceled' }),
			sub({ id: 4, nextRenewalDate: null }),
			sub({ id: 5, nextRenewalDate: '2026-11-12' }),
		],
		{
			reminderDays: [7, 0],
			today: '2026-11-09',
			now: new Date('2026-11-09T08:00:00'),
		}
	);

	assert.deepEqual(schedule.map((entry) => entry.subscriptionId), [1, 5]);
	assert.deepEqual(schedule.map((entry) => entry.date), ['2026-11-09', '2026-11-12']);
});

test('reminderSchedule drops occurrences whose 09:00 time already passed', () => {
	const schedule = reminderSchedule(
		[sub({ nextRenewalDate: '2026-11-09' })],
		{
			reminderDays: [0],
			today: '2026-11-09',
			now: new Date('2026-11-09T10:00:00'),
		}
	);
	assert.deepEqual(schedule, []);
});

test('reminderSchedule handles one-time deals and limits pending notifications', () => {
	const rows = [sub({ kind: 'one_time', cadence: null, nextRenewalDate: '2026-11-10' })];
	for (let index = 2; index < 10; index += 1) rows.push(sub({ id: index, nextRenewalDate: '2026-11-20' }));

	const schedule = reminderSchedule(rows, {
		reminderDays: [7, 3, 1],
		today: '2026-11-09',
		now: new Date('2026-11-09T08:00:00'),
		limit: 4,
	});

	assert.equal(schedule.length, 4);
	assert.ok(schedule.every((entry) => entry.at.getTime() > new Date('2026-11-09T08:00:00').getTime()));
	assert.equal(schedule[0].title, 'Netflix expires in 1 day');
	assert.equal(schedule[0].body, 'Standard · ₱449.00 · one-time');
});

test('reminderId is deterministic and positive', () => {
	const first = reminderId(7, 3, '2026-11-09');
	assert.equal(first, reminderId(7, 3, '2026-11-09'));
	assert.ok(first > 0);
	assert.ok(first <= 2147483647);
	assert.notEqual(first, reminderId(7, 1, '2026-11-09'));
});
