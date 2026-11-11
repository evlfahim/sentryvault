/**
 * @module @sentryvault/obsidian/settings
 * Settings tab for SentryVault Obsidian plugin.
 *
 * Provides configuration options for the plugin.
 */

import { App, Plugin, Setting, SettingTab } from 'obsidian';
import { type PluginBridge } from '@sentryvault/core';
import type SentryVaultPlugin from './main.js';

interface SentryVaultSettings {
  dailyNotesFolder: string;
  searchHighlightColor: string;
  graphPhysicsEnabled: boolean;
  autoRefreshOnEdit: boolean;
}

const DEFAULT_SETTINGS: SentryVaultSettings = {
  dailyNotesFolder: 'daily-notes',
  searchHighlightColor: '#ffeb3b',
  graphPhysicsEnabled: true,
  autoRefreshOnEdit: true,
};

export class SentryVaultSettingsTab extends SettingTab {
  plugin: SentryVaultPlugin;
  private settings: SentryVaultSettings;

  constructor(app: App, plugin: SentryVaultPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.settings = { ...DEFAULT_SETTINGS };
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'SentryVault Settings' });
    containerEl.createEl('p', {
      text: 'Configure the SentryVault knowledge base plugin.',
      cls: 'setting-item-description',
    });

    // Daily Notes Folder
    new Setting(containerEl)
      .setName('Daily Notes Folder')
      .setDesc('Folder path for daily notes (relative to vault root).')
      .addText((text) =>
        text
          .setPlaceholder('daily-notes')
          .setValue(this.settings.dailyNotesFolder)
          .onChange(async (value: string) => {
            this.settings.dailyNotesFolder = value.trim() || 'daily-notes';
          }),
      );

    // Search Highlight Color
    new Setting(containerEl)
      .setName('Search Highlight Color')
      .setDesc('Color used to highlight search matches.')
      .addText((text) =>
        text
          .setPlaceholder('#ffeb3b')
          .setValue(this.settings.searchHighlightColor)
          .onChange(async (value: string) => {
            this.settings.searchHighlightColor = value.trim() || '#ffeb3b';
          }),
      );

    // Graph Physics
    new Setting(containerEl)
      .setName('Graph Physics')
      .setDesc('Enable physics simulation in the graph view.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.graphPhysicsEnabled)
          .onChange(async (value: boolean) => {
            this.settings.graphPhysicsEnabled = value;
          }),
      );

    // Auto Refresh
    new Setting(containerEl)
      .setName('Auto Refresh on Edit')
      .setDesc('Automatically refresh the index when files are edited.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.autoRefreshOnEdit)
          .onChange(async (value: boolean) => {
            this.settings.autoRefreshOnEdit = value;
          }),
      );

    // Refresh Index Button
    new Setting(containerEl)
      .setName('Refresh Index')
      .setDesc('Manually refresh the knowledge graph index.')
      .addButton((button) => {
        button.setButtonText('Refresh');
        button.setCta();
        button.onClick(async () => {
          button.setButtonText('Refreshing...');
          button.setDisabled(true);
          await this.plugin.refreshIndex();
          button.setButtonText('Refresh');
          button.setDisabled(false);
        });
      });

    // Create Daily Note Button
    new Setting(containerEl)
      .setName('Create Daily Note for Today')
      .setDesc('Create a daily note for the current date.')
      .addButton((button) => {
        button.setButtonText('Create Today');
        button.setCta();
        button.onClick(async () => {
          await this.plugin.createDailyNoteForToday();
        });
      });

    // About section
    containerEl.createEl('hr');
    containerEl.createEl('h3', { text: 'About' });
    containerEl.createEl('p', {
      text: 'SentryVault v0.1.0 — An offline-first markdown knowledge base with backlinks, full-text search, graph view, and daily notes.',
      cls: 'setting-item-description',
    });
    containerEl.createEl('p', {
      text: 'Core engine: @sentryvault/core. Plugin bridge: @sentryvault/obsidian.',
      cls: 'setting-item-description',
    });
  }
}
