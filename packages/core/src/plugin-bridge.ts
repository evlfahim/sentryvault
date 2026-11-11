/**
 * @module @sentryvault/core/plugin-bridge
 * Plugin bridge interface for embedding SentryVault core in host environments.
 *
 * The bridge abstracts away host-specific APIs (file system, editor, UI, events)
 * so that the core `KnowledgeGraph` engine can run in any environment —
 * currently the standalone web server, and later Obsidian, VS Code, etc.
 *
 * @example
 * ```ts
 * import { KnowledgeGraph, createBridge, type PluginBridge } from '@sentryvault/core';
 *
 * // Define your bridge for the host environment
 * const bridge: PluginBridge = {
 *   async readFile(path) { return hostReadFile(path); },
 *   async writeFile(path, content) { return hostWriteFile(path, content); },
 *   async listFiles(dir) { return hostListFiles(dir); },
 *   async exists(path) { return hostExists(path); },
 *   async openFile(path) { return hostOpenFile(path); },
 *   async getActiveEditor() { return hostGetActiveEditor(); },
 *   async showNotice(msg) { hostShowNotice(msg); },
 *   async showModal(title, content) { hostShowModal(title, content); },
 * };
 *
 * // Create a KnowledgeGraph bound to the bridge
 * const kg = createBridge(bridge);
 * await kg.scanFolder('./my-vault');
 * const results = kg.search('query');
 * ```
 */

import { KnowledgeGraph } from './index.js';
import type { ParsedFile, DailyNote } from './types.js';
import { parseMarkdown } from './parser.js';

// ── Bridge Interfaces ──────────────────────────────────────────────────

/**
 * File system operations that the bridge must provide.
 * All paths are relative to the vault root or absolute depending on host.
 */
