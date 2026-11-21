/* global XMLHttpRequest, Audio, navigator */

const MODES = {
  convert: {
    eyebrow: 'VIDEO → AUDIO',
    hero: '把画面里的<br /><span class="accent">声音</span>，留下来。',
    copy:
      '上传一段视频，把对白、音乐与环境声保存成干净的 MP3。码率、标签、进度，都在本地完成。',
    features: [
      ['FFMPEG', '专业转码引擎'],
      ['ID3', '保留歌曲信息'],
      ['LOCAL', '文件不离开电脑']
    ],
    title: '上传视频',
    step: 'STEP 01 · UPLOAD',
    hint: 'MP4 / MOV / MKV · ≤ 300 MB',
    dzTitle: '把视频拖到这里',
    dzSub: '或 <u>点击选择文件</u> · 最大 300 MB',
    formats: ['MP4', 'MOV', 'MKV', 'WEBM'],
    accept: '.mp4,.mov,.mkv,.webm,.m4v,.avi',
    startLabel: '开始提取 MP3',
    sheet: '01',
    code: 'AUDIO',
    disc: 'MP4<br /><i>→</i> MP3',
    spec: '192 KBPS · LOCAL',
    tag: '192 kbps',
    maxBytes: 300 * 1024 * 1024,
    extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v', 'avi'],
    notes: [
      ['BITRATE', '128 / 192 / 320 kbps', '默认 192k，在体积与清晰度之间取得平衡。'],
      ['METADATA', '标题 · 歌手 · 专辑', '源文件的歌曲信息会写入 MP3 的 ID3 标签。'],
      ['CLEANUP', '两小时后自动清理', '转换结果只保存在本机，不上传任何云端。']
    ]
  },
  lyrics: {
    eyebrow: 'AUDIO → LYRICS',
    hero: '让每一句<br /><span class="accent">歌词</span>，浮现。',
    copy:
      '从一首歌里找回歌词。先读内嵌标签，再匹配在线歌词库；找不到时，让本地 AI 听写补上。',
    features: [
      ['LRC', '同步时间轴'],
      ['LRCLIB', '在线歌词库'],
      ['WHISPER', '本地 AI 听写']
    ],
    title: '上传歌曲',
    step: 'STEP 02 · LYRICS',
    hint: 'MP3 / WAV / M4A · ≤ 120 MB',
    dzTitle: '把歌曲拖到这里',
    dzSub: '或 <u>点击选择文件</u> · 最大 120 MB',
    formats: ['MP3', 'WAV', 'M4A', 'FLAC'],
    accept: '.mp3,.wav,.m4a,.aac,.flac,.ogg,.oga,.opus,.wma,.aiff',
    startLabel: '开始提取歌词',
    sheet: '02',
    code: 'LYRICS',
    disc: 'MP3<br /><i>→</i> LRC',
    spec: 'SYNC · LRC · AI',
    tag: 'LRC / SYNCED',
    maxBytes: 120 * 1024 * 1024,
    extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'wma', 'aiff'],
    notes: [
      ['TAG FIRST', '先读内嵌歌词', '优先识别 MP3 标签里的 USLT / SYLT 歌词与时间轴。'],
      ['MATCH', 'LRCLIB + 网易云', '按歌名、歌手与时长排序，优先选择带时间轴的版本。'],
      ['AI FALLBACK', '本地 Whisper 听写', '没有命中时由本机模型补全，音频不会离开电脑。']
    ]
  }
};

