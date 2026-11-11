import { describe, it, expect } from 'vitest';
import { SearchEngine } from './search';

describe('SearchEngine', () => {
  it('should index a file and find it', () => {
    const engine = new SearchEngine();
    engine.addFile('note.md', 'Hello world, this is a test note.');
    const results = engine.search('test');
    expect(results).toHaveLength(1);
    expect(results[0].file).toBe('note.md');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('should be case-insensitive', () => {
    const engine = new SearchEngine();
    engine.addFile('note.md', 'Hello WORLD, this is a TEST note.');
    const resultsLower = engine.search('test');
    const resultsUpper = engine.search('TEST');
    const resultsMixed = engine.search('TeSt');
    expect(resultsLower).toHaveLength(1);
    expect(resultsUpper).toHaveLength(1);
    expect(resultsMixed).toHaveLength(1);
  });

  it('should return empty results for unknown term', () => {
    const engine = new SearchEngine();
    engine.addFile('note.md', 'Hello world.');
    const results = engine.search('zzzznonexistent');
    expect(results).toHaveLength(0);
  });

  it('should return empty results for empty query', () => {
    const engine = new SearchEngine();
    engine.addFile('note.md', 'Hello world.');
    expect(engine.search('')).toHaveLength(0);
    expect(engine.search('   ')).toHaveLength(0);
  });

  it('should support multi-term queries (AND logic)', () => {
    const engine = new SearchEngine();
    engine.addFile('note1.md', 'Hello world test');
    engine.addFile('note2.md', 'Hello world universe');
    engine.addFile('note3.md', 'Goodbye world');

    // "hello world" should match note1 and note2 but not note3
    const results = engine.search('hello world');
    expect(results).toHaveLength(2);
    const files = results.map(r => r.file);
    expect(files).toContain('note1.md');
    expect(files).toContain('note2.md');
  });

  it('should return highlights with snippets', () => {
    const engine = new SearchEngine();
    engine.addFile(
      'note.md',
      'This is a long line with the word test in it somewhere in the middle of the content.',
    );
    const results = engine.search('test');
    expect(results).toHaveLength(1);
    expect(results[0].highlights).toHaveLength(1);
    expect(results[0].highlights[0].term).toBe('test');
    expect(results[0].highlights[0].snippet).toContain('test');
    expect(results[0].highlights[0].line).toBe(1);
  });

  it('should extract multiple highlights from different lines', () => {
    const engine = new SearchEngine();
    engine.addFile(
      'note.md',
      `Line one with search term here.
Line two with no match.
Line three has search term again.
Line four has search term once more.`,
    );
    const results = engine.search('search');
    expect(results).toHaveLength(1);
    // Should have up to 3 highlights (maxHighlights = 3)
    expect(results[0].highlights.length).toBeLessThanOrEqual(3);
    expect(results[0].highlights.length).toBeGreaterThanOrEqual(1);
    for (const h of results[0].highlights) {
      expect(h.term).toBe('search');
      expect(h.snippet).toContain('search');
    }
  });

  it('should extract highlights from multiple terms', () => {
    const engine = new SearchEngine();
    engine.addFile(
      'note.md',
      'The quick brown fox jumps over the lazy dog.',
    );
    const results = engine.search('quick fox');
    expect(results).toHaveLength(1);
    const terms = results[0].highlights.map(h => h.term);
    expect(terms).toContain('quick');
    expect(terms).toContain('fox');
  });

  it('should boost score for title matches', () => {
    const engine = new SearchEngine();
    engine.addFile('note1.md', 'Some content about test.', 'Test Note');
    engine.addFile('note2.md', 'Some content about test.', 'Other Note');

    const results = engine.search('test');
    expect(results).toHaveLength(2);
    // note1.md should score higher because its title matches
    expect(results[0].file).toBe('note1.md');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('should rank results by score (more matches = higher score)', () => {
    const engine = new SearchEngine();
    engine.addFile('note1.md', 'test test test test test');
    engine.addFile('note2.md', 'test test');
    engine.addFile('note3.md', 'test');

    const results = engine.search('test');
    expect(results).toHaveLength(3);
    expect(results[0].file).toBe('note1.md');
    expect(results[1].file).toBe('note2.md');
    expect(results[2].file).toBe('note3.md');
  });

  it('should respect the limit option', () => {
    const engine = new SearchEngine();
    for (let i = 0; i < 10; i++) {
      engine.addFile(`note${i}.md`, `This is note number ${i} about test.`);
    }
    const results = engine.search('test', { limit: 3 });
    expect(results).toHaveLength(3);
  });

  it('should filter by minScore', () => {
    const engine = new SearchEngine();
    engine.addFile('note1.md', 'test test test');
    engine.addFile('note2.md', 'test');
    engine.addFile('note3.md', 'test test');

    const results = engine.search('test', { minScore: 3 });
    // Only note1.md has score >= 3 (3 occurrences)
    expect(results).toHaveLength(1);
    expect(results[0].file).toBe('note1.md');
  });

  it('should handle single-character terms by filtering them out', () => {
    const engine = new SearchEngine();
    engine.addFile('note.md', 'a b c d e f g h i j k l m n o p q r s t u v w x y z');
    // Single char terms are filtered, so no results
    const results = engine.search('a');
    expect(results).toHaveLength(0);
  });

  it('should handle special characters in content', () => {
    const engine = new SearchEngine();
    engine.addFile(
      'note.md',
      'Hello! How are you? I\'m fine. #tag [link](url) `code`',
    );
    const results = engine.search('hello');
    expect(results).toHaveLength(1);
  });

  it('should handle unicode content', () => {
    const engine = new SearchEngine();
    engine.addFile('note.md', '日本語のコンテンツです。Hello 世界。');
    const results = engine.search('hello');
    expect(results).toHaveLength(1);
  });

  it('should handle empty content', () => {
    const engine = new SearchEngine();
    engine.addFile('empty.md', '');
    const results = engine.search('anything');
    expect(results).toHaveLength(0);
  });

  it('should handle files with only frontmatter', () => {
    const engine = new SearchEngine();
    engine.addFile(
      'note.md',
      '---\ntitle: My Note\n---\n\nSome body content with test keyword.',
      'My Note',
    );
    const results = engine.search('test');
    expect(results).toHaveLength(1);
    expect(results[0].file).toBe('note.md');
  });

  it('should remove a file from the index', () => {
    const engine = new SearchEngine();
    engine.addFile('note.md', 'Hello world test.');
    expect(engine.search('test')).toHaveLength(1);

    engine.removeFile('note.md');
    expect(engine.search('test')).toHaveLength(0);
  });

  it('should clear all files', () => {
    const engine = new SearchEngine();
    engine.addFile('note1.md', 'Hello world.');
    engine.addFile('note2.md', 'Goodbye world.');
    engine.clear();
    expect(engine.search('world')).toHaveLength(0);
    expect(engine.fileCount).toBe(0);
  });

  it('should track file count correctly', () => {
    const engine = new SearchEngine();
    expect(engine.fileCount).toBe(0);
    engine.addFile('note1.md', 'Hello.');
    expect(engine.fileCount).toBe(1);
    engine.addFile('note2.md', 'World.');
    expect(engine.fileCount).toBe(2);
    engine.removeFile('note1.md');
    expect(engine.fileCount).toBe(1);
  });

  it('should handle multi-line content with correct line numbers', () => {
    const engine = new SearchEngine();
    engine.addFile(
      'note.md',
      `Line 1: no match here.
Line 2: no match here.
Line 3: this has the keyword.
Line 4: no match here.
Line 5: another keyword occurrence.`,
    );
    const results = engine.search('keyword');
    expect(results).toHaveLength(1);
    const lines = results[0].highlights.map(h => h.line);
    expect(lines).toContain(3);
    expect(lines).toContain(5);
  });

  it('should handle long lines with proper snippet padding', () => {
    const engine = new SearchEngine();
    const longLine = 'A'.repeat(200) + ' test ' + 'B'.repeat(200);
    engine.addFile('note.md', longLine);
    const results = engine.search('test');
    expect(results).toHaveLength(1);
    expect(results[0].highlights).toHaveLength(1);
    // Snippet should contain 'test' and be truncated with ellipsis
    const snippet = results[0].highlights[0].snippet;
    expect(snippet).toContain('test');
    expect(snippet.length).toBeLessThan(longLine.length);
  });

  it('should handle query with only stop-word-like single chars', () => {
    const engine = new SearchEngine();
    engine.addFile('note.md', 'a b c d e f g h i j k l m n o p q r s t u v w x y z');
    const results = engine.search('a b c');
    expect(results).toHaveLength(0);
  });

  it('should handle file with no body content but title', () => {
    const engine = new SearchEngine();
    engine.addFile('note.md', '', 'Test Title');
    const results = engine.search('test');
    // Title match should still work
    expect(results).toHaveLength(1);
    expect(results[0].file).toBe('note.md');
  });

  it('should handle duplicate file additions', () => {
    const engine = new SearchEngine();
    engine.addFile('note.md', 'Hello world test.');
    engine.addFile('note.md', 'Hello world test. Updated content.');
    const results = engine.search('test');
    expect(results).toHaveLength(1);
    // Score should reflect the updated content
    expect(results[0].score).toBeGreaterThan(0);
  });
});
