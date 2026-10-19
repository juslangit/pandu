/* Lereng demo site behaviour. Pandu itself lives in /dist/pandu.min.js. */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Trip filter on the home page (all rows show without script) ----
  var filter = document.querySelector('.filter');
  if (filter) {
    var rows = Array.prototype.slice.call(document.querySelectorAll('.rows .row'));
    var status = document.querySelector('.filter__status');
    filter.hidden = false;
    filter.addEventListener('click', function (e) {
      var btn = e.target.closest('.filter__btn');
      if (!btn) return;
      var kind = btn.getAttribute('data-filter');
      Array.prototype.forEach.call(filter.querySelectorAll('.filter__btn'), function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      var shown = 0;
      rows.forEach(function (r) {
        var show = kind === 'all' || r.getAttribute('data-kind') === kind;
        r.hidden = !show;
        if (show) shown++;
      });
      status.textContent = kind === 'all' ? '' : 'Showing ' + shown + ' of ' + rows.length + ' trips';
    });
  }

  // ---- Entrances for content below the fold ----
  if (!reduce && 'IntersectionObserver' in window) {
    var targets = document.querySelectorAll(
      '.statement, .trips__photo, .trips__table, .band__title, .band__strip, .about__title, .about__lead, .about__photo, .about__side, .cta__text, .cta__actions, .page-body > *, .site-footer__menu li'
    );
    var fold = window.innerHeight;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    Array.prototype.forEach.call(targets, function (el, i) {
      if (el.getBoundingClientRect().top < fold) return;
      var sibIndex = Array.prototype.indexOf.call(el.parentNode.children, el);
      el.style.setProperty('--delay', Math.min(sibIndex, 4) * 75 + 'ms');
      el.classList.add('reveal-item');
      io.observe(el);
    });
  }

  // ---- Booking form: prefill from ?trip= and compose an email ----
  var form = document.getElementById('book-form');
  if (form) {
    var trip = new URLSearchParams(window.location.search).get('trip');
    if (trip && form.trip.querySelector('option[value="' + trip.replace(/[^a-z-]/g, '') + '"]')) form.trip.value = trip;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var t = form.trip.options[form.trip.selectedIndex].text;
      var body = 'Trip: ' + t + '\nDate: ' + form.date.value + '\nPeople: ' + form.people.value +
        '\nName: ' + form.name.value + '\nEmail: ' + form.email.value + (form.notes.value ? '\n\n' + form.notes.value : '');
      window.location.href = 'mailto:hello@lereng.example?subject=' + encodeURIComponent('Booking request: ' + t) + '&body=' + encodeURIComponent(body);
      document.getElementById('book-status').textContent = 'Your email app should open with the request filled in.';
    });
  }

  // ---- Docs: a caption bar with a copy button above each code block ----
  Array.prototype.forEach.call(document.querySelectorAll('pre[data-copy]'), function (pre) {
    var label = pre.getAttribute('data-copy') || 'code';
    var bar = document.createElement('div');
    bar.className = 'code__bar';
    var name = document.createElement('span');
    name.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy ' + label);
    var status = document.createElement('span');
    status.className = 'sr-only';
    status.setAttribute('role', 'status');
    btn.addEventListener('click', function () {
      var text = pre.querySelector('code').textContent;
      var done = function () { btn.textContent = 'Copied'; status.textContent = label + ' copied'; setTimeout(function () { btn.textContent = 'Copy'; status.textContent = ''; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { btn.textContent = 'Select and copy'; });
      else btn.textContent = 'Select and copy';
    });
    bar.appendChild(name);
    bar.appendChild(btn);
    bar.appendChild(status);
    pre.parentNode.insertBefore(bar, pre);
  });

  // ---- Docs: label each cell so tables can stack on phones ----
  Array.prototype.forEach.call(document.querySelectorAll('table.table--stack'), function (table) {
    var heads = Array.prototype.map.call(table.querySelectorAll('thead th'), function (th) { return th.textContent.trim(); });
    Array.prototype.forEach.call(table.querySelectorAll('tbody tr'), function (tr) {
      Array.prototype.forEach.call(tr.children, function (td, i) { if (heads[i]) td.setAttribute('data-label', heads[i]); });
    });
  });

  // ---- Docs: mark the section being read in the contents list ----
  var toc = document.querySelector('.docs__toc');
  if (toc && 'IntersectionObserver' in window) {
    var links = {};
    Array.prototype.forEach.call(toc.querySelectorAll('a[href^="#"]'), function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        Object.keys(links).forEach(function (id) { links[id].removeAttribute('aria-current'); });
        if (links[en.target.id]) links[en.target.id].setAttribute('aria-current', 'location');
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    Object.keys(links).forEach(function (id) { var el = document.getElementById(id); if (el) spy.observe(el); });
  }

  // ---- Docs: the demo recording does not autoplay for reduced-motion visitors ----
  var video = document.querySelector('.demo-video');
  if (video && reduce) { video.removeAttribute('autoplay'); video.pause(); }

  // ---- Docs: theme playground. Sets Pandu's custom properties on the live nav. ----
  var play = document.getElementById('playground');
  if (play) {
    var nav = document.querySelector('.pandu');
    var out = document.getElementById('play-css');
    var defaults = {};
    var inputs = play.querySelectorAll('[data-var]');
    var write = function () {
      var lines = [];
      Array.prototype.forEach.call(inputs, function (inp) {
        var v = inp.value + (inp.getAttribute('data-unit') || '');
        nav.style.setProperty(inp.getAttribute('data-var'), v);
        lines.push('  ' + inp.getAttribute('data-var') + ': ' + v + ';');
        var o = play.querySelector('output[for="' + inp.id + '"]');
        if (o) o.textContent = v;
      });
      out.textContent = '.pandu {\n' + lines.join('\n') + '\n}';
    };
    Array.prototype.forEach.call(inputs, function (inp) {
      defaults[inp.id] = inp.value;
      inp.addEventListener('input', write);
    });
    play.addEventListener('reset', function () {
      setTimeout(function () {
        Array.prototype.forEach.call(inputs, function (inp) { nav.style.removeProperty(inp.getAttribute('data-var')); });
        write();
        Array.prototype.forEach.call(inputs, function (inp) { nav.style.removeProperty(inp.getAttribute('data-var')); });
      });
    });
    play.addEventListener('submit', function (e) { e.preventDefault(); });
    var open = document.getElementById('play-open');
    if (open) open.addEventListener('click', function () {
      var p = nav.pandu;
      if (!p) return;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      if (p.compact) p.openDrawer(); else p.openPanel(p.items[0], 'click');
    });
    write();
    Array.prototype.forEach.call(inputs, function (inp) { nav.style.removeProperty(inp.getAttribute('data-var')); });
  }
})();
