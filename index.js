(function () {
  if (window.__movysxTVInitialized) return;
  window.__movysxTVInitialized = true;

  // 1. Block ad popups / new tab redirects
  window.open = function () {
    console.log('[MovyTV] Blocked popup');
    return null;
  };

  // 2. Inject Netflix-style TV UI & Focus Ring CSS
  var style = document.createElement('style');
  style.textContent = [
    'html, body { scroll-behavior: smooth !important; overflow-x: hidden !important; }',
    '::-webkit-scrollbar { display: none !important; }',
    '.movitv-focused {',
    '  outline: 4px solid #E50914 !important;',
    '  outline-offset: 4px !important;',
    '  box-shadow: 0 0 24px rgba(229, 9, 20, 0.85) !important;',
    '  transform: scale(1.06) !important;',
    '  transition: transform 0.15s ease, box-shadow 0.15s ease !important;',
    '  z-index: 9999 !important;',
    '  position: relative !important;',
    '  border-radius: 6px !important;',
    '}'
  ].join('\n');
  (document.head || document.documentElement).appendChild(style);

  var currentEl = null;

  // 3. Find all visible clickable elements (posters, links, buttons, inputs)
  function getFocusableElements() {
    var candidates = document.querySelectorAll(
      'a[href], button, input, select, [role="button"], [tabindex]:not([tabindex="-1"]), .film-poster, .movie-item'
    );
    var visible = [];
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.offsetParent === null || el.disabled) continue;
      var rect = el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) continue;
      visible.push(el);
    }
    return visible;
  }

  function setFocus(el) {
    if (!el) return;
    if (currentEl) {
      currentEl.classList.remove('movitv-focused');
    }
    currentEl = el;
    currentEl.classList.add('movitv-focused');
    currentEl.focus({ preventScroll: true });
    currentEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }

  // 4. Spatial navigation math (nearest element in D-pad direction)
  function moveFocus(direction) {
    var elements = getFocusableElements();
    if (!elements.length) return;

    if (!currentEl || !document.body.contains(currentEl)) {
      setFocus(elements[0]);
      return;
    }

    var src = currentEl.getBoundingClientRect();
    var srcX = src.left + src.width / 2;
    var srcY = src.top + src.height / 2;

    var bestEl = null;
    var bestScore = Infinity;

    for (var i = 0; i < elements.length; i++) {
      var targetEl = elements[i];
      if (targetEl === currentEl) continue;

      var dst = targetEl.getBoundingClientRect();
      var dstX = dst.left + dst.width / 2;
      var dstY = dst.top + dst.height / 2;

      var dx = dstX - srcX;
      var dy = dstY - srcY;

      var inDirection = false;
      var primaryDist = 0;
      var secondaryDist = 0;

      if (direction === 'left' && dx < -10) {
        inDirection = true;
        primaryDist = Math.abs(dx);
        secondaryDist = Math.abs(dy);
      } else if (direction === 'right' && dx > 10) {
        inDirection = true;
        primaryDist = Math.abs(dx);
        secondaryDist = Math.abs(dy);
      } else if (direction === 'up' && dy < -10) {
        inDirection = true;
        primaryDist = Math.abs(dy);
        secondaryDist = Math.abs(dx);
      } else if (direction === 'down' && dy > 10) {
        inDirection = true;
        primaryDist = Math.abs(dy);
        secondaryDist = Math.abs(dx);
      }

      if (!inDirection) continue;

      var score = primaryDist + secondaryDist * 2.5;
      if (score < bestScore) {
        bestScore = score;
        bestEl = targetEl;
      }
    }

    if (bestEl) {
      setFocus(bestEl);
    }
  }

  // 5. Samsung TV Remote Key Handler
  document.addEventListener(
    'keydown',
    function (e) {
      var code = e.keyCode;

      if (code === 37) {
        e.preventDefault();
        moveFocus('left');
      } else if (code === 38) {
        e.preventDefault();
        moveFocus('up');
      } else if (code === 39) {
        e.preventDefault();
        moveFocus('right');
      } else if (code === 40) {
        e.preventDefault();
        moveFocus('down');
      } else if (code === 13) {
        if (currentEl && document.activeElement !== currentEl) {
          e.preventDefault();
          currentEl.click();
        }
      } else if (code === 10009) {
        e.preventDefault();
        window.history.back();
      } else if (code === 415 || code === 19 || code === 10252) {
        var video = document.querySelector('video');
        if (video) {
          e.preventDefault();
          if (video.paused) video.play();
          else video.pause();
        }
      }
    },
    true
  );

  // 6. Auto-focus first element once page loads
  setTimeout(function () {
    var initial = getFocusableElements();
    if (initial.length) setFocus(initial[0]);
  }, 1500);
})();
