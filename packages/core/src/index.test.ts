import { describe, it, expect } from 'vitest';
import { KnowledgeGraph } from './index';

describe('KnowledgeGraph', () => {
  it('should parse markdown with frontmatter', () => {
    const graph = new KnowledgeGraph();
    const content = `---
title: Test Note
tags: [test, example]
---

# Hello World

This is a test note.
`;
    const result = graph.parseMarkdown('test.md', content);
    expect(result.frontmatter.title).toBe('Test Note');
    expect(result.frontmatter.tags).toEqual(['test', 'example']);
    expect(result.headings).toHaveLength(1);
    expect(result.headings[0].text).toBe('Hello World');
  });

  it('should parse frontmatter with inline objects', () => {
    const graph = new KnowledgeGraph();
    const content = `---
meta: {author: John, year: 2024}
---

# Test
`;
    const result = graph.parseMarkdown('test.md', content);
    expect(result.frontmatter.meta).toEqual({ author: 'John', year: 2024 });
  });

  it('should parse frontmatter with booleans and numbers', () => {
    const graph = new KnowledgeGraph();
    const content = `---
published: true
count: 42
disabled: false
---

# Test
`;
    const result = graph.parseMarkdown('test.md', content);
    expect(result.frontmatter.published).toBe(true);
    expect(result.frontmatter.count).toBe(42);
    expect(result.frontmatter.disabled).toBe(false);
  });

  it('should extract wiki links', () => {
    const graph = new KnowledgeGraph();
    const content = `# Test

See [[Other Note]] and [[Another#section]].
`;
    const result = graph.parseMarkdown('test.md', content);
    expect(result.wikiLinks).toHaveLength(2);
    expect(result.wikiLinks[0].target).toBe('Other Note');
    expect(result.wikiLinks[1].target).toBe('Another');
    expect(result.wikiLinks[1].anchor).toBe('section');
  });

  it('should build backlink index', () => {
    const graph = new KnowledgeGraph();
    const contentA = `# Note A

See [[Note B]].
`;
    const contentB = `# Note B

Back to [[Note A]].
`;
    const fileA = graph.parseMarkdown('Note A.md', contentA);
    const fileB = graph.parseMarkdown('Note B.md', contentB);
    graph.addFile(fileA);
    graph.addFile(fileB);
    graph.buildBacklinkIndex();

    const backlinksA = graph.getBacklinks('Note A');
    expect(backlinksA).toHaveLength(1);
    expect(backlinksA[0].source).toBe('Note B.md');

    const backlinksB = graph.getBacklinks('Note B');
    expect(backlinksB).toHaveLength(1);
    expect(backlinksB[0].source).toBe('Note A.md');
  });

  it('should return empty backlinks for unknown target', () => {
    const graph = new KnowledgeGraph();
    const backlinks = graph.getBacklinks('Nonexistent');
    expect(backlinks).toEqual([]);
  });

  it('should search content', () => {
    const graph = new KnowledgeGraph();
    const content = `# Test Note

This is a test note about search.
`;
    const parsed = graph.parseMarkdown('test.md', content);
    graph.addFile(parsed);
    graph.buildSearchIndex();

    const results = graph.search('test');
    expect(results).toHaveLength(1);
    expect(results[0].file).toBe('test.md');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('should return empty results for unknown term', () => {
    const graph = new KnowledgeGraph();
    const content = `# Hello World

Nothing here.
`;
    graph.addFile(graph.parseMarkdown('hello.md', content));
    graph.buildSearchIndex();

    const results = graph.search('zzzznonexistent');
    expect(results).toHaveLength(0);
  });

  it('should generate graph data', () => {
    const graph = new KnowledgeGraph();
    const content = `# Note

See [[Other]].
`;
    const parsed = graph.parseMarkdown('Note.md', content);
    graph.addFile(parsed);
    const graphData = graph.getGraphData();
    // Note.md file, "Note" heading, "Other" file = 3 nodes
    // Note.md -> Note heading, Note.md -> Other = 2 edges
    expect(graphData.nodes).toHaveLength(3);
    expect(graphData.edges).toHaveLength(2);
  });

  it('should create daily notes', () => {
    const graph = new KnowledgeGraph();
    const daily = graph.createDailyNote('2024-01-15');
    expect(daily.path).toBe('daily-notes/2024-01-15.md');
    expect(daily.date).toBe('2024-01-15');
    expect(daily.content).toContain('2024-01-15');
  });

  it('should create daily notes with custom template', () => {
    const graph = new KnowledgeGraph();
    const daily = graph.createDailyNote('2024-01-15', {
      template: '# {{date}}\n\n## Tasks\n- [ ] ',
    });
    expect(daily.content).toContain('# 2024-01-15');
    expect(daily.content).toContain('## Tasks');
  });

  it('should handle markdown without frontmatter', () => {
    const graph = new KnowledgeGraph();
    const content = `# No Frontmatter

Just plain markdown.
`;
    const result = graph.parseMarkdown('plain.md', content);
    expect(Object.keys(result.frontmatter).length).toBe(0);
    expect(result.headings).toHaveLength(1);
    expect(result.headings[0].text).toBe('No Frontmatter');
  });

  it('should handle multiple headings', () => {
    const graph = new KnowledgeGraph();
    const content = `# H1

## H2

### H3

Some text.
`;
    const result = graph.parseMarkdown('multi.md', content);
    expect(result.headings).toHaveLength(3);
    expect(result.headings[0].level).toBe(1);
    expect(result.headings[1].level).toBe(2);
    expect(result.headings[2].level).toBe(3);
  });

  it('should handle multiple wiki links on same line', () => {
    const graph = new KnowledgeGraph();
    const content = `# Test

[[A]] [[B]] [[C#section]]
`;
    const result = graph.parseMarkdown('test.md', content);
    expect(result.wikiLinks).toHaveLength(3);
    expect(result.wikiLinks[0].target).toBe('A');
    expect(result.wikiLinks[1].target).toBe('B');
    expect(result.wikiLinks[2].target).toBe('C');
    expect(result.wikiLinks[2].anchor).toBe('section');
  });
});
