import { freshState, validateState } from './core.js';
const KEY = 'spelling-garden-v1';
export function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    return { state: raw ? validateState(JSON.parse(raw)) : freshState(), warning: '' };
  } catch {
    return { state: freshState(), raw, warning: raw == null ? 'This browser cannot access saved progress. Practice works in this tab; export a backup before closing it.' : 'Saved progress could not be read. Your existing data has not been changed. Export a backup before resetting.' };
  }
}
export function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}
export function exportState(state, recoveryRaw = null) {
  const blob = new Blob([recoveryRaw ?? JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url;
  link.download = `spelling-garden-${new Date().toISOString().slice(0, 10)}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
