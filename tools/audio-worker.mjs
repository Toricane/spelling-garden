import { KokoroTTS } from 'kokoro-js';
import { env, StyleTextToSpeech2Model, AutoTokenizer } from '@huggingface/transformers';
import { phonemize } from 'phonemizer';
import { mkdir, rename, unlink, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const workerData = JSON.parse(process.env.AUDIO_WORKER_CONFIG);
const parentPort = { postMessage: message => process.send(message), on: (_, listener) => process.on('message', listener), close: () => process.disconnect() };
process.on('disconnect', () => process.exit(0));

env.cacheDir = path.resolve('tools/.cache');
const modelId = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let tts;
try {
  const [model, tokenizer] = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(modelId, { dtype: 'q8', device: 'cpu', local_files_only: true,
      session_options: { intraOpNumThreads: workerData.threads, interOpNumThreads: 1 } }),
    AutoTokenizer.from_pretrained(modelId, { local_files_only: true })
  ]);
  tts = new KokoroTTS(model, tokenizer);
  parentPort.postMessage({ type: 'ready' });
} catch (error) { parentPort.postMessage({ type: 'fatal', message: error.message }); parentPort.close(); }

// Use supplied pronunciations for selected uncommon words, including in sentences.
async function sourcePhonemes(job) {
  if (!job.override) return null;
  if (job.kind === 'word') return job.override.phonemes;
  const escaped = job.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![\\p{L}])(${escaped})(?![\\p{L}])`, 'giu');
  const parts = job.text.split(pattern);
  if (parts.length === 1) return null;
  const phonemes = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2) phonemes.push(job.override.phonemes);
    else if (parts[i].trim()) phonemes.push((await phonemize(parts[i], 'en-us')).join(' ').replace(/r/g, 'ɹ').replace(/x/g, 'k').replace(/ɬ/g, 'l').replace(/ʲ/g, 'j'));
  }
  return phonemes.join(' ');
}

if (tts) parentPort.on('message', async job => {
  if (job.type === 'close') { await tts.model.dispose(); parentPort.close(); return; }
  const started = performance.now();
  const wav = path.resolve(`tmp/audio/${job.key}-worker-${workerData.id}.wav`);
  const temporary = path.resolve(job.target + `.worker-${workerData.id}.tmp.mp3`);
  try {
    const phonemes = await sourcePhonemes(job);
    const audio = phonemes ? await tts.generate_from_ids(tts.tokenizer(phonemes, { truncation: true }).input_ids, { voice: 'af_heart', speed: 0.95 }) : await tts.generate(job.text, { voice: 'af_heart', speed: 0.95 });
    await mkdir(path.dirname(job.target), { recursive: true });
    await audio.save(wav);
    const result = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '64k', '-ac', '1', '-threads', '1', temporary], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'ffmpeg failed');
    await rename(temporary, job.target); await unlink(wav);
    const bytes = (await stat(job.target)).size;
    parentPort.postMessage({ type: 'done', key: job.key, bytes, seconds: audio.audio.length / audio.sampling_rate,
      ms: performance.now() - started, usedSourcePronunciation: Boolean(phonemes) });
  } catch (error) {
    await unlink(temporary).catch(() => {});
    parentPort.postMessage({ type: 'failed', key: job.key, message: error.message });
  }
});
