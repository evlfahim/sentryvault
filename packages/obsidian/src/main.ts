/**
 * @module @sentryvault/obsidian/main
 * SentryVault Obsidian Plugin — main entry point.
 *
 * Registers the plugin, creates the bridge to Obsidian APIs,
 * and sets up all views, commands, and settings.
 */

import {
  App,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  TFolder,
  TAbstractFile,
  WorkspaceLeaf,
  Modal,
  EventRef,
} from 'obsidian';
import {
  KnowledgeGraph,
  createBridge,
  parseMarkdown,
  type PluginBridge,
  type FileSystemBridge,
  type VaultBridge,
  type EditorBridge,
  type UIBridge,
  type EventBridge,
} from '@sentryvault/core';

// ── View Imports ─────────────────────────────────────────────────────

import { SentryVaultSearchView, SEARCH_VIEW_TYPE } from './views/search-view.js';
import { SentryVaultGraphView, GRAPH_VIEW_TYPE } from './views/graph-view.js';
import { SentryVaultBacklinksView, BACKLINKS_VIEW_TYPE } from './views/backlinks-view.js';
import { SentryVaultDailyView, DAILY_VIEW_TYPE } from './views/daily-view.js';
import { SentryVaultSettingsTab } from './settings.js';

// ── Helper: Recursively create folders ───────────────────────────────

async function createFolderRecursive(app: App, path: string): Promise<void> {
  const parts = path.split('/');
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(current);
    if (!existing) {
      await app.vault.createFolder(current);
    }
  }
}

// ── Bridge Implementation ────────────────────────────────────────────

/**
 * Create a PluginBridge that wraps Obsidian's APIs.
 * This is the adapter layer between @sentryvault/core and Obsidian.
 */
function createObsidianBridge(app: App): PluginBridge {
  // Use the adapter's basePath which is the actual file-system root
  const vaultRoot = app.vault.adapter.basePath;

  // ── File System Bridge ──
  const fs: FileSystemBridge = {
    readFile: async (path: string): Promise<string> => {
      const file = app.vault.getAbstractFileByPath(path);
      if (!file || !(file instanceof TFile)) {
        throw new Error(`File not found: ${path}`);
      }
      return await app.vault.read(file);
    },

    writeFile: async (path: string, content: string): Promise<void> => {
      const parts = path.split('/');
      if (parts.length > 1) {
        const parentPath = parts.slice(0, -1).join('/');
        const parent = app.vault.getAbstractFileByPath(parentPath);
        if (!parent || !(parent instanceof TFolder)) {
          await createFolderRecursive(app, parentPath);
        }
      }
      await app.vault.create(path, content);
    },

    listFiles: async (dir: string): Promise<string[]> => {
      const folder = app.vault.getAbstractFileByPath(dir);
      if (!folder || !(folder instanceof TFolder)) {
        throw new Error(`Directory not found: ${dir}`);
      }
      return folder.children.map((f: TAbstractFile) => f.name);
    },

    exists: async (path: string): Promise<boolean> => {
      return app.vault.getAbstractFileByPath(path) !== null;
    },

    stat: async (path: string): Promise<{ size: number; mtime: Date; isDirectory: boolean } | null> => {
      const file = app.vault.getAbstractFileByPath(path);
      if (!file) return null;

      if (file instanceof TFolder) {
        return { size: 0, mtime: new Date(), isDirectory: true };
      }

      try {
        const stat = await app.vault.adapter.stat(path);
        if (!stat) return null;
        return {
          size: stat.size,
          mtime: new Date(stat.mtime),
          isDirectory: false,
        };
      } catch {
        return null;
      }
    },
  };

  // ── Vault Bridge ──
  const vault: VaultBridge = {
    getFile: async (path: string) => {
      const file = app.vault.getAbstractFileByPath(path);
      if (!file || !(file instanceof TFile)) return null;
      const content = await app.vault.read(file);
      return parseMarkdown(path, content);
    },

    createFile: async (path: string, content: string): Promise<void> => {
      await app.vault.create(path, content);
    },

    updateFile: async (path: string, content: string): Promise<void> => {
      const file = app.vault.getAbstractFileByPath(path);
      if (file && file instanceof TFile) {
        await app.vault.modify(file, content);
      }
    },

    deleteFile: async (path: string): Promise<void> => {
      const file = app.vault.getAbstractFileByPath(path);
      if (file && file instanceof TFile) {
        await app.vault.delete(file);
      }
    },

    getAllMarkdownFiles: async (): Promise<string[]> => {
      return app.vault
        .getFiles()
        .filter((f: TFile) => f.path.endsWith('.md'))
        .map((f: TFile) => f.path);
    },
  };

  // ── Editor Bridge ──
  const editor: EditorBridge = {
    openFile: async (path: string): Promise<void> => {
      const file = app.vault.getAbstractFileByPath(path);
      if (file && file instanceof TFile) {
        const leaf = app.workspace.getLeaf(false);
        if (leaf) {
          await leaf.setViewState({ type: 'markdown', state: { file: path, mode: 'source' } });
        }
      }
    },

    getActiveEditor: async () => {
      const activeLeaf = app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeLeaf) return null;
      return {
        getContent: () => activeLeaf.editor.getValue(),
        setContent: (content: string) => activeLeaf.editor.setValue(content),
        getPath: () => activeLeaf.file?.path ?? '',
      };
    },

    getActiveEditorContent: async (): Promise<string | null> => {
      const activeLeaf = app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeLeaf) return null;
      return activeLeaf.editor.getValue();
    },

    setActiveEditorContent: async (content: string): Promise<void> => {
      const activeLeaf = app.workspace.getActiveViewOfType(MarkdownView);
      if (activeLeaf) {
        activeLeaf.editor.setValue(content);
      }
    },
  };

  // ── UI Bridge ──
  const ui: UIBridge = {
    showNotice: (message: string, duration = 3000): void => {
      new Notice(message, duration);
    },

    showModal: async (title: string, content: string): Promise<() => void> => {
      class TempModal extends Modal {
        constructor(app: App, title: string, content: string) {
          super(app);
          this.titleEl.setText(title);
          this.contentEl.innerHTML = content;
        }
      }
      const modal = new TempModal(app, title, content);
      modal.open();
      return () => modal.close();
    },

    showView: (_viewId: string, _title: string, _icon?: string): void => {
      // Delegate to the plugin's view registration system
    },

    registerView: (_viewId: string, _viewClass: new (bridge: PluginBridge) => any): void => {
      // Handled by the plugin's registerViewMode
    },

    registerSettingsTab: (_tabClass: new (bridge: PluginBridge) => any): void => {
      // Handled by the plugin's addSettingTab
    },
  };

  // ── Event Bridge ──
  const events: EventBridge = {
    on: (event: string, callback: (...args: any[]) => void): () => void => {
      const ref: EventRef = app.workspace.on(event, callback);
      return () => {
        app.workspace.off(event, ref);
      };
    },

    emit: (event: string, ...args: any[]): void => {
      app.workspace.trigger(event, ...args);
    },
  };

  // Build the bridge object, then attach createGraph
  const bridge: PluginBridge = {
    fs,
    vault,
    editor,
    ui,
    events,
    vaultRoot,
    createGraph: () => createBridge(bridge),
  };

  return bridge;
}

