export const INTERVALS = [1, 3, 7, 14, 30];
export const VERSION = 1;
export const DEFAULT_SETTINGS = { mode: 'short', voice: '', rate: 1, audio: 'recorded', showHintText: false };

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function addDays(day, days) {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + days, 12));
}
// SBOC manual rule 9: capitals count; accents, spaces and punctuation do not.
export function normalizeAnswer(value) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').replace(/[\p{P}\p{Z}\s]/gu, '');
}
export function grade(word, answer, extra = []) {
  const normalized = normalizeAnswer(answer.trim());
  const forms = [...word.acceptedSpellings, ...extra];
  if (!normalized) return { correct: false, reason: 'empty' };
  if (forms.some(form => normalizeAnswer(form) === normalized)) return { correct: true, reason: 'correct' };
  if (forms.some(form => normalizeAnswer(form).toLowerCase() === normalized.toLowerCase())) return { correct: false, reason: 'capital' };
  return { correct: false, reason: 'spelling' };
}
export function freshState() {
  return { version: VERSION, progress: {}, settings: { ...DEFAULT_SETTINGS }, sessions: [] };
}
export function stats(words, progress, today = dayKey()) {
  return words.reduce((out, word) => {
    const p = progress[word.id];
    if (!p) out.unseen++;
    else {
      out.practiced++;
      if (p.due <= today) out.due++;
      if (p.stage >= 3) out.growing++;
    }
    return out;
  }, { unseen: 0, practiced: 0, due: 0, growing: 0 });
}
export function shuffled(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function makeQueue(words, progress, mode, today = dayKey(), extraPractice = false, random = Math.random) {
  const due = shuffled(words.filter(w => progress[w.id]?.due <= today), random)
    .sort((a, b) => progress[a.id].due.localeCompare(progress[b.id].due));
  const unseen = shuffled(words.filter(w => !progress[w.id]), random);
  let eligible = [...due, ...unseen];
  if (extraPractice) eligible = shuffled(words, random);
  if (mode === 'short') eligible = eligible.slice(0, 10);
  return eligible.map(w => ({ id: w.id, retry: false, extra: extraPractice }));
}
export function updateProgress(previous, correct, today = dayKey(), retry = false, extra = false) {
  if (extra) return previous;
  const p = previous || { stage: -1, attempts: 0, correct: 0, lapses: 0 };
  if (retry) return { ...p, retries: (p.retries || 0) + 1 };
  const stage = correct ? Math.min(p.stage + 1, INTERVALS.length - 1) : 0;
  return { ...p, stage, due: addDays(today, INTERVALS[stage]), lastReviewed: today,
    attempts: p.attempts + 1, correct: p.correct + (correct ? 1 : 0), lapses: p.lapses + (correct ? 0 : 1) };
}
export function insertRetry(queue, index, item) {
  // The caller inserts only after a failed first attempt: each word gets one retry.
  const next = [...queue];
  next.splice(Math.min(index + 4, next.length), 0, { ...item, retry: true });
  return next;
}
export function maskAnswer(text, word) {
  const forms = [...word.acceptedSpellings].sort((a, b) => b.length - a.length);
  let result = text;
  for (const form of forms) {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`(?<![\\p{L}])${escaped}(?:s|es|ed|ing)?(?![\\p{L}])`, 'giu'), '_____');
  }
  return result;
}

function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayKey(new Date(`${value}T12:00:00`)) === value;
}
export function validateState(input) {
  if (!input || input.version !== VERSION || typeof input.progress !== 'object' || !input.progress || Array.isArray(input.progress)) throw new Error('This is not a supported Spelling Garden backup.');
  const state = freshState();
  for (const [id, p] of Object.entries(input.progress)) {
    if (!/^sboc-2027-junior-\d{3}$/.test(id) || !p || !Number.isInteger(p.stage) || p.stage < 0 || p.stage > 4 || !validDay(p.due) || !validDay(p.lastReviewed)) throw new Error('The backup contains invalid review records.');
    for (const key of ['attempts', 'correct', 'lapses']) {
      if (!Number.isSafeInteger(p[key]) || p[key] < 0) throw new Error('The backup contains invalid review counts.');
    }
    if (p.correct + p.lapses !== p.attempts || (p.retries != null && (!Number.isSafeInteger(p.retries) || p.retries < 0))) throw new Error('The backup contains inconsistent counts.');
    state.progress[id] = { stage: p.stage, due: p.due, lastReviewed: p.lastReviewed, attempts: p.attempts, correct: p.correct, lapses: p.lapses, retries: p.retries || 0 };
  }
  const settings = input.settings || {};
  state.settings = { mode: settings.mode === 'open' ? 'open' : 'short',
    voice: typeof settings.voice === 'string' ? settings.voice.slice(0, 300) : '',
    rate: [0.8, 1, 1.1].includes(settings.rate) ? settings.rate : 1,
    audio: settings.audio === 'browser' ? 'browser' : 'recorded',
    showHintText: settings.showHintText === true };
  state.sessions = (Array.isArray(input.sessions) ? input.sessions : []).filter(s =>
    s && validDay(s.day) && Number.isInteger(s.total) && s.total >= 0 && s.total <= 400 && Number.isInteger(s.correct) && s.correct >= 0 && s.correct <= s.total).slice(-100)
    .map(s => ({ day: s.day, total: s.total, correct: s.correct }));
  return state;
}
