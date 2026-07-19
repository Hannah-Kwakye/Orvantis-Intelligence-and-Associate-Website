/* ============================================================
   AI OPERATIONS LAUNCH™ — schematic engine
   - reveal observer (grid-snapped)
   - 30-day scrubber (rail + strip + sheet-04 ruler)
   - self-assembling diagrams (stroke-dash draw-in)
   - packet advection along SVG paths (getPointAtLength + rAF)
   - scenario tabs re-routing packets live
   - Netlify form success state
   ============================================================ */
(() => {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- 1. reveal ---------- */

  const revealables = $$('.reveal-group, [data-reveal]');
  if (!reduced && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -4% 0px' });
    revealables.forEach((el) => io.observe(el));
  } else {
    revealables.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- 2. the 30-day scrubber ---------- */

  const WEEKS = [
    { from: 1, to: 7, id: 'W1', name: 'MAP' },
    { from: 8, to: 14, id: 'W2', name: 'BUILD' },
    { from: 15, to: 21, id: 'W3', name: 'CONNECT' },
    { from: 22, to: 30, id: 'W4', name: 'MEASURE' }
  ];
  const weekOf = (d) => WEEKS.find((w) => d >= w.from && d <= w.to) || WEEKS[3];
  const MAJOR = [1, 8, 15, 22, 30];

  const railTicks = $('#railTicks');
  const railMarker = $('#railMarker');
  const railDay = $('#railDay');
  const railWeek = $('#railWeek');
  const stripFill = $('#stripFill');
  const stripRead = $('#stripRead');
  const rulerFill = $('#rulerFill');
  const rulerTicks = $('#rulerTicks');
  const rulerRead = $('#rulerRead');
  const daysSection = $('#days');

  const railTickEls = [];
  if (railTicks) {
    const frag = document.createDocumentFragment();
    for (let d = 1; d <= 30; d++) {
      const t = document.createElement('div');
      t.className = 'day-rail__tick' + (MAJOR.indexOf(d) > -1 ? ' day-rail__tick--wk' : '');
      t.style.top = ((d - 1) / 29 * 100) + '%';
      if (MAJOR.indexOf(d) > -1) {
        const s = document.createElement('span');
        s.textContent = 'D' + pad(d);
        t.appendChild(s);
      }
      railTickEls.push(t);
      frag.appendChild(t);
    }
    railTicks.appendChild(frag);
  }
  const rulerTickEls = [];
  if (rulerTicks) {
    const frag = document.createDocumentFragment();
    for (let d = 1; d <= 30; d++) {
      const s = document.createElement('span');
      if (MAJOR.indexOf(d) > -1) {
        const i = document.createElement('i');
        i.textContent = 'D' + pad(d);
        s.appendChild(i);
      }
      rulerTickEls.push(s);
      frag.appendChild(s);
    }
    rulerTicks.appendChild(frag);
  }

  /* ticks snap on as the marker passes them (cheap: only on day change) */
  let lastRailDay = 0, lastRulerDay = 0;
  const snapTicks = (els, day) => {
    for (let i = 0; i < els.length; i++) els[i].classList.toggle('is-past', i < day);
  };

  let railArea = 0;
  const measureRail = () => {
    if (railTicks) railArea = railTicks.clientHeight;
  };
  measureRail();

  let scrubTick = null;
  const scrub = () => {
    scrubTick = null;
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const p = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
    const day = 1 + Math.round(p * 29);
    const wk = weekOf(day);

    if (stripFill) stripFill.style.width = (p * 100).toFixed(2) + '%';
    if (stripRead) stripRead.textContent = 'D' + pad(day) + ' / ' + wk.id + ' ' + wk.name;
    if (railDay) railDay.textContent = 'D' + pad(day);
    if (railWeek) railWeek.textContent = wk.id + '\n' + wk.name;
    if (railMarker && railArea) {
      railMarker.style.top = '44px';
      railMarker.style.transform = 'translateY(' + (p * railArea).toFixed(1) + 'px)';
    }
    if (day !== lastRailDay) { lastRailDay = day; snapTicks(railTickEls, day); }

    if (daysSection && rulerFill) {
      const r = daysSection.getBoundingClientRect();
      const sp = clamp((window.innerHeight * 0.62 - r.top) / Math.max(1, r.height), 0, 1);
      const sday = 1 + Math.round(sp * 29);
      const swk = weekOf(sday);
      rulerFill.style.width = (sp * 100).toFixed(2) + '%';
      if (rulerRead) rulerRead.textContent = 'D' + pad(sday) + ' · ' + swk.id + ' ' + swk.name;
      if (sday !== lastRulerDay) { lastRulerDay = sday; snapTicks(rulerTickEls, sday); }
    }

    buildCheck();
  };
  const onScroll = () => { if (scrubTick === null) scrubTick = requestAnimationFrame(scrub); };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { measureRail(); onScroll(); }, { passive: true });
  scrub();

  /* ---------- 3. diagram assembly ---------- */

  // measure every edge up front so draw-in lengths are exact
  $$('.assemble .edge').forEach((p) => {
    try { p.style.setProperty('--len', (p.getTotalLength() + 2).toFixed(1)); } catch (e) { /* non-path edge */ }
  });

  const builtCallbacks = new Map(); // element -> fn
  var assembleEls = $$('.assemble'); // var: hoisted for the early scrub() call

  // idempotent build; callback is looked up at fire time (maps fill later in this script)
  function buildNow(el) {
    if (el.classList.contains('is-built')) return;
    el.classList.add('is-built');
    setTimeout(() => {
      const fn = builtCallbacks.get(el);
      if (fn) fn();
    }, reduced ? 0 : 650);
  }

  /* belt-and-braces: any schematic whose box touches (or has passed above)
     the viewport is force-built — deep links, jump scrolls and observer
     misses can never leave a sheet blank. Runs inside the rAF scrub. */
  function buildCheck() {
    if (!assembleEls || !assembleEls.length) return;
    const vh = window.innerHeight;
    assembleEls = assembleEls.filter((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return true; // content-visibility: not laid out yet
      if (r.top < vh * 0.92 || r.bottom < vh) { buildNow(el); return false; }
      return true;
    });
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        buildNow(e.target);
      });
    }, { threshold: 0.12 });
    assembleEls.forEach((el) => io.observe(el));
  } else {
    assembleEls.forEach((el) => buildNow(el));
    assembleEls = [];
  }
  window.addEventListener('load', () => { buildCheck(); }, { once: true });

  /* ---------- 4. packet engine ---------- */
  /* A packet is a small circle advected along a chain of path segments.
     Each frame: distance += speed * dt, then position = getPointAtLength.
     Segment ids prefixed "!" run in reverse. Paths under node boxes are
     invisible (nodes render above packets), so transit paths keep timing
     continuous while the packet "passes through" a module. */

  const SVGNS = 'http://www.w3.org/2000/svg';
  const fields = [];

  function makeField(container, svg, getRoutes, opts) {
    if (reduced || !svg) return null;
    const g = svg.querySelector('.packets');
    if (!g) return null;
    opts = opts || {};
    const speed = opts.speed || 140;   // viewBox px / second
    const every = opts.every || 1100;  // ms between spawns
    const max = opts.max || 7;
    const radius = opts.r || 4;

    const segCache = {};
    const getSeg = (token) => {
      const rev = token.charAt(0) === '!';
      const id = rev ? token.slice(1) : token;
      if (!segCache[id]) {
        const el = svg.querySelector('#' + id);
        if (!el) return null;
        segCache[id] = { el, len: el.getTotalLength() };
      }
      return { el: segCache[id].el, len: segCache[id].len, rev };
    };

    let packets = [];
    let raf = null, last = 0, acc = every * 0.7, running = false;
    let built = false, visible = false;

    const spawn = () => {
      const routes = getRoutes();
      if (!routes || !routes.length) return;
      const route = routes[Math.floor(Math.random() * routes.length)];
      const segs = route.map(getSeg).filter(Boolean);
      if (!segs.length) return;
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('class', 'packet');
      c.setAttribute('r', radius);
      const p0 = segs[0].el.getPointAtLength(segs[0].rev ? segs[0].len : 0);
      c.setAttribute('cx', p0.x); c.setAttribute('cy', p0.y);
      g.appendChild(c);
      packets.push({ segs, i: 0, d: 0, c });
    };

    const step = (ts) => {
      raf = null;
      if (!running) return;
      const dt = Math.min(48, last ? ts - last : 16);
      last = ts;
      acc += dt;
      if (acc >= every && packets.length < max) { acc = 0; spawn(); }
      for (let k = packets.length - 1; k >= 0; k--) {
        const p = packets[k];
        p.d += speed * dt / 1000;
        while (p.i < p.segs.length && p.d > p.segs[p.i].len) { p.d -= p.segs[p.i].len; p.i++; }
        if (p.i >= p.segs.length) { p.c.remove(); packets.splice(k, 1); continue; }
        const s = p.segs[p.i];
        const pt = s.el.getPointAtLength(s.rev ? s.len - p.d : p.d);
        p.c.setAttribute('cx', pt.x);
        p.c.setAttribute('cy', pt.y);
      }
      raf = requestAnimationFrame(step);
    };

    const sync = () => {
      const should = built && visible && !document.hidden;
      if (should && !running) { running = true; last = 0; raf = requestAnimationFrame(step); }
      else if (!should && running) { running = false; if (raf) { cancelAnimationFrame(raf); raf = null; } }
    };

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        entries.forEach((e) => { visible = e.isIntersecting; sync(); });
      }, { threshold: 0.05 }).observe(container);
    } else { visible = true; }

    const field = {
      sync,
      setBuilt() { built = true; sync(); },
      clear() { packets.forEach((p) => p.c.remove()); packets = []; acc = every * 0.7; }
    };
    fields.push(field);
    return field;
  }

  document.addEventListener('visibilitychange', () => fields.forEach((f) => f.sync()));

  /* hero — three channels in, one trunk, four outcomes out */
  const heroWrap = $('#heroSchem');
  if (heroWrap) {
    const heroSvg = heroWrap.querySelector('svg');
    const INS = ['hpA', 'hpB', 'hpC'];
    const OUTS = ['hq1', 'hq2', 'hq3', 'hq4'];
    const heroRoutes = [];
    INS.forEach((a) => OUTS.forEach((b) => heroRoutes.push([a, 'ht', b])));
    const heroField = makeField(heroWrap, heroSvg, () => heroRoutes, { speed: 165, every: 850, max: 6, r: 4 });
    if (heroField) builtCallbacks.set(heroWrap, () => heroField.setBuilt());
  }

  /* orchestration — scenario routing tables */
  const orchWrap = $('#orchSchem');
  const orchSvg = orchWrap ? orchWrap.querySelector('svg') : null;

  const SCENARIOS = {
    s1: { /* missed call → callback → booked */
      routes: [
        ['e-voice-q', 't268', 'e-q-booking', 't-booking', 'e-booking-crm', 't-crm-r', 'e-crm-summary', 't-sum', 'e-summary-owner']
      ],
      edges: ['e-voice-q', 'e-q-booking', 'e-booking-crm', 'e-crm-summary', 'e-summary-owner'],
      nodes: ['voice', 'qualify', 'booking', 'crm', 'summary', 'owner']
    },
    s2: { /* WhatsApp enquiry → qualified → follow-up (return packet re-opens the thread) */
      routes: [
        ['e-wa-q', 'tA', 'e-q-crm', 't-crm-l', 'e-crm-summary', 't-sum', 'e-summary-owner'],
        ['e-wa-q', 'tA', 'e-q-crm', 't-crm-l', 'e-crm-summary', 't-sum', 'e-summary-owner'],
        ['!tA', '!e-wa-q']
      ],
      edges: ['e-wa-q', 'e-q-crm', 'e-crm-summary', 'e-summary-owner'],
      nodes: ['whatsapp', 'qualify', 'crm', 'summary', 'owner']
    },
    s3: { /* complex request → staff handover */
      routes: [
        ['e-web-q', 'tC', 'e-q-staff', 't-staff', 'e-staff-crm', 't-crm-top', 'e-crm-summary', 't-sum', 'e-summary-owner']
      ],
      edges: ['e-web-q', 'e-q-staff', 'e-staff-crm', 'e-crm-summary', 'e-summary-owner'],
      nodes: ['webchat', 'qualify', 'staff', 'crm', 'summary', 'owner']
    }
  };

  let scenario = 's1';
  const orchField = orchSvg
    ? makeField(orchWrap, orchSvg, () => SCENARIOS[scenario].routes, { speed: 150, every: 1250, max: 5, r: 4.5 })
    : null;
  if (orchWrap && orchField) builtCallbacks.set(orchWrap, () => orchField.setBuilt());

  const tabs = $$('.orch__tabs [role="tab"]');

  function setScenario(key, focusTab) {
    scenario = key;
    tabs.forEach((t) => {
      const on = t.id === 'tab-' + key;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      if (on && focusTab) t.focus();
    });
    $$('#steps-panel .steps').forEach((ol) => { ol.hidden = ol.getAttribute('data-steps') !== key; });
    Object.keys(SCENARIOS).forEach((k) => {
      const g = $('#steps-' + k);
      if (g) g.style.display = (k === key) ? '' : 'none';
    });
    if (orchSvg) {
      const sc = SCENARIOS[key];
      $$('.edge', orchSvg).forEach((e) => {
        if (e.id) e.classList.toggle('is-off', sc.edges.indexOf(e.id) === -1);
      });
      $$('.node[data-node]', orchSvg).forEach((n) => {
        n.classList.toggle('is-hot', sc.nodes.indexOf(n.getAttribute('data-node')) > -1);
      });
    }
    if (orchField) orchField.clear();
  }

  if (tabs.length) {
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => setScenario(t.id.replace('tab-', ''), false));
      t.addEventListener('keydown', (ev) => {
        let to = -1;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') to = (i + 1) % tabs.length;
        else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') to = (i - 1 + tabs.length) % tabs.length;
        else if (ev.key === 'Home') to = 0;
        else if (ev.key === 'End') to = tabs.length - 1;
        if (to > -1) { ev.preventDefault(); setScenario(tabs[to].id.replace('tab-', ''), true); }
      });
    });
    setScenario('s1', false);
  }

  /* ---------- 5. form success state ---------- */

  if (new URLSearchParams(window.location.search).has('success')) {
    const fieldsWrap = $('#formFields');
    const ok = $('#formOk');
    if (fieldsWrap && ok) { fieldsWrap.hidden = true; ok.hidden = false; }
  }

  /* ---------- 6. anchor settle ---------- */
  /* content-visibility sections materialize during a long anchor scroll,
     which can shift the target after the jump lands. Nudge the scroll
     until the target is stable; abandon on any user input. */

  let settleTimer = null;
  const cancelSettle = () => { if (settleTimer) { clearInterval(settleTimer); settleTimer = null; } };
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((t) =>
    window.addEventListener(t, cancelSettle, { passive: true }));

  function settleTo(id) {
    const el = id && document.getElementById(id);
    if (!el) return;
    cancelSettle();
    const padTop = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    let n = 0;
    const delay = reduced ? 120 : 750; // let native smooth scroll finish first
    setTimeout(() => {
      cancelSettle();
      settleTimer = setInterval(() => {
        const dy = el.getBoundingClientRect().top - padTop;
        if (Math.abs(dy) > 4) window.scrollBy(0, dy);
        else cancelSettle();
        if (++n >= 5) cancelSettle();
      }, 240);
    }, delay);
  }

  document.addEventListener('click', (ev) => {
    const a = ev.target && ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
    if (a) settleTo(a.getAttribute('href').slice(1));
  });
  if (window.location.hash.length > 1) settleTo(window.location.hash.slice(1));
})();
