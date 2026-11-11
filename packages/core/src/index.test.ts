import { describe, it, expect } from 'vitest';
import { KnowledgeGraph, parseMarkdown, extractFrontmatter, extractHeadings, extractWikiLinks, parseYamlValue } from './index';

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
    const result = parseMarkdown('test.md', content);
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
    const result = parseMarkdown('test.md', content);
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
    const result = parseMarkdown('test.md', content);
    expect(result.frontmatter.published).toBe(true);
    expect(result.frontmatter.count).toBe(42);
    expect(result.frontmatter.disabled).toBe(false);
  });

  it('should extract wiki links', () => {
    const graph = new KnowledgeGraph();
    const content = `# Test

See [[Other Note]] and [[Another#section]].
`;
    const result = parseMarkdown('test.md', content);
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
    const fileA = parseMarkdown('Note A.md', contentA);
    const fileB = parseMarkdown('Note B.md', contentB);
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
    const parsed = parseMarkdown('test.md', content);
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
    graph.addFile(parseMarkdown('hello.md', content));
    graph.buildSearchIndex();

    const results = graph.search('zzzznonexistent');
    expect(results).toHaveLength(0);
  });

  it('should generate graph data', () => {
    const graph = new KnowledgeGraph();
    const content = `# Note

See [[Other]].
`;
    const parsed = parseMarkdown('Note.md', content);
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
    const result = parseMarkdown('plain.md', content);
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
    const result = parseMarkdown('multi.md', content);
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
    const result = parseMarkdown('test.md', content);
    expect(result.wikiLinks).toHaveLength(3);
    expect(result.wikiLinks[0].target).toBe('A');
    expect(result.wikiLinks[1].target).toBe('B');
    expect(result.wikiLinks[2].target).toBe('C');
    expect(result.wikiLinks[2].anchor).toBe('section');
  });
});

describe('Parser module', () => {
  describe('parseYamlValue', () => {
    it('should parse booleans', () => {
      expect(parseYamlValue('true')).toBe(true);
      expect(parseYamlValue('false')).toBe(false);
    });

    it('should parse numbers', () => {
      expect(parseYamlValue('42')).toBe(42);
      expect(parseYamlValue('-3.14')).toBe(-3.14);
    });

    it('should parse null', () => {
      expect(parseYamlValue('null')).toBeNull();
    });

    it('should parse inline arrays', () => {
      expect(parseYamlValue('[a, b, c]')).toEqual(['a', 'b', 'c']);
      expect(parseYamlValue('[]')).toEqual([]);
    });

    it('should parse inline objects', () => {
      expect(parseYamlValue('{a: 1, b: 2}')).toEqual({ a: 1, b: 2 });
      expect(parseYamlValue('{}')).toEqual({});
    });

    it('should parse quoted strings', () => {
      expect(parseYamlValue('"hello"')).toBe('hello');
      expect(parseYamlValue("'world'")).toBe('world');
    });

    it('should return raw string for unquoted values', () => {
      expect(parseYamlValue('hello')).toBe('hello');
      expect(parseYamlValue('some-value')).toBe('some-value');
    });
  });

  describe('extractFrontmatter', () => {
    it('should extract frontmatter from markdown', () => {
      const content = `---
title: Test
tags: [a, b]
---

Body content here.
`;
      const { frontmatter, body } = extractFrontmatter(content);
      expect(frontmatter.title).toBe('Test');
      expect(frontmatter.tags).toEqual(['a', 'b']);
      expect(body).toContain('Body content here.');
    });

    it('should return empty frontmatter when no frontmatter exists', () => {
      const content = `# No frontmatter

Just content.
`;
      const { frontmatter, body } = extractFrontmatter(content);
      expect(Object.keys(frontmatter)).toHaveLength(0);
      expect(body).toBe(content);
    });
  });

  describe('extractHeadings', () => {
    it('should extract all heading levels', () => {
      const content = `# H1
## H2
### H3
#### H4
##### H5
###### H6
`;
      const headings = extractHeadings(content);
      expect(headings).toHaveLength(6);
      for (let i = 0; i < 6; i++) {
        expect(headings[i].level).toBe(i + 1);
      }
    });

    it('should return empty array for content without headings', () => {
      const content = `No headings here.
Just plain text.
`;
      const headings = extractHeadings(content);
      expect(headings).toHaveLength(0);
    });

    it('should track line numbers correctly', () => {
      const content = `# First

## Second

### Third
`;
      const headings = extractHeadings(content);
      expect(headings[0].line).toBe(1);
      expect(headings[1].line).toBe(3);
      expect(headings[2].line).toBe(5);
    });
  });

  describe('extractWikiLinks', () => {
    it('should extract simple wiki links', () => {
      const content = `See [[Target]] for more.
`;
      const links = extractWikiLinks(content);
      expect(links).toHaveLength(1);
      expect(links[0].target).toBe('Target');
      expect(links[0].anchor).toBeUndefined();
    });

    it('should extract wiki links with anchors', () => {
      const content = `See [[Target#section]] for more.
`;
      const links = extractWikiLinks(content);
      expect(links).toHaveLength(1);
      expect(links[0].target).toBe('Target');
      expect(links[0].anchor).toBe('section');
    });

    it('should extract multiple wiki links', () => {
      const content = `[[A]] [[B]] [[C]]
`;
      const links = extractWikiLinks(content);
      expect(links).toHaveLength(3);
      expect(links[0].target).toBe('A');
      expect(links[1].target).toBe('B');
      expect(links[2].target).toBe('C');
    });

    it('should return empty array for content without wiki links', () => {
      const content = `No wiki links here.
`;
      const links = extractWikiLinks(content);
      expect(links).toHaveLength(0);
    });
  });

  describe('parseMarkdown', () => {
    it('should parse a complete markdown file', () => {
      const content = `---
title: Complete Test
tags: [parser, test]
---

# Main Heading

Some text with [[Link]] and [[Other#anchor]].

## Sub Heading
`;
      const result = parseMarkdown('complete.md', content);
      expect(result.path).toBe('complete.md');
      expect(result.content).toBe(content);
      expect(result.frontmatter.title).toBe('Complete Test');
      expect(result.frontmatter.tags).toEqual(['parser', 'test']);
      expect(result.headings).toHaveLength(2);
      expect(result.wikiLinks).toHaveLength(2);
    });

    it('should handle empty content', () => {
      const result = parseMarkdown('empty.md', '');
      expect(result.path).toBe('empty.md');
      expect(result.content).toBe('');
      expect(result.frontmatter).toEqual({});
      expect(result.headings).toHaveLength(0);
      expect(result.wikiLinks).toHaveLength(0);
    });

    it('should not modify the source content', () => {
      const content = `# Test

Some content.
`;
      const result = parseMarkdown('test.md', content);
      expect(result.content).toBe(content);
    });
  });
});