const ICONS = {
  play: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7 4.5v11l9-5.5-9-5.5Z" fill="currentColor"/></svg>',
  pause:
    '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6.2 4.5h2.4v11H6.2v-11Zm5.2 0h2.4v11h-2.4v-11Z" fill="currentColor"/></svg>',
  download:
    '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3.5v8m0 0 3-3m-3 3-3-3M4.5 13.5v2h11v-2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copy:
    '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="7" y="7" width="8.5" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M12.5 7V5.5A1.5 1.5 0 0 0 11 4H5.5A1.5 1.5 0 0 0 4 5.5V12a1.5 1.5 0 0 0 1.5 1.5H7" stroke="currentColor" stroke-width="1.4"/></svg>',
  wave:
    '<svg class="art-wave" viewBox="0 0 64 40" fill="none" aria-hidden="true"><path d="M2 21h7l3-5 4 12 4-19 5 25 4-18 5 13 4-8 4 4h7l3-6 4 11 4-15 4 18 4-12 4 8 4-4h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  musicOff:
    '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M13 22.5V9l12-2.5v11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="23.5" r="3.2" stroke="currentColor" stroke-width="1.5"/><circle cx="22" cy="20.5" r="3.2" stroke="currentColor" stroke-width="1.5"/><path d="m5 5 22 22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  warning:
    '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3 18 17H2L10 3Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M10 8v4.2M10 14.6v.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  arrow:
    '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h11m0 0-4.2-4.2M15 10l-4.2 4.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

const state = {
  mode: 'convert',
  file: null,
  bitrate: 192,
  language: 'auto',
  asr: true,
  jobId: null,
  job: null,
  result: null,
  busy: false,
  runToken: 0,
  pollTimer: null,
  pollFailures: 0,
  xhr: null,
  player: null,
  variant: 'simp',
  translation: true,
  autoScrollUntil: 0
};

const $ = (selector) => document.querySelector(selector);

const els = {
  body: document.body,
  intro: $('.intro'),
  tabs: [...document.querySelectorAll('.mode-btn')],
  modeSwitch: $('.mode-switch'),
  heroTitle: $('#hero-title'),
  heroCopy: $('#hero-copy'),
  eyebrow: $('#eyebrow-text'),
  features: $('#feature-row'),
  discLabel: $('#disc-label'),
  discSpec: $('#disc-spec'),
  floatingTag: $('#floating-tag'),
  sheetNumber: $('#sheet-number'),
  paperCode: $('#paper-code'),
  paperStatus: $('#paper-status'),
  stepLabel: $('#step-label'),
  toolTitle: $('#tool-title'),
  fileHint: $('#file-hint'),
  dropzone: $('#dropzone'),
  fileInput: $('#file-input'),
  dzDefault: $('#dz-default'),
  dzFile: $('#dz-file'),
  dzTitle: $('#dz-title'),
  dzSub: $('#dz-sub'),
  dzFormats: $('#dz-formats'),
  selectedName: $('#selected-name'),
  selectedMeta: $('#selected-meta'),
  fileRemove: $('#file-remove'),
  options: $('#options'),
  bitrateBlock: $('#bitrate-block'),
  languageBlock: $('#language-block'),
  asrBlock: $('#asr-block'),
  bitrateButtons: [...document.querySelectorAll('[data-bitrate]')],
  languageSelect: $('#language-select'),
  asrToggle: $('#asr-toggle'),
  asrText: $('#asr-text'),
  startBtn: $('#start-btn'),
  startLabel: $('#start-label'),
  progressPanel: $('#progress-panel'),
  progressStage: $('#progress-stage'),
  progressDetail: $('#progress-detail'),
  progressPercent: $('#progress-percent'),
  progressBar: $('#progress-bar'),
  resetBtn: $('#reset-btn'),
  errorPanel: $('#error-panel'),
  errorMessage: $('#error-message'),
  errorReset: $('#error-reset'),
  notes: $('#tool-notes'),
  notesGrid: $('#notes-grid'),
  result: $('#result'),
  toast: $('#toast')
};

let toastTimer = null;

function config() {
  return MODES[state.mode];
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function fileExtension(name) {
  const match = String(name || '').match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function toast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 2200);
}

function setPaperStatus(kind) {
  const labels = {
    ready: 'READY',
    busy: 'PROCESSING',
    done: 'DONE',
    check: 'CHECK'
  };
  els.paperStatus.classList.toggle('is-busy', kind === 'busy');
  els.paperStatus.classList.toggle('is-done', kind === 'done');
  els.paperStatus.classList.toggle('is-error', kind === 'check');
  els.paperStatus.innerHTML = `<i></i> ${labels[kind] || 'READY'}`;
}

function applyMode(mode, { initial = false } = {}) {
  state.mode = mode;
  const cfg = config();
  document.body.dataset.mode = mode;
  els.tabs.forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });

  els.eyebrow.textContent = cfg.eyebrow;
  els.heroTitle.innerHTML = cfg.hero;
  els.heroCopy.textContent = cfg.copy;
  els.features.innerHTML = cfg.features
    .map(
      ([key, label]) =>
        `<div class="feature"><strong>${escapeHtml(key)}</strong><span>${escapeHtml(label)}</span></div>`
    )
    .join('');
  els.discLabel.innerHTML = cfg.disc;
  els.discSpec.textContent = cfg.spec;
  els.floatingTag.textContent = cfg.tag;
  els.sheetNumber.textContent = cfg.sheet;
  els.paperCode.textContent = cfg.code;
  els.stepLabel.textContent = cfg.step;
  els.toolTitle.textContent = cfg.title;
  els.fileHint.textContent = cfg.hint;
  els.dzTitle.textContent = cfg.dzTitle;
  els.dzSub.innerHTML = cfg.dzSub;
  els.dzFormats.innerHTML = cfg.formats.map((format) => `<span>${format}</span>`).join('');
  els.notesGrid.innerHTML = cfg.notes
    .map(
      ([num, title, text], index) => `
        <div class="note">
          <span class="note-num">0${index + 1} / ${escapeHtml(num)}</span>
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(text)}</p>
        </div>`
    )
    .join('');
  els.fileInput.accept = cfg.accept;
  els.dropzone.setAttribute('aria-label', `选择或拖入${cfg.title.replace('上传', '')}文件`);
  els.bitrateBlock.hidden = mode !== 'convert';
  els.languageBlock.hidden = mode !== 'lyrics';
  els.asrBlock.hidden = mode !== 'lyrics';
  els.startLabel.textContent = cfg.startLabel;
  setPaperStatus('ready');
  syncStart();

  if (!initial) {
    els.intro.classList.remove('is-swapping');
    // Restart the small entrance animation.
    void els.intro.offsetWidth;
    els.intro.classList.add('is-swapping');
  }
}

