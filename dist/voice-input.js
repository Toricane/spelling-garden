// Recognition never receives the target word or a list of accepted answers.
const letterNames = Object.freeze({
  ay: 'a', bee: 'b', be: 'b', cee: 'c', see: 'c', sea: 'c', dee: 'd',
  ee: 'e', ef: 'f', eff: 'f', gee: 'g', aitch: 'h', haitch: 'h', eye: 'i',
  jay: 'j', kay: 'k', el: 'l', ell: 'l', em: 'm', en: 'n', oh: 'o',
  pee: 'p', cue: 'q', queue: 'q', ar: 'r', are: 'r', ess: 's', tee: 't',
  you: 'u', vee: 'v', ex: 'x', why: 'y', zee: 'z', zed: 'z',
});

function expandAcronyms(transcript) {
  // Preserve spelling-style uppercase runs before lowercasing letter names.
  return transcript.replace(/\b[A-Z]{2,5}\b/g, token => token.split('').join(' '));
}

export function parseSpokenLetters(transcript) {
  const tokens = expandAcronyms(transcript).toLowerCase().replace(/double[ -]+(?:you|u)/g, 'w')
    .replace(/[.,!?;:]/g, ' ').trim().split(/\s+/).filter(Boolean);
  let value = '', capital = false;
  const unknown = [];
  for (const token of tokens) {
    if (['capital', 'uppercase'].includes(token)) { capital = true; continue; }
    const letter = /^[a-z]$/.test(token) ? token : letterNames[token];
    if (!letter) { unknown.push(token); continue; }
    value += capital ? letter.toUpperCase() : letter;
    capital = false;
  }
  if (capital) unknown.push('capital (needs a letter)');
  return { value, unknown };
}

function spokenSequence(value) {
  return Array.from(value, letter => letter === letter.toUpperCase() ? `capital ${letter}` : letter).join(' ');
}

function reconcileTranscript(transcript, previous) {
  const prior = parseSpokenLetters(previous);
  if (!prior.value) return { transcript, review: false };
  if (prior.unknown.length) {
    return parseSpokenLetters(transcript).unknown.length
      ? { transcript: previous, review: true }
      : { transcript, review: false };
  }
  let cursor = 0;
  const rewritten = transcript.replace(/[A-Za-z]+/g, token => {
    const parsed = parseSpokenLetters(token);
    if (!parsed.unknown.length) {
      const value = parsed.value.toLowerCase();
      if (prior.value.toLowerCase().slice(cursor, cursor + value.length) === value) cursor += value.length;
      return token;
    }
    // A whole word is accepted only as a reformatting of letters actually
    // observed earlier in this same result, never by consulting the answer.
    const captured = prior.value.slice(cursor, cursor + token.length);
    if (token.length > 1 && captured.toLowerCase() === token.toLowerCase()) {
      cursor += token.length;
      return spokenSequence(captured);
    }
    return token;
  });
  const parsed = parseSpokenLetters(rewritten);
  const acronymRevision = /\b[A-Z]{2,5}\b/.test(transcript) && !parsed.value.toLowerCase().startsWith(prior.value.toLowerCase());
  const removedTail = parsed.value.length < prior.value.length && prior.value.toLowerCase().startsWith(parsed.value.toLowerCase());
  if (parsed.unknown.length || acronymRevision || removedTail) return { transcript: previous, review: true };
  return { transcript: rewritten, review: false };
}

