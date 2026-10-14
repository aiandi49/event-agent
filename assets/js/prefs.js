(function () {
  'use strict';
  var root = document.documentElement;
  var SIZE_NAMES = { sm: 'small', md: 'medium', lg: 'large', xl: 'extra large' };

  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  function syncSize() {
    var current = root.getAttribute('data-font-size') || 'sm';
    var buttons = document.querySelectorAll('.size-btn');
    for (var i = 0; i < buttons.length; i += 1) {
      var b = buttons[i];
      var size = b.getAttribute('data-size');
      var on = size === current;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', 'Text size ' + SIZE_NAMES[size] + (on ? ' (current)' : ''));
    }
  }

  function syncTheme() {
    var dark = root.getAttribute('data-theme') === 'dark';
    var btns = document.querySelectorAll('.theme-btn');
    for (var i = 0; i < btns.length; i += 1) {
      btns[i].setAttribute('aria-pressed', dark ? 'true' : 'false');
      btns[i].setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    }
  }

  document.addEventListener('click', function (e) {
    var sizeBtn = e.target.closest ? e.target.closest('.size-btn') : null;
    if (sizeBtn) {
      var size = sizeBtn.getAttribute('data-size');
      root.setAttribute('data-font-size', size);
      save('pref-font-size', size);
      syncSize();
      return;
    }
    var themeBtn = e.target.closest ? e.target.closest('.theme-btn') : null;
    if (themeBtn) {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      save('pref-theme', next);
      syncTheme();
    }
  });

  syncSize();
  syncTheme();
})();
