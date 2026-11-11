/**
 * @module @sentryvault/core/graph
 * Graph data generator that converts parsed nodes and edges into
 * vis-network compatible format with styling and filtering support.
 */

import type { ParsedFile } from './parser.js';

// vis-network compatible node representation
export interface VisNode {
  id: string;
  label: string;
  file?: string;
  type?: 'file' | 'heading' | 'daily';
  shape?: string;
  color?: {
    background?: string;
    border?: string;
    highlight?: {
      background?: string;
      border?: string;
    };
    hover?: {
      background?: string;
      border?: string;
    };
  };
  size?: number;
  font?: {
    size?: number;
    face?: string;
    color?: string;
  };
  title?: string;
}

// vis-network compatible edge representation
export interface VisEdge {
  from: string;
  to: string;
  label?: string;
  arrows?: {
    to?: boolean;
    from?: boolean;
  };
  smooth?: {
    type?: string;
  };
  color?: {
    color?: string;
    highlight?: string;
    hover?: string;
  };
  title?: string;
}

// vis-network compatible graph data
export interface VisGraphData {
  nodes: VisNode[];
  edges: VisEdge[];
}

// Options for graph generation
export interface GraphOptions {
  /** Maximum number of nodes to include (0 = unlimited) */
  maxNodes?: number;
  /** Filter by node type: 'file', 'heading', 'daily', or undefined for all */
  nodeType?: 'file' | 'heading' | 'daily';
  /** Highlight specific node IDs */
  highlightIds?: string[];
  /** Whether to include heading nodes (default: true) */
  includeHeadings?: boolean;
  /** Whether to include wiki link target nodes that don't have a file (default: true) */
  includeUnlinkedTargets?: boolean;
  /** Custom label resolver for nodes */
  labelResolver?: (nodeId: string, parsedFile?: ParsedFile) => string;
}

// Default colors for node types
const NODE_COLORS = {
  file: {
    background: '#4a90d9',
    border: '#2c6fad',
    highlight: { background: '#6ab0ff', border: '#4a90d9' },
    hover: { background: '#5aa0e9', border: '#3c7fbd' },
  },
  heading: {
    background: '#7b68ee',
    border: '#5b48ce',
    highlight: { background: '#9b88ff', border: '#7b68ee' },
    hover: { background: '#8b78fe', border: '#6b58de' },
  },
  daily: {
    background: '#50c878',
    border: '#30a858',
    highlight: { background: '#70e898', border: '#50c878' },
    hover: { background: '#60d888', border: '#40b868' },
  },
};

const EDGE_COLORS = {
  wikiLink: {
    color: '#999',
    highlight: '#4a90d9',
    hover: '#6ab0ff',
  },
  heading: {
    color: '#bbb',
    highlight: '#7b68ee',
    hover: '#9b88ff',
  },
};

/**
 * Build a reverse map from wiki link target names to file paths.
 * E.g., "B" -> "B.md", "B#section" -> "B.md", etc.
 */
function buildTargetToPathMap(files: Map<string, ParsedFile>): Map<string, string> {
  const map = new Map<string, string>();
  for (const path of files.keys()) {
    const name = path.split('/').pop() || path;
    // Map both with and without .md extension
    map.set(name, path);
    const nameWithoutExt = name.replace(/\.md$/, '');
    if (nameWithoutExt !== name) {
      map.set(nameWithoutExt, path);
    }
  }
  return map;
}

/**
 * Resolve a wiki link target to a file path.
 * Returns the file path if found, otherwise returns the raw target.
 */
function resolveTargetPath(target: string, targetToPath: Map<string, string>): string {
  const baseTarget = target.split('#')[0];
  return targetToPath.get(baseTarget) ?? target;
}

/**
 * Generate vis-network compatible graph data from parsed files.
 *
 * Creates nodes for files, headings, and daily notes, and edges
 * for wiki links and heading-parent relationships.
 *
 * @param files - Map of file path to parsed file data.
 * @param options - Graph generation options.
 * @returns vis-network compatible { nodes, edges } data.
 */
