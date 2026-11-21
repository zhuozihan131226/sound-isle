/**
 * Download the multilingual Whisper base model used for local lyric
 * transcription. The web app does this automatically on first use; this script
 * is handy for pre-seeding a deployment.
 */
import { ensureModel, modelReady } from '../src/asr.js';

if (await modelReady()) {
  console.log('Whisper base model is already present.');
} else {
  await ensureModel(({ percent, detail }) => {
    process.stdout.write(`\r${detail.padEnd(56)} ${String(percent).padStart(3)}%`);
  });
  process.stdout.write('\n');
  console.log('Whisper base model is ready.');
}
