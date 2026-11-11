/**
 * @module @sentryvault/core
 * Core knowledge graph engine for SentryVault.
 */

export interface Frontmatter {
  [key: string]: unknown;
}

export interface Heading {
  level: number;
  text: string;
  line: number;
}

export interface WikiLink {
  target: string;
  line: number;
  anchor?: string;
}

export interface ParsedFile {
  path: string;
  content: string;
  frontmatter: Frontmatter;
  headings: Heading[];
  wikiLinks: WikiLink[];
}

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

/**
 * Parse a simple YAML value string into a JS value.
 * Handles scalars, inline arrays [a, b], inline objects {a: b}, booleans, numbers.
 */
function parseYamlValue(value: string): unknown {
  value = value.trim();

  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);

  // Inline array [a, b, c]
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map(s => parseYamlValue(s.trim()));
  }

  // Inline object {a: b, c: d}
  if (value.startsWith('{') && value.endsWith('}')) {
    const inner = value.slice(1, -1).trim();
    if (inner === '') return {};
    const obj: Record<string, unknown> = {};
    for (const pair of inner.split(',')) {
      const [k, ...v] = pair.split(':');
      if (k !== undefined) {
        obj[k.trim()] = parseYamlValue(v.join(':').trim());
      }
    }
    return obj;
  }

  // Quoted string
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

export class KnowledgeGraph {
  private files: Map<string, ParsedFile> = new Map();
  private backlinks: Map<string, Backlink[]> = new Map();
  private searchIndex: Map<string, Map<string, number>> = new Map();

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
        const parsed = this.parseMarkdown(fullPath, content);
        files.push(parsed);
        this.files.set(parsed.path, parsed);
      }
    }

    this.buildBacklinkIndex();
    this.buildSearchIndex();

    return files;
  }

  /**
   * Parse a markdown file into structured data.
   * Does NOT add to internal file map — use addFile() for that.
   */
  parseMarkdown(filePath: string, content: string): ParsedFile {
    const frontmatter: Frontmatter = {};
    let body = content;

    // Extract YAML frontmatter
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
    const fmMatch = content.match(frontmatterRegex);
    if (fmMatch) {
      body = content.slice(fmMatch[0].length);
      const fmLines = fmMatch[1].split('\n');
      for (const line of fmLines) {
        const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
        if (kvMatch) {
          frontmatter[kvMatch[1]] = parseYamlValue(kvMatch[2]);
        }
      }
    }

    // Extract headings
    const headings: Heading[] = [];
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    let headingMatch: RegExpExecArray | null;
    let lineNum = 0;
    for (const line of content.split('\n')) {
      lineNum++;
      headingMatch = headingRegex.exec(line);
      if (headingMatch) {
        headings.push({
          level: headingMatch[1].length,
          text: headingMatch[2].trim(),
          line: lineNum,
        });
      }
    }

    // Extract wiki links [[target]] and [[target#anchor]]
    const wikiLinks: WikiLink[] = [];
    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    let wikiMatch: RegExpExecArray | null;
    let lineNum2 = 0;
    for (const line of content.split('\n')) {
      lineNum2++;
      wikiLinkRegex.lastIndex = 0;
      while ((wikiMatch = wikiLinkRegex.exec(line)) !== null) {
        const target = wikiMatch[1];
        const hashIdx = target.indexOf('#');
        if (hashIdx !== -1) {
          wikiLinks.push({
            target: target.slice(0, hashIdx),
            line: lineNum2,
            anchor: target.slice(hashIdx + 1),
          });
        } else {
          wikiLinks.push({
            target: target,
            line: lineNum2,
          });
        }
      }
    }

    return {
      path: filePath,
      content,
      frontmatter,
      headings,
      wikiLinks,
    };
  }

  /**
   * Add a parsed file to the internal index.
   */
  addFile(parsed: ParsedFile): void {
    this.files.set(parsed.path, parsed);
  }

  /**
   * Build an index mapping targets to source files that link to them.
   */
  buildBacklinkIndex(): void {
    this.backlinks.clear();

    for (const [path, file] of this.files) {
      for (const link of file.wikiLinks) {
        const targetKey = link.target;
        if (!this.backlinks.has(targetKey)) {
          this.backlinks.set(targetKey, []);
        }
        this.backlinks.get(targetKey)!.push({
          source: path,
          sourceHeading: undefined,
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
   * Build a full-text search index over all file contents.
   */
  buildSearchIndex(): void {
    this.searchIndex.clear();

    for (const [path, file] of this.files) {
      const words = file.content.toLowerCase().split(/\s+/);
      const wordSet = new Set(words);
      for (const word of wordSet) {
        if (word.length > 1) {
          if (!this.searchIndex.has(word)) {
            this.searchIndex.set(word, new Map());
          }
          const fileMap = this.searchIndex.get(word)!;
          fileMap.set(path, (fileMap.get(path) || 0) + 1);
        }
      }
    }
  }

  /**
   * Search content with case-insensitive matching.
   */
  search(query: string): SearchResult[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const results = new Map<string, { score: number; matches: { text: string; snippet: string }[] }>();

    for (const term of terms) {
      const fileScores = this.searchIndex.get(term);
      if (fileScores) {
        for (const [path, count] of fileScores) {
          if (!results.has(path)) {
            results.set(path, { score: 0, matches: [] });
          }
          const result = results.get(path)!;
          result.score += count;
          // Extract a snippet around the term
          const file = this.files.get(path);
          if (file) {
            const lines = file.content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              const idx = lines[i].toLowerCase().indexOf(term);
              if (idx !== -1) {
                const start = Math.max(0, idx - 40);
                const end = Math.min(lines[i].length, idx + term.length + 40);
                let snippet = lines[i].slice(start, end);
                if (start > 0) snippet = '...' + snippet;
                if (end < lines[i].length) snippet = snippet + '...';
                result.matches.push({ text: term, snippet });
                break;
              }
            }
          }
        }
      }
    }

    return Array.from(results.entries())
      .map(([file, data]) => ({ file, ...data }))
      .sort((a, b) => b.score - a.score);
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
