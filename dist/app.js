import { practiceStatistics } from './statistics.js';
import { dayKey, stats, makeQueue, grade, updateProgress, insertRetry, maskAnswer, validateState, freshState } from './core.js';
import { loadState, saveState, exportState } from './storage.js';
import { speak, stopSpeech as stopAudio, voices } from './audio.js';

const app = document.querySelector('#app');
const loaded = loadState();
let state = loaded.state;
let savingBlocked = Boolean(loaded.warning);
let warning = loaded.warning;
let data, overrides, words, byId, session, screen = 'home', result, pendingImport;
let query = '', libraryPage = 0;
let speechRun = 0;
function stopSpeech() { speechRun++; stopAudio(); }
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iconPaths = {
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  sound: '<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  leaf: '<path d="M19 3C9 2 3 7 5 14c2 7 14 5 14-11Z"/><path d="M4 21 15 9"/>',
  book: '<path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  sprig: '<path d="M12 22V3M12 17C2 18 2 10 12 12M12 11C22 12 22 4 12 6"/>',
};
const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || ''}</svg>`;
const brand = `<a class="brand" href="#home" aria-label="Spelling Garden home"><img src="./bee.svg" alt="" width="36" height="40"><span>Spelling Garden</span></a>`;
const types = { 'n.': 'noun', 'v.': 'verb', 'v,': 'verb', 'adj.': 'adjective', 'adv.': 'adverb', 'p. n.': 'proper noun', 'p.n.': 'proper noun', 'prep.': 'preposition' };
const partName = w => types[w.partOfSpeech] || w.partOfSpeech;
const currentWord = () => byId.get(session.queue[session.index].id);
const currentItem = () => session.queue[session.index];
const extraForms = w => overrides.additionalSpellings[w.id] || [];
function persist() {
  if (savingBlocked || !saveState(state)) {
    warning = savingBlocked ? loaded.warning : 'This browser cannot save progress right now. Keep this tab open and export a backup in Settings.';
    const box = document.querySelector('#save-notice'); if (box) { box.textContent = warning; box.hidden = false; }
  } else warning = '';
}
function notice() { return `<div id="save-notice" class="notice" role="status" ${warning ? '' : 'hidden'}>${esc(warning)}</div>`; }
function layout(body, active = screen) {
  return `<div class="shell"><header class="site-header">${brand}<nav class="nav" aria-label="Main navigation">${[['home', 'Practice'], ['library', 'Word library'], ['statistics', 'Statistics'], ['guide', 'Guide'], ['settings', 'Settings']].map(([id, label]) => `<a href="#${id}" ${active === id ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav></header>${notice()}<p class="caption" id="speech-status" role="status"></p><main id="main">${body}</main><footer class="footer"><span>A little practice, every day.</span><span>Independent practice tool · SBOC 2027 Junior word list</span></footer></div>`;
}
function render() {
  if (screen === 'practice') renderPractice();
  else if (screen === 'results') renderResults();
  else if (screen === 'library') renderLibrary();
  else if (screen === 'statistics') renderStatistics();
  else if (screen === 'guide') renderGuide();
  else if (screen === 'settings') renderSettings();
  else renderHome();
}
function renderHome() {
  const s = stats(words, state.progress);
  const empty = !s.due && !s.unseen;
  app.innerHTML = layout(`<section class="hero"><div><span class="edition"><span class="dot"></span>2027 JUNIOR · 400 WORDS</span><h1>A little practice.<br>A lot of <em>possibility.</em></h1><p class="hero-copy">Listen closely. Give it a try. Grow a little more confident, one word at a time.</p></div><section class="session-card" aria-labelledby="session-title"><div class="card-top"><span class="eyebrow">Your daily practice</span><span class="leaf-icon">${icon('leaf')}</span></div><h2 id="session-title">${empty ? 'A well-earned breather.' : s.due ? 'Ready for a little review?' : s.practiced ? 'A little more practice?' : 'Let’s plant the first seed.'}</h2><p class="muted small">${empty ? 'Your reviews are up to date. Come back when they’re due, or enjoy some extra practice.' : s.due ? `${s.due} ${s.due === 1 ? 'word is' : 'words are'} ready to revisit. We’ll start there, then mix in something new.` : 'A few new words today. A thoughtful reminder when it’s time to revisit them.'}</p><fieldset class="segmented" style="margin-inline:0" aria-label="Session length">${[['short', 'A short set', '10 words + retries'], ['open', 'Keep going', 'Stop whenever you like']].map(([id, title, sub]) => `<label><input type="radio" name="mode" value="${id}" ${state.settings.mode === id ? 'checked' : ''}>${title}<small>${sub}</small></label>`).join('')}</fieldset><button class="button primary full" id="start" data-extra="${empty}">${empty ? 'Extra practice' : 'Start practicing'}${icon('arrow')}</button><p class="caption">${empty ? 'Extra practice won’t change your review schedule.' : 'No timer. Just you and the next word.'}</p></section></section><section class="stats-row" aria-label="Your progress"><div class="stat"><span class="stat-number">${s.due}</span><div><span class="stat-title">Ready to review</span><small>A timely little refresh</small></div></div><div class="stat"><span class="stat-number">${s.practiced}<span class="small muted"> / 400</span></span><div><span class="stat-title">Words explored</span><small>Every word is a beginning</small></div></div><div class="stat"><span class="stat-number">${s.growing}</span><div><span class="stat-title">Taking root</span><small>On a 14+ day interval</small></div></div></section><div class="below-home"><div class="tip">${icon('leaf')}<p><strong>A small habit goes a long way.</strong><br>Tricky words return sooner. Familiar ones get a little more space. Your progress is saved in this browser.</p></div><a class="link-arrow" href="#library">Explore the word list ${icon('arrow')}</a></div>`, 'home');
  document.querySelectorAll('[name="mode"]').forEach(r => r.addEventListener('change', e => { state.settings.mode = e.target.value; persist(); }));
  document.querySelector('#start').onclick = () => startSession(empty);
}
function startSession(extra = false) {
  stopSpeech();
  const queue = makeQueue(words, state.progress, state.settings.mode, dayKey(), extra);
  session = { queue, index: 0, attempts: [], checked: false, feedback: null, total: queue.length };
  if (!queue.length) return navigate('home');
  screen = 'practice'; history.replaceState(null, '', '#practice'); render();
  playPrompt();
  document.querySelector('#answer')?.focus();
}
function pronunciations(w) {
  return w.pronunciations.map(p => p.segments.map(s => s.stress ? `<strong>${esc(s.text)}</strong>` : esc(s.text)).join('')).join(' · ');
}
async function play(kind, slow = false, word = null, button = null) {
  speechRun++;
  return playClip(word || currentWord(), kind, slow, button);
}
async function playClip(target, kind, slow = false, button = null) {
  button ||= document.querySelector(`#${kind === 'word' ? (slow ? 'slow' : 'hear') : kind}`);
  const status = document.querySelector('#audio-status') || document.querySelector('#speech-status');
  if (status) status.textContent = '';
  try {
    await speak(target, kind, state.settings, { slow, onProgress: progress => {
      if (!button) return;
      button.classList.toggle('audio-playing', progress !== null);
      button.style.setProperty('--playback', `${Math.round((progress || 0) * 100)}%`);
      if (progress === null) button.removeAttribute('aria-busy');
      else button.setAttribute('aria-busy', 'true');
    } });
  } catch (error) { if (status?.isConnected) status.textContent = error.message; }
}
function renderPractice() {
  const w = currentWord(); const item = currentItem();
  const firstDone = session.attempts.filter(a => !a.retry).length;
  app.innerHTML = `<div class="practice-shell"><header class="practice-header">${brand}<span class="practice-meta">${item.retry ? 'A little revisit' : `Word ${Math.min(firstDone + 1, session.total)} of ${session.total}`}</span><button class="text-button" id="end">End session</button></header><div class="progress-track" role="progressbar" aria-label="Session progress" aria-valuenow="${firstDone}" aria-valuemin="0" aria-valuemax="${session.total}"><div class="progress-fill" style="width:${100 * firstDone / session.total}%"></div></div>${notice()}<main id="main" class="practice-main"><div class="listen-row"><button class="button" id="hear">${icon('sound')}Hear word</button><button class="button" id="slow">Hear slowly</button></div><p class="caption" id="audio-status" role="status"></p><form id="answer-form" class="answer-form" novalidate><label class="input-label" for="answer">Your spelling</label><input class="word-input" id="answer" name="answer" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-describedby="input-help" ${session.checked ? 'readonly' : ''}><p class="input-help" id="input-help">Capitals count. Accents, spaces and punctuation are optional.</p><div id="feedback" aria-live="polite"></div><div class="submit-row" style="margin-top:22px"><small>${session.checked ? 'Press Enter to continue' : 'Press Enter to check'}</small><button class="button primary" id="check" type="submit">${session.checked ? 'Next word' : 'Check spelling'}${icon(session.checked ? 'arrow' : 'check')}</button></div></form><div class="help-controls" aria-label="Learning help"><button class="button" id="definition">Definition</button><button class="button" id="sentence">Use in a sentence</button><button class="button" id="part">Word type</button></div><label class="hint-setting"><input type="checkbox" id="show-hint-text" ${state.settings.showHintText ? 'checked' : ''}> Show definition and sentence text</label><div class="hint" id="hint" role="status"></div></main></div>`;
  document.querySelector('#end').onclick = finishSession;
  document.querySelector('.brand').onclick = e => { e.preventDefault(); finishSession(); };
  document.querySelector('#hear').onclick = () => play('word');
  document.querySelector('#slow').onclick = () => play('word', true);
  document.querySelector('#answer-form').onsubmit = e => { e.preventDefault(); session.checked ? nextWord() : checkAnswer(); };
  document.querySelector('#definition').onclick = () => showHint('definition');
  document.querySelector('#sentence').onclick = () => showHint('sentence');
  document.querySelector('#part').onclick = () => { session.hint = 'part'; renderHint(); };
  document.querySelector('#show-hint-text').onchange = e => {
    state.settings.showHintText = e.target.checked; persist(); renderHint();
  };
  if (session.checked) renderFeedback();
  renderHint();
}
function renderHint() {
  const w = currentWord();
  const hint = document.querySelector('#hint');
  const masked = text => esc(maskAnswer(text, { ...w, acceptedSpellings: [...w.acceptedSpellings, ...extraForms(w)] }));
  if (session.hint === 'part') hint.innerHTML = `<p><strong>Word type:</strong> ${esc(partName(w))}</p>`;
  else if (!state.settings.showHintText) hint.textContent = '';
  else if (session.hint) hint.innerHTML = `<p><strong>${session.hint === 'definition' ? 'Meaning' : 'In a sentence'}:</strong> ${masked(w[session.hint])}</p>`;
  else if (w.homophones.length && !session.checked) hint.innerHTML = `<p><strong>This word has a sound-alike.</strong> Listen to the meaning and sentence before you spell.</p><p>${masked(w.definition)}</p><p><em>${masked(w.sentence)}</em></p>`;
  else hint.textContent = '';
}
function showHint(kind) {
  session.hint = kind; renderHint(); play(kind);
}
function checkAnswer() {
  if (session.checked) return;
  const input = document.querySelector('#answer');
  const w = currentWord(); const item = currentItem();
  const assessment = grade(w, input.value, extraForms(w));
  if (assessment.reason === 'empty') { document.querySelector('#hint').textContent = 'Type your spelling first, then check it.'; input.focus(); return; }
  stopSpeech();
  session.checked = true;
  session.feedback = { ...assessment, answer: input.value, wordId: w.id, retry: item.retry, extra: item.extra };
  session.attempts.push(session.feedback);
  if (!assessment.correct && !item.retry) session.queue = insertRetry(session.queue, session.index, item);
  const progress = updateProgress(state.progress[w.id], assessment.correct, dayKey(), item.retry, item.extra);
  if (progress) state.progress[w.id] = progress;
  persist();
  input.readOnly = true;
  document.querySelector('#check').innerHTML = `${session.index === session.queue.length - 1 ? 'See results' : 'Next word'}${icon('arrow')}`;
  document.querySelector('.submit-row small').textContent = 'Press Enter to continue';
  renderFeedback();
}
function renderFeedback() {
  const w = currentWord(); const f = session.feedback;
  const alternatives = [...new Set([...w.acceptedSpellings, ...extraForms(w)])].filter(x => x !== w.word);
  const box = document.querySelector('#feedback');
  box.className = `feedback ${f.correct ? '' : 'missed'}`;
  box.innerHTML = `<h2>${f.correct ? 'Nicely done.' : f.reason === 'capital' ? 'The letters are there. Check the capitals.' : 'A word to grow with.'}</h2><p class="answer-word">${esc(w.word)}</p><p class="pronunciations">${pronunciations(w)}</p>${alternatives.length ? `<p class="small muted">Also accepted: ${alternatives.map(esc).join(', ')}</p>` : ''}<p class="small">${f.extra ? 'Extra practice leaves your review schedule unchanged.' : f.correct ? (f.retry ? 'A good revisit. Your next review is still tomorrow.' : f.extra ? 'A little extra confidence. Your schedule stays the same.' : 'We’ll give this word a little space before its next review.') : (f.retry ? 'That’s enough for today. We’ll revisit this word tomorrow.' : 'You’ll get another try a few words from now.')}</p><details><summary>Meaning &amp; example</summary><p class="small"><strong>${esc(partName(w))}.</strong> ${esc(w.definition)}</p><p class="small"><em>${esc(w.sentence)}</em></p><p class="small muted">Official word #${w.number} · Guide page ${w.sourcePage}</p></details>`;
}
function nextWord() {
  stopSpeech();
  session.index++;
  if (session.index >= session.queue.length) return finishSession();
  session.checked = false; session.feedback = null; session.hint = null; renderPractice();
  document.querySelector('#answer').focus(); playPrompt();
}
function playPrompt() { const w = currentWord(); w.homophones.length ? playHomophone(w) : play('word'); }
async function playHomophone(w) {
  const run = ++speechRun;
  await playClip(w, 'word');
  if (run !== speechRun || screen !== 'practice' || currentWord().id !== w.id || session.checked) return;
  await playClip(w, 'definition');
  if (run !== speechRun || screen !== 'practice' || currentWord().id !== w.id || session.checked) return;
  await playClip(w, 'sentence');
}
function finishSession() {
  stopSpeech();
  if (!session) return navigate('home');
  const first = session.attempts.filter(a => !a.retry);
  result = { first, attempts: [...session.attempts], correct: first.filter(a => a.correct).length, extra: first[0]?.extra || false };
  if (first.length) { state.sessions.push({ day: dayKey(), total: first.length, correct: result.correct }); state.sessions = state.sessions.slice(-100); persist(); }
  session = null; screen = 'results'; history.replaceState(null, '', '#results'); render(); window.scrollTo(0, 0);
}
function renderResults() {
  if (!result) { screen = 'home'; return renderHome(); }
  const total = result.first.length;
  const missed = result.first.filter(a => !a.correct);
  app.innerHTML = layout(`<section class="results-intro">${icon('sprig', 'results-sprig')}<img class="results-bee" src="./bee.svg" width="64" height="64" alt="">${icon('sprig', 'results-sprig right')}<p class="eyebrow" style="margin-top:16px">Small steps. Stronger roots.</p><h1>${total ? 'Look at you growing.' : 'Your garden can wait.'}</h1><p class="muted">${total ? 'Every try makes the next one a little more familiar. That’s a good day’s practice.' : 'Come back when you’re ready for your first word.'}</p></section><div class="results-summary"><div class="result-stat"><strong>${total}</strong><small>Words practiced</small></div><div class="result-stat"><strong>${total ? Math.round(100 * result.correct / total) + '%' : '—'}</strong><small>First-try accuracy</small></div><div class="result-stat"><strong>${result.attempts.filter(a => a.retry).length}</strong><small>Extra revisits</small></div></div><div class="results-actions"><a class="button primary" href="#home">Back to your garden ${icon('arrow')}</a><a class="button" href="#library">Explore the words</a></div>${total ? `<section class="review-list"><h2>${missed.length ? 'A little more room to grow' : 'A lovely set of words'}</h2><p class="small muted">${result.extra ? 'Extra practice leaves your scheduled reviews unchanged.' : missed.length ? 'Missed words return tomorrow. A correct retry helps you learn without changing today’s first-try score.' : 'Your next reviews are saved. Let a little time do its work.'}</p>${(missed.length ? missed : result.first).map(a => {
    const w = byId.get(a.wordId); const p = state.progress[w.id];
    return `<div class="review-row"><div><strong>${esc(w.word)}</strong>${!a.correct ? `<small>You typed: ${esc(a.answer)}</small>` : ''}<small>${p ? `Next review: ${formatDay(p.due)}` : 'Extra practice · schedule unchanged'}</small></div><button class="button" data-listen="${w.id}">${icon('sound')}Listen</button></div>`;
  }).join('')}<p class="small muted" style="margin-top:18px">Progress is saved in this browser. Settings has a backup option.</p></section>` : ''}`, '');
  document.querySelectorAll('[data-listen]').forEach(b => b.onclick = () => play('word', false, byId.get(b.dataset.listen), b));
}
function formatDay(day) { return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function renderLibrary() {
  app.innerHTML = layout(`<div class="page-heading"><p class="eyebrow">The official collection</p><h1>Words worth knowing.</h1><p class="muted">All 400 Junior words, with the pronunciations, meanings and examples provided in the 2027 guide.</p></div><div class="searchbar"><label class="sr-only" for="search">Search words, alternatives or definitions</label><input type="search" id="search" placeholder="Find a word, or explore a meaning…" value="${esc(query)}"></div><p class="small muted" id="search-count" role="status"></p><div class="library-list" id="library-list"></div><div class="pagination" id="pagination"></div>`, 'library');
  document.querySelector('#search').oninput = e => { query = e.target.value; libraryPage = 0; renderLibraryItems(); };
  renderLibraryItems();
}
function renderLibraryItems() {
  const q = query.trim().toLowerCase();
  const matches = words.filter(w => `${w.word} ${w.acceptedSpellings.join(' ')} ${w.definition}`.toLowerCase().includes(q));
  const pages = Math.max(1, Math.ceil(matches.length / 20)); libraryPage = Math.min(libraryPage, pages - 1);
  document.querySelector('#search-count').textContent = `${matches.length} ${matches.length === 1 ? 'word' : 'words'}${q ? ' found' : ' in the collection'}`;
  document.querySelector('#library-list').innerHTML = matches.slice(libraryPage * 20, libraryPage * 20 + 20).map(w => `<details class="word-card"><summary><span class="word-number">${String(w.number).padStart(3, '0')}</span><span class="word-name">${esc(w.word)}</span><span class="word-type">${esc(partName(w))}</span></summary><div class="word-content"><p class="pronunciations">${pronunciations(w)}</p><p>${esc(w.definition)}</p><p><em>${esc(w.sentence)}</em></p>${w.acceptedSpellings.length > 1 || extraForms(w).length ? `<p class="small"><strong>Accepted spellings:</strong> ${[...new Set([...w.acceptedSpellings, ...extraForms(w)])].map(esc).join(', ')}</p>` : ''}${w.homophones.length ? `<p class="small muted">Sound-alikes: ${w.homophones.map(esc).join(', ')}. Spell the word matching this meaning.</p>` : ''}<div class="button-stack"><button class="button" data-audio="word" data-id="${w.id}">${icon('sound')}Hear word</button><button class="button" data-audio="sentence" data-id="${w.id}">Hear sentence</button></div><p class="small muted">Official word #${w.number} · Source page ${w.sourcePage}${overrides.notes[w.id] ? `<br>${esc(overrides.notes[w.id])}` : ''}</p></div></details>`).join('') || '<p>No words found. Try a different spelling or meaning.</p>';
  document.querySelector('#pagination').innerHTML = `<button class="button" id="prev-page" ${libraryPage === 0 ? 'disabled' : ''}>Previous</button><span class="small muted">${libraryPage + 1} / ${pages}</span><button class="button" id="next-page" ${libraryPage + 1 >= pages ? 'disabled' : ''}>Next</button>`;
  document.querySelector('#prev-page').onclick = () => { libraryPage--; renderLibraryItems(); };
  document.querySelector('#next-page').onclick = () => { libraryPage++; renderLibraryItems(); document.querySelector('#search').scrollIntoView({ block: 'start' }); };
  document.querySelectorAll('[data-audio]').forEach(b => b.onclick = () => play(b.dataset.audio, false, byId.get(b.dataset.id), b));
}
function renderStatistics() {
  const s = practiceStatistics(words, state);
  const maximum = Math.max(1, ...s.days.map(d => d.total));
  const dateLabel = day => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  app.innerHTML = layout(`<div class="page-heading"><p class="eyebrow">Your practice, over time</p><h1>See how you’re growing.</h1><p class="muted">Every visit adds a little more confidence. Here’s what your practice looks like in this browser.</p></div>
    ${!s.practiced && !s.recent.length ? '<div class="stats-empty"><h2>A fresh patch of possibility.</h2><p>Your statistics will grow as you practice your first words.</p><a class="button primary" href="#home">Start practicing</a></div>' : ''}
    <div class="metric-grid" aria-label="Practice totals">
      ${[[`${s.practiced} / ${words.length}`, 'Words explored', 'Words introduced in scheduled practice'], [s.accuracy === null ? '—' : `${s.accuracy}%`, 'Review accuracy', `${s.correct} correct of ${s.attempts} scheduled attempts · retries excluded`], [s.due, 'Ready to review', 'Words due today or earlier'], [s.growing, 'Taking root', 'Words on a 14 or 30-day interval']].map(([value, label, detail]) => `<section class="metric-card"><p>${label}</p><strong>${value}</strong><small>${detail}</small></section>`).join('')}
    </div><div class="statistics-grid">
      <section class="statistics-panel activity-panel"><h2>A little practice, every day.</h2><p class="small muted">Words attempted in finished sessions over the last 14 days. Repeat visits count; same-session retries do not.</p><div class="activity-chart" role="img" aria-label="${esc(s.days.map(d => `${dateLabel(d.day)}: ${d.total} attempts, ${d.correct} correct`).join('; '))}">${s.days.map(d => `<div class="activity-column" title="${esc(dateLabel(d.day))}: ${d.total} attempts, ${d.correct} correct"><span class="activity-count">${d.total || ''}</span><div class="activity-track"><div class="activity-bar" style="height:${100 * d.total / maximum}%"></div></div><span class="activity-date">${new Date(`${d.day}T12:00:00`).getDate()}</span></div>`).join('')}</div><p class="small muted chart-range">${esc(dateLabel(s.days[0].day))}<span>${esc(dateLabel(s.days.at(-1).day))}</span></p></section>
      <section class="statistics-panel"><h2>Your review garden</h2><p class="small muted">Current spacing between scheduled reviews.</p><div class="stage-list">${[{ label: 'Not explored yet', count: s.unseen }, ...s.stages.map(x => ({ label: `${x.days}-day interval`, count: x.count }))].map(x => `<div><div class="stage-label"><span>${x.label}</span><strong>${x.count}</strong></div><div class="stage-track"><div style="width:${100 * x.count / Math.max(1, words.length)}%"></div></div></div>`).join('')}</div></section>
      <section class="statistics-panel"><h2>A little more attention</h2><p class="small muted">Words with the most missed scheduled attempts. A miss is a useful reminder to revisit.</p>${s.tricky.length ? `<ul class="tricky-list">${s.tricky.map(x => `<li><strong>${esc(x.word.word)}</strong><span>${x.lapses} ${x.lapses === 1 ? 'miss' : 'misses'} · ${x.correct}/${x.attempts} correct</span></li>`).join('')}</ul>` : '<p class="muted">No missed words recorded yet.</p>'}<a class="link-arrow" href="#library">Explore the word list ${icon('arrow')}</a></section>
      <section class="statistics-panel"><h2>Recent sessions</h2><p class="small muted">First-attempt results, including extra practice.</p>${s.recent.length ? `<ol class="recent-sessions">${s.recent.map(x => `<li><div><strong>${esc(formatDay(x.day))}</strong><small>${x.total} ${x.total === 1 ? 'word' : 'words'} attempted</small></div><span>${x.correct}/${x.total} correct</span></li>`).join('')}</ol>` : '<p class="muted">Finish a session to see it here.</p>'}</section>
    </div><p class="small muted statistics-note">Session history keeps the latest 100 finished sessions, including sessions ended early. Activity and recent sessions use that history; review accuracy and word progress include all saved scheduled attempts. Extra practice and retries do not change review accuracy. Statistics stay in this browser and travel with your exported backup.</p>`, 'statistics');
}
function renderGuide() {
  app.innerHTML = layout(`<article class="guide"><div class="page-heading"><p class="eyebrow">A little guidance</p><h1>Practice with purpose.</h1><p class="muted">Learn the words, understand them, and leave a little space between revisits.</p></div><section><h2>How your garden grows</h2><p>Due words come first, followed by new words. A short set has up to 10 different words plus one retry for each miss. Open-ended practice continues through the available words until you stop.</p><p>Correct scheduled reviews move through 1, 3, 7, 14 and 30-day intervals. A miss returns later in the session, after three other attempts where possible, then comes back tomorrow. Same-session retries don’t advance the interval.</p><p>There’s no timer or penalty for taking your time. Extra practice, available when reviews are up to date and all words have been introduced, leaves your schedule unchanged.</p></section><section><h2>What counts as correct?</h2><ul><li><strong>Capitals matter.</strong> Type proper names such as Andorra with the required capital.</li><li><strong>Spaces, accents and punctuation are optional.</strong> For example, eclair counts for éclair.</li><li><strong>Listed alternatives count.</strong> The guide includes forms such as enamoured and enamored.</li><li><strong>A sound-alike isn’t an alternative.</strong> For words marked as homophones, use the meaning and sentence to identify the intended word.</li></ul><p>Manual rule 12 also permits relevant Dictionary.com alternatives. This app includes the guide’s alternatives plus explicitly verified additions. If you find another valid form, verify its meaning against Dictionary.com before adding it to the data.</p></section><section><h2>Practice and the real Bee</h2><p>This is a typed learning tool. The official competition is oral. Practice saying each letter aloud as well as typing it.</p><p>In ordinary official-list rounds, you may ask for the word to be repeated before beginning. Definitions and sentences are generally not supplied, except that homophones receive both automatically. Once spelling begins, you cannot request more help or change letters already spoken.</p><p>Our learning buttons stay available so you can understand the word. At the Bee, follow the officials’ rules. Tie-breaker rounds use a separate list that is not included in this guide.</p></section><section><h2>Words and pronunciations</h2><p>Entries #1–400 come from the <em>SBOC 2027 Official Junior Word List</em>, pages 21–59. Pronunciation guides retain the source’s bold stress marks. Word types, definitions and example sentences are preserved.</p><p>All recordings use Kokoro’s US English neural voice and are generated ahead of time. Machine speech can mispronounce unusual words; check the printed pronunciation and use an adult’s help if something sounds wrong. Select your device voice in Settings when you prefer it.</p><p>Source quirks are identified in individual library entries, including the verb label for “amercement” and “Accouter” printed with a capital. A standalone comma in the “epact” word cell is excluded as typography. Lowercase “accouter” is accepted using <a href="https://www.dictionary.com/browse/accouter" target="_blank" rel="noreferrer">Dictionary.com</a>.</p><p class="small muted">Word-list content belongs to its respective rights holders. This independent family practice tool is not affiliated with or endorsed by Spelling Bee of Canada. The source PDF is not redistributed.</p></section><section><h2>Your progress stays here</h2><p>There is no account. Progress is stored in this browser on this website. Clearing browser data or switching devices won’t carry it over. Export a backup in Settings and import it on your other device.</p></section></article>`, 'guide');
}
function renderSettings() {
  app.innerHTML = layout(`<div class="page-heading"><p class="eyebrow">Make yourself comfortable</p><h1>A few little preferences.</h1><p class="muted">Set your sound, keep a backup, and make this space your own.</p></div><div class="settings-grid"><section class="settings-panel"><h2>Listen your way</h2><div class="field"><label for="audio-engine">Audio source</label><select id="audio-engine"><option value="recorded">Kokoro recordings · US English</option><option value="browser">My device’s voice</option></select></div><p>Kokoro recordings load as needed. There is no voice model to download or run. You can choose a device voice as an alternative.</p><div class="field"><label for="voice">Device voice</label><select id="voice"></select></div><div class="field"><label for="rate">Reading speed</label><select id="rate"><option value="0.8">A little slower</option><option value="1">Normal</option><option value="1.1">A little faster</option></select></div><button class="button" id="test-audio">${icon('sound')}Try the sound</button><p class="caption" id="audio-status" role="status"></p></section><section class="settings-panel"><h2>Keep your progress</h2><p>Your reviews save automatically in this browser. Download a backup before clearing browser data, changing the website address, or moving to another device.</p><div class="button-stack"><button class="button" id="export">Export backup</button><button class="button" id="import">Import backup</button><input type="file" id="backup-file" accept=".json,application/json" hidden></div><p id="backup-status" role="status"></p><hr style="border:0;border-top:1px solid var(--line);margin:30px 0"><h3>A fresh beginning</h3><p>Resetting removes review progress and session history from this browser. Export a backup first if you’d like to keep it.</p><button class="button danger" id="reset">Reset progress</button></section></div><dialog id="confirm-dialog" aria-labelledby="dialog-title"><h2 id="dialog-title"></h2><p id="dialog-message"></p><div class="dialog-actions"><button class="button" id="cancel-dialog">Cancel</button><button class="button primary" id="confirm-action">Continue</button></div></dialog>`, 'settings');
  document.querySelector('#audio-engine').value = state.settings.audio;
  document.querySelector('#rate').value = state.settings.rate;
  populateVoices();
  for (const [id, key] of [['audio-engine', 'audio'], ['voice', 'voice'], ['rate', 'rate']]) document.querySelector(`#${id}`).onchange = e => { state.settings[key] = key === 'rate' ? Number(e.target.value) : e.target.value; persist(); };
  document.querySelector('#test-audio').onclick = () => play('word', false, words[0], document.querySelector('#test-audio'));
  document.querySelector('#export').onclick = () => exportState(state, savingBlocked ? loaded.raw : null);
  document.querySelector('#import').onclick = () => document.querySelector('#backup-file').click();
  document.querySelector('#backup-file').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('This file is too large to be a progress backup.');
      pendingImport = validateState(JSON.parse(await file.text()));
      const unknown = Object.keys(pendingImport.progress).filter(id => !byId.has(id));
      if (unknown.length) throw new Error('This backup contains words outside this edition.');
      confirmDialog('Restore this garden?', `This replaces your current progress with ${Object.keys(pendingImport.progress).length} saved word records. Export your current progress first if you want to keep it.`, 'Restore backup', () => {
        if (!saveState(pendingImport)) { document.querySelector('#backup-status').textContent = 'Restore failed: this browser cannot save data. Your current session is unchanged.'; return; }
        state = pendingImport; pendingImport = null; savingBlocked = false; warning = ''; renderSettings(); document.querySelector('#backup-status').textContent = 'Your backup is restored.';
      });
    } catch (error) { document.querySelector('#backup-status').textContent = `Could not import: ${error.message}`; }
    e.target.value = '';
  };
  document.querySelector('#reset').onclick = () => confirmDialog('Start fresh?', 'This removes your saved progress and session history in this browser. This cannot be undone without a backup.', 'Reset progress', () => {
    const next = freshState(); next.settings = { ...state.settings };
    if (!saveState(next)) { document.querySelector('#backup-status').textContent = 'Reset failed: this browser cannot save data.'; return; }
    state = next; savingBlocked = false; warning = ''; renderSettings(); document.querySelector('#backup-status').textContent = 'Your garden is ready for a fresh start.';
  });
}
function populateVoices() {
  const select = document.querySelector('#voice'); if (!select) return;
  const available = voices();
  select.innerHTML = `<option value="">Automatic · prefer US English</option>${available.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('')}`;
  select.value = available.some(v => v.voiceURI === state.settings.voice) ? state.settings.voice : '';
}
globalThis.speechSynthesis?.addEventListener('voiceschanged', populateVoices);
function confirmDialog(title, message, label, action) {
  const d = document.querySelector('#confirm-dialog');
  document.querySelector('#dialog-title').textContent = title;
  document.querySelector('#dialog-message').textContent = message;
  document.querySelector('#confirm-action').textContent = label;
  document.querySelector('#cancel-dialog').onclick = () => d.close();
  document.querySelector('#confirm-action').onclick = () => { d.close(); action(); };
  d.showModal(); document.querySelector('#cancel-dialog').focus();
}
function navigate(next) {
  if (screen === 'practice' && session) { finishSession(); return; }
  stopSpeech(); screen = ['home', 'library', 'statistics', 'guide', 'settings', 'results'].includes(next) ? next : 'home';
  render(); window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => {
  if (location.hash === '#main') { const main = document.querySelector('#main'); main?.setAttribute('tabindex', '-1'); main?.focus(); return; }
  navigate(location.hash.slice(1));
});
window.addEventListener('pagehide', stopSpeech);

try {
  const responses = await Promise.all([fetch('./data/words.json'), fetch('./data/overrides.json')]);
  if (responses.some(r => !r.ok)) throw new Error('Word data could not be loaded.');
  [data, overrides] = await Promise.all(responses.map(r => r.json()));
  words = data.words; byId = new Map(words.map(w => [w.id, w]));
  screen = ['library', 'statistics', 'guide', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
} catch {
  app.innerHTML = `<main class="loading" id="main"><h1>A little trouble opening the garden.</h1><p>Check your connection and reload. Run this app through a web server rather than opening the HTML file directly.</p><button class="button" onclick="location.reload()">Try again</button></main>`;
}