// ── Plugin Class ─────────────────────────────────────────────────────

export default class SentryVaultPlugin extends Plugin {
  private bridge: PluginBridge | null = null;
  private graph: KnowledgeGraph | null = null;

  async onload(): Promise<void> {
    console.log('Loading SentryVault plugin...');

    // Create the bridge
    this.bridge = createObsidianBridge(this.app);

    // Create the graph bound to the bridge
    this.graph = this.bridge.createGraph();

    // Scan the vault on load
    try {
      await this.graph.scanFolder(this.app.vault.adapter.basePath);
      const fileCount = (this.graph as any)['files']?.size ?? 0;
      console.log(`SentryVault: Scanned ${fileCount} files`);
    } catch (err) {
      console.error('SentryVault: Failed to scan vault:', err);
      new Notice('SentryVault: Failed to scan vault', 5000);
    }

    // Register view types
    this.registerViews();

    // Register commands
    this.registerCommands();

    // Register settings tab
    this.addSettingTab(new SentryVaultSettingsTab(this.app, this));

    // Listen for vault file changes to update the index
    this.registerEvent(
      this.app.vault.on('modify', async (file: TAbstractFile) => {
        if (file instanceof TFile && file.path.endsWith('.md')) {
          await this.refreshFile(file.path);
        }
      }),
    );

    // Listen for file creation
    this.registerEvent(
      this.app.vault.on('create', async (file: TAbstractFile) => {
        if (file instanceof TFile && file.path.endsWith('.md')) {
          await this.refreshFile(file.path);
        }
      }),
    );

    // Listen for file deletion
    this.registerEvent(
      this.app.vault.on('delete', async (file: TAbstractFile) => {
        if (file instanceof TFile && file.path.endsWith('.md')) {
          await this.removeFile(file.path);
        }
      }),
    );

    console.log('SentryVault plugin loaded ✓');
  }

