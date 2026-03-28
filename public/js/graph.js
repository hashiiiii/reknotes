// reknotes - knowledge graph visualization (Cytoscape.js)
document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("graph-container");
  if (!container) return;

  fetch("/api/graph")
    .then((r) => r.json())
    .then((data) => initGraph(container, data));
});

function initGraph(container, data) {
  const elements = [];

  for (const node of data.nodes) {
    elements.push({
      data: {
        id: node.id,
        label: node.label,
        type: node.type,
        val: node.val,
        created_at: node.created_at || "",
        snippet: node.snippet || "",
      },
    });
  }

  const nodeIds = new Set(data.nodes.map((n) => n.id));
  for (const link of data.links) {
    if (!nodeIds.has(link.source) || !nodeIds.has(link.target)) continue;
    elements.push({
      data: {
        id: link.source + "->" + link.target,
        source: link.source,
        target: link.target,
        type: link.type,
      },
    });
  }

  const cy = cytoscape({
    container: container,
    elements: elements,
    style: [
      // ── ノート ノード（小さめ・ラベル常時表示） ──
      {
        selector: 'node[type="note"]',
        style: {
          label: "data(label)",
          "background-color": "#6bb873",
          width: "mapData(val, 1, 10, 10, 22)",
          height: "mapData(val, 1, 10, 10, 22)",
          "font-size": "8px",
          color: "#7a7568",
          "text-valign": "bottom",
          "text-margin-y": 4,
          "text-outline-color": "#191816",
          "text-outline-width": 2,
          "text-max-width": "80px",
          "text-wrap": "ellipsis",
          "border-width": 0,
          opacity: 0.75,
          "overlay-opacity": 0,
        },
      },
      // ── タグ ノード（大きめ・目立つ道標） ──
      {
        selector: 'node[type="tag"]',
        style: {
          label: "data(label)",
          shape: "round-diamond",
          "background-color": "#c8c2b4",
          width: "mapData(val, 1, 10, 24, 52)",
          height: "mapData(val, 1, 10, 24, 52)",
          "font-size": "11px",
          "font-weight": "bold",
          color: "#e7e2d8",
          "text-valign": "bottom",
          "text-margin-y": 5,
          "text-outline-color": "#191816",
          "text-outline-width": 2,
          "border-width": 1.5,
          "border-color": "#a9a49a",
          "overlay-opacity": 0,
        },
      },
      // ── ノートのホバー ──
      {
        selector: 'node[type="note"].hover',
        style: {
          opacity: 1,
          "background-color": "#8dd498",
          color: "#e7e2d8",
          "z-index": 999,
        },
      },
      // ── タグのホバー ──
      {
        selector: 'node[type="tag"].hover',
        style: {
          "background-color": "#e7e2d8",
          "border-color": "#8dd498",
          color: "#e7e2d8",
          "z-index": 999,
        },
      },
      // ── ハイライト（クリック選択） ──
      {
        selector: "node.highlighted",
        style: {
          "background-color": "#e7e2d8",
          "border-width": 2,
          "border-color": "#8dd498",
          opacity: 1,
          "z-index": 999,
        },
      },
      // ── フェード ──
      {
        selector: "node.faded",
        style: {
          opacity: 0.08,
        },
      },
      {
        selector: "edge.faded",
        style: {
          opacity: 0.03,
        },
      },
      // ── エッジ ──
      {
        selector: 'edge[type="tag"]',
        style: {
          "line-color": "#5c5850",
          width: 0.6,
          "curve-style": "bezier",
          opacity: 0.15,
        },
      },
      {
        selector: "edge.highlighted",
        style: {
          opacity: 0.6,
          width: 1.5,
          "line-color": "#8dd498",
        },
      },
    ],
    layout: {
      name: "cose",
      animate: false,
      nodeDimensionsIncludeLabels: true,
      nodeRepulsion: function () { return 18000; },
      idealEdgeLength: function () { return 120; },
      edgeElasticity: function () { return 30; },
      gravity: 0.2,
      nestingFactor: 1.2,
      numIter: 2500,
      padding: 50,
      fit: true,
    },
    minZoom: 0.2,
    maxZoom: 3,
  });

  // ── ホバーでノートタイトルを表示 ──
  cy.on("mouseover", "node", (evt) => {
    evt.target.addClass("hover");
    container.style.cursor = "pointer";
  });
  cy.on("mouseout", "node", (evt) => {
    evt.target.removeClass("hover");
    container.style.cursor = "default";
  });

  // ── ノード クリック → サイドパネル表示 + URL更新 ──
  cy.on("tap", "node", (evt) => {
    const node = evt.target;
    showPanel(cy, node, data);
    const url = new URL(window.location);
    url.searchParams.set("node", node.data().id);
    history.pushState({ nodeId: node.data().id }, "", url);
  });

  // 背景クリックでパネル閉じる & フェード解除
  cy.on("tap", (evt) => {
    if (evt.target === cy) {
      closePanel();
      clearHighlights(cy);
      const url = new URL(window.location);
      url.searchParams.delete("node");
      history.pushState({}, "", url);
    }
  });

  // パネル閉じるボタン
  document.getElementById("panel-close")?.addEventListener("click", () => {
    closePanel();
    clearHighlights(cy);
    const url = new URL(window.location);
    url.searchParams.delete("node");
    history.pushState({}, "", url);
  });

  // ブラウザバック/フォワードでパネル状態を復元
  window.addEventListener("popstate", (evt) => {
    const nodeId = evt.state?.nodeId;
    if (nodeId) {
      const node = cy.getElementById(nodeId);
      if (node.length) showPanel(cy, node, data);
    } else {
      closePanel();
      clearHighlights(cy);
    }
  });

  // 初期表示: URLにnodeパラメータがあればパネルを開く
  const initNodeId = new URL(window.location).searchParams.get("node");
  if (initNodeId) {
    const node = cy.getElementById(initNodeId);
    if (node.length) {
      showPanel(cy, node, data);
      history.replaceState({ nodeId: initNodeId }, "");
    }
  }

  // リサイズ対応
  window.addEventListener("resize", () => cy.resize());
}

