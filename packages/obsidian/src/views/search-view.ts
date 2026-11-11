/**
 * @module @sentryvault/obsidian/views/search-view
 * Search view for SentryVault Obsidian plugin.
 *
 * Provides a search interface backed by @sentryvault/core's full-text search.
 */

import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import { KnowledgeGraph, type PluginBridge } from '@sentryvault/core';

export const SEARCH_VIEW_TYPE = 'sentryvault-search-view';

export class SentryVaultSearchView extends ItemView {
  private bridge: PluginBridge;
  private graph: KnowledgeGraph;
  private searchInput: HTMLInputElement | null = null;
  private resultsContainer: HTMLDivElement | null = null;

  constructor(leaf: WorkspaceLeaf, bridge: PluginBridge, graph: KnowledgeGraph) {
    super(leaf);
    this.bridge = bridge;
    this.graph = graph;
  }

  getViewType(): string {
    return SEARCH_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'SentryVault Search';
  }

  getIcon(): string {
    return 'search';
  }

  async onOpen(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('sentryvault-search-view');

    // Title
    const titleEl = containerEl.createEl('h2', { text: 'SentryVault Search' });
    titleEl.addClass('sentryvault-title');

    // Search input
    const inputContainer = containerEl.createDiv({ cls: 'sentryvault-search-input-container' });
    this.searchInput = inputContainer.createEl('input') as HTMLInputElement;
    this.searchInput.type = 'text';
    this.searchInput.placeholder = 'Search vault...';
    this.searchInput.addClass('sentryvault-search-input');
    this.searchInput.addEventListener('input', () => {
      this.performSearch();
    });

    // Results container
    this.resultsContainer = containerEl.createDiv({ cls: 'sentryvault-results' });
    this.resultsContainer.addClass('sentryvault-results');

    // Initial state
    this.resultsContainer.createEl('p', { text: 'Type to search your vault...' });
  }

  async onClose(): Promise<void> {
    // Cleanup
  }

  private async performSearch(): Promise<void> {
    if (!this.searchInput || !this.resultsContainer) return;

    const query = this.searchInput.value.trim();
    this.resultsContainer.empty();

    if (!query) {
      this.resultsContainer.createEl('p', { text: 'Type to search your vault...' });
      return;
    }

    try {
      const results = this.graph.search(query, { limit: 50 });

      if (results.length === 0) {
        this.resultsContainer.createEl('p', { text: 'No results found.' });
        return;
      }

      // Sort by score (descending)
      results.sort((a, b) => b.score - a.score);

      for (const result of results) {
        const item = this.resultsContainer.createEl('div', { cls: 'sentryvault-result-item' });

        // File name
        const fileEl = item.createEl('div', { cls: 'sentryvault-result-file' });
        fileEl.setText(result.file);
        fileEl.addClass('sentryvault-result-file');
        fileEl.style.cursor = 'pointer';
        fileEl.style.fontWeight = 'bold';
        fileEl.addEventListener('click', async () => {
          await this.bridge.editor.openFile(result.file);
        });

        // Highlights
        if (result.highlights && result.highlights.length > 0) {
          for (const hl of result.highlights) {
            const hlEl = item.createEl('div', { cls: 'sentryvault-highlight' });
            hlEl.style.marginLeft = '1em';
            hlEl.style.marginTop = '0.25em';
            hlEl.style.fontSize = '0.9em';
            hlEl.style.color = '#666';

            // Highlight the matching term
            const snippet = hl.snippet;
            const term = hl.term;
            const lowerSnippet = snippet.toLowerCase();
            const lowerTerm = term.toLowerCase();
            const idx = lowerSnippet.indexOf(lowerTerm);

            if (idx >= 0) {
              const before = snippet.substring(0, idx);
              const match = snippet.substring(idx, idx + term.length);
              const after = snippet.substring(idx + term.length);

              hlEl.createSpan({ text: before });
              const matchSpan = hlEl.createSpan({ text: match });
              matchSpan.style.background = '#ffeb3b';
              matchSpan.style.padding = '0 2px';
              matchSpan.style.borderRadius = '2px';
              hlEl.createSpan({ text: after });
            } else {
              hlEl.setText(snippet);
            }
          }
        }
      }
    } catch (err) {
      console.error('SentryVault: Search error:', err);
      this.resultsContainer.createEl('p', { text: 'Search error. Try refreshing the index.' });
    }
  }
}
