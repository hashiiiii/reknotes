// reknotes - app-wide utilities

// Kebab menu toggle (unified for note-card and note-detail)
function toggleKebab(btn) {
  var menu = btn.parentElement;
  var wasOpen = menu.classList.contains('open');
  document.querySelectorAll('.kebab-menu.open').forEach(function(m) { m.classList.remove('open'); });
  if (!wasOpen) menu.classList.add('open');
}

// Close kebab menus on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('.kebab-menu')) {
    document.querySelectorAll('.kebab-menu.open').forEach(function(m) { m.classList.remove('open'); });
  }
});

// File upload → Markdown insertion
function uploadAndInsert(file, textarea) {
  var formData = new FormData();
  formData.append('file', file);

  var placeholder = '![アップロード中...]()';
  var pos = textarea.selectionStart;
  var before = textarea.value.substring(0, pos);
  var after = textarea.value.substring(pos);
  var prefix = before && !before.endsWith('\n') ? '\n' : '';
  textarea.value = before + prefix + placeholder + '\n' + after;
  textarea.classList.add('uploading');

  return fetch('/api/upload', { method: 'POST', body: formData })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.error) {
        textarea.value = textarea.value.replace(prefix + placeholder + '\n', '');
        alert(data.error);
        return;
      }
      textarea.value = textarea.value.replace(placeholder, data.markdown);
      textarea.focus();
    })
    .catch(function() {
      textarea.value = textarea.value.replace(prefix + placeholder + '\n', '');
      alert('アップロードに失敗しました');
    })
    .finally(function() {
      textarea.classList.remove('uploading');
    });
}

// Drag & drop file upload for textareas
document.addEventListener('dragover', function(e) {
  if (e.target.closest('textarea')) e.preventDefault();
});
document.addEventListener('drop', function(e) {
  var ta = e.target.closest('textarea');
  if (!ta) return;
  var files = e.dataTransfer && e.dataTransfer.files;
  if (!files || files.length === 0) return;
  e.preventDefault();

  if (document.caretPositionFromPoint) {
    var cp = document.caretPositionFromPoint(e.clientX, e.clientY);
    if (cp && cp.offsetNode && ta.contains(cp.offsetNode)) {
      ta.selectionStart = ta.selectionEnd = cp.offset;
    }
  } else if (document.caretRangeFromPoint) {
    var range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (range) {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = range.startOffset;
    }
  }

  var queue = Promise.resolve();
  for (var i = 0; i < files.length; i++) {
    (function(f) {
      queue = queue.then(function() { return uploadAndInsert(f, ta); });
    })(files[i]);
  }
});

// Theme toggle
(function() {
  var root = document.documentElement;
  var btn = document.getElementById('theme-toggle');
  if (!btn) return;
  var iconDelay = parseInt(getComputedStyle(root).getPropertyValue('--transition-icon-delay')) || 200;

  var svgSun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  var svgMoon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>';
  var animating = false;

  function isDark() { return root.getAttribute('data-theme') !== 'light'; }

  function setIcon(svg, animate) {
    if (!animate) { btn.innerHTML = svg; return; }
    var old = btn.querySelector('svg');
    if (old) old.classList.add('icon-exit');
    setTimeout(function() {
      btn.innerHTML = svg;
      var next = btn.querySelector('svg');
      if (next) next.classList.add('icon-enter');
      animating = false;
    }, iconDelay);
  }

  btn.addEventListener('click', function() {
    if (animating) return;
    animating = true;
    // テーマ切替中は transition を無効化
    root.classList.add('no-transition');
    if (isDark()) {
      root.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    } else {
      root.removeAttribute('data-theme');
      localStorage.removeItem('theme');
    }
    root.offsetHeight;
    root.classList.remove('no-transition');
    setIcon(isDark() ? svgSun : svgMoon, true);
    if (window.reknotesCy && typeof GraphCommon !== 'undefined') {
      window.reknotesCy.style(GraphCommon.getThemedStyles());
      window.reknotesCy.style().update();
    }
  });

  setIcon(isDark() ? svgSun : svgMoon, false);
})();
