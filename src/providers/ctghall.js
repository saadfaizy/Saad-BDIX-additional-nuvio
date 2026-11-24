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
  var terms = DF.searchTerms(info, 6);

  for (var t = 0; t < terms.length && candidates.length < 20; t++) {
    try {
      var url = CTGHALL_API + 'search?search=' + encodeURIComponent(terms[t]);
      var rows = await DF.fetchJson(url);
      if (!Array.isArray(rows)) rows = [];
      for (var i = 0; i < rows.length && candidates.length < 20; i++) {
        var row = rows[i];
        if (!row || !row.id || seenIds[row.id]) continue;
        var type = ctghallRowType(row);
        var title = String(row.title || row.name || '');
        var year = DF.yearOf(String(row.year || row.release_date || ''));
        var exactId = String(row.tmdb_id || '') === String(tmdbId);
        var score = exactId ? 200 : DF.scoreMatch(title, year, info);
        var typeOk = !type || type === wantType ||
          (isTv && type.indexOf('tv') >= 0) ||
          (!isTv && type.indexOf('movie') >= 0);
        if (!typeOk) score = Math.max(0, score - 25);
        if (score < 20) continue;
        seenIds[row.id] = true;
        candidates.push({
          id: row.id,
          title: title,
          year: year,
          score: score,
          exact: exactId || (typeOk && DF.exactMatch(title, year, info)),
          row: row
        });
      }
    } catch (e) { /* next term */ }
  }

  var chosen = DF.pickBest(candidates, info, DF.MAX_STREAMS, 0);
  if (!chosen.length) return [];

  var headers = { 'User-Agent': DF.UA, 'Referer': CTGHALL_ORIGIN };
  var out = [];

  if (!isTv) {
    for (var c = 0; c < chosen.length && out.length < DF.MAX_STREAMS; c++) {
      var raw = String(chosen[c].row.file_path || chosen[c].row.url || chosen[c].row.path || '');
      var movieUrl = CTGHALL_API + 'stream/video/stream?type=movies&id=' + encodeURIComponent(chosen[c].id);
      var size = await DF.probeSize(movieUrl, headers);
      var stream = DF.makeStream({
        name: 'CTGHall',
        title: chosen[c].title,
        url: movieUrl,
        quality: DF.qualityOf(raw),
        detail: {
          raw: raw,
          language: chosen[c].row.languages || raw,
          size: size
        },
        headers: headers,
        match: chosen[c].score,
        exact: chosen[c].exact
      });
      if (stream) out.push(stream);
    }
    return DF.rankStreams(DF.dedupe(out), info);
  }

  var wantedSeason = parseInt(season, 10) || 1;
  var wantedEpisode = parseInt(episode, 10) || null;

  for (var k = 0; k < chosen.length && out.length < DF.MAX_STREAMS; k++) {
    var showRaw = String(chosen[k].row.file_path || chosen[k].row.url || chosen[k].row.path || '');
    var episodes = [];
    try {
      episodes = await DF.fetchJson(CTGHALL_API + 'tv-shows/' + encodeURIComponent(chosen[k].id) + '/' + wantedSeason);
    } catch (e) { continue; }
    if (!Array.isArray(episodes)) episodes = [];

    for (var e = 0; e < episodes.length && out.length < DF.MAX_STREAMS; e++) {
      var ep = episodes[e];
      if (!ep || !ep.id) continue;
      if (wantedEpisode && parseInt(ep.episode_number, 10) !== wantedEpisode) continue;
      var label = 'S' + DF.pad2(ep.season_number || wantedSeason) +
        'E' + DF.pad2(ep.episode_number || wantedEpisode) + ' • ' + chosen[k].title;
      var url = CTGHALL_API + 'stream/video/stream?type=tv_shows&id=' + encodeURIComponent(ep.id);
      var epSize = await DF.probeSize(url, headers);
      var epRaw = String(ep.name || '') + ' ' + showRaw;
      var stream = DF.makeStream({
        name: 'CTGHall',
        title: label,
        url: url,
        quality: DF.qualityOf(epRaw),
        detail: {
          raw: epRaw,
          language: chosen[k].row.languages || showRaw,
          size: epSize
        },
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
