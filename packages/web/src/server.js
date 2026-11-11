/**
 * SentryVault Web Server
 * Serves the static UI and provides API endpoints for search, graph,
 * backlinks, and daily notes.
 */

import { createServer } from 'http';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraph } from '@sentryvault/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000', 10);
const VAULT_PATH = process.argv[2] || '.';

const kg = new KnowledgeGraph();

// ── Scan the vault folder ────────────────────────────────────────────
async function scanVault() {
  try {
    await kg.scanFolder(VAULT_PATH);
    console.log(`Scanned ${kg['files'].size} files from ${VAULT_PATH}`);
  } catch (err) {
    console.error(`Failed to scan vault at ${VAULT_PATH}:`, err.message);
  }
}

scanVault();

// ── MIME types ───────────────────────────────────────────────────────
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ── Serve static files from the same directory as server.js ──────────
function serveStatic(req, res, urlPath) {
  let filePath = join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const data = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}

// ── API routes ───────────────────────────────────────────────────────
function handleApi(req, res, url) {
  const parsedUrl = new URL(url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;
  const params = parsedUrl.searchParams;

  res.setHeader('Content-Type', 'application/json');

  try {
    // GET /api/search?q=...
    if (pathname === '/api/search') {
      const query = params.get('q') || '';
      if (!query) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing query parameter "q"' }));
        return;
      }
      const results = kg.search(query);
      res.writeHead(200);
      res.end(JSON.stringify({ results }));
      return;
    }

    // GET /api/graph
    if (pathname === '/api/graph') {
      const data = kg.getGraphData();
      res.writeHead(200);
      res.end(JSON.stringify(data));
      return;
    }

    // GET /api/backlinks?target=...
    if (pathname === '/api/backlinks') {
      const target = params.get('target') || '';
      if (!target) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing query parameter "target"' }));
        return;
      }
      const backlinks = kg.getBacklinks(target);
      res.writeHead(200);
      res.end(JSON.stringify({ backlinks }));
      return;
    }

    // GET /api/daily?date=YYYY-MM-DD
    if (pathname === '/api/daily' && req.method === 'GET') {
      const date = params.get('date') || '';
      if (!date) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing query parameter "date"' }));
        return;
      }
      const note = kg.createDailyNote(date);
      res.writeHead(200);
      res.end(JSON.stringify({ note }));
      return;
    }

    // POST /api/daily
    if (pathname === '/api/daily' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const { date } = JSON.parse(body);
          if (!date) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing "date" in body' }));
            return;
          }
          const note = kg.createDailyNote(date);
          res.writeHead(200);
          res.end(JSON.stringify({ note }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        }
      });
      return;
    }

    // GET /api/health
    if (pathname === '/api/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', files: kg['files'].size }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── HTTP Server ──────────────────────────────────────────────────────
const server = createServer((req, res) => {
  const url = req.url;

  // Health check
  if (url === '/api/health' && req.method === 'GET') {
    handleApi(req, res, url);
    return;
  }

  // API routes
  if (url.startsWith('/api/')) {
    handleApi(req, res, url);
    return;
  }

  // Static files
  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`SentryVault server running at http://localhost:${PORT}`);
  console.log(`Serving vault from: ${VAULT_PATH}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close(() => process.exit(0));
});
