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
