/* CTGHall provider — appended after DF core by build.js. */

var CTGHALL_API = 'https://www.ctghall.com/api/';
var CTGHALL_ORIGIN = 'https://www.ctghall.com/';

function ctghallRowType(row) {
  if (!row) return '';
  if (row.type) return String(row.type).toLowerCase();
  if (row.Library && row.Library.type) return String(row.Library.type).toLowerCase();
  return '';
}

async function getStreams(tmdbId, mediaType, season, episode) {
  if (DF.disabled('ctghall')) return [];
  var info = await DF.tmdbInfo(tmdbId, mediaType);
  if (!info.titles.length) return [];

  var isTv = info.mediaType === 'tv';
  var wantType = isTv ? 'tv' : 'movie';
  var candidates = [];
  var seenIds = {};
  var terms = DF.searchTerms(info, 8);

  for (var t = 0; t < terms.length && candidates.length < 24; t++) {
    try {
      var url = CTGHALL_API + 'search?search=' + encodeURIComponent(terms[t]);
      var rows = await DF.fetchJson(url, DF.browserHeaders(CTGHALL_ORIGIN));
      if (!Array.isArray(rows)) rows = [];
      for (var i = 0; i < rows.length && candidates.length < 24; i++) {
        var row = rows[i];
        if (!row || !row.id || seenIds[row.id]) continue;
        var type = ctghallRowType(row);
        var title = String(row.title || row.name || '');
        var year = DF.yearOf(String(row.year || row.release_date || ''));
        var exactId = String(row.tmdb_id || '') === String(tmdbId);
        var imdbId = info.imdbId && String(row.imdb_id || '') === String(info.imdbId);
        var score = exactId || imdbId ? 200 : DF.scoreMatch(title, year, info);
        var typeOk = !type || type === wantType ||
          (isTv && type.indexOf('tv') >= 0) ||
          (!isTv && type.indexOf('movie') >= 0);
        if (!typeOk) score = Math.max(0, score - 25);
        if (score <= 0) continue;
        seenIds[row.id] = true;
        candidates.push({
          id: row.id,
          title: title,
          year: year,
          score: score,
          exact: exactId || imdbId || (typeOk && DF.exactMatch(title, year, info)),
          row: row
        });
      }
    } catch (e) { /* next term */ }
  }

  var chosen = DF.orderedCandidates(candidates, info, 8);
  if (!chosen.length) return [];
  var headers = DF.videoHeaders(CTGHALL_ORIGIN);
  var wantedSeason = parseInt(season, 10) || 1;
  var wantedEpisode = parseInt(episode, 10) || null;

  var batches = await DF.hydrateMany(chosen, async function (candidate) {
    var found = [];
    var raw = String(candidate.row.file_path || candidate.row.url || candidate.row.path || '');

    if (!isTv) {
      var movieUrl = CTGHALL_API + 'stream/video/stream?type=movies&id=' + encodeURIComponent(candidate.id);
      if (!DF.isBroken(movieUrl)) {
        var size = await DF.probeSize(movieUrl, headers);
        var stream = DF.makeStream({
          name: 'CTGHall',
          title: candidate.title,
          url: movieUrl,
          quality: DF.qualityOf(raw),
          detail: { raw: raw, language: candidate.row.languages || raw, size: size },
          headers: headers,
          match: candidate.score,
          exact: candidate.exact
        });
        if (stream) found.push(stream);
      }
      return found;
    }

    var episodes = [];
    try {
      episodes = await DF.fetchJson(
        CTGHALL_API + 'tv-shows/' + encodeURIComponent(candidate.id) + '/' + wantedSeason,
        DF.browserHeaders(CTGHALL_ORIGIN)
      );
    } catch (e) { return found; }
    if (!Array.isArray(episodes)) episodes = [];
    for (var i = 0; i < episodes.length && found.length < 8; i++) {
      var ep = episodes[i];
      if (!ep || !ep.id) continue;
      var s = DF.firstNumber(ep, ['season_number', 'seasonNumber', 'season']) || wantedSeason;
      var n = DF.firstNumber(ep, ['episode_number', 'episodeNumber', 'episode']) ||
        ((DF.episodeFromPath(String(ep.name || ep.title || '')) || {}).episode);
      if (wantedSeason && s !== wantedSeason) continue;
      if (wantedEpisode && n !== wantedEpisode) continue;
      var url = CTGHALL_API + 'stream/video/stream?type=tv_shows&id=' + encodeURIComponent(ep.id);
      if (DF.isBroken(url)) continue;
      var epSize = await DF.probeSize(url, headers);
      var epRaw = String(ep.name || ep.title || '') + ' ' + raw;
      var label = 'S' + DF.pad2(s) + 'E' + DF.pad2(n) + ' • ' + candidate.title;
      var epStream = DF.makeStream({
        name: 'CTGHall',
        title: label,
        url: url,
        quality: DF.qualityOf(epRaw),
        detail: { raw: epRaw, language: candidate.row.languages || raw, size: epSize },
        headers: headers,
        match: candidate.score,
        exact: candidate.exact
      });
      if (epStream) found.push(epStream);
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