function syncStart() {
  const cfg = config();
  const disabled = !state.file || state.busy;
  if (state.busy && document.activeElement === els.startBtn) {
    els.startBtn.blur();
  }
  els.startBtn.disabled = disabled;
  els.startBtn.classList.toggle('is-secondary', Boolean(state.result));
  if (state.busy) {
    els.startLabel.textContent = '本地处理中…';
  } else if (state.result) {
    els.startLabel.textContent = '重新提取一次';
  } else {
    els.startLabel.textContent = cfg.startLabel;
  }
  els.dropzone.setAttribute('aria-disabled', String(state.busy));
  els.fileRemove.disabled = state.busy;
}

function clearFileUI() {
  state.file = null;
  els.dropzone.classList.remove('is-selected');
  els.dzDefault.hidden = false;
  els.dzFile.hidden = true;
  els.fileInput.value = '';
  els.selectedName.textContent = '—';
  els.selectedMeta.textContent = '—';
}

function clearRunState({ keepFile = false } = {}) {
  state.runToken += 1;
  stopPolling();
  if (state.xhr) {
    const xhr = state.xhr;
    state.xhr = null;
    try {
      xhr.abort();
    } catch {
      /* no-op */
    }
  }
  destroyPlayer();
  state.jobId = null;
  state.job = null;
  state.result = null;
  state.busy = false;
  state.pollFailures = 0;
  state.variant = 'simp';
  state.translation = true;
  els.result.hidden = true;
  els.result.innerHTML = '';
  els.progressPanel.hidden = true;
  els.errorPanel.hidden = true;
  els.notes.hidden = false;
  els.progressBar.style.width = '0%';
  els.progressPercent.textContent = '0%';
  setPaperStatus('ready');
  if (!keepFile) clearFileUI();
  syncStart();
}

function resetWorkspace() {
  clearRunState({ keepFile: false });
  els.startLabel.textContent = config().startLabel;
  syncStart();
}

function showError(message) {
  state.busy = false;
  stopPolling();
  els.progressPanel.hidden = true;
  els.notes.hidden = true;
  els.errorPanel.hidden = false;
  els.errorMessage.textContent = message || '处理没有完成，请重试。';
  setPaperStatus('check');
  els.startLabel.textContent = '重试';
  syncStart();
  els.errorPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setProgress(stage, detail, percent) {
  els.progressPanel.hidden = false;
  els.notes.hidden = true;
  els.errorPanel.hidden = true;
  els.progressStage.textContent = stage || '处理中';
  els.progressDetail.textContent = detail || '请保持页面开启';
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  els.progressPercent.textContent = `${value}%`;
  els.progressBar.style.width = `${value}%`;
  setPaperStatus('busy');
}

function setBusyUI() {
  state.busy = true;
  syncStart();
}

function validateFile(file) {
  const cfg = config();
  const extension = fileExtension(file.name);
  if (!cfg.extensions.includes(extension)) {
    return `这个工具暂不支持 .${extension || '未知'} 格式。请选择 ${cfg.formats.join(' / ')} 文件。`;
  }
  if (file.size > cfg.maxBytes) {
    return `文件太大了，请选择 ${formatBytes(cfg.maxBytes)} 以内的文件。`;
  }
  if (file.size === 0) {
    return '这个文件是空的，请换一个文件。';
  }
  return '';
}

function setFile(file) {
  if (state.busy) return;
  const message = validateFile(file);
  if (message) {
    clearRunState({ keepFile: false });
    showError(message);
    return;
  }

  clearRunState({ keepFile: true });
  state.file = file;
  els.dropzone.classList.add('is-selected');
  els.dzDefault.hidden = true;
  els.dzFile.hidden = false;
  els.selectedName.textContent = file.name;
  els.selectedMeta.textContent = `${fileExtension(file.name).toUpperCase()} · ${formatBytes(file.size)}`;
  els.errorPanel.hidden = true;
  setPaperStatus('ready');
  syncStart();
  els.startBtn.focus({ preventScroll: true });
}

function stopPolling() {
  if (state.pollTimer) {
    clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }
}

function uploadRequest(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    state.xhr = xhr;
    xhr.open('POST', url);
    xhr.responseType = 'json';
    xhr.timeout = 15 * 60 * 1000;

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return;
      onProgress(event.loaded, event.total);
    });

    xhr.addEventListener('load', () => {
      if (state.xhr === xhr) state.xhr = null;
      let payload = xhr.response;
      if (!payload && xhr.responseText) {
        try {
          payload = JSON.parse(xhr.responseText);
        } catch {
          payload = null;
        }
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload?.job) {
        resolve(payload.job);
        return;
      }
      reject(new Error(payload?.error || `上传失败（${xhr.status}）`));
    });

    xhr.addEventListener('error', () => {
      if (state.xhr === xhr) state.xhr = null;
      reject(new Error('无法连接本地服务，请确认声屿仍在运行。'));
    });

    xhr.addEventListener('timeout', () => {
      if (state.xhr === xhr) state.xhr = null;
      reject(new Error('上传超时，请检查文件大小后重试。'));
    });

    xhr.addEventListener('abort', () => {
      if (state.xhr === xhr) state.xhr = null;
      const error = new Error('已取消');
      error.name = 'AbortError';
      reject(error);
    });

    xhr.send(formData);
  });
}

