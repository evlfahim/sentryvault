/**
 * @module @sentryvault/core/search
 * Full-text search using flexsearch with case-insensitive matching
 * and highlight extraction.
 */

import FlexSearch from 'flexsearch';
import type { SearchOptions, SearchHighlight, SearchResult } from './types.js';

const { Index } = FlexSearch as any;

/**
 * Full-text search engine backed by flexsearch.
 * Provides case-insensitive matching, multi-term queries,
 * and highlight extraction with context snippets.
 */
export class SearchEngine {
  private index: Index;
  private fileContents: Map<string, string>;
  private fileTitles: Map<string, string>;

  constructor() {
    this.index = new Index({
      tokenize: 'strict',
    });
    this.fileContents = new Map();
    this.fileTitles = new Map();
  }

  /**
   * Add a file to the search index.
   * @param filePath - Unique identifier for the file.
   * @param content - Raw markdown content.
   * @param title - Optional display title (from frontmatter or filename).
   */
  addFile(filePath: string, content: string, title?: string): void {
    this.fileContents.set(filePath, content);
    if (title) {
      this.fileTitles.set(filePath, title);
    }
    // Index title + content together so title matches are searchable
    const searchableContent = title ? `${title}\n${content}` : content;
    this.index.add(filePath, searchableContent);
  }

  /**
   * Remove a file from the search index.
   * @param filePath - The file path to remove.
   */
  removeFile(filePath: string): void {
    this.fileContents.delete(filePath);
    this.fileTitles.delete(filePath);
    this.index.remove(filePath);
  }

  /**
   * Search across all indexed files.
   * Supports multi-term queries (AND logic), case-insensitive matching,
   * and returns highlights with context snippets.
   *
   * @param query - Search query string.
   * @param options - Optional search parameters.
   * @returns Sorted list of search results with highlights.
   */
  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const {
      limit = 50,
      minScore = 0,
      snippetPadding = 60,
    } = options;

    if (!query || !query.trim()) {
      return [];
    }

    const trimmedQuery = query.trim();
    // Split into terms and filter out single-character terms
    const terms = trimmedQuery
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 1);

    if (terms.length === 0) {
      return [];
    }

    // Search using flexsearch
    const matchedFiles = this.index.search(trimmedQuery);

    if (matchedFiles.length === 0) {
      return [];
    }

    // Build a map of file -> { score, highlights }
    const resultMap = new Map<
      string,
      { score: number; highlights: SearchHighlight[] }
    >();

    for (const filePath of matchedFiles) {
      const fileKey = String(filePath);
      const content = this.fileContents.get(fileKey) ?? '';

      const fileHighlights: SearchHighlight[] = [];
      let fileScore = 0;

      // Score based on term frequency in the file
      for (const term of terms) {
        const count = this.countTermInContent(content, term);
        if (count > 0) {
          fileScore += count;
        }
      }

      // Also boost score if the title matches
      const title = this.fileTitles.get(String(filePath));
      if (title) {
        for (const term of terms) {
          if (title.toLowerCase().includes(term)) {
            fileScore += 5; // Title match bonus
          }
        }
      }

      // Extract highlights for each term
      for (const term of terms) {
        const highlights = this.extractHighlights(
          content,
          term,
          snippetPadding,
        );
        fileHighlights.push(...highlights);
      }

      resultMap.set(String(filePath), { score: fileScore, highlights: fileHighlights });
    }

    // Convert to array, filter by minScore, sort by score descending
    const allResults = Array.from(resultMap.entries())
      .map(([file, data]) => ({
        file,
        score: data.score,
        highlights: data.highlights,
      }))
      .filter(r => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return allResults;
  }

  /**
   * Count occurrences of a term (case-insensitive) in content.
   */
  private countTermInContent(content: string, term: string): number {
    const lowerContent = content.toLowerCase();
    const lowerTerm = term.toLowerCase();
    let count = 0;
    let index = 0;
    while ((index = lowerContent.indexOf(lowerTerm, index)) !== -1) {
      count++;
      index += lowerTerm.length;
    }
    return count;
  }

  /**
   * Extract highlight snippets for a term in the content.
   * Returns up to 3 snippets with context padding.
   */
  private extractHighlights(
    content: string,
    term: string,
    padding: number,
  ): SearchHighlight[] {
    const highlights: SearchHighlight[] = [];
    const lines = content.split('\n');
    const lowerTerm = term.toLowerCase();
    let foundCount = 0;
    const maxHighlights = 3;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      if (foundCount >= maxHighlights) break;

      const line = lines[lineNum];
      const lowerLine = line.toLowerCase();
      let idx = 0;

      while (
        (idx = lowerLine.indexOf(lowerTerm, idx)) !== -1 &&
        foundCount < maxHighlights
      ) {
        const start = Math.max(0, idx - padding);
        const end = Math.min(line.length, idx + lowerTerm.length + padding);
        let snippet = line.slice(start, end);

        // Add ellipsis for truncated snippets
        if (start > 0) snippet = '…' + snippet;
        if (end < line.length) snippet = snippet + '…';

        highlights.push({
          term,
          snippet,
          line: lineNum + 1, // 1-based line number
        });

        foundCount++;
        idx += lowerTerm.length;
      }
    }

    return highlights;
  }

  /**
   * Get the total number of indexed files.
   */
  get fileCount(): number {
    return this.fileContents.size;
  }

  /**
   * Clear all indexed files.
   */
  clear(): void {
    this.index = new Index({
      tokenize: 'strict',
    });
    this.fileContents.clear();
    this.fileTitles.clear();
  }
}
