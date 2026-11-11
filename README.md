# SentryVault

> A zero-dependency, offline-first markdown knowledge base that reads your
> existing `.md` folder, indexes it for full-text search, maps backlinks,
> renders a live graph view, and supports daily notes — without modifying
> your files.

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
┌──────────────────────────────────────────────────────────────────┐
│                        SentryVault                               │
│                                                                  │
│  ┌──────────────────────┐    ┌──────────────────────────────┐   │
│  │  @sentryvault/core   │    │   @sentryvault/web            │   │
│  │  (TypeScript library)│    │   (Static UI + HTTP Server)   │   │
│  │                      │    │                               │   │
│  │  • Parser            │    │  • index.html                 │   │
│  │  • SearchEngine      │    │  • app.js                     │   │
│  │  • GraphGenerator    │    │  • styles.css                 │   │
│  │  • BacklinkIndex     │    │  • server.js                  │   │
│  │  • DailyNotes        │    │                               │   │
│  └──────────┬───────────┘    │  • API Endpoints              │   │
│             │                └───────────────┬───────────────┘   │
│             │                                │                   │
│  ┌──────────▼────────────────────────────────▼────────────────┐  │
│  │                  @sentryvault/cli                          │  │
│  │              (CLI wrapper — sentryvault serve)             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              @sentryvault/obsidian                         │  │
│  │         (Obsidian plugin — future)                         │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Package Overview

| Package | Description | Entry Point |
|---------|-------------|-------------|
| `@sentryvault/core` | Core knowledge graph engine (parsing, search, backlinks, graph, daily notes) | `dist/index.js` |
| `@sentryvault/web` | Web UI with static files and HTTP server | `dist/server.js` |
| `@sentryvault/cli` | CLI wrapper for serving a vault folder | `dist/cli.js` |
| `@sentryvault/obsidian` | Obsidian plugin skeleton (bridges core to Obsidian APIs) | `dist/main.js` |

## Quick Start

### Prerequisites

- Node.js >= 18.0.0

### Install & Build

```bash
# Clone the repository
git clone <repository-url>
cd sentryvault

# Install dependencies
npm install

# Build all packages
npm run build
npm run build:web
npm run build:cli
```

### Run the Server

```bash
# Serve a vault folder on port 3000 (using web package directly)
node packages/web/dist/server.js ./my-vault

# Custom port
PORT=8080 node packages/web/dist/server.js ./my-vault
```

Then open `http://localhost:3000` in your browser.

### Run with CLI

```bash
# Build the CLI first
npm run build:cli

# Serve a vault folder
npx sentryvault serve ./my-vault

# Custom port
npx sentryvault serve ./my-vault --port 8080
npx sentryvault serve ./my-vault -p 8080

# Help
npx sentryvault --help
```

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
│   │   ├── plugin-bridge.ts       # Plugin bridge interfaces and factory
│   │   ├── index.test.ts          # Core API tests
│   │   ├── integration.test.ts    # End-to-end integration tests
│   │   ├── search.test.ts         # Search engine tests
│   │   └── graph.test.ts          # Graph generation tests
│   └── package.json
├── web/                           # Web UI + HTTP server
│   ├── src/
│   │   ├── server.js              # HTTP server with API endpoints
│   │   ├── index.html             # Main UI page
│   │   ├── styles.css             # UI styles
│   │   ├── app.js                 # Client-side application
│   │   └── build.mjs              # Build script (esbuild bundler)
│   └── package.json
├── cli/                           # CLI wrapper
│   ├── src/
│   │   └── cli.ts                 # CLI entry point (sentryvault serve)
│   └── package.json
└── obsidian/                      # Obsidian plugin skeleton
    ├── src/
    │   ├── main.ts                # Plugin entry point
    │   ├── settings.ts            # Settings tab
    │   ├── styles.css             # Plugin styles
    │   └── views/
    │       ├── search-view.ts     # Search panel view
    │       ├── graph-view.ts      # Graph view panel
    │       ├── backlinks-view.ts  # Backlinks panel
    │       └── daily-view.ts      # Daily notes panel
    ├── manifest.json              # Obsidian plugin manifest
    ├── build.mjs                  # esbuild bundler
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
import { KnowledgeGraph, parseMarkdown } from '@sentryvault/core';

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

### Public Exports from `@sentryvault/core`

