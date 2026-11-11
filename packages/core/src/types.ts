/**
 * @module @sentryvault/core/types
 * Shared type definitions for the SentryVault core engine.
 */

// ── Parser Types ─────────────────────────────────────────────────────

/**
 * YAML frontmatter metadata extracted from a markdown file.
 * Keys are strings; values can be any JSON-compatible type.
 */
export interface Frontmatter {
  [key: string]: unknown;
}

/**
 * A heading extracted from markdown content.
 */
export interface Heading {
  /** Heading level (1-6) */
  level: number;
  /** Heading text content */
  text: string;
  /** 1-based line number in the original file */
  line: number;
}

/**
 * A wiki link [[target]] or [[target#anchor]] extracted from markdown.
 */
export interface WikiLink {
  /** Target file name (without path) */
  target: string;
  /** 1-based line number where the link appears */
  line: number;
  /** Optional anchor/heading reference */
  anchor?: string;
}

/**
 * Fully parsed markdown file with all extracted metadata.
 */
export interface ParsedFile {
  /** File path (relative or absolute, as provided) */
  path: string;
  /** Raw markdown content */
  content: string;
  /** Extracted YAML frontmatter */
  frontmatter: Frontmatter;
  /** Extracted headings */
  headings: Heading[];
  /** Extracted wiki links */
  wikiLinks: WikiLink[];
}

// ── Search Types ─────────────────────────────────────────────────────

/**
 * Options for search queries.
 */
export interface SearchOptions {
  /** Maximum number of results to return (default: 50) */
  limit?: number;
  /** Minimum match score threshold 0-1 (default: 0) */
  minScore?: number;
  /** Characters to include before/after match in snippet (default: 60) */
  snippetPadding?: number;
}

/**
 * A single search highlight with context.
 */
export interface SearchHighlight {
  /** The matched search term */
  term: string;
  /** Surrounding text snippet with context */
  snippet: string;
  /** 1-based line number where the match was found */
  line: number;
}

/**
 * A complete search result for a file.
 */
export interface SearchResult {
  /** File path that matched */
  file: string;
  /** Relevance score (higher = more relevant) */
  score: number;
  /** List of matched terms with their snippets */
  highlights: SearchHighlight[];
}

// ── Graph Types ──────────────────────────────────────────────────────

/**
 * vis-network compatible node representation.
 */
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

/**
 * vis-network compatible edge representation.
 */
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

/**
 * vis-network compatible graph data container.
 */
export interface VisGraphData {
  nodes: VisNode[];
  edges: VisEdge[];
}

/**
 * Options for graph generation.
 */
export interface GraphOptions {
  /** Maximum number of nodes to include (0 = unlimited) */
  maxNodes?: number;
  /** Filter by node type: 'file', 'heading', 'daily', or undefined for all */
  nodeType?: 'file' | 'heading' | 'daily';
  /** Highlight specific node IDs */
  highlightIds?: string[];
  /** Whether to include heading nodes (default: true) */
  includeHeadings?: boolean;
  /** Whether to include wiki link target nodes without files (default: true) */
  includeUnlinkedTargets?: boolean;
  /** Custom label resolver for nodes */
  labelResolver?: (nodeId: string, parsedFile?: ParsedFile) => string;
}

// ── Backlink Types ───────────────────────────────────────────────────

/**
 * A backlink from a source file to a target.
 */
export interface Backlink {
  /** Source file path */
  source: string;
  /** Source heading where the link appears (if any) */
  sourceHeading?: string;
  /** Target file name or wiki link target */
  target: string;
  /** Target anchor/heading (if any) */
  targetHeading?: string;
  /** 1-based line number in the source file */
  line: number;
}

// ── Daily Note Types ─────────────────────────────────────────────────

/**
 * Options for creating daily notes.
 */
export interface DailyNoteOptions {
  /** Template string with {{date}} placeholder */
  template?: string;
  /** Folder path for daily notes (default: 'daily-notes') */
  folder?: string;
}

/**
 * A daily note with its content and metadata.
 */
export interface DailyNote {
  /** File path for the daily note */
  path: string;
  /** Raw markdown content */
  content: string;
  /** Date string (YYYY-MM-DD) */
  date: string;
}

// ── Internal Graph Types (used by KnowledgeGraph) ────────────────────

/**
 * Internal graph node representation (simpler than VisNode).
 */
export interface GraphNode {
  id: string;
  label: string;
  file: string;
  type: 'file' | 'heading' | 'daily';
}

/**
 * Internal graph edge representation (simpler than VisEdge).
 */
export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

/**
 * Internal graph data container.
 */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
