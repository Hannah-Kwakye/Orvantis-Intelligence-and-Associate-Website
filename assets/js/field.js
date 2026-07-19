/* ============================================================
   ORVANTIS INTELLIGENCE — the intelligence field
   Raw WebGL point field. Three formations morphed in-shader:
   chaos (orbital galaxy) → constellation → lattice.
   Cursor parting in NDC space. No libraries.
   Fallbacks: reduced-motion & no-WebGL get a static
   long-exposure render on a 2D canvas.
   ============================================================ */
(function () {
  "use strict";

  var canvas = document.getElementById("field");
  if (!canvas) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- shared state (main.js writes targets here) ---------- */
  var API = {
    targetPhase: 0,   // 0 chaos → 1 constellation → 2 lattice
    targetDolly: 3.1, // camera distance
    scrollRot: 0,     // extra rotation driven by scroll
    ready: false,
    mode: "none"
  };
  window.ORV_FIELD = API;

  /* ============================================================
     STATIC LONG-EXPOSURE FALLBACK (2D canvas, drawn once)
     ============================================================ */
  function longExposure() {
    API.mode = "static";
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = window.innerWidth, h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      var cx = w * 0.5, cy = h * 0.44;
      var maxR = Math.min(w, h) * 0.52;
      var rng = mulberry(20260708);
      var n = 900;
      ctx.lineCap = "round";
      for (var i = 0; i < n; i++) {
        var r = maxR * (0.12 + 0.88 * Math.sqrt(rng()));
        var a0 = rng() * Math.PI * 2;
        var sweep = (0.05 + rng() * 0.22) * (1.2 - r / maxR + 0.25);
        var gold = rng() > 0.955;
        var alpha = 0.05 + rng() * 0.16;
        ctx.strokeStyle = gold
          ? "rgba(184,155,94," + (alpha + 0.08).toFixed(3) + ")"
          : "rgba(174,190,205," + alpha.toFixed(3) + ")";
        ctx.lineWidth = rng() > 0.9 ? 1.4 : 0.7;
        ctx.beginPath();
        ctx.arc(cx, cy, r, a0, a0 + sweep);
        ctx.stroke();
      }
      // a few resolved stars
      for (var j = 0; j < 130; j++) {
        var rr = maxR * (0.1 + 0.9 * Math.sqrt(rng()));
        var aa = rng() * Math.PI * 2;
        var x = cx + Math.cos(aa) * rr;
        var y = cy + Math.sin(aa) * rr * 0.86;
        var g2 = rng() > 0.94;
        ctx.fillStyle = g2 ? "rgba(184,155,94,0.85)" : "rgba(232,236,241," + (0.25 + rng() * 0.5).toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(x, y, rng() > 0.85 ? 1.5 : 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    var rT;
    window.addEventListener("resize", function () {
      clearTimeout(rT); rT = setTimeout(draw, 180);
    });
    draw();
    API.ready = true;
  }

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  if (reduceMotion) { longExposure(); return; }

  /* ============================================================
     WEBGL FIELD
     ============================================================ */
  var gl = canvas.getContext("webgl", {
    alpha: true, antialias: false, depth: false,
    powerPreference: "high-performance", premultipliedAlpha: true
  });
  if (!gl) { longExposure(); return; }

  var VS = [
    "precision mediump float;",
    "attribute vec3 aChaos;",
    "attribute vec3 aConst;",
    "attribute vec3 aLattice;",
    "attribute vec4 aSeed;",
    "uniform float uTime;",
    "uniform float uPhase;",
    "uniform float uAspect;",
    "uniform float uDolly;",
    "uniform float uRot;",
    "uniform float uSize;",
    "uniform vec2  uMouse;",
    "uniform float uMouseF;",
    "varying float vA;",
    "varying float vGold;",
    "float ease(float t){ return t*t*(3.0-2.0*t); }",
    "void main(){",
    "  float p1 = ease(clamp(uPhase, 0.0, 1.0));",
    "  float p2 = ease(clamp(uPhase - 1.0, 0.0, 1.0));",
    // stagger the morph per-point so formations knit rather than snap
    "  float lag = aSeed.y * 0.28;",
    "  p1 = clamp(p1 * (1.0 + lag) - lag, 0.0, 1.0);",
    "  p2 = clamp(p2 * (1.0 + lag) - lag, 0.0, 1.0);",
    "  vec3 pos = mix(aChaos, aConst, p1);",
    "  pos = mix(pos, aLattice, p2);",
    // breathing drift, damped as the lattice locks in
    "  float t = uTime * 0.35;",
    "  float drift = 0.045 * (1.0 - 0.72 * p2);",
    "  pos += drift * vec3(",
    "    sin(t * (0.4 + aSeed.x) + aSeed.y * 6.2831),",
    "    cos(t * (0.4 + aSeed.y) + aSeed.z * 6.2831),",
    "    sin(t * (0.4 + aSeed.z) + aSeed.x * 6.2831));",
    // slow orbital rotation (galaxy-quiet)
    "  float ang = uRot + uTime * 0.018;",
    "  float c = cos(ang), s = sin(ang);",
    "  pos = vec3(c * pos.x + s * pos.z, pos.y, -s * pos.x + c * pos.z);",
    // camera
    "  vec3 cam = vec3(pos.x, pos.y, pos.z - uDolly);",
    "  float w = -cam.z;",
    "  w = max(w, 0.12);",
    "  float f = 2.2;",
    "  vec2 ndc = vec2(cam.x * f / uAspect, cam.y * f) / w;",
    // cursor parting — aspect-corrected radial push in screen space
    "  vec2 sd = vec2((ndc.x - uMouse.x) * uAspect, ndc.y - uMouse.y);",
    "  float len = max(length(sd), 0.0001);",
    "  float push = uMouseF * exp(-(len * len) / 0.085);",
    "  ndc += vec2(sd.x / uAspect, sd.y) / len * push;",
    "  gl_Position = vec4(ndc * w, 0.0, w);",
    "  float size = uSize * (0.55 + aSeed.w * 1.1) * (2.4 / w);",
    "  gl_PointSize = clamp(size, 0.75, 7.0);",
    // alpha: depth fade + slow twinkle
    "  float depthFade = smoothstep(6.4, 1.6, w);",
    "  float tw = 0.72 + 0.28 * sin(uTime * (0.5 + aSeed.z * 1.4) + aSeed.w * 6.2831);",
    "  vA = (0.30 + 0.55 * aSeed.w) * depthFade * tw;",
    "  vGold = step(0.955, aSeed.x);",
    "}"
  ].join("\n");

  var FS = [
    "precision mediump float;",
    "varying float vA;",
    "varying float vGold;",
    "void main(){",
    "  vec2 uv = gl_PointCoord * 2.0 - 1.0;",
    "  float r2 = dot(uv, uv);",
    "  if (r2 > 1.0) discard;",
    "  float a = 1.0 - r2;",
    "  a *= a;",
    "  vec3 silver = vec3(0.616, 0.686, 0.760);",
    "  vec3 aurum  = vec3(0.780, 0.647, 0.380);",
    "  vec3 col = mix(silver, aurum, vGold);",
    "  float boost = 1.0 + vGold * 0.5;",
    "  gl_FragColor = vec4(col * a * vA * boost, 0.0);",
    "}"
  ].join("\n");

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      return null;
    }
    return sh;
  }

  var vs = compile(gl.VERTEX_SHADER, VS);
  var fs = compile(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) { longExposure(); return; }
  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { longExposure(); return; }
  gl.useProgram(prog);

  /* ---------- geometry: three formations ---------- */
  var isSmall = Math.min(window.innerWidth, window.innerHeight) < 720;
  var N = isSmall ? 3200 : 6400;
  var rng = mulberry(41100);

  var chaos = new Float32Array(N * 3);
  var constl = new Float32Array(N * 3);
  var lattice = new Float32Array(N * 3);
  var seeds = new Float32Array(N * 4);

  function gauss() {
    var u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  // constellation anchors — a loose shell of thought-clusters
  var ANCHORS = 26;
  var anchors = [];
  for (var a = 0; a < ANCHORS; a++) {
    var ar = 0.55 + rng() * 0.85;
    var at = rng() * Math.PI * 2;
    var ay = (rng() - 0.5) * 1.15;
    anchors.push([Math.cos(at) * ar, ay, Math.sin(at) * ar]);
  }

  // lattice dimensions
  var LX = 22, LY = 12, LZ = 9;
  var CELLS = LX * LY * LZ;

  for (var i = 0; i < N; i++) {
    // — chaos: spiral galaxy disc + faint halo
    var halo = rng() < 0.12;
    if (halo) {
      var hr = 1.1 + rng() * 0.9;
      var ht = rng() * Math.PI * 2;
      var hp = Math.acos(2 * rng() - 1);
      chaos[i * 3] = hr * Math.sin(hp) * Math.cos(ht);
      chaos[i * 3 + 1] = hr * Math.cos(hp) * 0.7;
      chaos[i * 3 + 2] = hr * Math.sin(hp) * Math.sin(ht);
    } else {
      var r = 0.14 + 1.5 * Math.pow(rng(), 0.62);
      var th = rng() * Math.PI * 2 + r * 1.9; // spiral shear
      var yy = gauss() * 0.09 * (1.7 - r * 0.7);
      chaos[i * 3] = Math.cos(th) * r;
      chaos[i * 3 + 1] = yy;
      chaos[i * 3 + 2] = Math.sin(th) * r * 0.92;
    }

    // — constellation: 74% cluster to anchors, rest drift dim between
    if (rng() < 0.74) {
      var an = anchors[(i * 7) % ANCHORS];
      constl[i * 3] = an[0] + gauss() * 0.075;
      constl[i * 3 + 1] = an[1] + gauss() * 0.075;
      constl[i * 3 + 2] = an[2] + gauss() * 0.075;
    } else {
      var a1 = anchors[(i * 3) % ANCHORS];
      var a2 = anchors[(i * 11 + 5) % ANCHORS];
      var mt = rng();
      constl[i * 3] = a1[0] + (a2[0] - a1[0]) * mt + gauss() * 0.02;
      constl[i * 3 + 1] = a1[1] + (a2[1] - a1[1]) * mt + gauss() * 0.02;
      constl[i * 3 + 2] = a1[2] + (a2[2] - a1[2]) * mt + gauss() * 0.02;
    }

    // — lattice: ordered grid
    var cell = i % CELLS;
    var gx = cell % LX;
    var gy = ((cell / LX) | 0) % LY;
    var gz = (cell / (LX * LY)) | 0;
    lattice[i * 3] = (gx / (LX - 1) - 0.5) * 3.3 + gauss() * 0.006;
    lattice[i * 3 + 1] = (gy / (LY - 1) - 0.5) * 1.9 + gauss() * 0.006;
    lattice[i * 3 + 2] = (gz / (LZ - 1) - 0.5) * 1.5 + gauss() * 0.006;

    seeds[i * 4] = rng();
    seeds[i * 4 + 1] = rng();
    seeds[i * 4 + 2] = rng();
    seeds[i * 4 + 3] = rng();
  }

  function attrib(name, data, size) {
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  attrib("aChaos", chaos, 3);
  attrib("aConst", constl, 3);
  attrib("aLattice", lattice, 3);
  attrib("aSeed", seeds, 4);

  var U = {};
  ["uTime", "uPhase", "uAspect", "uDolly", "uRot", "uSize", "uMouse", "uMouseF"]
    .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.clearColor(0, 0, 0, 0);

  /* ---------- runtime state ---------- */
  var dpr = 1, W = 0, H = 0;
  var phase = 0, dolly = 3.4, rot = 0;
  var mouse = { x: 0, y: -2, tx: 0, ty: -2, f: 0, tf: 0 };
  var t0 = performance.now();
  var running = true;
  var hasPointer = window.matchMedia("(pointer: fine)").matches;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  var rT;
  window.addEventListener("resize", function () {
    clearTimeout(rT); rT = setTimeout(resize, 120);
  });

  if (hasPointer) {
    window.addEventListener("mousemove", function (e) {
      mouse.tx = (e.clientX / W) * 2 - 1;
      mouse.ty = -((e.clientY / H) * 2 - 1);
      mouse.tf = 1;
    }, { passive: true });
    document.addEventListener("mouseleave", function () { mouse.tf = 0; });
  }

  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    if (running) { t0 = performance.now() - lastT; requestAnimationFrame(frame); }
  });

  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    running = false;
    API.mode = "lost";
  }, false);

  var lastT = 0;
  function frame(now) {
    if (!running) return;
    lastT = now - t0;
    var time = lastT * 0.001;

    // slow, weighty easing toward targets
    phase += (API.targetPhase - phase) * 0.035;
    dolly += (API.targetDolly - dolly) * 0.028;
    rot += (API.scrollRot - rot) * 0.04;
    mouse.x += (mouse.tx - mouse.x) * 0.07;
    mouse.y += (mouse.ty - mouse.y) * 0.07;
    mouse.f += (mouse.tf - mouse.f) * 0.05;

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(U.uTime, time);
    gl.uniform1f(U.uPhase, phase);
    gl.uniform1f(U.uAspect, W / H);
    gl.uniform1f(U.uDolly, dolly);
    gl.uniform1f(U.uRot, rot);
    gl.uniform1f(U.uSize, 2.1 * dpr);
    gl.uniform2f(U.uMouse, mouse.x, mouse.y);
    gl.uniform1f(U.uMouseF, 0.11 * mouse.f);
    gl.drawArrays(gl.POINTS, 0, N);

    requestAnimationFrame(frame);
  }
  API.ready = true;
  API.mode = "webgl";
  requestAnimationFrame(frame);
})();
