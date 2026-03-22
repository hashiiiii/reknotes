// reknotes - knowledge graph visualization (Cytoscape.js)
document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("graph-container");
  if (!container) return;

  fetch("/api/graph")
    .then((r) => r.json())
    .then((data) => initGraph(container, data));
});

function initGraph(container, data) {
  // force-graph 形式 → Cytoscape elements に変換
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

  for (const link of data.links) {
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
      // ── ノート ノード ──
      {
        selector: 'node[type="note"]',
        style: {
          label: "data(label)",
          "background-color": "#6bb873",
          width: "mapData(val, 1, 10, 16, 36)",
          height: "mapData(val, 1, 10, 16, 36)",
          "font-size": "10px",
          color: "#a9a49a",
          "text-valign": "bottom",
          "text-margin-y": 4,
          "text-max-width": "90px",
          "text-wrap": "ellipsis",
          "border-width": 1.5,
          "border-color": "#4a9952",
          "text-outline-color": "#191816",
          "text-outline-width": 2,
          "overlay-opacity": 0,
        },
      },
      // ── タグ ノード ──
      {
        selector: 'node[type="tag"]',
        style: {
          label: "data(label)",
          shape: "round-diamond",
          "background-color": "#7e7a71",
          width: "mapData(val, 1, 10, 12, 30)",
          height: "mapData(val, 1, 10, 12, 30)",
          "font-size": "9px",
          color: "#5c5850",
          "text-valign": "bottom",
          "text-margin-y": 4,
          "text-outline-color": "#191816",
          "text-outline-width": 2,
          "overlay-opacity": 0,
        },
      },
      // ── 選択中 ──
      {
        selector: "node:selected",
        style: {
          "border-width": 3,
          "border-color": "#8dd498",
          "background-color": "#e7e2d8",
          "overlay-opacity": 0,
          width: "mapData(val, 1, 10, 24, 44)",
          height: "mapData(val, 1, 10, 24, 44)",
        },
      },
      // ── ハイライト（クリック選択） ──
      {
        selector: "node.highlighted",
        style: {
          "border-width": 3,
          "border-color": "#8dd498",
          "background-color": "#e7e2d8",
          "background-opacity": 1,
          "overlay-opacity": 0,
          width: "mapData(val, 1, 10, 24, 44)",
          height: "mapData(val, 1, 10, 24, 44)",
        },
      },
      // ── フェード ──
      {
        selector: "node.faded",
        style: {
          opacity: 0.1,
        },
      },
      {
        selector: "edge.faded",
        style: {
          opacity: 0.05,
        },
      },
      // ── note-note エッジ ──
      {
        selector: 'edge[type="link"]',
        style: {
          "line-color": "#6bb873",
          width: 1.5,
          "curve-style": "bezier",
          opacity: 0.3,
        },
      },
      // ── note-tag エッジ ──
      {
        selector: 'edge[type="tag"]',
        style: {
          "line-color": "#5c5850",
          width: 0.8,
          "line-style": "dashed",
          "curve-style": "bezier",
          opacity: 0.2,
        },
      },
      {
        selector: "edge.highlighted",
        style: {
          opacity: 0.8,
          width: 2,
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

  // ハイライト: 選択ノードだけ光らせる（関連ノードはフェードしない程度）
  clearHighlights(cy);
  cy.elements().addClass("faded");
  node.removeClass("faded").addClass("highlighted");
  node.connectedEdges().removeClass("faded");
  node.neighborhood("node").removeClass("faded");

  const d = node.data();

  // 関連ノート一覧を生成（共通）
  const noteNeighbors = node.neighborhood('node[type="note"]');
  const noteList = noteNeighbors
    .map((n) => {
      const nd = n.data();
      return `<a href="/notes/${nd.id.replace("note-", "")}" class="panel-note-link">
        <span class="panel-note-title">${nd.label}</span>
        <span class="panel-note-date">${formatDate(nd.created_at)}</span>
      </a>`;
    })
    .join("");

  if (d.type === "note") {
    content.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title">${d.label}</h2>
        <time class="panel-date">${formatDate(d.created_at)}</time>
      </div>
      ${d.snippet ? `<p class="panel-snippet">${escapeHtml(d.snippet)}...</p>` : ""}
      <a href="/notes/${d.id.replace("note-", "")}" class="btn btn-primary panel-open-btn">ノートを開く</a>
      ${noteNeighbors.length > 0 ? `
        <div class="panel-section">
          <h3>関連ノート (${noteNeighbors.length})</h3>
          <div class="panel-note-list">${noteList}</div>
        </div>
      ` : ""}
    `;
  } else if (d.type === "tag") {
    content.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title">#${d.label}</h2>
      </div>
      ${noteNeighbors.length > 0 ? `
        <div class="panel-section">
          <h3>関連ノート (${noteNeighbors.length})</h3>
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
  cy.elements().removeClass("faded highlighted");
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
