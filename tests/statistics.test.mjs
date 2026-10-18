import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState } from '../dist/core.js';
import { practiceStatistics } from '../dist/statistics.js';

const words = [{ id: 'a', number: 1, word: 'alpha' }, { id: 'b', number: 2, word: 'beta' }, { id: 'c', number: 3, word: 'gamma' }];
test('statistics handle no progress without invented accuracy', () => {
  const s = practiceStatistics(words, freshState(), '2026-01-01');
  assert.equal(s.accuracy, null);
  assert.equal(s.unseen, 3);
  assert.equal(s.days.length, 14);
  assert.equal(s.days[0].day, '2025-12-19');
  assert.equal(s.days.at(-1).day, '2026-01-01');
  assert.ok(s.days.every(d => d.total === 0));
});
test('review accuracy is weighted by scheduled attempts and ignores retries, sessions and unknown IDs', () => {
  const state = freshState();
  state.progress = {
    a: { attempts: 4, correct: 1, lapses: 3, retries: 9, stage: 0, due: '2026-01-01' },
    b: { attempts: 6, correct: 5, lapses: 1, stage: 3, due: '2026-01-02' },
    unknown: { attempts: 100, correct: 100, stage: 4 }
  };
  state.sessions = [{ day: '2026-01-01', total: 50, correct: 50 }];
  const s = practiceStatistics(words, state, '2026-01-01');
  assert.equal(s.accuracy, 60);
  assert.equal(s.attempts, 10);
  assert.equal(s.due, 1);
  assert.equal(s.growing, 1);
  assert.deepEqual(s.stages.map(x => x.count), [1, 0, 0, 1, 0]);
  assert.deepEqual(s.tricky.map(x => x.word.id), ['a', 'b']);
});
test('activity combines same-day sessions across calendar boundaries and excludes dates outside its window', () => {
  const state = freshState();
  state.sessions = [
    { day: '2025-12-18', total: 100, correct: 100 },
    { day: '2025-12-19', total: 3, correct: 2 },
    { day: '2026-01-01', total: 10, correct: 7 },
    { day: '2026-01-01', total: 5, correct: 5 },
    { day: '2026-01-02', total: 100, correct: 100 }
  ];
  const before = JSON.stringify(state);
  const s = practiceStatistics(words, state, '2026-01-01');
  assert.deepEqual(s.days.at(-1), { day: '2026-01-01', total: 15, correct: 12, sessions: 2 });
  assert.equal(s.days.reduce((n, d) => n + d.total, 0), 18);
  assert.equal(s.recent[0].day, '2026-01-02');
  assert.equal(JSON.stringify(state), before);
});