export function practiceEnterShortcut(event) {
  if (event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return false;
  if (['answer', 'check', 'voice-record', 'voice-restart'].includes(event.target?.id)) return true;
  return !event.target?.closest?.('button, a, input, textarea, select, summary, [contenteditable]:not([contenteditable="false"]), [role="button"]');
}

export function voiceSpaceShortcut(event) {
  if (event.code !== 'Space' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return false;
  const target = event.target;
  if (target?.id === 'voice-record' || (target?.id === 'answer' && target.readOnly)) return true;
  // Preserve native button, radio, checkbox, link, and editing behavior.
  return !target?.closest?.('button, a, input, textarea, select, summary, [contenteditable]:not([contenteditable="false"]), [role="button"]');
}

export function createVoiceInput(Recognition, onChange) {
  let engine = null, phase = 'idle', value = '', invalid = false;
  let committed = '', committedInvalid = false;
  let timeout;
  let finishWaiters = [];
  const emit = message => onChange({ phase, value, invalid, message });
  function cancel(finished = null) {
    clearTimeout(timeout);
    const previous = engine; engine = null; phase = 'idle';
    if (previous) { try { previous.abort(); } catch {} }
    const waiting = finishWaiters; finishWaiters = [];
    waiting.forEach(resolve => resolve(finished));
    return { value: committed, invalid: committedInvalid };
  }
  function start(base = '') {
    if (engine) return;
    value = committed = base; invalid = committedInvalid = false;
    if (!Recognition) { emit('Voice input is unavailable in this browser. Try Chrome or use Typing.'); return; }
    let current, finalValue = base, finalInvalid = false, errorMessage = '', heard = false;
    let capturedResults = [];
    try {
      current = new Recognition(); engine = current;
      current.lang = 'en-US'; current.continuous = true; current.interimResults = true;
      current.maxAlternatives = 1;
      current.onstart = () => {
        if (engine !== current || phase === 'stopping') return;
        phase = 'listening'; emit('Listening. Say each letter, then press Stop.');
      };
      current.onresult = event => {
        if (engine !== current) return;
        const results = Array.from(event.results);
        const next = results.map((result, index) => {
          const previous = capturedResults[index];
          if (previous?.final) return previous;
          // Some engines merge multiple provisional chunks into one final word.
          const proof = index === results.length - 1 && results.length < capturedResults.length
            ? capturedResults.slice(index).map(entry => entry.transcript).join(' ')
            : previous?.transcript || '';
          return { ...reconcileTranscript(result[0].transcript, proof), final: result.isFinal };
        });
        if (next.length && next.length < capturedResults.length && capturedResults[next.length - 1]?.final) {
          next.push(...capturedResults.slice(next.length).map(entry => ({ ...entry, review: true })));
        }
        if (!next.length && capturedResults.length) {
          capturedResults = capturedResults.map(entry => entry.final ? entry : { ...entry, review: true });
        } else capturedResults = next;
        const all = capturedResults.map(entry => entry.transcript);
        const final = capturedResults.filter(entry => entry.final).map(entry => entry.transcript);
        heard = true;
        const parsed = parseSpokenLetters(all.join(' '));
        const finished = parseSpokenLetters(final.join(' '));
        value = base + parsed.value; invalid = parsed.unknown.length > 0 || capturedResults.some(entry => entry.review);
        finalValue = base + finished.value;
        finalInvalid = finished.unknown.length > 0 || capturedResults.some(entry => entry.final && entry.review);
        committed = finalValue; committedInvalid = finalInvalid;
        const raw = results.map(result => result[0].transcript).join(' ');
        emit(invalid ? `The browser revised the spelling. Kept the letters captured so far. Heard: “${raw}”. You can edit the letters or check this spelling.` : 'Listening. Say each letter, then press Stop.');
      };
      current.onerror = event => {
        if (engine !== current) return;
        const messages = {
          'not-allowed': 'Microphone access was not allowed. Allow it in your browser or use Typing.',
          'service-not-allowed': 'Speech recognition is not allowed in this browser. Use Typing.',
          'audio-capture': 'No microphone is available. Check your microphone or use Typing.',
          network: 'Speech recognition could not connect. Check your connection or use Typing.',
          'no-speech': 'No speech was heard. Press Start to try again.',
        };
        errorMessage = messages[event.error] || 'Voice input stopped. Press Start to try again or use Typing.';
        value = finalValue; invalid = finalInvalid;
        cancel(); emit(errorMessage);
      };
      current.onend = () => {
        if (engine !== current) return;
        const unfinished = capturedResults.some(entry => !entry.final);
        value = unfinished ? value : finalValue;
        invalid = finalInvalid || unfinished;
        committed = value; committedInvalid = invalid;
        cancel({ value, invalid });
        emit(errorMessage || (invalid ? 'Kept the captured letters. You can edit them or check this spelling.' : heard ? 'Review your spelling, then check it. Press Start to add more letters.' : 'No letters were captured. Press Start to try again.'));
      };
      phase = 'starting'; emit('Opening microphone…'); current.start();
      timeout = setTimeout(() => {
        if (engine !== current || phase !== 'starting') return;
        cancel(); emit('The microphone did not start. Check browser permissions or use Typing.');
      }, 15000);
    } catch {
      cancel(); emit('Voice input could not start. Try again or use Typing.');
    }
  }
  function stop() {
    if (!engine || phase === 'stopping') return;
    phase = 'stopping'; emit('Finishing your spelling…');
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      if (!engine) return;
      cancel(); invalid = true; emit('Recognition did not finish. Kept the visible letters; you can edit or check them.');
    }, 5000);
    try { engine.stop(); } catch { cancel(); emit('Voice input stopped. Review your spelling.'); }
  }
  function finish() {
    if (!engine) return Promise.resolve(null);
    return new Promise(resolve => { finishWaiters.push(resolve); stop(); });
  }
  return { start, stop, finish, cancel, get phase() { return phase; } };
}
