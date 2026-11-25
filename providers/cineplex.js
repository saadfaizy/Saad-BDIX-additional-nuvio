/* Saad's BDIX shared core — bundled into every generated provider. */
var DF = (function () {
  var UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
  var VIDEO_EXT = ['mp4', 'mkv', 'webm', 'avi', 'mov', 'm4v', 'ts', 'm3u8'];
  var MAX_STREAMS = 5;
  var MAX_PER_QUALITY = 2;
  var MAX_PER_HOST = 3;

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

  // Tries alternate hosts in order. The caller supplies path + query; this is
  // on-device only and never introduces a backend/proxy/tunnel.
  async function tryHosts(hosts, path, options) {
    var opts = options || {};
    var lastError;
    for (var i = 0; i < (hosts || []).length; i++) {
      var base = String(hosts[i] || '').replace(/\/$/, '');
      if (!base) continue;
      var url = base + (String(path || '').charAt(0) === '/' ? '' : '/') + String(path || '');
      try {
        if (opts.body != null) return await postJson(url, opts.body, opts.headers);
        return await fetchText(url, opts.headers);
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('No hosts available');
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
    s = s.replace(/\bs\d{1,2}[\s._-]?e\d{1,3}\b/gi, ' ');
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

  // Handles folder layouts such as "Season 01/02.mkv" and "E02" filenames
  // that do not contain a full SxxEyy token.
  function episodeFromPath(text) {
    var s = decodePath(text);
    var direct = episodeOf(s);
    if (direct) return direct;
    var seasonFolder = s.match(/Season[\s._-]*(\d{1,2})[\/\].*?(?:Episode|EP)?[\s._-]*(\d{1,3})(?=\D|$)/i);
    if (seasonFolder) {
      return { season: parseInt(seasonFolder[1], 10), episode: parseInt(seasonFolder[2], 10) };
    }
    var epOnly = s.match(/(?:^|[\/\s\[\-])E(?:P)?[\s._-]*(\d{1,3})(?=\D|$)/i);
    if (epOnly) return { season: null, episode: parseInt(epOnly[1], 10) };
    return null;
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
    var empty = {
      titles: [], year: null, tmdbId: String(tmdbId), mediaType: type,
      originalLanguage: '', imdbId: ''
    };
    if (!key) return empty;

    var url = 'https://api.themoviedb.org/3/' + type + '/' + encodeURIComponent(tmdbId) +
      '?api_key=' + encodeURIComponent(key) + '&language=en-US&append_to_response=external_ids';
    try {
      var data = await fetchJson(url);
      var a = data.title || data.name || data.original_title || data.original_name || '';
      var b = data.original_title || data.original_name || a;
      var titles = [];
      [a, b].forEach(function (t) {
        if (t && titles.indexOf(t) < 0) titles.push(t);
      });
      var date = data.release_date || data.first_air_date || '';
      var ids = data.external_ids || {};
      return {
        titles: titles,
        year: yearOf(date),
        tmdbId: String(tmdbId),
        mediaType: type,
        originalLanguage: String(data.original_language || ''),
        imdbId: String(ids.imdb_id || '')
      };
    } catch (e) {
      return empty;
    }
  }

  function searchTerms(info, limit, h5ai) {
    var out = [];
    function add(value) {
      var s = String(value || '').trim();
      if (s && out.indexOf(s) < 0) out.push(s);
    }
    var titles = (info && info.titles) || [];
    for (var i = 0; i < titles.length; i++) {
      var title = String(titles[i]);
      add(title);
      add(title.replace(/^(the|a|an)\s+/i, ''));
      add(title.replace(/[,:;!?'\u2019]/g, '').replace(/\s+/g, ' ').trim());
      if (h5ai) {
        add(title.replace(/\s+/g, '.'));
        add(title.replace(/\s+/g, '_'));
      }
      var words = title.split(/\s+/);
      if (words.length > 2) add(words.slice(0, 2).join(' '));
      for (var w = 0; w < words.length; w++) {
        var word = words[w].replace(/[^a-z0-9]/gi, '');
        if (word.length < 2) continue;
        if (word.length > 3) add(word.slice(0, 3));
        add(word.slice(0, 2));
      }
      if (h5ai) add(title.replace(/ /g, '\\ '));
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

  function browserHeaders(origin, extra) {
    var ref = origin ? String(origin) : '';
    if (ref && !/\/$/.test(ref)) ref += '/';
    var h = {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    };
    if (ref) h.Referer = ref;
    return Object.assign(h, extra || {});
  }

  function videoHeaders(origin, extra) {
    var ref = origin ? String(origin) : '';
    if (ref && !/\/$/.test(ref)) ref += '/';
    var h = {
      'User-Agent': UA,
      'Accept': 'video/webm,video/ogg,video/*;q=0.9,*/*;q=0.5',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity'
    };
    if (ref) h.Referer = ref;
    return Object.assign(h, extra || {});
  }

  function hostOf(url) {
    var m = String(url || '').match(/^([a-z]+:\/\/[^/]+)/i);
    return m ? m[1].toLowerCase() : '';
  }

  function isBroken(link) {
    if (!link) return true;
    var obj = typeof link === 'string' ? {} : link;
    var raw = typeof link === 'string' ? link :
      (obj.url || obj.href || obj.file || obj.src || obj.link || '');
    var s = String(raw || '').trim();
    if (!s || /^(null|undefined|none|n\/a|#)$/i.test(s)) return true;
    if (obj.broken === true || obj.dead === true || obj.disabled === true) return true;
    return false;
  }

  function sortTag(rank, max) {
    var top = Math.max(1, Number(max) || 5);
    var inv = Math.max(0, top - (Number(rank) || 0));
    var bin = inv.toString(2);
    while (bin.length < 20) bin = '0' + bin;
    return bin.split('').map(function (b) {
      return b === '1' ? '\uFEFF' : '\u200B';
    }).join('');
  }

  function applySortTags(streams) {
    var list = streams || [];
    var max = Math.max(0, list.length - 1);
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s || s._sortTagged) continue;
      // Best rows receive more U+FEFF bits, matching Eclipsia's ordering trick.
      var tag = sortTag(i, max);
      s.name = tag + String(s.name || '');
      s.title = tag + String(s.title || '');
      markHidden(s, '_sortTagged', true);
    }
    return list;
  }

  function limitStreams(streams, perQuality, perHost) {
    var pq = perQuality || MAX_PER_QUALITY;
    var ph = perHost || MAX_PER_HOST;
    var qCount = {};
    var hCount = {};
    var out = [];
    for (var i = 0; i < (streams || []).length; i++) {
      var s = streams[i];
      if (!s || !s.url) continue;
      var host = hostOf(s.url);
      var qk = String(s.quality || 'HD') + '|' + host;
      qCount[qk] = (qCount[qk] || 0) + 1;
      if (qCount[qk] > pq) continue;
      if (host) {
        hCount[host] = (hCount[host] || 0) + 1;
        if (hCount[host] > ph) continue;
      }
      out.push(s);
    }
    return out;
  }

  function groupExact(items, info) {
    var groups = {};
    var order = [];
    for (var i = 0; i < (items || []).length; i++) {
      var it = items[i];
      if (!it || !it.title) continue;
      var key = normalizeTitle(it.title) + '|' + (it.year || '');
      if (!groups[key]) {
        groups[key] = { title: it.title, year: it.year, score: 0, exact: false, items: [] };
        order.push(key);
      }
      var g = groups[key];
      g.items.push(it);
      var score = typeof it.score === 'number' ? it.score : scoreMatch(it.title, it.year, info);
      if (score > g.score) g.score = score;
      if (it.exact || exactMatch(it.title, it.year, info) || score >= 85) g.exact = true;
    }
    var out = [];
    for (var j = 0; j < order.length; j++) out.push(groups[order[j]]);
    out.sort(function (a, b) {
      var exact = (b.exact ? 1 : 0) - (a.exact ? 1 : 0);
      if (exact) return exact;
      return b.score - a.score;
    });
    return out;
  }

  // Group every exact/same-title candidate before any detail page is opened,
  // so variants are hydrated in parallel and ranked together.
  function orderedCandidates(items, info, limit) {
    var scored = [];
    for (var i = 0; i < (items || []).length; i++) {
      var it = items[i];
      if (!it || !it.title) continue;
      if (typeof it.score !== 'number') it.score = scoreMatch(it.title, it.year, info);
      if (it.score <= 0) continue;
      scored.push(it);
    }
    var groups = groupExact(scored, info);
    var out = [];
    for (var g = 0; g < groups.length; g++) {
      var groupItems = groups[g].items.slice();
      groupItems.sort(function (a, b) { return b.score - a.score; });
      for (var j = 0; j < groupItems.length; j++) out.push(groupItems[j]);
    }
    return out.slice(0, limit || 8);
  }

  async function hydrateMany(items, loader) {
    var jobs = [];
    for (var i = 0; i < (items || []).length; i++) {
      (function (item) {
        jobs.push(Promise.resolve().then(function () {
          return loader(item);
        }).catch(function () {
          return null;
        }));
      })(items[i]);
    }
    var out = await Promise.all(jobs);
    return out.filter(function (x) { return !!x; });
  }

  function firstNumber(obj, keys) {
    if (!obj) return null;
    for (var i = 0; i < keys.length; i++) {
      var v = obj[keys[i]];
      if (v == null) continue;
      var m = String(v).match(/\d+/);
      if (m) return parseInt(m[0], 10);
    }
    return null;
  }

  function episodeSourceText(ep) {
    if (!ep) return '';
    return String(ep.title || ep.name || ep.file_path || ep.path || ep.filename || '');
  }

  function seasonOfEpisode(ep) {
    var s = firstNumber(ep, ['season', 'seasonNumber', 'season_number', 'seasonNum']);
    if (s) return s;
    var parsed = episodeOf(episodeSourceText(ep));
    return parsed ? parsed.season : null;
  }

  function episodeNumberOf(ep) {
    var n = firstNumber(ep, ['episode', 'episodeNumber', 'episode_number', 'epNum', 'number', 'absolute_number', 'abs']);
    if (n) return n;
    var parsed = episodeOf(episodeSourceText(ep));
    return parsed ? parsed.episode : null;
  }

  function episodeLinks(episodes, season, episode) {
    var out = [];
    var wantSeason = parseInt(season, 10) || null;
    var wantEpisode = parseInt(episode, 10) || null;
    for (var i = 0; i < (episodes || []).length; i++) {
      var ep = episodes[i];
      if (!ep) continue;
      var s = seasonOfEpisode(ep);
      var n = episodeNumberOf(ep);
      if (wantSeason && s && s !== wantSeason) continue;
      if (wantEpisode && n && n !== wantEpisode) continue;
      var links = ep.links || ep.sources || ep.files || [];
      if (!Array.isArray(links) && links && typeof links === 'object') links = [links];
      if (!links.length) {
        var direct = ep.url || ep.video_path || ep.file || ep.src || ep.link;
        if (direct) links = [{ url: direct }];
      }
      for (var j = 0; j < links.length; j++) {
        var link = links[j];
        if (isBroken(link)) continue;
        var url = String(link.url || link.href || link.file || link.src || link.link || '').trim();
        if (url) out.push({ url: url, link: link, season: s, episode: n, source: ep });
      }
    }
    return out;
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
    if (extra) stream.size = extra;
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
    var ranked = limitStreams(dedupe(streams || [])).slice();
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
    if (exact.length < 2) return applySortTags(exact);
    return applySortTags(ranked.slice(0, MAX_STREAMS));
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

  function h5aiCandidate(href, origin, rootHref, info, mediaType, season, episode) {
    if (!isVideo(href) && !/\.m3u8(\?|$)/i.test(href)) return null;
    var raw = decodePath(href);
    var parts = raw.split('/');
    // Episode files often sit in generic "Season 1" folders. Walk up to the
    // first meaningful folder (usually the release/show folder).
    var folder = '';
    for (var p = parts.length - 2; p >= 0; p--) {
      var seg = decodePath(parts[p] || '');
      if (!seg) continue;
      if (/^(season|episodes?|s\d{1,2})$/i.test(seg)) continue;
      folder = seg;
      break;
    }
    var fileLabel = cleanName(parts[parts.length - 1]);
    var folderLabel = cleanName(folder || parts[parts.length - 1]);
    var year = yearOf(raw) || yearOf(folderLabel);
    var fileScore = scoreMatch(fileLabel, year, info);
    var folderScore = scoreMatch(folderLabel, year, info);
    var score = Math.max(fileScore, folderScore, strictScore(fileLabel, year, info));
    // Episode filenames add SxxEyy tokens, so a strict title+year score is
    // also treated as an exact/same-title match for the accuracy gate.
    var exact = exactMatch(fileLabel, year, info) || exactMatch(folderLabel, year, info) || score >= 85;
    if (score < 40 && !exact) return null;

    var ep = episodeFromPath(raw);
    if (mediaType === 'tv') {
      if (!ep) return null;
      var wantSeason = parseInt(season, 10) || null;
      var wantEpisode = parseInt(episode, 10) || null;
      if (wantSeason && ep.season && ep.season !== wantSeason) return null;
      if (wantEpisode && ep.episode !== wantEpisode) return null;
      ep.season = ep.season || wantSeason || 1;
    }

    return {
      href: href,
      url: /^https?:\/\//i.test(href) ? href : origin + href,
      origin: origin,
      rootHref: rootHref,
      raw: raw,
      title: fileScore >= folderScore ? fileLabel : folderLabel,
      titleLabel: fileScore >= folderScore ? fileLabel : folderLabel,
      fileLabel: fileLabel,
      folderLabel: folderLabel,
      year: year,
      score: score,
      exact: exact,
      episode: ep
    };
  }

  async function h5aiServersStreams(servers, sourceName, info, mediaType, season, episode, disabledId) {
    if (disabled(disabledId)) return [];
    if (!info || !info.titles || !info.titles.length) return [];
    var list = [];
    for (var s = 0; s < (servers || []).length; s++) {
      var server = servers[s];
      if (server && server.origin && server.root) list.push(server);
    }
    if (!list.length) return [];

    // h5ai performs literal substring matching. Search all servers with the
    // full title plus stripped, dotted, underscored and escaped-space forms.
    var queries = searchTerms(info, 6, true);
    if (info.imdbId && queries.indexOf(info.imdbId) < 0) queries.push(info.imdbId);

    var seen = {};
    var candidates = [];
    var exactCount = 0;

    // Query the useful title variants across all servers at once, then only
    // fall back to weak prefixes when those produced no exact file.
    async function batchesFor(query) {
      return Promise.all(list.map(async function (entry) {
        try {
          return { server: entry, hrefs: await h5aiSearch(entry.origin, entry.root, query) };
        } catch (e) {
          return { server: entry, hrefs: [] };
        }
      }));
    }
    function collect(batches) {
      for (var b = 0; b < batches.length; b++) {
        var batch = batches[b];
        for (var h = 0; h < batch.hrefs.length; h++) {
          var cand = h5aiCandidate(batch.hrefs[h], batch.server.origin, batch.server.root,
            info, mediaType, season, episode);
          if (!cand || seen[cand.url]) continue;
          seen[cand.url] = true;
          candidates.push(cand);
          if (cand.exact) exactCount++;
        }
      }
    }

    var primaryResults = await Promise.all(queries.slice(0, 3).map(function (query) {
      return batchesFor(query);
    }));
    for (var p = 0; p < primaryResults.length; p++) collect(primaryResults[p]);

    for (var q = 3; q < queries.length && candidates.length < 40 && exactCount === 0; q++) {
      collect(await batchesFor(queries[q]));
    }
    if (!candidates.length) return [];

    var groups = groupExact(candidates, info);
    var ordered = [];
    for (var g = 0; g < groups.length; g++) {
      for (var it = 0; it < groups[g].items.length; it++) ordered.push(groups[g].items[it]);
    }
    var probeList = ordered.slice(0, 12);
    var sizes = await Promise.all(probeList.map(function (c) {
      return probeSize(c.url, videoHeaders(c.origin, { 'Referer': c.origin + c.rootHref }));
    }));

    var out = [];
    for (var i = 0; i < probeList.length; i++) {
      var c = probeList[i];
      var label = c.titleLabel;
      if (mediaType === 'tv' && c.episode) {
        label = 'S' + pad2(c.episode.season) + 'E' + pad2(c.episode.episode) + ' • ' + label;
      }
      var size = sizes[i] || null;
      var stream = makeStream({
        name: sourceName,
        title: label,
        url: c.url,
        quality: qualityOf(c.raw),
        detail: { raw: c.raw, size: size },
        headers: videoHeaders(c.origin, { 'Referer': c.origin + c.rootHref }),
        match: c.score,
        exact: c.exact
      });
      if (stream) out.push(stream);
    }
    return rankStreams(out, info);
  }

  async function h5aiStreams(origin, rootHref, sourceName, info, mediaType, season, episode, disabledId) {
    return h5aiServersStreams(
      [{ origin: origin, root: rootHref }],
      sourceName, info, mediaType, season, episode, disabledId
    );
  }

  return {
    UA: UA,
    MAX_STREAMS: MAX_STREAMS,
    MAX_PER_QUALITY: MAX_PER_QUALITY,
    MAX_PER_HOST: MAX_PER_HOST,
    disabled: disabled,
    fetchText: fetchText,
    fetchJson: fetchJson,
    postJson: postJson,
    tryHosts: tryHosts,
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
    browserHeaders: browserHeaders,
    videoHeaders: videoHeaders,
    hostOf: hostOf,
    isBroken: isBroken,
    sortTag: sortTag,
    applySortTags: applySortTags,
    limitStreams: limitStreams,
    groupExact: groupExact,
    orderedCandidates: orderedCandidates,
    hydrateMany: hydrateMany,
    firstNumber: firstNumber,
    episodeSourceText: episodeSourceText,
    seasonOfEpisode: seasonOfEpisode,
    episodeNumberOf: episodeNumberOf,
    episodeLinks: episodeLinks,
    pad2: pad2,
    exactMatch: exactMatch,
    strictScore: strictScore,
    strictPick: strictPick,
    probeSize: probeSize,
    episodeOf: episodeOf,
    episodeFromPath: episodeFromPath,
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
    h5aiCandidate: h5aiCandidate,
    h5aiStreams: h5aiStreams,
    h5aiServersStreams: h5aiServersStreams
  };
})();


/* CinePlex provider — appended after DF core by build.js. */

var CINEPLEX_ORIGIN = 'http://cineplexbd.net/';

function cineplexSources(html, pageUrl) {
  var out = [];
  var m;
  var srcRe = /(?:const\s+videoSrc\s*=\s*|["']videoSrc["']\s*:\s*)["']([^"']+)["']/gi;
  while ((m = srcRe.exec(html)) !== null) out.push(DF.decodeEntities(m[1]));
  var tagRe = /<source[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((m = tagRe.exec(html)) !== null) out.push(DF.decodeEntities(m[1]));
  var directRe = /["'](https?:\/\/[^"']+\.(?:mp4|mkv|m3u8)(?:\?[^"']*)?)["']/gi;
  while ((m = directRe.exec(html)) !== null) out.push(DF.decodeEntities(m[1]));
  return out.map(function (raw) { return DF.absoluteUrl(pageUrl, raw); })
    .filter(function (url) { return !DF.isBroken(url) && DF.isVideo(url); });
}

async function getStreams(tmdbId, mediaType, season, episode) {
  if (DF.disabled('cineplex')) return [];
  var info = await DF.tmdbInfo(tmdbId, mediaType);
  if (!info.titles.length) return [];

  var candidates = [];
  var seen = {};
  var terms = DF.searchTerms(info, 8);
  for (var t = 0; t < terms.length && candidates.length < 24; t++) {
    try {
      var url = CINEPLEX_ORIGIN + 'search.php?name=' + encodeURIComponent(terms[t]);
      var html = await DF.fetchText(url, DF.browserHeaders(CINEPLEX_ORIGIN));
      var re = /<a[^>]+href=["']([^"']*view\.php[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
      var m;
      while ((m = re.exec(html)) !== null && candidates.length < 24) {
        var block = m[2];
        var imgMatch = block.match(/<img[^>]*>/i);
        var title = imgMatch ? DF.attr(imgMatch[0], 'alt') : '';
        if (!title) title = DF.stripTags(block);
        if (!title) title = info.titles[0];
        var href = DF.absoluteUrl(url, DF.decodeEntities(m[1]));
        if (seen[href]) continue;
        var year = DF.yearOf(title);
        var score = DF.scoreMatch(title, year, info);
        if (score <= 0) continue;
        seen[href] = true;
        candidates.push({
          url: href,
          title: title,
          year: year,
          score: score,
          exact: DF.exactMatch(title, year, info),
          type: ''
        });
      }
    } catch (e) { /* next term */ }
  }

  var chosen = DF.orderedCandidates(candidates, info, 8);
  if (!chosen.length) return [];

  var watchHeaders = DF.browserHeaders(CINEPLEX_ORIGIN);
  var playHeaders = DF.videoHeaders(CINEPLEX_ORIGIN);
  var batches = await DF.hydrateMany(chosen, async function (candidate) {
    var found = [];
    var viewHtml = await DF.fetchText(candidate.url, watchHeaders);
    var pages = [];
    var re = /href=["']([^"']*player\.php[^"']*)["']/gi;
    var m;
    while ((m = re.exec(viewHtml)) !== null && pages.length < 4) {
      pages.push(DF.absoluteUrl(candidate.url, DF.decodeEntities(m[1])));
    }
    pages.push(candidate.url);

    var htmls = await DF.hydrateMany(pages, async function (pageUrl) {
      return { url: pageUrl, html: await DF.fetchText(pageUrl, watchHeaders) };
    });
    var label = info.mediaType === 'tv'
      ? 'S' + DF.pad2(season) + 'E' + DF.pad2(episode) + ' • ' + candidate.title
      : candidate.title;

    for (var h = 0; h < htmls.length && found.length < 8; h++) {
      var srcs = cineplexSources(htmls[h].html, htmls[h].url);
      for (var s = 0; s < srcs.length && found.length < 8; s++) {
        var src = srcs[s];
        var size = await DF.probeSize(src, playHeaders);
        var stream = DF.makeStream({
          name: 'CinePlex',
          title: label,
          url: src,
          quality: DF.qualityOf(src),
          detail: { raw: src, size: size },
          headers: playHeaders,
          match: candidate.score,
          exact: candidate.exact
        });
        if (stream) found.push(stream);
      }
    }
    return found;
  });

  var out = [];
  for (var b = 0; b < batches.length && out.length < 16; b++) {
    for (var k = 0; k < batches[b].length && out.length < 16; k++) out.push(batches[b][k]);
  }
  return DF.rankStreams(DF.dedupe(out), info);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
}
if (typeof globalThis !== 'undefined') globalThis.getStreams = getStreams;
if (typeof global !== 'undefined') global.getStreams = getStreams;
