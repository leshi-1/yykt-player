// v7 - iframe提取视频 + 列表
(function() {
  'use strict';
  if (window.__yykt_loaded) return;
  window.__yykt_loaded = true;
  console.clear();
  console.log('🎬 v7');

  // ===== 扫描 =====
  var links = document.querySelectorAll('a');
  var videoItems = [];
  var seen = {};
  links.forEach(function(a) {
    var h = a.getAttribute('href') || '';
    if (h.indexOf('fsresource') < 0) return;
    if (seen[h]) return;
    seen[h] = true;
    var fullUrl = h.startsWith('http') ? h : location.origin + (h.startsWith('/') ? '' : '/') + h;
    var text = (a.textContent || '').trim().substring(0, 60);
    if (!text) {
      var p = a.closest('li, .activityinstance, div');
      if (p) text = (p.textContent || '').trim().substring(0, 60);
    }
    videoItems.push({ url: fullUrl, text: text || h });
  });

  console.log('找到 ' + videoItems.length + ' 个资源');

  // ===== UI =====
  var container = document.createElement('div');
  container.id = 'yykt_app';
  container.style.cssText = 'position:fixed;top:0;right:0;bottom:0;z-index:999999;' +
    'width:420px;background:#1a1a2e;color:#eee;font-family:"Microsoft YaHei",sans-serif;' +
    'display:flex;flex-direction:column;box-shadow:-4px 0 20px rgba(0,0,0,0.5);overflow:hidden;';
  container.innerHTML =
    '<div style="background:#0d1117;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">' +
    '<b>🎬 列表 <span style="color:#888;font-weight:normal;font-size:12px;">(' + videoItems.length + ')</span></b>' +
    '<button id="yykt_min" style="background:none;border:none;color:#888;cursor:pointer;font-size:18px;">✕</button>' +
    '</div>' +
    '<div style="flex-shrink:0;">' +
    '<video id="yykt_video" style="width:100%;display:block;background:#000;min-height:200px;" controls muted playsinline></video>' +
    '<div id="yykt_info" style="background:#0d1117;padding:6px 14px;font-size:12px;color:#888;">点击列表项开始播放</div>' +
    '</div>' +
    '<div id="yykt_list" style="flex:1;overflow-y:auto;padding:4px 0;"></div>' +
    '<iframe id="yykt_extractor" style="display:none;"></iframe>';
  document.body.appendChild(container);

  var videoEl = document.getElementById('yykt_video');
  var infoEl = document.getElementById('yykt_info');
  var listEl = document.getElementById('yykt_list');
  var extractor = document.getElementById('yykt_extractor');
  var currentIdx = -1;
  var cacheKey = 'yykt_v7_' + location.pathname.replace(/\W/g, '_');

  // ===== 渲染列表 =====
  function renderList() {
    listEl.innerHTML = '';
    videoItems.forEach(function(item, i) {
      var row = document.createElement('div');
      row.style.cssText = 'padding:7px 14px;cursor:pointer;font-size:12px;border-bottom:1px solid #222;' +
        'display:flex;align-items:center;gap:8px;white-space:nowrap;' +
        (i === currentIdx ? 'background:#1a2740;border-left:3px solid #3b82f6;' : '');
      row.innerHTML =
        '<span style="color:#666;width:24px;text-align:center;flex-shrink:0;">' +
        (i === currentIdx ? '▶' : (i + 1)) + '</span>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;">' + item.text + '</span>';
      row.addEventListener('click', function() { startPlay(i); });
      listEl.appendChild(row);
    });
  }

  function scrollToCurrent() {
    if (currentIdx >= 0) {
      var rows = listEl.children;
      if (rows[currentIdx]) rows[currentIdx].scrollIntoView({ block: 'center' });
    }
  }

  // ===== iframe 提取视频 =====
  var extractCallback = null;

  function tryExtract(cb) {
    try {
      var doc = extractor.contentDocument || extractor.contentWindow.document;
      if (!doc) { cb(null); return; }

      // 找 video
      var v = doc.querySelector('video');
      if (v && (v.src || v.querySelector('source'))) {
        var realSrc = v.src || (v.querySelector('source') || {}).src;
        if (realSrc && realSrc !== window.location.href) {
          console.log('✅ 找到video:', realSrc.substring(0, 80));
          cb(realSrc);
          return true;
        }
      }
      // 找 source
      var s = doc.querySelector('source[src]');
      if (s && s.src) {
        console.log('✅ 找到source:', s.src.substring(0, 80));
        cb(s.src);
        return true;
      }
      // 找嵌套iframe
      var innerIframe = doc.querySelector('iframe');
      if (innerIframe && innerIframe.src && innerIframe.src !== 'about:blank') {
        console.log('🔍 嵌套iframe:', innerIframe.src.substring(0, 80));
        extractCallback = cb;
        extractor.src = innerIframe.src;
        return true;
      }
      // 找 HTML 中的视频URL
      var html = doc.documentElement.outerHTML;
      var m = html.match(/["'](https?:\/\/[^"']*\.(?:m3u8|mp4)[^"']*)["']/i);
      if (m) {
        console.log('✅ 从HTML找到:', m[1].substring(0, 80));
        cb(m[1]);
        return true;
      }
    } catch(e) {
      console.log('提取异常:', e.message);
    }
    return false;
  }

  extractor.addEventListener('load', function() {
    if (!extractCallback) return;
    var cb = extractCallback;
    extractCallback = null;

    // 立即尝试
    if (tryExtract(cb)) return;

    // 延迟重试（等待JS动态加载）
    var tries = 0;
    var retry = setInterval(function() {
      tries++;
      if (tryExtract(cb)) { clearInterval(retry); return; }
      if (tries >= 10) { clearInterval(retry); cb(null); }
    }, 800);
  });

  function extractVideoUrl(pageUrl, callback) {
    extractCallback = callback;
    extractor.src = pageUrl;
  }

  // ===== 播放 =====
  function startPlay(idx) {
    if (idx < 0 || idx >= videoItems.length) return;
    currentIdx = idx;
    var item = videoItems[idx];
    renderList();
    scrollToCurrent();

    infoEl.textContent = '⏳ 正在加载: ' + item.text;
    videoEl.src = '';
    videoEl.load();

    extractVideoUrl(item.url, function(src) {
      if (currentIdx !== idx) return;
      if (src) {
        console.log('✅ 提取到视频:', src);
        videoEl.src = src;
        videoEl.load();
        infoEl.textContent = '✅ ' + item.text;
        try { localStorage[cacheKey] = JSON.stringify({ index: idx }); } catch(e) {}
        // 延迟一下让浏览器准备好
        setTimeout(function() {
          if (currentIdx === idx) {
            videoEl.play().catch(function() {
              infoEl.textContent = '⚠ 需手动点 ▶ | ' + item.text;
            });
          }
        }, 500);
      } else {
        console.log('❌ 未找到视频');
        infoEl.textContent = '❌ 此资源可能不是视频 | ' + item.text;
        // 尝试直接用 iframe 展示
        var altIframe = document.createElement('iframe');
        altIframe.src = item.url;
        altIframe.style.cssText = 'width:100%;height:300px;border:none;';
        videoEl.parentNode.insertBefore(altIframe, videoEl.nextSibling);
        altIframe.id = 'yykt_fallback';
        var old = document.getElementById('yykt_fallback');
        if (old && old !== altIframe) old.remove();
      }
    });
  }

  // ===== 自动下一个 =====
  videoEl.addEventListener('ended', function() {
    infoEl.textContent = '✅ 完成 → 下一集...';
    setTimeout(function() { startPlay(currentIdx + 1); }, 1500);
  });

  videoEl.addEventListener('error', function() {
    infoEl.textContent = '⚠ 加载失败 → 下一个...';
    setTimeout(function() { startPlay(currentIdx + 1); }, 2000);
  });

  // ===== 按钮 =====
  document.getElementById('yykt_min').addEventListener('click', function() {
    container.remove();
    window.__yykt_loaded = false;
  });

  // ===== 键盘 =====
  document.addEventListener('keydown', function(e) {
    if (!document.getElementById('yykt_app')) return;
    if (e.key === 'Escape') {
      container.remove();
      window.__yykt_loaded = false;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); startPlay(Math.min(currentIdx + 1, videoItems.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); startPlay(Math.max(0, currentIdx - 1)); }
  });

  // ===== 初始化 =====
  renderList();
  var saved = 0;
  try { saved = JSON.parse(localStorage[cacheKey] || '{}').index || 0; } catch(e) {}
  if (saved < videoItems.length) startPlay(saved);
  else infoEl.textContent = '共 ' + videoItems.length + ' 个资源';

  console.log('v7 就绪');
})();
