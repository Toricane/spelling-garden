import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, updateProgress } from '../dist/core.js';
import { loadState, saveState } from '../dist/storage.js';

test('progress roundtrips through local storage', () => {
  const data = new Map();
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const state = freshState(); state.progress['sboc-2027-junior-001'] = updateProgress(undefined, true, '2026-10-18');
  assert.equal(saveState(state), true);
  assert.equal(loadState().state.progress['sboc-2027-junior-001'].due, '2026-10-19');
});
test('storage failures are surfaced and corrupt data is preserved for recovery', () => {
  const raw = '{bad-json'; let stored = raw;
  globalThis.localStorage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  const loaded = loadState();
  assert.equal(loaded.raw, raw); assert.ok(loaded.warning); assert.equal(stored, raw);
  globalThis.localStorage = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.ok(loadState().warning.includes('cannot access'));
  assert.equal(saveState(freshState()), false);
});
