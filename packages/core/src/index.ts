/**
 * @module @sentryvault/core
 * Core knowledge graph engine for SentryVault.
 */

import { SearchEngine } from './search.js';

export {
  Frontmatter,
  Heading,
  WikiLink,
  ParsedFile,
  parseYamlValue,
  extractFrontmatter,
  extractHeadings,
  extractWikiLinks,
  parseMarkdown,
} from './parser.js';

export {
  SearchEngine,
  SearchOptions,
  SearchHighlight,
  SearchResult as SearchEngineResult,
} from './search.js';

export interface Backlink {
  source: string;
  sourceHeading?: string;
  target: string;
  targetHeading?: string;
  line: number;
}

export interface SearchResult {
  file: string;
  score: number;
  matches: { text: string; snippet: string }[];
}

export interface GraphNode {
  id: string;
  label: string;
  file: string;
  type: 'file' | 'heading' | 'daily';
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface DailyNoteOptions {
  template?: string;
  folder?: string;
}

export interface DailyNote {
  path: string;
  content: string;
  date: string;
}

export class KnowledgeGraph {
  private files: Map<string, ParsedFile> = new Map();
  private backlinks: Map<string, Backlink[]> = new Map();
  private searchEngine: SearchEngine = new SearchEngine();

  /**
   * Scan a folder of .md files and parse them without modifying them.
   */
  async scanFolder(folderPath: string): Promise<ParsedFile[]> {
    const { readdir, readFile, stat } = await import('fs/promises');
    const { join } = await import('path');

    const files: ParsedFile[] = [];
    const entries = await readdir(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(folderPath, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }
        const subFiles = await this.scanFolder(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = await readFile(fullPath, 'utf-8');
        const parsed = parseMarkdown(fullPath, content);
        files.push(parsed);
        this.files.set(parsed.path, parsed);
      }
    }

    this.buildBacklinkIndex();
    this.buildSearchIndex();

    return files;
  }

  /**
   * Add a parsed file to the internal index.
   */
  addFile(parsed: ParsedFile): void {
    this.files.set(parsed.path, parsed);
  }

  /**
   * Build an index mapping targets to source files that link to them.
   * Tracks which heading (if any) each wiki link appears under.
   */
  buildBacklinkIndex(): void {
    this.backlinks.clear();

    for (const [path, file] of this.files) {
      for (const link of file.wikiLinks) {
        // Determine the heading under which this wiki link appears.
        // Walk through headings and find the last one whose line is before
        // the wiki link's line. If no heading exists before the link,
        // the link is in the preamble (before any heading).
        let sourceHeading: string | undefined;
        for (let i = file.headings.length - 1; i >= 0; i--) {
          if (file.headings[i].line < link.line) {
            sourceHeading = file.headings[i].text;
            break;
          }
        }

        const targetKey = link.target;
        if (!this.backlinks.has(targetKey)) {
          this.backlinks.set(targetKey, []);
        }
        this.backlinks.get(targetKey)!.push({
          source: path,
          sourceHeading,
          target: targetKey,
          targetHeading: link.anchor,
          line: link.line,
        });
      }
    }
  }

  /**
   * Get backlinks for a given target (file name or wiki link target).
   */
  getBacklinks(target: string): Backlink[] {
    return this.backlinks.get(target) || [];
  }

  /**
   * Build the full-text search index from all parsed files.
   */
  buildSearchIndex(): void {
    this.searchEngine.clear();

    for (const [path, file] of this.files) {
      const title =
        typeof file.frontmatter.title === 'string'
          ? file.frontmatter.title
          : undefined;
      this.searchEngine.addFile(path, file.content, title);
    }
  }

  /**
   * Search content with case-insensitive matching using flexsearch.
   * Returns results with highlights and snippets.
   */
  search(query: string, options?: { limit?: number }): SearchResult[] {
    const results = this.searchEngine.search(query, {
      limit: options?.limit ?? 50,
    });

    return results.map(r => ({
      file: r.file,
      score: r.score,
      matches: r.highlights.map(h => ({
        text: h.term,
        snippet: h.snippet,
      })),
    }));
  }

  /**
   * Convert parsed nodes and edges into vis-network compatible format.
   */
  getGraphData(): GraphData {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeIds = new Set<string>();

    for (const [path, file] of this.files) {
      const id = path;
      if (!nodeIds.has(id)) {
        nodes.push({
          id,
          label: (typeof file.frontmatter.title === 'string' ? file.frontmatter.title : undefined) || path.split('/').pop() || path,
          file: path,
          type: 'file',
        });
        nodeIds.add(id);
      }

      for (const heading of file.headings) {
        const headingId = `${path}#${heading.text}`;
        if (!nodeIds.has(headingId)) {
          nodes.push({
            id: headingId,
            label: heading.text,
            file: path,
            type: 'heading',
          });
          nodeIds.add(headingId);
          edges.push({ from: id, to: headingId });
        }
      }

      for (const link of file.wikiLinks) {
        const targetId = link.anchor ? `${link.target}#${link.anchor}` : link.target;
        if (!nodeIds.has(targetId)) {
          nodes.push({
            id: targetId,
            label: link.target,
            file: link.target,
            type: 'file',
          });
          nodeIds.add(targetId);
        }
        edges.push({ from: id, to: targetId, label: link.anchor });
      }
    }

    return { nodes, edges };
  }

  /**
   * Create or read a daily note for a given date.
   */
  createDailyNote(date: string, options: DailyNoteOptions = {}): DailyNote {
    const folder = options.folder || 'daily-notes';
    const template = options.template || '';
    const path = `${folder}/${date}.md`;

    if (this.files.has(path)) {
      const existing = this.files.get(path)!;
      return { path, content: existing.content, date };
    }

    const content = template
      ? template.replace('{{date}}', date)
      : `---\ntitle: ${date}\n---\n\n# ${date}\n`;

    return { path, content, date };
  }
}
