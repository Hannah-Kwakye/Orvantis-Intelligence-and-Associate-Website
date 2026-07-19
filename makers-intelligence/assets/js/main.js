/* Makers Intelligence™ — main.js
   Scroll reveals, thread-drawn icons, soft parallax, header state,
   waitlist form. No libraries. */
(function () {
  "use strict";

  document.documentElement.classList.add("js");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----- header scrolled state ----- */
  var head = document.querySelector(".site-head");
  if (head) {
    var onScroll = function () {
      head.classList.toggle("is-scrolled", window.scrollY > 24);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ----- hero headline: words rise from the weave ----- */
  var heroH1 = document.querySelector(".hero h1");
  if (heroH1 && !reduced) {
    var wi = 0;
    var wrapWords = function (node) {
      var kids = Array.prototype.slice.call(node.childNodes);
      kids.forEach(function (kid) {
        if (kid.nodeType === 3) {
          var frag = document.createDocumentFragment();
          kid.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(part));
            } else {
              var w = document.createElement("span");
              w.className = "w";
              var inner = document.createElement("span");
              inner.style.setProperty("--wi", wi++);
              inner.textContent = part;
              w.appendChild(inner);
              frag.appendChild(w);
            }
          });
          node.replaceChild(frag, kid);
        } else if (kid.nodeType === 1) {
          wrapWords(kid);
        }
      });
    };
    wrapWords(heroH1);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        heroH1.classList.add("rise");
      });
    });
  }

  /* ----- reveal + draw-in on scroll ----- */
  var revealables = document.querySelectorAll(".rv, .t-icon.draw, .map-thread");
  var startPackets = function () {
    // weft packets on the map: SMIL motion, started only when
    // the map is revealed and motion is allowed
    if (reduced) return;
    document.querySelectorAll(".map-thread .packet animateMotion").forEach(
      function (m, i) {
        try {
          m.beginElementAt(i * 0.9);
        } catch (e) {
          /* SMIL unavailable: packets stay hidden */
        }
      }
    );
  };
  var io = null;
  var remaining = revealables.length;
  var revealEl = function (el) {
    if (el.classList.contains("in")) return;
    el.classList.add("in");
    remaining--;
    if (el.classList.contains("map-thread")) startPackets();
    if (io) io.unobserve(el);
  };
  // Reveal everything currently on screen or already scrolled past —
  // run on load, on deep-links, on hash jumps and as a scroll safety
  // net, so no scroll position (however it was reached) ever renders
  // a near-empty viewport.
  var revealVisible = function () {
    if (!remaining) return;
    var vh = window.innerHeight;
    revealables.forEach(function (el) {
      if (el.classList.contains("in")) return;
      var r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top < vh * 0.97) revealEl(el);
    });
  };
  if ("IntersectionObserver" in window && revealables.length) {
    io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          // reveal when intersecting — or when already scrolled past,
          // so fast scrolling (or slow frames) never leaves gaps
          if (en.isIntersecting || en.boundingClientRect.bottom < 0) {
            revealEl(en.target);
          }
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 }
    );
    revealables.forEach(function (el) {
      io.observe(el);
    });
    // deep-link / restored-scroll safety: the browser may jump (or
    // smooth-scroll) before the observer's first callback settles, so a
    // throttled scroll pass double-checks until everything is revealed
    var rvPending = false;
    var onScrollReveal = function () {
      if (rvPending || !remaining) return;
      rvPending = true;
      requestAnimationFrame(function () {
        rvPending = false;
        revealVisible();
      });
    };
    window.addEventListener("scroll", onScrollReveal, { passive: true });
    window.addEventListener("hashchange", function () {
      requestAnimationFrame(revealVisible);
    });
    window.addEventListener("load", function () {
      requestAnimationFrame(revealVisible);
    });
    if (window.location.hash || window.scrollY > 4) {
      requestAnimationFrame(revealVisible);
    }
  } else {
    revealables.forEach(function (el) {
      el.classList.add("in");
    });
    startPackets();
  }

  /* ----- soft parallax (≤ 40px, transform only) ----- */
  var plx = Array.prototype.slice.call(document.querySelectorAll("[data-plx]"));
  if (plx.length && !reduced) {
    var ticking = false;
    var apply = function () {
      ticking = false;
      var vh = window.innerHeight;
      plx.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -80 || r.top > vh + 80) return;
        var mid = r.top + r.height / 2 - vh / 2;
        var f = parseFloat(el.getAttribute("data-plx")) || 0.06;
        var y = Math.max(-40, Math.min(40, -mid * f));
        el.style.transform = "translate3d(0," + y.toFixed(1) + "px,0)";
      });
    };
    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(apply);
        }
      },
      { passive: true }
    );
    apply();
  }

  /* ----- waitlist form: Netlify POST with inline success ----- */
  var form = document.querySelector("form[name='waitlist']");
  var success = document.querySelector(".wl-success");
  function showSuccess() {
    if (!form || !success) return;
    form.classList.add("is-done");
    success.classList.add("is-shown");
    success.setAttribute("tabindex", "-1");
    success.focus({ preventScroll: false });
  }
  if (/[?&]success/.test(window.location.search)) showSuccess();
  if (form && success) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = form.querySelector("button[type='submit']");
      var data = new FormData(form);
      var body = new URLSearchParams(data).toString();
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Weaving you in…";
      }
      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body
      })
        .then(showSuccess)
        .catch(function () {
          // static preview / offline: still confirm inline
          showSuccess();
        });
    });
  }

  /* ----- current year ----- */
  var yr = document.getElementById("yr");
  if (yr) yr.textContent = new Date().getFullYear();
})();
