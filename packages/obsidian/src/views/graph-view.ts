/**
 * @module @sentryvault/obsidian/views/graph-view
 * Graph view for SentryVault Obsidian plugin.
 *
 * Renders an interactive graph visualization using vis-network.
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import { KnowledgeGraph, type PluginBridge } from '@sentryvault/core';

export const GRAPH_VIEW_TYPE = 'sentryvault-graph-view';

export class SentryVaultGraphView extends ItemView {
  private bridge: PluginBridge;
  private graph: KnowledgeGraph;
  private networkContainer: HTMLDivElement | null = null;
  private network: any = null;

  constructor(leaf: WorkspaceLeaf, bridge: PluginBridge, graph: KnowledgeGraph) {
    super(leaf);
    this.bridge = bridge;
    this.graph = graph;
  }

  getViewType(): string {
    return GRAPH_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'SentryVault Graph';
  }

  getIcon(): string {
    return 'git-graph';
  }

  async onOpen(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('sentryvault-graph-view');

    // Title
    containerEl.createEl('h2', { text: 'SentryVault Graph' }).addClass('sentryvault-title');

    // Container for vis-network
    this.networkContainer = containerEl.createDiv({ cls: 'sentryvault-network-container' });
    this.networkContainer.style.width = '100%';
    this.networkContainer.style.height = 'calc(100vh - 100px)';
    this.networkContainer.style.borderRadius = '8px';
    this.networkContainer.style.overflow = 'hidden';

    // Load vis-network from CDN
    await this.loadVisNetwork();

    // Render the graph
    this.renderGraph();
  }

  async onClose(): Promise<void> {
    if (this.network) {
      this.network.destroy();
      this.network = null;
    }
  }

  private async loadVisNetwork(): Promise<void> {
    // Load vis-network from CDN if not already loaded
    if (typeof (window as any).vis !== 'undefined') return;

    return new Promise<void>((resolve, reject) => {
      // Load vis-network CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.css';
      document.head.appendChild(link);

      // Load vis-network JS
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load vis-network'));
      document.head.appendChild(script);
    });
  }

  private renderGraph(): void {
    if (!this.networkContainer || typeof (window as any).vis === 'undefined') return;

    // Destroy existing network
    if (this.network) {
      this.network.destroy();
    }

    try {
      const graphData = this.graph.getGraphData();

      const vis = (window as any).vis;
      const nodes = new vis.DataSet(
        graphData.nodes.map((n: any) => ({
          id: n.id,
          label: n.label,
          shape: n.type === 'heading' ? 'dot' : 'box',
          color: this.getNodeColor(n.type),
          size: n.type === 'file' ? 20 : 10,
          font: {
            size: n.type === 'file' ? 14 : 12,
          },
        })),
      );

      const edges = new vis.DataSet(
        graphData.edges.map((e: any) => ({
          from: e.from,
          to: e.to,
          label: e.label || '',
          arrows: { to: { enabled: true } },
          smooth: { type: 'curvedCW' },
        })),
      );

      const data = { nodes, edges };
      const options = {
        physics: {
          enabled: true,
          barnesHut: {
            gravitationalConstant: -2000,
            centralGravity: 0.3,
            springLength: 100,
            springConstant: 0.04,
            damping: 0.09,
          },
          stabilization: { iterations: 200 },
        },
        interaction: {
          hover: true,
          tooltipDelay: 200,
          zoomView: true,
          dragView: true,
          dragNodes: true,
        },
      };

      this.network = new vis.Network(this.networkContainer, data, options);

      // Click handler: open file on node click
      this.network.on('click', (params: any) => {
        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0];
          const node = nodes.get(nodeId);
          if (node && node.file) {
            this.bridge.editor.openFile(node.file);
          }
        }
      });
    } catch (err) {
      console.error('SentryVault: Graph render error:', err);
      if (this.networkContainer) {
        this.networkContainer.createEl('p', {
          text: 'Failed to render graph. Check console for details.',
        });
      }
    }
  }

  private getNodeColor(type?: string): { background?: string; border?: string } {
    switch (type) {
      case 'file':
        return { background: '#4a90d9', border: '#357abd' };
      case 'heading':
        return { background: '#95a5a6', border: '#7f8c8d' };
      case 'daily':
        return { background: '#27ae60', border: '#1e8449' };
      default:
        return { background: '#bdc3c7', border: '#95a5a6' };
    }
  }
}
