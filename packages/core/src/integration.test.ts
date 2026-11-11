import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { KnowledgeGraph } from './index.js';
import { parseMarkdown } from './parser.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';

describe('Integration: end-to-end workflow', () => {
  let kg: KnowledgeGraph;
  let testDir: string;

  beforeEach(async () => {
    kg = new KnowledgeGraph();
    testDir = join(__dirname, '__test_vault_integration__');
    // Clean up any previous test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore if doesn't exist
    }
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    // Final cleanup
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
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
      expect(result).toHaveProperty('highlights');
      expect(Array.isArray(result.highlights)).toBe(true);
      for (const match of result.highlights) {
        expect(match).toHaveProperty('term');
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
    const searchD = kg.search('see');
    expect(searchD.some(r => r.file === 'D.md')).toBe(true);
  });

  it('should handle empty vault gracefully', () => {
    // Search on empty vault
    const results = kg.search('anything');
    expect(results.length).toBe(0);

    // Backlinks on empty vault
    const backlinks = kg.getBacklinks('something');
    expect(backlinks.length).toBe(0);

    // Graph on empty vault
    const graph = kg.getGraphData();
    expect(graph.nodes.length).toBe(0);
    expect(graph.edges.length).toBe(0);

    // Daily note on empty vault
    const daily = kg.createDailyNote('2024-01-01');
    expect(daily.path).toBe('daily-notes/2024-01-01.md');
    expect(daily.date).toBe('2024-01-01');
    expect(daily.content).toContain('2024-01-01');
  });

  it('should handle files with no frontmatter, no headings, no links', () => {
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

    // deep.md file, 4 headings, other.md file, 2 headings,
    // plus orphan node "other#deep anchor" created before other.md is processed = 9 nodes
    expect(graph.nodes.length).toBe(9);

    // deep.md -> 4 headings, other.md -> 2 headings, deep.md -> other#deep anchor (wiki) = 7 edges
    expect(graph.edges.length).toBe(7);

    const backlinks = kg.getBacklinks('other');
    expect(backlinks.length).toBe(1);
    expect(backlinks[0].source).toBe('deep.md');
    expect(backlinks[0].targetHeading).toBe('deep anchor');
  });

  it('should handle circular references in backlinks', () => {
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
    kg.addFile(parseMarkdown('src.md', 'See [[target#heading]].'));
    kg.addFile(parseMarkdown('target.md', '# heading\n\nContent.'));
    kg.buildBacklinkIndex();

    const backlinks = kg.getBacklinks('target');
    expect(backlinks.length).toBe(1);
    expect(backlinks[0].targetHeading).toBe('heading');
    expect(backlinks[0].source).toBe('src.md');
  });

  it('should handle search with special characters', () => {
    kg.addFile(parseMarkdown('special.md', 'Contains special chars: @#$%^&*()'));
    kg.buildSearchIndex();

    const results = kg.search('special');
    expect(results.length).toBe(1);
    expect(results[0].file).toBe('special.md');
  });

  it('should handle case-insensitive search', () => {
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
    const daily = kg.createDailyNote('2024-05-01', { folder: 'journal' });
    expect(daily.path).toBe('journal/2024-05-01.md');
  });

  it('should perform a complete end-to-end workflow with file system scan', async () => {
    // Create test files on disk
    const fileAPath = join(testDir, 'A.md');
    const fileBPath = join(testDir, 'B.md');
    const fileCPath = join(testDir, 'C.md');

    await writeFile(fileAPath, `---
title: Note A
tags: [test, integration]
---

# Note A

This is note A with some content about search and backlinks.

See [[B]] for more details.

## Section 1

Content in section 1.

Check out [[C#anchor]] too.
`);

    await writeFile(fileBPath, `---
title: Note B
tags: [test]
---

# Note B

This is note B.

Back to [[A]].

## Details

More details here.
`);

    await writeFile(fileCPath, `---
title: Note C
tags: [integration]
---

# Note C

This is note C.

## anchor

Anchor content here.
`);

    // Scan the folder
    const scannedFiles = await kg.scanFolder(testDir);

    // Verify all files were scanned
    expect(scannedFiles.length).toBe(3);
    expect(kg['files'].size).toBe(3);

    // Verify file paths are correct
    const filePaths = Array.from(kg['files'].keys());
    expect(filePaths).toContain(fileAPath);
    expect(filePaths).toContain(fileBPath);
    expect(filePaths).toContain(fileCPath);

    // Search for "note" — should find all 3 files
    const searchResults = kg.search('note');
    expect(searchResults.length).toBe(3);

    // Verify search results have correct structure
    for (const result of searchResults) {
      expect(result).toHaveProperty('file');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('highlights');
      expect(Array.isArray(result.highlights)).toBe(true);
      for (const match of result.highlights) {
        expect(match).toHaveProperty('term');
        expect(match).toHaveProperty('snippet');
      }
    }

    // Get backlinks for "B" — A.md links to B
    const backlinksB = kg.getBacklinks('B');
    expect(backlinksB.length).toBe(1);
    expect(backlinksB[0].source).toBe(fileAPath);
    expect(backlinksB[0].target).toBe('B');

    // Get backlinks for "A" — B.md links to A
    const backlinksA = kg.getBacklinks('A');
    expect(backlinksA.length).toBe(1);
    expect(backlinksA[0].source).toBe(fileBPath);
    expect(backlinksA[0].target).toBe('A');

    // Generate graph data
    const graphData = kg.getGraphData();
    expect(graphData.nodes.length).toBeGreaterThan(0);
    expect(graphData.edges.length).toBeGreaterThan(0);

    // Verify graph nodes include file nodes and heading nodes
    const fileNodes = graphData.nodes.filter(n => n.type === 'file');
    const headingNodes = graphData.nodes.filter(n => n.type === 'heading');
    expect(fileNodes.length).toBe(6); // A.md, B.md, C.md, A, B, C#anchor
    expect(headingNodes.length).toBeGreaterThan(0);

    // Verify graph edges include wiki link edges
    const wikiEdges = graphData.edges.filter(e => e.label);
    expect(wikiEdges.length).toBeGreaterThan(0);

    // Create a daily note
    const dailyNote = kg.createDailyNote('2024-03-15');
    expect(dailyNote.path).toBe('daily-notes/2024-03-15.md');
    expect(dailyNote.date).toBe('2024-03-15');
    expect(dailyNote.content).toContain('2024-03-15');
    expect(dailyNote.content).toContain('---');

    // Create a daily note with a custom template
    const customTemplate = '# {{date}}\n\n## Tasks\n- [ ] ';
    const customDaily = kg.createDailyNote('2024-03-16', { template: customTemplate });
    expect(customDaily.content).toContain('# 2024-03-16');
    expect(customDaily.content).toContain('## Tasks');

    // Clean up test files
    await rm(fileAPath);
    await rm(fileBPath);
    await rm(fileCPath);
  });

  it('should handle subdirectories during scan', async () => {
    // Create subdirectory structure
    const subDir = join(testDir, 'subdir');
    await mkdir(subDir, { recursive: true });

    const fileInSubdir = join(subDir, 'sub.md');
    await writeFile(fileInSubdir, `# Sub File

Content in subdirectory.

See [[parent]].
`);

    const parentFile = join(testDir, 'parent.md');
    await writeFile(parentFile, `# Parent File

Content in parent directory.

See [[subdir/sub]].
`);

    // Scan the folder
    const scannedFiles = await kg.scanFolder(testDir);

    // Verify both files were scanned
    expect(scannedFiles.length).toBe(2);
    expect(kg['files'].size).toBe(2);

    // Verify file paths include subdirectory
    const filePaths = Array.from(kg['files'].keys());
    expect(filePaths).toContain(fileInSubdir);
    expect(filePaths).toContain(parentFile);

    // Search should find both files
    const searchResults = kg.search('content');
    expect(searchResults.length).toBe(2);

    // Clean up test files
    await rm(fileInSubdir);
    await rm(parentFile);
    await rm(subDir, { recursive: true });
  });

  it('should handle search result ranking', async () => {
    const file1Path = join(testDir, 'file1.md');
    const file2Path = join(testDir, 'file2.md');

    // File with more matches should rank higher
    await writeFile(file1Path, `# Test File 1

This is a test file with test content about testing.
`);

    await writeFile(file2Path, `# Test File 2

This is a test file.
`);

    // Scan the folder
    await kg.scanFolder(testDir);

    // Search for "test"
    const searchResults = kg.search('test');
    expect(searchResults.length).toBe(2);

    // Verify results are sorted by score (descending)
    expect(searchResults[0].score).toBeGreaterThanOrEqual(searchResults[1].score);

    // Clean up test files
    await rm(file1Path);
    await rm(file2Path);
  });

  it('should handle backlink index with heading context', async () => {
    const fileAPath = join(testDir, 'A.md');
    const fileBPath = join(testDir, 'B.md');

    await writeFile(fileAPath, `# File A

## Section 1

See [[B]].

## Section 2

Also see [[B]].
`);

    await writeFile(fileBPath, `# File B

Content here.
`);

    // Scan the folder
    await kg.scanFolder(testDir);

    // Get backlinks for "B"
    const backlinksB = kg.getBacklinks('B');
    expect(backlinksB.length).toBe(2);

    // Verify source headings are tracked
    const sources = backlinksB.map(b => b.sourceHeading).sort();
    expect(sources).toEqual(['Section 1', 'Section 2']);

    // Clean up test files
    await rm(fileAPath);
    await rm(fileBPath);
  });

  it('should handle daily note template with date replacement', async () => {
    const template = `---
title: Daily Note - {{date}}
date: {{date}}
---

# Daily Note - {{date}}

## Morning
- [ ] Task 1

## Afternoon
- [ ] Task 2

## Evening
- [ ] Task 3
`;

    const dailyNote = kg.createDailyNote('2024-06-15', { template });
    expect(dailyNote.content).toContain('title: Daily Note - 2024-06-15');
    expect(dailyNote.content).toContain('date: 2024-06-15');
    expect(dailyNote.content).toContain('# Daily Note - 2024-06-15');
    expect(dailyNote.content).not.toContain('{{date}}');
  });

  it('should handle graph data with proper node types', async () => {
    const fileAPath = join(testDir, 'A.md');
    const fileBPath = join(testDir, 'B.md');

    await writeFile(fileAPath, `---
title: Note A
---

# Note A

See [[B]].
`);

    await writeFile(fileBPath, `---
title: Note B
---

# Note B

## Section 1

Content here.
`);

    // Scan the folder
    await kg.scanFolder(testDir);

    // Generate graph data
    const graphData = kg.getGraphData();

    // Verify node types
    const nodeTypes = new Set(graphData.nodes.map(n => n.type));
    expect(nodeTypes.has('file')).toBe(true);
    expect(nodeTypes.has('heading')).toBe(true);

    // Verify file nodes have correct properties
    const fileNodes = graphData.nodes.filter(n => n.type === 'file');
    for (const node of fileNodes) {
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('label');
      expect(node).toHaveProperty('file');
      expect(node).toHaveProperty('type');
    }

    // Verify heading nodes have correct properties
    const headingNodes = graphData.nodes.filter(n => n.type === 'heading');
    for (const node of headingNodes) {
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('label');
      expect(node).toHaveProperty('file');
      expect(node).toHaveProperty('type');
    }

    // Verify edges have correct properties
    for (const edge of graphData.edges) {
      expect(edge).toHaveProperty('from');
      expect(edge).toHaveProperty('to');
    }

    // Clean up test files
    await rm(fileAPath);
    await rm(fileBPath);
  });

  it('should handle search with multi-term query', async () => {
    const fileAPath = join(testDir, 'A.md');
    const fileBPath = join(testDir, 'B.md');

    await writeFile(fileAPath, `# Note A

This is a test note about search functionality.
`);

    await writeFile(fileBPath, `# Note B

This is another test note about searching.
`);

    // Scan the folder
    await kg.scanFolder(testDir);

    // Search for multi-term query — both files contain "test" and "note"
    const searchResults = kg.search('test note');
    expect(searchResults.length).toBe(2);

    // Verify results contain both terms
    for (const result of searchResults) {
      const hasNote = result.highlights.some(m => m.term.includes('note'));
      const hasTest = result.highlights.some(m => m.term.includes('test'));
      // At least one of the terms should be in the highlights
      expect(hasNote || hasTest).toBe(true);
    }

    // Clean up test files
    await rm(fileAPath);
    await rm(fileBPath);
  });

  it('should handle backlinks for non-existent targets', async () => {
    const fileAPath = join(testDir, 'A.md');

    await writeFile(fileAPath, `# Note A

See [[NonExistentFile]].
`);

    // Scan the folder
    await kg.scanFolder(testDir);

    // Get backlinks for non-existent target
    const backlinks = kg.getBacklinks('NonExistentFile');
    expect(backlinks.length).toBe(1);
    expect(backlinks[0].source).toBe(fileAPath);
    expect(backlinks[0].target).toBe('NonExistentFile');

    // Clean up test files
    await rm(fileAPath);
  });

  it('should handle graph data with orphan nodes', async () => {
    const fileAPath = join(testDir, 'A.md');

    await writeFile(fileAPath, `# Note A

See [[NonExistentFile]].
`);

    // Scan the folder
    await kg.scanFolder(testDir);

    // Generate graph data
    const graphData = kg.getGraphData();

    // Verify orphan node exists
    const orphanNodes = graphData.nodes.filter(n => n.id === 'NonExistentFile');
    expect(orphanNodes.length).toBe(1);
    expect(orphanNodes[0].type).toBe('file');

    // Verify edge to orphan node exists
    const orphanEdges = graphData.edges.filter(e => e.to === 'NonExistentFile');
    expect(orphanEdges.length).toBe(1);

    // Clean up test files
    await rm(fileAPath);
  });

  it('should handle daily note with default template', async () => {
    const dailyNote = kg.createDailyNote('2024-07-01');

    // Verify default template structure
    expect(dailyNote.content).toContain('---');
    expect(dailyNote.content).toContain('title: 2024-07-01');
    expect(dailyNote.content).toContain('# 2024-07-01');
    expect(dailyNote.path).toBe('daily-notes/2024-07-01.md');
    expect(dailyNote.date).toBe('2024-07-01');
  });

  it('should handle search with limit option', async () => {
    const fileAPath = join(testDir, 'A.md');
    const fileBPath = join(testDir, 'B.md');
    const fileCPath = join(testDir, 'C.md');

    await writeFile(fileAPath, '# Note A\n\nContent A.');
    await writeFile(fileBPath, '# Note B\n\nContent B.');
    await writeFile(fileCPath, '# Note C\n\nContent C.');

    // Scan the folder
    await kg.scanFolder(testDir);

    // Search with limit
    const searchResults = kg.search('note', { limit: 2 });
    expect(searchResults.length).toBe(2);

    // Clean up test files
    await rm(fileAPath);
    await rm(fileBPath);
    await rm(fileCPath);
  });

  it('should handle file with only frontmatter', async () => {
    const fileAPath = join(testDir, 'A.md');

    await writeFile(fileAPath, `---
title: Frontmatter Only
tags: [test]
---
`);

    // Scan the folder
    await kg.scanFolder(testDir);

    // Verify file was parsed
    expect(kg['files'].size).toBe(1);

    // Search should work
    const searchResults = kg.search('frontmatter');
    expect(searchResults.length).toBe(1);

    // Graph should have file node but no heading nodes
    const graphData = kg.getGraphData();
    expect(graphData.nodes.length).toBe(1);
    expect(graphData.edges.length).toBe(0);

    // Clean up test files
    await rm(fileAPath);
  });

  it('should handle file with only headings', async () => {
    const fileAPath = join(testDir, 'A.md');

    await writeFile(fileAPath, `# Heading 1

## Heading 2

### Heading 3
`);

    // Scan the folder
    await kg.scanFolder(testDir);

    // Verify file was parsed
    expect(kg['files'].size).toBe(1);

    // Search should work
    const searchResults = kg.search('heading');
    expect(searchResults.length).toBe(1);

    // Graph should have file node and heading nodes
    const graphData = kg.getGraphData();
    expect(graphData.nodes.length).toBe(4); // 1 file + 3 headings
    expect(graphData.edges.length).toBe(3); // 3 edges from file to headings

    // Clean up test files
    await rm(fileAPath);
  });

  it('should handle file with only wiki links', async () => {
    const fileAPath = join(testDir, 'A.md');
    const fileBPath = join(testDir, 'B.md');

    await writeFile(fileAPath, `[[B]]

See [[C]].
`);

    await writeFile(fileBPath, '# B\n\nContent.');

    // Scan the folder
    await kg.scanFolder(testDir);

    // Verify files were parsed
    expect(kg['files'].size).toBe(2);

    // Backlinks for B
    const backlinksB = kg.getBacklinks('B');
    expect(backlinksB.length).toBe(1);
    expect(backlinksB[0].source).toBe(fileAPath);

    // Graph should have file nodes and wiki link edges
    const graphData = kg.getGraphData();
    expect(graphData.nodes.length).toBeGreaterThan(0);
    expect(graphData.edges.length).toBeGreaterThan(0);

    // Clean up test files
    await rm(fileAPath);
    await rm(fileBPath);
  });

  it('should handle re-scanning with updated files', async () => {
    const fileAPath = join(testDir, 'A.md');

    // Initial file
    await writeFile(fileAPath, `# Note A

See [[B]].
`);

    // First scan
    await kg.scanFolder(testDir);
    expect(kg['files'].size).toBe(1);

    // Get backlinks before update
    const backlinksBefore = kg.getBacklinks('B');
    expect(backlinksBefore.length).toBe(1);

    // Update file
    await writeFile(fileAPath, `# Note A

See [[C]].
`);

    // Re-scan
    await kg.scanFolder(testDir);

    // Verify file was updated
    expect(kg['files'].size).toBe(1);

    // Get backlinks after update
    const backlinksAfter = kg.getBacklinks('C');
    expect(backlinksAfter.length).toBe(1);
    expect(backlinksAfter[0].source).toBe(fileAPath);

    // Old backlink should be gone
    const oldBacklinks = kg.getBacklinks('B');
    expect(oldBacklinks.length).toBe(0);

    // Clean up test files
    await rm(fileAPath);
  });

  it('should handle complex multi-file workflow', async () => {
    // Create a more complex vault structure
    const files = [
      { path: 'A.md', content: `---
title: Main Page
tags: [main]
---

# Main Page

Welcome to the vault.

See [[B]] for details.

## Overview

This is the overview section.

Check out [[C#features]] and [[D]].
` },
      { path: 'B.md', content: `---
title: Details
tags: [details]
---

# Details

This is the details page.

Back to [[A]].

## More Details

Even more details here.
` },
      { path: 'C.md', content: `---
title: Features
tags: [features]
---

# Features

List of features.

## features

Feature 1: Search
Feature 2: Backlinks
Feature 3: Graph View
` },
      { path: 'D.md', content: `---
title: Other
tags: [other]
---

# Other

Other content.

See [[A]] and [[B]].
` },
    ];

    // Write all files
    for (const file of files) {
      await writeFile(join(testDir, file.path), file.content);
    }

    // Scan the folder
    const scannedFiles = await kg.scanFolder(testDir);
    expect(scannedFiles.length).toBe(4);
    expect(kg['files'].size).toBe(4);

    // Search for "feature" — C.md has "Features" in title and "feature" in body
    // D.md has "Other" which doesn't contain "feature", but let's verify C.md is found
    const searchResults = kg.search('feature');
    expect(searchResults.length).toBeGreaterThanOrEqual(1);
    expect(searchResults.some(r => r.file === join(testDir, 'C.md'))).toBe(true);

    // Get backlinks for "A"
    // B.md links to A, D.md links to A => 2 backlinks
    const backlinksA = kg.getBacklinks('A');
    expect(backlinksA.length).toBe(2);

    // Get backlinks for "B"
    // A.md links to B, D.md links to B => 2 backlinks
    const backlinksB = kg.getBacklinks('B');
    expect(backlinksB.length).toBe(2);

    // Generate graph data
    const graphData = kg.getGraphData();
    expect(graphData.nodes.length).toBeGreaterThan(4); // At least 4 file nodes + headings
    expect(graphData.edges.length).toBeGreaterThan(4); // At least 4 wiki link edges

    // Verify all file nodes exist
    const fileNodeIds = graphData.nodes.filter(n => n.type === 'file').map(n => n.id);
    for (const file of files) {
      expect(fileNodeIds).toContain(join(testDir, file.path));
    }

    // Clean up test files
    for (const file of files) {
      await rm(join(testDir, file.path));
    }
  });
});
