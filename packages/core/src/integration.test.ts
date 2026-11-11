import { describe, it, expect, beforeAll } from 'vitest';
import { KnowledgeGraph } from './index.js';
import { parseMarkdown } from './parser.js';

describe('Integration: end-to-end workflow', () => {
  let kg: KnowledgeGraph;

  beforeAll(() => {
    kg = new KnowledgeGraph();
  });

  it('should scan files, search, get backlinks, and generate graph data', () => {
    // Simulate scanning a folder by adding parsed files directly
    const fileA = parseMarkdown('A.md', `---
title: Note A
---

# Note A

This is the content of note A.

See [[B]] for more details.

## Section 1

Content in section 1.

Check out [[C#anchor]] too.
`);

    const fileB = parseMarkdown('B.md', `---
title: Note B
---

# Note B

This is note B.

Back to [[A]].

## Details

More details here.
`);

    const fileC = parseMarkdown('C.md', `---
title: Note C
---

# Note C

This is note C.

## anchor

Anchor content.
`);

    kg.addFile(fileA);
    kg.addFile(fileB);
    kg.addFile(fileC);

    // Build indexes after adding files (mimics what scanFolder does)
    kg.buildBacklinkIndex();
    kg.buildSearchIndex();

    // 1. Verify files are indexed
    expect(kg['files'].size).toBe(3);

    // 2. Search for "note" — should find all 3 files
    const searchResults = kg.search('note');
    expect(searchResults.length).toBe(3);

    // Verify search results have correct structure
    for (const result of searchResults) {
      expect(result).toHaveProperty('file');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('matches');
      expect(Array.isArray(result.matches)).toBe(true);
      for (const match of result.matches) {
        expect(match).toHaveProperty('text');
        expect(match).toHaveProperty('snippet');
      }
    }

    // 3. Get backlinks for "B" — A.md links to B
    const backlinksB = kg.getBacklinks('B');
    expect(backlinksB.length).toBe(1);
    expect(backlinksB[0].source).toBe('A.md');
    expect(backlinksB[0].target).toBe('B');
    expect(backlinksB[0].sourceHeading).toBe('Note A');

    // 4. Get backlinks for "A" — B.md links to A
    const backlinksA = kg.getBacklinks('A');
    expect(backlinksA.length).toBe(1);
    expect(backlinksA[0].source).toBe('B.md');
    expect(backlinksA[0].target).toBe('A');

    // 5. Get backlinks for non-existent target
    const backlinksNone = kg.getBacklinks('NonExistent');
    expect(backlinksNone.length).toBe(0);

    // 6. Generate graph data
    const graphData = kg.getGraphData();
    expect(graphData.nodes.length).toBeGreaterThan(0);
    expect(graphData.edges.length).toBeGreaterThan(0);

    // Verify graph nodes include file nodes and heading nodes
    // File nodes: A.md, B.md, C.md + orphan nodes for wiki targets (A, B, C#anchor)
    const fileNodes = graphData.nodes.filter(n => n.type === 'file');
    const headingNodes = graphData.nodes.filter(n => n.type === 'heading');
    expect(fileNodes.length).toBe(6); // A.md, B.md, C.md, A, B, C#anchor
    expect(headingNodes.length).toBeGreaterThan(0);

    // Verify graph edges include wiki link edges
    const wikiEdges = graphData.edges.filter(e => e.label);
    expect(wikiEdges.length).toBeGreaterThan(0);

    // 7. Create a daily note
    const dailyNote = kg.createDailyNote('2024-03-15');
    expect(dailyNote.path).toBe('daily-notes/2024-03-15.md');
    expect(dailyNote.date).toBe('2024-03-15');
    expect(dailyNote.content).toContain('2024-03-15');
    expect(dailyNote.content).toContain('---');

    // 8. Create a daily note with a custom template
    const customTemplate = '# {{date}}\n\n## Tasks\n- [ ] ';
    const customDaily = kg.createDailyNote('2024-03-16', { template: customTemplate });
    expect(customDaily.content).toContain('# 2024-03-16');
    expect(customDaily.content).toContain('## Tasks');

    // 9. Re-scan should rebuild indexes
    kg.addFile(parseMarkdown('D.md', '# D\n\nSee [[A]].'));
    kg.buildBacklinkIndex();
    kg.buildSearchIndex();
    const backlinksAAfter = kg.getBacklinks('A');
    expect(backlinksAAfter.length).toBe(2); // B.md and D.md

    // 10. Search should find the new file too
    const searchD = kg.search('D');
    expect(searchD.some(r => r.file === 'D.md')).toBe(true);
  });

  it('should handle empty vault gracefully', () => {
    const emptyKg = new KnowledgeGraph();

    // Search on empty vault
    const results = emptyKg.search('anything');
    expect(results.length).toBe(0);

    // Backlinks on empty vault
    const backlinks = emptyKg.getBacklinks('something');
    expect(backlinks.length).toBe(0);

    // Graph on empty vault
    const graph = emptyKg.getGraphData();
    expect(graph.nodes.length).toBe(0);
    expect(graph.edges.length).toBe(0);

    // Daily note on empty vault
    const daily = emptyKg.createDailyNote('2024-01-01');
    expect(daily.path).toBe('daily-notes/2024-01-01.md');
    expect(daily.date).toBe('2024-01-01');
    expect(daily.content).toContain('2024-01-01');
  });

  it('should handle files with no frontmatter, no headings, no links', () => {
    const kg = new KnowledgeGraph();
    kg.addFile(parseMarkdown('plain.md', 'Just plain text with no structure.'));
    kg.buildBacklinkIndex();
    kg.buildSearchIndex();

    const results = kg.search('plain');
    expect(results.length).toBe(1);
    expect(results[0].file).toBe('plain.md');

    const graph = kg.getGraphData();
    expect(graph.nodes.length).toBe(1);
    expect(graph.edges.length).toBe(0);

    const backlinks = kg.getBacklinks('plain');
    expect(backlinks.length).toBe(0);
  });

  it('should handle deeply nested wiki links and headings', () => {
    const kg = new KnowledgeGraph();
    kg.addFile(parseMarkdown('deep.md', `# Level 1

## Level 2

### Level 3

#### Level 4

See [[other#deep anchor]].
`));
    kg.addFile(parseMarkdown('other.md', `# Other

## deep anchor

Content here.
`));
    kg.buildBacklinkIndex();
    kg.buildSearchIndex();

    const graph = kg.getGraphData();

    // deep.md file, 4 headings, other.md file, 2 headings, other#deep anchor orphan = 9 nodes
    expect(graph.nodes.length).toBe(9);

    // deep.md -> 4 headings, other.md -> 2 headings, deep.md -> other, deep.md -> other#deep anchor = 8 edges
    expect(graph.edges.length).toBe(8);

    const backlinks = kg.getBacklinks('other');
    expect(backlinks.length).toBe(1);
    expect(backlinks[0].source).toBe('deep.md');
    expect(backlinks[0].targetHeading).toBe('deep anchor');
  });

  it('should handle circular references in backlinks', () => {
    const kg = new KnowledgeGraph();
    kg.addFile(parseMarkdown('X.md', 'See [[Y]].'));
    kg.addFile(parseMarkdown('Y.md', 'See [[X]].'));
    kg.buildBacklinkIndex();

    const backlinksX = kg.getBacklinks('X');
    expect(backlinksX.length).toBe(1);
    expect(backlinksX[0].source).toBe('Y.md');

    const backlinksY = kg.getBacklinks('Y');
    expect(backlinksY.length).toBe(1);
    expect(backlinksY[0].source).toBe('X.md');
  });

  it('should handle multiple wiki links in a single file', () => {
    const kg = new KnowledgeGraph();
    kg.addFile(parseMarkdown('multi.md', `# Multi

See [[A]], [[B]], and [[C]].
`));
    kg.addFile(parseMarkdown('A.md', '# A'));
    kg.addFile(parseMarkdown('B.md', '# B'));
    kg.addFile(parseMarkdown('C.md', '# C'));
    kg.buildBacklinkIndex();

    const backlinksA = kg.getBacklinks('A');
    expect(backlinksA.length).toBe(1);
    expect(backlinksA[0].source).toBe('multi.md');

    const backlinksB = kg.getBacklinks('B');
    expect(backlinksB.length).toBe(1);
    expect(backlinksB[0].source).toBe('multi.md');

    const backlinksC = kg.getBacklinks('C');
    expect(backlinksC.length).toBe(1);
    expect(backlinksC[0].source).toBe('multi.md');
  });

  it('should handle wiki links with anchors correctly', () => {
    const kg = new KnowledgeGraph();
    kg.addFile(parseMarkdown('src.md', 'See [[target#heading]].'));
    kg.addFile(parseMarkdown('target.md', '# heading\n\nContent.'));
    kg.buildBacklinkIndex();

    const backlinks = kg.getBacklinks('target');
    expect(backlinks.length).toBe(1);
    expect(backlinks[0].targetHeading).toBe('heading');
    expect(backlinks[0].source).toBe('src.md');
  });

  it('should handle search with special characters', () => {
    const kg = new KnowledgeGraph();
    kg.addFile(parseMarkdown('special.md', 'Contains special chars: @#$%^&*()'));
    kg.buildSearchIndex();

    const results = kg.search('special');
    expect(results.length).toBe(1);
    expect(results[0].file).toBe('special.md');
  });

  it('should handle case-insensitive search', () => {
    const kg = new KnowledgeGraph();
    kg.addFile(parseMarkdown('case.md', 'Hello World'));
    kg.buildSearchIndex();

    const results1 = kg.search('hello');
    expect(results1.length).toBe(1);

    const results2 = kg.search('HELLO');
    expect(results2.length).toBe(1);

    const results3 = kg.search('Hello');
    expect(results3.length).toBe(1);
  });

  it('should handle daily notes with custom folder', () => {
    const kg = new KnowledgeGraph();
    const daily = kg.createDailyNote('2024-05-01', { folder: 'journal' });
    expect(daily.path).toBe('journal/2024-05-01.md');
  });
});