async function startJob() {
  if (!state.file || state.busy) return;
  state.runToken += 1;
  const token = state.runToken;
  state.busy = true;
  state.result = null;
  state.jobId = null;
  state.job = null;
  destroyPlayer();
  els.result.hidden = true;
  els.result.innerHTML = '';
  els.errorPanel.hidden = true;
  setProgress('正在上传文件', '准备把文件交给本地引擎', 0);
  setBusyUI();

  const formData = new FormData();
  formData.append('file', state.file, state.file.name);
  if (state.mode === 'convert') {
    formData.append('bitrate', String(state.bitrate));
  } else {
    formData.append('language', state.language);
    formData.append('asr', state.asr ? '1' : '0');
  }

  try {
    const job = await uploadRequest(
      state.mode === 'convert' ? '/api/convert' : '/api/lyrics',
      formData,
      (loaded, total) => {
        if (state.runToken !== token) return;
        const ratio = total ? loaded / total : 0;
        setProgress(
          '正在上传文件',
          `${formatBytes(loaded)} / ${formatBytes(total)}`,
          ratio * 42
        );
      }
    );
    if (state.runToken !== token) return;
    state.jobId = job.id;
    state.job = job;
    setProgress('文件已就位', '本地引擎开始工作', 42);
    pollJob(token);
  } catch (error) {
    if (error.name === 'AbortError' || state.runToken !== token) return;
    showError(error.message);
  }
}

