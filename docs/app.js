import { Converter } from './vendor/opencc/t2cn.js';
import { WhisperWasmService, convertFromFile } from './vendor/whisper/index.es.js';

const toSimplified = Converter({ from: 'tw', to: 'cn' });

const MODES = {
  convert: {
    eyebrow: 'VIDEO → AUDIO',
    hero: '把画面里的<br /><span class="accent">声音</span>，留下来。',
    copy: '一段视频，变成一份 MP3。转换在浏览器里完成，文件不经过任何服务器。',
    features: [
      ['FFMPEG.WASM', '浏览器转码'],
      ['ID3', '保留歌曲信息'],
      ['STATIC', '无需后端']
    ],
    title: '上传视频',
    step: 'STEP 01 · UPLOAD',
    hint: 'MP4 / MOV / WEBM · ≤ 120 MB',
    dzTitle: '把视频拖到这里',
    dzSub: '或 <u>点击选择文件</u> · 最大 120 MB',
    formats: ['MP4', 'MOV', 'MKV', 'WEBM'],
    accept: '.mp4,.mov,.mkv,.webm,.m4v,.avi',
    startLabel: '开始提取 MP3',
    sheet: '01',
    code: 'WASM',
    disc: 'MP4<br /><i>→</i> MP3',
    spec: 'BROWSER · LOCAL',
    tag: 'WASM / 192k',
    maxBytes: 120 * 1024 * 1024,
    extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v', 'avi'],
    notes: [
      ['WASM', 'FFmpeg 转码核心', '首次转换会加载约 32 MB 的 WebAssembly 引擎。'],
      ['LIMIT', '建议 120 MB 以内', '大文件受浏览器内存限制，移动端建议更小的文件。'],
      ['PRIVATE', '不上传服务器', '文件只在浏览器内存中处理，关闭页面即释放。']
    ]
  },
  lyrics: {
    eyebrow: 'AUDIO → LYRICS',
    hero: '让每一句<br /><span class="accent">歌词</span>，浮现。',
    copy: '从 MP3 读取内嵌歌词，再到 LRCLIB 匹配；还没有结果时，让本地 Whisper 听写。文件留在浏览器。',
    features: [
      ['TAGS', '读取内嵌歌词'],
      ['LRCLIB', '在线同步歌词'],
      ['WHISPER', '浏览器本地听写']
    ],
    title: '上传歌曲',
    step: 'STEP 02 · LYRICS',
    hint: 'MP3 / M4A / WAV · ≤ 40 MB',
    dzTitle: '把歌曲拖到这里',
    dzSub: '或 <u>点击选择文件</u> · 最大 40 MB',
    formats: ['MP3', 'M4A', 'WAV', 'FLAC'],
    accept: '.mp3,.wav,.m4a,.aac,.flac,.ogg,.oga,.opus,.wma,.aiff',
    startLabel: '开始提取歌词',
    sheet: '02',
    code: 'LYRICS',
    disc: 'MP3<br /><i>→</i> LRC',
    spec: 'STATIC · WHISPER',
    tag: 'TAGS / AI',
    maxBytes: 40 * 1024 * 1024,
    extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'wma', 'aiff'],
    notes: [
      ['TAGS', '先读内嵌标签', '读取标题、歌手、封面，以及 USLT / SYLT 歌词。'],
      ['LRCLIB', '再匹配在线歌词', '只发送歌名、歌手和时长，不上传音频。'],
      ['WHISPER', '最后本地听写', '首次使用下载约 60 MB 模型，在浏览器内完成识别。']
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
    '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M13 22.5V9l12-2.5v11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="23.5" r="3.2" stroke="currentColor" stroke-width="1.5"/><circle cx="22" cy="20.5" r="3.2" stroke="currentColor" stroke-width="1.5"/><path d="m5 5 22 22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
};

const state = {
  mode: 'convert',
  file: null,
  bitrate: 192,
  busy: false,
  runToken: 0,
  result: null,
  ffmpeg: null,
  player: null,
  objectUrls: [],
  variant: 'simp',
  autoScrollUntil: 0,
  coverUrl: '',
  audioUrl: '',
  whisper: true,
  whisperLanguage: 'zh',
  whisperService: null,
  whisperReady: false,
  whisperLoading: null
};

const $ = (selector) => document.querySelector(selector);
const els = {
  tabs: [...document.querySelectorAll('.mode-btn')],
  modeSwitch: $('.mode-switch'),
  intro: $('.intro'),
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
  bitrateBlock: $('#bitrate-block'),
  whisperBlock: $('#whisper-block'),
  whisperToggle: $('#whisper-toggle'),
  whisperToggleText: $('#whisper-toggle-text'),
  whisperLanguageBlock: $('#whisper-language-block'),
  whisperLanguage: $('#whisper-language'),
  bitrateButtons: [...document.querySelectorAll('[data-bitrate]')],
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

const config = () => MODES[state.mode];

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

function stripExtension(name) {
  return String(name || '').replace(/\.[^.]+$/, '');
}

function safeFilename(name) {
  return String(name || 'sound-isle')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 110) || 'sound-isle';
}

function toast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 2400);
}

function setPaperStatus(kind) {
  const labels = { ready: 'READY', busy: 'PROCESSING', done: 'DONE', check: 'CHECK' };
  els.paperStatus.classList.toggle('is-busy', kind === 'busy');
  els.paperStatus.classList.toggle('is-done', kind === 'done');
  els.paperStatus.classList.toggle('is-error', kind === 'check');
  els.paperStatus.innerHTML = `<i></i> ${labels[kind] || 'READY'}`;
}

function trackUrl(url) {
  state.objectUrls.push(url);
  return url;
}

