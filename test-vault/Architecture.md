---
title: Architecture
---

# Architecture

## Components

The system has three main components:

1. **Core** - The knowledge graph engine
2. **Web UI** - The browser-based interface
3. **Server** - The HTTP server that bridges them

## Data Flow

The core module parses markdown files and builds:
- A file index
- A backlink index
- A full-text search index

See [[Features]] for more on each component.

## Dependencies

- [[flexsearch]] for search
- vis-network for graph visualization
