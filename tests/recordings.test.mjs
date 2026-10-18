import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('the shipped site has all 1200 static Kokoro recordings with matching hashes', async () => {
  const { words } = JSON.parse(await readFile(new URL('../dist/data/words.json', import.meta.url)));
  const manifest = JSON.parse(await readFile(new URL('../dist/data/audio-manifest.json', import.meta.url)));
  assert.equal(manifest.clips, 1200);
  assert.equal(manifest.voice, 'af_heart');
  assert.equal(manifest.model, 'onnx-community/Kokoro-82M-v1.0-ONNX');
  for (const word of words) {
    assert.deepEqual(manifest.available[word.id], ['word', 'definition', 'sentence']);
    for (const kind of ['word', 'definition', 'sentence']) {
      const name = `${word.id}-${kind}.mp3`;
      const bytes = await readFile(new URL(`../dist/audio/${name}`, import.meta.url));
      assert.ok(bytes.length > 1000, name);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.checksums[name], name);
    }
  }
});

test('the deployable site contains no speech model or inference runtime', async () => {
  async function walk(url) {
    for (const entry of await readdir(url, { withFileTypes: true })) {
      const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, url);
      if (entry.isDirectory()) await walk(child);
      else {
        assert.ok(!/\.(onnx|wasm|bin)$/i.test(entry.name), entry.name);
        if (entry.name.endsWith('.js')) {
          const source = await readFile(child, 'utf8');
          assert.ok(!/new\s+Worker\s*\(|from\s*['"](?:kokoro-js|@huggingface\/transformers|onnxruntime)/.test(source), entry.name);
        }
      }
    }
  }
  await walk(new URL('../dist/', import.meta.url));
});
