import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  artistSimilarity,
  bigramSimilarity,
  fetchJson,
  normalizeForMatch,
  stripExtension
} from './util.js';
import {
  addSimplified,
  attachTranslations,
  isInstrumentalText,
  parseLrc,
  plainLyrics
} from './lrc.js';
import { AsrError, modelReady, transcribe } from './asr.js';
import { coverExtension, embeddedLyrics, probeMedia, readTags } from './media.js';

const LRCLIB = 'https://lrclib.net/api';
const NETEASE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
  Referer: 'https://music.163.com/',
  Origin: 'https://music.163.com'
};

const CREDIT_RE =
  /^(作词|作詞|作曲|编曲|編曲|制作人|製作人|监制|監製|词|詞|曲|lyrics?|composed|arranged|producer|written)\s*[:：]/i;

export async function extractLyrics({
  file,
  originalName,
  jobDir,
  titleOverride = '',
  artistOverride = '',
  allowAsr = true,
  language = 'auto',
  skipEmbedded = false,
  onProgress = () => {}
}) {
  onProgress({ percent: 4, stage: '读取音频信息', detail: '正在分析音频与标签' });

  const [probe, tags] = await Promise.all([
    probeMedia(file),
    readTags(file).catch(() => null)
  ]);

  if (!probe.hasAudio) {
    throw new Error('这个文件里没有可用的音轨。');
  }

  const meta = buildMetadata({ probe, tags, originalName, titleOverride, artistOverride });
  const duration = probe.duration || tags?.duration || 0;

  let coverExt = null;
  if (tags?.picture?.data) {
    coverExt = coverExtension(tags.picture);
    try {
      await writeFile(path.join(jobDir, `cover.${coverExt}`), Buffer.from(tags.picture.data));
    } catch {
      coverExt = null;
    }
  }

  onProgress({ percent: 12, stage: '检查内嵌歌词', detail: '正在查找文件内嵌的歌词标签' });

  if (!skipEmbedded && tags) {
    const embedded = pickEmbedded(tags);
    if (embedded) {
      const parsed = parseLrc(embedded.text);
      if (isInstrumentalText(parsed.plainText)) {
        return notFound({
          meta,
          duration,
          coverExt,
          instrumental: true,
          reason: '这个文件被标记为纯音乐，没有可提取的歌词。'
        });
      }
      if (parsed.lines.length) {
        onProgress({ percent: 100, stage: '提取完成', detail: '已读取内嵌歌词' });
        return buildResult({
          meta,
          duration,
          coverExt,
          parsed,
          source: 'embedded',
          sourceLabel: '内嵌歌词',
          matchScore: 1,
          synced: parsed.synced
        });
      }
    }
  }

  onProgress({ percent: 24, stage: '搜索在线歌词库', detail: '正在匹配歌曲与歌词版本' });

  const match = await findOnlineLyrics(meta, duration, onProgress);

  if (match?.instrumental) {
    return notFound({
      meta,
      duration,
      coverExt,
      instrumental: true,
      reason: '歌词库把这首歌标记为纯音乐，没有可提取的歌词。'
    });
  }

  if (match) {
    onProgress({ percent: 92, stage: '整理歌词', detail: '正在生成时间轴与简体版本' });
    const result = buildResult({
      meta,
      duration,
      coverExt,
      parsed: match.parsed,
      source: match.source,
      sourceLabel: match.sourceLabel,
      matchScore: match.score,
      synced: match.parsed.synced,
      translated: match.translationLrc,
      display: {
        title: match.title || meta.title,
        artist: match.artist || meta.artist,
        album: match.album || meta.album
      }
    });
    onProgress({ percent: 100, stage: '提取完成', detail: '歌词已就绪' });
    return result;
  }

  if (!allowAsr) {
    return notFound({
      meta,
      duration,
      coverExt,
      reason: '在线歌词库没有找到匹配版本。可以补全歌名或歌手后重试。',
      canRematch: true
    });
  }

  const ready = await modelReady();
  if (!ready) {
    onProgress({
      percent: 58,
      stage: '准备本地识别',
      detail: '在线歌词未命中，准备下载本地 AI 识别模型'
    });
  }

  try {
    const asr = await transcribe(file, jobDir, {
      language,
      duration,
      onProgress: ({ percent, detail }) =>
        onProgress({ percent, stage: '本地 AI 听写', detail })
    });

    const parsed = {
      synced: true,
      lines: asr.lines,
      plainText: asr.lines.map((line) => line.text).join('\n'),
      meta: {}
    };

    const result = buildResult({
      meta,
      duration,
      coverExt,
      parsed,
      source: 'whisper',
      sourceLabel: '本地 AI 听写',
      matchScore: null,
      synced: true,
      warning: '这段歌词由本地 Whisper 模型听写生成，可能有错字或漏句，建议对照原曲校对。'
    });
    onProgress({ percent: 100, stage: '提取完成', detail: '本地听写已完成' });
    return result;
  } catch (error) {
    const reason =
      error instanceof AsrError
        ? error.message
        : '本地听写没有完成，可以稍后重试。';
    return notFound({
      meta,
      duration,
      coverExt,
      reason,
      canRematch: true,
      asrFailed: true
    });
  }
}

