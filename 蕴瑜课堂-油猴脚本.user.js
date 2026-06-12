// ==UserScript==
// @name         蕴瑜课堂 视频自动播放
// @namespace    https://courses.gdut.edu.cn/
// @version      1.0
// @description  自动播放视频、自动按住通过验证、自动切换下一集
// @author       Claude
// @match        https://courses.gdut.edu.cn/*
// @match        https://authserver.gdut.edu.cn/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
  'use strict';

  console.log('🎬 蕴瑜课堂自动播放脚本已加载 v2.0');
  console.log('📍 当前页面:', window.location.href);

  // 立即显示加载标志
  const loadDot = document.createElement('div');
  loadDot.id = 'yykt-loaded-dot';
  loadDot.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:999999;' +
    'width:12px;height:12px;border-radius:50%;background:#22c55e;' +
    'box-shadow:0 0 8px #22c55e;';
  loadDot.title = '蕴瑜课堂脚本已加载';
  document.body.appendChild(loadDot);

  let video = null;
  let autoPlayEnabled = true;
  let holdTimer = null;
  let watchedVideos = new Set();

  // ========== 样式：状态指示器 ==========
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #yykt-status-bar {
        position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
        background: #1a1a2e; color: #e0e0e0; font-size: 13px;
        padding: 6px 16px; display: flex; align-items: center; gap: 12px;
        font-family: -apple-system, "Microsoft YaHei", sans-serif;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      }
      #yykt-status-bar .dot { width: 8px; height: 8px; border-radius: 50%; }
      #yykt-status-bar .dot.on { background: #22c55e; animation: yykt-pulse 1.5s infinite; }
      #yykt-status-bar .dot.off { background: #666; }
      @keyframes yykt-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      #yykt-status-bar button {
        background: #3b82f6; color: #fff; border: none; padding: 4px 12px;
        border-radius: 4px; cursor: pointer; font-size: 12px;
      }
      #yykt-status-bar button:hover { background: #2563eb; }
      #yykt-status-bar button.off { background: #555; }
    `;
    document.head.appendChild(style);
  }

  function createStatusBar() {
    const bar = document.createElement('div');
    bar.id = 'yykt-status-bar';
    bar.innerHTML = `
      <span class="dot on" id="yykt-dot"></span>
      <span id="yykt-status-text">监控中...</span>
      <span style="flex:1"></span>
      <span id="yykt-time" style="color:#888;"></span>
      <button id="yykt-btn-toggle" title="切换自动播放">⏯ 自动</button>
      <button id="yykt-btn-next" title="下一集">⏭</button>
    `;
    document.body.prepend(bar);

    document.getElementById('yykt-btn-toggle').addEventListener('click', toggleAutoPlay);
    document.getElementById('yykt-btn-next').addEventListener('click', goToNextVideo);
  }

  function updateStatus(text, type) {
    const dot = document.getElementById('yykt-dot');
    const statusText = document.getElementById('yykt-status-text');
    if (!dot || !statusText) return;

    if (type === 'playing') {
      dot.className = 'dot on';
      statusText.textContent = text || '▶ 正在播放';
    } else if (type === 'paused') {
      dot.className = 'dot off';
      statusText.textContent = text || '⏸ 已暂停';
    } else if (type === 'verify') {
      dot.className = 'dot on';
      dot.style.background = '#f59e0b';
      statusText.textContent = text || '🔒 检测到验证，正在自动按住...';
    } else if (type === 'done') {
      dot.className = 'dot off';
      statusText.textContent = text || '✅ 本集播放完毕';
    }
  }

  function updateTime() {
    const el = document.getElementById('yykt-time');
    if (el && video) {
      el.textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
    }
  }

  // ========== 工具函数 ==========
  function formatTime(s) {
    if (isNaN(s) || !isFinite(s)) return '00:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
  }

  // ========== 视频播放 ==========
  function findVideo() {
    // 查找页面中的 <video> 元素
    const videos = document.querySelectorAll('video');
    if (videos.length > 0) {
      video = videos[0];
      return true;
    }
    // 可能在 iframe 中
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const innerVideo = iframe.contentDocument?.querySelector('video');
        if (innerVideo) {
          video = innerVideo;
          return true;
        }
      } catch(e) {
        // 跨域 iframe 无法访问
      }
    }
    return false;
  }

  function setupVideo() {
    if (!video) return;

    // 静音以允许自动播放
    video.muted = true;

    // 播放
    video.play().then(() => {
      updateStatus('▶ 正在播放', 'playing');
    }).catch(err => {
      console.log('自动播放失败:', err.message);
      updateStatus('点击页面以启用自动播放', 'paused');
    });

    // 监听事件
    video.addEventListener('play', () => updateStatus('▶ 正在播放', 'playing'));
    video.addEventListener('pause', () => updateStatus('⏸ 已暂停', 'paused'));
    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('ended', onVideoEnded);
    video.addEventListener('loadedmetadata', () => {
      updateTime();
      if (autoPlayEnabled && video.paused) {
        video.play().catch(() => {});
      }
    });

    // 标记已观看
    markAsWatched();
  }

  function onVideoEnded() {
    updateStatus('✅ 本集播放完毕，准备切换...', 'done');
    console.log('视频播放完毕，自动切换下一集');

    // 延迟 2 秒后自动跳转
    setTimeout(() => {
      if (autoPlayEnabled) {
        goToNextVideo();
      }
    }, 2000);
  }

  function markAsWatched() {
    try {
      const url = window.location.href;
      watchedVideos.add(url);
      localStorage.setItem('yykt_watched', JSON.stringify([...watchedVideos]));
    } catch(e) {}
  }

  function loadWatchedHistory() {
    try {
      const data = localStorage.getItem('yykt_watched');
      if (data) {
        watchedVideos = new Set(JSON.parse(data));
      }
    } catch(e) {}
  }

  // ========== 自动切换下一集 ==========
  function goToNextVideo() {
    // 策略1: 查找页面中的"下一个"/"下一项"链接
    const nextPatterns = [
      '下一项', '下一页', '下一个', '下一节', '下一章',
      'next', 'continue', '▶', '→', '»'
    ];

    const allLinks = document.querySelectorAll('a');
    for (const link of allLinks) {
      const text = (link.textContent || '').toLowerCase().trim();
      const href = link.getAttribute('href') || '';

      // 跳过已看过的
      if (href && watchedVideos.has(href)) continue;

      for (const pattern of nextPatterns) {
        if (text.includes(pattern.toLowerCase())) {
          console.log('找到下一集链接:', text, href);
          updateStatus('⏭ 正在跳转到: ' + text, 'done');
          setTimeout(() => {
            window.location.href = href.startsWith('http') ? href :
              new URL(href, window.location.origin).href;
          }, 1000);
          return;
        }
      }
    }

    // 策略2: 通过侧边栏导航查找下一个未观看的视频
    const navItems = document.querySelectorAll(
      '.section li[data-id] a, ' +
      '.activityinstance a, ' +
      '.course-content a, ' +
      '.modtype_resource a'
    );

    let foundCurrent = false;
    for (const item of navItems) {
      const href = item.getAttribute('href') || '';
      if (!href) continue;

      // 找到当前页面在导航中的位置
      if (href === window.location.pathname + window.location.search ||
          window.location.href.includes(href)) {
        foundCurrent = true;
        continue;
      }

      if (foundCurrent) {
        // 确保是视频资源（fsresource）
        if (href.includes('fsresource') || href.includes('view.php')) {
          console.log('通过导航找到下一集:', href);
          updateStatus('⏭ 正在跳转到下一集', 'done');
          setTimeout(() => {
            window.location.href = href.startsWith('http') ? href :
              new URL(href, window.location.origin).href;
          }, 1000);
          return;
        }
      }
    }

    // 策略3: 如果页面在课程章节页，找第一个未观看的视频
    if (window.location.href.includes('section.php')) {
      const resourceLinks = document.querySelectorAll(
        'a[href*="fsresource"], a[href*="view.php?id="]'
      );
      for (const link of resourceLinks) {
        const href = link.getAttribute('href');
        if (href && !watchedVideos.has(href)) {
          console.log('找到未观看的视频:', href);
          updateStatus('⏭ 正在跳转到未观看视频', 'done');
          setTimeout(() => {
            window.location.href = href.startsWith('http') ? href :
              new URL(href, window.location.origin).href;
          }, 1000);
          return;
        }
      }
    }

    updateStatus('⚠ 未找到下一集，请手动切换', 'done');
  }

  // ========== 自动处理"按住通过"验证 ==========
  function handleVerification() {
    // 观察 DOM 变化，检测验证弹窗的出现
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          checkForVerifyButton(node);
          // 也检查子树
          node.querySelectorAll?.('*')?.forEach(checkForVerifyButton);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 也定期扫描（有些弹窗通过 CSS display 切换而非 DOM 增删）
    setInterval(scanForVerifyButton, 2000);
  }

  function scanForVerifyButton() {
    // 检查整个文档中的验证按钮
    checkForVerifyButton(document.body);
  }

  function checkForVerifyButton(container) {
    if (!container || !autoPlayEnabled) return;

    // 查找各种可能的验证按钮
    // 蕴瑜课堂的"按住通过"按钮常见特征：
    const selectors = [
      '[id*="hold"]',
      '[id*="verify"]',
      '[id*="check"]',
      '[class*="hold"]',
      '[class*="verify"]',
      '[class*="check-btn"]',
      'button:contains("按住")',
      'div:contains("按住")',
      '[onclick*="hold"]',
      '[onmousedown*="hold"]',
      '[onmousedown*="verify"]',
    ];

    // 遍历所有可能元素
    const allButtons = container.querySelectorAll?.('button, [role="button"], div[onmousedown], div[onclick]') || [];
    // 也包括 container 本身
    const candidates = container.tagName === 'BUTTON' ? [container, ...allButtons] : allButtons;

    for (const el of candidates) {
      // 跳过已处理的
      if (el.dataset.yyktHandled === 'true') continue;

      const text = (el.textContent || '').trim();
      const html = el.innerHTML || '';
      const id = el.id || '';
      const className = el.className || '';

      // 匹配"按住"相关文本
      const isVerifyButton =
        text.includes('按住') ||
        text.includes('长按') ||
        text.includes('hold') ||
        text.includes('验证') ||
        text.includes('通过') ||
        id.includes('hold') ||
        id.includes('verify') ||
        className.includes('hold') ||
        className.includes('verify');

      if (isVerifyButton && isElementVisible(el)) {
        console.log('🔒 检测到验证按钮:', text.substring(0, 30));
        el.dataset.yyktHandled = 'true';
        autoHoldButton(el);
        return;
      }
    }
  }

  function isElementVisible(el) {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0' &&
           rect.width > 0 &&
           rect.height > 0;
  }

  function autoHoldButton(button) {
    updateStatus('🔒 正在自动按住验证按钮...', 'verify');

    // 模拟 mousedown
    const mousedownEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: button.getBoundingClientRect().left + 50,
      clientY: button.getBoundingClientRect().top + 20,
      button: 0
    });

    // 也触发 touchstart（移动端/触屏事件）
    const touchstartEvent = new TouchEvent('touchstart', {
      bubbles: true,
      cancelable: true,
      touches: [new Touch({
        identifier: 0,
        target: button,
        clientX: button.getBoundingClientRect().left + 50,
        clientY: button.getBoundingClientRect().top + 20,
        radiusX: 10,
        radiusY: 10
      })]
    });

    button.dispatchEvent(mousedownEvent);
    button.dispatchEvent(touchstartEvent);

    // 检查是否需要 pointerdown
    const pointerEvent = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: button.getBoundingClientRect().left + 50,
      clientY: button.getBoundingClientRect().top + 20,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      pressure: 0.5
    });
    button.dispatchEvent(pointerEvent);

    // 持续触发 press 保持（有些验证需要持续的压力检测）
    let holdDuration = 0;
    const HOLD_TIME = 8000; // 按住 8 秒（比要求的 6 秒多留余量）
    const INTERVAL = 200;   // 每 200ms 触发一次事件保持

    holdTimer = setInterval(() => {
      holdDuration += INTERVAL;

      // 持续触发事件保持"按住"状态
      const keepEvent = new MouseEvent('mousedown', {
        bubbles: true, cancelable: true, button: 0,
        clientX: button.getBoundingClientRect().left + 50 + Math.random() * 2,
        clientY: button.getBoundingClientRect().top + 20 + Math.random() * 2,
      });
      button.dispatchEvent(keepEvent);

      // 更新状态
      const remaining = Math.max(0, Math.ceil((HOLD_TIME - holdDuration) / 1000));
      updateStatus('🔒 自动按住中... ' + remaining + '秒', 'verify');

      // 检查按钮是否已消失（验证通过）
      if (!isElementVisible(button) || holdDuration >= HOLD_TIME) {
        clearInterval(holdTimer);
        holdTimer = null;

        // 触发 mouseup
        const mouseupEvent = new MouseEvent('mouseup', {
          bubbles: true, cancelable: true,
          clientX: button.getBoundingClientRect().left + 50,
          clientY: button.getBoundingClientRect().top + 20,
          button: 0
        });
        button.dispatchEvent(mouseupEvent);
        button.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true
        }));
        button.dispatchEvent(new TouchEvent('touchend', {
          bubbles: true, cancelable: true,
          changedTouches: [new Touch({
            identifier: 0, target: button,
            clientX: button.getBoundingClientRect().left + 50,
            clientY: button.getBoundingClientRect().top + 20
          })]
        }));

        console.log('✅ 验证按钮已处理（按住 ' + (holdDuration / 1000) + ' 秒）');
        updateStatus('✅ 验证通过，继续播放', 'playing');

        // 恢复播放
        if (video && video.paused && autoPlayEnabled) {
          video.play().catch(() => {});
        }
      }
    }, INTERVAL);
  }

  // ========== 切换自动播放 ==========
  function toggleAutoPlay() {
    autoPlayEnabled = !autoPlayEnabled;
    const btn = document.getElementById('yykt-btn-toggle');
    if (btn) {
      btn.textContent = autoPlayEnabled ? '⏯ 自动' : '▶ 手动';
      btn.className = autoPlayEnabled ? '' : 'off';
    }

    if (autoPlayEnabled && video && video.paused) {
      video.muted = true;
      video.play().catch(() => {});
      updateStatus('▶ 正在播放', 'playing');
    } else if (!autoPlayEnabled) {
      updateStatus('⏸ 手动模式', 'paused');
    }
  }

  // ========== 初始化 ==========
  function init() {
    injectStyles();
    createStatusBar();
    loadWatchedHistory();

    // 等待视频加载（Moodle 可能异步加载播放器）
    let attempts = 0;
    const maxAttempts = 30;

    function tryInit() {
      if (findVideo()) {
        setupVideo();
        handleVerification();

        // 如果有视频且开启了自动播放
        if (autoPlayEnabled) {
          video.muted = true;
          video.play().catch(() => {
            updateStatus('点击页面任意位置启用播放', 'paused');
          });
        }
        return;
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(tryInit, 1000);
      } else {
        updateStatus('未检测到视频，请在视频页面刷新', 'paused');
      }
    }

    // 延迟一点等页面渲染完成
    setTimeout(tryInit, 1500);
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
