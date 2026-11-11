/**
 * SentryVault CLI
 *
 * Usage:
 *   sentryvault serve <folder> [options]
 *
 * Options:
 *   --port, -p    Port number (default: 3000)
 *   --help, -h    Show help
 *   --version, -v Show version
 *
 * Examples:
 *   sentryvault serve ./my-vault
 *   sentryvault serve ./my-vault --port 8080
 *   sentryvault serve ./my-vault -p 8080
 */

import { createServer } from 'http';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { KnowledgeGraph } from '@sentryvault/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = '0.1.0';

// ── Argument parsing ─────────────────────────────────────────────────
function parseArgs(args: string[]): {
  command?: string;
  folder?: string;
  port?: number;
  help?: boolean;
  version?: boolean;
} {
  const result: Record<string, string | number | boolean | undefined> = {};
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg === '--port' || arg === '-p') {
      i++;
      const port = parseInt(args[i] || '3000', 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(`Error: Invalid port number: ${args[i]}`);
        process.exit(1);
      }
      result.port = port;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--version' || arg === '-v') {
      result.version = true;
    } else if (!arg.startsWith('-')) {
      if (!result.command) {
        result.command = arg;
      } else if (!result.folder) {
        result.folder = arg;
      }
    }
    i++;
  }

  return result as {
    command?: string;
    folder?: string;
    port?: number;
    help?: boolean;
    version?: boolean;
  };
}

function printHelp(): void {
  console.log(`SentryVault v${VERSION} - Offline markdown knowledge base

Usage:
  sentryvault serve <folder> [options]

Commands:
  serve     Start the web server for a vault folder

Options:
  --port, -p <number>   Port number (default: 3000)
  --help, -h            Show this help message
  --version, -v         Show version number

Examples:
  sentryvault serve ./my-vault
  sentryvault serve ./my-vault --port 8080
  sentryvault serve ./my-vault -p 8080

Endpoints:
  GET /api/health       Health check
  GET /api/search?q=... Full-text search
  GET /api/graph        Graph data for vis-network
  GET /api/backlinks?target=... Backlinks for a target
  GET /api/daily?date=... Create/read daily note
  POST /api/daily       Create daily note with body { "date": "YYYY-MM-DD" }
  /index.html           Web UI`);
}

function printVersion(): void {
  console.log(`SentryVault v${VERSION}`);
}

// ── Main ─────────────────────────────────────────────────────────────
function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    printVersion();
    return;
  }

  if (args.help) {
    printHelp();
    return;
  }

  if (args.command === 'serve') {
    if (!args.folder) {
      console.error('Error: Missing vault folder path');
      console.error('Usage: sentryvault serve <folder> [--port <number>]');
      process.exit(1);
    }

    const vaultPath = args.folder;
    const port = args.port || 3000;

    // Validate folder exists
    if (!existsSync(vaultPath)) {
      console.error(`Error: Folder not found: ${vaultPath}`);
      process.exit(1);
    }

    if (!statSync(vaultPath).isDirectory()) {
      console.error(`Error: Not a directory: ${vaultPath}`);
      process.exit(1);
    }

    startServer(vaultPath, port);
  } else if (args.command) {
    console.error(`Error: Unknown command: ${args.command}`);
    console.error('Run "sentryvault --help" for usage information.');
    process.exit(1);
  } else {
    printHelp();
  }
}

// ── Server setup (same as server.js but with configurable port/folder) ──
function startServer(vaultPath: string, port: number): void {
  const kg = new KnowledgeGraph();

  // Scan the vault folder
  kg.scanFolder(vaultPath).then(() => {
    console.log(`Scanned ${kg['files'].size} files from ${vaultPath}`);
  }).catch(err => {
    console.error(`Failed to scan vault at ${vaultPath}:`, err.message);
  });

  // MIME types
  const MIME_TYPES: Record<string, string> = {
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

  // Serve static files from the same directory as server.js
  function serveStatic(req: import('http').IncomingMessage, res: import('http').ServerResponse<import('http').IncomingMessage>, urlPath: string): void {
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

  // API routes
  function handleApi(req: import('http').IncomingMessage, res: import('http').ServerResponse<import('http').IncomingMessage>, url: string): void {
    const parsedUrl = new URL(url, `http://localhost:${port}`);
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
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  }

  // HTTP Server
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

  server.listen(port, () => {
    console.log(`SentryVault server running at http://localhost:${port}`);
    console.log(`Serving vault from: ${vaultPath}`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.close(() => process.exit(0));
  });
}

main();
