/* Quick plugin test harness. Run: node test/test.js */

const path = require('path');

const realFetch = globalThis.fetch;
const META = {
  '1': { title: 'Vibe', year: '2026-01-01', type: 'movie' },
  '1654566': { title: 'Vibe', year: '2026-09-18', type: 'movie', lang: 'ko' },
  '773867': { title: 'Seoul Vibe', year: '2022-08-26', type: 'movie', lang: 'ko', imdb: 'tt13410882' },
  '3': { title: 'Squid Game', year: '2021-01-01', type: 'tv', imdb: 'tt10919420' },
  '4': { title: 'Final Table', year: '2026-01-01', type: 'tv' },
  '5': { title: 'Seoul Vibe', year: '2022-01-01', type: 'movie' },
  '6': { title: 'Wandance', year: '2025-01-01', type: 'tv' },
  '7': { title: 'Possible Love', year: '2026-01-01', type: 'movie' },
  '8': { title: 'Doctor X Age of the White Mafia', year: '2026-01-01', type: 'tv' }
};

globalThis.TMDB_API_KEY = 'test-key';
globalThis.fetch = async function (url, options) {
  const u = String(url);
  const m = u.match(/api\.themoviedb\.org\/3\/(movie|tv)\/(\d+)/);
  if (m) {
    const data = META[m[2]] || { title: 'Test', year: '2025-01-01', type: m[1] };
    const external_ids = { imdb_id: data.imdb || '' };
    const body = m[1] === 'tv'
      ? { name: data.title, original_name: data.title, first_air_date: data.year, original_language: data.lang || 'en', external_ids }
      : { title: data.title, original_title: data.title, release_date: data.year, original_language: data.lang || 'en', external_ids };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
      json: async () => body,
    };
  }
  return realFetch(url, options);
};

async function run(id, tmdbId, mediaType, season, episode) {
  const provider = require(path.join(__dirname, '..', 'providers', id + '.js'));
  const started = Date.now();
  let streams = [];
  try {
    streams = await provider.getStreams(tmdbId, mediaType, season, episode) || [];
  } catch (e) {
    console.log(id.padEnd(18) + ' ERROR ' + e.message);
    return;
  }
  const count = streams.length;
  const exact = streams.filter((s) => !!s._exact).length;
  const earlyFallback = streams.slice(0, 2).some((s) => !s._exact);
  const status = earlyFallback
    ? 'BAD'
    : (count >= 4 && count <= 5 ? 'OK' : (count === 0 ? 'EMPTY' : 'ACCURATE'));
  const listing = streams.length
    ? streams.map((s, i) => {
        const tag = s._exact ? 'EXACT  ' : (Number(s._match) >= 40 ? 'CLOSE  ' : 'FALLBACK');
        return '  ' + (i + 1) + '. ' + tag + ' ' + String(s.name).replace(/^[\uFEFF\u200B]+/, '');
      }).join('\n')
    : '  (none)';
  console.log(
    id.padEnd(18) + count + ' stream(s), ' + exact + ' exact, ' + status +
      ' in ' + (Date.now() - started) + 'ms\n' + listing
  );
}

(async () => {
  console.log('Target: 4-5 unique streams per source where variants exist\n');
  await run('flixhub', '1654566', 'movie');
  await run('cineplex', '1654566', 'movie');
  await run('cinemax24', '1654566', 'movie');
  await run('cinemax24', '4', 'tv', 1, 1);
  await run('moviehaat', '773867', 'movie');
  await run('moviehaat', '3', 'tv', 1, 1);
  await run('ctghall', '1654566', 'movie');
  await run('ctghall', '6', 'tv', 1, 1);

  if (process.env.TEST_LOCAL === '1') {
    await run('dhakaflix', '773867', 'movie');
    await run('dhakaflix', '3', 'tv', 1, 1);
    await run('wow-movie-zone', '7', 'movie');
    await run('wow-movie-zone', '8', 'tv', 1, 1);
  } else {
    console.log('WoW Movie Zone skipped. Set TEST_LOCAL=1 when running on its LAN.');
  }
})();
