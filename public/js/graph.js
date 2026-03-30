// reknotes - knowledge graph visualization (Cytoscape.js)
// Depends on: graph-common.js (loaded before this script)

document.addEventListener("DOMContentLoaded", function () {
  var container = document.getElementById("graph-container");
  if (!container) return;

  fetch("/api/graph")
    .then(function (r) { return r.json(); })
    .then(function (data) { initGraph(container, data); });
});

function initGraph(container, data) {
  var cy = cytoscape({
    container: container,
    elements: GraphCommon.toElements(data),
    style: GraphCommon.baseStyles,
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

  window.reknotesCy = cy;
  GraphCommon.bindHover(cy, container);

  function dismissPanel() {
    closePanel();
    GraphCommon.clearHighlights(cy);
    var url = new URL(window.location);
    url.searchParams.delete("node");
    history.pushState({}, "", url);
  }

  cy.on("tap", "node", function (evt) {
    var node = evt.target;
    showPanel(cy, node, data);
    var url = new URL(window.location);
    url.searchParams.set("node", node.data().id);
    history.pushState({ nodeId: node.data().id }, "", url);
  });

  cy.on("tap", function (evt) {
    if (evt.target === cy) dismissPanel();
  });

  var closeBtn = document.getElementById("panel-close");
  if (closeBtn) closeBtn.addEventListener("click", dismissPanel);

  window.addEventListener("popstate", function (evt) {
    var nodeId = evt.state && evt.state.nodeId;
    if (nodeId) {
      var node = cy.getElementById(nodeId);
      if (node.length) showPanel(cy, node, data);
    } else {
      closePanel();
      GraphCommon.clearHighlights(cy);
    }
  });

  var initNodeId = new URL(window.location).searchParams.get("node");
  if (initNodeId) {
    var node = cy.getElementById(initNodeId);
    if (node.length) {
      showPanel(cy, node, data);
      history.replaceState({ nodeId: initNodeId }, "");
    }
  }

  window.addEventListener("resize", function () { cy.resize(); });
}

// ── パネル表示 ──
function showPanel(cy, node, data) {
  var panel = document.getElementById("graph-panel");
  var content = document.getElementById("panel-content");
  if (!panel || !content) return;

  GraphCommon.clearHighlights(cy);
  cy.elements().addClass("faded");
  node.removeClass("faded").addClass("highlighted");
  node.connectedEdges().removeClass("faded").addClass("highlighted");
  node.neighborhood("node").removeClass("faded");

  var d = node.data();

  var noteNeighbors = node.neighborhood('node[type="note"]');
  var noteList = noteNeighbors
    .map(function (n) {
      var nd = n.data();
      return '<a href="/notes/' + nd.id.replace("note-", "") + '" class="panel-note-link">' +
        '<span class="panel-note-title">' + GraphCommon.escapeHtml(nd.label) + '</span>' +
        '<span class="panel-note-date">' + GraphCommon.formatDate(nd.created_at) + '</span>' +
        '</a>';
    })
    .join("");

  if (d.type === "note") {
    content.innerHTML =
      '<div class="panel-header">' +
        '<h2 class="panel-title">' + GraphCommon.escapeHtml(d.label) + '</h2>' +
        '<time class="panel-date">' + GraphCommon.formatDate(d.created_at) + '</time>' +
      '</div>' +
      (d.snippet ? '<p class="panel-snippet">' + GraphCommon.escapeHtml(d.snippet) + '...</p>' : '') +
      '<a href="/notes/' + d.id.replace("note-", "") + '" class="btn btn-primary panel-open-btn">ノートを開く</a>' +
      (noteNeighbors.length > 0
        ? '<div class="panel-section"><h3>同じタグのノート (' + noteNeighbors.length + ')</h3><div class="panel-note-list">' + noteList + '</div></div>'
        : '');
  } else if (d.type === "tag") {
    content.innerHTML =
      '<div class="panel-header">' +
        '<h2 class="panel-title">#' + GraphCommon.escapeHtml(d.label) + '</h2>' +
        '<p class="panel-tag-count">' + noteNeighbors.length + ' ノート</p>' +
      '</div>' +
      (noteNeighbors.length > 0
        ? '<div class="panel-section"><h3>ノート一覧</h3><div class="panel-note-list">' + noteList + '</div></div>'
        : '');
  }

  panel.hidden = false;
}

function closePanel() {
  var panel = document.getElementById("graph-panel");
  if (panel) panel.hidden = true;
}
