import assert from 'node:assert/strict';
import { test } from 'node:test';

import { keepUndoHistory, undoHistoryFor, UNDO_TABLES } from './undoHistory.ts';

test('the last few tables keep their undo history; the oldest beyond them lets go', () => {
  for (let i = 0; i <= UNDO_TABLES; i++) keepUndoHistory(`t${i}`, { history: [i], future: [] });
  // The first kept is the oldest: gone once one more came.
  assert.deepEqual(undoHistoryFor('t0'), { history: [], future: [] });
  assert.deepEqual(undoHistoryFor('t1').history, [1]);
  // Kept again, it's the most recent: another new one lets go of the next oldest instead.
  keepUndoHistory('t1', { history: [1, 2], future: [3] });
  keepUndoHistory('new', { history: [], future: [] });
  assert.deepEqual(undoHistoryFor('t1'), { history: [1, 2], future: [3] });
  assert.deepEqual(undoHistoryFor('t2'), { history: [], future: [] });
});
