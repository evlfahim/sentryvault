import { describe, it, expect } from 'vitest';
import {
  generateGraphData,
  generateSimpleGraphData,
  getNodeColor,
  type VisNode,
  type VisEdge,
  type GraphOptions,
} from './graph';
import { parseMarkdown, type ParsedFile } from './parser';

describe('generateGraphData', () => {
  it('should generate nodes and edges from a single file', () => {
    const content = `# Note

See [[Other]].
`;
    const files = new Map<string, ParsedFile>();
    files.set('Note.md', parseMarkdown('Note.md', content));

    const result = generateGraphData(files);

    // Note.md file node, "Note" heading node, "Other" file node = 3 nodes
    expect(result.nodes).toHaveLength(3);

    // Note.md -> Note heading, Note.md -> Other = 2 edges
    expect(result.edges).toHaveLength(2);
  });

  it('should generate nodes for files with frontmatter titles', () => {
    const content = `---
title: My Title
---

# Heading

Some content.
`;
    const files = new Map<string, ParsedFile>();
    files.set('file.md', parseMarkdown('file.md', content));

    const result = generateGraphData(files);

    const fileNode = result.nodes.find(n => n.id === 'file.md');
    expect(fileNode).toBeDefined();
    expect(fileNode!.label).toBe('My Title');
  });

  it('should use filename as label when no frontmatter title', () => {
    const content = `# Heading

Some content.
`;
    const files = new Map<string, ParsedFile>();
    files.set('my-file.md', parseMarkdown('my-file.md', content));

    const result = generateGraphData(files);

    const fileNode = result.nodes.find(n => n.id === 'my-file.md');
    expect(fileNode).toBeDefined();
    expect(fileNode!.label).toBe('my-file.md');
  });

  it('should create heading nodes with edges to parent file', () => {
    const content = `# H1

## H2

### H3
`;
    const files = new Map<string, ParsedFile>();
    files.set('doc.md', parseMarkdown('doc.md', content));

    const result = generateGraphData(files);

    // doc.md file, H1, H2, H3 = 4 nodes
    expect(result.nodes).toHaveLength(4);

    // 3 edges: file->H1, file->H2, file->H3
    expect(result.edges).toHaveLength(3);

    const headingNodes = result.nodes.filter(n => n.type === 'heading');
    expect(headingNodes).toHaveLength(3);
    expect(headingNodes.map(n => n.label)).toContain('H1');
    expect(headingNodes.map(n => n.label)).toContain('H2');
    expect(headingNodes.map(n => n.label)).toContain('H3');
  });

  it('should create wiki link edges between files', () => {
    const contentA = `# A

See [[B]].
`;
    const contentB = `# B

Back to [[A]].
`;
    const files = new Map<string, ParsedFile>();
    files.set('A.md', parseMarkdown('A.md', contentA));
    files.set('B.md', parseMarkdown('B.md', contentB));

    const result = generateGraphData(files);

    // A.md, B.md, A heading, B heading = 4 nodes
    expect(result.nodes).toHaveLength(4);

    // A->A heading, B->B heading, A->B, B->A = 4 edges
    expect(result.edges).toHaveLength(4);
  });

  it('should handle wiki links with anchors', () => {
    const contentA = `# A

See [[B#section]].
`;
    const contentB = `# B

## section

Content.
`;
    const files = new Map<string, ParsedFile>();
    files.set('A.md', parseMarkdown('A.md', contentA));
    files.set('B.md', parseMarkdown('B.md', contentB));

    const result = generateGraphData(files);

    // A.md, B.md, A heading, B heading, B#section heading = 5 nodes
    expect(result.nodes).toHaveLength(5);

    // A->A heading, B->B heading, B->B#section, A->B#section = 4 edges
    expect(result.edges).toHaveLength(4);
  });

  it('should create orphan nodes for unlinked targets', () => {
    const content = `# A

See [[Nonexistent]].
`;
    const files = new Map<string, ParsedFile>();
    files.set('A.md', parseMarkdown('A.md', content));

    const result = generateGraphData(files);

    // A.md, A heading, Nonexistent = 3 nodes
    expect(result.nodes).toHaveLength(3);

    const orphanNode = result.nodes.find(n => n.id === 'Nonexistent');
    expect(orphanNode).toBeDefined();
    expect(orphanNode!.type).toBe('file');
  });

  it('should not create orphan nodes when includeUnlinkedTargets is false', () => {
    const content = `# A

See [[Nonexistent]].
`;
    const files = new Map<string, ParsedFile>();
    files.set('A.md', parseMarkdown('A.md', content));

    const result = generateGraphData(files, { includeUnlinkedTargets: false });

    // A.md, A heading = 2 nodes
    expect(result.nodes).toHaveLength(2);

    const orphanNode = result.nodes.find(n => n.id === 'Nonexistent');
    expect(orphanNode).toBeUndefined();
  });

  it('should not create heading nodes when includeHeadings is false', () => {
    const content = `# H1

## H2

See [[Other]].
`;
    const files = new Map<string, ParsedFile>();
    files.set('A.md', parseMarkdown('A.md', content));

    const result = generateGraphData(files, { includeHeadings: false });

    // A.md, Other = 2 nodes
    expect(result.nodes).toHaveLength(2);

    const headingNodes = result.nodes.filter(n => n.type === 'heading');
    expect(headingNodes).toHaveLength(0);
  });

  it('should filter nodes by type', () => {
    const content = `# H1

## H2

See [[Other]].
`;
    const files = new Map<string, ParsedFile>();
    files.set('A.md', parseMarkdown('A.md', content));

    const result = generateGraphData(files, { nodeType: 'file' });

    const fileNodes = result.nodes.filter(n => n.type === 'file');
    expect(fileNodes).toHaveLength(2); // A.md and Other

    const headingNodes = result.nodes.filter(n => n.type === 'heading');
    expect(headingNodes).toHaveLength(0);
  });

  it('should highlight specific nodes', () => {
    const content = `# A

See [[B]].
`;
    const files = new Map<string, ParsedFile>();
    files.set('A.md', parseMarkdown('A.md', content));
    files.set('B.md', parseMarkdown('B.md', '# B'));

    const result = generateGraphData(files, { highlightIds: ['A.md'] });

    const highlightedNode = result.nodes.find(n => n.id === 'A.md');
    expect(highlightedNode).toBeDefined();
    expect(highlightedNode!.color!.background).toBe('#ff6b6b');
    expect(highlightedNode!.size).toBe(30);
  });

  it('should use custom label resolver', () => {
    const content = `# A

Some content.
`;
    const files = new Map<string, ParsedFile>();
    files.set('A.md', parseMarkdown('A.md', content));

    const result = generateGraphData(files, {
      labelResolver: (id) => `Custom: ${id}`,
    });

    const fileNode = result.nodes.find(n => n.id === 'A.md');
    expect(fileNode!.label).toBe('Custom: A.md');
  });

  it('should respect maxNodes limit', () => {
    const contentA = `# A

See [[B]].
`;
    const contentB = `# B

See [[C]].
`;
    const contentC = `# C

See [[D]].
`;
    const contentD = `# D`;
    const files = new Map<string, ParsedFile>();
    files.set('A.md', parseMarkdown('A.md', contentA));
    files.set('B.md', parseMarkdown('B.md', contentB));
    files.set('C.md', parseMarkdown('C.md', contentC));
    files.set('D.md', parseMarkdown('D.md', contentD));

    const result = generateGraphData(files, { maxNodes: 3 });

    expect(result.nodes).toHaveLength(3);
  });

  it('should handle empty file map', () => {
    const files = new Map<string, ParsedFile>();
    const result = generateGraphData(files);

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('should handle file with no headings and no wiki links', () => {
    const content = `Just plain text.

No headings or links here.
`;
    const files = new Map<string, ParsedFile>();
    files.set('plain.md', parseMarkdown('plain.md', content));

    const result = generateGraphData(files);

    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
  });

  it('should handle file with only frontmatter', () => {
    const content = `---
title: Frontmatter Only
---
`;
    const files = new Map<string, ParsedFile>();
    files.set('fm.md', parseMarkdown('fm.md', content));

    const result = generateGraphData(files);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].label).toBe('Frontmatter Only');
    expect(result.edges).toHaveLength(0);
  });

  it('should handle multiple wiki links on same line', () => {
    const content = `# A

See [[B]] and [[C]].
`;
    const files = new Map<string, ParsedFile>();
    files.set('A.md', parseMarkdown('A.md', content));
    files.set('B.md', parseMarkdown('B.md', '# B'));
    files.set('C.md', parseMarkdown('C.md', '# C'));

    const result = generateGraphData(files);

    // A.md, B.md, C.md, A heading = 4 nodes
    expect(result.nodes).toHaveLength(4);

    // A->A heading, A->B, A->C = 3 edges
    expect(result.edges).toHaveLength(3);
  });

  it('should produce vis-network compatible node structure', () => {
    const content = `---
title: Test
---

Some content.
`;
    const files = new Map<string, ParsedFile>();
    files.set('test.md', parseMarkdown('test.md', content));

    const result = generateGraphData(files);

    const node = result.nodes[0] as VisNode;
    expect(node.id).toBe('test.md');
    expect(node.label).toBe('Test');
    expect(node.type).toBe('file');
    expect(node.shape).toBe('box');
    expect(node.color).toBeDefined();
    expect(node.color!.background).toBe('#4a90d9');
    expect(node.font).toBeDefined();
    expect(node.font!.size).toBe(14);
  });

  it('should produce vis-network compatible edge structure', () => {
    const content = `# A

See [[B]].
`;
    const files = new Map<string, ParsedFile>();
    files.set('A.md', parseMarkdown('A.md', content));
    files.set('B.md', parseMarkdown('B.md', '# B'));

    const result = generateGraphData(files);

    const wikiEdge = result.edges.find(e => e.from === 'A.md' && e.to === 'B.md');
    expect(wikiEdge).toBeDefined();
    expect(wikiEdge!.arrows).toEqual({ to: true });
    expect(wikiEdge!.smooth).toEqual({ type: 'curvedCW' });
    expect(wikiEdge!.color).toBeDefined();
  });

  it('should handle deeply nested headings', () => {
    const content = `# H1

## H2

### H3

#### H4
`;
    const files = new Map<string, ParsedFile>();
    files.set('deep.md', parseMarkdown('deep.md', content));

    const result = generateGraphData(files);

    // deep.md, H1, H2, H3, H4 = 5 nodes
    expect(result.nodes).toHaveLength(5);

    // 4 edges: file->H1, file->H2, file->H3, file->H4
    expect(result.edges).toHaveLength(4);
  });

  it('should handle daily note type nodes', () => {
    const content = `---
title: 2024-01-15
---

# Daily Note

Content.
`;
    const files = new Map<string, ParsedFile>();
    files.set('daily-notes/2024-01-15.md', parseMarkdown('daily-notes/2024-01-15.md', content));

    const result = generateGraphData(files);

    const dailyNode = result.nodes.find(n => n.id === 'daily-notes/2024-01-15.md');
    expect(dailyNode).toBeDefined();
    expect(dailyNode!.type).toBe('file');
    expect(dailyNode!.label).toBe('2024-01-15');
  });

  it('should deduplicate nodes when same file is referenced multiple times', () => {
    const contentA = `# A

See [[B]] and [[B#section]].
`;
    const contentB = `# B

## section

Content.
`;
    const files = new Map<string, ParsedFile>();
    files.set('A.md', parseMarkdown('A.md', contentA));
    files.set('B.md', parseMarkdown('B.md', contentB));

    const result = generateGraphData(files);

    // A.md, B.md, A heading, B heading, B#section heading = 5 nodes
    expect(result.nodes).toHaveLength(5);

    // A->A heading, B->B heading, B->B#section, A->B#section = 4 edges
    expect(result.edges).toHaveLength(4);
  });

  it('should set correct node sizes for different types', () => {
    const content = `# H1

See [[Target]].
`;
    const files = new Map<string, ParsedFile>();
    files.set('A.md', parseMarkdown('A.md', content));
    files.set('Target.md', parseMarkdown('Target.md', '# Target'));

    const result = generateGraphData(files);

    const fileNodes = result.nodes.filter(n => n.type === 'file');
    for (const node of fileNodes) {
      expect(node.size).toBe(20);
    }

    const headingNodes = result.nodes.filter(n => n.type === 'heading');
    for (const node of headingNodes) {
      expect(node.size).toBe(10);
    }
  });

  it('should set correct node shapes for different types', () => {
    const content = `# H1

See [[Target]].
`;
    const files = new Map<string, ParsedFile>();
    files.set('A.md', parseMarkdown('A.md', content));
    files.set('Target.md', parseMarkdown('Target.md', '# Target'));

    const result = generateGraphData(files);

    const fileNodes = result.nodes.filter(n => n.type === 'file');
    for (const node of fileNodes) {
      expect(node.shape).toBe('box');
    }

    const headingNodes = result.nodes.filter(n => n.type === 'heading');
    for (const node of headingNodes) {
      expect(node.shape).toBe('dot');
    }
  });

  it('should handle circular wiki links', () => {
    const contentA = `# A

See [[B]].
`;
    const contentB = `# B

See [[A]].
`;
    const files = new Map<string, ParsedFile>();
    files.set('A.md', parseMarkdown('A.md', contentA));
    files.set('B.md', parseMarkdown('B.md', contentB));

    const result = generateGraphData(files);

    // A.md, B.md, A heading, B heading = 4 nodes
    expect(result.nodes).toHaveLength(4);

    // A->A heading, B->B heading, A->B, B->A = 4 edges
    expect(result.edges).toHaveLength(4);
  });

  it('should handle self-referencing wiki links', () => {
    const content = `# Self

See [[Self]].
`;
    const files = new Map<string, ParsedFile>();
    files.set('Self.md', parseMarkdown('Self.md', content));

    const result = generateGraphData(files);

    // Self.md, Self heading = 2 nodes
    expect(result.nodes).toHaveLength(2);

    // Self.md -> Self heading, Self.md -> Self.md = 2 edges
    expect(result.edges).toHaveLength(2);
  });

  it('should include title in node title attribute', () => {
    const content = `# A

Some content that should appear in the tooltip.
`;
    const files = new Map<string, ParsedFile>();
    files.set('A.md', parseMarkdown('A.md', content));

    const result = generateGraphData(files);

    const node = result.nodes.find(n => n.id === 'A.md');
    expect(node!.title).toContain('Some content that should appear in the tooltip');
  });
});

