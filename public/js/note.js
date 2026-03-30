// reknotes - note detail page (edit mode + mini graph)

function enterEditMode() {
  document.getElementById('note-view').hidden = true;
  document.getElementById('note-edit').hidden = false;
  var graph = document.getElementById('note-graph');
  if (graph) graph.hidden = true;
}

function exitEditMode() {
  document.getElementById('note-view').hidden = false;
  document.getElementById('note-edit').hidden = true;
  var graph = document.getElementById('note-graph');
  if (graph) graph.hidden = false;
}

// Mini graph initialization (data is set via window globals from the template)
(function() {
  var container = document.getElementById('mini-graph-container');
  if (!container || !window.__reknotesMiniGraphData) return;

  var raw = window.__reknotesMiniGraphData;
  var currentId = window.__reknotesCurrentNoteId;

  var cy = cytoscape({
    container: container,
    elements: GraphCommon.toElements(raw),
    style: GraphCommon.stylesWithFocus(currentId),
    layout: { name: 'cose', animate: false, nodeDimensionsIncludeLabels: true, nodeRepulsion: function() { return 4000; }, padding: 20 },
    minZoom: 0.5, maxZoom: 2
  });
  GraphCommon.bindHover(cy, container);
  cy.on('tap', 'node[type="note"]', function(evt) {
    var id = evt.target.data('id').replace('note-', '');
    window.location.href = '/notes/' + id;
  });
})();
