# SentryVault

> A zero-dependency, offline-first markdown knowledge base that reads your existing .md folder, indexes it for full-text search, maps backlinks, renders a live graph view, and supports daily notes—without modifying your files.

Task: Offline markdown knowledge base with backlinks, graph view, full-text search and daily notes, reading an existing folder of .md files without changing them; later an Obsidian-style plugin #plugin #obsidian #web

## Why it is better than what exists
- lat.md (adds UI, daily notes, full-text search)
- iwe (lighter, offline, no AI dependency)
- brain-map (adds search, backlinks, daily notes, plugin-ready)
- vault-ld (human-friendly UI without RDF complexity)

## Features
- Read-only parsing of existing .md folder without file modification
- Automatic backlink extraction from [[wiki links]] and [[file#heading]]
- Full-text search with flexsearch and result highlighting
- Interactive graph view using vis-network
- Daily notes template with date-based capture and quick navigation
- YAML frontmatter metadata extraction for filtering
- Core logic decoupled from UI for future Obsidian plugin wrapping
- Zero external dependencies, fully offline, single CLI + static web UI

## Stack
TypeScript, Node.js, flexsearch, vis-network, vanilla HTML/CSS/JS, esbuild, vitest

## Becoming a plugin
Core exports a KnowledgeGraph class with methods like scanFolder(), getBacklinks(), search(), getGraphData(), and createDailyNote(). The UI is a separate @sentryvault/web package. To wrap as an Obsidian plugin, import the core, replace the web UI with Obsidian's ItemView/SettingTab, and bridge core methods to Obsidian's file system and editor APIs.

## Steps
- [x] 1. Initialize TypeScript monorepo with tsconfig, package.json, vitest, and esbuild; verify with npm test.
- [x] 2. Create core parser module to read .md files, extract frontmatter, headings, and [[wiki links]] without modifying them.
- [x] 3. Implement backlink index builder that maps targets to source files and headings; verify with vitest run parser.test.ts.
- [x] 4. Add full-text search module using flexsearch with case-insensitive matching and highlight extraction; verify with vitest run search.test.ts.
- [x] 5. Build graph data generator that converts parsed nodes/edges into vis-network compatible format; verify with vitest run graph.test.ts.
- [x] 6. Scaffold static web UI with HTML/CSS/JS for search bar, results list, backlink panel, and graph canvas.
- [x] 7. Integrate UI with core via a lightweight HTTP server, exposing /api/search, /api/graph, /api/backlinks endpoints; verify with node server.js && curl localhost:3000/health.
- [x] 8. Add daily notes feature: template system, date-based file creation/read, and quick capture UI; verify with node server.js && open http://localhost:3000/daily.
- [x] 9. Write integration tests for end-to-end workflow; verify with vitest run integration.test.ts.
- [x] 10. Refactor core into @sentryvault/core package with clean public API and strict TypeScript types.
- [x] 11. Build @sentryvault/web package bundling UI and server; verify offline functionality with npm run build && node server.js.
- [x] 12. Add CLI wrapper (sentryvault serve <folder>) with port config and health check; verify with npx sentryvault serve ./test-vault.
- [ ] 13. Test against sample markdown vault; verify search, backlinks, graph, and daily notes render correctly in browser.
- [ ] 14. Design plugin bridge interface: document how to replace web UI with Obsidian panels and use core methods.
- [ ] 15. Create Obsidian plugin skeleton (@sentryvault/obsidian) importing core and bridging to Obsidian API; verify compilation with npm run build:plugin.
- [ ] 16. Write README with setup instructions, architecture diagram, run commands, and Obsidian plugin migration guide; verify with markdownlint README.md.
