/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dayText, whenText } from './when.ts';

const at = (y: number, m: number, d: number, h = 14, min = 15) => new Date(y, m - 1, d, h, min).getTime();
const now = at(2026, 11, 3, 18, 0);

test('days: today, yesterday, then the date, with the year only when it is not this one', () => {
  assert.equal(dayText(at(2026, 11, 3, 0, 5), now), 'Today');
  assert.equal(dayText(at(2026, 11, 2, 23, 59), now), 'Yesterday');
  assert.match(dayText(at(2026, 11, 1), now), /Nov\s1$/);
  assert.match(dayText(at(2025, 11, 1), now), /2025/);
});

test('with the time', () => {
  assert.match(whenText(at(2026, 11, 3), now), /^Today, 2:15\sPM$/);
});
