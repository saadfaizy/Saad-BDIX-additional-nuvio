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
