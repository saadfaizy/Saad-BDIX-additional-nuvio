/* WoW Movie Zone provider — appended after DF core by build.js. */

var WOW_ORIGIN = 'http://172.27.27.84';
var WOW_MOVIES = '/GalleryForMovie/upload/all/all/all/all';
var WOW_RECENT = '/GalleryForMovie/recent/all/all/all/all';
var WOW_SERIES = '/galleryForTv/tv_series/all/all';

async function wowFetch(url) {
  var lastError;
  for (var attempt = 0; attempt < 3; attempt++) {
    try { return await DF.fetchText(url); }
    catch (e) { lastError = e; }
  }
  throw lastError;
}

function wowLastPage(html) {
  var re = /page=(\d+)/gi;
  var m;
  var max = 1;
  while ((m = re.exec(String(html || ''))) !== null) {
    var n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max;
}

function wowCards(html) {
  var re = /<h3 class="card__title"><a href="([^"]+)">([^<]+)<\/a>/gi;
  var m;
  var out = [];
  while ((m = re.exec(String(html || ''))) !== null) {
    var href = DF.decodeEntities(m[1]);
    var title = DF.stripTags(m[2]);
    if (/^https?:\/\//i.test(href) && title) out.push({ href: href, title: title });
  }
  return out;
}

async function wowCrawl(path, info, maxPages, want) {
  var target = want || DF.MAX_STREAMS;
  var candidates = [];
  var seen = {};
  var page = 1;
  var limit = maxPages;
  while (page <= limit && candidates.length < target * 3) {
    var url = WOW_ORIGIN + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page;
    var html;
    try { html = await wowFetch(url); }
    catch (e) { break; }
    if (page === 1) limit = Math.min(limit, wowLastPage(html));
    var cards = wowCards(html);
    for (var i = 0; i < cards.length && candidates.length < target * 3; i++) {
      var card = cards[i];
      if (seen[card.href]) continue;
      var year = DF.yearOf(card.title);
      var score = DF.scoreMatch(card.title, year, info);
      seen[card.href] = true;
      candidates.push({
        href: card.href,
        title: card.title,
        year: year,
        score: score,
        exact: DF.exactMatch(card.title, year, info)
      });
    }
    page++;
  }
  candidates.sort(function (a, b) { return b.score - a.score; });
  return candidates.slice(0, target);
}

function wowHasUrl(items, url) {
  for (var i = 0; i < items.length; i++) {
    if (items[i] && items[i].url === url) return true;
  }
  return false;
}

function wowMovieSources(html) {
  var out = [];
  var m;
  var re = /<source[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((m = re.exec(String(html || ''))) !== null) {
    var src = DF.decodeEntities(m[1]);
    if (/^https?:\/\//i.test(src) && !wowHasUrl(out, src)) out.push({ label: '', url: src });
  }
  var dre = /(?:href=["']([^"']+)["'][^>]*class=["'][^"']*header__download|class=["'][^"']*header__download[^"']*["'][^>]*href=["']([^"']+)["'])/gi;
  while ((m = dre.exec(String(html || ''))) !== null) {
    var dl = DF.decodeEntities(m[1] || m[2]);
    if (/^https?:\/\//i.test(dl) && !wowHasUrl(out, dl)) out.push({ label: '', url: dl });
  }
  var mkvRe = /["'](https?:\/\/[^"']+\.mkv(?:\?[^"']*)?)["']/gi;
  while ((m = mkvRe.exec(String(html || ''))) !== null) {
    var mkv = DF.decodeEntities(m[1]);
    if (!wowHasUrl(out, mkv)) out.push({ label: '', url: mkv });
  }
  return out;
}

function wowEpisodes(html) {
  var out = [];
  var re = /<tr>([\s\S]*?)<\/tr>/gi;
  var m;
  while ((m = re.exec(String(html || ''))) !== null) {
    var row = m[1];
    var labelMatch = row.match(/<td>([\s\S]*?)<\/td>/i);
    var playMatch = row.match(/play_video\(\s*['"]([^'"]+)['"]\s*\)/i);
    var dlMatch = row.match(/header__download[^>]*href=["']([^"']+)["']/i);
    var url = playMatch ? DF.decodeEntities(playMatch[1]) : (dlMatch ? DF.decodeEntities(dlMatch[1]) : '');
    if (!url || !/^https?:\/\//i.test(url)) continue;
    out.push({
      label: labelMatch ? DF.stripTags(labelMatch[1]) : '',
      url: url
    });
  }
  return out;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  if (DF.disabled('wow-movie-zone')) return [];
  var info = await DF.tmdbInfo(tmdbId, mediaType);
  if (!info.titles.length) return [];

  var isTv = info.mediaType === 'tv';
  var paths = isTv
    ? [{ path: '/', pages: 1 }, { path: WOW_SERIES, pages: 12 }]
    : [{ path: '/', pages: 1 }, { path: WOW_MOVIES, pages: 10 }, { path: WOW_RECENT, pages: 6 }];
  var candidates = [];
  var seen = {};
  for (var p = 0; p < paths.length && candidates.length < DF.MAX_STREAMS; p++) {
    var found = await wowCrawl(paths[p].path, info, paths[p].pages, DF.MAX_STREAMS);
    for (var f = 0; f < found.length && candidates.length < DF.MAX_STREAMS; f++) {
      if (seen[found[f].href]) continue;
      seen[found[f].href] = true;
      candidates.push(found[f]);
    }
  }

  var chosen = DF.pickBest(candidates, info, DF.MAX_STREAMS, 0);
  if (!chosen.length) return [];

  var headers = { 'User-Agent': DF.UA, 'Referer': WOW_ORIGIN + '/' };
  var out = [];
  for (var k = 0; k < chosen.length && out.length < DF.MAX_STREAMS; k++) {
    var pageHtml;
    try { pageHtml = await wowFetch(chosen[k].href); }
    catch (e) { continue; }

    var items = isTv ? wowEpisodes(pageHtml) : wowMovieSources(pageHtml);
    var wantedSeason = parseInt(season, 10) || null;
    var wantedEpisode = parseInt(episode, 10) || null;

    for (var i = 0; i < items.length && out.length < DF.MAX_STREAMS; i++) {
      var item = items[i];
      var label = chosen[k].title;
      if (isTv) {
        var ep = DF.episodeOf(item.label) || DF.episodeOf(item.url);
        if (ep) {
          if (wantedSeason && ep.season !== wantedSeason) continue;
          if (wantedEpisode && ep.episode !== wantedEpisode) continue;
          label = 'S' + DF.pad2(ep.season) + 'E' + DF.pad2(ep.episode) + ' • ' +
            (item.label || chosen[k].title);
        } else {
          label = 'S' + DF.pad2(wantedSeason || 1) + 'E' + DF.pad2(wantedEpisode || 1) + ' • ' +
            chosen[k].title;
        }
      }
      var raw = label + ' ' + DF.decodePath(item.url);
      var size = await DF.probeSize(item.url, headers);
      var stream = DF.makeStream({
        name: 'WoW Movie Zone',
        title: label,
        url: item.url,
        quality: DF.qualityOf(raw),
        detail: { raw: raw, size: size },
        headers: headers,
        match: chosen[k].score,
        exact: chosen[k].exact
      });
      if (stream) out.push(stream);
    }
  }
  return DF.rankStreams(DF.dedupe(out), info);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
}
if (typeof globalThis !== 'undefined') globalThis.getStreams = getStreams;
if (typeof global !== 'undefined') global.getStreams = getStreams;
