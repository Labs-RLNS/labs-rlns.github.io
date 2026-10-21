/*
 * Site renderer — shared by the public website and the Control Panel.
 * Turns content (projects, creatives, questions, settings) into HTML.
 * Everything a visitor sees passes through esc() or md(), so text is always escaped.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteRender = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var R = { VERSION: '1.0.0' };

  /* ------------------------------------------------------------------ basics */

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }
  R.esc = esc;

  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }

  function slugify(s, max) {
    var out = str(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (max && out.length > max) {
      out = out.slice(0, max);
      var cut = out.lastIndexOf('-');
      if (cut > max * 0.5) out = out.slice(0, cut);
    }
    return out;
  }
  R.slugify = slugify;

  /* Where uploaded files live. The Control Panel's preview points these elsewhere. */
  R.mediaBase = '';
  R.mediaMap = {};
  function src(path) {
    path = str(path);
    if (R.mediaMap && R.mediaMap[path]) return R.mediaMap[path];
    if (R.mediaBase && path.charAt(0) === '/' && path.indexOf('/media/') === 0) return R.mediaBase + path;
    return path;
  }
  R.src = src;

  var SECTIONS = [
    { key: 'projects', label: 'Projects', path: '/projects/', cat: 'Field', cats: 'Fields', kind: 'Type', noun: 'project' },
    { key: 'creatives', label: 'Creatives', path: '/creatives/', cat: 'Form', cats: 'Forms', kind: null, noun: 'piece' },
    { key: 'questions', label: 'Questions to Ask', path: '/questions/', cat: 'Field', cats: 'Fields', kind: null, noun: 'question' },
    { key: 'contact', label: 'Contact', path: '/contact/' }
  ];
  var SEC = {};
  SECTIONS.forEach(function (s) { SEC[s.key] = s; });
  R.SECTIONS = SECTIONS;
  R.SEC = SEC;

  var DEFAULT_INTROS = {
    projects: 'Builds, research, theories and papers.',
    creatives: 'Poems, art, stories and games made to be felt.',
    questions: 'Open questions nobody has answered yet, sorted by field.'
  };
  R.DEFAULT_INTROS = DEFAULT_INTROS;

  /* ------------------------------------------------------------------ dates */

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function parseDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(s));
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }
  function fmtDay(s, style) {
    var p = parseDay(s);
    if (!p || p.m < 1 || p.m > 12) return '';
    if (style === 'year') return String(p.y);
    if (style === 'month') return MONTHS[p.m - 1] + ' ' + p.y;
    return MONTHS[p.m - 1] + ' ' + p.d + ', ' + p.y;
  }
  R.fmtDay = fmtDay;

  function ago(iso, now) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var s = Math.max(0, ((now || Date.now()) - t) / 1000);
    if (s < 90) return 'just now';
    var m = s / 60, h = m / 60, d = h / 24;
    if (m < 60) return Math.round(m) + ' minutes ago';
    if (h < 24) return (Math.round(h) === 1 ? 'an hour' : Math.round(h) + ' hours') + ' ago';
    if (d < 2) return 'yesterday';
    if (d < 30) return Math.round(d) + ' days ago';
    if (d < 60) return 'a month ago';
    if (d < 365) return Math.round(d / 30.44) + ' months ago';
    var y = Math.round(d / 365.25);
    return y <= 1 ? 'a year ago' : y + ' years ago';
  }
  R.ago = ago;

  /* ------------------------------------------------------------------ links & URLs */

  function safeUrl(u) {
    u = str(u).trim();
    if (!u) return '';
    if (/^(https?:\/\/|mailto:)/i.test(u)) return u;
    if (/^pending:[a-z0-9-]+$/i.test(u)) return u;
    if (/^(\/|#|\.\/|\.\.\/)/.test(u) && !/^\/\//.test(u)) return u;
    if (/^media\//i.test(u)) return '/' + u;
    if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/\S*)?$/i.test(u)) return 'https://' + u;
    return '';
  }
  R.safeUrl = safeUrl;

  function isExternal(u) { return /^https?:\/\//i.test(u); }
  function extAttrs(u) { return isExternal(u) ? ' target="_blank" rel="noopener noreferrer"' : ''; }
  function hostOf(u) {
    var m = /^https?:\/\/(?:www\.)?([^/?#:]+)/i.exec(str(u));
    return m ? m[1] : '';
  }
  R.hostOf = hostOf;
  function prettyUrl(u) {
    var s = str(u).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
    return s.length > 48 ? s.slice(0, 45) + '…' : s;
  }

  /* ------------------------------------------------------------------ markdown (small, safe subset) */

  function inlineBasic(s) {
    s = esc(s);
    s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?![*\w])/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
    return s;
  }

  function imgTag(u, alt, cls) {
    return '<img src="' + esc(src(u)) + '" alt="' + esc(alt || '') + '" loading="lazy" decoding="async"' + (cls ? ' class="' + cls + '"' : '') + '>';
  }

  function inline(s) {
    var codes = [], toks = [];
    s = str(s).replace(/`([^`\n]+)`/g, function (_, c) {
      codes.push('<code>' + esc(c) + '</code>');
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    s = s.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g, function (all, alt, u) {
      var safe = safeUrl(u);
      if (!safe) return '';
      toks.push(imgTag(safe, alt, 'md-inline-img'));
      return '\u0001' + (toks.length - 1) + '\u0001';
    });
    s = s.replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g, function (all, text, u) {
      var safe = safeUrl(u);
      if (!safe) return text;
      var href = /^\/media\//.test(safe) ? src(safe) : safe;
      toks.push('<a href="' + esc(href) + '"' + extAttrs(href) + '>' + inlineBasic(text) + '</a>');
      return '\u0001' + (toks.length - 1) + '\u0001';
    });
    s = s.replace(/\bhttps?:\/\/[^\s<>()\u0001]+[^\s<>().,;:!?'"\u0001]/g, function (u) {
      toks.push('<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(prettyUrl(u)) + '</a>');
      return '\u0001' + (toks.length - 1) + '\u0001';
    });
    s = inlineBasic(s);
    s = s.replace(/\u0001(\d+)\u0001/g, function (_, n) { return toks[+n]; });
    s = s.replace(/\u0000(\d+)\u0000/g, function (_, n) { return codes[+n]; });
    return s;
  }
  R.inline = inline;

  function embed(line) {
    var m;
    m = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:\S*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})(?:[?&#]\S*)?$/i.exec(line);
    if (m) {
      return '<figure class="embed embed-video"><iframe src="https://www.youtube-nocookie.com/embed/' + m[1] +
        '" title="Video" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe></figure>';
    }
    m = /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)(?:[?#]\S*)?$/i.exec(line);
    if (m) {
      return '<figure class="embed embed-video"><iframe src="https://player.vimeo.com/video/' + m[1] +
        '?dnt=1" title="Video" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></figure>';
    }
    m = /^(\S+\.(?:mp3|m4a|ogg|oga|wav|flac))$/i.exec(line);
    if (m && safeUrl(m[1])) return '<figure class="embed embed-audio"><audio controls preload="none" src="' + esc(src(safeUrl(m[1]))) + '"></audio></figure>';
    m = /^(\S+\.(?:mp4|webm))$/i.exec(line);
    if (m && safeUrl(m[1])) return '<figure class="embed embed-file-video"><video controls preload="metadata" src="' + esc(src(safeUrl(m[1]))) + '"></video></figure>';
    return '';
  }

  var RE_FENCE = /^\s*(```|~~~)\s*([\w+-]*)\s*$/;
  var RE_HEADING = /^(#{1,4})\s+(.*?)\s*#*\s*$/;
  var RE_HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
  var RE_QUOTE = /^\s*>/;
  var RE_LIST = /^\s*([-*+]|\d{1,3}[.)])\s+(.*)$/;
  var RE_IMG_LINE = /^!\[([^\]]*)\]\(\s*(\S+?)(?:\s+"([^"]*)")?\s*\)$/;

  function isBlockStart(line) {
    var t = line.trim();
    return RE_FENCE.test(line) || RE_HEADING.test(line) || RE_HR.test(line) || RE_QUOTE.test(line) ||
      RE_LIST.test(line) || RE_IMG_LINE.test(t) || !!embed(t);
  }

  function leading(line) {
    var m = /^[ \t]+/.exec(line);
    if (!m) return '';
    var n = 0;
    for (var i = 0; i < m[0].length; i++) n += m[0][i] === '\t' ? 4 : 1;
    return new Array(n + 1).join('&nbsp;');
  }

  function figureHTML(u, alt, caption) {
    var safe = safeUrl(u);
    if (!safe) return '';
    return '<figure class="md-figure">' + imgTag(safe, alt, 'develop') +
      (caption ? '<figcaption>' + inlineBasic(caption) + '</figcaption>' : '') + '</figure>';
  }

  function md(text, depth) {
    depth = depth || 0;
    var lines = str(text).replace(/\r\n?/g, '\n').split('\n');
    var out = [], i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (/^\s*$/.test(line)) { i++; continue; }

      var fm = RE_FENCE.exec(line);
      if (fm) {
        var buf = [];
        i++;
        while (i < lines.length && !(new RegExp('^\\s*' + fm[1] + '\\s*$')).test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }
      var hm = RE_HEADING.exec(line);
      if (hm) {
        var lvl = Math.min(Math.max(hm[1].length, 2), 4);
        out.push('<h' + lvl + '>' + inline(hm[2]) + '</h' + lvl + '>');
        i++;
        continue;
      }
      if (RE_HR.test(line)) { out.push('<hr>'); i++; continue; }
      if (RE_QUOTE.test(line) && depth < 4) {
        var q = [];
        while (i < lines.length && RE_QUOTE.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        out.push('<blockquote>' + md(q.join('\n'), depth + 1) + '</blockquote>');
        continue;
      }
      var lm = RE_LIST.exec(line);
      if (lm) {
        var ordered = /\d/.test(lm[1]);
        var start = ordered ? parseInt(lm[1], 10) : 1;
        var items = [], cur = null;
        while (i < lines.length) {
          var l = lines[i], m2 = RE_LIST.exec(l);
          if (m2 && /\d/.test(m2[1]) === ordered) { cur = [m2[2]]; items.push(cur); i++; }
          else if (cur && /^\s{2,}\S/.test(l)) { cur.push(l.trim()); i++; }
          else if (/^\s*$/.test(l) && i + 1 < lines.length && RE_LIST.test(lines[i + 1])) { i++; }
          else break;
        }
        var lis = items.map(function (it) { return '<li>' + it.map(inline).join('<br>') + '</li>'; }).join('');
        out.push(ordered ? '<ol' + (start !== 1 ? ' start="' + start + '"' : '') + '>' + lis + '</ol>' : '<ul>' + lis + '</ul>');
        continue;
      }
      var t = line.trim();
      var im = RE_IMG_LINE.exec(t);
      if (im) { out.push(figureHTML(im[2], im[1], im[3])); i++; continue; }
      var em = embed(t);
      if (em) { out.push(em); i++; continue; }

      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && (para.length === 0 || !isBlockStart(lines[i]))) {
        para.push(lines[i]);
        i++;
      }
      out.push('<p>' + para.map(function (pl) { return leading(pl) + inline(pl.replace(/^[ \t]+/, '')); }).join('<br>') + '</p>');
    }
    return out.join('\n');
  }
  R.md = function (text) { return md(text, 0); };

  /* Markdown to plain text, for excerpts, search and descriptions. */
  function plain(text) {
    return str(text).replace(/\r\n?/g, '\n')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^\s*#{1,6}\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*([-*+]|\d{1,3}[.)])\s+/gm, '')
      .replace(/(\*\*|__|~~|`)/g, '')
      .replace(/(^|\W)[*_](\S[^*_]*?)[*_](?=\W|$)/g, '$1$2');
  }
  R.plain = plain;

  function clip(s, n) {
    s = str(s).replace(/\s+/g, ' ').trim();
    if (s.length <= n) return s;
    var cut = s.slice(0, n);
    var sp = cut.lastIndexOf(' ');
    return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.—-]+$/, '') + '…';
  }
  R.clip = clip;

  function excerptLines(text, maxLines, maxChars) {
    var lines = plain(text).split('\n').map(function (l) { return l.replace(/\s+$/, ''); });
    var out = [], chars = 0;
    for (var i = 0; i < lines.length && out.length < maxLines; i++) {
      var l = lines[i].trim();
      if (!l) { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
      if (/^(https?:\/\/\S+)$/.test(l)) continue;
      if (chars + l.length > maxChars) { out.push(clip(l, Math.max(24, maxChars - chars))); chars = maxChars; break; }
      out.push(l);
      chars += l.length;
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    var more = chars >= maxChars || out.length >= maxLines;
    return { lines: out, more: more };
  }

  /* ------------------------------------------------------------------ content */

  function normImage(im) {
    if (!im || typeof im !== 'object' || !im.src) return null;
    return { src: str(im.src), thumb: str(im.thumb), alt: str(im.alt), w: +im.w || 0, h: +im.h || 0, caption: str(im.caption) };
  }

  function normItem(sec, it) {
    it = it || {};
    var title = sec === 'questions' ? str(it.question || it.title) : str(it.title);
    return {
      id: str(it.id),
      slug: str(it.slug) || slugify(title, 64) || str(it.id),
      title: title,
      question: sec === 'questions' ? title : undefined,
      summary: str(it.summary),
      body: sec === 'questions' ? str(it.notes || it.body) : str(it.body),
      category: str(it.category).trim(),
      kind: sec === 'projects' ? str(it.kind).trim() : '',
      status: sec === 'projects' ? str(it.status).trim() : '',
      tags: arr(it.tags).map(function (t) { return str(t).trim(); }).filter(Boolean),
      date: str(it.date),
      created: str(it.created),
      updated: str(it.updated),
      cover: normImage(it.cover),
      gallery: arr(it.gallery).map(normImage).filter(Boolean),
      files: arr(it.files).filter(function (f) { return f && f.src; }).map(function (f) { return { name: str(f.name) || 'File', src: str(f.src), size: +f.size || 0 }; }),
      links: arr(it.links).filter(function (l) { return l && safeUrl(l.url); }).map(function (l) { return { label: str(l.label) || prettyUrl(l.url), url: safeUrl(l.url) }; }),
      draft: !!it.draft
    };
  }

  function byDate(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.created !== b.created) return a.created < b.created ? 1 : -1;
    return a.title.localeCompare(b.title);
  }

  R.normalize = function (c) {
    if (c && c.__normalized) return c;
    c = c || {};
    var site = c.site || {};
    var intros = {};
    var given = site.intros && typeof site.intros === 'object' ? site.intros : {};
    Object.keys(DEFAULT_INTROS).forEach(function (k) {
      intros[k] = typeof given[k] === 'string' ? given[k] : DEFAULT_INTROS[k];
    });
    var out = {
      __normalized: true,
      version: c.version || 1,
      updated: str(c.updated),
      site: {
        name: str(site.name).trim() || 'Austin Rolens',
        tagline: str(site.tagline).trim(),
        email: str(site.email).trim(),
        description: str(site.description).trim(),
        theme: site.theme === 'paper' ? 'paper' : 'night',
        url: str(site.url).replace(/\/+$/, ''),
        intros: intros,
        assetVersion: str(site.assetVersion) || R.VERSION,
        customVersion: str(site.customVersion)
      }
    };
    ['projects', 'creatives', 'questions'].forEach(function (k) {
      var seen = {};
      out[k] = arr(c[k]).map(function (it) { return normItem(k, it); })
        .filter(function (it) { return !it.draft && it.title; })
        .filter(function (it) { if (seen[it.slug]) return false; seen[it.slug] = 1; return true; })
        .sort(byDate);
    });
    return out;
  };

  function groupsOf(items) {
    var map = {}, list = [];
    items.forEach(function (it) {
      if (!it.category) return;
      var s = slugify(it.category) || 'other';
      if (!map[s]) { map[s] = { slug: s, label: it.category, count: 0 }; list.push(map[s]); }
      map[s].count++;
    });
    return list.sort(function (a, b) { return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }); });
  }
  R.groupsOf = groupsOf;

  function kindsOf(items) {
    var map = {}, list = [];
    items.forEach(function (it) {
      if (!it.kind) return;
      var s = slugify(it.kind);
      if (!map[s]) { map[s] = { slug: s, label: it.kind, count: 0 }; list.push(map[s]); }
      map[s].count++;
    });
    return list.sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label); });
  }

  function tagLabel(items, slug) {
    for (var i = 0; i < items.length; i++) {
      for (var j = 0; j < items[i].tags.length; j++) if (slugify(items[i].tags[j]) === slug) return items[i].tags[j];
    }
    return slug.replace(/-/g, ' ');
  }

  function filterItems(items, q) {
    return items.filter(function (it) {
      if (q.field && slugify(it.category) !== q.field) return false;
      if (q.type && slugify(it.kind) !== q.type) return false;
      if (q.theme && !it.tags.some(function (t) { return slugify(t) === q.theme; })) return false;
      return true;
    });
  }

  /* ------------------------------------------------------------------ routes */

  function parseQuery(search) {
    var q = {};
    str(search).replace(/^\?/, '').split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('=');
      var k = decodeSafe(i < 0 ? pair : pair.slice(0, i));
      var v = decodeSafe(i < 0 ? '' : pair.slice(i + 1).replace(/\+/g, ' '));
      q[k] = v;
    });
    return q;
  }
  function decodeSafe(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

  R.route = function (pathname, search) {
    var p = str(pathname || '/').replace(/\/index\.html?$/i, '/').replace(/\/{2,}/g, '/');
    var parts = p.split('/').filter(Boolean).map(decodeSafe);
    var q = parseQuery(search);
    if (!parts.length) return { name: 'home' };
    var sec = parts[0].toLowerCase();
    if (sec === 'projects' || sec === 'creatives' || sec === 'questions') {
      if (parts.length === 1) {
        return { name: 'section', section: sec, query: { field: slugify(q.field), type: slugify(q.type), theme: slugify(q.theme) } };
      }
      if (parts.length === 2) return { name: sec === 'questions' ? 'question' : 'item', section: sec, slug: parts[1].toLowerCase() };
    }
    if (sec === 'contact' && parts.length === 1) return { name: 'contact', section: 'contact' };
    return { name: 'notfound' };
  };

  function sectionHref(sec, q) {
    var parts = [];
    if (q) {
      if (q.field) parts.push('field=' + encodeURIComponent(q.field));
      if (q.type) parts.push('type=' + encodeURIComponent(q.type));
      if (q.theme) parts.push('theme=' + encodeURIComponent(q.theme));
    }
    return SEC[sec].path + (parts.length ? '?' + parts.join('&') : '');
  }
  R.sectionHref = sectionHref;
  function itemHref(sec, slug) { return SEC[sec].path + encodeURIComponent(slug) + '/'; }
  R.itemHref = itemHref;

  R.pathOf = function (route) {
    if (!route || route.name === 'home') return '/';
    if (route.name === 'section' || route.name === 'contact') return SEC[route.section].path;
    if (route.name === 'item' || route.name === 'question') return itemHref(route.section, route.slug);
    return '/404.html';
  };
  R.fileOf = function (route) {
    if (route.name === 'notfound') return '404.html';
    var p = R.pathOf(route);
    return (p === '/' ? '' : decodeSafe(p.slice(1))) + 'index.html';
  };

  /* ------------------------------------------------------------------ icons */

  var ICONS = {
    search: '<path d="M10.5 4.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm8.5 15-4.2-4.2"/>',
    night: '<path d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1Z"/>',
    paper: '<path d="M6.5 3.5h8l3 3v14h-11z"/><path d="M14.5 3.5v3h3"/>',
    sound: '<path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3z"/><path d="M15.2 9.2a4 4 0 0 1 0 5.6M17.8 6.8a7.5 7.5 0 0 1 0 10.4"/>',
    back: '<path d="M14.5 6.5 9 12l5.5 5.5"/>',
    close: '<path d="m6.5 6.5 11 11m0-11-11 11"/>',
    copy: '<rect x="8.5" y="8.5" width="10" height="11" rx="1.5"/><path d="M15.5 8.5v-2a1.5 1.5 0 0 0-1.5-1.5H7A1.5 1.5 0 0 0 5.5 6.5v9A1.5 1.5 0 0 0 7 17h1.5"/>',
    file: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4"/>',
    out: '<path d="M13.5 5.5h5v5"/><path d="m18.5 5.5-8 8"/><path d="M16.5 13.5v5h-11v-11h5"/>',
    shuffle: '<path d="M4.5 7.5h3.2c2.6 0 3.7 2 4.8 4.5s2.2 4.5 4.8 4.5h2.2"/><path d="m17 14 2.5 2.5L17 19"/><path d="M4.5 16.5h3.2c1.2 0 2.1-.4 2.8-1.1M14 8.6c.7-.7 1.6-1.1 2.8-1.1h2.2"/><path d="m17 5 2.5 2.5L17 10"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="m4 7 8 6 8-6"/>'
  };
  function icon(name, label) {
    return '<svg class="icon" viewBox="0 0 24 24" ' + (label ? 'role="img" aria-label="' + esc(label) + '"' : 'aria-hidden="true"') +
      ' focusable="false">' + ICONS[name] + '</svg>';
  }
  R.icon = icon;

  /* ------------------------------------------------------------------ shared bits */

  function controlsHTML(where) {
    return '<div class="controls controls-' + where + '">' +
      '<button type="button" class="ctl" data-action="search" aria-keyshortcuts="/ Control+K Meta+K">' + icon('search') + '<span class="ctl-label">Search</span><kbd class="ctl-key">/</kbd></button>' +
      '<button type="button" class="ctl" data-action="theme">' + icon('paper') + '<span class="ctl-label">Paper</span></button>' +
      '<button type="button" class="ctl" data-action="sound" aria-pressed="false">' + icon('sound') + '<span class="ctl-label">Room tone</span></button>' +
      '</div>';
  }

  function imgEl(im, opts) {
    opts = opts || {};
    var dims = im.w && im.h ? ' width="' + im.w + '" height="' + im.h + '"' : '';
    var file = opts.thumb && im.thumb ? im.thumb : im.src;
    return '<img src="' + esc(src(file)) + '" alt="' + esc(opts.alt != null ? opts.alt : im.alt) + '"' + dims +
      (opts.eager ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async" class="develop">';
  }

  function metaSpans(list) {
    return list.filter(Boolean).map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('');
  }

  function attrs(it) {
    return ' data-id="' + esc(it.id) + '" data-created="' + esc(it.created || it.date) + '"';
  }

  /* ------------------------------------------------------------------ rail */

  function railHTML(c, route) {
    var cur = route.section || '';
    var nav = SECTIONS.map(function (s) {
      var on = s.key === cur;
      var current = on ? (route.name === 'section' || route.name === 'contact' ? ' aria-current="page"' : ' aria-current="true"') : '';
      return '<a class="rail-link' + (on ? ' is-on' : '') + '" href="' + s.path + '" data-section="' + s.key + '"' + current + '>' +
        '<span class="rail-label">' + esc(s.label) + '</span>' +
        '<span class="rail-new" hidden></span>' +
        (s.key !== 'contact' ? '<span class="rail-count" data-count="' + s.key + '"></span>' : '') + '</a>';
    }).join('');

    var sub = '';
    if (cur && cur !== 'contact' && c[cur].length) {
      var groups = groupsOf(c[cur]);
      if (groups.length) {
        var active = '';
        if (route.name === 'section') active = route.query.field;
        else {
          var it = findItem(c, cur, route.slug);
          if (it && it.category) active = slugify(it.category);
        }
        var allOn = route.name === 'section' && !route.query.field;
        sub = '<nav class="rail-sub" aria-label="' + esc(SEC[cur].cats) + '">' +
          '<p class="rail-sub-title">' + esc(SEC[cur].cats) + '</p>' +
          '<a class="rail-field' + (allOn ? ' is-on' : '') + '" href="' + SEC[cur].path + '"' + (allOn ? ' aria-current="page"' : '') + '><span>All</span><span class="rail-count" data-count="' + cur + '" data-field=""></span></a>' +
          groups.map(function (g) {
            var on = active === g.slug;
            return '<a class="rail-field' + (on ? ' is-on' : '') + '" href="' + sectionHref(cur, { field: g.slug }) + '"' +
              (on && route.name === 'section' ? ' aria-current="page"' : '') + '><span>' + esc(g.label) + '</span><span class="rail-count" data-count="' + cur + '" data-field="' + g.slug + '"></span></a>';
          }).join('') + '</nav>';
      }
    }

    /* Counts and "Updated" are filled in by site.js, so publishing one item doesn't rewrite every page. */
    var updated = '<p class="rail-updated" hidden></p>';

    return '<header class="rail" id="rail">' +
      '<a class="rail-name" href="/">' + esc(c.site.name) + '</a>' +
      '<nav class="rail-nav" aria-label="Sections">' + nav + '</nav>' +
      sub +
      '<div class="rail-foot">' + controlsHTML('rail') + updated + '</div>' +
      '</header>';
  }

  /* ------------------------------------------------------------------ views */

  function findItem(c, sec, slug) {
    var list = c[sec] || [];
    for (var i = 0; i < list.length; i++) if (list[i].slug === slug) return list[i];
    return null;
  }
  R.findItem = findItem;

  function sectionHead(c, sec, extra) {
    var intro = c.site.intros[sec];
    return '<header class="sec-head"><h1 class="sec-title" tabindex="-1">' + esc(SEC[sec].label) + '</h1>' +
      (intro ? '<p class="sec-intro">' + esc(intro) + '</p>' : '') + (extra || '') + '</header>';
  }

  function emptyHTML(sec) {
    var lines = {
      projects: ['No projects published yet.', 'Builds, research and papers will appear here as they’re published.'],
      creatives: ['No creative work published yet.', 'Poems, art, stories and games will appear here.'],
      questions: ['No questions posted yet.', 'Open questions will appear here, sorted by field.']
    }[sec];
    return '<div class="empty"><p class="empty-title">' + esc(lines[0]) + '</p><p class="empty-line">' + esc(lines[1]) + '</p></div>';
  }

  function chip(href, label, on, count) {
    return '<a class="chip' + (on ? ' is-on' : '') + '" href="' + esc(href) + '"' + (on ? ' aria-current="page"' : '') + '>' +
      esc(label) + (count != null ? '<span class="chip-n">' + count + '</span>' : '') + '</a>';
  }

  function chipsHTML(c, sec, q) {
    var items = c[sec];
    var out = '';
    var groups = groupsOf(items);
    if (groups.length) {
      out += '<nav class="chips chips-fields" aria-label="' + esc(SEC[sec].cats) + '">' +
        chip(sectionHref(sec, { type: q.type, theme: q.theme }), 'All', !q.field) +
        groups.map(function (g) { return chip(sectionHref(sec, { field: g.slug, type: q.type, theme: q.theme }), g.label, q.field === g.slug, g.count); }).join('') +
        '</nav>';
    }
    if (SEC[sec].kind) {
      var kinds = kindsOf(items);
      if (kinds.length > 1) {
        out += '<nav class="chips chips-kinds" aria-label="' + esc(SEC[sec].kind) + '">' +
          chip(sectionHref(sec, { field: q.field, theme: q.theme }), 'Every type', !q.type) +
          kinds.map(function (k) { return chip(sectionHref(sec, { field: q.field, type: k.slug, theme: q.theme }), k.label, q.type === k.slug); }).join('') +
          '</nav>';
      }
    }
    if (q.theme) {
      out += '<p class="chips chips-active"><a class="chip is-on chip-clear" href="' + esc(sectionHref(sec, { field: q.field, type: q.type })) + '">' +
        'Theme: ' + esc(tagLabel(items, q.theme)) + icon('close', 'Remove theme filter') + '</a></p>';
    }
    return out ? '<div class="filters">' + out + '</div>' : '';
  }

  function projectRow(it) {
    var thumb = it.cover ? '<span class="entry-thumb">' + imgEl(it.cover, { alt: '', thumb: true }) + '</span>' : '';
    var meta = metaSpans([it.category, it.kind, it.status]);
    return '<li class="entry' + (thumb ? ' has-thumb' : '') + '"' + attrs(it) + '>' +
      '<a class="entry-link" href="' + itemHref('projects', it.slug) + '">' +
      '<span class="entry-text"><h3 class="entry-title">' + esc(it.title) + '</h3>' +
      (it.summary ? '<span class="entry-sum">' + esc(it.summary) + '</span>' : '') +
      (meta ? '<span class="entry-meta">' + meta + '</span>' : '') + '</span>' +
      thumb + '</a></li>';
  }

  function projectIndex(items) {
    var years = [], map = {};
    items.forEach(function (it) {
      var p = parseDay(it.date);
      var y = p ? String(p.y) : 'Undated';
      if (!map[y]) { map[y] = []; years.push(y); }
      map[y].push(it);
    });
    return '<div class="index">' + years.map(function (y) {
      var id = 'y-' + slugify(y);
      return '<section class="year" aria-labelledby="' + id + '"><h2 class="year-head" id="' + id + '">' + esc(y) + '</h2>' +
        '<ol class="entries">' + map[y].map(projectRow).join('') + '</ol></section>';
    }).join('') + '</div>';
  }

  function creativeTile(it) {
    var visual;
    if (it.cover) {
      visual = '<span class="tile-img"' + (it.cover.w && it.cover.h ? ' style="aspect-ratio:' + it.cover.w + '/' + it.cover.h + '"' : '') + '>' + imgEl(it.cover, { alt: '', thumb: true }) + '</span>';
    } else {
      var ex = excerptLines(it.body || it.summary, 7, 300);
      var text = ex.lines.length ? ex.lines.map(function (l) { return l ? esc(l) : ''; }).join('<br>') : esc(it.summary || it.title);
      visual = '<span class="tile-text">' + text.replace(/(<br>){2,}/g, '<br><span class="tile-gap"></span>') + (ex.more ? '<span class="tile-more" aria-hidden="true">…</span>' : '') + '</span>';
    }
    return '<li class="tile' + (it.cover ? ' tile-has-img' : ' tile-has-text') + '"' + attrs(it) + '>' +
      '<a class="tile-link" href="' + itemHref('creatives', it.slug) + '">' + visual +
      '<span class="tile-cap"><h2 class="tile-title">' + esc(it.title) + '</h2>' +
      '<span class="tile-meta">' + metaSpans([it.category, fmtDay(it.date, 'year')]) + '</span></span></a></li>';
  }

  function creativeWall(items) {
    return '<ul class="wall">' + items.map(creativeTile).join('') + '</ul>';
  }

  function tagLinks(sec, tags) {
    return tags.map(function (t) {
      return '<a class="tag" href="' + esc(sectionHref(sec, { theme: slugify(t) })) + '">' + esc(t) + '</a>';
    }).join('');
  }

  function questionRow(it) {
    var notes = it.body ? '<details class="q-notes"><summary>Notes</summary><div class="md">' + md(it.body) + '</div></details>' : '';
    var tags = tagLinks('questions', it.tags);
    return '<li class="q" id="q-' + esc(it.slug) + '"' + attrs(it) + '>' +
      '<a class="q-text" href="' + itemHref('questions', it.slug) + '">' + esc(it.title) + '</a>' +
      '<div class="q-meta">' + (it.date ? '<span class="q-date">' + esc(fmtDay(it.date)) + '</span>' : '') + tags + '</div>' +
      notes + '</li>';
  }

  function questionStream(items, q) {
    if (q.field) return '<ol class="qlist">' + items.map(questionRow).join('') + '</ol>';
    var groups = groupsOf(items);
    if (!groups.length) return '<ol class="qlist">' + items.map(questionRow).join('') + '</ol>';
    var html = groups.map(function (g) {
      var list = items.filter(function (it) { return slugify(it.category) === g.slug; });
      return '<section class="qgroup" aria-labelledby="g-' + g.slug + '">' +
        '<h2 class="qgroup-title" id="g-' + g.slug + '"><a href="' + esc(sectionHref('questions', { field: g.slug, theme: q.theme })) + '">' + esc(g.label) + '</a><span class="qgroup-n">' + list.length + '</span></h2>' +
        '<ol class="qlist">' + list.map(questionRow).join('') + '</ol></section>';
    }).join('');
    var loose = items.filter(function (it) { return !it.category; });
    if (loose.length) {
      html += '<section class="qgroup" aria-labelledby="g-other"><h2 class="qgroup-title" id="g-other"><span>Other questions</span><span class="qgroup-n">' + loose.length + '</span></h2>' +
        '<ol class="qlist">' + loose.map(questionRow).join('') + '</ol></section>';
    }
    return html;
  }

  function viewSection(c, sec, q) {
    var items = c[sec];
    var extra = '';
    if (sec === 'questions' && items.length > 1) {
      extra = '<p class="sec-actions"><button type="button" class="btn" data-action="random-question" hidden>' + icon('shuffle') + 'Show me a question</button></p>';
    }
    var head = sectionHead(c, sec, extra);
    if (!items.length) return head + emptyHTML(sec);
    var list = filterItems(items, q);
    var body;
    if (!list.length) {
      body = '<div class="empty"><p class="empty-title">Nothing matches this filter.</p><p class="empty-line"><a href="' + SEC[sec].path + '">Show everything in ' + esc(SEC[sec].label) + '</a></p></div>';
    } else if (sec === 'projects') body = projectIndex(list);
    else if (sec === 'creatives') body = creativeWall(list);
    else body = questionStream(list, q);
    return head + chipsHTML(c, sec, q) + body;
  }

  function fileSize(n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
  }
  R.fileSize = fileSize;

  function pagerHTML(sec, list, idx) {
    var newer = idx > 0 ? list[idx - 1] : null;
    var older = idx < list.length - 1 ? list[idx + 1] : null;
    if (!newer && !older) return '';
    function one(it, rel, label) {
      if (!it) return '<span class="pager-gap"></span>';
      return '<a class="pager-link pager-' + rel + '" href="' + itemHref(sec, it.slug) + '" data-rel="' + rel + '">' +
        '<span class="pager-label">' + label + '</span><span class="pager-title">' + esc(it.title) + '</span></a>';
    }
    return '<nav class="pager" aria-label="More in ' + esc(SEC[sec].label) + '">' + one(newer, 'newer', 'Newer') + one(older, 'older', 'Older') + '</nav>';
  }

  function viewItem(c, sec, slug) {
    var list = c[sec];
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].slug === slug) { idx = i; break; }
    if (idx < 0) return null;
    var it = list[idx];
    var s = SEC[sec];
    var facts = [];
    if (it.category) facts.push([s.cat, '<a href="' + esc(sectionHref(sec, { field: slugify(it.category) })) + '">' + esc(it.category) + '</a>']);
    if (it.kind) facts.push([s.kind, '<a href="' + esc(sectionHref(sec, { type: slugify(it.kind) })) + '">' + esc(it.kind) + '</a>']);
    if (it.status) facts.push(['Status', esc(it.status)]);
    if (it.date) facts.push([sec === 'creatives' ? 'Made' : 'Date', esc(fmtDay(it.date))]);

    var cover = it.cover ? '<figure class="item-cover"><a class="zoom" href="' + esc(src(it.cover.src)) + '" data-zoom>' + imgEl(it.cover, { eager: true }) + '</a>' +
      (it.cover.caption ? '<figcaption>' + esc(it.cover.caption) + '</figcaption>' : '') + '</figure>' : '';

    var gallery = it.gallery.length ? '<section class="gallery" aria-label="Images"><ul class="gallery-grid">' + it.gallery.map(function (im) {
      return '<li><figure><a class="zoom" href="' + esc(src(im.src)) + '" data-zoom>' + imgEl(im, { thumb: true }) + '</a>' +
        (im.caption ? '<figcaption>' + esc(im.caption) + '</figcaption>' : '') + '</figure></li>';
    }).join('') + '</ul></section>' : '';

    var files = it.files.length ? '<section class="attach"><h2 class="attach-title">Files</h2><ul class="attach-list">' + it.files.map(function (f) {
      return '<li><a href="' + esc(src(f.src)) + '" download>' + icon('file') + '<span class="attach-name">' + esc(f.name) + '</span>' +
        (f.size ? '<span class="attach-size">' + fileSize(f.size) + '</span>' : '') + '</a></li>';
    }).join('') + '</ul></section>' : '';

    var links = it.links.length ? '<section class="attach"><h2 class="attach-title">Links</h2><ul class="attach-list">' + it.links.map(function (l) {
      var href = /^\/media\//.test(l.url) ? src(l.url) : l.url;
      return '<li><a href="' + esc(href) + '"' + extAttrs(href) + '>' + icon('out') + '<span class="attach-name">' + esc(l.label) + '</span>' +
        (isExternal(href) ? '<span class="attach-size">' + esc(hostOf(href)) + '</span>' : '') + '</a></li>';
    }).join('') + '</ul></section>' : '';

    var tags = it.tags.length ? '<p class="themes"><span class="themes-label">Themes</span>' + tagLinks(sec, it.tags) + '</p>' : '';

    return '<article class="item item-' + sec + '"' + attrs(it) + '>' +
      '<a class="crumb" href="' + s.path + '">' + icon('back') + esc(s.label) + '</a>' +
      '<header class="item-head"><h1 class="item-title" tabindex="-1">' + esc(it.title) + '</h1>' +
      (it.summary ? '<p class="item-sum">' + esc(it.summary) + '</p>' : '') +
      (facts.length ? '<dl class="facts">' + facts.map(function (f) { return '<div><dt>' + esc(f[0]) + '</dt><dd>' + f[1] + '</dd></div>'; }).join('') + '</dl>' : '') +
      '</header>' + cover +
      (it.body ? '<div class="md item-body">' + md(it.body) + '</div>' : '') +
      gallery + files + links + tags + pagerHTML(sec, list, idx) +
      '</article>';
  }

  function viewQuestion(c, slug) {
    var list = c.questions;
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].slug === slug) { idx = i; break; }
    if (idx < 0) return null;
    var it = list[idx];
    return '<article class="qpage"' + attrs(it) + '>' +
      '<a class="crumb" href="/questions/">' + icon('back') + 'Questions to Ask</a>' +
      '<div class="qpage-body">' +
      (it.category ? '<p class="qpage-field"><a href="' + esc(sectionHref('questions', { field: slugify(it.category) })) + '">' + esc(it.category) + '</a></p>' : '') +
      '<h1 class="qpage-text" tabindex="-1">' + esc(it.title) + '</h1>' +
      (it.date ? '<p class="qpage-date">Asked ' + esc(fmtDay(it.date)) + '</p>' : '') +
      (it.body ? '<div class="md qpage-notes">' + md(it.body) + '</div>' : '') +
      (it.tags.length ? '<p class="themes"><span class="themes-label">Themes</span>' + tagLinks('questions', it.tags) + '</p>' : '') +
      (list.length > 1 ? '<p class="qpage-actions"><button type="button" class="btn" data-action="random-question" hidden>' + icon('shuffle') + 'Show me another</button></p>' : '') +
      '</div>' + pagerHTML('questions', list, idx) + '</article>';
  }

  function viewContact(c) {
    var e = c.site.email;
    return '<section class="contact" aria-labelledby="contact-title">' +
      '<h1 class="sec-title" id="contact-title" tabindex="-1">Contact</h1>' +
      (e ? '<p class="contact-mail"><a href="mailto:' + esc(e) + '">' + esc(e) + '</a></p>' +
        '<p class="contact-actions"><button type="button" class="btn" data-action="copy" data-copy="' + esc(e) + '" hidden>' + icon('copy') + '<span>Copy address</span></button>' +
        '<a class="btn" href="mailto:' + esc(e) + '">' + icon('mail') + '<span>Write an email</span></a></p>'
        : '<div class="empty"><p class="empty-title">No contact address yet.</p></div>') +
      '</section>';
  }

  function viewNotFound() {
    return '<section class="notfound"><h1 class="sec-title" tabindex="-1">Nothing here</h1>' +
      '<p class="sec-intro">This page doesn’t exist, or it has moved.</p>' +
      '<p class="notfound-links">' + SECTIONS.map(function (s) { return '<a href="' + s.path + '">' + esc(s.label) + '</a>'; }).join('') + '</p></section>';
  }

  function homeHTML(c) {
    return '<main class="home" id="main">' +
      '<div class="home-glow" aria-hidden="true"></div>' +
      '<h1 class="home-name">' + esc(c.site.name) + '</h1>' +
      (c.site.tagline ? '<p class="home-line">' + esc(c.site.tagline) + '</p>' : '') +
      '<nav class="home-nav" aria-label="Sections">' + SECTIONS.map(function (s) {
        return '<a href="' + s.path + '" data-section="' + s.key + '">' + esc(s.label) + '<span class="home-new" hidden></span></a>';
      }).join('') + '</nav>' +
      '</main>' + controlsHTML('home');
  }

  /* render(content, route) -> what goes inside <div id="view">, plus page metadata */
  R.render = function (content, route) {
    var c = R.normalize(content);
    var name = c.site.name;
    var desc = c.site.description || ('Projects, creative work and open questions by ' + name + '.');
    var v = { title: name, description: desc, image: '', layout: 'app', bodyClass: '', html: '', status: 200 };
    var main = '';

    if (route.name === 'home') {
      v.layout = 'home';
      v.bodyClass = 'is-home';
      v.html = homeHTML(c);
      return v;
    }
    if (route.name === 'section') {
      v.title = SEC[route.section].label + ' — ' + name;
      if (c.site.intros[route.section]) v.description = c.site.intros[route.section];
      main = viewSection(c, route.section, route.query || {});
    } else if (route.name === 'item') {
      main = viewItem(c, route.section, route.slug);
      var it = findItem(c, route.section, route.slug);
      if (main && it) {
        v.title = it.title + ' — ' + name;
        v.description = it.summary || clip(plain(it.body), 180) || desc;
        if (it.cover) v.image = it.cover.src;
        if (route.section === 'creatives') v.bodyClass = 'is-reading';
      }
    } else if (route.name === 'question') {
      main = viewQuestion(c, route.slug);
      var qi = findItem(c, 'questions', route.slug);
      if (main && qi) {
        v.title = clip(qi.title, 70) + ' — ' + name;
        v.description = qi.body ? clip(plain(qi.body), 180) : ('An open question from ' + name + '.');
        v.bodyClass = 'is-reading';
      }
    } else if (route.name === 'contact') {
      v.title = 'Contact — ' + name;
      v.description = 'How to reach ' + name + '.';
      main = viewContact(c);
    }
    if (!main) {
      v.status = 404;
      v.title = 'Not found — ' + name;
      main = viewNotFound();
      route = { name: 'notfound' };
    }
    v.html = '<a class="skip" href="#main">Skip to content</a>' +
      '<div class="app">' + railHTML(c, route) +
      '<main class="main" id="main" data-route="' + esc(route.name) + '">' + main + '</main></div>';
    return v;
  };

  /* ------------------------------------------------------------------ full documents (for publishing) */

  var THEME_BOOT = "(function(d){d.classList.add('js');try{var t=localStorage.getItem('ar-theme');if(t==='night'||t==='paper')d.setAttribute('data-theme',t);if(localStorage.getItem('ar-seen'))d.classList.add('seen')}catch(e){}setTimeout(function(){if(!window.__siteReady)d.classList.remove('js')},6000)})(document.documentElement);";
  R.THEME_BOOT = THEME_BOOT;

  function absUrl(base, path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return base ? base + (path.charAt(0) === '/' ? '' : '/') + path : '';
  }

  R.headMeta = function (c, route, v) {
    var base = c.site.url;
    var path = R.pathOf(route);
    var image = absUrl(base, v.image || '/assets/share.png');
    var out = '<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
      '<title>' + esc(v.title) + '</title>\n' +
      '<meta name="description" content="' + esc(v.description) + '">\n' +
      '<meta name="theme-color" content="#0e0a0b">\n' +
      '<meta name="color-scheme" content="dark light">\n';
    if (base && v.status !== 404) out += '<link rel="canonical" href="' + esc(base + path) + '">\n';
    out += '<meta property="og:site_name" content="' + esc(c.site.name) + '">\n' +
      '<meta property="og:title" content="' + esc(v.title) + '">\n' +
      '<meta property="og:description" content="' + esc(v.description) + '">\n' +
      '<meta property="og:type" content="' + (route.name === 'item' || route.name === 'question' ? 'article' : 'website') + '">\n' +
      (base ? '<meta property="og:url" content="' + esc(base + path) + '">\n' : '') +
      (image ? '<meta property="og:image" content="' + esc(image) + '">\n<meta name="twitter:card" content="summary_large_image">\n' : '');
    return out;
  };

  R.document = function (content, route, opts) {
    opts = opts || {};
    var c = R.normalize(content);
    var v = R.render(c, route);
    var av = encodeURIComponent(c.site.assetVersion || R.VERSION);
    var cv = encodeURIComponent(c.site.customVersion || av);
    return '<!doctype html>\n<html lang="en" data-theme="' + c.site.theme + '">\n<head>\n' +
      R.headMeta(c, route, v) +
      '<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">\n' +
      '<link rel="icon" href="/favicon.ico" sizes="32x32">\n' +
      '<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">\n' +
      '<link rel="alternate" type="application/atom+xml" title="' + esc(c.site.name) + '" href="/feed.xml">\n' +
      '<link rel="preload" href="/assets/fonts/piazzolla.woff2" as="font" type="font/woff2" crossorigin>\n' +
      '<link rel="preload" href="/assets/fonts/archivo.woff2" as="font" type="font/woff2" crossorigin>\n' +
      '<link rel="stylesheet" href="/assets/site.css?v=' + av + '">\n' +
      '<link rel="stylesheet" href="/assets/custom.css?v=' + cv + '">\n' +
      '<script>' + THEME_BOOT + '</script>\n' +
      '<script src="/assets/render.js?v=' + av + '" defer></script>\n' +
      '<script src="/assets/site.js?v=' + av + '" defer></script>\n' +
      '</head>\n<body' + (v.bodyClass ? ' class="' + v.bodyClass + '"' : '') + '>\n' +
      '<div class="grain" aria-hidden="true"></div>\n' +
      '<div id="view">' + v.html + '</div>\n' +
      '<div id="announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>\n' +
      '</body>\n</html>\n';
  };

  /* All routes that get their own published page. */
  R.allRoutes = function (content) {
    var c = R.normalize(content);
    var routes = [
      { name: 'home' },
      { name: 'section', section: 'projects', query: {} },
      { name: 'section', section: 'creatives', query: {} },
      { name: 'section', section: 'questions', query: {} },
      { name: 'contact', section: 'contact' }
    ];
    c.projects.forEach(function (it) { routes.push({ name: 'item', section: 'projects', slug: it.slug }); });
    c.creatives.forEach(function (it) { routes.push({ name: 'item', section: 'creatives', slug: it.slug }); });
    c.questions.forEach(function (it) { routes.push({ name: 'question', section: 'questions', slug: it.slug }); });
    return routes;
  };

  /* Search index for the site and the Control Panel. */
  R.searchIndex = function (content) {
    var c = R.normalize(content);
    var out = [];
    ['projects', 'creatives', 'questions'].forEach(function (sec) {
      c[sec].forEach(function (it) {
        out.push({
          section: sec,
          sectionLabel: SEC[sec].label,
          title: it.title,
          sub: [it.category, it.kind].filter(Boolean).join(', '),
          url: itemHref(sec, it.slug),
          hay: [it.title, it.summary, it.category, it.kind, it.tags.join(' '), plain(it.body)].join(' \n ').toLowerCase(),
          head: (it.title + ' ' + it.category + ' ' + it.tags.join(' ')).toLowerCase(),
          date: it.date
        });
      });
    });
    return out;
  };

  return R;
});
