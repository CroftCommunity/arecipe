// Tiny static + beacon-sink server for the E5 PWA harness. Serves the harness
// shell and records POST /flush beacons so tests can measure the LANDING RATE
// (beacons the server actually received) on lifecycle events.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4180);

const stats = { flushes: 0, beacons: [] };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'POST' && url.pathname === '/flush') {
    let body = '';
    for await (const chunk of req) body += chunk;
    stats.flushes++;
    try {
      stats.beacons.push(JSON.parse(body));
    } catch {
      stats.beacons.push({ raw: body.length });
    }
    res.writeHead(204).end();
    return;
  }
  if (url.pathname === '/_stats') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(stats));
    return;
  }
  if (url.pathname === '/_reset') {
    stats.flushes = 0;
    stats.beacons = [];
    res.writeHead(204).end();
    return;
  }

  // Static shell.
  let path = url.pathname === '/' ? '/index.html' : url.pathname;
  try {
    const buf = await readFile(join(here, path));
    const ext = path.slice(path.lastIndexOf('.'));
    res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream' }).end(buf);
  } catch {
    res.writeHead(404).end('not found');
  }
});

server.listen(PORT, () => console.log(`harness server on http://127.0.0.1:${PORT}`));
