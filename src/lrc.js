import * as OpenCC from 'opencc-js';

const toSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' });

const META_KEYS = {
  ti: 'title',
  ar: 'artist',
  al: 'album',
  by: 'by',
  au: 'author',
  length: 'length',
  offset: 'offset'
};

const TIMESTAMP_RE = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

export function parseLrc(raw = '') {
  const text = String(raw).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const meta = {};
  const timed = [];
  const plain = [];
  let offsetMs = 0;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const metaMatch = line.match(/^\[([a-zA-Z]+):(.*)\]$/);
    if (metaMatch) {
      const key = metaMatch[1].toLowerCase();
      const value = metaMatch[2].trim();
      if (META_KEYS[key]) meta[META_KEYS[key]] = value;
      if (key === 'offset') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) offsetMs = parsed;
      }
      continue;
    }

    const stamps = [...line.matchAll(TIMESTAMP_RE)];
    if (!stamps.length) {
      plain.push(cleanLyricLine(line.replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, '')));
      continue;
    }

    let content = line.replace(TIMESTAMP_RE, '').trim();
    content = content.replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, '').trim();
    content = cleanLyricLine(content);
    if (!content) continue;

    for (const stamp of stamps) {
      const minutes = Number(stamp[1]);
      const seconds = Number(stamp[2]);
      const fractionRaw = stamp[3] || '0';
      const fraction = Number(fractionRaw) / 10 ** fractionRaw.length;
      const time = Math.max(0, minutes * 60 + seconds + fraction - offsetMs / 1000);
      timed.push({ time: Number(time.toFixed(2)), text: content });
    }
  }

  if (timed.length) {
    timed.sort((a, b) => a.time - b.time);
    const lines = [];
    for (const line of timed) {
      const previous = lines[lines.length - 1];
      if (previous && previous.time === line.time && previous.text === line.text) continue;
      lines.push(line);
    }
    return { synced: true, lines, meta, plainText: lines.map((line) => line.text).join('\n') };
  }

  const lines = plain
    .filter(Boolean)
    .map((line) => ({ time: null, text: line }));
  return { synced: false, lines, meta, plainText: plain.filter(Boolean).join('\n') };
}

export function parseSrt(raw = '') {
  const text = String(raw).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  const blocks = text.split(/\n{2,}/);
  const lines = [];
  const timeRe =
    /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

  for (const block of blocks) {
    const blockLines = block.split('\n');
    const timeIndex = blockLines.findIndex((line) => timeRe.test(line));
    if (timeIndex === -1) continue;
    const match = blockLines[timeIndex].match(timeRe);
    const start =
      Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
    const end =
      Number(match[5]) * 3600 + Number(match[6]) * 60 + Number(match[7]) + Number(match[8]) / 1000;
    const content = cleanLyricLine(blockLines.slice(timeIndex + 1).join(' '));
    if (!content) continue;
    lines.push({ time: Number(start.toFixed(2)), end: Number(end.toFixed(2)), text: content });
  }

  return mergeAsrLines(lines);
}

function mergeAsrLines(lines) {
  const output = [];
  for (const line of lines) {
    const previous = output[output.length - 1];
    const gap = line.time - (previous?.end ?? previous?.time ?? 0);
    if (previous && previous.text === line.text && gap < 1.2) continue;
    output.push(line);
  }
  return output;
}

export function cleanLyricLine(line = '') {
  return String(line)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[-–—]\s*/, '')
    .trim();
}

export function addSimplified(lines) {
  let changed = false;
  const output = lines.map((line) => {
    const simplified = toSimplified(line.text || '');
    if (simplified !== line.text) changed = true;
    return { ...line, textSimp: simplified };
  });
  return { lines: output, hasVariant: changed };
}

export function formatLrc(result) {
  const meta = [
    result.title ? `[ti:${result.title}]` : '',
    result.artist ? `[ar:${result.artist}]` : '',
    result.album ? `[al:${result.album}]` : '',
    '[by:Sound Isle]'
  ].filter(Boolean);

  const body = (result.lines || []).map((line) => {
    const text = line.text || '';
    if (Number.isFinite(line.time)) return `[${formatLrcTime(line.time)}]${text}`;
    return text;
  });

  return [...meta, '', ...body].join('\n').trim() + '\n';
}

export function formatLrcTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const secs = (total % 60).toFixed(2).padStart(5, '0');
  return `${String(minutes).padStart(2, '0')}:${secs}`;
}

export function plainLyrics(result) {
  return (result.lines || [])
    .map((line) => line.text)
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function isInstrumentalText(text = '') {
  return /纯音乐|纯音樂|instrumental|暂无歌词|沒有歌詞|没有歌词|此歌曲为没有填词的纯音乐/i.test(text);
}

export function translationMap(lrcText) {
  const parsed = parseLrc(lrcText);
  const map = new Map();
  if (!parsed.synced) return map;
  for (const line of parsed.lines) {
    const key = Math.round(line.time * 10) / 10;
    if (!map.has(key)) map.set(key, line.text);
  }
  return map;
}

export function attachTranslations(lines, translationLrc) {
  const map = translationMap(translationLrc);
  if (!map.size) return { lines, hasTranslation: false };
  let found = 0;
  const output = lines.map((line) => {
    if (!Number.isFinite(line.time)) return line;
    const key = Math.round(line.time * 10) / 10;
    const translation = map.get(key) || map.get(Math.round(line.time)) || '';
    if (translation && translation !== line.text) {
      found += 1;
      return { ...line, translation };
    }
    return line;
  });
  return { lines: output, hasTranslation: found > 0 };
}
