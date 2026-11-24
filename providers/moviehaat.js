/* Saad's BDIX shared core — bundled into every generated provider. */
var DF = (function () {
  var UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
  var VIDEO_EXT = ['mp4', 'mkv', 'webm', 'avi', 'mov', 'm4v', 'ts', 'm3u8'];
  var MAX_STREAMS = 5;

  var ACCENTS = {
    'à':'a','á':'a','â':'a','ã':'a','ä':'a','å':'a','è':'e','é':'e','ê':'e','ë':'e',
    'ì':'i','í':'i','î':'i','ï':'i','ò':'o','ó':'o','ô':'o','õ':'o','ö':'o','ù':'u',
    'ú':'u','û':'u','ü':'u','ý':'y','ÿ':'y','ç':'c','ñ':'n','đ':'d'
  };

  function settings() {
    try { return globalThis.SCRAPER_SETTINGS || {}; } catch (e) { return {}; }
  }

  function disabled(id) {
    var s = settings();
    var list = s.disable || [];
    if (typeof list === 'string') list = list.split(',');
    for (var i = 0; i < list.length; i++) {
      if (String(list[i]).trim().toLowerCase() === String(id).toLowerCase()) return true;
    }
    return false;
  }

  async function fetchText(url, headers) {
    var h = Object.assign({ 'User-Agent': UA, 'Accept': '*/*' }, headers || {});
    var res = await fetch(url, { method: 'GET', headers: h });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    return await res.text();
  }

  async function fetchJson(url, headers) {
    return JSON.parse(await fetchText(url, headers));
  }

  async function postJson(url, body, headers) {
    var h = Object.assign({
      'User-Agent': UA,
      'Accept': 'application/json',
      'Content-Type': 'application/json;charset=utf-8'
    }, headers || {});
    var res = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    return await res.json();
  }

  function decodeEntities(text) {
    return String(text || '')
      .split('&amp;').join('&')
      .split('&quot;').join('"')
      .split('&#39;').join("'")
      .split('&apos;').join("'")
      .split('&nbsp;').join(' ');
  }

  function decodePath(text) {
    try { return decodeURIComponent(String(text || '')); } catch (e) { return String(text || ''); }
  }

  function decodeEscaped(text) {
    return String(text || '')
      .split('\\u0026').join('&')
      .split('\\"').join('"')
      .split('\\/').join('/');
  }

  function stripTags(html) {
    return decodeEntities(String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  }

  function attr(tag, name) {
    var re = new RegExp(name + '\\s*=\\s*["\']([^"\']+)["\']', 'i');
    var m = String(tag || '').match(re);
    return m ? decodeEntities(m[1]) : '';
  }

  function normalizeTitle(text) {
    var s = decodeEntities(String(text || '')).toLowerCase();
    for (var k in ACCENTS) s = s.split(k).join(ACCENTS[k]);
    s = s.replace(/\b(19\d{2}|20\d{2}|720p|1080p|2160p|4k|webrip|web-rip|webdl|web-dl|bluray|brrip|bdrip|hdtc|hdts|nf|amzn|dual|dua|multi|audio|dubbed|dub|subbed|subs?|esub|msubs?|soft|english|eng|hindi|hin|bengali|bangla|ben|tamil|tam|telugu|tel|korean|kor|japanese|jpn|chinese|chi|spanish|spa|french|fre|urdu|x264|x265|h264|h265|hevc|avc|aac|ddp5|atmos|10bit|hdr|mkv|mp4)\b/gi, ' ');
    s = s.replace(/[^a-z0-9]+/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  function cleanName(raw) {
    var s = decodePath(raw).replace(/_/g, ' ');
    s = s.replace(/\.[a-z0-9]{2,5}$/i, '');
    s = s.replace(/\s*\[[^\]]*\]/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  function yearOf(text) {
    var m = String(text || '').match(/\b(19\d{2}|20\d{2})\b/);
    return m ? parseInt(m[1], 10) : null;
  }

  function qualityOf(text) {
    var s = String(text || '');
    if (/2160p|4k|uhd/i.test(s)) return '4K';
    if (/1080p|fhd/i.test(s)) return '1080p';
    if (/720p|hd/i.test(s)) return '720p';
    if (/480p|sd/i.test(s)) return '480p';
    return 'HD';
  }

  var LANGS = [
    ['english', 'English'], ['eng', 'English'],
    ['hindi', 'Hindi'], ['hin', 'Hindi'],
    ['bengali', 'Bengali'], ['bangla', 'Bengali'], ['ben', 'Bengali'],
    ['tamil', 'Tamil'], ['tam', 'Tamil'],
    ['telugu', 'Telugu'], ['tel', 'Telugu'],
    ['korean', 'Korean'], ['kor', 'Korean'],
    ['japanese', 'Japanese'], ['jpn', 'Japanese'],
    ['chinese', 'Chinese'], ['chi', 'Chinese'],
    ['spanish', 'Spanish'], ['spa', 'Spanish'],
    ['french', 'French'], ['fre', 'French'],
    ['urdu', 'Urdu'], ['punjabi', 'Punjabi'], ['marathi', 'Marathi'],
    ['arabic', 'Arabic'], ['turkish', 'Turkish'], ['thai', 'Thai'],
    ['indonesian', 'Indonesian'], ['russian', 'Russian'],
    ['german', 'German'], ['italian', 'Italian'], ['portuguese', 'Portuguese'],
    ['vietnamese', 'Vietnamese']
  ];

  var LANG_CODES = {
    en: 'English', hi: 'Hindi', bn: 'Bengali', ko: 'Korean', ja: 'Japanese',
    zh: 'Chinese', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', ur: 'Urdu',
    pa: 'Punjabi', fr: 'French', es: 'Spanish', de: 'German', it: 'Italian',
    pt: 'Portuguese', ru: 'Russian', th: 'Thai', id: 'Indonesian', tr: 'Turkish',
    ar: 'Arabic'
  };

  function languagesOf(text) {
    var s = ' ' + String(text || '').toLowerCase() + ' ';
    var out = [];
    for (var i = 0; i < LANGS.length; i++) {
      var re = new RegExp('(^|[^a-z])' + LANGS[i][0] + '([^a-z]|$)', 'i');
      if (re.test(s) && out.indexOf(LANGS[i][1]) < 0) out.push(LANGS[i][1]);
    }
    return out;
  }

  function formatSize(input) {
    var s = String(input == null ? '' : input).trim();
    if (!s) return '';
    var known = s.match(/(\d+(?:\.\d+)?)\s*(tb|tib|gb|gib|mb|mib)/i);
    if (known) {
      var unit = known[2].toUpperCase().replace('IB', 'B');
      return Number(known[1]).toFixed(1).replace(/\.0$/, '') + ' ' + unit;
    }
    var bytes = Number(s);
    if (!isFinite(bytes) || bytes <= 0) return '';
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1).replace(/\.0$/, '') + ' GB';
    if (bytes >= 1024 * 1024) return Math.round(bytes / (1024 * 1024)) + ' MB';
    return Math.round(bytes / 1024) + ' KB';
  }

  function detailParts(o) {
    var d = typeof o === 'string' ? { raw: o } : (o || {});
    var raw = String(d.raw || '');
    var langs = [];
    if (d.language) {
      var fromField = languagesOf(String(d.language));
      for (var i = 0; i < fromField.length; i++) {
        if (langs.indexOf(fromField[i]) < 0) langs.push(fromField[i]);
      }
    }
    var fromRaw = languagesOf(raw);
    for (var j = 0; j < fromRaw.length; j++) {
      if (langs.indexOf(fromRaw[j]) < 0) langs.push(fromRaw[j]);
    }

    var parts = [];
    if (langs.length) parts.push(langs.join('/'));
    if (/\b(dual|dua|multi)\b/i.test(raw) || langs.length > 1) parts.push('Dual Audio');

    var size = formatSize(d.size);
    if (size) parts.push(size);

    if (d.subs || /\b(esub|msubs?|soft\s*subs?|subbed)\b/i.test(raw)) parts.push('ESub');

    var format = '';
    if (/web[\s-]?dl/i.test(raw)) format = 'WEB-DL';
    else if (/webrip|web-rip/i.test(raw)) format = 'WEBRip';
    else if (/bluray|brrip|bdrip/i.test(raw)) format = 'BluRay';
    else if (/hdtc|hdts/i.test(raw)) format = 'HDTc';
    if (format) parts.push(format);

    var codec = '';
    if (/x265|h[\s-]?265|hevc/i.test(raw)) codec = 'HEVC';
    else if (/x264|h[\s-]?264|avc/i.test(raw)) codec = 'x264';
    if (codec) parts.push(codec);

    var audioTags = [];
    if (/atmosphere|atmos/i.test(raw)) audioTags.push('Atmos');
    if (/ddp?\s*5|dolby|e-ac-?3/i.test(raw)) audioTags.push('DDP5.1');
    if (/aac2?[\s.]?0|aac/i.test(raw)) audioTags.push('AAC');
    for (var a = 0; a < audioTags.length; a++) parts.push(audioTags[a]);

    return parts.slice(0, 6);
  }

  function formatDetails(o) {
    return detailParts(o).join(' • ');
  }

  function exactMatch(candidateTitle, candidateYear, info) {
    var ct = normalizeTitle(candidateTitle);
    if (!ct) return false;
    var cy = Number(candidateYear) || 0;
    var y = Number(info && info.year) || 0;
    var titles = (info && info.titles) || [];
    for (var i = 0; i < titles.length; i++) {
      if (normalizeTitle(titles[i]) !== ct) continue;
      if (!cy || !y || Math.abs(cy - y) <= 1) return true;
    }
    return false;
  }

  function strictScore(candidateTitle, candidateYear, info) {
    var ct = normalizeTitle(candidateTitle);
    if (!ct) return 0;
    var best = 0;
    var titles = (info && info.titles) || [];
    for (var i = 0; i < titles.length; i++) {
      var nt = normalizeTitle(titles[i]);
      if (!nt) continue;
      if (ct === nt) best = Math.max(best, 100);
      else {
        var shorter = ct.length <= nt.length ? ct : nt;
        var longer = shorter === ct ? nt : ct;
        if (shorter.length >= 4 && longer.indexOf(shorter) === 0 &&
            shorter.length / longer.length >= 0.72) best = Math.max(best, 85);
      }
    }
    if (!best) return 0;
    var cy = parseInt(candidateYear, 10) || 0;
    var y = parseInt(info && info.year, 10) || 0;
    if (cy && y) {
      if (Math.abs(cy - y) > 1) return 0;
      best += cy === y ? 20 : 10;
    }
    return best;
  }

  function strictPick(items, info, limit) {
    var scored = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it) continue;
      var s = typeof it.score === 'number' ? it.score : strictScore(it.title, it.year, info);
      if (s >= 85) {
        it.score = s;
        scored.push(it);
      }
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, limit || 1);
  }

  async function probeSize(url, headers) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 2500) : null;
    try {
      var h = Object.assign({ 'Range': 'bytes=0-0' }, headers || {});
      var opts = { method: 'GET', headers: h };
      if (controller) opts.signal = controller.signal;
      var res = await fetch(url, opts);
      var cr = res.headers && res.headers.get ? res.headers.get('content-range') : '';
      var m = String(cr || '').match(/\/(\d+)\s*$/);
      if (m) return parseInt(m[1], 10);
      var cl = res.headers && res.headers.get ? res.headers.get('content-length') : '';
      if (!cr && cl) {
        var bytes = parseInt(cl, 10);
        if (bytes > 1024 * 1024) return bytes;
      }
      if (res.body && res.body.cancel) { try { res.body.cancel(); } catch (e) { /* ignore */ } }
    } catch (e) { /* size is optional */ }
    finally {
      if (timer) clearTimeout(timer);
    }
    return null;
  }

  function episodeOf(text) {
    var s = decodePath(text);
    var m = s.match(/[\.\s\[\-]S(\d{1,2})[\.\s\-]?E(\d{1,3})/i) ||
      s.match(/Season[\s\.]*(\d{1,2})[\s\/\.-]*Episode[\s\.]*(\d{1,3})/i);
    if (!m) return null;
    return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };
  }

  function pad2(n) {
    var s = String(n || 0);
    return s.length === 1 ? '0' + s : s;
  }

  function absoluteUrl(base, href) {
    var h = String(href || '').trim();
    if (!h) return '';
    if (/^https?:\/\//i.test(h)) return h;
    if (h.indexOf('//') === 0) return (String(base).indexOf('https:') === 0 ? 'https:' : 'http:') + h;
    var origin = String(base).match(/^([a-z]+:\/\/[^/]+)/i);
    if (h.charAt(0) === '/') return (origin ? origin[1] : '') + h;
    var cut = String(base).lastIndexOf('/');
    return (cut >= 0 ? String(base).slice(0, cut + 1) : String(base) + '/') + h;
  }

  async function tmdbInfo(tmdbId, mediaType) {
    var type = mediaType === 'tv' || mediaType === 'series' || mediaType === 'show' ? 'tv' : 'movie';
    var key = '';
    try { key = globalThis.TMDB_API_KEY || ''; } catch (e) { key = ''; }
    var empty = { titles: [], year: null, tmdbId: String(tmdbId), mediaType: type, originalLanguage: '' };
    if (!key) return empty;

    var url = 'https://api.themoviedb.org/3/' + type + '/' + encodeURIComponent(tmdbId) +
      '?api_key=' + encodeURIComponent(key) + '&language=en-US';
    try {
      var data = await fetchJson(url);
      var a = data.title || data.name || data.original_title || data.original_name || '';
      var b = data.original_title || data.original_name || a;
      var titles = [];
      [a, b].forEach(function (t) {
        if (t && titles.indexOf(t) < 0) titles.push(t);
      });
      var date = data.release_date || data.first_air_date || '';
      return {
        titles: titles,
        year: yearOf(date),
        tmdbId: String(tmdbId),
        mediaType: type,
        originalLanguage: String(data.original_language || '')
      };
    } catch (e) {
      return empty;
    }
  }

  function searchTerms(info, limit) {
    var out = [];
    function add(value) {
      var s = String(value || '').trim();
      if (s && out.indexOf(s) < 0) out.push(s);
    }
    var titles = (info && info.titles) || [];
    for (var i = 0; i < titles.length; i++) {
      add(titles[i]);
      add(String(titles[i]).replace(/^(the|a|an)\s+/i, ''));
      var words = String(titles[i]).split(/\s+/);
      for (var w = 0; w < words.length; w++) {
        var word = words[w].replace(/[^a-z0-9]/gi, '');
        if (word.length < 2) continue;
        if (word.length > 3) add(word.slice(0, 3));
        add(word.slice(0, 2));
      }
    }
    return out.slice(0, limit || 8);
  }

  function scoreMatch(candidateTitle, candidateYear, info) {
    var ct = normalizeTitle(candidateTitle);
    if (!ct) return 0;
    var best = 0;
    var titles = (info && info.titles) || [];
    for (var i = 0; i < titles.length; i++) {
      var nt = normalizeTitle(titles[i]);
      if (!nt) continue;
      if (ct === nt) best = Math.max(best, 100);
      else if (ct.indexOf(nt) >= 0 || nt.indexOf(ct) >= 0) best = Math.max(best, 72);
      else {
        var a = ct.split(' ');
        var b = nt.split(' ');
        var hit = 0;
        for (var j = 0; j < b.length; j++) {
          if (b[j].length > 2 && a.indexOf(b[j]) >= 0) hit++;
        }
        best = Math.max(best, Math.round((50 * hit) / Math.max(1, b.length)));
      }
    }
    var cy = Number(candidateYear) || 0;
    var y = Number(info && info.year) || 0;
    if (cy && y) {
      if (cy === y) best += 20;
      else if (Math.abs(cy - y) <= 1) best += 10;
    }
    return best;
  }

  function pickBest(items, info, limit, minScore) {
    var min = typeof minScore === 'number' ? minScore : 40;
    var scored = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it) continue;
      if (typeof it.score !== 'number') it.score = scoreMatch(it.title, it.year, info);
      if (it.score >= min) scored.push(it);
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, limit || 5);
  }

  function extOf(url) {
    var s = String(url || '').split('?')[0].split('#')[0];
    return s.substring(s.lastIndexOf('.') + 1).toLowerCase();
  }

  function isVideo(url) {
    return VIDEO_EXT.indexOf(extOf(url)) >= 0;
  }

  function markHidden(stream, key, value) {
    if (value == null) return;
    try {
      Object.defineProperty(stream, key, {
        value: value,
        enumerable: false,
        configurable: true,
        writable: true
      });
    } catch (e) {
      stream[key] = value;
    }
  }

  function makeStream(o) {
    if (!o || !o.url) return null;
    var parts = detailParts(o.detail);
    var extra = parts.join(' • ');
    var title = String(o.title || '');
    if (extra) title = title ? title + ' • ' + extra : extra;

    var quality = o.quality || 'HD';
    var nameParts = [quality];
    for (var i = 0; i < parts.length && nameParts.length < 4; i++) {
      nameParts.push(parts[i]);
    }
    var name = String(o.name || 'Saad\'s BDIX') + ' • ' + nameParts.join(' • ');

    var stream = {
      name: name,
      title: title,
      url: o.url,
      quality: quality,
      headers: o.headers || { 'User-Agent': UA }
    };
    if (/\.m3u8(\?|$)/i.test(o.url)) stream.type = 'hls';
    if (o.subtitles && o.subtitles.length) stream.subtitles = o.subtitles;
    if (typeof o.match === 'number') markHidden(stream, '_match', o.match);
    if (typeof o.exact === 'boolean') markHidden(stream, '_exact', o.exact);
    var size = o.detail && o.detail.size;
    if (typeof size === 'number') markHidden(stream, '_size', size);
    else if (size && /^\d+$/.test(String(size))) markHidden(stream, '_size', parseInt(size, 10));
    return stream;
  }

  function dedupe(streams) {
    var seen = {};
    var out = [];
    for (var i = 0; i < streams.length; i++) {
      var s = streams[i];
      if (!s || !s.url || seen[s.url]) continue;
      seen[s.url] = true;
      out.push(s);
    }
    return out;
  }

  function rankTier(stream) {
    var m = stream && stream._match;
    if (typeof m !== 'number') return 0;
    if (m >= 85) return 3; // exact TMDB ID or strict title + year
    if (m >= 40) return 2; // loose but close title
    return 1;              // accepted fallback
  }

  function resolutionRank(quality) {
    var q = String(quality || '');
    if (/2160|4k|uhd/i.test(q)) return 4;
    if (/1080/i.test(q)) return 3;
    if (/720/i.test(q)) return 2;
    return 1;
  }

  function languageRank(stream, info) {
    var text = String((stream && stream.title) || '') + ' ' + String((stream && stream.name) || '');
    var langs = languagesOf(text);
    var dual = /\b(dual|multi)\b/i.test(text) || langs.length > 1;
    var native = LANG_CODES[(info && info.originalLanguage) || ''] || '';
    if (native && (dual || langs.indexOf(native) >= 0)) return 5;
    if (dual || langs.indexOf('English') >= 0) return 4;
    if (langs.indexOf('Hindi') >= 0) return 3;
    if (langs.length) return 2;
    return 1;
  }

  function rankStreams(streams, info) {
    var ranked = (streams || []).slice();
    ranked.sort(function (a, b) {
      var exact = ((b && b._exact) ? 1 : 0) - ((a && a._exact) ? 1 : 0);
      if (exact) return exact;
      var tier = rankTier(b) - rankTier(a);
      if (tier) return tier;
      var lang = languageRank(b, info) - languageRank(a, info);
      if (lang) return lang;
      var res = resolutionRank(b && b.quality) - resolutionRank(a && a.quality);
      if (res) return res;
      var dual = (/\bDual Audio\b/i.test(b && b.title) ? 1 : 0) -
        (/\bDual Audio\b/i.test(a && a.title) ? 1 : 0);
      if (dual) return dual;
      var size = (Number(b && b._size) || 0) - (Number(a && a._size) || 0);
      if (size) return size;
      var match = (Number(b && b._match) || 0) - (Number(a && a._match) || 0);
      if (match) return match;
      return 0;
    });
    var exact = [];
    for (var i = 0; i < ranked.length && exact.length < MAX_STREAMS; i++) {
      if (ranked[i] && ranked[i]._exact) exact.push(ranked[i]);
    }
    // Accuracy first: never place a closest-title fallback in the first two
    // rows. If fewer than two exact files exist, return only the exact ones.
    if (exact.length < 2) return exact;
    return ranked.slice(0, MAX_STREAMS);
  }

  async function h5aiSearch(origin, rootHref, query) {
    var body = {
      action: 'get',
      search: { href: rootHref, pattern: query, ignorecase: true }
    };
    var json = await postJson(origin + rootHref, body);
    var rows = json.search || [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var href = typeof rows[i] === 'string' ? rows[i] : (rows[i] && rows[i].href);
      if (href) out.push(href);
    }
    return out;
  }

  async function h5aiStreams(origin, rootHref, sourceName, info, mediaType, season, episode, disabledId) {
    if (disabled(disabledId)) return [];
    if (!info.titles || !info.titles.length) return [];

    var hrefs = [];
    var queries = [];
    var titles = info.titles.slice(0, 3);
    for (var t = 0; t < titles.length; t++) {
      var title = titles[t];
      if (queries.indexOf(title) < 0) queries.push(title);
      // h5ai uses literal substring matching: punctuation in TMDB titles
      // (e.g. "Ada Twist, Scientist") often appears in folder names but not
      // in video filenames, which drop commas/colons. Add stripped variants.
      var stripped = String(title).replace(/[,:;!?'\u2019]/g, '').replace(/\s+/g, ' ').trim();
      if (stripped !== title && queries.indexOf(stripped) < 0) queries.push(stripped);
      var words = String(title).split(/\s+/).filter(function (w) { return w.length > 2; });
      if (words.length > 2) {
        var shortQuery = words.slice(0, 2).join(' ');
        if (queries.indexOf(shortQuery) < 0) queries.push(shortQuery);
      }
    }
    for (var q = 0; q < queries.length; q++) {
      try {
        var found = await h5aiSearch(origin, rootHref, queries[q]);
        for (var f = 0; f < found.length; f++) {
          if (hrefs.indexOf(found[f]) < 0) hrefs.push(found[f]);
        }
      } catch (e) { /* source down: skip */ }
    }

    var candidates = [];
    for (var i = 0; i < hrefs.length; i++) {
      var href = hrefs[i];
      if (!isVideo(href)) continue;
      var raw = decodePath(href);
      var parts = raw.split('/');
      // Episode files often sit in generic "Season 1" folders. Walk up to
      // the first meaningful folder (usually the release/show folder).
      var folder = '';
      for (var p = parts.length - 2; p >= 0; p--) {
        if (!parts[p]) continue;
        if (/^(season|episodes?|s\d{1,2})$/i.test(parts[p])) continue;
        folder = parts[p];
        break;
      }
      var fileLabel = cleanName(parts[parts.length - 1]);
      var label = cleanName(folder || parts[parts.length - 1]);
      var year = yearOf(raw) || yearOf(folder);
      var score = Math.max(scoreMatch(label, year, info), scoreMatch(fileLabel, year, info));
      if (score >= 40 || info.titles.length === 0) {
        candidates.push({ href: href, label: label, raw: raw, score: score });
      }
    }

    candidates.sort(function (a, b) { return b.score - a.score; });

    var out = [];
    var wantedSeason = parseInt(season, 10) || null;
    var wantedEpisode = parseInt(episode, 10) || null;
    for (var c = 0; c < candidates.length && out.length < 10; c++) {
      var cand = candidates[c];
      var ep = episodeOf(cand.raw);
      if (mediaType === 'tv' && ep && wantedSeason && wantedEpisode) {
        if (ep.season !== wantedSeason || ep.episode !== wantedEpisode) continue;
      }
      var title = cand.label;
      if (mediaType === 'tv') {
        title = (ep ? 'S' + pad2(ep.season) + 'E' + pad2(ep.episode) : 'S' + pad2(wantedSeason || 1) + 'E' + pad2(wantedEpisode || 1)) + ' • ' + title;
      }
      out.push(makeStream({
        name: sourceName,
        title: title,
        url: /^https?:\/\//i.test(cand.href) ? cand.href : origin + cand.href,
        quality: qualityOf(cand.raw),
        headers: { 'User-Agent': UA, 'Referer': origin + '/' },
        match: cand.score,
        exact: exactMatch(cand.label, cand.year, info)
      }));
    }
    return dedupe(out);
  }

  return {
    UA: UA,
    MAX_STREAMS: MAX_STREAMS,
    disabled: disabled,
    fetchText: fetchText,
    fetchJson: fetchJson,
    postJson: postJson,
    decodeEntities: decodeEntities,
    decodePath: decodePath,
    decodeEscaped: decodeEscaped,
    stripTags: stripTags,
    attr: attr,
    normalizeTitle: normalizeTitle,
    cleanName: cleanName,
    yearOf: yearOf,
    qualityOf: qualityOf,
    languagesOf: languagesOf,
    formatSize: formatSize,
    detailParts: detailParts,
    formatDetails: formatDetails,
    pad2: pad2,
    exactMatch: exactMatch,
    strictScore: strictScore,
    strictPick: strictPick,
    probeSize: probeSize,
    episodeOf: episodeOf,
    absoluteUrl: absoluteUrl,
    tmdbInfo: tmdbInfo,
    searchTerms: searchTerms,
    scoreMatch: scoreMatch,
    pickBest: pickBest,
    extOf: extOf,
    isVideo: isVideo,
    makeStream: makeStream,
    dedupe: dedupe,
    rankStreams: rankStreams,
    h5aiSearch: h5aiSearch,
    h5aiStreams: h5aiStreams
  };
})();


