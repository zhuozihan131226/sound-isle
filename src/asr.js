import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { MODEL_DIR, MODEL_PATH } from './config.js';
import { parseSrt } from './lrc.js';
import { relativeFilterPath, runCommand } from './media.js';

const MODEL_URLS = [
  'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
];
const MIN_MODEL_BYTES = 100 * 1024 * 1024;

let modelPromise = null;

export class AsrError extends Error {
  constructor(message, code = 'ASR_FAILED') {
    super(message);
    this.name = 'AsrError';
    this.code = code;
  }
}

export async function modelReady() {
  try {
    const info = await stat(MODEL_PATH);
    return info.size > MIN_MODEL_BYTES;
  } catch {
    return false;
  }
}

export async function ensureModel(onProgress = () => {}) {
  if (await modelReady()) return MODEL_PATH;
  if (modelPromise) return modelPromise;

  modelPromise = (async () => {
    await mkdir(MODEL_DIR, { recursive: true });
    const tempPath = `${MODEL_PATH}.part`;
    let lastError;

    for (const url of MODEL_URLS) {
      try {
        onProgress({ percent: 0, detail: '正在下载本地识别模型（约 141 MB，仅需一次）' });
        const response = await fetch(url, {
          redirect: 'follow',
          headers: { 'User-Agent': 'SoundIsle/1.0' },
          signal: AbortSignal.timeout(15 * 60 * 1000)
        });
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
        const total = Number(response.headers.get('content-length')) || 0;
        let received = 0;
        let lastReport = 0;
        const source = Readable.fromWeb(response.body);

        source.on('data', (chunk) => {
          received += chunk.length;
          const now = Date.now();
          if (now - lastReport > 600) {
            lastReport = now;
            const percent = total ? Math.min(99, Math.round((received / total) * 100)) : 0;
            onProgress({
              percent,
              detail: `正在下载本地识别模型 ${total ? `${percent}%` : ''}`.trim()
            });
          }
        });

        await pipeline(source, createWriteStream(tempPath));
        const info = await stat(tempPath);
        if (info.size < MIN_MODEL_BYTES) throw new Error('模型文件不完整');
        await rename(tempPath, MODEL_PATH);
        onProgress({ percent: 100, detail: '本地识别模型已就绪' });
        return MODEL_PATH;
      } catch (error) {
        lastError = error;
        await rm(tempPath, { force: true }).catch(() => {});
      }
    }

    throw new AsrError(
      `本地识别模型不可用：${lastError?.message || '下载失败'}`,
      'MODEL_UNAVAILABLE'
    );
  })().finally(() => {
    modelPromise = null;
  });

  return modelPromise;
}

/**
 * Transcribe with ffmpeg's built-in whisper.cpp filter. The filter writes an
 * SRT file and reports transcription position on stderr, which gives us a
 * genuine progress signal.
 */
export async function transcribe(file, jobDir, options = {}) {
  const { language = 'auto', duration = 0, onProgress = () => {} } = options;
  const model = await ensureModel(({ percent, detail }) => {
    onProgress({ percent: 64 + Math.round(percent * 0.04), detail });
  });

  const destination = 'asr.srt';
  const destinationPath = path.join(jobDir, destination);
  const modelRelative = relativeFilterPath(jobDir, model);
  await rm(destinationPath, { force: true });

  const filter = [
    `whisper=model=${modelRelative}`,
    `language=${language}`,
    'format=srt',
    `destination=${destination}`,
    'use_gpu=false',
    'queue=3000'
  ].join(':');

  const timeoutMs = Math.min(
    30 * 60 * 1000,
    Math.max(8 * 60 * 1000, Math.round((duration || 180) * 3200))
  );

  onProgress({ percent: 68, detail: '本地 AI 正在听写，首次会慢一些' });

  let stderrBuffer = '';
  let lastPercent = 68;
  let lastReport = 0;
  const durationMs = Math.max(1, duration * 1000);

  const result = await runCommand(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'info',
      '-i',
      file,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-af',
      filter,
      '-f',
      'null',
      '-'
    ],
    {
      cwd: jobDir,
      timeoutMs,
      onStderr(chunk) {
        stderrBuffer = (stderrBuffer + chunk).slice(-8000);
        const matches = [...stderrBuffer.matchAll(/run transcription at ([\d.]+) ms/gi)];
        const latest = matches[matches.length - 1];
        if (!latest) return;
        const position = Number(latest[1]);
        const ratio = Math.min(1, position / durationMs);
        const percent = Math.round(68 + ratio * 27);
        const now = Date.now();
        if (percent > lastPercent && now - lastReport > 500) {
          lastPercent = percent;
          lastReport = now;
          onProgress({ percent, detail: `本地 AI 听写中 ${Math.round(ratio * 100)}%` });
        }
      }
    }
  );

  if (result.timedOut) {
    throw new AsrError('本地识别超时，请尝试较短的音频。', 'ASR_TIMEOUT');
  }

  if (result.code !== 0) {
    const detail = stderrBuffer
      .split('\n')
      .filter((line) => /error|failed|invalid|unable/i.test(line))
      .slice(-2)
      .join(' ')
      .trim();
    throw new AsrError(detail || '本地识别没有完成，请检查音频文件。', 'ASR_FAILED');
  }

  let srt = '';
  try {
    srt = await readFile(destinationPath, 'utf8');
  } catch {
    throw new AsrError('本地识别没有输出结果。', 'ASR_EMPTY');
  }

  let lines = parseSrt(srt)
    .map((line) => ({ ...line, text: line.text.replace(/^\[(?:music|音乐|掌声|applause)\]$/i, '').trim() }))
    .filter((line) => line.text);

  // Whisper sometimes repeats the same sentence in consecutive segments.
  lines = lines.filter((line, index) => {
    const previous = lines[index - 1];
    return !previous || previous.text !== line.text;
  });

  if (!lines.length) {
    throw new AsrError('没有识别到清晰的人声，这首歌可能是纯音乐。', 'ASR_EMPTY');
  }

  onProgress({ percent: 97, detail: '正在整理歌词时间轴' });
  return {
    lines,
    language,
    model: 'whisper-base',
    srt
  };
}
