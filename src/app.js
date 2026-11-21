import express from 'express';
import multer from 'multer';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  AUDIO_EXTENSIONS,
  BITRATES,
  DATA_DIR,
  INCOMING_DIR,
  JOB_TTL_MS,
  MAX_AUDIO_BYTES,
  MAX_VIDEO_BYTES,
  PUBLIC_DIR,
  UPLOAD_DIR,
  VIDEO_EXTENSIONS
} from './config.js';
import { createJob, getJob, publicJob, sweepJobs, updateJob } from './jobs.js';
import { probeMedia, runCommand } from './media.js';
import { extractLyrics } from './lyrics.js';
import { formatLrc, plainLyrics } from './lrc.js';
import {
  cleanDisplayName as cleanName,
  fixUploadName,
  formatBytes,
  safeFilename,
  stripExtension
} from './util.js';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function storageFor() {
  return multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, INCOMING_DIR),
    filename: (_req, file, callback) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      callback(null, `${randomUUID()}${ext}`);
    }
  });
}

function makeUploader(allowed, maxBytes) {
  return multer({
    storage: storageFor(),
    limits: { fileSize: maxBytes, files: 1, fields: 8 },
    fileFilter: (_req, file, callback) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!allowed.has(ext)) {
        callback(new HttpError(400, `不支持 ${ext || '这种'} 格式，请换一个文件。`));
        return;
      }
      callback(null, true);
    }
  });
}

const uploadVideo = makeUploader(VIDEO_EXTENSIONS, MAX_VIDEO_BYTES);
const uploadAudio = makeUploader(AUDIO_EXTENSIONS, MAX_AUDIO_BYTES);

async function prepareJob(req, type) {
  if (!req.file) throw new HttpError(400, '没有收到文件，请重新选择。');
  const jobId = randomUUID();
  const dir = path.join(UPLOAD_DIR, jobId);
  await mkdir(dir, { recursive: true });
  const originalName = cleanName(fixUploadName(req.file.originalname || 'audio'));
  const ext = path.extname(originalName).toLowerCase() || path.extname(req.file.path).toLowerCase();
  const inputPath = path.join(dir, `source${ext}`);
  await rename(req.file.path, inputPath);
  const job = createJob({
    type,
    originalName,
    size: req.file.size,
    inputPath,
    dir,
    maxBytes: type === 'convert' ? MAX_VIDEO_BYTES : MAX_AUDIO_BYTES
  });
  return job;
}

