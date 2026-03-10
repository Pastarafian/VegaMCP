// VegaClaw AutoClicker v9 — Pure JS (injected via CDP)
// Self-contained: hotbar UI + whitelist clicker + typing timeout
// Inject once, runs forever inside the Antigravity window

(function() {
  'use strict';

  // Prevent double-injection
  if (window.__vegaclaw9) return;
  window.__vegaclaw9 = true;

  // ═══════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════
  var state = {
    active: true,
    clicks: 0,
    scans: 0,
    lastTyping: 0,
    lastClick: '',
    typingTimeout: 5000,  // 5 second typing cooldown
    scanInterval: 2000     // 2 second scan interval
  };

  // ═══════════════════════════════════════
  // WHITELIST — exact text matches only
  // ═══════════════════════════════════════
  var WL_STRICT = [
    'run',
    'accept all',
    'accept',
    'allow',
    'continue',
    'retry',
    'trust',
    'apply',
    'yes',
    'relocate'
  ];

  var WL_FUZZY = [
    'always in this conversation', 
    'allow this conversation', 
    'allow in this conversation', 
    'always run in this conversation', 
    'always allow',
    'accept',
    'accept all'
  ];

  function isWhitelisted(text) {
    var t = text.toLowerCase().trim();
    var t_clean = t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
    
    for (var i = 0; i < WL_STRICT.length; i++) {
      if (t_clean === WL_STRICT[i]) return true;
    }
    for (var k = 0; k < WL_FUZZY.length; k++) {
      if (t_clean.includes(WL_FUZZY[k])) return true;
    }
    return false;
  }

  // ═══════════════════════════════════════
  // TYPING DETECTION (5 sec cooldown)
  // ═══════════════════════════════════════
  document.addEventListener('keydown', function(e) {
    if (e.key && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter' || e.key === 'Tab')) {
      state.lastTyping = Date.now();
    }
  }, true);

  // ═══════════════════════════════════════
  // SCANNER — whitelist only, auxiliarybar only
  // ═══════════════════════════════════════
  function scan() {
    if (!state.active) return;
    if (Date.now() - state.lastTyping < state.typingTimeout) return;

    var aux = document.querySelector('.auxiliarybar');
    if (!aux) return;

    var buttons = aux.querySelectorAll('button, [role=button]');
    for (var i = 0; i < buttons.length; i++) {
      var el = buttons[i];

      // Skip already clicked
      if (el.dataset && el.dataset.vc9) continue;

      // Get first line of text
      var raw = (el.innerText || el.textContent || '').trim();
      if (!raw) continue;
      var firstLine = raw.split(/\r?\n/)[0].trim();
      if (firstLine.length > 30 || firstLine.length < 2) continue;

      // WHITELIST CHECK
      if (!isWhitelisted(firstLine)) continue;

      // Visibility check
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      var cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;

      // CLICK
      el.dataset.vc9 = '1';
      el.click();
      state.clicks++;
      state.lastClick = firstLine;
      updateHotbar();

      // Allow re-click after 5s
      setTimeout(function(e) { return function() { if(e.dataset) delete e.dataset.vc9; } }(el), 5000);
    }
    state.scans++;
  }

  // ═══════════════════════════════════════
  // HOTBAR UI — floating pill inside the page
  // ═══════════════════════════════════════
  function createHotbar() {
    var bar = document.createElement('div');
    bar.id = 'vegaclaw-hotbar';
    bar.innerHTML = [
      '<div id="vc-drag" style="display:flex;align-items:center;gap:8px;cursor:grab;user-select:none;">',
      '  <span id="vc-logo" style="font-weight:800;font-size:11px;color:#00d4ff;letter-spacing:1px;">CLAW</span>',
      '  <span id="vc-status" style="font-size:10px;color:#22c55e;">Active</span>',
      '  <span id="vc-count" style="font-size:9px;color:#64748b;font-family:Consolas,monospace;">0 clicks</span>',
      '</div>',
      '<div style="display:flex;gap:4px;margin-left:8px;">',
      '  <button id="vc-toggle" style="',
      '    background:#1e293b;border:1px solid #334155;color:#f59e0b;font-size:9px;font-weight:700;',
      '    padding:2px 8px;border-radius:4px;cursor:pointer;outline:none;">Pause</button>',
      '  <button id="vc-close" style="',
      '    background:#1e293b;border:1px solid #334155;color:#64748b;font-size:9px;font-weight:700;',
      '    padding:2px 6px;border-radius:4px;cursor:pointer;outline:none;">\u2715</button>',
      '</div>'
    ].join('');

    bar.style.cssText = [
      'position:fixed',
      'bottom:12px',
      'right:12px',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'gap:6px',
      'background:rgba(14,17,23,0.92)',
      'backdrop-filter:blur(12px)',
      'border:1px solid rgba(0,212,255,0.15)',
      'border-radius:20px',
      'padding:6px 14px',
      'font-family:"Segoe UI",system-ui,sans-serif',
      'box-shadow:0 4px 24px rgba(0,0,0,0.5)'
    ].join(';');

    document.body.appendChild(bar);

    // Drag
    var drag = bar.querySelector('#vc-drag');
    var dragging = false, dx = 0, dy = 0;
    drag.addEventListener('mousedown', function(e) {
      dragging = true;
      dx = e.clientX - bar.getBoundingClientRect().left;
      dy = e.clientY - bar.getBoundingClientRect().top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      bar.style.left = (e.clientX - dx) + 'px';
      bar.style.top = (e.clientY - dy) + 'px';
      bar.style.right = 'auto';
      bar.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', function() { dragging = false; });

    // Toggle
    bar.querySelector('#vc-toggle').addEventListener('click', function(e) {
      e.stopPropagation();
      state.active = !state.active;
      this.textContent = state.active ? 'Pause' : 'Play';
      this.style.color = state.active ? '#f59e0b' : '#22c55e';
      updateHotbar();
    });

    // Close
    bar.querySelector('#vc-close').addEventListener('click', function(e) {
      e.stopPropagation();
      state.active = false;
      bar.remove();
      window.__vegaclaw9 = false;
    });

    return bar;
  }

  function updateHotbar() {
    var statusEl = document.querySelector('#vc-status');
    var countEl = document.querySelector('#vc-count');
    if (!statusEl || !countEl) return;

    if (!state.active) {
      statusEl.textContent = 'Paused';
      statusEl.style.color = '#f59e0b';
    } else if (Date.now() - state.lastTyping < state.typingTimeout) {
      statusEl.textContent = 'Typing...';
      statusEl.style.color = '#64748b';
    } else {
      statusEl.textContent = 'Active';
      statusEl.style.color = '#22c55e';
    }
    countEl.textContent = state.clicks + ' clicks';
  }

  // ═══════════════════════════════════════
  // BOOT
  // ═══════════════════════════════════════
  createHotbar();

  // MutationObserver for instant response
  var throttle = null;
  var auxTarget = document.querySelector('.auxiliarybar') || document.body;
  new MutationObserver(function() {
    if (throttle) return;
    throttle = setTimeout(function() { throttle = null; scan(); }, 200);
  }).observe(auxTarget, { childList: true, subtree: true });

  // Periodic scan as backup
  setInterval(scan, 2000);

  // Periodic UI update
  setInterval(updateHotbar, 1000);

  // Initial scan
  setTimeout(scan, 500);

  console.log('[VegaClaw v9] Whitelist autoclicker injected. ' + (WL_STRICT.length + WL_FUZZY.length) + ' targets.');
})();