function revokeUrls() {
  for (const url of state.objectUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* no-op */
    }
  }
  state.objectUrls = [];
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
  els.fileInput.accept = cfg.accept;
  els.dropzone.setAttribute('aria-label', `选择或拖入${cfg.title.replace('上传', '')}文件`);
  els.bitrateBlock.hidden = mode !== 'convert';
  els.whisperBlock.hidden = mode !== 'lyrics';
  syncWhisperUI();
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
  setPaperStatus('ready');
  syncStart();

  if (!initial) {
    els.intro.classList.remove('is-swapping');
    void els.intro.offsetWidth;
    els.intro.classList.add('is-swapping');
  }
}

function syncStart() {
  const cfg = config();
  if (state.busy && document.activeElement === els.startBtn) els.startBtn.blur();
  els.startBtn.disabled = !state.file || state.busy;
  els.startBtn.classList.toggle('is-secondary', Boolean(state.result));
  els.startLabel.textContent = state.busy ? '浏览器处理中…' : state.result ? '重新提取一次' : cfg.startLabel;
  els.dropzone.setAttribute('aria-disabled', String(state.busy));
  els.fileRemove.disabled = state.busy;
}

function syncWhisperUI() {
  els.whisperToggle.checked = state.whisper;
  els.whisperToggleText.textContent = state.whisper ? '开启' : '关闭';
  els.whisperLanguage.value = state.whisperLanguage;
  els.whisperLanguageBlock.hidden = state.mode !== 'lyrics' || !state.whisper;
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

function destroyPlayer() {
  if (state.player?.destroy) state.player.destroy();
  state.player = null;
}

function clearRunState({ keepFile = false, terminateEngine = true } = {}) {
  state.runToken += 1;
  state.busy = false;
  if (terminateEngine && state.ffmpeg) {
    try {
      state.ffmpeg.terminate();
    } catch {
      /* no-op */
    }
    state.ffmpeg = null;
  }
  destroyPlayer();
  revokeUrls();
  state.result = null;
  state.variant = 'simp';
  state.autoScrollUntil = 0;
  state.coverUrl = '';
  state.audioUrl = '';
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
  stopBusy();
  els.progressPanel.hidden = true;
  els.notes.hidden = true;
  els.errorPanel.hidden = false;
  els.errorMessage.textContent = message || '处理没有完成，请重试。';
  setPaperStatus('check');
  els.startLabel.textContent = '重试';
  syncStart();
  els.errorPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function stopBusy() {
  state.busy = false;
  syncStart();
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

function setFile(file) {
  if (state.busy) return;
  const cfg = config();
  const extension = fileExtension(file.name);
  if (!cfg.extensions.includes(extension)) {
    clearRunState({ keepFile: false });
    showError(`这个工具暂不支持 .${extension || '未知'} 格式。请选择 ${cfg.formats.join(' / ')} 文件。`);
    return;
  }
  if (file.size > cfg.maxBytes) {
    clearRunState({ keepFile: false });
    showError(`文件太大了，请选择 ${formatBytes(cfg.maxBytes)} 以内的文件。`);
    return;
  }
  if (!file.size) {
    clearRunState({ keepFile: false });
    showError('这个文件是空的，请换一个文件。');
    return;
  }

  clearRunState({ keepFile: true, terminateEngine: false });
  state.file = file;
  els.dropzone.classList.add('is-selected');
  els.dzDefault.hidden = true;
  els.dzFile.hidden = false;
  els.selectedName.textContent = file.name;
  els.selectedMeta.textContent = `${extension.toUpperCase()} · ${formatBytes(file.size)}`;
  els.errorPanel.hidden = true;
  setPaperStatus('ready');
  syncStart();
  els.startBtn.focus({ preventScroll: true });
}

function getMediaDuration(src) {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      audio.removeAttribute('src');
      audio.load();
      resolve(value);
    };
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => {
      done(Number.isFinite(audio.duration) ? audio.duration : 0);
    });
    audio.addEventListener('error', () => done(0));
    setTimeout(() => done(Number.isFinite(audio.duration) ? audio.duration : 0), 5000);
    audio.src = src;
  });
}

/* ------------------------------------------------------------------ */
/* MP4 -> MP3 via ffmpeg.wasm                                          */
/* ------------------------------------------------------------------ */

async function ensureFFmpeg(token) {
  if (!window.FFmpegWASM?.FFmpeg) throw new Error('转码引擎没有加载，请刷新页面重试。');
  if (!state.ffmpeg) {
    const engine = new FFmpegWASM.FFmpeg();
    engine.on('log', ({ message }) => {
      if (state.busy && /error|invalid|failed/i.test(message)) console.warn(message);
    });
    engine.on('progress', ({ progress }) => {
      if (token !== state.runToken || !state.busy) return;
      const ratio = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
      setProgress('浏览器转码中', `已完成 ${Math.round(ratio * 100)}%`, 48 + ratio * 48);
    });
    state.ffmpeg = engine;
  }
  if (!state.ffmpeg.loaded) {
    const base = new URL('./vendor/ffmpeg/', location.href).href;
    await state.ffmpeg.load({
      coreURL: `${base}ffmpeg-core.js`,
      wasmURL: `${base}ffmpeg-core.wasm`
    });
  }
  return state.ffmpeg;
}