async function processConvert(job) {
  try {
    updateJob(job.id, {
      status: 'processing',
      progress: 4,
      stage: '读取媒体信息',
      detail: '正在确认音轨与时长'
    });

    const probe = await probeMedia(job.inputPath);
    if (!probe.hasAudio) throw new HttpError(422, '这个文件里没有可用的音轨。');

    const baseName = stripExtension(job.originalName) || 'sound-isle';
    const outputName = `${baseName}.mp3`;
    const outputPath = path.join(job.dir, outputName);
    const title = probe.tags.title || baseName;
    const artist = probe.tags.artist || '';
    const album = probe.tags.album || '';
    const duration = probe.duration || 0;

    const args = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      job.inputPath,
      '-map',
      '0:a:0',
      '-vn',
      '-map_metadata',
      '-1',
      '-codec:a',
      'libmp3lame',
      '-b:a',
      `${job.bitrate || 192}k`,
      '-id3v2_version',
      '3',
      '-metadata',
      `title=${title}`,
      ...(artist ? ['-metadata', `artist=${artist}`] : []),
      ...(album ? ['-metadata', `album=${album}`] : []),
      '-progress',
      'pipe:1',
      '-nostats',
      outputPath
    ];

    updateJob(job.id, {
      progress: 8,
      stage: '提取音轨',
      detail: 'ffmpeg 正在将声音编码为 MP3'
    });

    let lastUpdate = 0;
    const result = await runCommand('ffmpeg', args, {
      timeoutMs: 30 * 60 * 1000,
      onStdout(chunk) {
        const match = [...chunk.matchAll(/out_time_us=(\d+)/g)].pop();
        if (!match) return;
        const seconds = Number(match[1]) / 1_000_000;
        if (!duration || seconds <= 0) return;
        const percent = Math.min(95, 8 + (seconds / duration) * 87);
        const now = Date.now();
        if (now - lastUpdate > 450 && percent > (job.progress || 0)) {
          lastUpdate = now;
          updateJob(job.id, {
            progress: percent,
            stage: '转码中',
            detail: `已处理 ${Math.min(100, Math.round((seconds / duration) * 100))}%`
          });
        }
      }
    });

    if (result.code !== 0) {
      const message = result.stderr
        .split('\n')
        .filter(Boolean)
        .slice(-2)
        .join(' ')
        .trim();
      throw new HttpError(422, message || '转换失败，请尝试其他文件。');
    }

    const info = await stat(outputPath).catch(() => null);
    if (!info || info.size < 1024) throw new HttpError(422, '转换没有生成有效的 MP3 文件。');

    updateJob(job.id, {
      status: 'done',
      progress: 100,
      stage: '转换完成',
      detail: 'MP3 已准备好，可以试听或下载',
      outputPath,
      downloadName: outputName,
      result: {
        kind: 'audio',
        title,
        artist,
        album,
        duration,
        bitrate: Number(job.bitrate) || 192,
        size: info.size,
        outputName,
        sourceSize: job.size
      }
    });
  } catch (error) {
    updateJob(job.id, {
      status: 'error',
      progress: 100,
      stage: '转换失败',
      detail: '',
      error: error.message || '转换失败，请重试。'
    });
  }
}

