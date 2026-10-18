import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { grade, dayKey, addDays, makeQueue, updateProgress, insertRetry, maskAnswer, freshState, validateState, stats } from '../dist/core.js';
const { words } = JSON.parse(await readFile(new URL('../dist/data/words.json', import.meta.url)));
const { additionalSpellings } = JSON.parse(await readFile(new URL('../dist/data/overrides.json', import.meta.url)));
const word = text => words.find(w => w.word === text);

test('all 400 official entries have complete structured fields and no table artifacts', () => {
  assert.equal(words.length, 400);
  assert.deepEqual(words.map(w => w.number), Array.from({ length: 400 }, (_, i) => i + 1));
  assert.equal(new Set(words.map(w => w.id)).size, 400);
  for (const w of words) {
    assert.ok(w.definition.length > 0, w.word);
    assert.ok(!/^\d+ /.test(w.definition), `Footer leaked into ${w.word}`);
    assert.ok(w.sentence.length > 5, w.word);
    assert.ok(w.sourcePage >= 21 && w.sourcePage <= 59);
    assert.ok(w.pronunciations.every(p => p.text.trim() && p.segments.map(s => s.text).join('').trim() === p.text), w.word);
    assert.ok(w.acceptedSpellings.every(s => /\p{L}/u.test(s)), w.word);
    for (const s of w.acceptedSpellings) assert.equal(grade(w, s).correct, true);
  }
});
test('grading enforces capitals while ignoring optional accents and punctuation', () => {
  assert.equal(grade(word('Andorra'), 'andorra').reason, 'capital');
  assert.equal(grade(word('Andorra'), 'Andorra').correct, true);
  assert.equal(grade(word('éclair'), 'eclair').correct, true);
  assert.equal(grade(word('chockablock'), 'chock-a-block').correct, true);
  assert.equal(grade(word('abbess'), 'abbes').correct, false);
  assert.equal(grade(word('abbess'), '  ').reason, 'empty');
  assert.equal(grade(word('abbess'), '!!!').reason, 'empty');
  assert.equal(grade(word('epact'), ',').correct, false);
});
test('accepts source alternatives and verified additional forms, not homophones', () => {
  assert.equal(grade(word('enamoured'), 'enamored').correct, true);
  const w = word('accoutre');
  assert.equal(grade(w, 'accouter', additionalSpellings[w.id]).correct, true);
  assert.equal(grade(word('lyre'), 'liar').correct, false);
  assert.equal(grade(word('Pacific'), 'pacific').correct, false);
});
test('queue prioritizes overdue reviews, then new words; caps short sessions', () => {
  const progress = { [words[0].id]: { due: '2026-10-10' }, [words[1].id]: { due: '2026-11-10' } };
  const queue = makeQueue(words, progress, 'short', '2026-10-18', false, () => .5);
  assert.equal(queue.length, 10); assert.equal(queue[0].id, words[0].id);
  assert.ok(!queue.some(x => x.id === words[1].id));
  assert.equal(new Set(queue.map(x => x.id)).size, queue.length);
  assert.equal(makeQueue(words, progress, 'open', '2026-10-18').length, 399);
});
test('correct reviews advance intervals, a miss resets, retries do not promote', () => {
  let p = updateProgress(undefined, true, '2026-10-18');
  assert.equal(p.due, '2026-10-19'); assert.equal(p.stage, 0);
  p = updateProgress(p, true, '2026-10-19'); assert.equal(p.due, '2026-10-22');
  p = updateProgress(p, false, '2026-10-22'); assert.equal(p.due, '2026-10-23'); assert.equal(p.stage, 0);
  const retry = updateProgress(p, true, '2026-10-22', true);
  assert.equal(retry.stage, 0); assert.equal(retry.due, p.due); assert.equal(retry.attempts, 3);
  assert.equal(updateProgress(p, false, '2026-10-22', false, true), p);
  assert.equal(updateProgress({ ...p, stage: 4 }, true, '2026-10-22').stage, 4);
});
test('retries follow three intervening attempts, or join the session end', () => {
  const queue = makeQueue(words, {}, 'short');
  assert.equal(insertRetry(queue, 0, queue[0])[4].id, queue[0].id);
  assert.equal(insertRetry(queue, 9, queue[9])[10].retry, true);
});
test('calendar day math handles months, leap years and local dates', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-07', 3), '2026-03-10');
  assert.equal(dayKey(new Date(2026, 9, 18, 23)), '2026-10-18');
});
test('backup roundtrip and malformed records', () => {
  const state = freshState(); state.progress[words[0].id] = updateProgress(undefined, false, '2026-10-18');
  const copy = validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(copy.progress[words[0].id].due, '2026-10-19');
  assert.throws(() => validateState({ version: 2, progress: {} }));
  assert.throws(() => validateState({ version: 1, progress: { [words[0].id]: { ...state.progress[words[0].id], due: '2026-02-31' } } }));
  assert.throws(() => validateState({ version: 1, progress: { [words[0].id]: { ...state.progress[words[0].id], attempts: -1 } } }));
  assert.throws(() => validateState({ version: 1, progress: { '<script>': state.progress[words[0].id] } }));
});
test('masked examples conceal targets without hiding unrelated substrings', () => {
  assert.equal(maskAnswer('The lyre was old. LYRE.', word('lyre')), 'The _____ was old. _____.');
  assert.equal(maskAnswer('The caribou is here.', word('caribou')), 'The _____ is here.');
  for (const w of words) assert.ok(!maskAnswer(w.sentence, w).toLowerCase().includes(w.word.toLowerCase()), w.word);
});
test('progress keyed by stable IDs survives reorder and extension', () => {
  const progress = { [words[0].id]: updateProgress(undefined, true, '2026-10-18') };
  assert.deepEqual(stats([...words].reverse(), progress, '2026-10-19'), stats(words, progress, '2026-10-19'));
});
test('audio pronunciation overrides are traceable to the provided guide', async () => {
  const overrides = JSON.parse(await readFile(new URL('../tools/pronunciation-overrides.json', import.meta.url)));
  for (const [id, override] of Object.entries(overrides)) {
    const w = words.find(w => w.id === id);
    assert.equal(override.sourcePage, w.sourcePage);
    assert.ok(w.pronunciations.some(p => p.text === override.respelling), w.word);
    assert.ok(override.phonemes.length);
  }
});
