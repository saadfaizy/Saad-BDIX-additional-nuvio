/* DhakaFlix provider — appended after DF core by build.js. */

// .4 is only the portal and .8 is games/software, so only media roots are used.
var DHAKAFLIX_SERVERS = [
  { origin: 'http://172.16.50.7', root: '/DHAKA-FLIX-7/' },
  { origin: 'http://172.16.50.10', root: '/DHAKA-FLIX-10/' },
  { origin: 'http://172.16.50.12', root: '/DHAKA-FLIX-12/' },
  { origin: 'http://172.16.50.14', root: '/DHAKA-FLIX-14/' }
];

async function getStreams(tmdbId, mediaType, season, episode) {
  if (DF.disabled('dhakaflix')) return [];
  var info = await DF.tmdbInfo(tmdbId, mediaType);
  return DF.h5aiServersStreams(
    DHAKAFLIX_SERVERS,
    'DhakaFlix',
    info,
    info.mediaType,
    season,
    episode,
    'dhakaflix'
  );
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
}
if (typeof globalThis !== 'undefined') globalThis.getStreams = getStreams;
if (typeof global !== 'undefined') global.getStreams = getStreams;