async function processLyrics(job, options = {}) {
  const { title = '', artist = '', skipEmbedded = false, allowAsr = true } = options;
  try {
    updateJob(job.id, {
      status: 'processing',
      progress: 2,
      stage: '读取音频',
      detail: '正在分析文件',
      error: ''
    });

    const result = await extractLyrics({
      file: job.inputPath,
      originalName: job.originalName,
      jobDir: job.dir,
      titleOverride: title,
      artistOverride: artist,
      allowAsr,
      language: job.language || 'auto',
      skipEmbedded,
      onProgress({ percent, stage, detail }) {
        updateJob(job.id, {
          progress: Math.max(job.progress || 0, Math.min(99, Math.round(percent))),
          stage: stage || job.stage,
          detail: detail || job.detail
        });
      }
    });

    job.coverExt = result.coverExt || '';
    updateJob(job.id, {
      status: 'done',
      progress: 100,
      stage: result.found ? '提取完成' : '未找到歌词',
      detail: result.found ? '歌词已准备好' : result.reason || '没有找到匹配的歌词',
      result
    });
  } catch (error) {
    updateJob(job.id, {
      status: 'error',
      progress: 100,
      stage: '提取失败',
      detail: '',
      error: error.message || '提取歌词时出错，请重试。'
    });
  }
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    );
    next();
  });

  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: 'sound-isle', now: Date.now() });
  });

  app.use(requireAccess);

  app.post(
    '/api/convert',
    uploadVideo.single('file'),
    asyncHandler(async (req, res) => {
      const bitrate = String(req.body.bitrate || '192');
      if (!BITRATES.has(bitrate)) throw new HttpError(400, '不支持的 MP3 码率。');
      const job = await prepareJob(req, 'convert');
      job.bitrate = Number(bitrate);
      res.status(202).json({ job: publicJob(job) });
      processConvert(job);
    })
  );

  app.post(
    '/api/lyrics',
    uploadAudio.single('file'),
    asyncHandler(async (req, res) => {
      const language = ['auto', 'zh', 'en', 'ja', 'ko'].includes(req.body.language)
        ? req.body.language
        : 'auto';
      const allowAsr = req.body.asr !== '0';
      const job = await prepareJob(req, 'lyrics');
      job.language = language;
      job.allowAsr = allowAsr;
      res.status(202).json({ job: publicJob(job) });
      processLyrics(job, { allowAsr });
    })
  );

  app.get(
    '/api/jobs/:id',
    asyncHandler(async (req, res) => {
      const job = getJob(req.params.id);
      if (!job) throw new HttpError(404, '任务不存在或已过期。');
      res.setHeader('Cache-Control', 'no-store');
      res.json({ job: publicJob(job) });
    })
  );

  app.post(
    '/api/jobs/:id/rematch',
    asyncHandler(async (req, res) => {
      const job = getJob(req.params.id);
      if (!job) throw new HttpError(404, '任务不存在或已过期。');
      if (job.type !== 'lyrics') throw new HttpError(400, '这个任务不是歌词任务。');
      if (job.status === 'processing') throw new HttpError(409, '歌词正在提取中，请稍候。');
      const title = String(req.body.title || '').trim().slice(0, 120);
      const artist = String(req.body.artist || '').trim().slice(0, 120);
      if (!title && !artist) throw new HttpError(400, '请至少填写歌名或歌手。');
      if (!(await stat(job.inputPath).catch(() => null))) {
        throw new HttpError(410, '原始音频已被清理，请重新上传。');
      }

      job.coverExt = '';
      job.result = null;
      updateJob(job.id, {
        status: 'processing',
        progress: 2,
        stage: '重新匹配',
        detail: '正在用新的歌曲信息搜索歌词',
        error: ''
      });
      res.status(202).json({ job: publicJob(job) });
      processLyrics(job, { title, artist, skipEmbedded: true, allowAsr: false });
    })
  );

  app.get(
    '/api/download/:id',
    asyncHandler(async (req, res) => {
      const job = getJob(req.params.id);
      if (!job || job.type !== 'convert' || job.status !== 'done') {
        throw new HttpError(404, '文件不存在或已过期。');
      }
      const exists = await stat(job.outputPath).catch(() => null);
      if (!exists) throw new HttpError(410, '文件已被清理，请重新转换。');
      res.download(job.outputPath, safeFilename(job.downloadName || 'sound-isle.mp3'));
    })
  );

  app.get(
    '/api/lyrics/:id/file',
    asyncHandler(async (req, res) => {
      const job = getJob(req.params.id);
      if (!job || job.type !== 'lyrics' || !job.result?.found) {
        throw new HttpError(404, '歌词不存在或已过期。');
      }
      const format = req.query.format === 'txt' ? 'txt' : 'lrc';
      const variant = req.query.variant === 'orig' ? 'orig' : 'simp';
      const result = variantFor(job.result, variant);
      const base = safeFilename(
        [result.artist, result.title].filter(Boolean).join(' - ') || 'lyrics'
      );
      const filename = `${base}.${format}`;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="lyrics.${format}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      );
      res.send(format === 'lrc' ? formatLrc(result) : plainLyrics(result) + '\n');
    })
  );

  app.get(
    '/api/audio/:id',
    asyncHandler(async (req, res) => {
      const job = getJob(req.params.id);
      if (!job || job.type !== 'lyrics') throw new HttpError(404, '音频不存在或已过期。');
      const exists = await stat(job.inputPath).catch(() => null);
      if (!exists) throw new HttpError(410, '音频已被清理，请重新上传。');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.sendFile(job.inputPath);
    })
  );

  app.get(
    '/api/cover/:id',
    asyncHandler(async (req, res) => {
      const job = getJob(req.params.id);
      if (!job || !job.coverExt) throw new HttpError(404, '封面不存在。');
      const file = path.join(job.dir, `cover.${job.coverExt}`);
      const exists = await stat(file).catch(() => null);
      if (!exists) throw new HttpError(404, '封面不存在。');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.sendFile(file);
    })
  );

  app.use(
    express.static(PUBLIC_DIR, {
      index: 'index.html',
      etag: true,
      setHeaders(res) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    })
  );

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next(new HttpError(404, '接口不存在。'));
      return;
    }
    res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  app.use((error, req, res, _next) => {
    if (res.headersSent) return;
    let status = error.status || 500;
    let message = error.message || '服务器开小差了，请重试。';

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        status = 413;
        const max = req.path.includes('lyrics') ? MAX_AUDIO_BYTES : MAX_VIDEO_BYTES;
        message = `文件太大了，请选择 ${formatBytes(max)} 以内的文件。`;
      } else {
        status = 400;
        message = '文件上传失败，请重新选择。';
      }
    }

    if (status >= 500) {
      console.error(`[${new Date().toISOString()}]`, error);
      message = '服务器开小差了，请重试。';
    }

    if (req.file?.path) {
      rm(req.file.path, { force: true }).catch(() => {});
    }

    if (req.path.startsWith('/api/')) {
      res.status(status).json({ error: message });
    } else {
      res.status(status).send(message);
    }
  });

  return app;
}

