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
  var lastBackPress = 0;

  // Video Seeking Variables
  var activeKey = null;
  var seekTimer = null;
  var seekLoop = null;
  var seekData = { active: false, speed: 1, direction: 1, video: null };

  // 3. Helper to find the video element, even inside iframes
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

  // Determines if the user is actually watching a video vs navigating the UI
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
      
      // Accelerate speed: start at 2x, smoothly ramp up to 30x
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

  // 5. Find focusable elements
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
    if (currentEl) currentEl.classList.remove('movitv-focused');
    currentEl = el;
    currentEl.classList.add('movitv-focused');
    currentEl.focus({ preventScroll: true });
    currentEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }

  // 6. Spatial navigation math
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
      var score = primaryDist + secondaryDist * 2.5;
      if (score < bestScore) { bestScore = score; bestEl = targetEl; }
    }
    if (bestEl) setFocus(bestEl);
  }

  // 7. Input Handlers
  function keydownHandler(e) {
    var code = e.keyCode;

    // LEFT (37) and RIGHT (39)
    if (code === 37 || code === 39) {
      var video = getActiveVideo();
      
      // If we are watching a video, hijack left/right for seeking
      if (isVideoFocusMode(video)) {
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

      // If no video is active, navigate the UI normally
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
      var now = Date.now();
      if (now - lastBackPress < 1500) {
        window.history.back();
      } else {
        lastBackPress = now;
        var escEvent = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true });
        document.dispatchEvent(escEvent);
      }
    }
    // CH UP (427 / 33) -> Jump to Search
    else if (code === 427 || code === 33) {
      e.preventDefault();
      var searchInput = document.querySelector('input[name="keyword"], input[type="text"][placeholder*="earch" i], a[href*="search"]');
      if (searchInput) setFocus(searchInput);
    }
    // CH DOWN (428 / 34) -> Toggle Fullscreen
    else if (code === 428 || code === 34) {
      e.preventDefault();
      var vid = getActiveVideo();
      if (vid) {
        // Fullscreen the container (so subtitles and controls stay visible), not just the raw video feed
        var container = vid.closest('.jwplayer, .plyr, .html5-video-player, iframe') || vid;
        if (!document.fullscreenElement) {
          if (container.requestFullscreen) container.requestFullscreen();
          else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
        } else {
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
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
          stopSeek(); // Was holding, stop the fast-forward
        } else if (seekData.video) {
          // Was just a quick tap (< 1.3s), trigger standard 10s skip
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

  // Attach to top document
  attachListeners(document);
  
  // Continually probe for new iframes and attach to them so we don't lose control
  setInterval(function() {
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      try {
        if (!frames[i].__movyTVAttached && frames[i].contentDocument) {
          attachListeners(frames[i].contentDocument);
          frames[i].__movyTVAttached = true;
        }
      } catch (err) {} // Ignore cross-origin frames we can't access
    }
  }, 2000);

  // 9. Initial Auto-Focus
  setTimeout(function () {
    var initial = getFocusableElements();
    if (initial.length) setFocus(initial[0]);
  }, 1500);
})();
