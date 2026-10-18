let player;
let cancelPlayback;
let generation = 0;
let voiceList = [];
const synth = globalThis.speechSynthesis;
const refresh = () => { voiceList = synth?.getVoices() || []; };
refresh(); synth?.addEventListener('voiceschanged', refresh);
export function voices() { refresh(); return voiceList.filter(v => /^en(?:-|$)/i.test(v.lang)); }
export function stopSpeech() {
  generation++;
  cancelPlayback?.(); cancelPlayback = undefined;
  player?.pause(); synth?.cancel();
}
function deviceSpeak(text, settings, token, rate, onProgress) {
  return new Promise((resolve, reject) => {
    if (!synth || !globalThis.SpeechSynthesisUtterance) return reject(new Error('Device speech is unavailable. Choose Kokoro recordings in Settings.'));
    const utterance = new SpeechSynthesisUtterance(text);
    const english = voices();
    utterance.voice = english.find(v => v.voiceURI === settings.voice) || english.find(v => v.lang === 'en-US') || english[0] || null;
    utterance.lang = utterance.voice?.lang || 'en-US'; utterance.rate = rate;
    let settled = false;
    const finish = error => {
      if (settled) return; settled = true;
      cancelPlayback = undefined; onProgress?.(null);
      error ? reject(error) : resolve();
    };
    cancelPlayback = () => finish();
    utterance.onstart = () => onProgress?.(0);
    utterance.onboundary = e => { if (token === generation) onProgress?.(Math.min(1, e.charIndex / Math.max(1, text.length))); };
    utterance.onend = () => finish();
    utterance.onerror = e => token !== generation || ['interrupted', 'canceled'].includes(e.error) ? finish() : finish(new Error('Speech did not play. Try again or choose another voice in Settings.'));
    if (token === generation) synth.speak(utterance); else finish();
  });
}
export async function speak(word, kind, settings, { slow = false, onProgress } = {}) {
  stopSpeech(); const token = generation;
  const rate = slow ? 0.75 : settings.rate;
  if (settings.audio === 'browser') return deviceSpeak(kind === 'word' ? word.word : word[kind], settings, token, rate, onProgress);
  // Reuse one media element so mobile browsers can play consecutive prompts.
  player ||= new Audio();
  player.src = `./audio/${word.id}-${kind}.mp3`;
  player.playbackRate = rate; player.preservesPitch = true;
  return new Promise((resolve, reject) => {
    let settled = false, timer, frame;
    const finish = error => {
      if (settled) return; settled = true;
      clearTimeout(timer); cancelAnimationFrame(frame); onProgress?.(null); player.onended = null; player.onerror = null; player.onloadedmetadata = null;
      cancelPlayback = undefined;
      error ? reject(new Error('The recording could not play. Check your connection and try again, or choose a device voice in Settings.')) : resolve();
    };
    cancelPlayback = () => finish();
    const update = () => {
      if (settled) return;
      onProgress?.(Number.isFinite(player.duration) && player.duration > 0 ? player.currentTime / player.duration : 0);
      frame = requestAnimationFrame(update);
    };
    update();
    player.onended = () => finish(); player.onerror = () => finish(true);
    player.onloadedmetadata = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(true), Math.max(15000, (player.duration / rate + 10) * 1000));
    };
    timer = setTimeout(() => finish(true), 15000);
    player.play().catch(() => { if (token === generation) finish(true); else finish(); });
  });
}