async function convertFile(file, token) {
  setProgress('加载转码引擎', '首次使用会加载约 32 MB 的 WebAssembly 核心', 6);
  const engine = await ensureFFmpeg(token);
  if (token !== state.runToken) return;

  const extension = fileExtension(file.name) || 'mp4';
  const inputName = `input.${extension}`;
  const outputName = `${safeFilename(stripExtension(file.name)) || 'sound-isle'}.mp3`;
  let inputWritten = false;

  try {
    setProgress('准备视频', '正在把文件写入浏览器内存', 24);
    await engine.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
    inputWritten = true;
    if (token !== state.runToken) return;

    setProgress('提取并编码音轨', `libmp3lame · ${state.bitrate} kbps`, 42);
    await engine.exec([
      '-i',
      inputName,
      '-vn',
      '-c:a',
      'libmp3lame',
      '-b:a',
      `${state.bitrate}k`,
      '-id3v2_version',
      '3',
      outputName
    ]);
    if (token !== state.runToken) return;

    const data = await engine.readFile(outputName);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (!bytes.length) throw new Error('转换没有生成有效的 MP3 文件。');

    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const audioUrl = trackUrl(URL.createObjectURL(blob));
    const duration = await getMediaDuration(audioUrl);
    if (token !== state.runToken) return;

    const result = {
      kind: 'audio',
      title: stripExtension(file.name) || 'sound-isle',
      artist: '',
      album: '',
      duration,
      bitrate: state.bitrate,
      size: blob.size,
      outputName,
      audioUrl
    };
    finish(result);
  } finally {
    if (inputWritten) await engine.deleteFile(inputName).catch(() => {});
    await engine.deleteFile(outputName).catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* Lyrics: embedded tags + LRCLIB                                     */
/* ------------------------------------------------------------------ */

function readTags(file) {
  return new Promise((resolve) => {
    if (!window.jsmediatags?.read) {
      resolve(null);
      return;
    }
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      window.jsmediatags.read(file, {
        onSuccess: (tag) => done(tag.tags || {}),
        onError: () => done(null)
      });
    } catch {
      done(null);
    }
    setTimeout(() => done(null), 8000);
  });
}

function parseNameHints(name) {
  const base = stripExtension(name)
    .replace(/^\s*\d{1,3}[.)\s_-]+/, '')
    .replace(/\s*[\[(][^\])]*[\])]\s*$/g, '')
    .replace(/_/g, ' ')
    .trim();
  for (const separator of [' - ', ' – ', ' — ', '－']) {
    const index = base.indexOf(separator);
    if (index > 0) {
      const left = base.slice(0, index).trim();
      const right = base.slice(index + separator.length).trim();
      if (left && right) {
        return { title: right, artist: left, altTitle: left, altArtist: right };
      }
    }
  }
  return { title: base, artist: '', altTitle: '', altArtist: '' };
}

function normalizeForMatch(input = '') {
  return String(input)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\([^)]*(?:feat|ft|live|remix|version|版|伴奏|cover)[^)]*\)/gi, ' ')
    .replace(/\[[^\]]*(?:feat|ft|live|remix|version|版|伴奏|cover)[^\]]*\]/gi, ' ')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function bigramSimilarity(a = '', b = '') {
  const left = normalizeForMatch(a);
  const right = normalizeForMatch(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    const ratio = Math.min(left.length, right.length) / Math.max(left.length, right.length);
    return 0.82 + ratio * 0.18;
  }
  const grams = (value) => {
    const chars = [...value];
    if (chars.length === 1) return [chars[0]];
    const set = new Set();
    for (let i = 0; i < chars.length - 1; i += 1) set.add(chars[i] + chars[i + 1]);
    return [...set];
  };
  const aGrams = grams(left);
  const bGrams = new Set(grams(right));
  if (!aGrams.length || !bGrams.size) return 0;
  let hits = 0;
  for (const gram of aGrams) if (bGrams.has(gram)) hits += 1;
  const dice = (2 * hits) / (aGrams.length + bGrams.size);
  const charSet = new Set([...right]);
  const charScore = [...new Set([...left])].filter((char) => charSet.has(char)).length /
    Math.max(new Set([...left]).size, charSet.size);
  return dice * 0.7 + charScore * 0.3;
}

function artistSimilarity(localArtist = '', candidateArtist = '') {
  if (!localArtist || !candidateArtist) return 0.5;
  const split = (value) =>
    String(value)
      .split(/\s*(?:\/|,|&|、|;|\bfeat\.?\b|\bft\.?\b)\s*/i)
      .map(normalizeForMatch)
      .filter(Boolean);
  const locals = split(localArtist);
  const candidates = split(candidateArtist);
  let best = 0;
  for (const a of locals) {
    for (const b of candidates) {
      if (a === b) best = Math.max(best, 1);
      else if (a.includes(b) || b.includes(a)) best = Math.max(best, 0.88);
      else best = Math.max(best, bigramSimilarity(a, b));
    }
  }
  return best;
}

function cleanLyricLine(line = '') {
  return String(line)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[-–—]\s*/, '')
    .trim();
}

function parseLrc(raw = '') {
  const text = String(raw).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const meta = {};
  const timed = [];
  const plain = [];
  const stampRe = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const metaMatch = line.match(/^\[([a-zA-Z]+):(.*)\]$/);
    if (metaMatch) {
      const key = metaMatch[1].toLowerCase();
      if (['ti', 'ar', 'al', 'by'].includes(key)) meta[key] = metaMatch[2].trim();
      continue;
    }
    const stamps = [...line.matchAll(stampRe)];
    if (!stamps.length) {
      plain.push(cleanLyricLine(line.replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, '')));
      continue;
    }
    const content = cleanLyricLine(
      line
        .replace(stampRe, '')
        .replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, '')
    );
    if (!content) continue;
    for (const stamp of stamps) {
      const fractionRaw = stamp[3] || '0';
      const time =
        Number(stamp[1]) * 60 +
        Number(stamp[2]) +
        Number(fractionRaw) / 10 ** fractionRaw.length;
      timed.push({ time: Number(time.toFixed(2)), text: content });
    }
  }
  if (timed.length) {
    timed.sort((a, b) => a.time - b.time);
    return { synced: true, lines: timed, plainText: timed.map((line) => line.text).join('\n'), meta };
  }
  return {
    synced: false,
    lines: plain.filter(Boolean).map((text) => ({ time: null, text })),
    plainText: plain.filter(Boolean).join('\n'),
    meta
  };
}

