// reknotes - shared graph styles and utilities

var GraphCommon = (function () {
  // CSS変数から現在のテーマ色を取得
  function cv(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ── テーマ対応スタイル生成 ──
  function buildStyles() {
    var accent = cv('--accent') || '#6bb873';
    var accentHover = cv('--accent-hover') || '#8dd498';
    var fg = cv('--fg') || '#e7e2d8';
    var bg = cv('--bg') || '#191816';
    var muted = cv('--muted') || '#7e7a71';
    var textSec = cv('--text-secondary') || '#a9a49a';
    var tagBg = cv('--muted') || '#c8c2b4';
    var tagBorder = cv('--muted') || '#a9a49a';

    return [
      // ノート ノード（小さめ・ラベル常時表示）
      {
        selector: 'node[type="note"]',
        style: {
          label: "data(label)",
          "background-color": accent,
          width: "mapData(val, 1, 10, 10, 22)",
          height: "mapData(val, 1, 10, 10, 22)",
          "font-size": "8px",
          color: muted,
          "text-valign": "bottom",
          "text-margin-y": 4,
          "text-outline-color": bg,
          "text-outline-width": 2,
          "text-max-width": "80px",
          "text-wrap": "ellipsis",
          "border-width": 0,
          opacity: 0.75,
          "overlay-opacity": 0,
        },
      },
      // タグ ノード（大きめ・目立つ道標）
      {
        selector: 'node[type="tag"]',
        style: {
          label: "data(label)",
          shape: "round-diamond",
          "background-color": tagBg,
          width: "mapData(val, 1, 10, 24, 52)",
          height: "mapData(val, 1, 10, 24, 52)",
          "font-size": "11px",
          "font-weight": "bold",
          color: fg,
          "text-valign": "bottom",
          "text-margin-y": 5,
          "text-outline-color": bg,
          "text-outline-width": 2,
          "border-width": 1.5,
          "border-color": tagBorder,
          "overlay-opacity": 0,
        },
      },
      // ノートのホバー
      {
        selector: 'node[type="note"].hover',
        style: {
          opacity: 1,
          "background-color": accentHover,
          color: fg,
          "z-index": 999,
        },
      },
      // タグのホバー
      {
        selector: 'node[type="tag"].hover',
        style: {
          "background-color": fg,
          "border-color": accentHover,
          color: fg,
          "z-index": 999,
        },
      },
      // ハイライト（クリック選択）
      {
        selector: "node.highlighted",
        style: {
          "background-color": "#f0a45a",
          "border-width": 3,
          "border-color": "#f5c16c",
          opacity: 1,
          color: "#f5c16c",
          "z-index": 999,
        },
      },
      // フェード
      {
        selector: "node.faded",
        style: { opacity: 0.08 },
      },
      {
        selector: "edge.faded",
        style: { opacity: 0.08 },
      },
      // エッジ
      {
        selector: 'edge[type="tag"]',
        style: {
          "line-color": muted,
          width: 1.0,
          "curve-style": "bezier",
          opacity: 0.45,
        },
      },
      {
        selector: "edge.highlighted",
        style: {
          opacity: 0.7,
          width: 1.5,
          "line-color": "#f0a45a",
        },
      },
    ];
  }

  // 特定ノードをハイライトするスタイルを追加（ミニグラフ用）
  function stylesWithFocus(focusNodeId) {
    return buildStyles().concat([
      {
        selector: "#" + CSS.escape(focusNodeId),
        style: {
          "background-color": "#f0a45a",
          "border-color": "#f5c16c",
          "border-width": 3,
          opacity: 1,
          color: "#f5c16c",
          "overlay-opacity": 0,
          "z-index": 999,
        },
      },
      {
        selector: 'edge[source = "' + focusNodeId + '"], edge[target = "' + focusNodeId + '"]',
        style: {
          "line-color": "#f0a45a",
          width: 1.5,
          opacity: 0.7,
        },
      },
    ]);
  }

  // data → cytoscape elements に変換
  function toElements(data) {
    var elements = [];
    for (var i = 0; i < data.nodes.length; i++) {
      var node = data.nodes[i];
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
    var nodeIds = new Set(data.nodes.map(function (n) { return n.id; }));
    for (var j = 0; j < data.links.length; j++) {
      var link = data.links[j];
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
    return elements;
  }

  // ホバーイベントをバインド
  function bindHover(cy, container) {
    cy.on("mouseover", "node", function (evt) {
      evt.target.addClass("hover");
      container.style.cursor = "pointer";
    });
    cy.on("mouseout", "node", function (evt) {
      evt.target.removeClass("hover");
      container.style.cursor = "default";
    });
  }

  function clearHighlights(cy) {
    cy.elements().removeClass("faded highlighted hover");
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    var d = new Date(dateStr);
    return d.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    baseStyles: buildStyles(),
    getThemedStyles: buildStyles,
    stylesWithFocus: stylesWithFocus,
    toElements: toElements,
    bindHover: bindHover,
    clearHighlights: clearHighlights,
    formatDate: formatDate,
    escapeHtml: escapeHtml,
  };
})();
