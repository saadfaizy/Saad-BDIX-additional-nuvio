/* CinePlex provider — appended after DF core by build.js. */

async function getStreams(tmdbId, mediaType, season, episode) {
  if (DF.disabled('cineplex')) return [];
  var info = await DF.tmdbInfo(tmdbId, mediaType);
  if (!info.titles.length) return [];

  var candidates = [];
  var seen = {};
  var terms = DF.searchTerms(info, 6);
  for (var t = 0; t < terms.length && candidates.length < 20; t++) {
    try {
      var url = 'http://cineplexbd.net/search.php?name=' + encodeURIComponent(terms[t]);
      var html = await DF.fetchText(url);
      var re = /<a[^>]+href=["']([^"']*view\.php[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
      var m;
      while ((m = re.exec(html)) !== null && candidates.length < 20) {
        var block = m[2];
        var imgMatch = block.match(/<img[^>]*>/i);
        var title = imgMatch ? DF.attr(imgMatch[0], 'alt') : '';
        if (!title) title = DF.stripTags(block);
        if (!title) title = info.titles[0];
        var href = DF.absoluteUrl(url, DF.decodeEntities(m[1]));
        if (seen[href]) continue;
        var year = DF.yearOf(title);
        var score = DF.scoreMatch(title, year, info);
        if (score < 20) continue;
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

  var chosen = DF.pickBest(candidates, info, DF.MAX_STREAMS, 0);
  if (!chosen.length) return [];

  var out = [];
  var headers = { 'User-Agent': DF.UA, 'Referer': 'http://cineplexbd.net/' };
  for (var k = 0; k < chosen.length && out.length < DF.MAX_STREAMS; k++) {
    try {
      var viewUrl = chosen[k].url;
      var viewHtml = await DF.fetchText(viewUrl);
      var hrefMatch = viewHtml.match(/href=["']([^"']*player\.php[^"']*)["']/i);
      var playerUrl = hrefMatch
        ? DF.absoluteUrl(viewUrl, DF.decodeEntities(hrefMatch[1]))
        : viewUrl;
      var playerHtml = playerUrl === viewUrl ? viewHtml : await DF.fetchText(playerUrl);
      var label = info.mediaType === 'tv'
        ? 'S' + DF.pad2(season) + 'E' + DF.pad2(episode) + ' • ' + chosen[k].title
        : chosen[k].title;

      var rawSources = [];
      var srcRe = /(?:const\s+videoSrc\s*=\s*|["']videoSrc["']\s*:\s*)["']([^"']+)["']/gi;
      var sm;
      while ((sm = srcRe.exec(playerHtml)) !== null) rawSources.push(DF.decodeEntities(sm[1]));
      var tagRe = /<source[^>]+src=["']([^"']+)["'][^>]*>/gi;
      while ((sm = tagRe.exec(playerHtml)) !== null) rawSources.push(DF.decodeEntities(sm[1]));

      for (var s = 0; s < rawSources.length && out.length < DF.MAX_STREAMS; s++) {
        var rawSrc = rawSources[s];
        var src = DF.absoluteUrl(playerUrl, rawSrc);
        if (!DF.isVideo(src)) continue;
        var raw = rawSrc + ' ' + src;
        var size = await DF.probeSize(src, headers);
        var stream = DF.makeStream({
          name: 'CinePlex',
          title: label,
          url: src,
          quality: DF.qualityOf(raw),
          detail: { raw: raw, size: size },
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