/* MovieHaat provider — appended after DF core by build.js. */

var MOVIEHAAT_API = 'https://moviehaat.net:8989/api/';

async function getStreams(tmdbId, mediaType, season, episode) {
  if (DF.disabled('moviehaat')) return [];
  var info = await DF.tmdbInfo(tmdbId, mediaType);
  if (!info.titles.length) return [];

  var isTv = info.mediaType === 'tv';
  var candidates = [];
  var seenIds = {};
  var terms = DF.searchTerms(info, 8);

  for (var t = 0; t < terms.length && candidates.length < 20; t++) {
    try {
      var search = await DF.postJson(MOVIEHAAT_API + 'searchmovies', { search: terms[t] });
      var rows = isTv ? (search.series || []) : (search.movies || []);
      for (var i = 0; i < rows.length && candidates.length < 20; i++) {
        var row = rows[i];
        if (!row) continue;
        var id = isTv ? row.series_id : row.movie_id;
        if (!id || seenIds[id]) continue;
        var title = String(row.title || '');
        var year = DF.yearOf(row.release_year || row.release_date || '');
        var score = DF.scoreMatch(title, year, info);
        seenIds[id] = true;
        candidates.push({
          id: id,
          title: title,
          year: year,
          score: score,
          exact: DF.exactMatch(title, year, info)
        });
      }
    } catch (e) { /* next term */ }
  }

  var chosen = DF.pickBest(candidates, info, DF.MAX_STREAMS, 0);
  if (!chosen.length) return [];

  var out = [];
  var headers = { 'User-Agent': DF.UA, 'Referer': 'https://moviehaat.net/' };

  if (!isTv) {
    for (var c = 0; c < chosen.length && out.length < DF.MAX_STREAMS; c++) {
      try {
        var detail = await DF.fetchJson(MOVIEHAAT_API + 'getmoviebyid/' + encodeURIComponent(chosen[c].id));
        var results = (detail && detail.results) || [];
        if (!Array.isArray(results)) results = [results];
        for (var r = 0; r < results.length && out.length < DF.MAX_STREAMS; r++) {
          var result = results[r];
          if (!result || !result.video_path) continue;
          var raw = DF.decodePath(result.video_path) + ' ' + String(result.full_title || '') +
            ' ' + String(result.file_name_1 || '') + ' ' + String(result.quality_1 || '') +
            ' ' + String(result.category || '') + ' ' + String(result.sub_category || '');
          var stream = DF.makeStream({
            name: 'MovieHaat',
            title: chosen[c].title,
            url: result.video_path,
            quality: DF.qualityOf(raw),
            detail: {
              raw: raw,
              language: result.language || result.language_list || result.sub_category || '',
              size: result.video_size_1
            },
            headers: headers,
            match: chosen[c].score,
            exact: chosen[c].exact
          });
          if (stream) out.push(stream);
        }
      } catch (e) { /* next candidate */ }
    }
    return DF.rankStreams(DF.dedupe(out), info);
  }

  var wantedSeason = parseInt(season, 10) || null;
  var wantedEpisode = parseInt(episode, 10) || null;

  for (var k = 0; k < chosen.length && out.length < DF.MAX_STREAMS; k++) {
    try {
      var eps = await DF.postJson(MOVIEHAAT_API + 'seriesepisodes', { series_id: chosen[k].id });
      var rows = (eps && (eps.results || eps.episode)) || [];
      if (!Array.isArray(rows)) rows = [rows];
      for (var e = 0; e < rows.length && out.length < DF.MAX_STREAMS; e++) {
        var ep = rows[e];
        if (!ep || !ep.video_path) continue;
        var s = parseInt(ep.seasonNumber, 10) || 0;
        var n = parseInt(ep.episodeNumber, 10) || 0;
        if (wantedSeason && s !== wantedSeason) continue;
        if (wantedEpisode && n !== wantedEpisode) continue;
        var label = 'S' + DF.pad2(s || season) + 'E' + DF.pad2(n || episode) + ' • ' + chosen[k].title;
        var raw = DF.decodePath(ep.video_path) + ' ' + String(ep.name_1 || '') +
          ' ' + String(ep.quality_1 || '');
        var stream = DF.makeStream({
          name: 'MovieHaat',
          title: label,
          url: ep.video_path,
          quality: DF.qualityOf(raw),
          detail: {
            raw: raw,
            language: ep.language || '',
            size: ep.video_size_1
          },
          headers: headers,
          match: chosen[k].score,
          exact: chosen[k].exact
        });
        if (stream) out.push(stream);
      }
    } catch (e) { /* next candidate */ }
  }
  return DF.rankStreams(DF.dedupe(out), info);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
}
if (typeof globalThis !== 'undefined') globalThis.getStreams = getStreams;
if (typeof global !== 'undefined') global.getStreams = getStreams;