export interface FileSystemBridge {
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

/**
 * Vault operations that the bridge must provide.
 * These are higher-level than raw file system ops, tailored for markdown vaults.
 */
export interface VaultBridge {
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

/**
 * Editor operations that the bridge must provide.
 * Used for opening files in the editor and reading/writing editor content.
 */
export interface EditorBridge {
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

/**
 * Handle for an active text editor.
 * Provides methods to read and write editor content.
 */
export interface EditorHandle {
  /** Get the current content of the editor. */
  getContent(): string;
  /** Set the content of the editor. */
  setContent(content: string): void;
  /** Get the file path associated with this editor. */
  getPath(): string;
}

/**
 * UI operations that the bridge must provide.
 * Used for showing modals, notices, and managing views.
 */
export interface UIBridge {
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

/**
 * Minimal view class interface for host environments.
 */
export interface ViewClass {
  /** Called when the view is shown. */
  onShow?(): void;
  /** Called when the view is hidden. */
  onHide?(): void;
  /** Called when the view is destroyed. */
  destroy?(): void;
  /** The container element for the view. */
  container?: HTMLElement;
}

/**
 * Minimal settings tab interface for host environments.
 */
export interface SettingsTabClass {
  /** Called when the settings tab is displayed. */
  display?(): void;
  /** The container element for the settings tab. */
  container?: HTMLElement;
}

/**
 * Event system that the bridge must provide.
 * Used for registering and emitting custom events.
 */
export interface EventBridge {
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

/**
 * Main plugin bridge interface.
 * Combines all bridge subsystems into a single object.
 *
 * Host environments (Obsidian, VS Code, etc.) implement this interface
 * to provide their specific APIs to the SentryVault core engine.
 */
export interface PluginBridge {
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

// ── Bridge Factory ─────────────────────────────────────────────────────

/**
 * Create a KnowledgeGraph instance bound to a PluginBridge.
 *
 * The returned graph uses the bridge's file system and vault
 * operations for scanning, reading, and writing files.
 *
 * @param bridge - The plugin bridge implementation.
 * @returns A KnowledgeGraph instance ready to use.
 */
export function createBridge(bridge: PluginBridge): KnowledgeGraph {
  const kg = new KnowledgeGraph();

  // Override scanFolder to use the bridge's file system
  const originalScanFolder = kg.scanFolder.bind(kg);
  kg.scanFolder = async (folderPath: string) => {
    const files: ParsedFile[] = [];

    // Use bridge's listFiles and readFile instead of fs
    const entries = await bridge.fs.listFiles(folderPath);

    for (const entry of entries) {
      const fullPath = `${folderPath}/${entry}`;
      const stat = await bridge.fs.stat(fullPath);

      if (stat && stat.isDirectory) {
        // Skip node_modules and hidden directories
        if (entry === 'node_modules' || entry.startsWith('.')) {
          continue;
        }
        const subFiles = await kg.scanFolder(fullPath);
        files.push(...subFiles);
      } else if (entry.endsWith('.md')) {
        const content = await bridge.fs.readFile(fullPath);
        const parsed = parseMarkdown(fullPath, content);
        files.push(parsed);
        kg.addFile(parsed);
      }
    }

    kg.buildBacklinkIndex();
    kg.buildSearchIndex();

    return files;
  };

  return kg;
}

// ── Minimal Bridge (for testing / standalone use) ──────────────────────

/**
 * A minimal PluginBridge implementation that uses Node.js fs/promises.
 * Useful for testing the bridge pattern without a full host environment.
 */
export async function createMinimalBridge(vaultRoot: string): Promise<PluginBridge> {
  const { readdir, readFile, writeFile, stat } = await import('fs/promises');
  const { join } = await import('path');

  const fs: FileSystemBridge = {
    readFile: async (path) => readFile(join(vaultRoot, path), 'utf-8'),
    writeFile: async (path, content) => writeFile(join(vaultRoot, path), content, 'utf-8'),
    listFiles: async (dir) => readdir(join(vaultRoot, dir)),
    exists: async (path) => {
      try {
        await stat(join(vaultRoot, path));
        return true;
      } catch {
        return false;
      }
    },
    stat: async (path) => {
      try {
        const s = await stat(join(vaultRoot, path));
        return {
          size: s.size,
          mtime: s.mtime,
          isDirectory: s.isDirectory(),
        };
      } catch {
        return null;
      }
    },
  };

  const vault: VaultBridge = {
    getFile: async (path) => {
      const content = await fs.readFile(path);
      return parseMarkdown(path, content);
    },
    createFile: async (path, content) => fs.writeFile(path, content),
    updateFile: async (path, content) => fs.writeFile(path, content),
    deleteFile: async (path) => {
      // Note: fs.unlink would be needed here; stubbed for interface completeness
      throw new Error('deleteFile not implemented in minimal bridge');
    },
    getAllMarkdownFiles: async () => {
      const files: string[] = [];
      async function walk(dir: string) {
        const entries = await fs.listFiles(dir);
        for (const entry of entries) {
          const fullPath = `${dir}/${entry}`;
          const s = await fs.stat(fullPath);
          if (s && s.isDirectory) {
            if (entry !== 'node_modules' && !entry.startsWith('.')) {
              await walk(fullPath);
            }
          } else if (entry.endsWith('.md')) {
            files.push(fullPath);
          }
        }
      }
      await walk('.');
      return files;
    },
  };

  // Stub implementations for editor, UI, and events
  const editor: EditorBridge = {
    openFile: async () => {},
    getActiveEditor: async () => null,
    getActiveEditorContent: async () => null,
    setActiveEditorContent: async () => {},
  };

  const ui: UIBridge = {
    showNotice: () => {},
    showModal: async () => async () => {},
    showView: () => {},
    registerView: () => {},
    registerSettingsTab: () => {},
  };

  const events: EventBridge = {
    on: () => () => {},
    emit: () => {},
  };

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

// ── Re-export parser utilities for bridge implementations ──────────────
// Bridge implementations can import these directly from parser.js,
// but they are also re-exported here for convenience.

export {
  parseMarkdown,
  extractFrontmatter,
  extractHeadings,
  extractWikiLinks,
  parseYamlValue,
} from './parser.js';
