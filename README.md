# SentryVault

> A zero-dependency, offline-first markdown knowledge base that reads your existing `.md` folder, indexes it for full-text search, maps backlinks, renders a live graph view, and supports daily notes — without modifying your files.

## Features

- **Read-only parsing** — Scans existing `.md` files without modifying them
- **Backlink extraction** — Automatically maps `[[wiki links]]` and `[[file#heading]]` references
- **Full-text search** — Powered by flexsearch with case-insensitive matching and result highlighting
- **Interactive graph view** — Visualizes file relationships using vis-network
- **Daily notes** — Template-based date capture with quick navigation
- **YAML frontmatter** — Metadata extraction for filtering and display
- **Core/UI decoupled** — Clean public API for future Obsidian plugin wrapping
- **Zero external dependencies** — Fully offline, single CLI + static web UI

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 SentryVault                      │
├──────────────┬──────────────────────────────────┤
│  @sentryvault/core  │  @sentryvault/web         │
│  (TypeScript)       │  (HTML/CSS/JS + Server)   │
│                     │                           │
│  • Parser           │  • Static UI              │
│  • SearchEngine     │  • HTTP Server            │
│  • GraphGenerator   │  • API Endpoints          │
│  • BacklinkIndex    │                           │
│  • DailyNotes       │                           │
├─────────────────────────────────────────────────┤
│  API: /api/search | /api/graph | /api/backlinks │
│         /api/daily | /api/health                │
└─────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js >= 18.0.0

### Install & Build

```bash
# Install dependencies
npm install

# Build core library
npm run build

# Build web package (bundles server + copies static files)
npm run build:web
```

### Run the Server

```bash
# Serve a vault folder on port 3000
node packages/web/dist/server.js ./my-vault

# Custom port
PORT=8080 node packages/web/dist/server.js ./my-vault
```

Then open `http://localhost:3000` in your browser.

### Run Tests

```bash
npm test
```

## Project Structure

```
packages/
├── core/                          # Core knowledge graph engine
│   ├── src/
│   │   ├── index.ts               # Public API (KnowledgeGraph class)
│   │   ├── parser.ts              # Markdown parsing (frontmatter, headings, wiki links)
│   │   ├── search.ts              # Full-text search (flexsearch wrapper)
│   │   ├── graph.ts               # Graph data generation (vis-network format)
│   │   ├── types.ts               # Shared type definitions
│   │   ├── index.test.ts          # Core API tests
│   │   ├── integration.test.ts    # End-to-end integration tests
│   │   ├── search.test.ts         # Search engine tests
│   │   └── graph.test.ts          # Graph generation tests
│   └── package.json
└── web/                           # Web UI + HTTP server
    ├── src/
    │   ├── server.js              # HTTP server with API endpoints
    │   ├── index.html             # Main UI page
    │   ├── styles.css             # UI styles
    │   ├── app.js                 # Client-side application
    │   └── build.mjs              # Build script (esbuild bundler)
    └── package.json
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check, returns file count |
| `/api/search?q=...` | GET | Full-text search with highlights |
| `/api/graph` | GET | Graph data (nodes + edges) for vis-network |
| `/api/backlinks?target=...` | GET | Backlinks for a given target |
| `/api/daily?date=YYYY-MM-DD` | GET | Read daily note content |
| `/api/daily` | POST | Create daily note (body: `{ "date": "..." }`) |

## Core API

```typescript
import { KnowledgeGraph } from '@sentryvault/core';

const kg = new KnowledgeGraph();

// Scan a folder of .md files (read-only)
await kg.scanFolder('./my-vault');

// Search
const results = kg.search('query');

// Get backlinks
const backlinks = kg.getBacklinks('Target File');

// Get graph data for vis-network
const graph = kg.getGraphData();

// Create/read daily note
const daily = kg.createDailyNote('2024-01-15');
```

## Becoming an Obsidian Plugin

The core exports a `KnowledgeGraph` class with a clean public API and a `PluginBridge` interface that abstracts host-specific APIs (file system, editor, UI, events). To wrap as an Obsidian plugin:

1. Import `@sentryvault/core` in your plugin code
2. Implement the `PluginBridge` interface, wrapping Obsidian's `app.vault`, `app.workspace`, and `app.ui` APIs
3. Call `createBridge(bridge)` to get a `KnowledgeGraph` instance bound to your bridge
4. Register custom `ItemView` classes for Search, Graph, and Daily Notes panels
5. Add a `SettingTab` for plugin configuration

See the full migration guide: [`guides/obsidian-plugin-migration.md`](guides/obsidian-plugin-migration.md)

### Bridge Interface

The `PluginBridge` interface (from `@sentryvault/core/plugin-bridge`) defines five subsystems:

| Subsystem | Interface | Purpose |
|-----------|-----------|---------|
| File System | `FileSystemBridge` | Read/write/list files, stat, exists |
| Vault | `VaultBridge` | CRUD operations on vault files |
| Editor | `EditorBridge` | Open files, read/write editor content |
| UI | `UIBridge` | Show notices, modals, register views |
| Events | `EventBridge` | Emit and listen to custom events |

The bridge factory function `createBridge(bridge)` returns a `KnowledgeGraph` instance with overridden `scanFolder()` and `createDailyNote()` methods that use the bridge's file system instead of Node.js `fs`.

### Quick Start for Plugin Authors

```typescript
import { App, Plugin } from 'obsidian';
import { createBridge, type PluginBridge } from '@sentryvault/core';

class MyObsidianPlugin extends Plugin {
  async onload() {
    // 1. Create the bridge
    const bridge: PluginBridge = {
      fs: { /* implement using app.vault */ },
      vault: { /* implement using app.vault */ },
      editor: { /* implement using app.workspace */ },
      ui: { /* implement using app.ui */ },
      events: { /* implement using app.workspace */ },
      vaultRoot: this.app.vault.basePath,
      createGraph: () => createBridge(bridge),
    };

    // 2. Create a bound graph
    const kg = bridge.createGraph();
    await kg.scanFolder(this.app.vault.basePath);

    // 3. Use core methods
    const results = kg.search('query');
    const backlinks = kg.getBacklinks('Target');
    const graph = kg.getGraphData();
  }
}
```

See the full migration guide: [`guides/obsidian-plugin-migration.md`](guides/obsidian-plugin-migration.md)

## License

MIT
