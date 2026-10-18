import { stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
export async function ensureAudioModel() {
  const base = 'tools/.cache/onnx-community/Kokoro-82M-v1.0-ONNX/';
  const complete = await Promise.all(['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'].map(file => stat(base + file).then(s => s.size > 0).catch(() => false)));
  if (complete.every(Boolean)) return;
  console.log('Preparing the build-time model cache once…');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve('tools/cache-audio-model.mjs')], { windowsHide: true, stdio: 'inherit' });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('Model cache preparation failed.')));
  });
}
