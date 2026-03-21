// knowmap - knowledge graph visualization
document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("graph-container");
  if (!container) return;

  fetch("/api/graph")
    .then((r) => r.json())
    .then((data) => {
      const graph = new ForceGraph(container)
        .graphData(data)
        .nodeLabel("label")
        .nodeColor((node) =>
          node.type === "tag" ? "#f39c12" : "#3498db"
        )
        .nodeVal("val")
        .linkColor((link) =>
          link.type === "tag" ? "#ddd" : "#999"
        )
        .linkWidth((link) => (link.type === "link" ? 2 : 1))
        .onNodeClick((node) => {
          if (node.type === "note") {
            window.location.href = "/notes/" + node.id.replace("note-", "");
          } else if (node.type === "tag") {
            window.location.href = "/tags/" + node.label;
          }
        })
        .width(container.clientWidth)
        .height(container.clientHeight);

      window.addEventListener("resize", () => {
        graph.width(container.clientWidth).height(container.clientHeight);
      });
    });
});
