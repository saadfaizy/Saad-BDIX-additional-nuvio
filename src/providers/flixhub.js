/* FlixHub provider — appended after DF core by build.js. */

var FLIXHUB_ORIGIN = 'https://flixhub.net/';

async function getStreams(tmdbId, mediaType, season, episode) {
  if (DF.disabled('flixhub')) return [];
  var info = await DF.tmdbInfo(tmdbId, mediaType);
  if (!info.titles.length) return [];

  var candidates = [];
  var seen = {};
  var terms = DF.searchTerms(info, 8);
  for (var t = 0; t < terms.length && candidates.length < 24; t++) {
    try {
      var url = FLIXHUB_ORIGIN + 'search/suggestions?q=' + encodeURIComponent(terms[t]);
      var json = await DF.fetchJson(url, DF.browserHeaders(FLIXHUB_ORIGIN));
      var rows = json.results || [];
      for (var i = 0; i < rows.length && candidates.length < 24; i++) {
        var r = rows[i];
        if (!r || !r.url || seen[r.url]) continue;
        if (/\/search\/resolve/i.test(r.url)) continue;
        var title = r.title || info.titles[0];
        var year = parseInt(r.year, 10) || DF.yearOf(r.release_date || '');
        var type = r.content_type || r.type || '';
        var exactId = String(r.tmdb_id || '') === String(tmdbId);
        var imdbId = info.imdbId && String(r.imdb_id || '') === String(info.imdbId);
        var score = exactId || imdbId ? 200 : DF.scoreMatch(title, year, info);
        var exact = exactId || imdbId || (DF.exactMatch(title, year, info) &&
          (!type || !info.mediaType || type === info.mediaType));
        if (type && info.mediaType && type !== info.mediaType) score = Math.max(0, score - 25);
        if (score <= 0) continue;
        seen[r.url] = true;
        candidates.push({
          url: r.url,
          title: title,
          year: year,
          score: score,
          exact: exact,
          type: type
        });
      }
    } catch (e) { /* next term */ }
  }

  var chosen = DF.orderedCandidates(candidates, info, 8);
  if (!chosen.length) return [];

  var watchHeaders = DF.browserHeaders(FLIXHUB_ORIGIN);
  var playHeaders = DF.videoHeaders(FLIXHUB_ORIGIN);
  var batches = await DF.hydrateMany(chosen, async function (candidate) {
    var found = [];
    var page = candidate.url;
    var html = await DF.fetchText(page, watchHeaders);
    var re = /<source[^>]+src=["']([^"']+)["'][^>]*>/gi;
    var m;
    while ((m = re.exec(html)) !== null && found.length < 8) {
      var rawSrc = DF.decodeEntities(m[1]);
      if (DF.isBroken(rawSrc)) continue;
      var src = /^https?:\/\//i.test(rawSrc) ? rawSrc : DF.absoluteUrl(page, rawSrc);
      if (!/\/stream\//i.test(src) && !DF.isVideo(src)) continue;
      var label = info.mediaType === 'tv'
        ? 'S' + DF.pad2(season) + 'E' + DF.pad2(episode) + ' • ' + candidate.title
        : candidate.title;
      var size = await DF.probeSize(src, playHeaders);
      var stream = DF.makeStream({
        name: 'FlixHub',
        title: label,
        url: src,
        quality: DF.qualityOf(m[0] + ' ' + src),
        detail: { raw: m[0] + ' ' + src, size: size },
        headers: playHeaders,
        match: candidate.score,
        exact: candidate.exact
      });
      if (stream) found.push(stream);
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
