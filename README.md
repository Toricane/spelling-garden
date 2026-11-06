# Spelling Garden

A static, distraction-free spelling practice app using the **SBOC 2027 Official Junior Word List**. It includes all 400 words, source pronunciations with stress, parts of speech, definitions, sentences, accepted alternatives, and homophone markers.

## Run locally

```sh
npm start
```

Open http://127.0.0.1:4173. Node 20+ is recommended. No dependency installation or build is needed to serve or test the app. Opening `index.html` as a `file:` URL will not work because the app loads JSON and JavaScript modules.

Deploy the contents of `dist/` to any static HTTP(S) host. Use a stable origin: local storage is specific to the browser and website address.

## Practice behavior

- Choose 10 distinct words plus retries, or an open-ended session.
- Due reviews precede new words. Unseen words are shuffled.
- Correct scheduled reviews use 1, 3, 7, 14 and 30-day intervals. A miss resets to tomorrow and gets one same-session retry after three intervening attempts, or at the end.
- Retries do not advance the interval or inflate first-attempt accuracy. Extra practice leaves the schedule unchanged.
- Progress saves after every graded attempt. Export/import JSON backups and confirmed reset are in Settings.
- Capitals count. Whitespace, accents and punctuation are optional under manual rule 9. Homophones are context clues, never automatically accepted alternatives.
- Learning hints remain available; this is learning practice, not a full simulation of an oral competition.
- Type or spell aloud with the microphone controls inside the spelling field. Both are always available together; there is no input-mode toggle.
- Feedback stays brief: correct answers show the spelling and pronunciation. Misses compare “Yours” and “Answer” in monospace, with differing letters highlighted in soft rose and sage. The comparison uses the closest accepted spelling, respects capitalization, and ignores optional accents, spaces and punctuation. Meaning, example and alternatives are available in collapsed details.
- Only the word autoplays for ordinary entries. Under rule 11, homophones automatically receive their source definition and sentence after the word. On-screen learning hints mask target spellings.
- Statistics shows scheduled-review accuracy, word coverage, review intervals, missed words, recent sessions and 14-day activity. Accuracy excludes retries and extra practice; session history includes extra practice and retains the latest 100 finished sessions. Written definition/sentence hints are hidden by default and can be enabled below the practice help buttons.

## Voice input and keyboard controls

- **Start / Stop:** press the microphone button, say each letter, then press the same button to stop. Space also toggles recording when that button or the page has focus; typing and other controls keep their normal Space behavior.
- **Enter:** starts voice when the input is empty and recognition is available, checks an existing answer, or advances after feedback. During recording, Enter or Check spelling stops listening, waits for the final transcript, then checks in one action. Check spelling stays enabled while recording.
- **Restart:** stops listening and clears the ungraded spelling. It does not record a miss or change the review schedule.
- Say “capital” or “uppercase” before an uppercase letter; both “zee” and “zed” are supported. Stop to review or edit captured letters before checking if needed. Unrecognized speech must be corrected or restarted before grading.

Voice uses the browser's `SpeechRecognition` / `webkitSpeechRecognition` service. Availability and accuracy depend on the browser, microphone and speaker. If the API is unavailable, the microphone is disabled and typing still works. The browser service may send audio online and require internet; the app does not store recordings or ship a recognition model. Recognition receives no expected answer or word list, and input is parsed as letter names rather than autocorrected toward a correct spelling.

Starting voice stops prompt playback. Playing audio, restarting, hiding/leaving the page or advancing cancels listening and any pending check. Late results from cancelled recordings cannot change or grade a later attempt.

## Source and data checks

`dist/data/words.json` was extracted from the supplied 60-page PDF, using the numbered entries on pages 21–59. The source PDF is not included in this repository. Definitions and sentences are separated using table geometry and font styles; bold pronunciation stress is retained.

To regenerate with Python and `pdfplumber`:

```sh
python tools/extract_words.py "path/to/SBOC 2027 Official Junior Word List.pdf"
```

