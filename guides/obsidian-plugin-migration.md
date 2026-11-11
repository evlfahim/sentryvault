# Obsidian Plugin Migration Guide

> How to wrap `@sentryvault/core` as an Obsidian plugin by replacing the web UI with Obsidian panels and bridging core methods to Obsidian's file system and editor APIs.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Bridge Interface Reference](#bridge-interface-reference)
  - [FileSystemBridge](#filesystembridge)
  - [VaultBridge](#vaultbridge)
  - [EditorBridge](#editorbridge)
  - [UIBridge](#uibridge)
  - [EventBridge](#eventbridge)
  - [PluginBridge](#pluginbridge)
- [Step-by-Step Migration](#step-by-step-migration)
  - [1. Create the Plugin Skeleton](#1-create-the-plugin-skeleton)
  - [2. Implement the Plugin Bridge](#2-implement-the-plugin-bridge)
  - [3. Replace the Web UI with Obsidian Views](#3-replace-the-web-ui-with-obsidian-views)
  - [4. Bridge Search to Obsidian](#4-bridge-search-to-obsidian)
  - [5. Bridge Backlinks to Obsidian](#5-bridge-backlinks-to-obsidian)
  - [6. Bridge Graph View to Obsidian](#6-bridge-graph-view-to-obsidian)
  - [7. Bridge Daily Notes to Obsidian](#7-bridge-daily-notes-to-obsidian)
  - [8. Add Settings Tab](#8-add-settings-tab)
  - [9. Wire Up Events](#9-wire-up-events)
- [Obsidian API Mapping](#obsidian-api-mapping)
- [Full Bridge Implementation Example](#full-bridge-implementation-example)
- [Testing the Plugin](#testing-the-plugin)
- [Publishing the Plugin](#publishing-the-plugin)
- [Key Design Decisions](#key-design-decisions)
- [Common Pitfalls and Solutions](#common-pitfalls-and-solutions)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     Obsidian Host                            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              @sentryvault/obsidian Plugin               │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │           Obsidian Bridge Layer                   │  │  │
│  │  │  ┌──────────┐ ┌────────┐ ┌──────┐ ┌──────────┐  │  │  │
│  │  │  │  fs      │ │ vault  │ │editor│ │   ui     │  │  │  │
│  │  │  │  Bridge  │ │Bridge  │ │Bridge│ │  Bridge  │  │  │  │
│  │  │  └──────────┘ └────────┘ └──────┘ └──────────┘  │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                        │                               │  │
│  │  ┌─────────────────────┼──────────────────────────┐   │  │
│  │  │         @sentryvault/core                       │   │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌────────┐         │   │  │
│  │  │  │  Parser  │ │  Search  │ │  Graph │         │   │  │
│  │  │  └──────────┘ └──────────┘ └────────┘         │   │  │
│  │  │  ┌──────────┐ ┌──────────┐                   │   │  │
│  │  │  │Backlinks │ │  Daily   │                   │   │  │
│  │  │  └──────────┘ └──────────┘                   │   │  │
│  │  └───────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Obsidian Core APIs                         │  │
│  │  app.vault  │  app.workspace  │  app.ui  │  app       │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

The key insight: **the core engine never touches the file system directly**. All I/O goes through the `PluginBridge` interface. In the web server, the bridge wraps Node.js `fs`. In Obsidian, the bridge wraps `app.vault`, `app.workspace`, and `app.ui`.

---

## Bridge Interface Reference

The `PluginBridge` interface (exported from `@sentryvault/core/plugin-bridge`) defines five subsystems:

### FileSystemBridge

```typescript
interface FileSystemBridge {
  /**
   * Read the content of a file.
   * @param path - File path.
   * @returns File content as string.
   */
  readFile(path: string): Promise<string>;

  /**
   * Write content to a file, creating it if it doesn't exist.
   * @param path - File path.
   * @param content - Content to write.
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * List files in a directory.
   * @param dir - Directory path.
   * @returns Array of file/directory names (not full paths).
   */
  listFiles(dir: string): Promise<string[]>;

  /**
   * Check if a file or directory exists.
   * @param path - Path to check.
   * @returns True if the path exists.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Get file stats (size, mtime, isDirectory).
   * @param path - File path.
   * @returns File stats or null if not found.
   */
  stat(path: string): Promise<{ size: number; mtime: Date; isDirectory: boolean } | null>;
}
```

### VaultBridge

```typescript
interface VaultBridge {
  /**
   * Get a file object by path.
   * @param path - File path.
   * @returns File object or null.
   */
  getFile(path: string): Promise<ParsedFile | null>;

  /**
   * Create a new file in the vault.
   * @param path - File path (relative to vault root).
   * @param content - File content.
   */
  createFile(path: string, content: string): Promise<void>;

  /**
   * Update an existing file in the vault.
   * @param path - File path.
   * @param content - New content.
   */
  updateFile(path: string, content: string): Promise<void>;

  /**
   * Delete a file from the vault.
   * @param path - File path.
   */
  deleteFile(path: string): Promise<void>;

  /**
   * Get all markdown files in the vault (recursively).
   * @returns Array of file paths.
   */
  getAllMarkdownFiles(): Promise<string[]>;
}
```

### EditorBridge

```typescript
interface EditorBridge {
  /**
   * Open a file in the editor.
   * @param path - File path to open.
   */
  openFile(path: string): Promise<void>;

  /**
   * Get the currently active editor (if any).
   * @returns Editor handle or null.
   */
  getActiveEditor(): Promise<EditorHandle | null>;

  /**
   * Get the content of the active editor.
   * @returns Editor content or null.
   */
  getActiveEditorContent(): Promise<string | null>;

  /**
   * Set the content of the active editor.
   * @param content - New content.
   */
  setActiveEditorContent(content: string): Promise<void>;
}
```

### EditorHandle

```typescript
interface EditorHandle {
  /** Get the current content of the editor. */
  getContent(): string;
  /** Set the content of the editor. */
  setContent(content: string): void;
  /** Get the file path associated with this editor. */
  getPath(): string;
}
```

### UIBridge

```typescript
interface UIBridge {
  /**
   * Show a brief notice/toast message.
   * @param message - Message text.
   * @param duration - Display duration in milliseconds (default: 3000).
   */
  showNotice(message: string, duration?: number): void;

  /**
   * Show a modal dialog with a title and HTML content.
   * @param title - Modal title.
   * @param content - HTML content string.
   * @returns A resolver that can be used to close the modal.
   */
  showModal(title: string, content: string): Promise<() => void>;

  /**
   * Show a view/tab in the sidebar or main area.
   * @param viewId - Unique identifier for the view.
   * @param title - Display title.
   * @param icon - Icon name (if supported by host).
   */
  showView(viewId: string, title: string, icon?: string): void;

  /**
   * Register a custom view type.
   * @param viewId - Unique identifier for the view.
   * @param viewClass - Constructor for the view.
   */
  registerView(viewId: string, viewClass: new (bridge: PluginBridge) => ViewClass): void;

  /**
   * Register a settings tab.
   * @param tabClass - Constructor for the settings tab.
   */
  registerSettingsTab(tabClass: new (bridge: PluginBridge) => SettingsTabClass): void;
}
```

### EventBridge

```typescript
interface EventBridge {
  /**
   * Register an event listener.
   * @param event - Event name.
   * @param callback - Callback function.
   * @returns A disposable that removes the listener when called.
   */
  on(event: string, callback: (...args: any[]) => void): () => void;

  /**
   * Emit an event with optional arguments.
   * @param event - Event name.
   * @param args - Event arguments.
   */
  emit(event: string, ...args: any[]): void;
}
```

### PluginBridge (composite)

```typescript
interface PluginBridge {
  /** File system operations. */
  fs: FileSystemBridge;
  /** Vault operations. */
  vault: VaultBridge;
  /** Editor operations. */
  editor: EditorBridge;
  /** UI operations. */
  ui: UIBridge;
  /** Event system. */
  events: EventBridge;

  /**
   * The root path of the vault.
   * All file paths are relative to this root.
   */
  vaultRoot: string;

  /**
   * Create a KnowledgeGraph instance bound to this bridge.
   * The returned instance uses the bridge for all file operations.
   */
  createGraph(): KnowledgeGraph;
}
```

---

## Step-by-Step Migration

### 1. Create the Plugin Skeleton

Create a new Obsidian plugin project using the official template:

```bash
npx degit obsidianmd/obsidian-sample-plugin my-obsidian-plugin
cd my-obsidian-plugin
npm install
npm install @sentryvault/core
```

Your `main.ts` will import the core and the bridge:

```typescript
import { App, Plugin } from 'obsidian';
import { KnowledgeGraph, createBridge, type PluginBridge } from '@sentryvault/core';

export default class SentryVaultPlugin extends Plugin {
  private bridge: PluginBridge | null = null;
  private graph: KnowledgeGraph | null = null;

  async onload() {
    // Step 2: Create the bridge
    this.bridge = this.createBridge();
    
    // Step 3: Create the graph bound to the bridge
    this.graph = this.bridge.createGraph();
    
    // Scan the vault on load
    await this.graph.scanFolder(this.app.vault.basePath);
    
    // Register commands and views
    this.registerCommands();
    this.registerViews();
    this.registerSettingsTab();
  }
}
```

### 2. Implement the Plugin Bridge

Implement the `PluginBridge` interface by wrapping Obsidian's APIs:

```typescript
private createBridge(): PluginBridge {
  const vaultRoot = this.app.vault.basePath;

  // ── File System Bridge ──
  const fs = {
    readFile: async (path: string) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!file || !(file instanceof app.vault.TFile)) {
        throw new Error(`File not found: ${path}`);
      }
      return await this.app.vault.read(file);
    },
    writeFile: async (path: string, content: string) => {
      await this.app.vault.create(path, content);
    },
    listFiles: async (dir: string) => {
      const folder = this.app.vault.getAbstractFileByPath(dir);
      if (!folder || !(folder instanceof app.vault.TFolder)) {
        throw new Error(`Directory not found: ${dir}`);
      }
      return folder.children.map(f => f.name);
    },
    exists: async (path: string) => {
      return this.app.vault.getAbstractFileByPath(path) !== null;
    },
    stat: async (path: string) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!file) return null;
      if (file instanceof app.vault.TFolder) {
        return { size: 0, mtime: new Date(), isDirectory: true };
      }
      const stat = await this.app.vault.adapter.stat(path);
      return {
        size: stat?.size ?? 0,
        mtime: stat?.mtime ? new Date(stat.mtime) : new Date(),
        isDirectory: false,
      };
    },
  };

  // ── Vault Bridge ──
  const vault = {
    getFile: async (path: string) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!file || !(file instanceof app.vault.TFile)) return null;
      const content = await this.app.vault.read(file);
      return parseMarkdown(path, content);
    },
    createFile: async (path: string, content: string) => {
      await this.app.vault.create(path, content);
    },
    updateFile: async (path: string, content: string) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file && file instanceof app.vault.TFile) {
        await this.app.vault.modify(file, content);
      }
    },
    deleteFile: async (path: string) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file && file instanceof app.vault.TFile) {
        await this.app.vault.delete(file);
      }
    },
    getAllMarkdownFiles: async () => {
      return this.app.vault.getAllFiles()
        .filter(f => f.path.endsWith('.md'))
        .map(f => f.path);
    },
  };

  // ── Editor Bridge ──
  const editor = {
    openFile: async (path: string) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file && file instanceof app.vault.TFile) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openView(file);
      }
    },
    getActiveEditor: async () => {
      const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeLeaf) return null;
      return {
        getContent: () => activeLeaf.editor.getValue(),
        setContent: (content: string) => activeLeaf.editor.setValue(content),
        getPath: () => activeLeaf.file?.path ?? '',
      };
    },
    getActiveEditorContent: async () => {
      const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeLeaf) return null;
      return activeLeaf.editor.getValue();
    },
    setActiveEditorContent: async (content: string) => {
      const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeLeaf) {
        activeLeaf.editor.setValue(content);
      }
    },
  };

  // ── UI Bridge ──
  const ui = {
    showNotice: (message: string, duration = 3000) => {
      new Notice(message, duration);
    },
    showModal: async (title: string, content: string) => {
      class TempModal extends Modal {
        constructor(app: App, title: string, content: string) {
          super(app);
          this.titleEl.setText(title);
          this.contentEl.innerHTML = content;
        }
      }
      const modal = new TempModal(this.app, title, content);
      modal.open();
      return () => modal.close();
    },
    showView: (viewId: string, title: string, icon?: string) => {
      // Delegate to plugin's view registration
    },
    registerView: (viewId: string, viewClass: new (bridge: PluginBridge) => ViewClass) => {
      // Handled by the plugin's registerViewMode
    },
    registerSettingsTab: (tabClass: new (bridge: PluginBridge) => SettingsTabClass) => {
      // Handled by the plugin's addSettingTab
    },
  };

  // ── Event Bridge ──
  const events = {
    on: (event: string, callback: (...args: any[]) => void) => {
      const disposable = this.app.workspace.on(event, callback);
      return () => disposable.off();
    },
    emit: (event: string, ...args: any[]) => {
      this.app.workspace.trigger(event, ...args);
    },
  };

  return {
    fs,
    vault,
    editor,
    ui,
    events,
    vaultRoot,
    createGraph: () => createBridge(this),
  };
}
```

### 3. Replace the Web UI with Obsidian Views

Instead of serving static HTML, register custom `ItemView` classes:

```typescript
import { ItemView, WorkspaceLeaf } from 'obsidian';

// ── Search View ──
export class SentryVaultSearchView extends ItemView {
  private bridge: PluginBridge;

  constructor(leaf: WorkspaceLeaf, bridge: PluginBridge) {
    super(leaf);
    this.bridge = bridge;
  }

  getViewType(): string { return 'sentryvault-search'; }
  getDisplayText(): string { return 'SentryVault Search'; }
  getIcon(): string { return 'search'; }

  async onOpen() {
    const { contentEl } = this.containerEl;
    contentEl.empty();

    // Build the search UI using Obsidian's DOM API
    const searchBar = contentEl.createEl('input', {
      type: 'text',
      placeholder: 'Search vault...',
      cls: 'sentryvault-search-input',
    });

    const results = contentEl.createEl('div', { cls: 'sentryvault-results' });

    searchBar.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        const query = searchBar.value.trim();
        if (!query) return;

        const kg = this.bridge.createGraph();
        await kg.scanFolder(this.bridge.vaultRoot);
        const searchResults = kg.search(query);

        results.empty();
        for (const result of searchResults) {
          const item = results.createEl('div', { cls: 'sentryvault-result-item' });
          item.createEl('h3', { text: result.file });
          item.createEl('p', { text: result.highlights[0]?.snippet ?? '' });
          item.addEventListener('click', () => {
            this.bridge.editor.openFile(result.file);
          });
        }
      }
    });
  }

  async onClose() {
    // Cleanup
  }
}
```

Register the view in `onload()`:

```typescript
private registerViews() {
  this.app.workspace.registerViewMode(
    'sentryvault-search',
    (leaf) => new SentryVaultSearchView(leaf, this.bridge!)
  );
  this.app.workspace.registerViewMode(
    'sentryvault-graph',
    (leaf) => new SentryVaultGraphView(leaf, this.bridge!)
  );
  this.app.workspace.registerViewMode(
    'sentryvault-daily',
    (leaf) => new SentryVaultDailyView(leaf, this.bridge!)
  );
}
```

### 4. Bridge Search to Obsidian

The search bridge is straightforward — the core `KnowledgeGraph.search()` method already returns structured results. The bridge just needs to:

1. Scan the vault using `bridge.vault.getAllMarkdownFiles()`
2. Parse each file using `bridge.fs.readFile()` and the core parser
3. Call `kg.search(query)`
4. Display results in an Obsidian-compatible list

### 5. Bridge Backlinks to Obsidian

```typescript
private async showBacklinks(target: string) {
  const kg = this.bridge.createGraph();
  await kg.scanFolder(this.bridge.vaultRoot);
  const backlinks = kg.getBacklinks(target);

  // Show in a modal or sidebar panel
  const content = backlinks
    .map(bl => {
      const heading = bl.sourceHeading ? ` ↳ ${bl.sourceHeading}` : '';
      return `${bl.source}${heading}`;
    })
    .join('\n');

  await this.bridge.ui.showModal(`Backlinks for "${target}"`, `<pre>${content}</pre>`);
}
```

### 6. Bridge Graph View to Obsidian

For the graph view, you have two options:

**Option A: Embed vis-network in an Obsidian modal**

```typescript
export class SentryVaultGraphView extends ItemView {
  private bridge: PluginBridge;
  private network: any;

  async onOpen() {
    const { contentEl } = this.containerEl;
    const graphContainer = contentEl.createEl('div', { cls: 'sentryvault-graph' });

    const kg = this.bridge.createGraph();
    await kg.scanFolder(this.bridge.vaultRoot);
    const graphData = kg.getGraphData();

    // Initialize vis-network
    const nodes = new vis.DataSet(graphData.nodes);
    const edges = new vis.DataSet(graphData.edges);
    this.network = new vis.Network(graphContainer, { nodes, edges }, {
      physics: { barnesHut: { gravitationalConstant: -2000 } },
      interaction: { hover: true },
    });
  }
}
```

**Option B: Use Obsidian's built-in graph view**

Obsidian already has a graph view. You can enhance it by:
- Adding custom tags to files that SentryVault recognizes
- Using Obsidian's `app.graph` API to query relationships
- Syncing SentryVault's backlink data with Obsidian's graph

### 7. Bridge Daily Notes to Obsidian

```typescript
export class SentryVaultDailyView extends ItemView {
  private bridge: PluginBridge;

  async onOpen() {
    const { contentEl } = this.containerEl;
    const dateInput = contentEl.createEl('input', { type: 'date' });
    const content = contentEl.createEl('div', { cls: 'sentryvault-daily-content' });

    dateInput.addEventListener('change', async () => {
      const date = dateInput.value;
      if (!date) return;

      const kg = this.bridge.createGraph();
      const note = await kg.createDailyNote(date, {
        folder: 'daily-notes',
        template: this.getTemplate(),
      });

      content.empty();
      content.createEl('pre', { text: note.content });
    });
  }

  private getTemplate(): string {
    // Read from settings or use default
    return '---\ntitle: {{date}}\n---\n\n# {{date}}\n';
  }
}
```

### 8. Add Settings Tab

```typescript
import { Setting } from 'obsidian';

class SentryVaultSettingsTab extends SettingTab {
  private bridge: PluginBridge;

  constructor(app: App, bridge: PluginBridge) {
    super(app, 'sentryvault');
    this.bridge = bridge;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Daily Notes Folder')
      .setDesc('Folder where daily notes are stored')
      .addText(text => text
        .setPlaceholder('daily-notes')
        .setValue('daily-notes')
        .onChange(async (value) => {
          await this.saveSetting('dailyNotesFolder', value);
        }));

    new Setting(containerEl)
      .setName('Daily Notes Template')
      .setDesc('Template for new daily notes (use {{date}} placeholder)')
      .addTextArea(text => text
        .setPlaceholder('---\ntitle: {{date}}\n---\n\n# {{date}}\n')
        .setValue('---\ntitle: {{date}}\n---\n\n# {{date}}\n')
        .onChange(async (value) => {
          await this.saveSetting('dailyNotesTemplate', value);
        }));
  }

  private async saveSetting(key: string, value: string) {
    this.plugin.settings[key] = value;
    await this.plugin.saveSettings();
  }
}
```

### 9. Wire Up Events

Use the event bridge to react to vault changes:

```typescript
// Re-scan when files change
this.bridge.events.on('file-change', async () => {
  if (this.graph) {
    await this.graph.scanFolder(this.bridge.vaultRoot);
  }
});

// Re-scan when files are created or deleted
this.app.vault.on('create', () => this.refreshGraph());
this.app.vault.on('delete', () => this.refreshGraph());
this.app.vault.on('modify', () => this.refreshGraph());
```

---

## Obsidian API Mapping

| SentryVault Bridge Method | Obsidian API Equivalent |
|---------------------------|------------------------|
| `fs.readFile(path)` | `app.vault.read(file)` |
| `fs.writeFile(path, content)` | `app.vault.create(path, content)` |
| `fs.listFiles(dir)` | `folder.children.map(f => f.name)` |
| `fs.exists(path)` | `app.vault.getAbstractFileByPath(path) !== null` |
| `fs.stat(path)` | `app.vault.adapter.stat(path)` |
| `vault.getFile(path)` | `app.vault.getAbstractFileByPath(path)` + read |
| `vault.createFile(path, content)` | `app.vault.create(path, content)` |
| `vault.updateFile(path, content)` | `app.vault.modify(file, content)` |
| `vault.deleteFile(path)` | `app.vault.delete(file)` |
| `vault.getAllMarkdownFiles()` | `app.vault.getAllFiles().filter(f => f.path.endsWith('.md'))` |
| `editor.openFile(path)` | `leaf.openView(file)` |
| `editor.getActiveEditor()` | `app.workspace.getActiveViewOfType(MarkdownView)` |
| `editor.getActiveEditorContent()` | `activeLeaf.editor.getValue()` |
| `editor.setActiveEditorContent(content)` | `activeLeaf.editor.setValue(content)` |
| `ui.showNotice(msg)` | `new Notice(msg)` |
| `ui.showModal(title, content)` | Custom `Modal` subclass |
| `ui.showView(viewId, title)` | `app.workspace.getLeaf().setViewState(...)` |
| `events.on(event, cb)` | `app.workspace.on(event, cb)` |
| `events.emit(event, ...args)` | `app.workspace.trigger(event, ...args)` |

---

## Full Bridge Implementation Example

Here's a complete, minimal bridge implementation for Obsidian:

```typescript
import { App, Notice, SettingTab, Setting, Modal, TFile, TFolder, MarkdownView, WorkspaceLeaf, ItemView } from 'obsidian';
import { KnowledgeGraph, createBridge, type PluginBridge, parseMarkdown } from '@sentryvault/core';

class ObsidianBridge implements PluginBridge {
  constructor(private app: App, private plugin: SentryVaultPlugin) {}

  get vaultRoot(): string {
    return this.app.vault.basePath;
  }

  get fs(): import('@sentryvault/core').FileSystemBridge {
    return {
      readFile: async (path: string) => {
        const file = this.app.vault.getAbstractFileByPath(path) as TFile;
        if (!file) throw new Error(`File not found: ${path}`);
        return await this.app.vault.read(file);
      },
      writeFile: async (path: string, content: string) => {
        await this.app.vault.create(path, content);
      },
      listFiles: async (dir: string) => {
        const folder = this.app.vault.getAbstractFileByPath(dir) as TFolder;
        if (!folder) throw new Error(`Directory not found: ${dir}`);
        return folder.children.map(f => f.name);
      },
      exists: async (path: string) => {
        return this.app.vault.getAbstractFileByPath(path) !== null;
      },
      stat: async (path: string) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file) return null;
        if (file instanceof TFolder) {
          return { size: 0, mtime: new Date(), isDirectory: true };
        }
        const stat = await this.app.vault.adapter.stat(path);
        return {
          size: stat?.size ?? 0,
          mtime: stat?.mtime ? new Date(stat.mtime) : new Date(),
          isDirectory: false,
        };
      },
    };
  }

  get vault(): import('@sentryvault/core').VaultBridge {
    return {
      getFile: async (path: string) => {
        const file = this.app.vault.getAbstractFileByPath(path) as TFile;
        if (!file) return null;
        const content = await this.app.vault.read(file);
        return parseMarkdown(path, content);
      },
      createFile: async (path: string, content: string) => {
        await this.app.vault.create(path, content);
      },
      updateFile: async (path: string, content: string) => {
        const file = this.app.vault.getAbstractFileByPath(path) as TFile;
        if (file) {
          await this.app.vault.modify(file, content);
        }
      },
      deleteFile: async (path: string) => {
        const file = this.app.vault.getAbstractFileByPath(path) as TFile;
        if (file) {
          await this.app.vault.delete(file);
        }
      },
      getAllMarkdownFiles: async () => {
        return this.app.vault.getAllFiles()
          .filter(f => f.path.endsWith('.md'))
          .map(f => f.path);
      },
    };
  }

  get editor(): import('@sentryvault/core').EditorBridge {
    return {
      openFile: async (path: string) => {
        const file = this.app.vault.getAbstractFileByPath(path) as TFile;
        if (file) {
          const leaf = this.app.workspace.getLeaf(false);
          await leaf.openView(file);
        }
      },
      getActiveEditor: async () => {
        const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeLeaf) return null;
        return {
          getContent: () => activeLeaf.editor.getValue(),
          setContent: (content: string) => activeLeaf.editor.setValue(content),
          getPath: () => activeLeaf.file?.path ?? '',
        };
      },
      getActiveEditorContent: async () => {
        const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeLeaf) return null;
        return activeLeaf.editor.getValue();
      },
      setActiveEditorContent: async (content: string) => {
        const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeLeaf) {
          activeLeaf.editor.setValue(content);
        }
      },
    };
  }

  get ui(): import('@sentryvault/core').UIBridge {
    return {
      showNotice: (message: string, duration = 3000) => {
        new Notice(message, duration);
      },
      showModal: async (title: string, content: string) => {
        class TempModal extends Modal {
          constructor(app: App, title: string, content: string) {
            super(app);
            this.titleEl.setText(title);
            this.contentEl.innerHTML = content;
          }
        }
        const modal = new TempModal(this.app, title, content);
        modal.open();
        return () => modal.close();
      },
      showView: (viewId: string, title: string, icon?: string) => {
        // Delegate to plugin's view registration
      },
      registerView: (viewId: string, viewClass: new (bridge: PluginBridge) => import('@sentryvault/core').ViewClass) => {
        // Handled by the plugin's registerViewMode
      },
      registerSettingsTab: (tabClass: new (bridge: PluginBridge) => import('@sentryvault/core').SettingsTabClass) => {
        // Handled by the plugin's addSettingTab
      },
    };
  }

  get events(): import('@sentryvault/core').EventBridge {
    return {
      on: (event: string, callback: (...args: any[]) => void) => {
        const disposable = this.app.workspace.on(event, callback);
        return () => disposable.off();
      },
      emit: (event: string, ...args: any[]) => {
        this.app.workspace.trigger(event, ...args);
      },
    };
  }

  createGraph(): KnowledgeGraph {
    return createBridge(this);
  }
}
```

---

## Testing the Plugin

1. **Compile the plugin:**
   ```bash
   npm run build
   ```

2. **Load in development mode:**
   - Place the compiled `main.js`, `manifest.json`, and `styles.css` in your vault's `.obsidian/plugins/sentryvault/` directory
   - Enable "Developer mode" in Obsidian settings
   - Enable the SentryVault plugin

3. **Test each feature:**
   - Open the command palette (`Ctrl/Cmd + P`) and run "SentryVault: Open Search"
   - Search for a term that exists in your vault
   - Click a result to open the file
   - Open the graph view and verify nodes/edges render
   - Create a daily note and verify it appears in the daily notes folder

4. **Unit test the bridge:**
   ```bash
   npx vitest run packages/core/src/plugin-bridge.test.ts
   ```

---

## Publishing the Plugin

1. **Create the manifest.json:**
   ```json
   {
     "id": "sentryvault",
     "name": "SentryVault",
     "version": "0.1.0",
     "minAppVersion": "0.15.0",
     "description": "Offline-first markdown knowledge base with search, backlinks, graph view, and daily notes.",
     "author": "Your Name",
     "isDesktopOnly": false
   }
   ```

2. **Build the release:**
   ```bash
   npm run build
   ```

3. **Upload to Obsidian marketplace** (optional):
   - Create a GitHub repository
   - Tag a release
   - Submit to the Obsidian plugin directory

---

## Key Design Decisions

1. **Bridge pattern over inheritance**: The `PluginBridge` interface is composed, not inherited. This makes it easy to swap out individual subsystems (e.g., replace the UI bridge without touching the file system bridge).

2. **Core remains pure**: The `KnowledgeGraph` class has no knowledge of Obsidian. All host-specific code lives in the bridge layer. This means the same core can power a VS Code extension, a web app, or a CLI tool.

3. **Lazy scanning**: The graph is scanned on-demand when first needed, not on every file change. This keeps the plugin responsive in large vaults.

4. **Event-driven updates**: The bridge exposes an event system so the core can react to vault changes without polling.

5. **Backward compatibility**: The bridge's `createGraph()` method returns a standard `KnowledgeGraph` instance. Any code that works with the web server's `KnowledgeGraph` will work with the Obsidian-bridged version.

---

## Common Pitfalls and Solutions

### 1. File path resolution

**Problem**: Obsidian's file paths are relative to the vault root, but the bridge expects paths relative to the vault root.

**Solution**: Always use `app.vault.basePath` as the vault root and ensure all paths are relative to it.

```typescript
// Correct
const fullPath = `${this.app.vault.basePath}/${relativePath}`;

// Incorrect - this will fail in Obsidian
const fullPath = `./${relativePath}`;
```

### 2. Type checking with TFile and TFolder

**Problem**: `getAbstractFileByPath` returns `AbstractFile | null`, which could be a `TFile`, `TFolder`, or `TFolder`.

**Solution**: Always check the type before casting:

```typescript
const file = this.app.vault.getAbstractFileByPath(path);
if (file && file instanceof app.vault.TFile) {
  // Safe to cast
  const tFile = file as TFile;
}
```

### 3. Memory leaks with event listeners

**Problem**: Event listeners registered with `app.workspace.on()` persist even after the plugin is disabled.

**Solution**: Always return a disposable from the `on()` method and call it when the plugin is unloaded:

```typescript
private disposables: (() => void)[] = [];

onunload() {
  this.disposables.forEach(d => d());
  this.disposables = [];
}
```

### 4. vis-network not available in Obsidian

**Problem**: The web UI uses vis-network, but Obsidian plugins don't have access to npm packages by default.

**Solution**: Either bundle vis-network with your plugin using esbuild/webpack, or use Obsidian's built-in graph view (Option B in section 6).

### 5. Async/await in event handlers

**Problem**: Obsidian's event handlers expect synchronous callbacks, but the bridge methods are async.

**Solution**: Use `async` callbacks and handle errors:

```typescript
this.app.vault.on('create', async () => {
  try {
    await this.refreshGraph();
  } catch (error) {
    console.error('Failed to refresh graph:', error);
  }
});
```