export function generateGraphData(
  files: Map<string, ParsedFile>,
  options: GraphOptions = {},
): VisGraphData {
  const {
    maxNodes = 0,
    nodeType,
    highlightIds = [],
    includeHeadings = true,
    includeUnlinkedTargets = true,
    labelResolver,
  } = options;

  const nodes: VisNode[] = [];
  const edges: VisEdge[] = [];
  const nodeIds = new Set<string>();
  const edgeSet = new Set<string>(); // track edges to avoid duplicates

  let nodeCount = 0;

  // Build reverse map from wiki link targets to file paths
  const targetToPath = buildTargetToPathMap(files);

  // Helper to add a node if it doesn't exist
  function addNode(
    id: string,
    label: string,
    type: 'file' | 'heading' | 'daily',
    file?: ParsedFile,
  ): void {
    if (nodeIds.has(id)) return;
    if (nodeType && nodeType !== type) return;
    if (maxNodes > 0 && nodeCount >= maxNodes) return;

    nodeIds.add(id);
    nodeCount++;

    const color = NODE_COLORS[type];
    const isHighlighted = highlightIds.includes(id);

    const node: VisNode = {
      id,
      label,
      file: file ? file.path : undefined,
      type,
      shape: type === 'heading' ? 'dot' : 'box',
      color: {
        background: color.background,
        border: color.border,
        highlight: color.highlight,
        hover: color.hover,
      },
      size: type === 'file' ? 20 : 10,
      font: {
        size: type === 'file' ? 14 : 11,
        face: 'system-ui, -apple-system, sans-serif',
        color: '#fff',
      },
      title: file ? file.content.slice(0, 200) : undefined,
    };

    if (isHighlighted) {
      node.color = {
        background: '#ff6b6b',
        border: '#ee5a5a',
        highlight: { background: '#ff8b8b', border: '#ff6b6b' },
        hover: { background: '#ff7b7b', border: '#ff6b6b' },
      };
      node.size = type === 'file' ? 30 : 15;
      node.font = { ...node.font, size: type === 'file' ? 16 : 13 };
    }

    nodes.push(node);
  }

  // Helper to add an edge only if it doesn't already exist
  function addEdge(edge: VisEdge): void {
    const key = `${edge.from}→${edge.to}${edge.label ? `|${edge.label}` : ''}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push(edge);
  }

  // Phase 1: Add all file nodes and heading nodes, plus heading edges
  for (const [path, file] of files) {
    // Determine the display label
    let label: string;
    if (labelResolver) {
      label = labelResolver(path, file);
    } else {
      const title =
        typeof file.frontmatter.title === 'string'
          ? file.frontmatter.title
          : undefined;
      label = title || path.split('/').pop() || path;
    }

    // Add the file node
    addNode(path, label, 'file', file);

    // Add heading nodes and heading-parent edges
    if (includeHeadings) {
      for (const heading of file.headings) {
        const headingId = `${path}#${heading.text}`;
        const headingLabel = heading.text;

        addNode(headingId, headingLabel, 'heading', file);

        // Add edge from file to heading
        addEdge({
          from: path,
          to: headingId,
          arrows: { to: true },
          smooth: { type: 'curvedCW' },
          color: EDGE_COLORS.heading,
          title: `Heading: ${headingLabel}`,
        });
      }
    }
  }

  // Phase 2: Add wiki link edges and orphan nodes
  for (const [path, file] of files) {
    for (const link of file.wikiLinks) {
      const resolvedPath = resolveTargetPath(link.target, targetToPath);
      const targetFile = files.get(resolvedPath);

      if (targetFile) {
        // Target file exists — ensure node exists
        const targetLabel =
          typeof targetFile.frontmatter.title === 'string'
            ? targetFile.frontmatter.title
            : resolvedPath.split('/').pop() || resolvedPath;

        addNode(resolvedPath, targetLabel, 'file', targetFile);

        // Determine the target node id (with anchor if specified)
        const targetNodeId = link.anchor
          ? `${resolvedPath}#${link.anchor}`
          : resolvedPath;

        // Add wiki link edge
        addEdge({
          from: path,
          to: targetNodeId,
          label: link.anchor || undefined,
          arrows: { to: true },
          smooth: { type: 'curvedCW' },
          color: EDGE_COLORS.wikiLink,
          title: `Wiki link from ${path}`,
        });
      } else if (includeUnlinkedTargets) {
        // Target file doesn't exist — add as orphan node
        const targetId = link.anchor
          ? `${link.target}#${link.anchor}`
          : link.target;
        const targetLabel = link.anchor
          ? `${link.target} (${link.anchor})`
          : link.target;

        addNode(targetId, targetLabel, 'file');
        addEdge({
          from: path,
          to: targetId,
          label: link.anchor || undefined,
          arrows: { to: true },
          smooth: { type: 'curvedCW' },
          color: { ...EDGE_COLORS.wikiLink, color: '#ccc' },
          title: `Wiki link to unlinked target: ${targetLabel}`,
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Generate a minimal vis-network graph data from a list of file paths.
 * Useful for quick previews without full parsing.
 *
 * @param filePaths - Array of file paths.
 * @returns vis-network compatible { nodes, edges } data.
 */
export function generateSimpleGraphData(filePaths: string[]): VisGraphData {
  const nodes: VisNode[] = [];
  const edges: VisEdge[] = [];

  for (const path of filePaths) {
    const label = path.split('/').pop() || path;
    nodes.push({
      id: path,
      label,
      file: path,
      type: 'file',
      shape: 'box',
      color: {
        background: NODE_COLORS.file.background,
        border: NODE_COLORS.file.border,
        highlight: NODE_COLORS.file.highlight,
        hover: NODE_COLORS.file.hover,
      },
      size: 20,
      font: { size: 14, face: 'system-ui, -apple-system, sans-serif', color: '#fff' },
    });
  }

  return { nodes, edges };
}

/**
 * Get the default vis-network node styling for a given type.
 *
 * @param type - Node type.
 * @returns Default color configuration.
 */
export function getNodeColor(type: 'file' | 'heading' | 'daily') {
  return NODE_COLORS[type];
}
