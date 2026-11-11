/**
 * @module @sentryvault/core/parser
 * Markdown file parser — reads .md files, extracts frontmatter,
 * headings, and [[wiki links]] without modifying the source files.
 */

import type { Frontmatter, Heading, WikiLink, ParsedFile } from './types.js';

/**
 * Parse a simple YAML value string into a JS value.
 * Handles scalars, inline arrays [a, b], inline objects {a: b}, booleans, numbers.
 *
 * @param value - The YAML value string to parse.
 * @returns The parsed JavaScript value.
 */
export function parseYamlValue(value: string): unknown {
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

/**
 * Extract YAML frontmatter from markdown content.
 * Returns { frontmatter, body } where body is the content after the closing ---.
 *
 * @param content - The raw markdown content.
 * @returns Object with frontmatter map and body string.
 */
export function extractFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const frontmatter: Frontmatter = {};
  let body = content;

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

  return { frontmatter, body };
}

/**
 * Extract all headings (## H2, ### H3, etc.) from markdown content.
 * Returns an array of { level, text, line } objects.
 *
 * @param content - The markdown content (body after frontmatter).
 * @returns Array of heading objects.
 */
export function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/m;
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

  return headings;
}

/**
 * Extract all wiki links [[target]] and [[target#anchor]] from markdown content.
 * Returns an array of { target, line, anchor? } objects.
 *
 * @param content - The markdown content (body after frontmatter).
 * @returns Array of wiki link objects.
 */
export function extractWikiLinks(content: string): WikiLink[] {
  const wikiLinks: WikiLink[] = [];
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  let wikiMatch: RegExpExecArray | null;
  let lineNum = 0;

  for (const line of content.split('\n')) {
    lineNum++;
    wikiLinkRegex.lastIndex = 0;
    while ((wikiMatch = wikiLinkRegex.exec(line)) !== null) {
      const target = wikiMatch[1];
      const hashIdx = target.indexOf('#');
      if (hashIdx !== -1) {
        wikiLinks.push({
          target: target.slice(0, hashIdx),
          line: lineNum,
          anchor: target.slice(hashIdx + 1),
        });
      } else {
        wikiLinks.push({
          target: target,
          line: lineNum,
        });
      }
    }
  }

  return wikiLinks;
}

/**
 * Parse a markdown file into structured data.
 * Does NOT modify the source file — reads content and extracts metadata only.
 *
 * @param filePath - The file path (used for identification, not read).
 * @param content - The raw markdown content as a string.
 * @returns A ParsedFile object with frontmatter, headings, and wiki links.
 */
export function parseMarkdown(filePath: string, content: string): ParsedFile {
  const { frontmatter, body } = extractFrontmatter(content);
  const headings = extractHeadings(body);
  const wikiLinks = extractWikiLinks(body);

  return {
    path: filePath,
    content,
    frontmatter,
    headings,
    wikiLinks,
  };
}
