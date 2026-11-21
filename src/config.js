import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(here, '..');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const INCOMING_DIR = path.join(DATA_DIR, 'incoming');
export const MODEL_DIR = path.join(ROOT, 'models');
export const MODEL_PATH = path.join(MODEL_DIR, 'ggml-base.bin');

export const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 120 * 1024 * 1024;
export const JOB_TTL_MS = 2 * 60 * 60 * 1000;

export const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi']);
export const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.oga', '.opus', '.wma', '.aiff'
]);

export const BITRATES = new Set(['128', '192', '256', '320']);