function buildMetadata({ probe, tags, originalName, titleOverride, artistOverride }) {
  const parsedName = parseNameHints(originalName);
  const tagTitle = tags?.title || probe.tags.title || '';
  const tagArtist = tags?.artist || probe.tags.artist || '';
  const title = titleOverride || tagTitle || parsedName.title || stripExtension(originalName);
  const artist = artistOverride || tagArtist || parsedName.artist || '';
  const album = tags?.album || probe.tags.album || '';

  const aliases = new Set(
    [title, parsedName.title, parsedName.altTitle, stripExtension(originalName)]
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > 0)
  );
  const artistAliases = new Set(
    [artist, parsedName.artist, parsedName.altArtist]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );

  return {
    title,
    artist,
    album,
    aliases: [...aliases],
    artistAliases: [...artistAliases],
    fromTags: Boolean(tagTitle || tagArtist),
    ambiguous: parsedName.ambiguous
  };
}

function parseNameHints(originalName) {
  let base = stripExtension(originalName)
    .replace(/^\s*\d{1,3}[.)\s_-]+/, '')
    .replace(/\s*[\[(][^\])]*[\])]\s*$/g, '')
    .replace(/_/g, ' ')
    .trim();

  const separators = [' - ', ' – ', ' — ', '－'];
  for (const separator of separators) {
    const index = base.indexOf(separator);
    if (index > 0) {
      const left = base.slice(0, index).trim();
      const right = base.slice(index + separator.length).trim();
      if (left && right) {
        return {
          title: right,
          artist: left,
          altTitle: left,
          altArtist: right,
          ambiguous: true
        };
      }
    }
  }

  return { title: base, artist: '', altTitle: '', altArtist: '', ambiguous: false };
}

