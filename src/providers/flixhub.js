/* FlixHub provider — appended after DF core by build.js. */

async function getStreams(tmdbId, mediaType, season, episode) {
  if (DF.disabled('flixhub')) return [];
  var info = await DF.tmdbInfo(tmdbId, mediaType);
  if (!info.titles.length) return [];

  var candidates = [];
  var seen = {};
  var terms = DF.searchTerms(info, 6);
  for (var t = 0; t < terms.length && candidates.length < 20; t++) {
    try {
      var url = 'https://flixhub.net/search/suggestions?q=' + encodeURIComponent(terms[t]);
      var json = await DF.fetchJson(url);
      var rows = json.results || [];
      for (var i = 0; i < rows.length && candidates.length < 20; i++) {
        var r = rows[i];
        if (!r || !r.url || seen[r.url]) continue;
        if (/\/search\/resolve/i.test(r.url)) continue;
        var title = r.title || info.titles[0];
        var year = parseInt(r.year, 10) || DF.yearOf(r.release_date || '');
        var type = r.content_type || r.type || '';
        var exactId = String(r.tmdb_id || '') === String(tmdbId);
        var score = exactId ? 200 : DF.scoreMatch(title, year, info);
        var exact = exactId || (DF.exactMatch(title, year, info) &&
          (!type || !info.mediaType || type === info.mediaType));
        if (type && info.mediaType && type !== info.mediaType) score = Math.max(0, score - 25);
        if (score < 0) continue;
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

  var chosen = DF.pickBest(candidates, info, DF.MAX_STREAMS, 0);
  if (!chosen.length) return [];

  var out = [];
  var headers = { 'User-Agent': DF.UA, 'Referer': 'https://flixhub.net/' };
  for (var k = 0; k < chosen.length && out.length < DF.MAX_STREAMS; k++) {
    try {
      var page = chosen[k].url;
      var html = await DF.fetchText(page);
      var re = /<source[^>]+src=["']([^"']+)["'][^>]*>/gi;
      var m;
      var n = 0;
      while ((m = re.exec(html)) !== null && out.length < DF.MAX_STREAMS && n < DF.MAX_STREAMS) {
        var rawSrc = DF.decodeEntities(m[1]);
        var src = /^https?:\/\//i.test(rawSrc) ? rawSrc : DF.absoluteUrl(page, rawSrc);
        if (!/\/stream\//i.test(src) && !DF.isVideo(src)) { n++; continue; }
        var label = info.mediaType === 'tv'
          ? 'S' + DF.pad2(season) + 'E' + DF.pad2(episode) + ' • ' + chosen[k].title
          : chosen[k].title;
        var raw = m[0] + ' ' + src;
        var size = await DF.probeSize(src, headers);
        var s = DF.makeStream({
          name: 'FlixHub',
          title: label,
          url: src,
          quality: DF.qualityOf(raw),
          detail: { raw: raw, size: size },
          headers: headers,
          match: chosen[k].score,
          exact: chosen[k].exact
        });
        if (s) out.push(s);
        n++;
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
