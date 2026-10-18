// Build-time only: isolated processes generate ordinary MP3s for the static site.
import { fork } from 'node:child_process';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { ensureAudioModel } from './ensure-audio-model.mjs';

const flags = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const positive = (value, fallback) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const workerCount = Math.min(4, positive(flags.workers || process.env.AUDIO_WORKERS, 2));
const threads = positive(flags.threads || process.env.AUDIO_THREADS, 2);
const limit = positive(flags.limit || process.env.AUDIO_LIMIT, Infinity);
const output = process.env.AUDIO_OUTPUT || 'dist/audio';
const selected = new Set((process.env.AUDIO_WORD_NUMBERS || '').split(',').filter(Boolean).map(Number));
const kinds = (process.env.AUDIO_KINDS || 'word,definition,sentence').split(',');
const { words } = JSON.parse(await readFile('dist/data/words.json', 'utf8'));
const overrides = JSON.parse(await readFile('tools/pronunciation-overrides.json', 'utf8'));
await mkdir(output, { recursive: true }); await mkdir('tmp/audio', { recursive: true });
const jobs = [];
for (const word of words) {
  if (selected.size && !selected.has(word.number)) continue;
  for (const kind of kinds) {
    if (!['word', 'definition', 'sentence'].includes(kind)) throw new Error('Unknown audio kind');
    const key = `${word.id}-${kind}`;
    const target = path.resolve(output, key + '.mp3');
    const exists = await stat(target).then(s => s.size > 1000).catch(() => false);
    if (!exists || process.env.AUDIO_REPLACE === '1') jobs.push({ type: 'generate', key, word: word.word, kind,
      text: kind === 'word' ? word.word : word[kind], target, override: overrides[word.id] });
  }
}
const queued = jobs.slice(0, limit);
console.log(`Kokoro q8 / af_heart. ${jobs.length} missing/selected clips; generating ${queued.length} with ${workerCount} workers × ${threads} CPU threads.`);
if (!queued.length) { console.log('Nothing to generate.'); process.exit(0); }
await ensureAudioModel();
const started = performance.now();
let next = 0, completed = 0, failed = 0, audioSeconds = 0, lastProgress = 0;
let minFreeMiB = Infinity;
const generated = [];
const workers = [];
const stopAll = () => { for (const worker of workers) worker.kill(); };
process.once('SIGINT', () => { stopAll(); process.exit(130); });
process.once('SIGTERM', () => { stopAll(); process.exit(143); });
const progress = () => {
  minFreeMiB = Math.min(minFreeMiB, Math.round(os.freemem() / 1024 ** 2));
  if (completed + failed !== lastProgress) {
    lastProgress = completed + failed;
    console.log(`${completed}/${queued.length} generated${failed ? `, ${failed} failed` : ''}; ${Math.round((performance.now() - started) / 1000)}s elapsed; ${Math.round(os.freemem() / 1024 ** 2)} MiB free`);
  }
};
const timer = setInterval(progress, 15000);
try {
  await Promise.all(Array.from({ length: Math.min(workerCount, queued.length) }, (_, id) => new Promise((resolve, reject) => {
    const worker = fork(new URL('./audio-worker.mjs', import.meta.url), [], { windowsHide: true,
      env: { ...process.env, AUDIO_WORKER_CONFIG: JSON.stringify({ id, threads }) }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    workers.push(worker);
    worker.stdout.on('data', chunk => process.stdout.write(chunk));
    worker.stderr.on('data', chunk => process.stderr.write(chunk));
    const dispatch = () => {
      if (next < queued.length) worker.send(queued[next++]);
      else worker.send({ type: 'close' });
    };
    worker.on('message', message => {
      if (message.type === 'ready') { console.log(`Worker ${id + 1} ready.`); dispatch(); }
      else if (message.type === 'done') { completed++; audioSeconds += message.seconds; generated.push(message); dispatch(); }
      else if (message.type === 'failed') { failed++; console.error(`${message.key}: ${message.message}`); dispatch(); }
      else if (message.type === 'fatal') reject(new Error(message.message));
    });
    worker.on('error', reject);
    worker.on('exit', code => code === 0 ? resolve() : reject(new Error(`Worker ${id + 1} exited with ${code}`)));
  })));
} finally { clearInterval(timer); stopAll(); }
progress();
const elapsed = (performance.now() - started) / 1000;
const report = { workers: workerCount, threadsPerWorker: threads, completed, failed, elapsedSeconds: elapsed,
  averageWallSecondsPerClip: elapsed / Math.max(1, completed), generatedAudioSeconds: audioSeconds,
  audioSecondsPerWallSecond: audioSeconds / elapsed, minimumFreeMiB: minFreeMiB, generated };
await writeFile(`tmp/audio/report-${Date.now()}.json`, JSON.stringify(report, null, 2));
const available = {};
const checksums = {};
for (const word of words) {
  available[word.id] = [];
  for (const kind of ['word', 'definition', 'sentence']) {
    const name = `${word.id}-${kind}.mp3`;
    const bytes = await readFile(path.resolve(output, name)).catch(() => null);
    if (bytes && bytes.length > 1000) { available[word.id].push(kind); checksums[name] = createHash('sha256').update(bytes).digest('hex'); }
  }
}
const total = Object.values(available).reduce((n, clips) => n + clips.length, 0);
if (output === 'dist/audio') await writeFile('dist/data/audio-manifest.json', JSON.stringify({ model: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  engine: 'kokoro-js 1.2.1', voice: 'af_heart', dtype: 'q8', speed: 0.95, format: 'mp3', clips: total,
  reviewStatus: 'Machine-generated; use the printed pronunciation guide to check unusual words.', available, checksums }, null, 2) + '\n');
console.log(`Done: ${completed} new clips in ${elapsed.toFixed(1)}s (${report.averageWallSecondsPerClip.toFixed(2)} wall seconds/clip; ${report.audioSecondsPerWallSecond.toFixed(2)} audio seconds/wall second). ${total}/1200 static clips available.`);
if (failed) process.exitCode = 1;
