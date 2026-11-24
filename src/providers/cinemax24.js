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
  var terms = DF.searchTerms(info, 8);

  for (var t = 0; t < terms.length && candidates.length < 20; t++) {
    try {
      var url = CINEMAX_API + searchPath + encodeURIComponent(terms[t]);
      var json = await DF.fetchJson(url);
      var rows = Array.isArray(json) ? json : (json.movies || json.tv || json.results || []);
      for (var i = 0; i < rows.length && candidates.length < 20; i++) {
        var row = rows[i];
        if (!row || !row.id || seenIds[row.id]) continue;
        var title = cinemaxTitle(row);
        var year = cinemaxYear(row);
        var exactId = String(row.tmdb_id || '') === String(tmdbId);
        var score = exactId ? 200 : DF.scoreMatch(title, year, info);
        if (score < 20) continue;
        seenIds[row.id] = true;
        candidates.push({
          id: row.id,
          title: title,
          year: year,
          score: score,
          exact: exactId || DF.exactMatch(title, year, info)
        });
      }
    } catch (e) { /* next term */ }
  }

  var chosen = DF.pickBest(candidates, info, DF.MAX_STREAMS, 0);
  if (!chosen.length) return [];

  var out = [];
  for (var c = 0; c < chosen.length && out.length < DF.MAX_STREAMS; c++) {
    var detail;
    try {
      var detailPath = (isTv ? '/tv/' : '/movies/') + encodeURIComponent(chosen[c].id);
      detail = await DF.fetchJson(CINEMAX_API + detailPath);
    } catch (e) { continue; }

    var groups = [];
    if (isTv) {
      var episodes = detail.episodes || [];
      var wantedSeason = parseInt(season, 10) || null;
      var wantedEpisode = parseInt(episode, 10) || null;
      for (var e = 0; e < episodes.length; e++) {
        var ep = episodes[e];
        if (wantedSeason && parseInt(ep.season_number, 10) !== wantedSeason) continue;
        if (wantedEpisode && parseInt(ep.episode_number, 10) !== wantedEpisode) continue;
        groups.push({ episode: ep, links: ep.links || [] });
        if (groups.length >= 3) break;
      }
    } else {
      groups.push({ episode: null, links: detail.links || [] });
    }

    for (var g = 0; g < groups.length && out.length < DF.MAX_STREAMS; g++) {
      var group = groups[g];
      var label = chosen[c].title;
      if (isTv && group.episode) {
        label = 'S' + DF.pad2(group.episode.season_number || season) +
          'E' + DF.pad2(group.episode.episode_number || episode) + ' • ' + label;
      }

      for (var k = 0; k < group.links.length && out.length < DF.MAX_STREAMS; k++) {
        var link = group.links[k];
        var src = DF.decodeEscaped(link.url || '');
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

        var headers = { 'User-Agent': link.user_agent || DF.UA };
        if (link.referer) headers.Referer = link.referer;
        var raw = src + ' ' + (link.quality || '') + ' ' + (link.language || '') +
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
          match: chosen[c].score,
          exact: chosen[c].exact
        });
        if (stream) out.push(stream);
      }
    }
  }
  return DF.rankStreams(DF.dedupe(out), info);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
}
if (typeof globalThis !== 'undefined') globalThis.getStreams = getStreams;
if (typeof global !== 'undefined') global.getStreams = getStreams;
