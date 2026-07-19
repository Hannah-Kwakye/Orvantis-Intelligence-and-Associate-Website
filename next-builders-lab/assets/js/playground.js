/* ============================================================
   NEXT BUILDERS LAB™ — physics playground hero
   Hand-rolled verlet rigid bodies: each letter block is four
   particles + six distance constraints (edges + diagonals).
   Fixed 120 Hz timestep, 8 relaxation iterations, SAT contact
   resolution between quads, clamped bounds with friction.
   Grab & toss with the pointer. Respawn tidily on demand.
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('playCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var hero = canvas.parentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var PALETTE = {
    cream: '#FFF6E9', paper: '#FFFDF6', ultra: '#2B3CFF',
    sun: '#FFC93C', coral: '#FF6B4A', mint: '#3ECF8E', ink: '#141414'
  };

  var LETTERS = [
    { ch: 'B', fill: PALETTE.ultra, text: PALETTE.cream },
    { ch: 'U', fill: PALETTE.sun,   text: PALETTE.ink },
    { ch: 'I', fill: PALETTE.coral, text: PALETTE.ink, narrow: 0.78 },
    { ch: 'L', fill: PALETTE.mint,  text: PALETTE.ink },
    { ch: 'D', fill: PALETTE.ink,   text: PALETTE.cream }
  ];

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;               // world size in CSS px
  var STEP = 1 / 120;             // fixed timestep (s)
  var ITER = 8;                   // relaxation iterations
  var GRAV = 2600;                // px/s^2
  var DAMP = 0.9985;              // verlet damping per substep
  var MAXV = 22;                  // max px per substep (anti-tunnel)
  var bodies = [];
  var accumulator = 0;
  var lastT = 0;
  var running = false;
  var visible = true;
  var inView = true;
  var fontReady = false;

  /* ------------------------------------------------ vectors */
  function dot(ax, ay, bx, by) { return ax * bx + ay * by; }

  /* ------------------------------------------------ body */
  function Body(spec, cx, cy, w, h, angle) {
    this.spec = spec;
    this.w = w; this.h = h;
    this.rad = Math.sqrt(w * w + h * h) / 2;
    this.squash = 0;      // impact squash amount
    this.squashV = 0;
    this.tween = null;    // tidy-up tween state
    var hw = w / 2, hh = h / 2;
    var c = Math.cos(angle), s = Math.sin(angle);
    var corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    this.p = corners.map(function (k) {
      var x = cx + k[0] * c - k[1] * s;
      var y = cy + k[0] * s + k[1] * c;
      return { x: x, y: y, px: x, py: y };
    });
    // 4 edges + 2 diagonals keep the quad rigid
    this.cons = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]].map(function (pair) {
      var a = this.p[pair[0]], b = this.p[pair[1]];
      return { a: pair[0], b: pair[1], rest: Math.hypot(b.x - a.x, b.y - a.y) };
    }, this);
  }

  Body.prototype.center = function () {
    var x = 0, y = 0;
    for (var i = 0; i < 4; i++) { x += this.p[i].x; y += this.p[i].y; }
    return { x: x / 4, y: y / 4 };
  };

  Body.prototype.angle = function () {
    var ax = (this.p[1].x - this.p[0].x) + (this.p[2].x - this.p[3].x);
    var ay = (this.p[1].y - this.p[0].y) + (this.p[2].y - this.p[3].y);
    return Math.atan2(ay, ax);
  };

  Body.prototype.integrate = function () {
    if (this.tween) return;
    for (var i = 0; i < 4; i++) {
      var pt = this.p[i];
      var vx = (pt.x - pt.px) * DAMP;
      var vy = (pt.y - pt.py) * DAMP + GRAV * STEP * STEP;
      var sp = Math.hypot(vx, vy);
      if (sp > MAXV) { vx *= MAXV / sp; vy *= MAXV / sp; }
      pt.px = pt.x; pt.py = pt.y;
      pt.x += vx; pt.y += vy;
    }
  };

  Body.prototype.solveConstraints = function () {
    for (var i = 0; i < this.cons.length; i++) {
      var c = this.cons[i];
      var a = this.p[c.a], b = this.p[c.b];
      var dx = b.x - a.x, dy = b.y - a.y;
      var d = Math.hypot(dx, dy) || 0.0001;
      var diff = (d - c.rest) / d * 0.5;
      a.x += dx * diff; a.y += dy * diff;
      b.x -= dx * diff; b.y -= dy * diff;
    }
  };

  Body.prototype.collideBounds = function () {
    var floor = H - 4, left = 4, right = W - 4;
    for (var i = 0; i < 4; i++) {
      var pt = this.p[i];
      if (pt.y > floor) {
        var impact = pt.y - pt.py;
        pt.y = floor;
        // reflect vertical velocity (restitution) + tangential friction
        pt.py = pt.y + impact * 0.28;
        pt.px = pt.x - (pt.x - pt.px) * 0.72;
        if (impact > 6 && !this.tween) this.squashV += impact * 0.012;
      }
      if (pt.x < left) { pt.x = left; pt.px = pt.x + (pt.x - pt.px) * 0.3; }
      if (pt.x > right) { pt.x = right; pt.px = pt.x + (pt.x - pt.px) * 0.3; }
    }
  };

  /* ---------------------------------- SAT quad vs quad */
  var axes = [];
  function projectBody(body, nx, ny) {
    var min = Infinity, max = -Infinity;
    for (var i = 0; i < 4; i++) {
      var d = dot(body.p[i].x, body.p[i].y, nx, ny);
      if (d < min) min = d;
      if (d > max) max = d;
    }
    return { min: min, max: max };
  }

  function collideBodies(A, B) {
    // quick reject: bounding circles
    var ca = A.center(), cb = B.center();
    var dx = cb.x - ca.x, dy = cb.y - ca.y;
    if (dx * dx + dy * dy > (A.rad + B.rad) * (A.rad + B.rad)) return;

    var minOverlap = Infinity, bestNx = 0, bestNy = 0, edgeBody = null, edgeIdx = 0;
    var pair = [A, B];
    for (var e = 0; e < 2; e++) {
      var E = pair[e];
      for (var i = 0; i < 4; i++) {
        var p1 = E.p[i], p2 = E.p[(i + 1) % 4];
        var nx = -(p2.y - p1.y), ny = p2.x - p1.x;
        var len = Math.hypot(nx, ny) || 0.0001;
        nx /= len; ny /= len;
        var pa = projectBody(A, nx, ny), pb = projectBody(B, nx, ny);
        var overlap = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min);
        if (overlap <= 0) return; // separating axis found
        if (overlap < minOverlap) {
          minOverlap = overlap; bestNx = nx; bestNy = ny; edgeBody = E; edgeIdx = i;
        }
      }
    }

    var vertBody = edgeBody === A ? B : A;
    // normal must point edgeBody -> vertBody
    var ce = edgeBody.center(), cv = vertBody.center();
    if (dot(cv.x - ce.x, cv.y - ce.y, bestNx, bestNy) < 0) { bestNx = -bestNx; bestNy = -bestNy; }

    // deepest vertex of vertBody along -normal
    var v = vertBody.p[0], vd = Infinity;
    for (var j = 0; j < 4; j++) {
      var d = dot(vertBody.p[j].x, vertBody.p[j].y, bestNx, bestNy);
      if (d < vd) { vd = d; v = vertBody.p[j]; }
    }

    var e1 = edgeBody.p[edgeIdx], e2 = edgeBody.p[(edgeIdx + 1) % 4];
    var ex = e2.x - e1.x, ey = e2.y - e1.y;
    var t = dot(v.x - e1.x, v.y - e1.y, ex, ey) / (ex * ex + ey * ey);
    t = Math.max(0, Math.min(1, t));
    var lambda = 1 / (t * t + (1 - t) * (1 - t));
    var rx = bestNx * minOverlap * 0.5, ry = bestNy * minOverlap * 0.5;

    v.x += rx; v.y += ry;
    e1.x -= rx * (1 - t) * lambda; e1.y -= ry * (1 - t) * lambda;
    e2.x -= rx * t * lambda; e2.y -= ry * t * lambda;

    if (minOverlap > 7) {
      A.squashV += minOverlap * 0.004;
      B.squashV += minOverlap * 0.004;
    }
  }

  /* ------------------------------------------------ layout */
  function blockSize() {
    var s = Math.max(72, Math.min(150, W * 0.105));
    if (W < 480) s = Math.max(58, W * 0.145);
    return s;
  }

  function tidyPose(i) {
    // resting row along the floor, gentle hand-placed tilts
    var s = blockSize();
    var gap = Math.min(26, W * 0.02);
    var widths = LETTERS.map(function (L) { return s * (L.narrow || 1); });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + gap * (LETTERS.length - 1);
    var scaleFit = Math.min(1, (W - 40) / total);
    var x = W / 2 - (total * scaleFit) / 2;
    for (var k = 0; k < i; k++) x += (widths[k] + gap) * scaleFit;
    var w = widths[i] * scaleFit, h = s * scaleFit;
    var tilts = [-0.04, 0.03, -0.02, 0.035, -0.03];
    return { x: x + w / 2, y: H - 4 - h / 2, w: w, h: h, a: tilts[i] };
  }

  function spawnAll(settled) {
    bodies = [];
    for (var i = 0; i < LETTERS.length; i++) {
      var t = tidyPose(i);
      if (settled) {
        bodies.push(new Body(LETTERS[i], t.x, t.y, t.w, t.h, t.a));
      } else {
        var b = new Body(LETTERS[i], t.x + (Math.random() * 60 - 30),
          -t.h * (1.2 + i * 1.15), t.w, t.h, (Math.random() - 0.5) * 0.9);
        bodies.push(b);
      }
    }
  }

  function respawnBody(i) {
    var t = tidyPose(i);
    bodies[i] = new Body(LETTERS[i], t.x, -t.h * 1.5, t.w, t.h, (Math.random() - 0.5) * 0.8);
  }

  /* ------------------------------------------------ tidy-up tween */
  function tidyUp() {
    if (reduceMotion) { spawnAll(true); drawFrame(); return; }
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i], t = tidyPose(i);
      var hw = t.w / 2, hh = t.h / 2;
      var c = Math.cos(t.a), s = Math.sin(t.a);
      var corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
      b.tween = {
        t: 0,
        from: b.p.map(function (pt) { return { x: pt.x, y: pt.y }; }),
        to: corners.map(function (k) {
          return { x: t.x + k[0] * c - k[1] * s, y: t.y + k[0] * s + k[1] * c };
        })
      };
      // refresh rest lengths in case of resize scaling
      b.w = t.w; b.h = t.h; b.rad = Math.hypot(t.w, t.h) / 2;
    }
    wake();
  }

  function stepTween(b) {
    var tw = b.tween;
    tw.t += STEP / 0.65;
    var k = tw.t >= 1 ? 1 : 1 - Math.pow(1 - tw.t, 3); // easeOutCubic
    for (var i = 0; i < 4; i++) {
      var pt = b.p[i];
      pt.x = tw.from[i].x + (tw.to[i].x - tw.from[i].x) * k;
      pt.y = tw.from[i].y + (tw.to[i].y - tw.from[i].y) * k;
      pt.px = pt.x; pt.py = pt.y;
    }
    if (tw.t >= 1) {
      b.tween = null;
      b.cons = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]].map(function (pair) {
        var a = b.p[pair[0]], q = b.p[pair[1]];
        return { a: pair[0], b: pair[1], rest: Math.hypot(q.x - a.x, q.y - a.y) };
      });
    }
  }

  /* ------------------------------------------------ grab */
  var grab = null; // { body, u, v, pointerX, pointerY, id }

  function canvasPoint(ev) {
    var r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function pointInBody(b, x, y) {
    // cross-product sign test on the quad
    var sign = 0;
    for (var i = 0; i < 4; i++) {
      var a = b.p[i], c = b.p[(i + 1) % 4];
      var cross = (c.x - a.x) * (y - a.y) - (c.y - a.y) * (x - a.x);
      if (cross !== 0) {
        if (sign === 0) sign = cross > 0 ? 1 : -1;
        else if ((cross > 0 ? 1 : -1) !== sign) return false;
      }
    }
    return true;
  }

  function hitBody(x, y) {
    for (var i = bodies.length - 1; i >= 0; i--) {
      if (pointInBody(bodies[i], x, y)) return bodies[i];
    }
    return null;
  }

  function startGrab(b, pt, pointerId) {
    // grab point in body-local (u,v along edge basis)
    var p0 = b.p[0], p1 = b.p[1], p3 = b.p[3];
    var ex = p1.x - p0.x, ey = p1.y - p0.y;
    var fx = p3.x - p0.x, fy = p3.y - p0.y;
    grab = {
      body: b, id: pointerId,
      u: dot(pt.x - p0.x, pt.y - p0.y, ex, ey) / (ex * ex + ey * ey),
      v: dot(pt.x - p0.x, pt.y - p0.y, fx, fy) / (fx * fx + fy * fy),
      x: pt.x, y: pt.y
    };
    b.tween = null;
    canvas.style.cursor = 'grabbing';
    wake();
  }

  function applyGrab() {
    if (!grab) return;
    var b = grab.body;
    var p0 = b.p[0], p1 = b.p[1], p3 = b.p[3];
    var gx = p0.x + (p1.x - p0.x) * grab.u + (p3.x - p0.x) * grab.v;
    var gy = p0.y + (p1.y - p0.y) * grab.u + (p3.y - p0.y) * grab.v;
    var dx = grab.x - gx, dy = grab.y - gy;
    // pull particles toward the target, weighted by closeness to the
    // grab point — the constraint solver turns that into torque
    for (var i = 0; i < 4; i++) {
      var pt = b.p[i];
      var dist = Math.hypot(pt.x - gx, pt.y - gy);
      var wgt = Math.max(0.18, 1 - dist / (b.rad * 2));
      pt.x += dx * 0.42 * wgt;
      pt.y += dy * 0.42 * wgt;
    }
  }

  canvas.addEventListener('pointerdown', function (ev) {
    if (reduceMotion) return;
    var pt = canvasPoint(ev);
    var b = hitBody(pt.x, pt.y);
    if (b) {
      ev.preventDefault();
      canvas.setPointerCapture(ev.pointerId);
      startGrab(b, pt, ev.pointerId);
    }
  });

  canvas.addEventListener('pointermove', function (ev) {
    var pt = canvasPoint(ev);
    if (grab && ev.pointerId === grab.id) {
      grab.x = pt.x; grab.y = pt.y;
    } else if (ev.pointerType === 'mouse' && !reduceMotion) {
      canvas.style.cursor = hitBody(pt.x, pt.y) ? 'grab' : 'default';
    }
  });

  function endGrab(ev) {
    if (grab && ev.pointerId === grab.id) {
      grab = null;
      canvas.style.cursor = 'default';
    }
  }
  canvas.addEventListener('pointerup', endGrab);
  canvas.addEventListener('pointercancel', endGrab);

  // keep page scroll on empty canvas, capture touches on blocks only
  canvas.addEventListener('touchstart', function (ev) {
    if (reduceMotion) return;
    var t = ev.touches[0];
    var r = canvas.getBoundingClientRect();
    if (hitBody(t.clientX - r.left, t.clientY - r.top)) ev.preventDefault();
  }, { passive: false });

  /* ------------------------------------------------ render */
  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawBody(b) {
    var c = b.center();
    var a = b.angle();
    // squash spring
    b.squashV += -b.squash * 0.28;
    b.squashV *= 0.82;
    b.squash = Math.min(0.22, Math.max(-0.22, b.squash + b.squashV));
    var sx = 1 + b.squash, sy = 1 - b.squash;

    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(a);
    ctx.scale(sx, sy);

    var w = b.w, h = b.h, r = Math.min(w, h) * 0.22;

    // offset shadow
    ctx.save();
    ctx.translate(4, 7);
    roundRectPath(ctx, -w / 2, -h / 2, w, h, r);
    ctx.fillStyle = 'rgba(20,20,20,0.18)';
    ctx.fill();
    ctx.restore();

    // die-cut sticker edge
    roundRectPath(ctx, -w / 2 - 5, -h / 2 - 5, w + 10, h + 10, r + 5);
    ctx.fillStyle = PALETTE.paper;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(20,20,20,0.55)';
    ctx.stroke();

    // block face
    roundRectPath(ctx, -w / 2, -h / 2, w, h, r);
    ctx.fillStyle = b.spec.fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = PALETTE.ink;
    ctx.stroke();

    // inner highlight arc (toy-block sheen)
    ctx.beginPath();
    ctx.moveTo(-w / 2 + r * 0.9, -h / 2 + h * 0.22);
    ctx.quadraticCurveTo(-w / 2 + w * 0.16, -h / 2 + r * 0.5, -w / 2 + w * 0.38, -h / 2 + h * 0.12);
    ctx.lineWidth = Math.max(3, w * 0.045);
    ctx.lineCap = 'round';
    ctx.strokeStyle = b.spec.fill === PALETTE.ink ? 'rgba(255,246,233,0.28)' : 'rgba(255,253,246,0.5)';
    ctx.stroke();

    // letter
    ctx.fillStyle = b.spec.text;
    ctx.font = '800 ' + Math.round(h * 0.58) + 'px "Bricolage Grotesque", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.spec.ch, 0, h * 0.04);

    ctx.restore();
  }

  function drawFrame() {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < bodies.length; i++) drawBody(bodies[i]);
  }

  /* ------------------------------------------------ sim loop */
  function substep() {
    var i, j;
    for (i = 0; i < bodies.length; i++) {
      if (bodies[i].tween) stepTween(bodies[i]);
      else bodies[i].integrate();
    }
    applyGrab();
    for (var it = 0; it < ITER; it++) {
      for (i = 0; i < bodies.length; i++) {
        var b = bodies[i];
        if (b.tween) continue;
        b.solveConstraints();
        b.collideBounds();
      }
      for (i = 0; i < bodies.length; i++) {
        for (j = i + 1; j < bodies.length; j++) {
          if (!bodies[i].tween && !bodies[j].tween) collideBodies(bodies[i], bodies[j]);
        }
      }
    }
    // escape hatch: anything lost off-world respawns from the top
    for (i = 0; i < bodies.length; i++) {
      var cc = bodies[i].center();
      if (cc.y > H + 500 || cc.x < -500 || cc.x > W + 500) respawnBody(i);
    }
  }

  function loop(t) {
    if (!running) return;
    if (!lastT) lastT = t;
    var dt = Math.min((t - lastT) / 1000, 0.1);
    lastT = t;
    accumulator = Math.min(accumulator + dt, STEP * 6);
    while (accumulator >= STEP) {
      substep();
      accumulator -= STEP;
    }
    drawFrame();
    requestAnimationFrame(loop);
  }

  function wake() {
    if (!running && visible && inView && !reduceMotion) {
      running = true;
      lastT = 0;
      requestAnimationFrame(loop);
    }
  }
  function sleep() { running = false; }

  document.addEventListener('visibilitychange', function () {
    visible = !document.hidden;
    if (visible) wake(); else sleep();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (inView) wake(); else sleep();
    }, { threshold: 0 }).observe(hero);
  }

  /* ------------------------------------------------ resize */
  function resize() {
    var r = hero.getBoundingClientRect();
    var newW = Math.round(r.width), newH = Math.round(r.height);
    if (newW === W && newH === H) return;
    var first = W === 0;
    W = newW; H = newH;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (first) {
      spawnAll(reduceMotion);
      if (reduceMotion) drawFrame();
    } else if (reduceMotion) {
      spawnAll(true); drawFrame();
    } else {
      // clamp existing particles into the new world
      for (var i = 0; i < bodies.length; i++) {
        for (var k = 0; k < 4; k++) {
          var pt = bodies[i].p[k];
          if (pt.x > W - 4) { pt.x = W - 4; pt.px = pt.x; }
          if (pt.y > H - 4) { pt.y = H - 4; pt.py = pt.y; }
        }
      }
      drawFrame();
    }
  }

  var resizeT;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(resize, 120);
  });

  /* ------------------------------------------------ boot */
  var tidyBtn = document.getElementById('tidyBtn');
  if (tidyBtn) {
    tidyBtn.addEventListener('click', tidyUp);
    if (reduceMotion) tidyBtn.hidden = true;
  }

  function boot() {
    fontReady = true;
    resize();
    if (reduceMotion) drawFrame(); else wake();
  }

  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load('800 100px "Bricolage Grotesque"')
    ]).then(boot, boot);
    // safety: boot anyway after 600ms
    setTimeout(function () { if (!fontReady) boot(); }, 600);
  } else {
    boot();
  }

  /* ============================================================
     Crayon cursor trail — desktop, pointer:fine, motion allowed
     ============================================================ */
  (function crayon() {
    if (reduceMotion) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    var cnv = document.createElement('canvas');
    cnv.id = 'crayon';
    cnv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cnv);
    var cx2 = cnv.getContext('2d');
    var cw = 0, ch = 0;
    var pts = [];
    var COLORS = [PALETTE.ultra, PALETTE.coral, PALETTE.mint, PALETTE.sun];
    var colorIdx = 0, strokeSeg = 0;
    var rafOn = false;
    var LIFE = 850; // ms

    function sizeIt() {
      cw = window.innerWidth; ch = window.innerHeight;
      cnv.width = Math.round(cw * DPR);
      cnv.height = Math.round(ch * DPR);
      cx2.setTransform(DPR, 0, 0, DPR, 0, 0);
      cx2.lineCap = 'round';
      cx2.lineJoin = 'round';
    }
    sizeIt();
    window.addEventListener('resize', sizeIt);

    var lastX = null, lastY = null;
    window.addEventListener('pointermove', function (ev) {
      if (ev.pointerType !== 'mouse') return;
      if (lastX !== null) {
        var d = Math.hypot(ev.clientX - lastX, ev.clientY - lastY);
        if (d < 3.5) return;
        strokeSeg++;
        if (strokeSeg % 46 === 0) colorIdx = (colorIdx + 1) % COLORS.length;
      }
      pts.push({ x: ev.clientX, y: ev.clientY, t: performance.now(), c: COLORS[colorIdx] });
      if (pts.length > 90) pts.shift();
      lastX = ev.clientX; lastY = ev.clientY;
      if (!rafOn) { rafOn = true; requestAnimationFrame(draw); }
    }, { passive: true });

    function draw() {
      var now = performance.now();
      cx2.clearRect(0, 0, cw, ch);
      while (pts.length && now - pts[0].t > LIFE) pts.shift();
      // waxy stroke: three jittered passes per segment
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i];
        if (b.t - a.t > 90) continue; // pen lifted
        var age = (now - b.t) / LIFE;
        var alpha = (1 - age) * 0.5;
        if (alpha <= 0.01) continue;
        for (var pass = 0; pass < 3; pass++) {
          var jx = ((i * 37 + pass * 61) % 7 - 3) * 0.55;
          var jy = ((i * 53 + pass * 47) % 7 - 3) * 0.55;
          cx2.strokeStyle = b.c;
          cx2.globalAlpha = alpha * (pass === 0 ? 0.85 : 0.32);
          cx2.lineWidth = pass === 0 ? 4.4 : 2.6;
          cx2.beginPath();
          cx2.moveTo(a.x + jx, a.y + jy);
          cx2.lineTo(b.x + jx, b.y + jy);
          cx2.stroke();
        }
      }
      cx2.globalAlpha = 1;
      if (pts.length && !document.hidden) requestAnimationFrame(draw);
      else { rafOn = false; cx2.clearRect(0, 0, cw, ch); }
    }
  })();
})();