describe('generateSimpleGraphData', () => {
  it('should generate nodes from file paths only', () => {
    const result = generateSimpleGraphData(['file1.md', 'file2.md', 'file3.md']);

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(0);

    expect(result.nodes[0].id).toBe('file1.md');
    expect(result.nodes[0].label).toBe('file1.md');
    expect(result.nodes[0].type).toBe('file');
    expect(result.nodes[0].shape).toBe('box');
  });

  it('should use filename as label from path', () => {
    const result = generateSimpleGraphData(['folder/nested/file.md']);

    expect(result.nodes[0].label).toBe('file.md');
    expect(result.nodes[0].id).toBe('folder/nested/file.md');
  });

  it('should handle empty file list', () => {
    const result = generateSimpleGraphData([]);

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('should produce vis-network compatible structure', () => {
    const result = generateSimpleGraphData(['test.md']);

    const node = result.nodes[0] as VisNode;
    expect(node.color).toBeDefined();
    expect(node.color!.background).toBe('#4a90d9');
    expect(node.font).toBeDefined();
    expect(node.font!.size).toBe(14);
    expect(node.size).toBe(20);
  });
});

describe('getNodeColor', () => {
  it('should return correct colors for file type', () => {
    const color = getNodeColor('file');
    expect(color.background).toBe('#4a90d9');
    expect(color.border).toBe('#2c6fad');
  });

  it('should return correct colors for heading type', () => {
    const color = getNodeColor('heading');
    expect(color.background).toBe('#7b68ee');
    expect(color.border).toBe('#5b48ce');
  });

  it('should return correct colors for daily type', () => {
    const color = getNodeColor('daily');
    expect(color.background).toBe('#50c878');
    expect(color.border).toBe('#30a858');
  });
});
