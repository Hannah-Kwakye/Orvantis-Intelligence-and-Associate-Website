/* ============================================================
   ORVANTIS INTELLIGENCE — main.js
   Scroll choreography, HUD, reveals, correspondence.
   ============================================================ */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var docEl = document.documentElement;

  /* ---------- first-load intro choreography ---------- */
  if (!reduceMotion && window.scrollY < 40) {
    document.body.classList.add("intro");
    setTimeout(function () { document.body.classList.remove("intro"); }, 4400);
  }

  /* ---------- preloader ---------- */
  var pre = document.getElementById("preloader");
  if (pre) {
    var killPre = function () {
      if (pre && pre.parentNode) pre.parentNode.removeChild(pre);
      pre = null;
    };
    if (reduceMotion) killPre();
    else {
      pre.addEventListener("animationend", function (e) {
        if (e.target === pre) killPre();
      });
      setTimeout(killPre, 2600); // safety
    }
  }

  /* ---------- split headlines into rising words ---------- */
  if (!reduceMotion) {
    document.querySelectorAll(".rise").forEach(function (el) {
      var idx = 0;
      function splitNode(node) {
        if (node.nodeType === 3) {
          var frag = document.createDocumentFragment();
          node.textContent.split(/(\s+)/).forEach(function (piece) {
            if (!piece) return;
            if (/^\s+$/.test(piece)) { frag.appendChild(document.createTextNode(" ")); return; }
            var w = document.createElement("span");
            w.className = "w";
            var inner = document.createElement("span");
            inner.style.setProperty("--i", idx++);
            inner.textContent = piece;
            w.appendChild(inner);
            frag.appendChild(w);
          });
          node.parentNode.replaceChild(frag, node);
        } else if (node.nodeType === 1 && !node.classList.contains("w")) {
          Array.prototype.slice.call(node.childNodes).forEach(splitNode);
        }
      }
      Array.prototype.slice.call(el.childNodes).forEach(splitNode);
    });
  }

  /* ---------- reveal on entry ---------- */
  var revealables = document.querySelectorAll(".rise, .fade");
  if (reduceMotion) {
    revealables.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
    revealables.forEach(function (el) { io.observe(el); });
  }

  /* ---------- HUD chapter tracking ---------- */
  var chapters = Array.prototype.slice.call(document.querySelectorAll("[data-chapter]"));
  var hudNum = document.getElementById("hud-num");
  var hudName = document.getElementById("hud-name");
  var indexLinks = Array.prototype.slice.call(document.querySelectorAll(".hud-index a"));
  var progressBar = document.getElementById("hud-progress-bar");

  if (chapters.length) {
    var chIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var num = en.target.getAttribute("data-chapter");
        var name = en.target.getAttribute("data-chapter-name");
        if (hudNum) hudNum.textContent = num;
        if (hudName) hudName.textContent = name;
        indexLinks.forEach(function (l) {
          if (l.getAttribute("href") === "#" + en.target.id) l.setAttribute("aria-current", "true");
          else l.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    chapters.forEach(function (c) { chIO.observe(c); });
  }

  /* ---------- scroll → field targets + progress + scene dolly ----------
     phase keypoints: arrival 0 · thesis 0.55 · practice 1 (constellation)
     · approach 2 (lattice) · beyond stays lattice, camera pulls away.  */
  var field = window.ORV_FIELD;
  var keys = [];

  function centerOf(el) {
    var r = el.getBoundingClientRect();
    return r.top + window.scrollY + r.height * 0.5;
  }
  function buildKeys() {
    var byId = function (id) { return document.getElementById(id); };
    var arrival = byId("arrival"), thesis = byId("thesis"),
        practice = byId("practice"), approach = byId("approach"),
        launch = byId("launch"), builders = byId("builders"),
        corr = byId("correspondence");
    if (!arrival) { keys = []; return; }
    keys = [
      { y: 0, phase: 0, dolly: 3.1 },
      { y: centerOf(thesis), phase: 0.55, dolly: 2.65 },
      { y: centerOf(practice), phase: 1.0, dolly: 2.9 },
      { y: centerOf(approach), phase: 2.0, dolly: 2.45 },
      { y: centerOf(launch), phase: 2.0, dolly: 3.15 },
      { y: centerOf(builders), phase: 2.0, dolly: 3.45 },
      { y: centerOf(corr), phase: 2.0, dolly: 4.1 }
    ];
  }

  function interp(y) {
    if (!keys.length) return null;
    if (y <= keys[0].y) return keys[0];
    for (var i = 1; i < keys.length; i++) {
      if (y < keys[i].y) {
        var a = keys[i - 1], b = keys[i];
        var t = (y - a.y) / Math.max(1, b.y - a.y);
        return {
          phase: a.phase + (b.phase - a.phase) * t,
          dolly: a.dolly + (b.dolly - a.dolly) * t
        };
      }
    }
    return keys[keys.length - 1];
  }

  var scenes = Array.prototype.slice.call(document.querySelectorAll(".scene"));
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var vh = window.innerHeight;
      var y = window.scrollY + vh * 0.5;
      var max = docEl.scrollHeight - vh;
      var prog = max > 0 ? Math.min(1, window.scrollY / max) : 0;

      if (progressBar) progressBar.style.transform = "scaleX(" + prog.toFixed(4) + ")";

      if (field && keys.length) {
        var k = interp(y);
        if (k) {
          field.targetPhase = k.phase;
          field.targetDolly = k.dolly;
          field.scrollRot = prog * 1.35; // slow camera pan across the film
        }
      }

      // camera-dolly on chapter content: settle from below, recede past
      if (!reduceMotion) {
        scenes.forEach(function (s) {
          var r = s.getBoundingClientRect();
          if (r.bottom < -80 || r.top > vh + 80) return;
          var c = (r.top + r.height * 0.5 - vh * 0.5) / vh; // -~1..~1
          var scale = 1 - Math.min(0.045, Math.abs(c) * 0.05);
          var ty = c * -26;
          var op = 1 - Math.min(0.55, Math.max(0, Math.abs(c) - 0.28) * 0.9);
          s.style.transform = "translateY(" + ty.toFixed(1) + "px) scale(" + scale.toFixed(4) + ")";
          s.style.opacity = op.toFixed(3);
        });
      }
    });
  }

  buildKeys();
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  var rT;
  window.addEventListener("resize", function () {
    clearTimeout(rT);
    rT = setTimeout(function () { buildKeys(); onScroll(); }, 160);
  });
  // after fonts settle, layout heights change — rebuild once
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { buildKeys(); onScroll(); });
  }
  window.addEventListener("load", function () { buildKeys(); onScroll(); });

  /* ---------- hide fixed HUD while the footer is on stage ---------- */
  var footer = document.querySelector(".site-footer");
  if (footer && "IntersectionObserver" in window) {
    var fIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        document.body.classList.toggle("footer-in", en.isIntersecting);
      });
    }, { threshold: 0.08 });
    fIO.observe(footer);
  }

  /* ---------- correspondence: inline success ---------- */
  try {
    if (window.location.search.indexOf("sent=1") !== -1) {
      var form = document.getElementById("letter-form");
      var ok = document.getElementById("letter-success");
      if (form && ok) {
        form.classList.add("hidden");
        ok.classList.remove("hidden");
        ok.setAttribute("tabindex", "-1");
        ok.focus({ preventScroll: true });
        var corrEl = document.getElementById("correspondence");
        if (corrEl) corrEl.scrollIntoView({ behavior: "auto", block: "start" });
      }
    }
  } catch (e) { /* non-fatal */ }
})();
