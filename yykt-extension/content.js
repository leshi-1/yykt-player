(function() {
  'use strict';

  // ===== LAST VIDEO RESUME =====
  // Save last video URL on video pages
  if (location.href.indexOf('fsresource') >= 0) {
    try { localStorage.__yykt_last_video = location.href; } catch(e) {}
  }

  // Redirect to last video if on homepage and not already redirected this session
  var isHomePage = location.pathname === '/' || location.pathname === '' ||
                   location.href === 'https://courses.gdut.edu.cn/' ||
                   location.pathname.indexOf('/my') >= 0 ||
                   location.pathname.indexOf('/dashboard') >= 0;
  if (isHomePage && !sessionStorage.__yykt_redirected) {
    var lastUrl = '';
    try { lastUrl = localStorage.__yykt_last_video || ''; } catch(e) {}
    if (lastUrl && lastUrl.indexOf('fsresource') >= 0) {
      sessionStorage.__yykt_redirected = '1';
      location.replace(lastUrl);
      return;
    }
  }

  // Video page? If redirected from homepage, clear the flag
  if (location.href.indexOf('fsresource') >= 0) {
    sessionStorage.__yykt_redirected = '';
  }

  // ===== ONLY FULL MODE ON VIDEO PAGES =====
  var isVideoPage = location.href.indexOf('fsresource') >= 0;
  if (!isVideoPage) return;

  // ===== BELOW THIS LINE: VIDEO PAGE ONLY =====

  // State bar
  var bar = document.createElement('div');
  bar.id = 'yykt_bar';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;' +
    'background:#0d1117;color:#eee;font-size:12px;padding:6px 14px;' +
    'font-family:sans-serif;display:flex;align-items:center;gap:10px;';
  bar.innerHTML = '<b style="color:#58a6ff;">YYKT</b> <span id="y_msg">init</span>' +
    '<span style="flex:1;"></span><span id="y_time"></span>';
  document.body.prepend(bar);

  function log(s) { var e = document.getElementById('y_msg'); if (e) e.textContent = s; }
  function timeStr(t) {
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  // ===== FIND VIDEO =====
  var video = null;
  var holding = false;
  var holdTimer = null;
  var nextTriggered = false;

  function findVideo(retry) {
    retry = retry || 0;
    var v = document.querySelector('video');
    if (v && v.offsetWidth > 0) { setup(v); return; }

    var ifs = document.querySelectorAll('iframe');
    for (var i = 0; i < ifs.length; i++) {
      try {
        var d = ifs[i].contentDocument || ifs[i].contentWindow.document;
        v = d && d.querySelector('video');
        if (v && v.offsetWidth > 0) { setup(v); return; }
      } catch(e) {}
    }

    if (retry < 25) {
      setTimeout(function() { findVideo(retry + 1); }, 1000);
      if (retry % 3 === 0) log('looking for video...');
    } else {
      log('no video found');
    }
  }

  function setup(v) {
    video = v;
    log('video found');

    // Prevent browser from suspending video when minimized
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    // Register as active media to hint browser
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }

    v.muted = true;
    var p = v.play();
    if (p && p.then) {
      p.then(function() { log('auto-playing'); })
       .catch(function() { log('click to start'); });
    }

    v.addEventListener('play',  function() {
      log('playing');
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    });
    v.addEventListener('pause', function() {
      log('paused');
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      // Auto-resume if unexpectedly paused (browser throttling)
      if (!nextTriggered && v.currentTime < v.duration - 2) {
        setTimeout(function() { v.play().catch(function(){}); }, 200);
      }
    });
    v.addEventListener('ended', function() {
      if (!nextTriggered) { log('ended - next...'); nextTriggered = true; setTimeout(goNext, 1000); }
    });
    v.addEventListener('timeupdate', function() {
      if (v.duration) {
        var el = document.getElementById('y_time');
        if (el) el.textContent = timeStr(v.currentTime) + ' / ' + timeStr(v.duration);
      }
    });
  }

  // ===== FIND "MY PLAYBACK PROGRESS" ON PAGE =====
  function findMyProgress() {
    // Look for text node containing "我的播放进度"
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while (node = walker.nextNode()) {
      var txt = node.textContent.trim();
      if (txt.indexOf('我的播放进度') >= 0) {
        // Found the label - now look for the percentage value nearby
        // Check parent and siblings for "N%" pattern
        var parent = node.parentElement;
        if (!parent) continue;

        // Check parent's full text
        var parentText = (parent.textContent || '').trim();
        var m = parentText.match(/(\d+(?:\.\d+)?)\s*%/);
        if (m) {
          var pct = parseFloat(m[1]);
          if (pct >= 0 && pct <= 100) {
            return pct;
          }
        }

        // Check next sibling elements
        var next = parent.nextElementSibling;
        while (next) {
          var nextText = (next.textContent || '').trim();
          var nm = nextText.match(/^(\d+(?:\.\d+)?)\s*%$/);
          if (nm) return parseFloat(nm[1]);
          nm = nextText.match(/(\d+(?:\.\d+)?)\s*%/);
          if (nm) return parseFloat(nm[1]);
          next = next.nextElementSibling;
        }

        // Check children
        var children = parent.querySelectorAll('*');
        for (var i = 0; i < children.length; i++) {
          var childText = (children[i].textContent || '').trim();
          var cm = childText.match(/^(\d+(?:\.\d+)?)\s*%$/);
          if (cm) return parseFloat(cm[1]);
        }

        // If all else fails, just extract the first percentage from parent text
        if (m) return parseFloat(m[1]);
      }
    }
    return null;
  }

  // ===== CHECK MY PROGRESS -> GO NEXT =====
  function checkProgress() {
    if (nextTriggered) return;
    if (!video || video.paused) return;

    var myPct = findMyProgress();
    if (myPct === null) {
      // Only show this message occasionally
      if (Math.random() < 0.2) log('looking for progress...');
      return;
    }

    log('my progress: ' + myPct + '%');

    if (myPct >= 90) {
      log('progress ' + myPct + '% >= 90% -> going next!');
      nextTriggered = true;
      setTimeout(goNext, 1000);
    }
  }

  // ===== NEXT =====
  function goNext() {
    var links = document.querySelectorAll('a[href*="fsresource"]');
    var found = false;
    for (var i = 0; i < links.length; i++) {
      var h = links[i].getAttribute('href') || '';
      if (!h) continue;
      if (location.href.indexOf(h) >= 0) { found = true; continue; }
      if (found) {
        var url = h.startsWith('http') ? h :
          location.origin + (h.startsWith('/') ? '' : '/') + h;
        log('next: ' + (links[i].textContent || '').substring(0, 30));
        location.href = url;
        return;
      }
    }
    log('all done!');
  }

  // ===== VERIFICATION HOLD =====
  function scanHold() {
    if (holding) return;
    // Only scan interactive elements, not ALL elements
    var els = document.querySelectorAll('button, [role="button"], div[class*="btn"], div[class*="hold"], div[class*="verify"], span[class*="btn"], span[class*="hold"]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;
      var txt = (el.textContent || '').trim();
      if (!txt) continue;
      if (el.dataset._yheld) continue;

      var txtLower = txt.toLowerCase();
      var id = (el.id || '').toLowerCase();
      var cls = ((el.className || '') + '').toLowerCase();

      var isHold = false;

      // Chinese: 按住 / 长按 / 按住按钮 / 确认你在观看
      if (txt.indexOf('按住') >= 0 || txt.indexOf('长按') >= 0 || txt.indexOf('确认你在观看') >= 0) {
        isHold = true;
      }
      // English: hold / press / long press
      if (txtLower.indexOf('hold') >= 0 || txtLower.indexOf('press and hold') >= 0 || txtLower === 'press') {
        isHold = true;
      }
      // ID or class hints
      if (id.indexOf('hold') >= 0 || id.indexOf('verify') >= 0) isHold = true;
      if (cls.indexOf('hold') >= 0 || cls.indexOf('verify') >= 0) isHold = true;

      if (!isHold) continue;

      // Don't trigger on large text blocks (likely not a button)
      if (txt.length > 100 && el.tagName !== 'BUTTON') continue;

      el.dataset._yheld = '1';
      log('verification detected - auto holding...');
      doHold(el);
      return;
    }
  }

  function doHold(btn) {
    holding = true;
    var r = btn.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var elapsed = 0;

    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy }));
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse', isPrimary: true }));

    holdTimer = setInterval(function() {
      elapsed += 200;
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cx + Math.random() * 2, clientY: cy + Math.random() * 2 }));
      log('holding... ' + Math.max(0, Math.ceil((8000 - elapsed) / 1000)) + 's');

      if (elapsed >= 8000 || btn.offsetWidth === 0) {
        clearInterval(holdTimer);
        holdTimer = null;
        holding = false;
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: cx, clientY: cy }));
        btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
        log('verification passed!');
        if (video && video.paused) video.play().catch(function() {});
      }
    }, 200);
  }

  // ===== START =====
  log('activating...');
  setTimeout(function() { findVideo(); }, 500);

  setInterval(function() {
    if (video && !nextTriggered) checkProgress();
  }, 3000);

  setInterval(scanHold, 3000);

  var observer = new MutationObserver(function() {
    if (!video) findVideo();
    scanHold();
  });
  observer.observe(document.body, { childList: true, subtree: true });

})();