async function pollJob(token) {
  if (token !== state.runToken || !state.jobId) return;
  try {
    const response = await fetch(`/api/jobs/${encodeURIComponent(state.jobId)}`, {
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || '读取任务状态失败。');
    if (token !== state.runToken) return;

    const job = payload.job;
    state.job = job;
    state.pollFailures = 0;

    if (job.status === 'done') {
      setProgress('处理完成', '正在整理结果', 100);
      state.busy = false;
      setTimeout(() => finishJob(job, token), 220);
      return;
    }

    if (job.status === 'error') {
      showError(job.error || '处理没有完成，请重试。');
      return;
    }

    const overall = 42 + (Number(job.progress) || 0) * 0.58;
    setProgress(job.stage || '本地处理中', job.detail || '请保持页面开启', overall);
    state.pollTimer = setTimeout(() => pollJob(token), 680);
  } catch (error) {
    if (token !== state.runToken) return;
    state.pollFailures += 1;
    if (state.pollFailures >= 4) {
      showError(error.message || '无法连接本地服务。');
      return;
    }
    state.pollTimer = setTimeout(() => pollJob(token), 1200);
  }
}

function finishJob(job, token) {
  if (token !== state.runToken) return;
  state.busy = false;
  state.jobId = job.id;
  state.job = job;
  state.result = job.result;
  els.progressPanel.hidden = true;
  els.errorPanel.hidden = true;
  setPaperStatus('done');
  els.startLabel.textContent = '重新提取一次';
  syncStart();
  renderResult(job);
}

function renderResult(job) {
  destroyPlayer();
  state.autoScrollUntil = 0;
  const result = job.result;
  if (!result) {
    showError('没有拿到处理结果，请重试。');
    return;
  }

  if (job.type === 'convert') {
    els.result.innerHTML = audioResultMarkup(job, result);
  } else if (result.found) {
    els.result.innerHTML = lyricsResultMarkup(job, result);
  } else {
    els.result.innerHTML = missResultMarkup(job, result);
  }
  els.result.hidden = false;
  els.notes.hidden = true;
  wireCovers();
  wireResultActions(job, result);
  els.result.tabIndex = -1;
  els.result.focus({ preventScroll: true });
  els.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function playerMarkup({ src, title, subtitle, duration, coverUrl, badge, compact = false }) {
  const cover = coverUrl
    ? `<img src="${escapeHtml(coverUrl)}" alt="" data-cover />`
    : ICONS.wave;
  return `
    <div class="player${compact ? ' compact' : ''}">
      <div class="player-art">
        ${cover}
        <span class="art-badge">${escapeHtml(badge)}</span>
      </div>
      <div class="player-body">
        <div class="player-kicker">NOW PLAYING · LOCAL AUDIO</div>
        <div class="player-title">${escapeHtml(title)}</div>
        <div class="player-sub">${escapeHtml(subtitle)}</div>
        <div class="player-controls">
          <button class="play-btn" type="button" aria-label="播放">${ICONS.play}</button>
          <div class="seek-wrap">
            <span class="time current">00:00</span>
            <input class="seek" type="range" min="0" max="${Number(duration) || 0}" value="0" step="0.1" aria-label="播放进度" />
            <span class="time total">${formatTime(duration)}</span>
          </div>
        </div>
      </div>
      <audio src="${escapeHtml(src)}" preload="metadata" hidden></audio>
    </div>`;
}

function audioResultMarkup(job, result) {
  const title = result.title || result.outputName || '未命名音频';
  const subtitle = [result.artist, result.album].filter(Boolean).join(' · ') || '本地提取音轨';
  return `
    <article class="result-card audio-result">
      <div class="result-head">
        <div>
          <div class="result-kicker"><b>✓ DONE</b> OUTPUT / MP3</div>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <div class="result-actions">
          <a class="action-btn primary" href="/api/download/${escapeHtml(job.id)}" download>
            ${ICONS.download}<span class="action-label">下载 MP3</span>
          </a>
        </div>
      </div>
      ${playerMarkup({
        src: `/api/download/${job.id}`,
        title,
        subtitle,
        duration: result.duration,
        coverUrl: result.coverUrl,
        badge: 'MP3'
      })}
      <div class="result-stats">
        <div class="stat"><span>DURATION</span><strong>${formatTime(result.duration)}</strong></div>
        <div class="stat"><span>BITRATE</span><strong>${escapeHtml(result.bitrate)} kbps</strong></div>
        <div class="stat"><span>FILE SIZE</span><strong>${formatBytes(result.size)}</strong></div>
      </div>
    </article>`;
}

function lyricsResultMarkup(job, result) {
  const lines = Array.isArray(result.lines) ? result.lines : [];
  const shownLines = lines.filter((line) => line.text);
  const synced = Boolean(result.synced && shownLines.some((line) => Number.isFinite(line.time)));
  const source = escapeHtml(result.source || 'local');
  const sourceLabel = escapeHtml(result.sourceLabel || '本地结果');
  const hasTranslation = Boolean(result.hasTranslation);
  const artistLine = [result.artist, result.album].filter(Boolean).join(' · ') || '未知歌手';
  const lineMarkup = shownLines
    .map((line, index) => {
      const time = Number.isFinite(line.time) ? line.time : null;
      const text = state.variant === 'simp' ? line.textSimp || line.text : line.text;
      const attrs = time !== null
        ? ` data-time="${time}" data-index="${index}" role="button" tabindex="0"`
        : '';
      return `
        <div class="lyric-line${time !== null ? '' : ' is-static'}"${attrs}>
          ${time !== null ? `<span class="lyric-time">${formatTime(time)}</span>` : ''}
          <span class="lyric-body">
            <span class="lyric-text" data-orig="${escapeHtml(line.text)}" data-simp="${escapeHtml(
              line.textSimp || line.text
            )}">${escapeHtml(text)}</span>
            ${
              line.translation
                ? `<span class="lyric-translation">${escapeHtml(line.translation)}</span>`
                : ''
            }
          </span>
        </div>`;
    })
    .join('');

  return `
    <article class="result-card lyrics-card${hasTranslation && !state.translation ? ' hide-translation' : ''}" id="lyrics-card">
      <div class="result-head">
        <div class="lyrics-identity">
          <div class="cover">
            ${ICONS.wave}
            ${result.coverUrl ? `<img src="${escapeHtml(result.coverUrl)}" alt="" data-cover />` : ''}
          </div>
          <div class="lyrics-title-wrap">
            <span class="source-chip" data-source="${source}"><i></i>${sourceLabel}</span>
            <h2>${escapeHtml(result.title || '未知歌曲')}</h2>
            <p class="lyrics-sub">${escapeHtml(artistLine)} · ${formatTime(result.duration)}</p>
          </div>
        </div>
        <div class="lyrics-actions">
          <button class="icon-btn" type="button" data-action="copy" aria-label="复制歌词" title="复制歌词">${ICONS.copy}</button>
          <a class="icon-btn is-wide" href="/api/lyrics/${escapeHtml(job.id)}/file?format=lrc&variant=${state.variant}" download aria-label="下载 LRC" title="下载 LRC">${ICONS.download}<span>LRC</span></a>
          <a class="icon-btn" href="/api/lyrics/${escapeHtml(job.id)}/file?format=txt&variant=${state.variant}" download aria-label="下载 TXT" title="下载 TXT">TXT</a>
        </div>
      </div>

      ${playerMarkup({
        src: `/api/audio/${job.id}`,
        title: result.title || '未知歌曲',
        subtitle: artistLine,
        duration: result.duration,
        coverUrl: result.coverUrl,
        badge: 'AUDIO',
        compact: true
      })}

      ${
        result.warning
          ? `<div class="warning-strip">${ICONS.warning}<span>${escapeHtml(result.warning)}</span></div>`
          : ''
      }

      <div class="lyrics-toolbar">
        ${
          result.hasVariant
            ? `<div class="variant-toggle" role="group" aria-label="歌词字形">
                <button type="button" data-variant="simp" class="${state.variant === 'simp' ? 'is-active' : ''}">简体</button>
                <button type="button" data-variant="orig" class="${state.variant === 'orig' ? 'is-active' : ''}">原文</button>
              </div>`
            : ''
        }
        ${
          hasTranslation
            ? `<label class="translation-toggle">
                <input type="checkbox" data-translation ${state.translation ? 'checked' : ''} />
                显示翻译
              </label>`
            : ''
        }
        <span class="lyrics-hint">${synced ? '点击任意一句，跳转到对应时间' : '纯文本歌词'}</span>
      </div>

      <div class="lyrics-scroll" id="lyrics-scroll">
        <div class="lyrics-lines">
          ${lineMarkup || '<div class="lyrics-empty">这段音频没有可显示的歌词内容。</div>'}
        </div>
      </div>

      <div class="lyrics-footer">
        <span>${sourceLabel} · ${synced ? 'LRC 时间轴已同步' : '未提供时间轴'}</span>
        <span>${shownLines.length} LINES / ${formatTime(result.duration)}</span>
      </div>
    </article>`;
}

function missResultMarkup(job, result) {
  const instrumental = Boolean(result.instrumental);
  const canRematch = Boolean(result.canRematch) && !instrumental;
  const title = instrumental ? '这是一首纯音乐。' : '这次没有抓到歌词。';
  const tip = instrumental
    ? '歌词库把这首歌标记为纯音乐，所以没有可以提取的文字。'
    : '先试试补全歌名和歌手；如果是冷门歌曲，可以在重新上传时开启本地 AI 听写。';

  return `
    <article class="miss-card">
      <div class="miss-top">
        <div class="miss-icon">${ICONS.musicOff}</div>
        <div>
          <div class="miss-kicker">NO MATCH · ${instrumental ? 'INSTRUMENTAL' : 'LYRICS'}</div>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(result.reason || '没有找到匹配的歌词。')}</p>
        </div>
      </div>
      ${
        canRematch
          ? `<form class="rematch-form" id="rematch-form">
              <span class="rematch-label">换一个关键词，再找一次</span>
              <div class="rematch-fields">
                <label class="field"><input name="title" type="text" placeholder="歌名" value="${escapeHtml(
                  result.title || ''
                )}" maxlength="120" aria-label="歌名" /></label>
                <label class="field"><input name="artist" type="text" placeholder="歌手" value="${escapeHtml(
                  result.artist || ''
                )}" maxlength="120" aria-label="歌手" /></label>
                <button class="rematch-submit" type="submit">重新匹配</button>
              </div>
              <p class="miss-tip">${escapeHtml(tip)}</p>
            </form>`
          : `<p class="miss-tip">${escapeHtml(tip)}</p>`
      }
    </article>`;
}