The extractor verifies exactly 400 consecutive word numbers and requires every content field. Tests reject footer leakage, invalid alternative spellings, and answer leakage in masked example sentences. The extraction preserves source wording rather than rewriting editorial quirks. `dist/data/overrides.json` documents source issues and verified Dictionary.com additions. Dictionary alternatives beyond the provided list are not claimed to be exhaustive.

## Audio

The website prefers static Kokoro neural audio. Settings also offers browser speech synthesis. Settings can select device speech explicitly and choose an English voice. The model is never sent to the visitor's browser.

To generate or resume all 1,200 MP3 clips (word, definition, sentence per entry):

```sh
npm install
npm run audio -- --workers=2 --threads=2
```

The generator uses two independent worker processes, each with its own Kokoro q8 model and two CPU inference threads. A shared work queue balances short words and longer sentences. Only missing recordings are generated. Each MP3 is written to a temporary file and renamed after successful encoding, so interrupted runs can resume safely. The parent alone writes the final availability and SHA-256 manifest.

The generator prepares the model cache once when needed, then its isolated workers use the cached files in `tools/.cache/`. It uses `af_heart` (US English), speaking speed 0.95, and needs `ffmpeg` on PATH or `FFMPEG_PATH`. Models, dependencies, WAV intermediates and comparison audio stay in ignored directories and are not deployed.

Use `--workers=1 --threads=4` for a single model, or `--limit=18` to benchmark a small batch of missing recordings. `AUDIO_WORD_NUMBERS`, `AUDIO_KINDS`, `AUDIO_OUTPUT`, and `AUDIO_REPLACE=1` support targeted regeneration. `tools/pronunciation-overrides.json` transcribes selected source respellings into model phonemes for uncommon words.

The final site serves only MP3 recordings. It does not load Kokoro, ONNX Runtime, WebAssembly, a worker, or a voice model in the visitor's browser. Device speech remains an explicit alternative in Settings.

For faster build-time generation on a computer with WebGPU, run `npm run audio:gpu`, open its printed localhost URL, and start the build. This maintainer tool uses the GPU alongside one isolated CPU process with a shared queue; jobs are leased once so the two paths cannot duplicate a recording. It writes the same static MP3 assets. The tool downloads the fp32 model for its own local build session; it is outside `dist/` and never deployed. If interrupted, restart the tool to resume missing files.

On this computer, four isolated CPU processes with one inference thread each performed best among CPU-only tests. The combined GPU/CPU run was faster. Node worker threads were rejected because the native runtime crashed when multiple instances shared a process.

**Pronunciation quality:** machine-generated audio is not an official recording. The source pronunciation guide is retained as the reference. Rare words may require corrected audio; replace the corresponding MP3 after reviewing it. The generated audio manifest records availability, not human pronunciation approval. Slower playback preserves pitch where the browser supports it.

App files and audio played successfully are cached by the service worker. After a successful online visit the app shell can reopen offline; only previously played clips are available offline. Device TTS offline support varies. Progress remains in local storage, separately from the asset cache.

## Validation

```sh
npm test
```

Tests cover the 400-entry dataset, capitals/accents/alternatives/homophones, due-first queue selection, short-set limits, interval changes, retries, calendar boundaries, backup validation, hint masking, stable IDs across list reordering, statistics, and all 1,200 recording checksums. Voice tests cover letter parsing, interim/final transcript updates, stop-and-check, cancellation, recognition failures and keyboard shortcut eligibility. Comparison tests cover substitutions, missing/extra letters, capitals, optional characters and accepted alternatives.

For UI changes, also check desktop and narrow-screen layouts, microphone Start/Stop/Restart, Enter/Space behavior, playback interruption and feedback differences in-browser. Use a separate origin or browser profile for graded QA attempts; do not reset or alter a user's saved progress. Automated recognition tests use a simulated service and do not measure real microphone accuracy.

## Content rights

The official word-list content belongs to its respective rights holders. This independent practice tool is not affiliated with or endorsed by Spelling Bee of Canada. Kokoro's model and JavaScript library use Apache-2.0. See `dist/audio/NOTICE.txt`. Runtime app code has no external dependencies, tracking, accounts, or backend.
