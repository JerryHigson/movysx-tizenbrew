(function () {
  if (window.__movysxTVInitialized) return;
  window.__movysxTVInitialized = true;

  window.open = function () {
    console.log('[MovyTV] Blocked popup');
    return null;
  };

  // 1. Create the Virtual Cursor
  var cursor = document.createElement('div');
  cursor.id = 'movytv-cursor';
  cursor.style.cssText = 'position:fixed; z-index:2147483647; width:22px; height:22px; background-color:rgba(229, 9, 20, 0.95); border:3px solid white; border-radius:50%; pointer-events:none; top:50%; left:50%; transform:translate(-50%, -50%); transition: opacity 0.2s, transform 0.1s; box-shadow: 0 0 10px rgba(0,0,0,0.5);';
  document.body.appendChild(cursor);

  var cursorX = window.innerWidth / 2;
  var cursorY = window.innerHeight / 2;
  var cursorVisible = true;
  var wasWatchingVideo = false;

  var keys = { 37: false, 38: false, 39: false, 40: false };
  var currentSpeed = 6;
  var maxSpeed = 22;
  var lastBackPress = 0;

  // 2. Cursor Movement & Page Scrolling Engine
  function updateCursor() {
    if (cursorVisible) {
      var isMoving = keys[37] || keys[38] || keys[39] || keys[40];
      
      // Accelerate while holding a direction
      if (isMoving) {
        currentSpeed = Math.min(currentSpeed + 0.5, maxSpeed);
      } else {
        currentSpeed = 6;
      }

      if (keys[37]) cursorX -= currentSpeed;
      if (keys[39]) cursorX += currentSpeed;
      if (keys[38]) cursorY -= currentSpeed;
      if (keys[40]) cursorY += currentSpeed;

      // Keep cursor inside screen bounds
      cursorX = Math.max(0, Math.min(window.innerWidth, cursorX));
      cursorY = Math.max(0, Math.min(window.innerHeight, cursorY));
      
      cursor.style.left = cursorX + 'px';
      cursor.style.top = cursorY + 'px';

      // Edge Scrolling (push cursor against the edge to scroll the page)
      var scrollEdge = 40;
      if (cursorX < scrollEdge) window.scrollBy(-12, 0);
      if (cursorX > window.innerWidth - scrollEdge) window.scrollBy(12, 0);
      if (cursorY < scrollEdge) window.scrollBy(0, -12);
      if (cursorY > window.innerHeight - scrollEdge) window.scrollBy(0, 12);
    }
    requestAnimationFrame(updateCursor);
  }
  requestAnimationFrame(updateCursor);

  // 3. Video Seeking Engine
  var activeKey = null;
  var seekTimer = null;
  var seekLoop = null;
  var seekData = { active: false, speed: 1, direction: 1, video: null };

  function getActiveVideo() {
    var v = document.querySelector('video');
    if (v) return v;
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      try {
        v = frames[i].contentDocument.querySelector('video');
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

  // 4. Video Auto-Resume Saving
  var restoredVideos = new WeakMap();
  function getVideoKey() {
    try { return 'movytv_time_' + window.top.location.pathname; }
    catch (e) { return 'movytv_time_' + window.location.pathname; }
  }

  function handleVideoBackgroundTasks() {
    var v = getActiveVideo();
    var currentlyWatching = isVideoFocusMode(v);

    // Auto-Hide/Show Cursor when transitioning into/out of videos
    if (currentlyWatching && !wasWatchingVideo) {
      wasWatchingVideo = true;
      cursorVisible = false;
      cursor.style.opacity = '0';
      keys[37] = keys[38] = keys[39] = keys[40] = false; // Reset movement
    } else if (!currentlyWatching && wasWatchingVideo) {
      wasWatchingVideo = false;
      cursorVisible = true;
      cursor.style.opacity = '1';
    }

    // Auto-Resume Save Logic
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
        if (!v.duration || v.currentTime < v.duration - 30) localStorage.setItem(key, v.currentTime);
      }
    } catch (e) {}
  }
  setInterval(handleVideoBackgroundTasks, 1500);

  // 5. Input Handlers
  function keydownHandler(e) {
    if (document.hidden || window.innerWidth === 0 || document.body.clientWidth === 0) return; 

    var code = e.keyCode;
    var video = getActiveVideo();
    var inVideo = isVideoFocusMode(video);

    // Left (37), Up (38), Right (39), Down (40)
    if (code >= 37 && code <= 40) {
      
      // If watching video AND cursor is hidden, hijack Left/Right for seeking
      if (inVideo && !cursorVisible && (code === 37 || code === 39)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (activeKey !== code) {
          activeKey = code;
          seekData.video = video;
          seekData.direction = (code === 37) ? -1 : 1;
          seekData.speed = 2;
          seekTimer = setTimeout(startSeek, 1300);
        }
        return;
      }

      // Otherwise, move the cursor
      if (cursorVisible) {
        e.preventDefault();
        keys[code] = true;
      }
    } 
    // ENTER (13) -> Simulate Mouse Click
    else if (code === 13) {
      if (cursorVisible) {
        e.preventDefault();
        
        // Visual click feedback
        cursor.style.transform = 'translate(-50%, -50%) scale(0.6)';
        setTimeout(function() { cursor.style.transform = 'translate(-50%, -50%) scale(1)'; }, 150);

        // Find element under cursor and click it
        var target = document.elementFromPoint(cursorX, cursorY);
        
        // If clicking inside an iframe (like the video player controls)
        if (target && target.tagName.toLowerCase() === 'iframe') {
          try {
            var rect = target.getBoundingClientRect();
            target = target.contentDocument.elementFromPoint(cursorX - rect.left, cursorY - rect.top);
          } catch (err) {}
        }

        if (target) {
          target.focus();
          target.click();
        }
      }
    } 
    // BACK (10009)
    else if (code === 10009) {
      e.preventDefault();
      e.stopPropagation();
      
      var now = Date.now();
      
      // Double tap to leave the page
      if (now - lastBackPress < 1200) {
        window.history.back();
      } 
      // Single tap logic
      else {
        lastBackPress = now;
        
        if (inVideo) {
          // Toggle cursor visibility inside the video player
          cursorVisible = !cursorVisible;
          cursor.style.opacity = cursorVisible ? '1' : '0';
          
          if (!cursorVisible) {
            // Close player menus when hiding cursor
            var escEvent = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true });
            document.dispatchEvent(escEvent);
            keys[37] = keys[38] = keys[39] = keys[40] = false; // Stop drifting
          }
        }
      }
    }
    // PLAY/PAUSE (415)
    else if (code === 415 || code === 19 || code === 10252) {
      if (video) {
        e.preventDefault();
        if (video.paused) video.play();
        else video.pause();
      }
    }
  }

  function keyupHandler(e) {
    var code = e.keyCode;
    
    // Stop cursor movement
    if (code >= 37 && code <= 40) {
      keys[code] = false;
    }

    // Stop seeking
    if (!cursorVisible && (code === 37 || code === 39)) {
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

  // 6. Listener Attachment Engine
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

})();
