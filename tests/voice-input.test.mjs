import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSpokenLetters, createVoiceInput, voiceSpaceShortcut, practiceEnterShortcut } from '../dist/voice-input.js';
import { freshState, validateState } from '../dist/core.js';

test('letter input preserves repeats, mistakes and explicit capitals without knowing the answer', () => {
  assert.deepEqual(parseSpokenLetters('Capital A, bee bee ess ess'), { value: 'Abbss', unknown: [] });
  assert.equal(parseSpokenLetters('double you, zed, zee, eye, queue').value, 'wzziq');
  assert.equal(parseSpokenLetters('C A T').value, 'cat');
  assert.deepEqual(parseSpokenLetters('cat'), { value: '', unknown: ['cat'] });
  assert.ok(parseSpokenLetters('A capital').unknown.length);
  assert.deepEqual(parseSpokenLetters('SUV'), { value: 'suv', unknown: [] });
  assert.deepEqual(parseSpokenLetters('S U B'), { value: 'sub', unknown: [] });
  assert.deepEqual(parseSpokenLetters('muscular'), { value: '', unknown: ['muscular'] });
});

function setup() {
  const changes = [], instances = [];
  class Recognition {
    constructor() { instances.push(this); }
    start() {}
    stop() { this.stopped = true; }
    abort() { this.aborted = true; }
    result(parts) {
      this.onresult({ results: parts.map(([text, isFinal]) => Object.assign([{ transcript: text }], { isFinal })) });
    }
  }
  const voice = createVoiceInput(Recognition, state => changes.push(state));
  return { voice, instances, changes, latest: () => changes.at(-1) };
}

test('a whole-word rewrite preserves previously observed spelling through stop-and-check', async () => {
  const { voice, instances, latest } = setup();
  voice.start(); const engine = instances[0];
  engine.result([['M U S C U L A R', false]]);
  assert.equal(latest().value, 'muscular');
  const finished = voice.finish();
  engine.result([['muscular', true]]);
  assert.equal(latest().value, 'muscular');
  assert.equal(latest().invalid, false);
  engine.onend();
  assert.deepEqual(await finished, { value: 'muscular', invalid: false });
});

test('reformatted spelling can be followed by more letters without duplication', () => {
  const { voice, instances, latest } = setup();
  voice.start(); const engine = instances[0];
  engine.result([['M U S C U L A R B', false]]);
  engine.result([['muscular B', true], ['C', false]]);
  assert.equal(latest().value, 'muscularbc');
  engine.result([['muscular B', true], ['C D', true]]);
  engine.onend();
  assert.equal(latest().value, 'muscularbcd');
  assert.equal(latest().invalid, false);
});

test('collapsed merged interim chunks preserve capitals and repeated letters', () => {
  const { voice, instances, latest } = setup();
  voice.start(); const engine = instances[0];
  engine.result([['capital A B', false], ['B E S S', false]]);
  engine.result([['abbess', true]]); engine.onend();
  assert.equal(latest().value, 'Abbess');
  assert.equal(latest().invalid, false);
});

test('a conflicting acronym retains earlier explicit letters with a review advisory', async () => {
  const { voice, instances, latest } = setup();
  voice.start(); const engine = instances[0];
  engine.result([['S U B', false]]);
  const finished = voice.finish(); engine.result([['SUV', true]]); engine.onend();
  assert.deepEqual(await finished, { value: 'sub', invalid: true });
  assert.equal(latest().value, 'sub');
});

test('an acronym without earlier letter evidence decodes as heard, without correcting V to B', () => {
  const { voice, instances, latest } = setup();
  voice.start(); instances[0].result([['SUV', true]]); instances[0].onend();
  assert.equal(latest().value, 'suv');
});

test('a collapsed word cannot invent letters that were never captured', () => {
  const { voice, instances, latest } = setup();
  voice.start(); const engine = instances[0];
  engine.result([['M U S', false]]); engine.result([['muscular', true]]); engine.onend();
  assert.equal(latest().value, 'mus');
  assert.equal(latest().invalid, true);
});

