/* Makers Intelligence™ — loom shader hero (raw WebGL, no libraries)
   Warp threads hang on an emerald ground; weft threads shuttle across
   row by row, weaving the cloth in. The weave breathes, and threads
   bow gently away from the cursor. Falls back to a static woven SVG
   under prefers-reduced-motion or when WebGL is unavailable. */
(function () {
  "use strict";

  var canvas = document.getElementById("loom");
  if (!canvas) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var gl =
    !reduced &&
    (canvas.getContext("webgl", { antialias: false, alpha: false }) ||
      canvas.getContext("experimental-webgl", { antialias: false, alpha: false }));

  if (!gl) {
    document.documentElement.classList.add("no-loom");
    return;
  }

  var VERT = [
    "attribute vec2 a_pos;",
    "void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }"
  ].join("\n");

  var FRAG = [
    "precision highp float;",
    "uniform vec2 u_res;",
    "uniform float u_time;",
    "uniform vec2 u_mouse;",   // px, canvas space, y-up
    "uniform float u_weave;",  // 0..1 weave-in progress

    "float hash(float n){ return fract(sin(n * 127.1 + 311.7) * 43758.5453); }",

    // kente-style banding: threads share color in small groups
    "vec3 threadColor(float idx, float axis){",
    "  float band = floor(idx / 4.0);",
    "  float h = hash(band * 7.31 + axis * 13.7);",
    "  vec3 emerald = vec3(0.055, 0.243, 0.192);",
    "  vec3 forest  = vec3(0.078, 0.322, 0.243);",
    "  vec3 gold    = vec3(0.788, 0.592, 0.231);",
    "  vec3 gold2   = vec3(0.890, 0.714, 0.361);",
    "  vec3 clay    = vec3(0.639, 0.302, 0.161);",
    "  vec3 c = mix(emerald, forest, hash(idx * 3.17 + axis));",
    "  if (h > 0.855) c = mix(gold, gold2, hash(idx * 5.71));",
    "  else if (h > 0.815) c = clay;",
    "  c *= 0.88 + 0.24 * hash(idx * 11.3 + axis * 2.0);",
    "  return c;",
    "}",

    "void main(){",
    "  vec2 px = gl_FragCoord.xy;",
    "  vec2 uv = px / u_res;",

    "  float S = clamp(u_res.x / 64.0, 15.0, 30.0);", // thread spacing, px

    // gentle cloth motion + cursor bow
    "  vec2 dm = px - u_mouse;",
    "  float md = length(dm) / u_res.y;",
    "  vec2 bow = normalize(dm + 0.0001) * exp(-md * 3.2) * 9.0;",
    "  px += bow;",
    "  px.x += sin(px.y * 0.009 + u_time * 0.45) * 2.2;",
    "  px.y += cos(px.x * 0.007 + u_time * 0.35) * 2.2;",

    "  float wx = px.x / S;",
    "  float wy = px.y / S;",
    "  float ci = floor(wx), ri = floor(wy);",
    "  float fx = fract(wx), fy = fract(wy);",

    // rounded thread profiles with a slim gap between threads
    "  float gap = 0.09;",
    "  float aa = 1.5 / S;",
    "  float warpMask = smoothstep(gap, gap + aa + 0.05, fx) * smoothstep(gap, gap + aa + 0.05, 1.0 - fx);",
    "  float weftMask = smoothstep(gap, gap + aa + 0.05, fy) * smoothstep(gap, gap + aa + 0.05, 1.0 - fy);",
    "  float wpx = clamp((fx - 0.5) / (0.5 - gap), -1.0, 1.0);",
    "  float wpy = clamp((fy - 0.5) / (0.5 - gap), -1.0, 1.0);",
    "  float warpShade = sqrt(max(0.02, 1.0 - wpx * wpx * 0.82));",
    "  float weftShade = sqrt(max(0.02, 1.0 - wpy * wpy * 0.82));",

    // weave-in: the shuttle carries each weft row across, top rows first,
    // alternating direction like a real loom pass
    "  float rowsTotal = u_res.y / S;",
    "  float rTop = floor(rowsTotal - ri);",
    "  float t = u_weave * (rowsTotal + 10.0) - rTop;",
    "  float dirFlip = mod(rTop, 2.0);",
    "  float sx = mix(uv.x, 1.0 - uv.x, dirFlip);",
    "  float weftOn = smoothstep(0.0, 0.22, t - sx);",

    // warp threads slacken and dim above the weaving front
    "  float woven = clamp(t * 0.35 + 0.55, 0.0, 1.0);",
    "  float warpDim = mix(0.30, 1.0, woven);",

    "  vec3 bg = vec3(0.016, 0.115, 0.088);",
    "  vec3 warpC = threadColor(ci, 0.0) * warpShade * warpDim;",
    "  vec3 weftC = threadColor(ri, 1.0) * weftShade;",

    // over/under interlacing (plain weave)
    "  float warpTop = mod(ci + ri, 2.0);",
    "  float weftA = weftMask * weftOn;",
    "  float warpA = warpMask;",

    "  vec3 c = bg;",
    "  if (warpTop < 0.5) {",
    "    c = mix(c, warpC * (0.62 + 0.38 * abs(wpy)), warpA);", // warp dips under
    "    c = mix(c, weftC, weftA);",
    "  } else {",
    "    c = mix(c, weftC * (0.62 + 0.38 * abs(wpx)), weftA);", // weft dips under
    "    c = mix(c, warpC, warpA);",
    "  }",

    // warm shimmer following the cursor, like lamplight on silk
    "  c += vec3(0.89, 0.71, 0.36) * exp(-md * 4.5) * 0.07;",

    // vignette + faint grain
    "  float vg = smoothstep(1.25, 0.35, distance(uv, vec2(0.5, 0.55)));",
    "  c *= 0.72 + 0.28 * vg;",
    "  c += (hash(px.x + px.y * 917.0) - 0.5) * 0.028;",

    "  gl_FragColor = vec4(c, 1.0);",
    "}"
  ].join("\n");

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      return null;
    }
    return s;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) {
    document.documentElement.classList.add("no-loom");
    return;
  }
  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    document.documentElement.classList.add("no-loom");
    return;
  }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  var loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, "u_res");
  var uTime = gl.getUniformLocation(prog, "u_time");
  var uMouse = gl.getUniformLocation(prog, "u_mouse");
  var uWeave = gl.getUniformLocation(prog, "u_weave");

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;
  function resize() {
    var r = canvas.getBoundingClientRect();
    var w = Math.round(r.width * dpr);
    var h = Math.round(r.height * dpr);
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = W;
    canvas.height = H;
    gl.viewport(0, 0, W, H);
  }
  resize();
  window.addEventListener("resize", resize);

  // mouse, smoothed; default rests right-of-center like a hand at the loom
  var mx = 0.62, my = 0.58, tx = mx, ty = my;
  window.addEventListener("pointermove", function (e) {
    var r = canvas.getBoundingClientRect();
    tx = (e.clientX - r.left) / Math.max(1, r.width);
    ty = 1 - (e.clientY - r.top) / Math.max(1, r.height);
  }, { passive: true });

  var start = performance.now();
  var running = true;
  var visible = true;

  var io = new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
  });
  io.observe(canvas);
  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
  });

  function easeWeave(t) {
    // slow start, confident middle, soft settle — the cloth takes shape
    return t >= 1 ? 1 : 1 - Math.pow(2, -7 * t);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!running || !visible) return;
    resize();
    var t = (now - start) / 1000;
    mx += (tx - mx) * 0.06;
    my += (ty - my) * 0.06;
    gl.uniform2f(uRes, W, H);
    gl.uniform1f(uTime, t);
    gl.uniform2f(uMouse, mx * W, my * H);
    gl.uniform1f(uWeave, easeWeave(t / 5.2));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  requestAnimationFrame(frame);
})();
