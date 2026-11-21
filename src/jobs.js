import { randomUUID } from 'node:crypto';

const jobs = new Map();

export function createJob({ type, originalName, size, inputPath, dir, maxBytes = 0 }) {
  const now = Date.now();
  const job = {
    id: randomUUID(),
    type,
    status: 'queued',
    progress: 0,
    stage: '排队中',
    detail: '',
    error: '',
    originalName,
    size,
    maxBytes,
    inputPath,
    dir,
    outputPath: '',
    downloadName: '',
    coverExt: '',
    result: null,
    createdAt: now,
    updatedAt: now
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: Date.now() });
  if (typeof patch.progress === 'number' && job.progress > 0) {
    job.progress = Math.max(0, Math.min(100, Math.round(job.progress)));
  }
  return job;
}

export function publicJob(job) {
  if (!job) return null;
  const result = job.result
    ? {
        ...job.result,
        coverUrl: job.coverExt ? `/api/cover/${job.id}?v=${job.updatedAt}` : null
      }
    : null;

  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    detail: job.detail,
    error: job.error,
    file: {
      name: job.originalName,
      size: job.size,
      maxBytes: job.maxBytes
    },
    result,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

export function listJobs() {
  return [...jobs.values()];
}

export function deleteJob(id) {
  return jobs.delete(id);
}

export function sweepJobs(ttlMs, onRemove) {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (now - job.updatedAt > ttlMs) {
      jobs.delete(job.id);
      onRemove?.(job);
    }
  }
}
