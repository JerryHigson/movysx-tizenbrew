(function () {
  if (window.__movysxTVInitialized) return;
  window.__movysxTVInitialized = true;

  // 1. Block ad popups
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
  var lastBackPress = 0;

  // Video Seeking Variables
  var activeKey = null;
  var seekTimer = null;
  var seekLoop = null;
  var seekData = { active: false, speed: 1, direction: 1, video: null };

  // --- NEW: Video Progress Saving ---
  var restoredVideos = new WeakMap();

  function getVideoKey() {
    try { return 'movytv_time_' + window.top.location.pathname; }
    catch (e) { return 'movytv_time_' + window.location.pathname; }
  }

  function handleVideoProgress() {
    var v = document.querySelector('video');
    if (!v) {
      var frames = document.querySelectorAll('iframe');
      for (var i = 0; i < frames.length; i++) {
        try {
          var iv = frames[i].contentDocument.querySelector('video');
          if (iv) { v = iv; break; }
        } catch (e) {}
      }
    }
    if (!v) return;

    var key = getVideoKey();
    
    if (!restoredVideos.has(v)) {
      restoredVideos.set(v, true);
      try {
        var saved = localStorage.getItem(key);
        if (saved) {
          var t = parseFloat(saved);
          if (t > 15) {
            var attemptRestore = function() { if (v.duration && t < v.duration - 30) v.currentTime = t; };
            if (v.readyState >= 1) attemptRestore();
            else v.addEventListener('loadedmetadata', attemptRestore);
          }
        }
      } catch (e) {}
    }
    
    try {
      if (!v.paused && v.currentTime > 15) {
        if (!v.duration || v.currentTime < v.duration - 30) {
          localStorage.setItem(key, v.currentTime);
        }
      }
    } catch (e) {}
  }

  setInterval(handleVideoProgress, 2000);
  // --- END NEW ---

  // 3. Helper to find the video element
  function getActiveVideo() {
    var v = document.querySelector('video');
    if (v) return v;
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        v = iframes[i].contentDocument.querySelector('video');
        if (v) return v;
      } catch (e) {}
    }
    return null;
  }

  function isVideoFocusMode(v) {
    if (!v) return false;
    if (document.fullscreenElement) return true;
    var rect = v.getBoundingClientRect();
    return (rect.height > window.innerHeight * 0.4);
  }

  // 4. Smooth Fast-Forward Engine
  function startSeek() {
    if (!seekData.video) return;
    seekData.active = true;
    var lastTime = performance.now();
    function loop(time) {
      if (!seekData.active) return;
      var dt = (time - lastTime) / 1000;
      lastTime = time;
      seekData.speed = Math.min(seekData.speed + (dt * 12), 30);
      seekData.video.currentTime += seekData.direction * seekData.speed * dt;
      seekLoop = requestAnimationFrame(loop);
    }
    seekLoop = requestAnimationFrame(loop);
  }

  function stopSeek() {
    seekData.active = false;
    if (seekLoop) cancelAnimationFrame(seekLoop);
    seekLoop = null;
    seekData.speed = 1;
  }

  // 5. Find focusable elements (ADDED specific player menu classes for OpenSubtitles)
  function getFocusableElements() {
    var candidates = document.querySelectorAll(
      'a[href], button, input, select, [role="button"], [role="menuitem"], [role="menuitemradio"], [tabindex]:not([tabindex="-1"]), .film-poster, .movie-item, .jw-settings-item, .jw-settings-content-item, .jw-radio, .vjs-menu-item, [class*="search-btn"], [class*="btn-search"], [class*="os-search"], [class*="cc-search"]'
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
    if (currentEl) currentEl.classList.remove('movitv-focused');
    currentEl = el;
    currentEl.classList.add('movitv-focused');
    currentEl.focus({ preventScroll: true });
    currentEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }

  // 6. Spatial navigation math (Reverted exactly to your working v1.1.0 logic)
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
    var bestEl = null, bestScore = Infinity;

    for (var i = 0; i < elements.length; i++) {
      var targetEl = elements[i];
      if (targetEl === currentEl) continue;

      var dst = targetEl.getBoundingClientRect();
      var dstX = dst.left + dst.width / 2;
      var dstY = dst.top + dst.height / 2;
      var dx = dstX - srcX, dy = dstY - srcY;
      var inDirection = false, primaryDist = 0, secondaryDist = 0;

      if (direction === 'left' && dx < -10) { inDirection = true; primaryDist = Math.abs(dx); secondaryDist = Math.abs(dy); }
      else if (direction === 'right' && dx > 10) { inDirection = true; primaryDist = Math.abs(dx); secondaryDist = Math.abs(dy); }
      else if (direction === 'up' && dy < -10) { inDirection = true; primaryDist = Math.abs(dy); secondaryDist = Math.abs(dx); }
      else if (direction === 'down' && dy > 10) { inDirection = true; primaryDist = Math.abs(dy); secondaryDist = Math.abs(dx); }

      if (!inDirection) continue;
      
      // Restored the working 2.5 multiplier
      var score = primaryDist + secondaryDist * 2.5;
      if (score < bestScore) { bestScore = score; bestEl = targetEl; }
    }
    if (bestEl) setFocus(bestEl);
  }

  // 7. Input Handlers
  function keydownHandler(e) {
    // --- BUG FIX: Stop stealing keys when in the background ---
    if (document.hidden || window.innerWidth === 0 || document.body.clientWidth === 0) return; 

    var code = e.keyCode;

    // LEFT (37) and RIGHT (39)
    if (code === 37 || code === 39) {
      var video = getActiveVideo();
      
      // Safety check: Are you highlighting a button inside a menu right now?
      var isUIFocused = currentEl && currentEl.tagName.toLowerCase() !== 'video' && currentEl.tagName.toLowerCase() !== 'body';
      
      // ONLY seek if watching video AND no UI elements are focused
      if (isVideoFocusMode(video) && !isUIFocused) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (activeKey !== code) {
          activeKey = code;
          seekData.video = video;
          seekData.direction = (code === 37) ? -1 : 1;
          seekData.speed = 2;
          seekTimer = setTimeout(startSeek, 1300); // 1.3s threshold
        }
        return; 
      }

      // Otherwise, navigate the UI normally
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      moveFocus(code === 37 ? 'left' : 'right');
    }
    // UP (38) and DOWN (40)
    else if (code === 38 || code === 40) {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      moveFocus(code === 38 ? 'up' : 'down');
    }
    // ENTER (13)
    else if (code === 13) {
      if (currentEl && document.activeElement !== currentEl) {
        e.preventDefault();
        currentEl.click();
      }
    }
    // BACK (10009)
    else if (code === 10009) {
      e.preventDefault(); e.stopPropagation();
      
      // --- BUG FIX: Clear focus box before closing menus or going back ---
      if (currentEl) {
        currentEl.classList.remove('movitv-focused');
        currentEl = null;
      }
      
      var now = Date.now();
      if (now - lastBackPress < 1500) {
        window.history.back(); // Double tap to exit
      } else {
        lastBackPress = now;
        var escEvent = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true });
        document.dispatchEvent(escEvent); // Single tap closes menus
      }
    }
    // PLAY/PAUSE/REW/FF
    else if (code === 415 || code === 19 || code === 10252) {
      var v2 = getActiveVideo();
      if (v2) {
        e.preventDefault();
        if (v2.paused) v2.play();
        else v2.pause();
      }
    }
  }

  function keyupHandler(e) {
    var code = e.keyCode;
    // Release hold for Left/Right
    if (code === 37 || code === 39) {
      if (activeKey === code) {
        activeKey = null;
        clearTimeout(seekTimer);
        
        if (seekData.active) {
          stopSeek();
        } else if (seekData.video) {
          seekData.video.currentTime += (code === 37 ? -10 : 10);
        }
        
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    }
  }

  // 8. Event Listener Attachment Engine
  function attachListeners(doc) {
    doc.addEventListener('keydown', keydownHandler, true);
    doc.addEventListener('keyup', keyupHandler, true);
  }

  attachListeners(document);
  
  setInterval(function() {
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      try {
        if (!frames[i].__movyTVAttached && frames[i].contentDocument) {
          attachListeners(frames[i].contentDocument);
          frames[i].__movyTVAttached = true;
        }
      } catch (err) {} 
    }
  }, 2000);

  // 9. Initial Auto-Focus
  setTimeout(function () {
    var initial = getFocusableElements();
    if (initial.length) setFocus(initial[0]);
  }, 1500);
})();
