import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSpelling } from '../dist/answer-diff.js';

const changed = tokens => tokens.filter(x => x.changed).map(x => x.text).join('');
const text = tokens => tokens.map(x => x.text).join('');

test('substitutions highlight only the differing letters in each spelling', () => {
  const diff = compareSpelling('paratical', ['piratical']);
  assert.equal(changed(diff.yours), 'a');
  assert.equal(changed(diff.expected), 'i');
  assert.equal(text(diff.yours), 'paratical');
  assert.equal(text(diff.expected), 'piratical');
});

test('missing and extra letters do not mark an otherwise matching suffix', () => {
  const missing = compareSpelling('resistace', ['resistance']);
  assert.equal(changed(missing.yours), '');
  assert.equal(changed(missing.expected), 'n');
  const extra = compareSpelling('resisstance', ['resistance']);
  assert.equal(changed(extra.yours), 's');
  assert.equal(changed(extra.expected), '');
});

test('capitals differ, while optional accents, spaces and punctuation do not', () => {
  const capital = compareSpelling('andorra', ['Andorra']);
  assert.equal(changed(capital.yours), 'a');
  assert.equal(changed(capital.expected), 'A');
  const optional = compareSpelling('  eclair ', ['é-clair']);
  assert.equal(optional.distance, 0);
  assert.equal(changed(optional.yours), '');
  assert.equal(changed(optional.expected), '');
});

test('comparison chooses the closest accepted alternative', () => {
  const diff = compareSpelling('enamored', ['enamoured', 'enamored']);
  assert.equal(diff.distance, 0);
  assert.equal(text(diff.expected), 'enamored');
  assert.equal(changed(diff.yours), '');
});

test('empty and unusually long answers remain safe and retain their text', () => {
  assert.equal(changed(compareSpelling('', ['cat']).expected), 'cat');
  const long = 'x'.repeat(1000);
  assert.equal(text(compareSpelling(long, ['cat']).yours), long);
});
