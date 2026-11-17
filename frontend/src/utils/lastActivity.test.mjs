import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLastActivity } from './lastActivity.js';

test('unknown activity remains explicitly unknown', () => {
  for (const value of [null, undefined, '', 'invalid']) {
    assert.equal(formatLastActivity(value), 'No recorded activity');
  }
});

test('recorded activity includes date, time and timezone without replacing it with now', () => {
  const value = '2026-10-29T08:45:00Z';
  const formatted = formatLastActivity(value, 'Asia/Kolkata');
  assert.match(formatted, /29/);
  assert.match(formatted, /Oct/);
  assert.match(formatted, /2026/);
  assert.match(formatted, /2:15:00/);
  assert.match(formatted, /IST|GMT\+5:30/);
});
