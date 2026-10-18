import { addDays, dayKey, INTERVALS, stats } from './core.js';

export function practiceStatistics(words, state, today = dayKey()) {
  const summary = stats(words, state.progress, today);
  const stages = INTERVALS.map(days => ({ days, count: 0 }));
  let attempts = 0, correct = 0;
  const tricky = [];
  for (const word of words) {
    const p = state.progress[word.id];
    if (!p) continue;
    stages[p.stage].count++;
    attempts += p.attempts; correct += p.correct;
    if (p.lapses) tricky.push({ word, attempts: p.attempts, correct: p.correct, lapses: p.lapses });
  }
  tricky.sort((a, b) => b.lapses - a.lapses || a.correct / a.attempts - b.correct / b.attempts || a.word.number - b.word.number);
  const days = Array.from({ length: 14 }, (_, i) => ({ day: addDays(today, i - 13), total: 0, correct: 0, sessions: 0 }));
  const byDay = new Map(days.map(d => [d.day, d]));
  for (const session of state.sessions) {
    const day = byDay.get(session.day);
    if (day) { day.total += session.total; day.correct += session.correct; day.sessions++; }
  }
  return { ...summary, attempts, correct, accuracy: attempts ? Math.round(1000 * correct / attempts) / 10 : null,
    stages, days, tricky: tricky.slice(0, 5), recent: state.sessions.slice(-8).reverse() };
}