function variantFor(result, variant) {
  return {
    ...result,
    lines: (result.lines || []).map((line) => ({
      ...line,
      text: variant === 'orig' ? line.text : line.textSimp || line.text
    }))
  };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Optional HTTP Basic Auth, enabled with APP_PASSWORD. This is intended for
 * public deployments; local/LAN use can leave it unset. The health endpoint
 * stays public so hosting platforms can probe the service.
 */
function requireAccess(req, res, next) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    next();
    return;
  }

  const expectedUser = process.env.APP_USER || 'soundisle';
  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    const user = separator === -1 ? '' : decoded.slice(0, separator);
    const supplied = separator === -1 ? '' : decoded.slice(separator + 1);
    if (safeEqual(user, expectedUser) && safeEqual(supplied, password)) {
      next();
      return;
    }
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Sound Isle", charset="UTF-8"');
  res.status(401).type('text/plain; charset=utf-8').send('需要密码访问声屿。');
}


export async function initStorage() {
  await Promise.all([
    mkdir(DATA_DIR, { recursive: true }),
    mkdir(UPLOAD_DIR, { recursive: true }),
    mkdir(INCOMING_DIR, { recursive: true })
  ]);

  await cleanupIncoming();
  await cleanupOrphanUploads();
  await cleanupCaptureFiles();
  setInterval(() => {
    cleanupIncoming().catch(() => {});
  }, 30 * 60 * 1000).unref();

  setInterval(() => {
    sweepJobs(JOB_TTL_MS, (job) => {
      rm(job.dir, { recursive: true, force: true }).catch(() => {});
    });
  }, 10 * 60 * 1000).unref();
}

async function cleanupIncoming() {
  const entries = await readdir(INCOMING_DIR, { withFileTypes: true }).catch(() => []);
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = path.join(INCOMING_DIR, entry.name);
    const info = await stat(file).catch(() => null);
    if (info && now - info.mtimeMs > 60 * 60 * 1000) {
      await rm(file, { force: true }).catch(() => {});
    }
  }
}

async function cleanupOrphanUploads() {
  const entries = await readdir(UPLOAD_DIR, { withFileTypes: true }).catch(() => []);
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(UPLOAD_DIR, entry.name);
    const info = await stat(dir).catch(() => null);
    if (info && now - info.mtimeMs > JOB_TTL_MS) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function cleanupCaptureFiles() {
  const dir = path.join(DATA_DIR, 'tmp');
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = path.join(dir, entry.name);
    const info = await stat(file).catch(() => null);
    if (info && now - info.mtimeMs > 60 * 60 * 1000) {
      await rm(file, { force: true }).catch(() => {});
    }
  }
}

export { formatBytes };