function wireCovers() {
  els.result.querySelectorAll('img[data-cover]').forEach((image) => {
    image.addEventListener('error', () => image.remove());
  });
}

function wireResultActions(job, result) {
  if (job.type === 'convert') {
    mountPlayer(els.result, {
      src: `/api/download/${job.id}`,
      duration: result.duration
    });
    return;
  }

  if (result.found) {
    mountPlayer(els.result, {
      src: `/api/audio/${job.id}`,
      duration: result.duration,
      lyrics: true
    });

    const card = els.result.querySelector('#lyrics-card');
    const copyButton = els.result.querySelector('[data-action="copy"]');
    copyButton?.addEventListener('click', () => copyLyrics(result));

    els.result.querySelectorAll('[data-variant]').forEach((button) => {
      button.addEventListener('click', () => {
        state.variant = button.dataset.variant === 'orig' ? 'orig' : 'simp';
        els.result.querySelectorAll('[data-variant]').forEach((item) => {
          item.classList.toggle('is-active', item.dataset.variant === state.variant);
        });
        els.result.querySelectorAll('.lyric-text').forEach((node) => {
          node.textContent =
            state.variant === 'simp' ? node.dataset.simp || node.dataset.orig : node.dataset.orig;
        });
        updateDownloadLinks(job.id, result);
      });
    });

    const translationToggle = els.result.querySelector('[data-translation]');
    translationToggle?.addEventListener('change', () => {
      state.translation = translationToggle.checked;
      card?.classList.toggle('hide-translation', !state.translation);
    });

    return;
  }

  const form = els.result.querySelector('#rematch-form');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    rematchJob(job.id, String(data.get('title') || '').trim(), String(data.get('artist') || '').trim());
  });
}

