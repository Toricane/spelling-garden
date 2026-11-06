import { normalizeAnswer } from './core.js';

function letters(text) {
  return Array.from(text.normalize('NFC'), text => ({ text, key: normalizeAnswer(text), changed: false }));
}

// Align letters rather than positions, so an omission doesn't mark the whole suffix.
export function compareSpelling(answer, acceptedSpellings) {
  const original = letters(answer);
  const left = original.filter(letter => letter.key);
  let best;
  for (const spelling of acceptedSpellings) {
    const source = letters(spelling), right = source.filter(letter => letter.key);
    const width = right.length + 1;
    // Keep unusually long pasted input from allocating an unbounded matrix.
    if (left.length > 512 || right.length > 512) {
      if (!best) best = { distance: Infinity, yours: original.map(x => ({ ...x, changed: Boolean(x.key) })), expected: source.map(x => ({ ...x, changed: Boolean(x.key) })) };
      continue;
    }
    const costs = Array.from({ length: left.length + 1 }, () => new Uint16Array(width));
    for (let i = 0; i <= left.length; i++) costs[i][0] = i;
    for (let j = 0; j <= right.length; j++) costs[0][j] = j;
    for (let i = 1; i <= left.length; i++) {
      for (let j = 1; j <= right.length; j++) {
        costs[i][j] = Math.min(costs[i - 1][j] + 1, costs[i][j - 1] + 1,
          costs[i - 1][j - 1] + Number(left[i - 1].key !== right[j - 1].key));
      }
    }
    const distance = costs[left.length][right.length];
    if (best && distance >= best.distance) continue;
    original.forEach(x => { x.changed = false; });
    let i = left.length, j = right.length;
    while (i || j) {
      if (i && j && costs[i][j] === costs[i - 1][j - 1] + Number(left[i - 1].key !== right[j - 1].key)) {
        if (left[i - 1].key !== right[j - 1].key) left[i - 1].changed = right[j - 1].changed = true;
        i--; j--;
      } else if (i && costs[i][j] === costs[i - 1][j] + 1) {
        left[--i].changed = true;
      } else right[--j].changed = true;
    }
    best = { distance, yours: original.map(x => ({ ...x })), expected: source };
  }
  return best;
}
