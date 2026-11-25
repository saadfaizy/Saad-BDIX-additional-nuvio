/* Cinemax24 provider — appended after DF core by build.js. */

var CINEMAX_API = 'https://backstage.cinemax24.com/api/v1';

function cinemaxTitle(row) {
  return String((row && (row.name || row.title || row.original_title)) || '');
}

function cinemaxYear(row) {
  return DF.yearOf((row && (row.first_air_date || row.release_date)) || '');
}

async function getStreams(tmdbId, mediaType, season, episode) {
  if (DF.disabled('cinemax24')) return [];
  var info = await DF.tmdbInfo(tmdbId, mediaType);
  if (!info.titles.length) return [];

  var isTv = info.mediaType === 'tv';
  var searchPath = isTv ? '/tv?search=' : '/movies?search=';
  var candidates = [];
  var seenIds = {};
  var terms = DF.searchTerms(info, 10);

  for (var t = 0; t < terms.length && candidates.length < 24; t++) {
    try {
      var url = CINEMAX_API + searchPath + encodeURIComponent(terms[t]);
      var json = await DF.fetchJson(url, DF.browserHeaders('https://cinemax24.com/'));
      var rows = Array.isArray(json) ? json : (json.movies || json.tv || json.results || []);
      for (var i = 0; i < rows.length && candidates.length < 24; i++) {
        var row = rows[i];
        if (!row || !row.id || seenIds[row.id]) continue;
        var title = cinemaxTitle(row);
        var year = cinemaxYear(row);
        var exactId = String(row.tmdb_id || '') === String(tmdbId);
        var imdbId = info.imdbId && String(row.imdb_id || '') === String(info.imdbId);
        var score = exactId || imdbId ? 200 : DF.scoreMatch(title, year, info);
        if (score <= 0) continue;
        seenIds[row.id] = true;
        candidates.push({
          id: row.id,
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

  var details = await DF.hydrateMany(chosen, async function (candidate) {
    var detailPath = (isTv ? '/tv/' : '/movies/') + encodeURIComponent(candidate.id);
    return {
      candidate: candidate,
      detail: await DF.fetchJson(CINEMAX_API + detailPath, DF.browserHeaders('https://cinemax24.com/'))
    };
  });

  var out = [];
  for (var d = 0; d < details.length && out.length < 16; d++) {
    var candidate = details[d].candidate;
    var detail = details[d].detail || {};
    var groups = [];

    if (isTv) {
      var episodes = detail.episodes || [];
      var links = DF.episodeLinks(episodes, season, episode);
      for (var e = 0; e < links.length && groups.length < 4; e++) {
        groups.push({ season: links[e].season, episode: links[e].episode, link: links[e].link });
      }
    } else {
      var movieLinks = detail.links || [];
      for (var m = 0; m < movieLinks.length && groups.length < 4; m++) {
        if (DF.isBroken(movieLinks[m])) continue;
        groups.push({ season: null, episode: null, link: movieLinks[m] });
      }
    }

    for (var g = 0; g < groups.length && out.length < 16; g++) {
      var group = groups[g];
      var link = group.link;
      var src = DF.decodeEscaped(String(link.url || link.href || link.file || ''));
      if (!/^https?:\/\//i.test(src)) continue;
      if (!DF.isVideo(src) && String(link.type || '').toLowerCase() !== 'download') continue;

      var subLabels = [];
      var subs = [];
      if (link.subtitle_tracks && link.subtitle_tracks.length) {
        for (var s = 0; s < link.subtitle_tracks.length && s < 3; s++) {
          var st = link.subtitle_tracks[s];
          if (st && st.url) subs.push({
            url: st.url,
            language: st.language || st.label || '',
            label: st.label || st.language || ''
          });
          if (st && (st.label || st.language)) subLabels.push(st.label || st.language);
        }
      }
      var audioLabels = [];
      if (link.audio_tracks && link.audio_tracks.length) {
        for (var a = 0; a < link.audio_tracks.length; a++) {
          var at = link.audio_tracks[a];
          if (at && (at.label || at.language)) audioLabels.push(at.label || at.language);
        }
      }

      var label = candidate.title;
      if (isTv) {
        label = 'S' + DF.pad2(group.season || season) +
          'E' + DF.pad2(group.episode || episode) + ' • ' + label;
      }

      var headers = { 'User-Agent': link.user_agent || DF.UA };
      if (link.referer) headers.Referer = link.referer;
      else headers.Referer = 'https://cinemax24.com/';
      var raw = src + ' ' + String(link.quality || '') + ' ' + String(link.language || '') +
        ' ' + audioLabels.join(' ') + ' ' + subLabels.join(' ');

      var stream = DF.makeStream({
        name: 'Cinemax24',
        title: label,
        url: src,
        quality: DF.qualityOf(String(link.quality || '') + ' ' + src),
        detail: {
          raw: raw,
          language: link.language || audioLabels.join(' '),
          size: link.size_bytes,
          subs: subs.length > 0
        },
        headers: headers,
        subtitles: subs,
        match: candidate.score,
        exact: candidate.exact
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
