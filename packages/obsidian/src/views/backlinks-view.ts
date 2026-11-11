/**
 * @module @sentryvault/obsidian/views/backlinks-view
 * Backlinks view for SentryVault Obsidian plugin.
 *
 * Displays backlinks for a given file or wiki link target.
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import { KnowledgeGraph, type PluginBridge } from '@sentryvault/core';

export const BACKLINKS_VIEW_TYPE = 'sentryvault-backlinks-view';

export class SentryVaultBacklinksView extends ItemView {
  private bridge: PluginBridge;
  private graph: KnowledgeGraph;
  private targetInput: HTMLInputElement | null = null;
  private resultsContainer: HTMLDivElement | null = null;

  constructor(leaf: WorkspaceLeaf, bridge: PluginBridge, graph: KnowledgeGraph) {
    super(leaf);
    this.bridge = bridge;
    this.graph = graph;
  }

  getViewType(): string {
    return BACKLINKS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'SentryVault Backlinks';
  }

  getIcon(): string {
    return 'link';
  }

  async onOpen(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('sentryvault-backlinks-view');

    // Title
    containerEl.createEl('h2', { text: 'SentryVault Backlinks' }).addClass('sentryvault-title');

    // Target input
    const inputContainer = containerEl.createDiv({ cls: 'sentryvault-backlinks-input-container' });
    this.targetInput = inputContainer.createEl('input', {
      type: 'text',
      placeholder: 'Enter file name or wiki link target...',
    });
    this.targetInput.addClass('sentryvault-backlinks-input');
    this.targetInput.addEventListener('input', () => {
      this.performBacklinkSearch();
    });

    // Results container
    this.resultsContainer = containerEl.createDiv({ cls: 'sentryvault-backlinks-results' });
    this.resultsContainer.addClass('sentryvault-backlinks-results');

    // Initial state
    this.resultsContainer.createEl('p', { text: 'Enter a file name to see backlinks...' });
  }

  async onClose(): Promise<void> {
    // Cleanup
  }

  private async performBacklinkSearch(): Promise<void> {
    if (!this.targetInput || !this.resultsContainer) return;

    const target = this.targetInput.value.trim();
    this.resultsContainer.empty();

    if (!target) {
      this.resultsContainer.createEl('p', { text: 'Enter a file name to see backlinks...' });
      return;
    }

    try {
      const backlinks = this.graph.getBacklinks(target);

      if (backlinks.length === 0) {
        this.resultsContainer.createEl('p', { text: `No backlinks found for "${target}".` });
        return;
      }

      // Title with count
      this.resultsContainer.createEl('h3', {
        text: `${backlinks.length} backlink${backlinks.length > 1 ? 's' : ''} for "${target}"`,
      }).addClass('sentryvault-backlinks-count');

      for (const bl of backlinks) {
        const item = this.resultsContainer.createEl('div', { cls: 'sentryvault-backlink-item' });

        // Source file
        const sourceEl = item.createEl('div', { cls: 'sentryvault-backlink-source' });
        sourceEl.setText(bl.source);
        sourceEl.style.cursor = 'pointer';
        sourceEl.style.fontWeight = 'bold';
        sourceEl.style.marginBottom = '0.25em';
        sourceEl.addEventListener('click', async () => {
          await this.bridge.editor.openFile(bl.source);
        });

        // Source heading (if any)
        if (bl.sourceHeading) {
          const headingEl = item.createEl('div', { cls: 'sentryvault-backlink-heading' });
          headingEl.setText(`↳ Section: ${bl.sourceHeading}`);
          headingEl.style.marginLeft = '1em';
          headingEl.style.fontSize = '0.9em';
          headingEl.style.color = '#666';
        }

        // Line number
        const lineEl = item.createEl('div', { cls: 'sentryvault-backlink-line' });
        lineEl.setText(`Line ${bl.line}`);
        lineEl.style.marginLeft = '1em';
        lineEl.style.fontSize = '0.85em';
        lineEl.style.color = '#999';
      }
    } catch (err) {
      console.error('SentryVault: Backlinks error:', err);
      this.resultsContainer.createEl('p', { text: 'Backlinks error. Try refreshing the index.' });
    }
  }
}
