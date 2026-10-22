/*
 * Site behaviour: instant page changes, search, "new since your last visit",
 * image viewer, theme and room tone. The site still works if this file fails;
 * every page is published as plain HTML first.
 */
(function () {
  'use strict';

  var R = window.SiteRender;
  if (!R) return;
  window.__siteReady = true;

  var doc = document;
  var html = doc.documentElement;
  var PREVIEW = window.__SITE_PREVIEW__ || null;
  var state = { content: null, route: null, index: null, since: '', loading: false, loadFailed: false };

  /* ---------------------------------------------------------------- storage */

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function ssGet(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } }

  /* ---------------------------------------------------------------- theme */

  function theme() { return html.getAttribute('data-theme') === 'paper' ? 'paper' : 'night'; }
  function themeColor() {
    var meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', R.themeColor(theme()));
  }
  function setTheme(t) {
    html.setAttribute('data-theme', t);
    lsSet('ar-theme', t);
    themeColor();
    syncControls();
  }

  /* ---------------------------------------------------------------- visits */

  function initVisits() {
    var since = ssGet('ar-since');
    if (since === null) {
      since = lsGet('ar-seen') || '';
      ssSet('ar-since', since);
    }
    lsSet('ar-seen', new Date().toISOString());
    state.since = since;
  }

  function isNew(it) {
    return !!state.since && !!it.created && it.created > state.since;
  }

  function markNew() {
    var c = state.content;
    if (!c || !state.since) return;
    R.LISTS.forEach(function (k) {
      var n = c[k].filter(isNew).length;
      doc.querySelectorAll('[data-section="' + k + '"] .rail-new').forEach(function (el) {
        el.hidden = !n;
        el.textContent = n ? n + ' new' : '';
      });
      doc.querySelectorAll('[data-section="' + k + '"] .home-new').forEach(function (el) {
        el.hidden = !n;
        el.title = n ? n + ' new since your last visit' : '';
      });
    });
    doc.querySelectorAll('#main [data-created]').forEach(function (el) {
      var created = el.getAttribute('data-created');
      if (created && created > state.since && !el.classList.contains('is-new') && !el.matches('article')) {
        el.classList.add('is-new');
        var label = doc.createElement('span');
        label.className = 'sr-only';
        label.textContent = ' (new since your last visit)';
        var title = el.querySelector('.entry-title, .tile-title, .q-text, .rec-title');
        if (title) title.appendChild(label);
      }
    });
  }

  /* ---------------------------------------------------------------- rendering */

  function currentPath() {
    return PREVIEW ? state.previewPath || '/' : location.pathname + location.search;
  }

  function parsePath(path) {
    var u = new URL(path, 'https://site.invalid/');
    return { pathname: u.pathname, search: u.search, hash: u.hash };
  }

  function fragmentTarget(hash) {
    var id = hash.slice(1);
    try { id = decodeURIComponent(id); } catch (e) { /* Treat a malformed escape as a literal ID. */ }
    return doc.getElementById(id);
  }

  function apply(route) {
    var v = R.render(state.content, route);
    doc.getElementById('view').innerHTML = v.html;
    doc.body.classList.toggle('is-home', v.bodyClass === 'is-home');
    doc.body.classList.toggle('is-reading', v.bodyClass === 'is-reading');
    doc.title = v.title;
    // Keep the address, canonical, sharing and citation metadata in agreement
    // during instant navigation, just as they are on a direct page load.
    var metadata = doc.createElement('template');
    metadata.innerHTML = R.headMeta(state.content, route, v);
    var selector = 'meta[name="description"],meta[name="robots"],link[rel="canonical"],meta[property^="og:"],meta[name^="twitter:"],meta[name^="citation_"],script[type="application/ld+json"]';
    doc.head.querySelectorAll(selector).forEach(function (el) { el.remove(); });
    metadata.content.querySelectorAll(selector).forEach(function (el) { doc.head.appendChild(el); });
    state.route = route;
    state.path = currentPath();
    enhance();
    return v;
  }

  function renderRoute(route, opts) {
    opts = opts || {};
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var done = function () {
      var v = apply(route);
      if (opts.focus !== false) {
        var target = doc.querySelector('#main [tabindex="-1"]') || doc.getElementById('main');
        if (target) target.focus({ preventScroll: true });
        var announcer = doc.getElementById('announcer');
        if (announcer) announcer.textContent = v.title;
      }
      if (typeof opts.scroll === 'number') window.scrollTo(0, opts.scroll);
      else if (opts.hash) {
        var el = fragmentTarget(opts.hash);
        if (el) el.scrollIntoView(); else window.scrollTo(0, 0);
      }
    };
    if (doc.startViewTransition && !reduce && !opts.instant) doc.startViewTransition(done);
    else done();
  }

  function navigate(href, opts) {
    opts = opts || {};
    var p = parsePath(href);
    var route = R.route(p.pathname, p.search);
    if (PREVIEW) {
      state.previewPath = p.pathname + p.search;
      renderRoute(route, { scroll: 0, hash: p.hash });
      return;
    }
    try {
      history.replaceState({ scroll: window.scrollY }, '');
      history[opts.replace ? 'replaceState' : 'pushState']({ scroll: 0 }, '', p.pathname + p.search + p.hash);
    } catch (e) {
      location.href = href;
      return;
    }
    renderRoute(route, p.hash ? { hash: p.hash } : { scroll: 0 });
  }

  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    if (a.hasAttribute('data-zoom')) { e.preventDefault(); openViewer(a); return; }
    if (!state.content) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    var raw = a.getAttribute('href');
    if (!raw || raw.charAt(0) === '#' || /^(mailto:|tel:)/i.test(raw)) return;
    if (/^https?:/i.test(raw) && (PREVIEW || new URL(raw).origin !== location.origin)) return;
    var p = parsePath(PREVIEW ? raw : a.href);
    if (/^\/(media|assets)\//.test(p.pathname)) return;
    if (/\.[a-z0-9]{2,5}$/i.test(p.pathname) && !/\.html?$/i.test(p.pathname)) return;
    e.preventDefault();
    if (!PREVIEW && p.pathname + p.search === location.pathname + location.search && p.hash) {
      location.hash = p.hash;
      return;
    }
    navigate(p.pathname + p.search + p.hash);
  }

  function onPopState(e) {
    closePalette();
    closeViewer();
    // Only the #part changed (a heading's link, "Skip to content"): the page stays as it is.
    if (state.path && location.pathname + location.search === state.path) {
      if (location.hash) {
        var target = fragmentTarget(location.hash);
        if (target) target.scrollIntoView();
      }
      return;
    }
    if (!state.content) { location.reload(); return; }
    var route = R.route(location.pathname, location.search);
    renderRoute(route, { scroll: (e.state && e.state.scroll) || 0, instant: true });
  }

  var scrollTimer = 0;
  function onScroll() {
    if (PREVIEW) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () {
      try { history.replaceState({ scroll: window.scrollY }, ''); } catch (e) { /* ignore */ }
    }, 120);
  }

  /* ---------------------------------------------------------------- page enhancements */

  function develop(img) {
    if (img.classList.contains('is-in')) return;
    var show = function () { requestAnimationFrame(function () { img.classList.add('is-in'); }); };
    if (img.complete && img.naturalWidth) show();
    else {
      img.addEventListener('load', show, { once: true });
      img.addEventListener('error', show, { once: true });
    }
  }

  function enhance() {
    doc.querySelectorAll('img.develop').forEach(develop);

    var c = state.content;
    doc.querySelectorAll('[data-action="random-question"]').forEach(function (b) {
      b.hidden = !(c && c.questions.length > 1);
    });
    doc.querySelectorAll('[data-action="copy"]').forEach(function (b) {
      b.hidden = !canCopy();
    });
    doc.querySelectorAll('[data-action="share"]').forEach(function (b) {
      var native = canNativeShare();
      b.hidden = !(native || canCopy());
      var label = b.querySelector('span');
      if (label) label.textContent = native ? 'Share' : 'Copy link';
    });
    if (c) {
      doc.querySelectorAll('.rail [data-count]').forEach(function (el) {
        var list = c[el.getAttribute('data-count')] || [];
        var f = el.getAttribute('data-field');
        var n = f ? list.filter(function (it) { return R.slugify(it.category) === f; }).length : list.length;
        el.textContent = n ? String(n) : '';
      });
      var up = doc.querySelector('.rail-updated');
      var t = c.updated ? R.ago(c.updated) : '';
      if (up && t) { up.textContent = 'Updated ' + t; up.hidden = false; }
    }
    syncControls();
    markNew();
    fitTabs();
  }

  /* Phones: the section tabs scroll sideways when they don't all fit. The current one is kept in view,
     and the edges fade where more tabs are waiting, so it's clear there is more to see. */
  var tabsBound = null;
  function fitTabs() {
    var nav = doc.querySelector('.rail-nav');
    if (!nav) return;
    var mark = function () {
      var over = nav.scrollWidth - nav.clientWidth > 2;
      nav.classList.toggle('is-scrollable', over);
      nav.classList.toggle('more-before', over && nav.scrollLeft > 2);
      nav.classList.toggle('more-after', over && nav.scrollLeft < nav.scrollWidth - nav.clientWidth - 2);
    };
    var on = nav.querySelector('.rail-link.is-on');
    if (on && nav.scrollWidth > nav.clientWidth) {
      var l = on.offsetLeft - nav.offsetLeft, r = l + on.offsetWidth;
      if (l < nav.scrollLeft || r > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = Math.max(0, l - 24);
    }
    mark();
    if (tabsBound !== nav) {
      tabsBound = nav;
      nav.addEventListener('scroll', mark, { passive: true });
    }
  }

  function syncControls() {
    var t = theme();
    doc.querySelectorAll('[data-action="theme"]').forEach(function (b) {
      var next = t === 'night' ? 'paper' : 'night';
      b.setAttribute('aria-label', 'Switch to ' + next + ' theme');
      b.innerHTML = R.icon(next) + '<span class="ctl-label">' + (next === 'paper' ? 'Paper' : 'Night') + '</span>';
    });
    doc.querySelectorAll('[data-action="sound"]').forEach(function (b) {
      b.setAttribute('aria-pressed', sound.on ? 'true' : 'false');
      b.title = sound.on ? 'Turn room tone off' : 'Play a quiet room tone';
    });
    doc.querySelectorAll('[data-action="shortcuts"]').forEach(function (b) {
      var enabled = lsGet('ar-shortcuts') !== '0';
      b.setAttribute('aria-pressed', String(enabled));
      b.textContent = 'Single-key shortcuts: ' + (enabled ? 'On' : 'Off');
    });
  }

  function randomQuestion() {
    var list = state.content ? state.content.questions : [];
    if (!list.length) return;
    var cur = state.route && state.route.name === 'question' ? state.route.slug : '';
    var pick = list[Math.floor(Math.random() * list.length)];
    if (list.length > 1) {
      var guard = 0;
      while (pick.slug === cur && guard++ < 20) pick = list[Math.floor(Math.random() * list.length)];
    }
    navigate(R.itemHref('questions', pick.slug));
  }

  function canCopy() { return !!(navigator.clipboard && window.isSecureContext); }

  function flash(btn, text) {
    var label = btn.querySelector('span');
    if (!label) return;
    if (!btn.hasAttribute('data-label')) btn.setAttribute('data-label', label.textContent);
    label.textContent = text;
    var announcer = doc.getElementById('announcer');
    if (announcer) announcer.textContent = text;
    clearTimeout(btn._flash);
    btn._flash = setTimeout(function () { label.textContent = btn.getAttribute('data-label'); }, 1800);
  }

  function copyText(btn) {
    var text = btn.getAttribute('data-copy');
    navigator.clipboard.writeText(text).then(function () {
      flash(btn, 'Copied');
    }, function () { /* clipboard refused: the text is still on screen */ });
  }

  /* Phones and tablets get the system share sheet; elsewhere the button copies the link. */
  function canNativeShare() {
    return !!(navigator.share && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }
  function shareLink(btn) {
    var c = state.content;
    var url = ((c && c.site.url) || location.origin) + (btn.getAttribute('data-share') || location.pathname);
    if (canNativeShare()) {
      navigator.share({ title: btn.getAttribute('data-share-text') || doc.title, url: url }).catch(function () { /* closed the sheet */ });
      return;
    }
    if (!canCopy()) return;
    navigator.clipboard.writeText(url).then(function () { flash(btn, 'Link copied'); }, function () { /* clipboard refused */ });
  }

  function onAction(e) {
    var b = e.target.closest && e.target.closest('[data-action]');
    if (!b) return;
    var a = b.getAttribute('data-action');
    if (a === 'search') openPalette();
    else if (a === 'theme') setTheme(theme() === 'night' ? 'paper' : 'night');
    else if (a === 'sound') toggleSound();
    else if (a === 'random-question') randomQuestion();
    else if (a === 'copy') copyText(b);
    else if (a === 'share') shareLink(b);
    else if (a === 'shortcuts') {
      lsSet('ar-shortcuts', lsGet('ar-shortcuts') === '0' ? '1' : '0');
      syncControls();
    }
  }

  /* ---------------------------------------------------------------- search */

  var pal = null;
  var palReturn = null;
  var modalOverflow = null;

  function modalBackground(open) {
    var view = doc.getElementById('view');
    if (view) view.inert = open;
    if (open && modalOverflow === null) {
      modalOverflow = doc.body.style.overflow;
      doc.body.style.overflow = 'hidden';
    } else if (!open && modalOverflow !== null) {
      doc.body.style.overflow = modalOverflow;
      modalOverflow = null;
    }
  }

  function trapTab(e, root) {
    if (e.key !== 'Tab') return;
    var els = root.querySelectorAll('input, button, a[href]');
    if (!els.length) return;
    var first = els[0], last = els[els.length - 1];
    if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function buildPalette() {
    var root = doc.createElement('div');
    root.className = 'palette';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Search');
    root.innerHTML = '<div class="palette-box">' +
      '<div class="palette-field">' + R.icon('search') +
      '<input class="palette-input" type="text" placeholder="Search everything" autocomplete="off" spellcheck="false" ' +
      'role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" aria-label="Search">' +
      '<button type="button" class="palette-close" aria-label="Close search">' + R.icon('close') + '</button></div>' +
      '<ul class="palette-list" id="palette-list" role="listbox" aria-label="Results" tabindex="-1"></ul>' +
      '<div class="palette-status sr-only" role="status" aria-live="polite"></div>' +
      '<div class="palette-foot"><span>↑ ↓ to move · Enter to open · Esc to close</span>' +
      '<button type="button" class="ctl" data-action="shortcuts" aria-pressed="true" title="Turn / and 1–5 shortcuts on or off. Ctrl+K always opens search.">Single-key shortcuts: On</button></div>' +
      '</div>';
    doc.body.appendChild(root);
    var input = root.querySelector('input');
    var list = root.querySelector('ul');
    var p = { root: root, input: input, list: list, opts: [], sel: 0 };
    input.addEventListener('input', function () { fillPalette(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); movePalette(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); movePalette(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); choosePalette(p.sel); }
    });
    root.querySelector('.palette-close').addEventListener('click', closePalette);
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      else trapTab(e, root);
    });
    root.addEventListener('mousedown', function (e) { if (e.target === root) closePalette(); });
    list.addEventListener('click', function (e) {
      var li = e.target.closest('[role="option"]');
      if (li) choosePalette(+li.getAttribute('data-i'));
    });
    list.addEventListener('mousemove', function (e) {
      var li = e.target.closest('[role="option"]');
      if (li && +li.getAttribute('data-i') !== p.sel) selectPalette(+li.getAttribute('data-i'));
    });
    return p;
  }

  function openPalette() {
    if (pal && !pal.root.hidden) return;
    if (!pal) pal = buildPalette();
    palReturn = doc.activeElement;
    pal.root.hidden = false;
    pal.input.value = '';
    fillPalette('');
    syncControls();
    pal.input.focus();
    modalBackground(true);
    if (state.loadFailed) refreshContent();
  }

  function closePalette() {
    if (!pal || pal.root.hidden) return;
    pal.root.hidden = true;
    modalBackground(false);
    if (palReturn && palReturn.focus && doc.contains(palReturn)) palReturn.focus();
  }

  function searchResults(q) {
    var c = state.content;
    if (!c) return [];
    if (!state.index) state.index = R.searchIndex(c);
    q = q.trim().toLowerCase();
    if (!q) {
      var nav = R.SECTIONS.map(function (s) { return { group: 'Go to', title: s.label, sub: '', url: s.path }; });
      var recent = state.index.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 6)
        .map(function (r) { return { group: 'Latest', title: r.title, sub: r.sectionLabel + (r.sub ? ', ' + r.sub : ''), url: r.url }; });
      return nav.concat(recent);
    }
    var words = q.split(/\s+/).filter(Boolean);
    var hits = [];
    state.index.forEach(function (r) {
      var score = 0;
      for (var i = 0; i < words.length; i++) {
        if (r.hay.indexOf(words[i]) < 0) return;
        score += r.head.indexOf(words[i]) >= 0 ? 6 : 1;
      }
      if (r.title.toLowerCase().indexOf(q) === 0) score += 10;
      hits.push({ r: r, score: score });
    });
    hits.sort(function (a, b) { return b.score - a.score || (a.r.date < b.r.date ? 1 : -1); });
    var order = { projects: 0, creatives: 1, questions: 2, recommended: 3 };
    return hits.slice(0, 40).sort(function (a, b) { return order[a.r.section] - order[b.r.section] || b.score - a.score; })
      .map(function (h) { return { group: h.r.sectionLabel, title: h.r.title, sub: h.r.sub, url: h.r.url }; });
  }

  function fillPalette(q) {
    var res = searchResults(q);
    pal.opts = res;
    pal.sel = 0;
    var unavailable = state.loadFailed ? 'Search couldn’t load. Check your connection, then close and reopen Search to try again. You can still browse the sections.' : 'Search is loading.';
    pal.root.querySelector('.palette-status').textContent = !state.content ? unavailable : (res.length ? res.length + ' results' : 'No results');
    if (!res.length) {
      pal.list.innerHTML = '<li class="palette-none" role="presentation">' +
        (state.content ? 'Nothing matches “' + R.esc(q.trim()) + '”.' : unavailable) + '</li>';
      pal.input.removeAttribute('aria-activedescendant');
      return;
    }
    var out = '', last = '';
    res.forEach(function (o, i) {
      if (o.group !== last) { out += '<li class="palette-group" role="presentation">' + R.esc(o.group) + '</li>'; last = o.group; }
      out += '<li class="palette-opt" role="option" id="pal-' + i + '" data-i="' + i + '" aria-selected="' + (i === 0) + '">' +
        '<span class="palette-title">' + R.esc(o.title) + '</span>' + (o.sub ? '<span class="palette-sub">' + R.esc(o.sub) + '</span>' : '') + '</li>';
    });
    pal.list.innerHTML = out;
    pal.input.setAttribute('aria-activedescendant', 'pal-0');
  }

  function selectPalette(i) {
    var prev = pal.list.querySelector('[aria-selected="true"]');
    if (prev) prev.setAttribute('aria-selected', 'false');
    pal.sel = i;
    var el = doc.getElementById('pal-' + i);
    if (el) {
      el.setAttribute('aria-selected', 'true');
      el.scrollIntoView({ block: 'nearest' });
      pal.input.setAttribute('aria-activedescendant', 'pal-' + i);
    }
  }
  function movePalette(d) {
    if (!pal.opts.length) return;
    selectPalette((pal.sel + d + pal.opts.length) % pal.opts.length);
  }
  function choosePalette(i) {
    var o = pal.opts[i];
    if (!o) return;
    closePalette();
    palReturn = null;
    navigate(o.url);
  }

  /* ---------------------------------------------------------------- image viewer */

  var viewer = null;
  var viewerReturn = null;

  function openViewer(a) {
    if (!viewer) {
      viewer = doc.createElement('div');
      viewer.className = 'viewer';
      viewer.hidden = true;
      viewer.setAttribute('role', 'dialog');
      viewer.setAttribute('aria-modal', 'true');
      viewer.setAttribute('aria-label', 'Image');
      viewer.innerHTML = '<button type="button" class="viewer-close" aria-label="Close image">' + R.icon('close') + '</button><img alt="">';
      doc.body.appendChild(viewer);
      viewer.addEventListener('click', function () { closeViewer(); });
    }
    viewerReturn = a;
    var img = viewer.querySelector('img');
    var inner = a.querySelector('img');
    img.src = a.getAttribute('href');
    img.alt = inner ? inner.alt : '';
    viewer.hidden = false;
    viewer.querySelector('button').focus();
    modalBackground(true);
  }
  function closeViewer() {
    if (!viewer || viewer.hidden) return;
    viewer.hidden = true;
    modalBackground(false);
    if (viewerReturn && doc.contains(viewerReturn)) viewerReturn.focus();
  }
  function stepViewer(d) {
    var links = Array.prototype.slice.call(doc.querySelectorAll('#main [data-zoom]'));
    var i = links.indexOf(viewerReturn);
    if (i < 0 || links.length < 2) return;
    openViewer(links[(i + d + links.length) % links.length]);
  }

  /* ---------------------------------------------------------------- room tone */

  var sound = { on: false, ctx: null, gain: null };

  function buildRoomTone() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    var ctx = new Ctx();
    var rate = ctx.sampleRate, n = Math.floor(rate * 6), fade = Math.floor(rate * 0.5);
    var buf = ctx.createBuffer(2, n, rate);
    for (var ch = 0; ch < 2; ch++) {
      var raw = new Float32Array(n + fade), last = 0;
      for (var i = 0; i < raw.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        raw[i] = last * 3.5;
      }
      var d = buf.getChannelData(ch);
      for (var j = 0; j < n; j++) d[j] = raw[j];
      for (var k = 0; k < fade; k++) { var t = k / fade; d[k] = raw[k] * t + raw[n + k] * (1 - t); }
    }
    var srcNode = ctx.createBufferSource();
    srcNode.buffer = buf;
    srcNode.loop = true;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.4;
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 0.043;
    var lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 150;
    lfo.connect(lfoDepth);
    lfoDepth.connect(lp.frequency);
    var swell = ctx.createOscillator();
    swell.frequency.value = 0.061;
    var swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.035;
    var gain = ctx.createGain();
    gain.gain.value = 0;
    swell.connect(swellDepth);
    swellDepth.connect(gain.gain);
    srcNode.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);
    srcNode.start();
    lfo.start();
    swell.start();
    sound.ctx = ctx;
    sound.gain = gain;
    return true;
  }

  function startSound() {
    if (!sound.ctx && !buildRoomTone()) return;
    sound.ctx.resume();
    sound.gain.gain.cancelScheduledValues(sound.ctx.currentTime);
    sound.gain.gain.setTargetAtTime(0.2, sound.ctx.currentTime, 1.4);
    sound.on = true;
    syncControls();
  }
  function stopSound() {
    if (!sound.ctx) return;
    sound.gain.gain.cancelScheduledValues(sound.ctx.currentTime);
    sound.gain.gain.setTargetAtTime(0, sound.ctx.currentTime, 0.35);
    sound.on = false;
    var ctx = sound.ctx;
    setTimeout(function () { if (!sound.on) ctx.suspend(); }, 2000);
    syncControls();
  }
  function toggleSound() {
    if (sound.on) stopSound(); else startSound();
    lsSet('ar-sound', sound.on ? '1' : '0');
  }
  function armSound() {
    if (lsGet('ar-sound') !== '1') return;
    var go = function (e) {
      doc.removeEventListener('pointerdown', go, true);
      doc.removeEventListener('keydown', go, true);
      var b = e.target && e.target.closest && e.target.closest('[data-action="sound"]');
      if (!b && !sound.on) startSound();
    };
    doc.addEventListener('pointerdown', go, true);
    doc.addEventListener('keydown', go, true);
  }

  /* ---------------------------------------------------------------- keyboard */

  function typing(el) {
    return el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));
  }

  function onKey(e) {
    if (viewer && !viewer.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeViewer(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepViewer(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepViewer(-1); }
      else if (e.key === 'Tab') e.preventDefault();
      return;
    }
    if (pal && !pal.root.hidden) return;
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openPalette(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || e.isComposing || e.repeat) return;
    if (lsGet('ar-shortcuts') === '0') return;
    if (e.key === '/') { e.preventDefault(); openPalette(); return; }
    var n = '12345'.indexOf(e.key);
    if (n >= 0 && !e.shiftKey && state.content) { navigate(R.SECTIONS[n].path); return; }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey) {
      // Native controls and horizontally scrolling reading regions own their arrow keys.
      if (e.target.closest && e.target.closest('a, button, summary, audio, video, iframe, pre, [role="region"], [role="slider"], [role="tablist"]')) return;
      var rel = e.key === 'ArrowLeft' ? 'newer' : 'older';
      var link = doc.querySelector('#main .pager [data-rel="' + rel + '"]');
      if (link) { e.preventDefault(); link.click(); }
    }
  }

  /* ---------------------------------------------------------------- start */

  function loadContent() {
    if (PREVIEW) return Promise.resolve(PREVIEW.content);
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 12000);
    return fetch('/content.json', { cache: 'no-cache', signal: controller.signal })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function () { return null; })
      .finally(function () { clearTimeout(timeout); });
  }

  function refreshContent() {
    if (state.loading || state.content) return;
    state.loading = true;
    state.loadFailed = false;
    if (pal && !pal.root.hidden) fillPalette(pal.input.value);
    loadContent().then(function (raw) {
      if (!raw) { state.loadFailed = true; return; }
      state.content = R.normalize(raw);
      state.index = null;
      var p = parsePath(PREVIEW ? (PREVIEW.path || '/') : currentPath());
      var route = R.route(p.pathname, p.search);
      var main = doc.getElementById('main');
      var stale = !main || PREVIEW || (main.getAttribute('data-route') === 'notfound' && route.name !== 'notfound');
      if (PREVIEW) state.previewPath = p.pathname + p.search;
      if (stale) renderRoute(route, { focus: false, instant: true, scroll: PREVIEW ? 0 : undefined });
      else { state.route = route; state.path = currentPath(); enhance(); }
    }).catch(function () {
      state.content = null;
      state.loadFailed = true;
    }).finally(function () {
      state.loading = false;
      if (pal && !pal.root.hidden) fillPalette(pal.input.value);
    });
  }

  function start() {
    initVisits();
    if (PREVIEW) {
      R.mediaBase = PREVIEW.mediaBase || '';
      R.mediaMap = PREVIEW.mediaMap || {};
    }
    try { history.scrollRestoration = 'manual'; } catch (e) { /* older browsers */ }
    doc.addEventListener('click', onClick);
    doc.addEventListener('click', onAction);
    doc.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { fitTabs(); }, { passive: true });
    armSound();
    themeColor();
    enhance();

    refreshContent();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})();
