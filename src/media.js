import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import { DATA_DIR } from './config.js';

const BUFFER_LIMIT = 64 * 1024;
const CAPTURE_DIR = path.join(DATA_DIR, 'tmp');

/**
 * Run a child process and collect its output.
 *
 * Output is redirected to real files instead of pipes: this keeps the tool
 * working inside sandboxed desktop environments where anonymous pipes can be
 * blocked, and also caps memory use for noisy ffmpeg runs. The files are
 * polled while the process runs so progress callbacks still arrive live.
 */
export async function runCommand(command, args, options = {}) {
  const {
    cwd,
    timeoutMs = 20 * 60 * 1000,
    onStdout,
    onStderr,
    env = process.env
  } = options;

  await mkdir(CAPTURE_DIR, { recursive: true }).catch(() => {});
  const token = randomUUID();
  const stdoutPath = path.join(CAPTURE_DIR, `${token}.out.log`);
  const stderrPath = path.join(CAPTURE_DIR, `${token}.err.log`);

  const stdoutHandle = await open(stdoutPath, 'w');
  const stderrHandle = await open(stderrPath, 'w');

  let child;
  try {
    child = spawn(command, args, {
      cwd,
      windowsHide: true,
      env,
      stdio: ['ignore', stdoutHandle.fd, stderrHandle.fd]
    });
  } catch (error) {
    await stdoutHandle.close().catch(() => {});
    await stderrHandle.close().catch(() => {});
    await rm(stdoutPath, { force: true }).catch(() => {});
    await rm(stderrPath, { force: true }).catch(() => {});
    throw error;
  }

  await stdoutHandle.close().catch(() => {});
  await stderrHandle.close().catch(() => {});

  let stdout = '';
  let stderr = '';
  let stdoutOffset = 0;
  let stderrOffset = 0;
  let timedOut = false;
  let settled = false;

  const readNew = async (file, offset) => {
    try {
      const buffer = await readFile(file);
      if (buffer.length <= offset) return { chunk: '', offset: buffer.length };
      return { chunk: buffer.subarray(offset).toString('utf8'), offset: buffer.length };
    } catch {
      return { chunk: '', offset };
    }
  };

  const poll = setInterval(async () => {
    const out = await readNew(stdoutPath, stdoutOffset);
    if (out.chunk) {
      stdoutOffset = out.offset;
      stdout = (stdout + out.chunk).slice(-BUFFER_LIMIT);
      onStdout?.(out.chunk);
    }
    const err = await readNew(stderrPath, stderrOffset);
    if (err.chunk) {
      stderrOffset = err.offset;
      stderr = (stderr + err.chunk).slice(-BUFFER_LIMIT);
      onStderr?.(err.chunk);
    }
  }, 180);
  poll.unref?.();

  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);

  return new Promise((resolve, reject) => {
    const cleanup = async () => {
      clearInterval(poll);
      clearTimeout(timer);
      await rm(stdoutPath, { force: true }).catch(() => {});
      await rm(stderrPath, { force: true }).catch(() => {});
    };

    child.on('error', async (error) => {
      if (settled) return;
      settled = true;
      await cleanup();
      reject(error);
    });

    child.on('close', async (code, signal) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timer);

      const out = await readNew(stdoutPath, stdoutOffset);
      if (out.chunk) {
        stdout = (stdout + out.chunk).slice(-BUFFER_LIMIT);
        onStdout?.(out.chunk);
      }
      const err = await readNew(stderrPath, stderrOffset);
      if (err.chunk) {
        stderr = (stderr + err.chunk).slice(-BUFFER_LIMIT);
        onStderr?.(err.chunk);
      }

      await cleanup();
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
}

export async function probeMedia(file) {
  const { code, stdout, stderr } = await runCommand(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    { timeoutMs: 30000 }
  );

  if (code !== 0) {
    throw new Error(stderr.trim() || '无法读取媒体信息');
  }

  let info;
  try {
    info = JSON.parse(stdout);
  } catch {
    throw new Error('媒体信息格式异常');
  }

  const streams = Array.isArray(info.streams) ? info.streams : [];
  const audioStreams = streams.filter((stream) => stream.codec_type === 'audio');
  const videoStreams = streams.filter(
    (stream) => stream.codec_type === 'video' && stream.disposition?.attached_pic !== 1
  );
  const format = info.format || {};
  const duration =
    Number(format.duration) ||
    Number(audioStreams[0]?.duration) ||
    Number(videoStreams[0]?.duration) ||
    0;

  const tags = {};
  for (const [key, value] of Object.entries({
    ...(format.tags || {}),
    ...(audioStreams[0]?.tags || {})
  })) {
    if (value == null) continue;
    tags[String(key).toLowerCase()] = String(value);
  }

  return {
    duration: Number.isFinite(duration) ? duration : 0,
    audioStreams,
    videoStreams,
    hasAudio: audioStreams.length > 0,
    hasVideo: videoStreams.length > 0,
    formatName: format.format_name || '',
    bitrate: Number(format.bit_rate) || 0,
    tags
  };
}

export async function readTags(file) {
  const metadata = await parseFile(file, { duration: true, skipCovers: false });
  const common = metadata.common || {};
  return {
    title: common.title || '',
    artist:
      common.artist || (Array.isArray(common.artists) ? common.artists.join(' / ') : ''),
    album: common.album || '',
    albumArtist: common.albumartist || '',
    year: common.year || null,
    track: common.track?.no || null,
    duration: metadata.format?.duration || 0,
    picture: common.picture?.[0] || null,
    lyricsTags: common.lyrics || [],
    native: metadata.native || {},
    common
  };
}

/** Pull USLT / SYLT / common.lyrics into one canonical shape. */
export function embeddedLyrics(tags) {
  const candidates = [];

  for (const item of tags.lyricsTags || []) {
    if (!item) continue;
    if (typeof item === 'string' && item.trim()) {
      candidates.push({ text: item, language: '', description: '' });
      continue;
    }
    if (Array.isArray(item.syncText) && item.syncText.length) {
      const lines = item.syncText
        .filter((entry) => entry && Number.isFinite(Number(entry.timestamp)))
        .map((entry) => {
          const seconds = timestampToSeconds(entry.timestamp, item.timeStampFormat);
          return { text: String(entry.text || '').trim(), seconds };
        })
        .filter((entry) => entry.text);
      if (lines.length) {
        const lrc = lines
          .map((entry) => `[${formatTimestamp(entry.seconds)}]${entry.text}`)
          .join('\n');
        candidates.push({
          text: lrc,
          language: item.language || '',
          description: item.description || ''
        });
      }
    }
    if (typeof item.text === 'string' && item.text.trim()) {
      candidates.push({
        text: item.text,
        language: item.language || '',
        description: item.description || ''
      });
    }
  }

  for (const frames of Object.values(tags.native || {})) {
    if (!Array.isArray(frames)) continue;
    for (const frame of frames) {
      if (!frame || !['USLT', 'SYLT'].includes(frame.id)) continue;
      const value = frame.value;
      if (typeof value === 'string' && value.trim()) {
        candidates.push({ text: value, language: '', description: '' });
      } else if (value && typeof value === 'object') {
        if (typeof value.text === 'string' && value.text.trim()) {
          candidates.push({
            text: value.text,
            language: value.language || '',
            description: value.description || ''
          });
        } else if (Array.isArray(value)) {
          const lines = value
            .filter((entry) => entry && entry.text)
            .map((entry) => {
              const stamp = Number(entry.timestamp ?? entry.time ?? 0);
              const seconds = timestampToSeconds(stamp, value.timeStampFormat);
              return `[${formatTimestamp(seconds)}]${String(entry.text).trim()}`;
            });
          if (lines.length) {
            candidates.push({ text: lines.join('\n'), language: '', description: '' });
          }
        }
      }
    }
  }

  return candidates
    .map((candidate) => ({
      ...candidate,
      text: candidate.text.replace(/\r\n?/g, '\n').trim()
    }))
    .filter((candidate) => candidate.text.length > 0);
}

function formatTimestamp(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const rest = (total % 60).toFixed(2).padStart(5, '0');
  return `${String(minutes).padStart(2, '0')}:${rest}`;
}

function timestampToSeconds(raw, format) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  // ID3 SYLT uses either MPEG frame counts (1) or milliseconds (2).
  // Music-metadata's own LRC parser uses milliseconds. If the format is
  // missing, use a conservative heuristic so both seconds and ms work.
  if (format === 2 || format === 'milliseconds') return value / 1000;
  if (format === 1 || format === 'mpeg frames') return value / 38.28;
  return value > 600 ? value / 1000 : value;
}

export function coverExtension(picture) {
  if (!picture) return null;
  const format = String(picture.format || '').toLowerCase();
  if (format.includes('png')) return 'png';
  if (format.includes('webp')) return 'webp';
  if (format.includes('gif')) return 'gif';
  return 'jpg';
}

export function relativeFilterPath(fromDir, target) {
  const relative = path.relative(fromDir, target).split(path.sep).join('/');
  return relative || path.basename(target);
}

export { CAPTURE_DIR };
