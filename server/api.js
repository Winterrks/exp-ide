import { workspace, failure } from './workspace.js';
import { runShell } from './shell.js';
import { propose } from './planner.js';

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const localPeers = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const data of req) {
    size += data.length;
    if (size > 2 * 1024 * 1024) throw failure('Request is too large.', 413);
    chunks.push(data);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw failure('Invalid JSON request.'); }
}

export function api(config) {
  const ready = workspace(config.root, config.dataDir);
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next();
    try {
      const origin = new URL('http://' + req.headers.host);
      const url = new URL(req.url, origin);
      if (!localHosts.has(origin.hostname) || !localPeers.has(req.socket.remoteAddress) || req.headers['x-keyline-client'] !== 'workspace' ||
          (req.headers.origin && req.headers.origin !== origin.origin) || req.headers['sec-fetch-site'] === 'cross-site') {
        throw failure('Open Keyline directly on localhost to access the workspace.', 403);
      }
      const ws = await ready;
      const route = req.method + ' ' + url.pathname;
      let value;
      if (route === 'GET /api/workspace') value = { name: ws.name, id: ws.id, starter: ws.starter, files: await ws.tree(), model: config.apiKey ? config.model : null };
      else if (route === 'GET /api/file') value = await ws.read(url.searchParams.get('path'));
      else if (route === 'POST /api/file' || route === 'POST /api/folder') value = await ws.create((await body(req)).path, route.endsWith('/folder'));
      else if (route === 'PUT /api/file') {
        const { path, text, revision } = await body(req);
        value = await ws.save(path, text, revision);
      } else if (route === 'POST /api/terminal') return await runShell(ws, await body(req), res);
      else if (route === 'POST /api/agent') value = await propose(await body(req), ws, config);
      else throw failure('Unknown endpoint.', 404);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    } catch (error) {
      const status = error.status || ({ ENOENT: 404, EEXIST: 409, ENOTDIR: 400 })[error.code] || 500;
      const message = ({ ENOENT: 'The file or its parent folder does not exist.', EEXIST: 'That name is already in use.' })[error.code] || error.message;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: message }));
    }
  };
}
