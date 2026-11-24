const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const port = Number(process.env.PORT || 8787);

http.createServer(function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const clean = decodeURIComponent(String(req.url).split('?')[0]);
  const file = path.join(root, clean);
  if (file.indexOf(root) !== 0) {
    res.statusCode = 403;
    res.end('forbidden');
    return;
  }
  fs.readFile(file, function (err, data) {
    if (err) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.end(data);
  });
}).listen(port, function () {
  console.log('DhakaFlix plugin test server: http://localhost:' + port + '/manifest.json');
});
