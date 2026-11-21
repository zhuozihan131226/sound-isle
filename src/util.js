import path from 'node:path';

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value >= 10 || exp === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exp]}`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Busboy gives us latin1-decoded filenames; recover UTF-8 when it was mojibake. */
export function fixUploadName(name = '') {
  if (!/[\u0080-\u00ff]/.test(name)) return name;
  const recovered = Buffer.from(name, 'latin1').toString('utf8');
  return recovered.includes('\uFFFD') ? name : recovered;
}

export function cleanDisplayName(name = '') {
  return path
    .basename(name)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim()
    .slice(0, 140);
}

export function stripExtension(name = '') {
  return cleanDisplayName(name).replace(/\.[^.]+$/, '');
}

export function safeFilename(name = 'sound-isle') {
  return cleanDisplayName(name).replace(/\s+/g, ' ').slice(0, 110) || 'sound-isle';
}

export function escapeFilterValue(value) {
  return String(value).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export async function fetchJson(url, options = {}, timeoutMs = 12000) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': 'SoundIsle/1.0 (local audio workspace)',
      Accept: 'application/json',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function normalizeForMatch(input = '') {
  return String(input)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\([^)]*(?:feat|ft|live|remix|version|版|伴奏|cover)[^)]*\)/gi, ' ')
    .replace(/\[[^\]]*(?:feat|ft|live|remix|version|版|伴奏|cover)[^\]]*\]/gi, ' ')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

export function bigramSimilarity(a = '', b = '') {
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
    const result = new Set();
    for (let i = 0; i < chars.length - 1; i += 1) result.add(chars[i] + chars[i + 1]);
    return [...result];
  };
  const aGrams = grams(left);
  const bGrams = new Set(grams(right));
  if (!aGrams.length || !bGrams.size) return 0;
  let hits = 0;
  for (const gram of aGrams) if (bGrams.has(gram)) hits += 1;
  const dice = (2 * hits) / (aGrams.length + bGrams.size);
  // Character overlap helps very short Chinese titles such as 晴天 / 晴天 (Live).
  const charSet = new Set([...right]);
  const overlap = [...new Set([...left])].filter((char) => charSet.has(char)).length;
  const charScore = overlap / Math.max(new Set([...left]).size, charSet.size);
  return dice * 0.7 + charScore * 0.3;
}

export function artistSimilarity(localArtist = '', candidateArtist = '') {
  if (!localArtist || !candidateArtist) return 0.5;
  const parts = (value) =>
    String(value)
      .split(/\s*(?:\/|,|&|、|;|\bfeat\.?\b|\bft\.?\b)\s*/i)
      .map(normalizeForMatch)
      .filter(Boolean);
  const locals = parts(localArtist);
  const candidates = parts(candidateArtist);
  if (!locals.length || !candidates.length) return 0;
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

export function stripExtLower(file) {
  return path.extname(file).toLowerCase();
}