  /**
   * Register all custom views with Obsidian's workspace.
   */
  private registerViews(): void {
    if (!this.bridge || !this.graph) return;

    const bridge = this.bridge;
    const graph = this.graph;

    // Search View
    this.registerView(
      SEARCH_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new SentryVaultSearchView(leaf, bridge, graph),
    );

    // Graph View
    this.registerView(
      GRAPH_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new SentryVaultGraphView(leaf, bridge, graph),
    );

    // Backlinks View
    this.registerView(
      BACKLINKS_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new SentryVaultBacklinksView(leaf, bridge, graph),
    );

    // Daily Notes View
    this.registerView(
      DAILY_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new SentryVaultDailyView(leaf, bridge, graph),
    );
  }

  /**
   * Register all commands.
   */
  private registerCommands(): void {
    // Open search view
    this.addCommand({
      id: 'sentryvault-search',
      name: 'Search',
      icon: 'search',
      callback: () => {
        this.activateView(SEARCH_VIEW_TYPE);
      },
    });

    // Open graph view
    this.addCommand({
      id: 'sentryvault-graph',
      name: 'Graph View',
      icon: 'git-graph',
      callback: () => {
        this.activateView(GRAPH_VIEW_TYPE);
      },
    });

    // Open backlinks view
    this.addCommand({
      id: 'sentryvault-backlinks',
      name: 'Backlinks',
      icon: 'link',
      callback: () => {
        this.activateView(BACKLINKS_VIEW_TYPE);
      },
    });

    // Open daily notes view
    this.addCommand({
      id: 'sentryvault-daily',
      name: 'Daily Notes',
      icon: 'calendar',
      callback: () => {
        this.activateView(DAILY_VIEW_TYPE);
      },
    });

    // Refresh index
    this.addCommand({
      id: 'sentryvault-refresh',
      name: 'Refresh Index',
      icon: 'refresh-cw',
      callback: async () => {
        await this.refreshIndex();
      },
    });

    // Create daily note for today
    this.addCommand({
      id: 'sentryvault-daily-today',
      name: 'Daily Note: Today',
      icon: 'calendar',
      callback: async () => {
        await this.createDailyNoteForToday();
      },
    });
  }

  /**
   * Activate a registered view in a new leaf.
   */
  private activateView(viewType: string): void {
    const { workspace } = this.app;
    const leaf = workspace.getLeaf(false);
    if (leaf) {
      leaf.setViewState({ type: viewType, active: true });
    }
  }

  /**
   * Refresh the entire index by rescanning the vault.
   */
  async refreshIndex(): Promise<void> {
    if (!this.graph) {
      new Notice('SentryVault: Graph not initialized', 3000);
      return;
    }

    new Notice('SentryVault: Refreshing index...', 2000);

    try {
      await this.graph.scanFolder(this.app.vault.adapter.basePath);
      const fileCount = (this.graph as any)['files']?.size ?? 0;
      new Notice(`SentryVault: Index refreshed (${fileCount} files)`, 3000);
    } catch (err) {
      console.error('SentryVault: Failed to refresh index:', err);
      new Notice('SentryVault: Failed to refresh index', 5000);
    }
  }

  /**
   * Refresh a single file in the index.
   */
  private async refreshFile(path: string): Promise<void> {
    if (!this.graph || !this.bridge) return;

    try {
      const content = await this.bridge.fs.readFile(path);
      const parsed = parseMarkdown(path, content);
      this.graph.addFile(parsed);
      this.graph.buildBacklinkIndex();
      this.graph.buildSearchIndex();
    } catch (err) {
      console.error(`SentryVault: Failed to refresh file ${path}:`, err);
    }
  }

  /**
   * Remove a file from the index.
   */
  private async removeFile(path: string): Promise<void> {
    if (!this.graph) return;

    (this.graph as any)['files'].delete(path);
    this.graph.buildBacklinkIndex();
    this.graph.buildSearchIndex();
  }

  /**
   * Create a daily note for today.
   */
  async createDailyNoteForToday(): Promise<void> {
    if (!this.graph) {
      new Notice('SentryVault: Graph not initialized', 3000);
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    try {
      const daily = await this.graph.createDailyNote(today);
      new Notice(`SentryVault: Daily note created for ${today}`, 3000);

      // Open the daily note in the editor
      if (this.bridge) {
        await this.bridge.editor.openFile(daily.path);
      }
    } catch (err) {
      console.error('SentryVault: Failed to create daily note:', err);
      new Notice('SentryVault: Failed to create daily note', 5000);
    }
  }

  onunload(): void {
    console.log('SentryVault plugin unloaded');
  }
}