function pickEmbedded(tags) {
  const candidates = embeddedLyrics(tags)
    .map((candidate) => {
      const parsed = parseLrc(candidate.text);
      const nonEmpty = parsed.lines.filter((line) => line.text).length;
      return { ...candidate, parsed, score: nonEmpty + (parsed.synced ? 1000 : 0) };
    })
    .filter((candidate) => candidate.parsed.lines.length > 0)
    .sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

async function findOnlineLyrics(meta, duration, onProgress) {
  const queries = buildQueries(meta);

  for (const query of queries) {
    try {
      const results = await searchLrclib(query);
      const candidate = pickBest(results, meta, duration, (item) => ({
        title: item.trackName || item.name || '',
        artist: item.artistName || '',
        album: item.albumName || '',
        duration: Number(item.duration) || 0,
        lyrics: item.syncedLyrics || item.plainLyrics || '',
        synced: Boolean(item.syncedLyrics),
        instrumental: Boolean(item.instrumental),
        raw: item
      }));

      if (candidate?.instrumental) {
        return {
          parsed: { synced: false, lines: [], plainText: '', meta: {} },
          source: 'lrclib',
          sourceLabel: 'LRCLIB 歌词库',
          score: candidate.score,
          title: candidate.title,
          artist: candidate.artist,
          album: candidate.album,
          instrumental: true
        };
      }

      if (candidate?.lyrics) {
        const parsed = parseLrc(candidate.lyrics);
        if (parsed.lines.length) {
          onProgress({
            percent: 78,
            stage: '匹配歌词版本',
            detail: `已命中「${candidate.title}」`
          });
          return {
            parsed,
            source: 'lrclib',
            sourceLabel: 'LRCLIB 歌词库',
            score: candidate.score,
            title: candidate.title,
            artist: candidate.artist,
            album: candidate.album,
            translationLrc: ''
          };
        }
      }
    } catch {
      // Network hiccups should never make the whole extraction fail.
    }
  }

  onProgress({ percent: 42, stage: '搜索华语歌词库', detail: '正在尝试网易云音乐歌词库' });

  for (const query of queries.slice(0, 2)) {
    try {
      const results = await searchNetease(query);
      const ranked = rankCandidates(results, meta, duration, (item) => ({
        title: item.name || '',
        artist: (item.artists || item.ar || []).map((artist) => artist.name).join(' / '),
        album: item.album?.name || item.al?.name || '',
        duration: Number(item.duration || item.dt || 0) / 1000,
        raw: item
      }));

      for (const candidate of ranked.slice(0, 3)) {
        if (candidate.score < 0.62) continue;
        const lyric = await fetchNeteaseLyric(candidate.raw.id);
        if (!lyric?.lrc) continue;
        const parsed = parseLrc(lyric.lrc);
        if (!parsed.lines.length) continue;
        onProgress({
          percent: 82,
          stage: '匹配歌词版本',
          detail: `已命中「${candidate.title}」`
        });
        return {
          parsed,
          source: 'netease',
          sourceLabel: '网易云音乐歌词库',
          score: candidate.score,
          title: candidate.title,
          artist: candidate.artist,
          album: candidate.album,
          translationLrc: lyric.translation || ''
        };
      }
    } catch {
      // Try the next source.
    }
  }

  return null;
}

function buildQueries(meta) {
  const values = [];
  const title = meta.title.trim();
  const artist = meta.artist.trim();
  if (title && artist) values.push(`${title} ${artist}`);
  if (artist && meta.aliases.length > 1) {
    values.push(`${meta.aliases[1]} ${artist}`);
  }
  if (title) values.push(title);
  if (!meta.fromTags) {
    values.push(stripExtension(meta.aliases[0] || ''));
  }
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 1))].slice(0, 4);
}

async function searchLrclib(query) {
  const url = `${LRCLIB}/search?q=${encodeURIComponent(query)}`;
  const data = await fetchJson(url, { headers: { 'User-Agent': 'SoundIsle/1.0' } }, 9000);
  return Array.isArray(data) ? data : [];
}

async function searchNetease(query) {
  const url =
    'https://music.163.com/api/search/get/web?csrf_token=&s=' +
    encodeURIComponent(query) +
    '&type=1&offset=0&total=true&limit=12';
  const data = await fetchJson(url, { headers: NETEASE_HEADERS }, 9000);
  return Array.isArray(data?.result?.songs) ? data.result.songs : [];
}

