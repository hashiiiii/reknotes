// reknotes - home page (compose bar + masonry grid)

function expandCompose() {
  document.getElementById('compose-trigger').hidden = true;
  document.getElementById('compose-body').hidden = false;
  document.querySelector('.compose-title').focus();
  var textarea = document.getElementById('compose-textarea');
  textarea.addEventListener('input', function() {
    document.getElementById('preview-btn').disabled = !this.value.trim();
  });
}

function collapseCompose(form) {
  form.reset();
  document.getElementById('compose-trigger').hidden = false;
  document.getElementById('compose-body').hidden = true;
  document.getElementById('compose-preview').style.display = 'none';
  document.getElementById('compose-textarea').style.display = '';
  document.getElementById('preview-btn').textContent = 'プレビュー';
}

function togglePreview() {
  var textarea = document.getElementById('compose-textarea');
  var preview = document.getElementById('compose-preview');
  var btn = document.getElementById('preview-btn');
  var showing = preview.style.display === 'block';
  if (!showing) {
    var body = textarea.value;
    var fd = new FormData();
    fd.append('body', body);
    fetch('/api/notes/preview', { method: 'POST', body: fd })
      .then(function(r) { return r.text(); })
      .then(function(html) {
        preview.innerHTML = html;
        textarea.style.display = 'none';
        preview.style.display = 'block';
        btn.textContent = '編集に戻る';
      });
  } else {
    preview.style.display = 'none';
    textarea.style.display = '';
    btn.textContent = 'プレビュー';
  }
}

// Masonry layout engine
(function() {
  var grid = document.getElementById('note-grid');
  if (!grid) return;

  var GAP = 12;
  var colHeights = [];
  var placed = new WeakSet();
  var currentCols = 0;

  function colCount() {
    var w = grid.clientWidth;
    return w <= 480 ? 1 : w <= 768 ? 2 : 3;
  }

  function placeNew() {
    var cols = colCount();
    var colW = (grid.clientWidth - GAP * (cols - 1)) / cols;

    var newCards = [];
    grid.querySelectorAll('.note-card').forEach(function(card) {
      if (!placed.has(card)) newCards.push(card);
    });
    if (newCards.length === 0) return;

    newCards.forEach(function(card) { card.style.width = colW + 'px'; });
    grid.offsetHeight;

    // Pass 1: read all heights (before any writes dirty the layout)
    var heights = newCards.map(function(card) { return card.offsetHeight; });

    // Pass 2: write positions using cached heights
    newCards.forEach(function(card, idx) {
      var min = 0;
      for (var i = 1; i < cols; i++) {
        if (colHeights[i] < colHeights[min]) min = i;
      }
      card.style.left = min * (colW + GAP) + 'px';
      card.style.top = colHeights[min] + 'px';
      card.style.visibility = 'visible';
      colHeights[min] += heights[idx] + GAP;
      placed.add(card);
    });

    var maxH = Math.max.apply(null, colHeights.concat(0));
    grid.style.height = maxH + 'px';
    var sentinel = grid.querySelector('.note-grid-sentinel');
    if (sentinel) sentinel.style.top = maxH + 'px';
  }

  function fullLayout() {
    var cols = colCount();
    currentCols = cols;
    colHeights = [];
    for (var i = 0; i < cols; i++) colHeights[i] = 0;
    placed = new WeakSet();
    placeNew();
  }

  fullLayout();

  document.fonts.ready.then(function() {
    var scrollY = window.scrollY;
    fullLayout();
    window.scrollTo(0, scrollY);
  });

  document.body.addEventListener('htmx:beforeSwap', function(e) {
    if (e.detail.requestConfig && e.detail.requestConfig.verb === 'delete') {
      requestAnimationFrame(fullLayout);
    }
  });

  document.body.addEventListener('htmx:afterSettle', function(e) {
    var hasUnplaced = false;
    grid.querySelectorAll('.note-card').forEach(function(card) {
      if (!placed.has(card)) hasUnplaced = true;
    });
    if (!hasUnplaced) return;

    if (e.detail.target === grid) {
      fullLayout();
    } else {
      if (colCount() !== currentCols) { fullLayout(); return; }
      placeNew();
    }
  });

  window.addEventListener('resize', fullLayout);
})();