| Export | Type | Description |
|--------|------|-------------|
| `KnowledgeGraph` | Class | Main engine — scan, search, backlinks, graph, daily notes |
| `parseMarkdown` | Function | Parse raw markdown content into `ParsedFile` |
| `extractFrontmatter` | Function | Extract YAML frontmatter from content |
| `extractHeadings` | Function | Extract `# Heading` lines with line numbers |
| `extractWikiLinks` | Function | Extract `[[target]]` and `[[target#anchor]]` links |
| `parseYamlValue` | Function | Parse a YAML scalar value string |
| `SearchEngine` | Class | Low-level search engine (flexsearch wrapper) |
| `generateGraphData` | Function | Generate vis-network compatible graph data |
| `generateSimpleGraphData` | Function | Generate simplified graph data (nodes + edges only) |
| `getNodeColor` | Function | Get color for a node by type |
| `createBridge` | Function | Create a `KnowledgeGraph` bound to a `PluginBridge` |
| `createMinimalBridge` | Function | Create a minimal bridge for testing |

### Type Exports

| Type | Description |
|------|-------------|
| `ParsedFile` | Fully parsed markdown file (path, content, frontmatter, headings, wikiLinks) |
| `Frontmatter` | YAML frontmatter metadata |
| `Heading` | A heading with level, text, and line number |
| `WikiLink` | A wiki link with target, line, and optional anchor |
| `SearchResult` | A search result with file, score, and highlights |
| `SearchHighlight` | A matched term with snippet and line number |
| `VisNode` | vis-network compatible node |
| `VisEdge` | vis-network compatible edge |
| `VisGraphData` | vis-network graph data (nodes + edges) |
| `Backlink` | A backlink from source to target |
| `DailyNote` | A daily note with path, content, and date |
| `PluginBridge` | Composite bridge interface for host integration |
| `FileSystemBridge` | File system operations (read, write, list, stat, exists) |
| `VaultBridge` | Vault operations (get, create, update, delete files) |
| `EditorBridge` | Editor operations (open, get/set content) |
| `UIBridge` | UI operations (notices, modals, views, settings) |
| `EventBridge` | Event system (on, emit) |

## Becoming an Obsidian Plugin

The core exports a `KnowledgeGraph` class with a clean public API and a
`PluginBridge` interface that abstracts host-specific APIs (file system,
editor, UI, events). To wrap as an Obsidian plugin:

1. Import `@sentryvault/core` in your plugin code
2. Implement the `PluginBridge` interface, wrapping Obsidian's `app.vault`, `app.workspace`, and `app.ui` APIs
3. Call `createBridge(bridge)` to get a `KnowledgeGraph` instance bound to your bridge
4. Register custom `ItemView` classes for Search, Graph, and Daily Notes panels
5. Add a `SettingTab` for plugin configuration

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

### Bridge Interface Reference

The `PluginBridge` interface defines five subsystems:

| Subsystem | Interface | Purpose |
|-----------|-----------|---------|
| File System | `FileSystemBridge` | Read/write/list files, stat, exists |
| Vault | `VaultBridge` | CRUD operations on vault files |
| Editor | `EditorBridge` | Open files, read/write editor content |
| UI | `UIBridge` | Show notices, modals, register views |
| Events | `EventBridge` | Emit and listen to custom events |

The bridge factory function `createBridge(bridge)` returns a `KnowledgeGraph`
instance with overridden `scanFolder()` and `createDailyNote()` methods that
use the bridge's file system instead of Node.js `fs`.

### Full Migration Guide

For a complete step-by-step migration guide with code examples, API mappings, and common pitfalls, see:

- **[Obsidian Plugin Migration Guide](guides/obsidian-plugin-migration.md)**
  — Full reference with bridge interface documentation, 9-step migration
  process, Obsidian API mapping table, and publishing instructions.

### Obsidian Plugin Package

A skeleton plugin is provided in `packages/obsidian/` with:

- **`src/main.ts`** — Plugin entry point with full `ObsidianBridge`
  implementation wrapping all 5 bridge subsystems, view registration, 6
  commands (Search, Graph View, Backlinks, Daily Notes, Refresh Index,
  Daily Note: Today), and vault event listeners
- **`src/settings.ts`** — Settings tab with configurable options (daily
  notes folder, search highlight color, graph physics, auto refresh)
- **`src/styles.css`** — Complete styling for all 4 views using Obsidian
  CSS variables
- **`src/views/search-view.ts`** — Search view with real-time input,
  result list, and highlighted snippets
- **`src/views/graph-view.ts`** — Graph view loading vis-network from
  CDN, rendering nodes/edges with click-to-open behavior
- **`src/views/backlinks-view.ts`** — Backlinks view with target input
  and source file links
- **`src/views/daily-view.ts`** — Daily notes view with date picker,
  template textarea, and recent notes list
- **`manifest.json`** — Standard Obsidian plugin manifest (id: `sentryvault`, v0.1.0, minAppVersion 1.5.0)

To build the plugin:

```bash
npm run build:plugin
```

The output `dist/main.js` can be placed in your Obsidian vault's `.obsidian/plugins/sentryvault/` directory.

## License

MIT
