/**
 * SentryVault Web UI - Main application script.
 * Connects to the backend API for search, graph, backlinks, and daily notes.
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────
  let graph = null;
  let network = null;
  let currentView = 'search';

  // ── DOM refs ───────────────────────────────────────────────────────
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const searchResults = document.getElementById('search-results');
  const graphContainer = document.getElementById('graph-container');
  const dailyDate = document.getElementById('daily-date');
  const createDailyBtn = document.getElementById('create-daily-btn');
  const dailyContent = document.getElementById('daily-content');
  const backlinkPanel = document.getElementById('backlink-panel');
  const backlinksList = document.getElementById('backlinks-list');
  const navBtns = document.querySelectorAll('.nav-btn');

  // ── Navigation ─────────────────────────────────────────────────────
  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });

  function switchView(view) {
    currentView = view;
    navBtns.forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.view').forEach((v) =>
      v.classList.toggle('active', v.id === `${view}-view`)
    );

    if (view === 'graph') {
      loadGraph();
    } else if (view === 'daily') {
      loadDailyNote();
    }
  }

  // ── Search ─────────────────────────────────────────────────────────
  searchBtn.addEventListener('click', performSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') performSearch();
  });

  async function performSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    searchResults.innerHTML = '<p class="no-results">Searching…</p>';

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (data.error) {
        searchResults.innerHTML = `<p class="no-results">${data.error}</p>`;
        return;
      }

      if (data.results.length === 0) {
        searchResults.innerHTML = '<p class="no-results">No results found.</p>';
        return;
      }

      searchResults.innerHTML = data.results
        .map((r) => {
          const highlights = r.matches
            .map((m) => `<span class="highlight">${escapeHtml(m.text)}</span>`)
            .join('');
          return `
            <div class="search-result" data-file="${escapeHtml(r.file)}">
              <h3>${escapeHtml(r.file)}</h3>
              <div class="snippet">${escapeHtml(r.matches[0]?.snippet || '')} ${highlights}</div>
            </div>
          `;
        })
        .join('');

      // Attach click handlers to show backlinks
      searchResults.querySelectorAll('.search-result').forEach((el) => {
        el.addEventListener('click', () => {
          const file = el.dataset.file;
          showBacklinks(file);
        });
      });
    } catch (err) {
      searchResults.innerHTML = `<p class="no-results">Error: ${err.message}</p>`;
    }
  }

  // ── Graph ──────────────────────────────────────────────────────────
  async function loadGraph() {
    graphContainer.innerHTML = '<p class="no-results">Loading graph…</p>';

    try {
      const res = await fetch('/api/graph');
      const data = await res.json();

      if (data.error) {
        graphContainer.innerHTML = `<p class="no-results">${data.error}</p>`;
        return;
      }

      const nodes = new vis.DataSet(data.nodes);
      const edges = new vis.DataSet(data.edges);

      const container = graphContainer;
      const options = {
        nodes: {
          shape: 'box',
          font: { color: '#ffffff', face: 'system-ui, sans-serif' },
          borderWidth: 2,
          shadow: true,
        },
        edges: {
          smooth: { type: 'curvedCW', roundness: 0.2 },
          arrows: { to: { enabled: true, scaleFactor: 0.6 } },
          shadow: false,
        },
        physics: {
          enabled: true,
          barnesHut: { gravitationalConstant: -2000, springLength: 120 },
          stabilization: { iterations: 200 },
        },
        interaction: { hover: true, tooltipDelay: 100 },
      };

      if (network) {
        network.destroy();
        network = null;
      }

      graph = { nodes, edges };
      network = new vis.Network(container, graph, options);

      network.on('click', (params) => {
        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0];
          showBacklinks(nodeId);
        }
      });
    } catch (err) {
      graphContainer.innerHTML = `<p class="no-results">Error: ${err.message}</p>`;
    }
  }

  // ── Backlinks ──────────────────────────────────────────────────────
  async function showBacklinks(target) {
    backlinkPanel.classList.add('visible');
    backlinksList.innerHTML = '<p class="no-results">Loading…</p>';

    try {
      const res = await fetch(`/api/backlinks?target=${encodeURIComponent(target)}`);
      const data = await res.json();

      if (data.error) {
        backlinksList.innerHTML = `<p class="no-results">${data.error}</p>`;
        return;
      }

      if (data.backlinks.length === 0) {
        backlinksList.innerHTML = '<p class="no-results">No backlinks found.</p>';
        return;
      }

      backlinksList.innerHTML = data.backlinks
        .map((b) => {
          const headingHtml = b.sourceHeading
            ? `<div class="heading">↳ ${escapeHtml(b.sourceHeading)}</div>`
            : '';
          return `
            <div class="backlink-item" data-source="${escapeHtml(b.source)}">
              <div class="source">${escapeHtml(b.source)}</div>
              ${headingHtml}
            </div>
          `;
        })
        .join('');

      backlinksList.querySelectorAll('.backlink-item').forEach((el) => {
        el.addEventListener('click', () => {
          const source = el.dataset.source;
          searchInput.value = source;
          performSearch();
        });
      });
    } catch (err) {
      backlinksList.innerHTML = `<p class="no-results">Error: ${err.message}</p>`;
    }
  }

  // ── Daily Notes ────────────────────────────────────────────────────
  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  dailyDate.value = today;

  createDailyBtn.addEventListener('click', () => {
    const date = dailyDate.value;
    if (!date) return;
    createDailyNote(date);
  });

  async function loadDailyNote() {
    const date = dailyDate.value || today;
    dailyContent.innerHTML = '<p class="no-results">Loading daily note…</p>';

    try {
      const res = await fetch(`/api/daily?date=${encodeURIComponent(date)}`);
      const data = await res.json();

      if (data.error) {
        dailyContent.innerHTML = `<p class="no-results">${data.error}</p>`;
        return;
      }

      dailyContent.innerHTML = `
        <h2>${escapeHtml(data.note.date)}</h2>
        <div class="content">${escapeHtml(data.note.content)}</div>
      `;
    } catch (err) {
      dailyContent.innerHTML = `<p class="no-results">Error: ${err.message}</p>`;
    }
  }

  async function createDailyNote(date) {
    dailyContent.innerHTML = '<p class="no-results">Creating…</p>';

    try {
      const res = await fetch('/api/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();

      if (data.error) {
        dailyContent.innerHTML = `<p class="no-results">${data.error}</p>`;
        return;
      }

      dailyContent.innerHTML = `
        <h2>${escapeHtml(data.note.date)}</h2>
        <div class="content">${escapeHtml(data.note.content)}</div>
      `;
    } catch (err) {
      dailyContent.innerHTML = `<p class="no-results">Error: ${err.message}</p>`;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Init ───────────────────────────────────────────────────────────
  switchView('search');
})();