function updateDownloadLinks(jobId, result) {
  els.result.querySelectorAll('.lyrics-actions a').forEach((link) => {
    const url = new URL(link.href, window.location.origin);
    url.searchParams.set('variant', state.variant);
    link.href = url.toString();
  });
}

function mountPlayer(root, { src, duration = 0, lyrics = false }) {
  const player = root.querySelector('.player');
  if (!player) return null;
  const audio = player.querySelector('audio');
  const playBtn = player.querySelector('.play-btn');
  const seek = player.querySelector('.seek');
  const currentLabel = player.querySelector('.time.current');
  const totalLabel = player.querySelector('.time.total');
  const scroller = root.querySelector('.lyrics-scroll');
  const lineEls = lyrics
    ? [...root.querySelectorAll('.lyric-line[data-time]')].map((element) => ({
        element,
        time: Number(element.dataset.time)
      }))
    : [];

  let total = Number(duration) || 0;
  let activeIndex = -1;
  let dragging = false;
  let destroyed = false;

  const setTotal = (value) => {
    if (!Number.isFinite(value) || value <= 0) return;
    total = value;
    seek.max = String(total);
    totalLabel.textContent = formatTime(total);
  };

  const paintSeek = () => {
    const ratio = total > 0 ? Math.min(1, audio.currentTime / total) : 0;
    seek.style.setProperty('--seek', `${ratio * 100}%`);
    if (!dragging) seek.value = String(Math.min(audio.currentTime, total || 0));
    currentLabel.textContent = formatTime(audio.currentTime);
  };

  const activate = (index) => {
    if (index === activeIndex) return;
    if (activeIndex >= 0) lineEls[activeIndex]?.element.classList.remove('is-active');
    activeIndex = index;
    const line = lineEls[index];
    if (!line) return;
    line.element.classList.add('is-active');
    if (scroller && Date.now() > state.autoScrollUntil) {
      const top =
        line.element.offsetTop - scroller.clientHeight / 2 + line.element.clientHeight / 2;
      scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  };

  const syncLyrics = () => {
    if (!lineEls.length) return;
    const time = audio.currentTime;
    let index = -1;
    for (let i = 0; i < lineEls.length; i += 1) {
      if (lineEls[i].time <= time + 0.12) index = i;
      else break;
    }
    if (index !== -1) activate(index);
  };

  const setPlaying = (playing) => {
    player.classList.toggle('is-playing', playing);
    playBtn.innerHTML = playing ? ICONS.pause : ICONS.play;
    playBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
  };

  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) setTotal(audio.duration);
    paintSeek();
  });
  audio.addEventListener('durationchange', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) setTotal(audio.duration);
  });
  audio.addEventListener('timeupdate', () => {
    paintSeek();
    syncLyrics();
  });
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => {
    setPlaying(false);
    audio.currentTime = 0;
    paintSeek();
  });
  audio.addEventListener('error', () => {
    if (!destroyed && audio.error) toast('音频加载失败，请重新提取。');
  });

  playBtn.addEventListener('click', () => {
    if (audio.paused) {
      audio.play().catch(() => toast('浏览器阻止了播放，请再点一次。'));
    } else {
      audio.pause();
    }
  });

  seek.addEventListener('pointerdown', () => {
    dragging = true;
  });
  seek.addEventListener('pointerup', () => {
    dragging = false;
  });
  seek.addEventListener('input', () => {
    if (!total) return;
    audio.currentTime = Number(seek.value);
    currentLabel.textContent = formatTime(audio.currentTime);
    const ratio = Math.min(1, Number(seek.value) / total);
    seek.style.setProperty('--seek', `${ratio * 100}%`);
    syncLyrics();
  });
  seek.addEventListener('change', () => {
    dragging = false;
  });

  lineEls.forEach(({ element, time }) => {
    const seekToLine = () => {
      audio.currentTime = time;
      paintSeek();
      activate(lineEls.findIndex((line) => line.element === element));
      audio.play().catch(() => {});
    };
    element.addEventListener('click', seekToLine);
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        seekToLine();
      }
    });
  });

  if (scroller) {
    const markManualScroll = () => {
      state.autoScrollUntil = Date.now() + 4500;
    };
    scroller.addEventListener('wheel', markManualScroll, { passive: true });
    scroller.addEventListener('touchstart', markManualScroll, { passive: true });
  }

  if (Number.isFinite(duration) && duration > 0) setTotal(duration);
  paintSeek();

  state.player = {
    destroy() {
      destroyed = true;
      try {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      } catch {
        /* no-op */
      }
    }
  };
  return state.player;
}