test('a spoken whole word without previous spelling evidence remains invalid', () => {
  const { voice, instances, latest } = setup();
  voice.start(); instances[0].result([['muscular', true]]); instances[0].onend();
  assert.equal(latest().value, '');
  assert.equal(latest().invalid, true);
});

test('withdrawn or unfinalized letters remain visible with a review advisory', async () => {
  for (const revision of [[], [['M U', false]]]) {
    const { voice, instances, latest } = setup();
    voice.start(); const engine = instances[0]; engine.result([['M U S', false]]);
    const finished = voice.finish(); engine.result(revision); engine.onend();
    assert.equal(latest().value, 'mus');
    assert.deepEqual(await finished, { value: 'mus', invalid: true });
  }
});

test('withdrawing a provisional tail after a final chunk does not erase its letters', () => {
  const { voice, instances, latest } = setup();
  voice.start(); const engine = instances[0];
  engine.result([['M U S', true], ['C U L A R', false]]);
  engine.result([['M U S', true]]);
  assert.equal(latest().value, 'muscular');
  assert.equal(latest().invalid, true);
  engine.result([['M U S', true], ['C U L A R', true]]); engine.onend();
  assert.equal(latest().value, 'muscular');
  assert.equal(latest().invalid, false);
});

test('an unknown rewrite cannot wipe out known letters from a partially understood chunk', () => {
  const { voice, instances, latest } = setup();
  voice.start(); const engine = instances[0];
  engine.result([['M U S banana', false]]);
  engine.result([['muscular', true]]); engine.onend();
  assert.equal(latest().value, 'mus');
  assert.equal(latest().invalid, true);
});

test('interim revisions replace text; stop waits for final results and resume appends', () => {
  const { voice, instances, latest } = setup();
  voice.start('A');
  const first = instances[0]; first.onstart();
  first.result([['B', true], ['D', false]]);
  assert.equal(latest().value, 'Abd');
  first.result([['B', true], ['E', false]]);
  assert.equal(latest().value, 'Abe');
  voice.stop(); assert.equal(voice.phase, 'stopping'); assert.equal(first.stopped, true);
  first.result([['B', true], ['E E', true]]); first.onend();
  assert.equal(latest().value, 'Abee'); assert.equal(voice.phase, 'idle');
  voice.start(latest().value); instances[1].result([['Zed', true]]); instances[1].onend();
  assert.equal(latest().value, 'Abeez');
});

