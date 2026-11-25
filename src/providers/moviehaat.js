/* MovieHaat provider — appended after DF core by build.js. */

var MOVIEHAAT_API = 'https://moviehaat.net:8989/api/';
var MOVIEHAAT_ORIGIN = 'https://moviehaat.net/';

async function getStreams(tmdbId, mediaType, season, episode) {
  if (DF.disabled('moviehaat')) return [];
  var info = await DF.tmdbInfo(tmdbId, mediaType);
  if (!info.titles.length) return [];

  var isTv = info.mediaType === 'tv';
  var candidates = [];
  var seenIds = {};
  var terms = DF.searchTerms(info, 10);

  for (var t = 0; t < terms.length && candidates.length < 24; t++) {
    try {
      var search = await DF.postJson(MOVIEHAAT_API + 'searchmovies', { search: terms[t] },
        DF.browserHeaders(MOVIEHAAT_ORIGIN));
      var rows = isTv ? (search.series || []) : (search.movies || []);
      for (var i = 0; i < rows.length && candidates.length < 24; i++) {
        var row = rows[i];
        if (!row) continue;
        var id = isTv ? row.series_id : row.movie_id;
        if (!id || seenIds[id]) continue;
        var title = String(row.title || '');
        var year = DF.yearOf(row.release_year || row.release_date || '');
        var exactId = String(row.tmdb_id || '') === String(tmdbId);
        var imdbId = info.imdbId && String(row.imdb_id || '') === String(info.imdbId);
        var score = exactId || imdbId ? 200 : DF.scoreMatch(title, year, info);
        if (score <= 0) continue;
        seenIds[id] = true;
        candidates.push({
          id: id,
          title: title,
          year: year,
          score: score,
          exact: exactId || imdbId || DF.exactMatch(title, year, info)
        });
      }
    } catch (e) { /* next term */ }
  }

  var chosen = DF.orderedCandidates(candidates, info, 8);
  if (!chosen.length) return [];
  var headers = DF.videoHeaders(MOVIEHAAT_ORIGIN);
  var wantSeason = parseInt(season, 10) || null;
  var wantEpisode = parseInt(episode, 10) || null;

  var batches = await DF.hydrateMany(chosen, async function (candidate) {
    var found = [];
    if (!isTv) {
      var detail = await DF.fetchJson(MOVIEHAAT_API + 'getmoviebyid/' + encodeURIComponent(candidate.id),
        DF.browserHeaders(MOVIEHAAT_ORIGIN));
      var results = (detail && detail.results) || [];
      if (!Array.isArray(results)) results = [results];
      for (var r = 0; r < results.length && found.length < 8; r++) {
        var result = results[r];
        if (!result || DF.isBroken(result.video_path)) continue;
        var raw = DF.decodePath(result.video_path) + ' ' + String(result.full_title || '') +
          ' ' + String(result.file_name_1 || '') + ' ' + String(result.quality_1 || '') +
          ' ' + String(result.category || '') + ' ' + String(result.sub_category || '');
        var stream = DF.makeStream({
          name: 'MovieHaat',
          title: candidate.title,
          url: result.video_path,
          quality: DF.qualityOf(raw),
          detail: {
            raw: raw,
            language: result.language || result.language_list || result.sub_category || '',
            size: result.video_size_1
          },
          headers: headers,
          match: candidate.score,
          exact: candidate.exact
        });
        if (stream) found.push(stream);
      }
      return found;
    }

    var eps = await DF.postJson(MOVIEHAAT_API + 'seriesepisodes', { series_id: candidate.id },
      DF.browserHeaders(MOVIEHAAT_ORIGIN));
    var rows = (eps && (eps.results || eps.episode)) || [];
    if (!Array.isArray(rows)) rows = [rows];
    for (var e = 0; e < rows.length && found.length < 8; e++) {
      var ep = rows[e];
      if (!ep || DF.isBroken(ep.video_path)) continue;
      var s = DF.firstNumber(ep, ['seasonNumber', 'season_number', 'season']) ||
        (DF.episodeFromPath(ep.video_path) || {}).season || 0;
      var n = DF.firstNumber(ep, ['episodeNumber', 'episode_number', 'episode']) ||
        (DF.episodeFromPath(ep.video_path) || {}).episode || 0;
      if (wantSeason && s && s !== wantSeason) continue;
      if (wantEpisode && n && n !== wantEpisode) continue;
      var label = 'S' + DF.pad2(s || season) + 'E' + DF.pad2(n || episode) + ' • ' + candidate.title;
      var rawEp = DF.decodePath(ep.video_path) + ' ' + String(ep.name_1 || '') +
        ' ' + String(ep.quality_1 || '');
      var epStream = DF.makeStream({
        name: 'MovieHaat',
        title: label,
        url: ep.video_path,
        quality: DF.qualityOf(rawEp),
        detail: {
          raw: rawEp,
          language: ep.language || '',
          size: ep.video_size_1
        },
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
