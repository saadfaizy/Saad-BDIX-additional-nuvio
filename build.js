const fs = require('fs');
const path = require('path');

const root = __dirname;
const core = fs.readFileSync(path.join(root, 'src', 'core.js'), 'utf8');
const outDir = path.join(root, 'providers');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function writeProvider(id, source) {
  const out = core + '\n\n' + source.trim() + '\n';
  fs.writeFileSync(path.join(outDir, id + '.js'), out, 'utf8');
  console.log('built providers/' + id + '.js');
}

const providers = [
  'flixhub',
  'cineplex',
  'cinemax24',
  'moviehaat',
  'ctghall',
  'wow-movie-zone'
];

providers.forEach(function (id) {
  const source = fs.readFileSync(path.join(root, 'src', 'providers', id + '.js'), 'utf8');
  writeProvider(id, source);
});
