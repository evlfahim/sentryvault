/**
 * @module @sentryvault/obsidian/views/daily-view
 * Daily notes view for SentryVault Obsidian plugin.
 *
 * Provides daily note creation, listing, and quick capture.
 */

import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import { KnowledgeGraph, type PluginBridge } from '@sentryvault/core';

export const DAILY_VIEW_TYPE = 'sentryvault-daily-view';

export class SentryVaultDailyView extends ItemView {
  private bridge: PluginBridge;
  private graph: KnowledgeGraph;
  private dateInput: HTMLInputElement | null = null;
  private resultsContainer: HTMLDivElement | null = null;
  private templateInput: HTMLTextAreaElement | null = null;

  constructor(leaf: WorkspaceLeaf, bridge: PluginBridge, graph: KnowledgeGraph) {
    super(leaf);
    this.bridge = bridge;
    this.graph = graph;
  }

  getViewType(): string {
    return DAILY_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'SentryVault Daily Notes';
  }

  getIcon(): string {
    return 'calendar';
  }

  async onOpen(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('sentryvault-daily-view');

    // Title
    containerEl.createEl('h2', { text: 'SentryVault Daily Notes' }).addClass('sentryvault-title');

    // Date input
    const dateContainer = containerEl.createDiv({ cls: 'sentryvault-daily-date-container' });
    this.dateInput = dateContainer.createEl('input', {
      type: 'date',
    });
    this.dateInput.addClass('sentryvault-daily-date');
    const today = new Date().toISOString().split('T')[0];
    this.dateInput.value = today;

    // Create button
    const createBtn = dateContainer.createEl('button', { text: 'Create / Open' });
    createBtn.addClass('sentryvault-daily-create-btn');
    createBtn.addEventListener('click', () => {
      this.createDailyNote();
    });

    // Template textarea
    const templateContainer = containerEl.createDiv({ cls: 'sentryvault-daily-template-container' });
    templateContainer.createEl('label', { text: 'Template ({{date}} placeholder):' });
    this.templateInput = templateContainer.createEl('textarea', {
      placeholder: '---\ntitle: {{date}}\n---\n\n# {{date}}\n',
    });
    this.templateInput.addClass('sentryvault-daily-template');
    this.templateInput.rows = 4;
    this.templateInput.style.width = '100%';
    this.templateInput.style.marginTop = '0.5em';
    this.templateInput.style.fontFamily = 'monospace';
    this.templateInput.style.fontSize = '0.9em';

    // Results container
    this.resultsContainer = containerEl.createDiv({ cls: 'sentryvault-daily-results' });
    this.resultsContainer.addClass('sentryvault-daily-results');

    // List existing daily notes
    await this.listDailyNotes();
  }

  async onClose(): Promise<void> {
    // Cleanup
  }

  private async createDailyNote(): Promise<void> {
    if (!this.dateInput || !this.resultsContainer) return;

    const date = this.dateInput.value;
    if (!date) {
      new Notice('SentryVault: Please select a date', 3000);
      return;
    }

    const template = this.templateInput?.value ?? '';

    try {
      const daily = await this.graph.createDailyNote(date, { template });

      // Show the daily note content
      this.resultsContainer.empty();
      const header = this.resultsContainer.createEl('h3', { text: `Daily Note: ${date}` });
      header.addClass('sentryvault-daily-header');

      // Content preview
      const contentEl = this.resultsContainer.createEl('pre', { cls: 'sentryvault-daily-content' });
      contentEl.style.whiteSpace = 'pre-wrap';
      contentEl.style.fontFamily = 'monospace';
      contentEl.style.fontSize = '0.9em';
      contentEl.style.background = '#f5f5f5';
      contentEl.style.padding = '1em';
      contentEl.style.borderRadius = '4px';
      contentEl.style.maxHeight = '300px';
      contentEl.style.overflow = 'auto';
      contentEl.setText(daily.content);

      // Open button
      const openBtn = this.resultsContainer.createEl('button', { text: 'Open in Editor' });
      openBtn.addClass('sentryvault-daily-open-btn');
      openBtn.style.marginTop = '0.5em';
      openBtn.addEventListener('click', async () => {
        await this.bridge.editor.openFile(daily.path);
      });

      new Notice(`SentryVault: ${daily.path} ready`, 3000);
    } catch (err) {
      console.error('SentryVault: Daily note error:', err);
      new Notice('SentryVault: Failed to create daily note', 5000);
    }
  }

  private async listDailyNotes(): Promise<void> {
    if (!this.resultsContainer) return;

    try {
      const allFiles = await this.bridge.vault.getAllMarkdownFiles();
      const dailyNotes = allFiles
        .filter((f) => f.includes('daily') || f.includes('diary'))
        .sort()
        .slice(-20); // Last 20 daily notes

      this.resultsContainer.empty();

      if (dailyNotes.length === 0) {
        this.resultsContainer.createEl('p', { text: 'No daily notes found.' });
        return;
      }

      const heading = this.resultsContainer.createEl('h3', { text: 'Recent Daily Notes' });
      heading.addClass('sentryvault-daily-recent');

      for (const path of dailyNotes) {
        const item = this.resultsContainer.createEl('div', { cls: 'sentryvault-daily-item' });
        const link = item.createEl('a', { text: path });
        link.style.cursor = 'pointer';
        link.style.display = 'block';
        link.style.padding = '0.25em 0';
        link.addEventListener('click', async () => {
          await this.bridge.editor.openFile(path);
        });
      }
    } catch (err) {
      console.error('SentryVault: Failed to list daily notes:', err);
    }
  }
}
