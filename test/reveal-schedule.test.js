'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  isSundayOnePmEastern,
  sundayOnePmEasternRevealAt
} = require('../reveal-schedule');

test('Sunday 1 PM Eastern reveal slot accounts for daylight saving time and excludes other weekdays', () => {
  assert.equal(isSundayOnePmEastern('2026-09-13T17:00:00.000Z'), true);
  assert.equal(isSundayOnePmEastern('2027-01-03T18:00:00.000Z'), true);
  assert.equal(isSundayOnePmEastern('2026-11-26T18:00:00.000Z'), false);
  assert.equal(isSundayOnePmEastern('not a timestamp'), false);
});

test('weekly reveal time is the Sunday 1 PM Eastern slot, not another game at the same UTC time', () => {
  const revealAt = sundayOnePmEasternRevealAt([
    { start_time: '2026-11-26T17:00:00.000Z' },
    { start_time: '2026-09-13T17:00:00.000Z' },
    { start_time: '2026-09-13T20:25:00.000Z' }
  ]);
  assert.equal(revealAt.toISOString(), '2026-09-13T17:00:00.000Z');
  assert.equal(sundayOnePmEasternRevealAt([
    { start_time: '2026-11-26T18:00:00.000Z' }
  ]), null);
});