function lrcTimestamp(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${(total % 60).toFixed(2).padStart(5, '0')}`;
}

function formatLrc(result) {
  const meta = [
    result.title ? `[ti:${result.title}]` : '',
    result.artist ? `[ar:${result.artist}]` : '',
    result.album ? `[al:${result.album}]` : '',
    '[by:Sound Isle · GitHub Pages]'
  ].filter(Boolean);
  const body = (result.lines || []).map((line) =>
    Number.isFinite(line.time) ? `[${lrcTimestamp(line.time)}]${line.text}` : line.text
  );
  return [...meta, '', ...body].join('\n').trim() + '\n';
}

function plainLyrics(result) {
  return (result.lines || []).map((line) => line.text).filter(Boolean).join('\n').trim();
}

function addSimplified(lines) {
  let changed = false;
  const output = lines.map((line) => {
    const simplified = toSimplified(line.text || '');
    if (simplified !== line.text) changed = true;
    return { ...line, textSimp: simplified };
  });
  return { lines: output, hasVariant: changed };
}

async function searchLrclib(meta, duration) {
  const queries = [];
  if (meta.title && meta.artist) queries.push(`${meta.title} ${meta.artist}`);
  if (meta.title) queries.push(meta.title);
  if (queries.length === 1 && meta.artist) queries.push(`${meta.artist} ${meta.title}`);
  const unique = [...new Set(queries.map((item) => item.trim()).filter((item) => item.length > 1))].slice(0, 3);
  if (!unique.length) return null;

  for (const query of unique) {
    let data = null;
    try {
      const response = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) continue;
      data = await response.json();
    } catch {
      continue;
    }
    if (!Array.isArray(data) || !data.length) continue;

    const aliases = meta.aliases?.length ? meta.aliases : [meta.title];
    const artistAliases = meta.artistAliases?.length ? meta.artistAliases : [meta.artist].filter(Boolean);
    const ranked = [];
    for (const item of data) {
      const title = item.trackName || item.name || '';
      const artist = item.artistName || '';
      const itemDuration = Number(item.duration) || 0;
      if (!title) continue;
      const titleSim = Math.max(0, ...aliases.map((alias) => bigramSimilarity(alias, title)));
      const artistSim = artistAliases.length
        ? Math.max(
            0,
            ...artistAliases.flatMap((alias) => [
              artistSimilarity(alias, artist),
              bigramSimilarity(alias, artist)
            ])
          )
        : 0.62;
      const diff = duration > 0 && itemDuration > 0 ? Math.abs(duration - itemDuration) : null;
      const durationScore = diff == null ? 0.55 : Math.max(0, 1 - diff / 150);
      let score = titleSim * 0.58 + artistSim * 0.27 + durationScore * 0.15;
      if (item.syncedLyrics) score += 0.025;
      const exactTitle = aliases.some(
        (alias) => normalizeForMatch(alias) === normalizeForMatch(title)
      );
      const exactArtist = artistAliases.some(
        (alias) => normalizeForMatch(alias) === normalizeForMatch(artist)
      );
      if (titleSim < 0.55) continue;
      if (!exactTitle && titleSim < 0.72) continue;
      if (artistAliases.length && artistSim < 0.32) continue;
      if (diff != null && diff > 120 && !(exactTitle && exactArtist)) continue;
      if (!item.syncedLyrics && !item.plainLyrics) continue;
      ranked.push({ ...item, title, artist, album: item.albumName || '', score });
    }
    ranked.sort((a, b) => b.score - a.score);
    if (ranked[0]) return ranked[0];
  }
  return null;
}

function buildLyricsResult({ meta, duration, coverUrl, audioUrl, parsed, source, sourceLabel, display }) {
  let lines = parsed.lines
    .filter((line) => line.text)
    .map((line) => ({ time: Number.isFinite(line.time) ? line.time : null, text: line.text }));
  const simplified = addSimplified(lines);
  const synced = Boolean(parsed.synced && simplified.lines.some((line) => Number.isFinite(line.time)));
  return {
    found: true,
    title: display?.title || meta.title,
    artist: display?.artist || meta.artist,
    album: display?.album || meta.album,
    duration,
    coverUrl,
    audioUrl,
    source,
    sourceLabel,
    synced,
    lines: simplified.lines,
    hasVariant: simplified.hasVariant,
    plainText: plainLyrics({ lines }),
    warning:
      source === 'lrclib'
        ? '歌词来自 LRCLIB 在线歌词库。静态版不会上传音频，只发送了歌名、歌手与时长。'
        : source === 'whisper'
          ? '这段歌词由浏览器本地 Whisper 模型听写，唱歌场景可能有错字或漏句，建议对照原曲校对。'
          : ''
  };
}

/* ------------------------------------------------------------------ */
/* Local Whisper (browser)                                             */
/* ------------------------------------------------------------------ */

const WHISPER_MODEL_PARTS = 4;
const WHISPER_MODEL_BYTES = 59707625;

function openModelDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('sound-isle-whisper', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('models')) {
        request.result.createObjectStore('models');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCachedModel() {
  try {
    const db = await openModelDB();
    return await new Promise((resolve) => {
      const tx = db.transaction('models', 'readonly');
      const request = tx.objectStore('models').get('base-q5_1');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function cacheModel(bytes) {
  try {
    const db = await openModelDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('models', 'readwrite');
      tx.objectStore('models').put(bytes, 'base-q5_1');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Private mode / quota can prevent caching; model still works from HTTP cache.
  }
}

async function loadWhisperModel(onProgress) {
  const cached = await readCachedModel();
  if (cached?.length === WHISPER_MODEL_BYTES) {
    onProgress(70, '已从浏览器缓存读取 Whisper 模型');
    return new Uint8Array(cached);
  }

  const localModelBase = new URL('./models/', location.href).href;
  const isLocalhost = ['127.0.0.1', 'localhost', '::1'].includes(location.hostname);
  const repos = isLocalhost
    ? [localModelBase]
    : [
        'https://cdn.jsdelivr.net/gh/zhuozihan131226/sound-isle@main/docs/models/',
        'https://fastly.jsdelivr.net/gh/zhuozihan131226/sound-isle@main/docs/models/',
        'https://raw.githubusercontent.com/zhuozihan131226/sound-isle/main/docs/models/',
        localModelBase
      ];

  let lastError = null;
  for (const base of repos) {
    try {
      const chunks = [];
      let received = 0;
      for (let part = 1; part <= WHISPER_MODEL_PARTS; part += 1) {
        const url = `${base}ggml-base-q5_1.bin.part${part}`;
        const response = await fetch(url, {
          cache: 'force-cache',
          signal: AbortSignal.timeout(isLocalhost ? 120000 : 30000)
        });
        if (!response.ok) throw new Error(`模型分片 ${part} 加载失败（${response.status}）`);
        const buffer = new Uint8Array(await response.arrayBuffer());
        chunks.push(buffer);
        received += buffer.length;
        const percent = Math.min(70, 56 + Math.round((received / WHISPER_MODEL_BYTES) * 14));
        onProgress(
          percent,
          `正在下载 Whisper 模型 ${Math.round((received / WHISPER_MODEL_BYTES) * 100)}%`
        );
      }

      const model = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        model.set(chunk, offset);
        offset += chunk.length;
      }
      if (model.length !== WHISPER_MODEL_BYTES) {
        throw new Error('Whisper 模型文件不完整，请刷新页面重试。');
      }
      await cacheModel(model);
      return model;
    } catch (error) {
      lastError = error;
      onProgress(57, '当前模型镜像不可用，正在尝试下一个来源…');
    }
  }
  throw lastError || new Error('Whisper 模型加载失败，请刷新页面重试。');
}

async function ensureWhisper(onProgress) {
  if (state.whisperReady && state.whisperService) return state.whisperService;
  if (state.whisperLoading) return state.whisperLoading;

  state.whisperLoading = (async () => {
    if (!window.isSecureContext) {
      throw new Error('本地 AI 需要 HTTPS 或 localhost 环境。');
    }
    if (!window.crossOriginIsolated) {
      throw new Error('本地 AI 运行环境尚未就绪，请刷新页面后再试。');
    }

    const service = state.whisperService || new WhisperWasmService({ logLevel: 2 });
    if (!(await service.checkWasmSupport())) {
      throw new Error('当前浏览器不支持 WebAssembly，无法运行本地 AI。');
    }

    const model = await loadWhisperModel(onProgress);
    onProgress(72, '正在初始化本地 Whisper 引擎');
    await service.initModel(model);
    state.whisperService = service;
    state.whisperReady = true;
    return service;
  })();

  try {
    return await state.whisperLoading;
  } finally {
    if (!state.whisperReady) state.whisperLoading = null;
  }
}

async function transcribeInBrowser(file, token) {
  if (!state.whisper) return null;
  if (!window.crossOriginIsolated) {
    throw new Error('本地 AI 需要跨源隔离环境。页面正在初始化，请刷新后再试。');
  }

  const service = await ensureWhisper((percent, detail) => {
    if (token === state.runToken) setProgress('加载本地 Whisper', detail, percent);
  });
  if (token !== state.runToken) return null;

  setProgress('解码音频', '正在准备 16 kHz 单声道音频', 74);
  const { audioData, audioInfo } = await convertFromFile(file, { normalize: true });
  if (!audioData?.length) throw new Error('无法从文件中解码出音频。');
  if (token !== state.runToken) return null;

  const sampleRate = audioInfo.sampleRate || 16000;
  const chunkSize = Math.floor(sampleRate * 25);
  const totalChunks = Math.max(1, Math.ceil(audioData.length / chunkSize));
  const lines = [];

  for (let index = 0; index < totalChunks; index += 1) {
    if (token !== state.runToken) return null;
    const startSample = index * chunkSize;
    const endSample = Math.min(audioData.length, startSample + chunkSize);
    const offset = startSample / sampleRate;
    const percent = 78 + Math.round((index / totalChunks) * 18);
    setProgress('Whisper 本地听写', `第 ${index + 1} / ${totalChunks} 段`, percent);

    const result = await service.transcribe(
      audioData.slice(startSample, endSample),
      undefined,
      {
        language: state.whisperLanguage,
        threads: 4,
        translate: false
      }
    );

    for (const segment of result.segments || []) {
      let text = String(segment.text || '')
        .replace(/\[(?:music|音乐|掌声|applause|blank_audio)\]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text || /^[\s♪]+$/.test(text)) continue;
      const time = Math.max(0, offset + Number(segment.timeStart) / 1000);
      const previous = lines[lines.length - 1];
      if (previous && previous.text === text && time - previous.time < 1.2) continue;
      lines.push({ time: Number(time.toFixed(2)), text });
    }
  }

  if (!lines.length) throw new Error('Whisper 没有识别到清晰的人声。');
  setProgress('整理 AI 歌词', '正在生成时间轴', 97);
  return { lines, duration: audioInfo.duration, language: state.whisperLanguage };
}

async function runLyrics(file, token, overrides = {}) {
  setProgress('读取歌曲信息', '正在读取标题、歌手与内嵌歌词', 8);
  const tags = await readTags(file);
  if (token !== state.runToken) return;

  const parsedName = parseNameHints(file.name);
  const title = overrides.title?.trim() || tags?.title || parsedName.title || stripExtension(file.name);
  const artist = overrides.artist?.trim() || tags?.artist || parsedName.artist || '';
  const album = tags?.album || '';
  const aliases = [...new Set([title, parsedName.title, parsedName.altTitle].filter(Boolean))];
  const artistAliases = [...new Set([artist, parsedName.artist, parsedName.altArtist].filter(Boolean))];
  const meta = { title, artist, album, aliases, artistAliases };

  let coverUrl = state.coverUrl;
  if (!coverUrl && tags?.picture?.data) {
    const bytes = new Uint8Array(tags.picture.data);
    const type = tags.picture.format || 'image/jpeg';
    coverUrl = trackUrl(URL.createObjectURL(new Blob([bytes], { type })));
    state.coverUrl = coverUrl;
  }

  const embeddedText =
    typeof tags?.lyrics === 'string'
      ? tags.lyrics
      : tags?.lyrics?.text || tags?.lyrics?.lyrics || '';
  if (!overrides.skipEmbedded && embeddedText.trim()) {
    setProgress('解析内嵌歌词', '已找到文件内的歌词标签', 55);
    const parsed = parseLrc(embeddedText);
    if (parsed.lines.length) {
      const audioUrl = state.audioUrl || trackUrl(URL.createObjectURL(file));
      state.audioUrl = audioUrl;
      const duration = await getMediaDuration(audioUrl);
      const result = buildLyricsResult({
        meta,
        duration,
        coverUrl,
        audioUrl,
        parsed,
        source: 'embedded',
        sourceLabel: '内嵌歌词',
        display: { title, artist, album }
      });
      finish(result);
      return;
    }
  }

  const audioUrl = state.audioUrl || trackUrl(URL.createObjectURL(file));
  state.audioUrl = audioUrl;
  const duration = await getMediaDuration(audioUrl);

  if (title || artist) {
    setProgress('搜索在线歌词库', `正在匹配「${title || artist}」`, 38);
    const match = await searchLrclib(meta, duration);
    if (token !== state.runToken) return;

    if (match) {
      setProgress('整理歌词', '正在生成时间轴与简体版本', 86);
      const parsed = parseLrc(match.syncedLyrics || match.plainLyrics || '');
      if (parsed.lines.length) {
        const result = buildLyricsResult({
          meta,
          duration,
          coverUrl,
          audioUrl,
          parsed,
          source: 'lrclib',
          sourceLabel: 'LRCLIB 歌词库',
          display: { title: match.title, artist: match.artist, album: match.album }
        });
        finish(result);
        return;
      }
    }
  }

  let aiError = '';
  if (state.whisper) {
    try {
      const asr = await transcribeInBrowser(file, token);
      if (token !== state.runToken) return;
      if (asr?.lines?.length) {
        const parsed = {
          synced: true,
          lines: asr.lines,
          plainText: asr.lines.map((line) => line.text).join('\n'),
          meta: {}
        };
        const result = buildLyricsResult({
          meta,
          duration: asr.duration || duration,
          coverUrl,
          audioUrl,
          parsed,
          source: 'whisper',
          sourceLabel: '本地 Whisper 听写',
          display: { title, artist, album }
        });
        finish(result);
        return;
      }
      aiError = 'Whisper 没有识别到清晰的人声。';
    } catch (error) {
      aiError = error.message || '本地 AI 听写失败。';
    }
  }

  finish({
    found: false,
    title: title || stripExtension(file.name),
    artist,
    album,
    duration,
    coverUrl,
    audioUrl,
    reason: aiError
      ? `内嵌标签和 LRCLIB 都没有找到匹配歌词，本地 AI 听写也没有完成：${aiError}`
      : state.whisper
        ? '内嵌标签和 LRCLIB 都没有找到匹配歌词，Whisper 没有识别到清晰的人声。'
        : '内嵌标签和 LRCLIB 都没有找到匹配歌词。本地 AI 听写已关闭，可以开启后重试。',
    canRematch: true
  });
}

/* ------------------------------------------------------------------ */
/* Results and player                                                  */
/* ------------------------------------------------------------------ */

function finish(result) {
  state.busy = false;
  state.result = result;
  els.progressPanel.hidden = true;
  els.errorPanel.hidden = true;
  setPaperStatus('done');
  syncStart();
  renderResult(result);
}

function renderResult(result) {
  destroyPlayer();
  state.autoScrollUntil = 0;
  if (result.kind === 'audio') {
    els.result.innerHTML = audioResultMarkup(result);
  } else if (result.found) {
    els.result.innerHTML = lyricsResultMarkup(result);
  } else {
    els.result.innerHTML = missResultMarkup(result);
  }
  els.result.hidden = false;
  els.notes.hidden = true;
  wireCovers();
  wireResultActions(result);
  els.result.tabIndex = -1;
  els.result.focus({ preventScroll: true });
  els.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function playerMarkup({ src, title, subtitle, duration, coverUrl, badge, compact = false }) {
  const cover = coverUrl ? `<img src="${escapeHtml(coverUrl)}" alt="" data-cover />` : ICONS.wave;
  return `
    <div class="player${compact ? ' compact' : ''}">
      <div class="player-art">${cover}<span class="art-badge">${escapeHtml(badge)}</span></div>
      <div class="player-body">
        <div class="player-kicker">NOW PLAYING · BROWSER AUDIO</div>
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

function audioResultMarkup(result) {
  return `
    <article class="result-card audio-result">
      <div class="result-head">
        <div>
          <div class="result-kicker"><b>✓ DONE</b> BROWSER OUTPUT / MP3</div>
          <h2>${escapeHtml(result.title)}</h2>
        </div>
        <div class="result-actions">
          <a class="action-btn primary" href="${escapeHtml(result.audioUrl)}" download="${escapeHtml(result.outputName)}">
            ${ICONS.download}<span class="action-label">下载 MP3</span>
          </a>
        </div>
      </div>
      ${playerMarkup({
        src: result.audioUrl,
        title: result.title,
        subtitle: '浏览器本地转码 · 未上传',
        duration: result.duration,
        badge: 'MP3'
      })}
      <div class="result-stats">
        <div class="stat"><span>DURATION</span><strong>${formatTime(result.duration)}</strong></div>
        <div class="stat"><span>BITRATE</span><strong>${escapeHtml(result.bitrate)} kbps</strong></div>
        <div class="stat"><span>FILE SIZE</span><strong>${formatBytes(result.size)}</strong></div>
      </div>
    </article>`;
}

function lyricsResultMarkup(result) {
  const lines = (result.lines || []).filter((line) => line.text);
  const shown = lines.map((line, index) => {
    const time = Number.isFinite(line.time) ? line.time : null;
    const text = state.variant === 'simp' ? line.textSimp || line.text : line.text;
    return `
      <div class="lyric-line${time !== null ? '' : ' is-static'}"${
        time !== null ? ` data-time="${time}" data-index="${index}" role="button" tabindex="0"` : ''
      }>
        ${time !== null ? `<span class="lyric-time">${formatTime(time)}</span>` : ''}
        <span class="lyric-body">
          <span class="lyric-text" data-orig="${escapeHtml(line.text)}" data-simp="${escapeHtml(
            line.textSimp || line.text
          )}">${escapeHtml(text)}</span>
        </span>
      </div>`;
  }).join('');

  return `
    <article class="result-card lyrics-card" id="lyrics-card">
      <div class="result-head">
        <div class="lyrics-identity">
          <div class="cover">
            ${ICONS.wave}
            ${result.coverUrl ? `<img src="${escapeHtml(result.coverUrl)}" alt="" data-cover />` : ''}
          </div>
          <div class="lyrics-title-wrap">
            <span class="source-chip" data-source="${escapeHtml(result.source || 'lrclib')}"><i></i>${escapeHtml(
              result.sourceLabel || 'LRCLIB 歌词库'
            )}</span>
            <h2>${escapeHtml(result.title || '未知歌曲')}</h2>
            <p class="lyrics-sub">${escapeHtml(
              [result.artist, result.album].filter(Boolean).join(' · ') || '未知歌手'
            )} · ${formatTime(result.duration)}</p>
          </div>
        </div>
        <div class="lyrics-actions">
          <button class="icon-btn" type="button" data-action="copy" aria-label="复制歌词" title="复制歌词">${ICONS.copy}</button>
          <button class="icon-btn is-wide" type="button" data-download="lrc" aria-label="下载 LRC" title="下载 LRC">${ICONS.download}<span>LRC</span></button>
          <button class="icon-btn" type="button" data-download="txt" aria-label="下载 TXT" title="下载 TXT">TXT</button>
        </div>
      </div>

      ${playerMarkup({
        src: result.audioUrl,
        title: result.title || '未知歌曲',
        subtitle: [result.artist, result.album].filter(Boolean).join(' · ') || '浏览器本地音频',
        duration: result.duration,
        coverUrl: result.coverUrl,
        badge: 'AUDIO',
        compact: true
      })}

      ${
        result.warning
          ? `<div class="warning-strip">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3 18 17H2L10 3Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M10 8v4.2M10 14.6v.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        <span>${escapeHtml(result.warning)}</span>
      </div>`
          : ''
      }

      <div class="lyrics-toolbar">
        ${
          result.hasVariant
            ? `<div class="variant-toggle" role="group" aria-label="歌词字形">
                <button type="button" data-variant="simp" class="is-active">简体</button>
                <button type="button" data-variant="orig">原文</button>
              </div>`
            : ''
        }
        <span class="lyrics-hint">${result.synced ? '点击任意一句，跳转到对应时间' : '纯文本歌词'}</span>
      </div>

      <div class="lyrics-scroll" id="lyrics-scroll">
        <div class="lyrics-lines">${shown || '<div class="lyrics-empty">这段音频没有可显示的歌词内容。</div>'}</div>
      </div>

      <div class="lyrics-footer">
        <span>${escapeHtml(result.sourceLabel || 'LRCLIB 歌词库')} · ${result.synced ? 'LRC 时间轴已同步' : '未提供时间轴'}</span>
        <span>${lines.length} LINES / ${formatTime(result.duration)}</span>
      </div>
    </article>`;
}

function missResultMarkup(result) {
  return `
    <article class="miss-card">
      <div class="miss-top">
        <div class="miss-icon">${ICONS.musicOff}</div>
        <div>
          <div class="miss-kicker">NO MATCH · STATIC LYRICS</div>
          <h2>这次没有抓到歌词。</h2>
          <p>${escapeHtml(result.reason || '没有找到匹配歌词。')}</p>
        </div>
      </div>
      ${
        result.canRematch
          ? `<form class="rematch-form" id="rematch-form">
              <span class="rematch-label">补全歌曲信息，再找一次</span>
              <div class="rematch-fields">
                <label class="field"><input name="title" type="text" placeholder="歌名" value="${escapeHtml(
                  result.title || ''
                )}" maxlength="120" aria-label="歌名" /></label>
                <label class="field"><input name="artist" type="text" placeholder="歌手" value="${escapeHtml(
                  result.artist || ''
                )}" maxlength="120" aria-label="歌手" /></label>
                <button class="rematch-submit" type="submit">重新匹配</button>
              </div>
              <p class="miss-tip">静态版已尝试内嵌标签、LRCLIB 和本地 Whisper。如果仍然失败，可能是纯音乐或歌声识别困难；可以补全歌名、歌手后重试。</p>
            </form>`
          : ''
      }
    </article>`;
}