async function fetchNeteaseLyric(id) {
  if (!id) return null;
  const url = `https://music.163.com/api/song/lyric?os=pc&id=${encodeURIComponent(id)}&lv=-1&kv=-1&tv=-1`;
  const data = await fetchJson(url, { headers: NETEASE_HEADERS }, 9000);
  if (data?.code !== 200) return null;
  return {
    lrc: data?.lrc?.lyric || '',
    translation: data?.tlyric?.lyric || ''
  };
}

function pickBest(candidates, meta, duration, mapper) {
  const ranked = rankCandidates(candidates, meta, duration, mapper);
  return ranked[0] || null;
}

function rankCandidates(candidates, meta, duration, mapper) {
  if (!Array.isArray(candidates) || !candidates.length) return [];
  const ranked = [];

  for (const raw of candidates) {
    const candidate = mapper(raw);
    if (!candidate.title) continue;

    const titleSim = Math.max(
      0,
      ...meta.aliases.map((alias) => bigramSimilarity(alias, candidate.title))
    );
    const artistSim = meta.artistAliases.length
      ? Math.max(
          0,
          ...meta.artistAliases.flatMap((alias) => [
            artistSimilarity(alias, candidate.artist),
            // Handles files named "title - artist" when the tags are missing.
            bigramSimilarity(alias, candidate.artist)
          ])
        )
      : 0.62;

    const durationDiff =
      duration > 0 && candidate.duration > 0 ? Math.abs(duration - candidate.duration) : null;
    const durationScore =
      durationDiff == null ? 0.55 : Math.max(0, 1 - durationDiff / 150);
    let score = titleSim * 0.58 + artistSim * 0.27 + durationScore * 0.15;
    if (candidate.synced) score += 0.025;

    const exactTitle = meta.aliases.some(
      (alias) => normalizeForMatch(alias) === normalizeForMatch(candidate.title)
    );
    const exactArtist = meta.artistAliases.some(
      (alias) => normalizeForMatch(alias) === normalizeForMatch(candidate.artist)
    );

    if (titleSim < 0.55) continue;
    if (!exactTitle && titleSim < 0.72) continue;
    if (meta.artistAliases.length && artistSim < 0.32) continue;
    if (durationDiff != null && durationDiff > 120 && !(exactTitle && exactArtist)) continue;

    ranked.push({ ...candidate, score: Number(score.toFixed(3)), titleSim, artistSim });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

function buildResult({
  meta,
  duration,
  coverExt,
  parsed,
  source,
  sourceLabel,
  matchScore,
  synced,
  translated = '',
  warning = '',
  display = null
}) {
  let lines = parsed.lines
    .filter((line) => line.text && !isCreditLine(line.text))
    .map((line) => ({
      time: Number.isFinite(line.time) ? line.time : null,
      text: line.text
    }));

  if (!lines.length) {
    lines = parsed.lines
      .filter((line) => line.text)
      .map((line) => ({ time: Number.isFinite(line.time) ? line.time : null, text: line.text }));
  }

  if (translated) {
    const withTranslation = attachTranslations(lines, translated);
    lines = withTranslation.lines;
  }

  const simplified = addSimplified(lines);

  const plain = plainLyrics({ lines });
  return {
    found: true,
    title: display?.title || meta.title,
    artist: display?.artist || meta.artist,
    album: display?.album || meta.album,
    duration,
    coverExt,
    source,
    sourceLabel,
    matchScore,
    synced: Boolean(synced && lines.some((line) => Number.isFinite(line.time))),
    lines: simplified.lines,
    hasVariant: simplified.hasVariant,
    hasTranslation: lines.some((line) => line.translation),
    plainText: plain,
    warning
  };
}

function isCreditLine(text) {
  return CREDIT_RE.test(text) || /^作词\s*[:：]/.test(text);
}

function notFound({
  meta,
  duration,
  coverExt,
  reason,
  canRematch = true,
  asrFailed = false,
  instrumental = false
}) {
  return {
    found: false,
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    duration,
    coverExt,
    instrumental,
    reason,
    canRematch,
    asrFailed
  };
}