function destroyPlayer() {
  if (state.player?.destroy) state.player.destroy();
  state.player = null;
}

async function rematchJob(jobId, title, artist) {
  if (state.busy) return;
  state.runToken += 1;
  const token = state.runToken;
  state.busy = true;
  destroyPlayer();
  els.result.hidden = true;
  els.result.innerHTML = '';
  els.errorPanel.hidden = true;
  setProgress('重新匹配歌词', '正在用新的关键词搜索', 8);
  setBusyUI();

  try {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/rematch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, artist })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || '重新匹配失败。');
    if (state.runToken !== token) return;
    state.jobId = jobId;
    pollJob(token);
  } catch (error) {
    if (state.runToken !== token) return;
    showError(error.message);
  }
}

async function copyLyrics(result) {
  const lines = Array.isArray(result.lines) ? result.lines : [];
  const text = lines
    .map((line) => {
      const base = state.variant === 'simp' ? line.textSimp || line.text : line.text;
      if (state.translation && line.translation) return `${base}\n${line.translation}`;
      return base;
    })
    .filter(Boolean)
    .join('\n');

  if (!text) {
    toast('没有可复制的歌词。');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    toast('歌词已复制');
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      toast('歌词已复制');
    } catch {
      toast('复制失败，请手动选择歌词。');
    }
    textarea.remove();
  }
}

function bindEvents() {
  els.modeSwitch.setAttribute('role', 'tablist');
  els.tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      if (tab.dataset.mode === state.mode) return;
      clearRunState({ keepFile: false });
      applyMode(tab.dataset.mode);
      els.dropzone.focus({ preventScroll: true });
    });
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const next = els.tabs[(index + direction + els.tabs.length) % els.tabs.length];
      next.focus();
      next.click();
    });
  });

  els.dropzone.addEventListener('click', (event) => {
    if (state.busy) return;
    if (event.target.closest('#file-remove')) return;
    els.fileInput.click();
  });
  els.dropzone.addEventListener('keydown', (event) => {
    if (state.busy) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      els.fileInput.click();
    }
  });

  els.fileInput.addEventListener('change', () => {
    const file = els.fileInput.files?.[0];
    if (file) setFile(file);
    els.fileInput.value = '';
  });

  els.fileRemove.addEventListener('click', (event) => {
    event.stopPropagation();
    if (state.busy) return;
    clearRunState({ keepFile: false });
    els.startLabel.textContent = config().startLabel;
    syncStart();
    els.dropzone.focus({ preventScroll: true });
  });

  let dragDepth = 0;
  els.dropzone.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dragDepth += 1;
    if (!state.busy) els.dropzone.classList.add('is-dragging');
  });
  els.dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  els.dropzone.addEventListener('dragleave', (event) => {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) els.dropzone.classList.remove('is-dragging');
  });
  els.dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    els.dropzone.classList.remove('is-dragging');
    if (state.busy) return;
    const file = event.dataTransfer?.files?.[0];
    if (file) setFile(file);
  });

  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => event.preventDefault());

  els.bitrateButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.bitrate = Number(button.dataset.bitrate);
      els.bitrateButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-checked', String(active));
      });
    });
  });

  els.languageSelect.addEventListener('change', () => {
    state.language = els.languageSelect.value;
  });

  els.asrToggle.addEventListener('change', () => {
    state.asr = els.asrToggle.checked;
    els.asrText.textContent = state.asr ? '开启' : '关闭';
  });

  els.startBtn.addEventListener('click', startJob);
  els.resetBtn.addEventListener('click', resetWorkspace);
  els.errorReset.addEventListener('click', resetWorkspace);
}

applyMode('convert', { initial: true });
bindEvents();
syncStart();