test('stop-and-check waits for final letters, including late revisions', async () => {
  const { voice, instances, latest } = setup();
  voice.start(); const engine = instances[0]; engine.onstart();
  engine.result([['B', false]]);
  let settled = false;
  const finished = voice.finish().then(result => { settled = true; return result; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(engine.stopped, true);
  engine.result([['D E E', true]]);
  engine.onend();
  assert.deepEqual(await finished, { value: 'dee', invalid: false });
  assert.equal(latest().value, 'dee');
});

test('checking while already stopping waits for the same final transcript', async () => {
  const { voice, instances } = setup();
  voice.start('a'); const engine = instances[0]; voice.stop();
  const first = voice.finish(), second = voice.finish();
  engine.result([['B', true]]); engine.onend();
  assert.deepEqual(await first, { value: 'ab', invalid: false });
  assert.deepEqual(await second, { value: 'ab', invalid: false });
});

test('cancelled or failed stop-and-check never yields a gradable answer', async () => {
  for (const action of ['cancel', 'network']) {
    const { voice, instances } = setup();
    voice.start(); const engine = instances[0]; engine.result([['B', true]]);
    const finished = voice.finish();
    if (action === 'cancel') voice.cancel();
    else engine.onerror({ error: action });
    engine.result([['C', true]]); engine.onend();
    assert.equal(await finished, null);
  }
});

test('stop-and-check preserves unknown speech as invalid', async () => {
  const { voice, instances } = setup();
  voice.start(); const finished = voice.finish();
  instances[0].result([['B banana', true]]); instances[0].onend();
  assert.deepEqual(await finished, { value: 'b', invalid: true });
});

test('cancellation discards interim text and ignores late callbacks after restart', () => {
  const { voice, instances, latest, changes } = setup();
  voice.start(); const old = instances[0]; old.onstart(); old.result([['B', true], ['T', false]]);
  assert.deepEqual(voice.cancel(), { value: 'b', invalid: false });
  assert.equal(old.aborted, true);
  voice.start(''); const count = changes.length;
  old.result([['C A T', true]]); old.onerror({ error: 'network' }); old.onend();
  assert.equal(changes.length, count);
  instances[1].result([['D', true]]); instances[1].onend();
  assert.equal(latest().value, 'd');
});

test('unknown speech carries a review advisory and permission failures release the controller', () => {
  const { voice, instances, latest } = setup();
  voice.start(); instances[0].result([['B banana', true]]); instances[0].onend();
  assert.equal(latest().invalid, true);
  voice.start('b'); instances[1].onerror({ error: 'not-allowed' });
  assert.equal(voice.phase, 'idle'); assert.match(latest().message, /not allowed/);
  assert.equal(latest().value, 'b');
});

test('unsupported and synchronously failing browsers leave typing available', () => {
  let last;
  const unsupported = createVoiceInput(undefined, state => { last = state; });
  unsupported.start('abc'); assert.equal(last.value, 'abc'); assert.match(last.message, /unavailable/);
  class Broken { start() { throw new Error('blocked'); } abort() {} }
  const broken = createVoiceInput(Broken, state => { last = state; });
  broken.start(); assert.equal(broken.phase, 'idle'); assert.match(last.message, /could not start/);
});

test('Space shortcut leaves editable fields and other native controls alone', () => {
  const event = { code: 'Space', target: { closest: () => null } };
  assert.equal(voiceSpaceShortcut(event), true);
  assert.equal(voiceSpaceShortcut({ ...event, target: { closest: () => ({}) } }), false);
  assert.equal(voiceSpaceShortcut({ ...event, target: { id: 'voice-record' } }), true);
  assert.equal(voiceSpaceShortcut({ ...event, target: { id: 'answer', readOnly: true, closest: () => ({}) } }), true);
  assert.equal(voiceSpaceShortcut({ ...event, target: { id: 'answer', readOnly: false, closest: () => ({}) } }), false);
  assert.equal(voiceSpaceShortcut({ ...event, ctrlKey: true }), false);
  assert.equal(voiceSpaceShortcut({ ...event, isComposing: true }), false);
});

test('saved input mode validates and old backups default to typing without losing progress', () => {
  const state = freshState(); state.settings.inputMode = 'voice';
  assert.equal(validateState(state).settings.inputMode, 'voice');
  delete state.settings.inputMode;
  assert.equal(validateState(state).settings.inputMode, 'typing');
  state.settings.inputMode = 'unexpected';
  assert.equal(validateState(state).settings.inputMode, 'typing');
});

test('Enter checks from voice controls and the answer without hijacking other controls or IME', () => {
  const event = { key: 'Enter', target: { closest: () => null } };
  assert.equal(practiceEnterShortcut(event), true);
  for (const id of ['answer', 'check', 'voice-record', 'voice-restart']) {
    assert.equal(practiceEnterShortcut({ ...event, target: { id, closest: () => ({}) } }), true);
  }
  assert.equal(practiceEnterShortcut({ ...event, target: { id: 'hear', closest: () => ({}) } }), false);
  assert.equal(practiceEnterShortcut({ ...event, isComposing: true }), false);
  assert.equal(practiceEnterShortcut({ ...event, ctrlKey: true }), false);
});