function wireCovers() {
  els.result.querySelectorAll('img[data-cover]').forEach((image) => {
    image.addEventListener('error', () => image.remove());
  });
}

function wireResultActions(result) {
  if (result.kind === 'audio') {
    mountPlayer(els.result, { src: result.audioUrl, duration: result.duration });
    return;
  }
  if (!result.found) {
    const form = els.result.querySelector('#rematch-form');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      retryLyrics(String(data.get('title') || '').trim(), String(data.get('artist') || '').trim());
    });
    return;
  }

  mountPlayer(els.result, { src: result.audioUrl, duration: result.duration, lyrics: true });
  els.result.querySelector('[data-action="copy"]')?.addEventListener('click', () => copyLyrics(result));
  els.result.querySelectorAll('[data-download]').forEach((button) => {
    button.addEventListener('click', () => downloadLyrics(result, button.dataset.download));
  });

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
    });
  });
}

function mountPlayer(root, { src, duration = 0, lyrics = false }) {
  const player = root.querySelector('.player');
  if (!player) return;
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
      const top = line.element.offsetTop - scroller.clientHeight / 2 + line.element.clientHeight / 2;
      scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  };

  const syncLyrics = () => {
    if (!lineEls.length) return;
    let index = -1;
    for (let i = 0; i < lineEls.length; i += 1) {
      if (lineEls[i].time <= audio.currentTime + 0.12) index = i;
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
    if (!destroyed) toast('音频加载失败，请重新提取。');
  });

  playBtn.addEventListener('click', () => {
    if (audio.paused) audio.play().catch(() => toast('浏览器阻止了播放，请再点一次。'));
    else audio.pause();
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
    paintSeek();
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

  if (duration > 0) setTotal(duration);
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
}

function copyLyrics(result) {
  const text = (result.lines || [])
    .map((line) => (state.variant === 'simp' ? line.textSimp || line.text : line.text))
    .filter(Boolean)
    .join('\n');
  if (!text) {
    toast('没有可复制的歌词。');
    return;
  }
  navigator.clipboard
    ?.writeText(text)
    .then(() => toast('歌词已复制'))
    .catch(() => {
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
    });
}

function downloadLyrics(result, format) {
  const display = {
    ...result,
    lines: (result.lines || []).map((line) => ({
      ...line,
      text: state.variant === 'simp' ? line.textSimp || line.text : line.text
    }))
  };
  const text = format === 'txt' ? plainLyrics(display) + '\n' : formatLrc(display);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilename([display.artist, display.title].filter(Boolean).join(' - ') || 'lyrics')}.${format}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function retryLyrics(title, artist) {
  if (!state.file || state.busy) return;
  if (!title && !artist) {
    toast('请至少填写歌名或歌手。');
    return;
  }
  state.runToken += 1;
  const token = state.runToken;
  state.busy = true;
  state.result = null;
  destroyPlayer();
  els.result.hidden = true;
  els.result.innerHTML = '';
  els.errorPanel.hidden = true;
  setProgress('重新匹配歌词', '正在用新的歌曲信息搜索 LRCLIB', 25);
  syncStart();
  try {
    await runLyrics(state.file, token, { title, artist, skipEmbedded: true });
  } catch (error) {
    if (token === state.runToken) showError(error.message || '重新匹配失败。');
  }
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

async function startJob() {
  if (!state.file || state.busy) return;
  state.runToken += 1;
  const token = state.runToken;
  state.busy = true;
  state.result = null;
  destroyPlayer();
  revokeUrls();
  state.coverUrl = '';
  state.audioUrl = '';
  els.result.hidden = true;
  els.result.innerHTML = '';
  els.errorPanel.hidden = true;
  setProgress('准备中', '正在初始化浏览器工作台', 3);
  syncStart();

  try {
    if (state.mode === 'convert') {
      await convertFile(state.file, token);
    } else {
      await runLyrics(state.file, token);
    }
  } catch (error) {
    if (token !== state.runToken) return;
    if (state.ffmpeg) {
      try {
        state.ffmpeg.terminate();
      } catch {
        /* no-op */
      }
      state.ffmpeg = null;
    }
    showError(error.message || '处理没有完成，请重试。');
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
    if (state.busy || event.target.closest('#file-remove')) return;
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
    clearRunState({ keepFile: false, terminateEngine: false });
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

  els.whisperToggle.addEventListener('change', () => {
    state.whisper = els.whisperToggle.checked;
    syncWhisperUI();
  });
  els.whisperLanguage.addEventListener('change', () => {
    state.whisperLanguage = els.whisperLanguage.value;
  });

  els.startBtn.addEventListener('click', startJob);
  els.resetBtn.addEventListener('click', resetWorkspace);
  els.errorReset.addEventListener('click', resetWorkspace);
}

applyMode('convert', { initial: true });
bindEvents();
syncStart();