// ── パネル表示 ──
function showPanel(cy, node, data) {
  const panel = document.getElementById("graph-panel");
  const content = document.getElementById("panel-content");
  if (!panel || !content) return;

  // ハイライト
  clearHighlights(cy);
  cy.elements().addClass("faded");
  node.removeClass("faded").addClass("highlighted");
  node.connectedEdges().removeClass("faded").addClass("highlighted");
  node.neighborhood("node").removeClass("faded");

  const d = node.data();

  // 関連ノート一覧
  const noteNeighbors = node.neighborhood('node[type="note"]');
  const noteList = noteNeighbors
    .map((n) => {
      const nd = n.data();
      return `<a href="/notes/${nd.id.replace("note-", "")}" class="panel-note-link">
        <span class="panel-note-title">${escapeHtml(nd.label)}</span>
        <span class="panel-note-date">${formatDate(nd.created_at)}</span>
      </a>`;
    })
    .join("");

  if (d.type === "note") {
    content.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title">${escapeHtml(d.label)}</h2>
        <time class="panel-date">${formatDate(d.created_at)}</time>
      </div>
      ${d.snippet ? `<p class="panel-snippet">${escapeHtml(d.snippet)}...</p>` : ""}
      <a href="/notes/${d.id.replace("note-", "")}" class="btn btn-primary panel-open-btn">ノートを開く</a>
      ${noteNeighbors.length > 0 ? `
        <div class="panel-section">
          <h3>同じタグのノート (${noteNeighbors.length})</h3>
          <div class="panel-note-list">${noteList}</div>
        </div>
      ` : ""}
    `;
  } else if (d.type === "tag") {
    content.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title">#${escapeHtml(d.label)}</h2>
        <p class="panel-tag-count">${noteNeighbors.length} ノート</p>
      </div>
      ${noteNeighbors.length > 0 ? `
        <div class="panel-section">
          <h3>ノート一覧</h3>
          <div class="panel-note-list">${noteList}</div>
        </div>
      ` : ""}
    `;
  }

  panel.hidden = false;
}

function closePanel() {
  const panel = document.getElementById("graph-panel");
  if (panel) panel.hidden = true;
}

function clearHighlights(cy) {
  cy.elements().removeClass("faded highlighted hover");
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
