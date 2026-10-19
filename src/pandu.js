/*!
 * Pandu 1.0.0 — accessible, framework-free site navigation
 * Enhances plain HTML links into WAI-ARIA disclosure dropdowns, mega-menus
 * and a mobile drawer. Without this file the menu still works as links.
 * MIT License · https://github.com/juslangit/pandu
 */
(function (window, document) {
  'use strict';

  var VERSION = '1.0.0';
  var TOP = '.pandu__list > .pandu__item > .pandu__link, .pandu__list > .pandu__item > .pandu__trigger';
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  var uid = 0;
  var canHover = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : { matches: false };

  function isShown(el) {
    return !!(el && el.getClientRects().length && window.getComputedStyle(el).visibility !== 'hidden');
  }
  function focusables(scope) {
    return Array.prototype.filter.call(scope.querySelectorAll(FOCUSABLE), isShown);
  }
  function ensureId(el, prefix) {
    if (!el.id) el.id = prefix + '-' + (++uid);
    return el.id;
  }
  // Swap an <a> for a <button>, keeping its classes, content and data-* attributes.
  function toButton(link) {
    if (link.tagName === 'BUTTON') return link;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = link.className;
    btn.innerHTML = link.innerHTML;
    for (var i = 0; i < link.attributes.length; i++) {
      var a = link.attributes[i];
      if (a.name.indexOf('data-') === 0 || a.name === 'aria-label' || a.name === 'id') btn.setAttribute(a.name, a.value);
    }
    btn.setAttribute('data-pandu-href', link.getAttribute('href') || '');
    link.parentNode.replaceChild(btn, link);
    return btn;
  }
  function emit(el, name, detail) {
    var ev;
    try { ev = new CustomEvent(name, { bubbles: true, detail: detail }); }
    catch (e) { ev = document.createEvent('CustomEvent'); ev.initCustomEvent(name, true, false, detail); }
    el.dispatchEvent(ev);
  }

  function Pandu(root, options) {
    if (!(this instanceof Pandu)) return new Pandu(root, options);
    if (root.pandu) return root.pandu;
    var d = root.dataset;
    this.root = root;
    this.options = Object.assign({
      hover: d.panduHover !== 'false',
      hoverDelay: d.panduHoverDelay ? +d.panduHoverDelay : 120,
      closeDelay: d.panduCloseDelay ? +d.panduCloseDelay : 300,
      current: d.panduCurrent === 'auto',
      closeLabel: 'Close menu'
    }, options || {});
    this.menu = root.querySelector('.pandu__menu');
    this.items = [];
    this.active = null;       // open panel item on wide screens
    this.compact = false;
    this.drawerOpen = false;
    this._inerted = [];
    this._timer = 0;
    root.pandu = this;
    if (this.menu) this._build();
  }

  Pandu.prototype._build = function () {
    var self = this, root = this.root, menu = this.menu;
    ensureId(menu, 'pandu-menu');

    // Mobile toggle: an <a href="#menu"> (works without JS via :target) becomes a button.
    var toggle = root.querySelector('.pandu__toggle');
    if (toggle) {
      toggle = toButton(toggle);
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', menu.id);
      if (!toggle.textContent.trim() && !toggle.getAttribute('aria-label')) toggle.setAttribute('aria-label', 'Menu');
      toggle.addEventListener('click', function () { self.toggleDrawer(); });
      this.toggle = toggle;
    }
    var close = root.querySelector('.pandu__close');
    if (close) {
      close = toButton(close);
      if (!close.textContent.trim() && !close.getAttribute('aria-label')) close.setAttribute('aria-label', this.options.closeLabel);
      close.addEventListener('click', function () { self.closeDrawer(true); });
      this.closeBtn = close;
    }
    var scrim = document.createElement('div');
    scrim.className = 'pandu__scrim';
    scrim.setAttribute('aria-hidden', 'true');
    scrim.addEventListener('click', function () { self.closeDrawer(true); });
    root.appendChild(scrim);

    // Every item with a panel gets a disclosure button.
    Array.prototype.forEach.call(root.querySelectorAll('.pandu__item'), function (li) {
      var panel = li.querySelector(':scope > .pandu__panel');
      var trigger = li.querySelector(':scope > .pandu__trigger');
      if (!panel || !trigger) return;
      var href = trigger.getAttribute('href');
      trigger = toButton(trigger);
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', ensureId(panel, 'pandu-panel'));
      // The trigger's own page must stay reachable: add an overview link if the panel lacks one.
      if (href && href.charAt(0) !== '#' && !Array.prototype.some.call(panel.querySelectorAll('a'), function (a) { return a.getAttribute('href') === href; })) {
        var ov = document.createElement('a');
        ov.className = 'pandu__overview';
        ov.href = href;
        ov.textContent = trigger.getAttribute('data-pandu-overview') || (trigger.textContent.trim() + ' overview');
        panel.insertBefore(ov, panel.firstChild);
      }
      var item = { li: li, trigger: trigger, panel: panel, via: null };
      self.items.push(item);

      trigger.addEventListener('click', function () {
        if (self.isOpen(item)) {
          // A panel opened by hover is pinned by a click instead of closing under the pointer.
          if (item.via === 'hover' && !self.compact) { item.via = 'click'; return; }
          self.closePanel(item);
        } else {
          self.openPanel(item, 'click');
        }
      });
      li.addEventListener('pointerenter', function (e) { self._hover(item, e, true); });
      li.addEventListener('pointerleave', function (e) { self._hover(item, e, false); });
    });

    if (this.options.current) this.markCurrent();

    // Listen on the document so Esc still works when focus has dropped to <body>
    // (for example after tapping plain text inside the drawer).
    this._onDocKey = function (e) {
      if (root.contains(e.target) || self.drawerOpen || self.active) self._onKey(e);
    };
    document.addEventListener('keydown', this._onDocKey);
    root.addEventListener('focusout', function (e) { self._onFocusOut(e); });
    root.addEventListener('click', function (e) {
      // Following a link (including same-page #anchors) closes whatever is open.
      var a = e.target.closest && e.target.closest('a[href]');
      if (a && self.menu.contains(a)) {
        self.closeAll();
        if (self.drawerOpen) self.closeDrawer(false);
      }
    });
    this._onDocPointer = function (e) {
      if (self.active && !self.compact && !self.active.li.contains(e.target)) self.closeAll();
    };
    document.addEventListener('pointerdown', this._onDocPointer);
    var raf = 0;
    this._onResize = function () {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () { self._measure(); });
    };
    window.addEventListener('resize', this._onResize);
    window.addEventListener('load', this._onResize);
    // The toggle's box changes whenever the stylesheet shows or hides it: at the
    // breakpoint, and when CSS finishes loading after this script (seen in Safari).
    if (this.toggle && window.ResizeObserver) {
      this._ro = new ResizeObserver(this._onResize);
      this._ro.observe(this.toggle);
    }
    this._onPageShow = function (e) { if (e.persisted) { self.closeAll(); self.closeDrawer(false); } };
    window.addEventListener('pageshow', this._onPageShow);

    // A no-JS visit may have left #menu in the address bar; drop it so :target styles do not linger.
    if (window.location.hash === '#' + menu.id && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    root.classList.add('pandu--ready');
    this._measure();
    emit(root, 'pandu:ready', { pandu: this });
  };

  // The stylesheet decides the breakpoint: compact mode is "the toggle is visible".
  Pandu.prototype._measure = function () {
    var compact = !!(this.toggle && window.getComputedStyle(this.toggle).display !== 'none');
    if (compact === this.compact) return;
    this.closeAll();
    if (this.drawerOpen) this.closeDrawer(false);
    this.compact = compact;
    this.root.classList.toggle('pandu--compact', compact);
  };

  Pandu.prototype.isOpen = function (item) { return item.trigger.getAttribute('aria-expanded') === 'true'; };

  Pandu.prototype.openPanel = function (item, via) {
    clearTimeout(this._timer);
    this.root.classList.add('pandu--animate');
    if (!this.compact && this.active && this.active !== item) this.closePanel(this.active);
    item.via = via || 'click';
    item.trigger.setAttribute('aria-expanded', 'true');
    item.li.classList.add('pandu__item--open');
    if (!this.compact) this.active = item;
    emit(this.root, 'pandu:toggle', { open: true, trigger: item.trigger, panel: item.panel });
  };

  Pandu.prototype.closePanel = function (item, returnFocus) {
    if (!item || !this.isOpen(item)) return;
    item.trigger.setAttribute('aria-expanded', 'false');
    item.li.classList.remove('pandu__item--open');
    item.via = null;
    if (this.active === item) this.active = null;
    if (returnFocus) item.trigger.focus();
    emit(this.root, 'pandu:toggle', { open: false, trigger: item.trigger, panel: item.panel });
  };

  Pandu.prototype.closeAll = function () {
    clearTimeout(this._timer);
    for (var i = 0; i < this.items.length; i++) this.closePanel(this.items[i]);
  };

  Pandu.prototype._hover = function (item, e, entering) {
    if (!this.options.hover || this.compact || e.pointerType !== 'mouse' || !canHover.matches) return;
    var self = this;
    clearTimeout(this._timer);
    if (entering) {
      if (this.isOpen(item)) return;
      // Moving between items while one is open switches at once; otherwise wait for intent.
      var delay = this.active ? 0 : this.options.hoverDelay;
      this._timer = setTimeout(function () { self.openPanel(item, 'hover'); }, delay);
    } else if (this.isOpen(item) && item.via === 'hover') {
      this._timer = setTimeout(function () { self.closePanel(item); }, this.options.closeDelay);
    }
  };

  // ---- Drawer (compact screens) ----
  Pandu.prototype.toggleDrawer = function () { this.drawerOpen ? this.closeDrawer(true) : this.openDrawer(); };

  Pandu.prototype.openDrawer = function () {
    if (this.drawerOpen || !this.compact) return;
    this.drawerOpen = true;
    this.root.classList.add('pandu--animate');
    this.root.classList.add('pandu--open');
    if (this.toggle) this.toggle.setAttribute('aria-expanded', 'true');
    this._setInert(true);
    this._lockScroll(true);
    var first = this.menu.querySelector(TOP) || focusables(this.menu)[0];
    var menu = this.menu;
    // Wait one frame so the drawer is visible before focus moves into it.
    requestAnimationFrame(function () { (first || menu).focus(); });
    emit(this.root, 'pandu:drawer', { open: true });
  };

  Pandu.prototype.closeDrawer = function (returnFocus) {
    if (!this.drawerOpen) return;
    this.drawerOpen = false;
    this.root.classList.remove('pandu--open');
    if (this.toggle) this.toggle.setAttribute('aria-expanded', 'false');
    this._setInert(false);
    this._lockScroll(false);
    if (returnFocus && this.toggle) this.toggle.focus();
    emit(this.root, 'pandu:drawer', { open: false });
  };

  // Everything outside the drawer becomes inert: siblings of the drawer and of each ancestor.
  Pandu.prototype._setInert = function (on) {
    if (!on) {
      this._inerted.forEach(function (el) { el.inert = false; el.removeAttribute('inert'); });
      this._inerted = [];
      return;
    }
    var node = this.menu;
    while (node && node !== document.body && node.parentNode) {
      var sibs = node.parentNode.children;
      for (var i = 0; i < sibs.length; i++) {
        var s = sibs[i];
        if (s === node || s.inert || s.hasAttribute('inert') || /^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(s.tagName)) continue;
        if (s.classList.contains('pandu__scrim')) continue;
        s.inert = true;
        s.setAttribute('inert', '');
        this._inerted.push(s);
      }
      node = node.parentNode;
    }
  };

  Pandu.prototype._lockScroll = function (on) {
    var html = document.documentElement, body = document.body;
    if (on) {
      var gap = window.innerWidth - html.clientWidth;
      this._pad = body.style.paddingRight;
      if (gap > 0) body.style.paddingRight = gap + 'px';
      html.classList.add('pandu-lock');
    } else {
      html.classList.remove('pandu-lock');
      body.style.paddingRight = this._pad || '';
    }
  };

  // ---- Keyboard ----
  Pandu.prototype._onKey = function (e) {
    var key = e.key, t = e.target;
    // Option+Tab is how Safari users tab to links, so Alt is only ignored for other keys.
    if (e.ctrlKey || e.metaKey || (e.altKey && key !== 'Tab')) return;

    if (key === 'Escape' || key === 'Esc') {
      if (this.compact && this.drawerOpen) { e.preventDefault(); this.closeDrawer(true); return; }
      var open = this.active || this._itemOf(t);
      if (open && this.isOpen(open)) { e.preventDefault(); this.closePanel(open, this.root.contains(t) || t === document.body); }
      return;
    }

    if (this.compact) {
      if (!this.drawerOpen) return;
      if (key === 'Tab') return this._trapTab(e);
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
        var list = focusables(this.menu);
        if (list.indexOf(t) < 0) return;
        e.preventDefault();
        this._move(list, t, key);
      }
      return;
    }

    var tops = Array.prototype.filter.call(this.menu.querySelectorAll(TOP), isShown);
    var ti = tops.indexOf(t);
    var item = this._itemOf(t);

    if (ti > -1) {
      // Focus is on a top-level link or trigger.
      if (key === 'ArrowRight' || key === 'ArrowLeft' || key === 'Home' || key === 'End') {
        e.preventDefault();
        var next = key === 'Home' ? 0 : key === 'End' ? tops.length - 1 :
          (ti + (key === 'ArrowRight' ? 1 : -1) + tops.length) % tops.length;
        if (this.active && this.active.trigger !== tops[next]) this.closePanel(this.active);
        tops[next].focus();
      } else if (item && item.trigger === t && (key === 'ArrowDown' || key === 'ArrowUp')) {
        e.preventDefault();
        this.openPanel(item, 'key');
        var links = this._panelLinks(item);
        var self = this;
        requestAnimationFrame(function () {
          links = self._panelLinks(item);
          if (links.length) links[key === 'ArrowDown' ? 0 : links.length - 1].focus();
        });
      }
      return;
    }

    if (item && item.panel.contains(t)) {
      // Focus is inside an open panel.
      var inPanel = this._panelLinks(item);
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
        e.preventDefault();
        this._move(inPanel, t, key);
      } else if (key === 'ArrowRight' || key === 'ArrowLeft') {
        var at = tops.indexOf(item.trigger);
        if (at < 0) return;
        e.preventDefault();
        this.closePanel(item);
        tops[(at + (key === 'ArrowRight' ? 1 : -1) + tops.length) % tops.length].focus();
      }
    }
  };

  Pandu.prototype._move = function (list, from, key) {
    if (!list.length) return;
    var i = list.indexOf(from);
    var n = key === 'Home' ? 0 : key === 'End' ? list.length - 1 :
      (i + (key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
    list[n].focus();
  };

  Pandu.prototype._trapTab = function (e) {
    var list = focusables(this.menu);
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  Pandu.prototype._panelLinks = function (item) { return focusables(item.panel); };

  Pandu.prototype._itemOf = function (el) {
    for (var i = 0; i < this.items.length; i++) if (this.items[i].li.contains(el)) return this.items[i];
    return null;
  };

  // Close a wide-screen panel when keyboard focus leaves it (focus is never trapped on desktop).
  Pandu.prototype._onFocusOut = function (e) {
    if (this.compact || !this.active) return;
    var to = e.relatedTarget;
    if (to && !this.active.li.contains(to)) this.closePanel(this.active);
  };

  // Optional: mark the link for this URL with aria-current="page" (data-pandu-current="auto").
  Pandu.prototype.markCurrent = function () {
    if (this.menu.querySelector('[aria-current="page"]')) return;
    var here = window.location.pathname.replace(/index\.html?$/, '').replace(/\/?$/, '/');
    Array.prototype.forEach.call(this.menu.querySelectorAll('a[href]'), function (a) {
      if (a.hash && a.pathname === window.location.pathname && a.hash !== '') return;
      var p = a.pathname.replace(/index\.html?$/, '').replace(/\/?$/, '/');
      if (a.origin === window.location.origin && p === here && !a.hash) a.setAttribute('aria-current', 'page');
    });
  };

  Pandu.prototype.destroy = function () {
    this.closeAll();
    this.closeDrawer(false);
    document.removeEventListener('pointerdown', this._onDocPointer);
    document.removeEventListener('keydown', this._onDocKey);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('load', this._onResize);
    if (this._ro) this._ro.disconnect();
    window.removeEventListener('pageshow', this._onPageShow);
    this.root.classList.remove('pandu--ready', 'pandu--compact', 'pandu--animate');
    delete this.root.pandu;
  };

  // ---- Optional: build the markup from a JSON config ----
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function linkHtml(l, cls) {
    return '<a' + (cls ? ' class="' + cls + '"' : '') + ' href="' + esc(l.href) + '"' + (l.current ? ' aria-current="page"' : '') + '>' +
      esc(l.label) + (l.desc ? '<span class="pandu__desc">' + esc(l.desc) + '</span>' : '') + '</a>';
  }
  function render(cfg) {
    var id = cfg.id || 'pandu-menu';
    var h = '<header class="pandu' + (cfg.sticky ? ' pandu--sticky' : '') + '" data-pandu><div class="pandu__bar">';
    if (cfg.brand) h += '<a class="pandu__brand" href="' + esc(cfg.brand.href || '/') + '">' + esc(cfg.brand.label) + '</a>';
    h += '<a class="pandu__toggle" href="#' + esc(id) + '"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span>' + esc(cfg.menuLabel || 'Menu') + '</span></a>';
    h += '<nav class="pandu__menu" id="' + esc(id) + '" aria-label="' + esc(cfg.label || 'Main') + '">';
    h += '<div class="pandu__drawer-head"><a class="pandu__close" href="#"><span>' + esc(cfg.closeLabel || 'Close') + '</span><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></a></div>';
    h += '<ul class="pandu__list">';
    (cfg.items || []).forEach(function (it) {
      h += '<li class="pandu__item">';
      if (!it.links && !it.columns) { h += linkHtml(it, 'pandu__link') + '</li>'; return; }
      h += '<a class="pandu__trigger" href="' + esc(it.href || '#') + '">' + esc(it.label) + '</a>';
      h += '<div class="pandu__panel' + (it.columns ? ' pandu__panel--mega' : '') + (it.align === 'end' ? ' pandu__panel--end' : '') + '">';
      var cols = it.columns || [{ links: it.links }];
      cols.forEach(function (col, ci) {
        var hid = id + '-' + esc(it.label).toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + ci;
        h += '<div class="pandu__col">';
        if (col.heading) h += '<p class="pandu__heading" id="' + hid + '">' + esc(col.heading) + '</p>';
        h += '<ul' + (col.heading ? ' aria-labelledby="' + hid + '"' : '') + '>';
        (col.links || []).forEach(function (l) { h += '<li>' + linkHtml(l) + '</li>'; });
        h += '</ul></div>';
      });
      if (it.feature) {
        var f = it.feature;
        h += '<a class="pandu__feature" href="' + esc(f.href) + '">' + (f.image ? '<img src="' + esc(f.image) + '" alt="' + esc(f.alt || '') + '" width="400" height="300" loading="lazy">' : '') +
          '<span class="pandu__feature-title">' + esc(f.title) + '</span>' + (f.text ? '<span class="pandu__desc">' + esc(f.text) + '</span>' : '') + '</a>';
      }
      h += '</div></li>';
    });
    h += '</ul>';
    if (cfg.cta) h += '<div class="pandu__actions"><a class="pandu__cta" href="' + esc(cfg.cta.href) + '">' + esc(cfg.cta.label) + '</a></div>';
    return h + '</nav></div></header>';
  }

  function init(target, options) {
    var nodes = !target ? document.querySelectorAll('[data-pandu]') :
      typeof target === 'string' ? document.querySelectorAll(target) :
      target.nodeType ? [target] : target;
    return Array.prototype.map.call(nodes, function (el) { return new Pandu(el, options); });
  }

  function mount(container, cfg, options) {
    container.innerHTML = render(cfg);
    return new Pandu(container.querySelector('[data-pandu]'), options);
  }

  Pandu.version = VERSION;
  Pandu.init = init;
  Pandu.render = render;
  Pandu.mount = mount;
  window.Pandu = Pandu;

  function auto() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-pandu]'), function (el) {
      if (!el.hasAttribute('data-pandu-manual')) new Pandu(el);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
  else auto();
})(window, document);
