// Maintainer setup only. The voice model is never included in dist/.
import { env, StyleTextToSpeech2Model, AutoTokenizer } from '@huggingface/transformers';
import path from 'node:path';
env.cacheDir = path.resolve('tools/.cache');
const id = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const [model] = await Promise.all([
  StyleTextToSpeech2Model.from_pretrained(id, { dtype: 'q8', device: 'cpu', session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 },
    progress_callback: p => { if (p.status === 'done') console.log(`Cached ${p.file}`); } }),
  AutoTokenizer.from_pretrained(id)
]);
await model.dispose();
console.log('Kokoro CPU model cache is ready.');
