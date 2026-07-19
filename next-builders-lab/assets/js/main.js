/* NEXT BUILDERS LAB™ — site interactions */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) document.documentElement.classList.add('rm');

  /* ---------------- reveal on scroll ---------------- */
  if (!('IntersectionObserver' in window) || reduceMotion) {
    document.documentElement.classList.add('no-io');
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    document.querySelectorAll('.rv').forEach(function (el) { io.observe(el); });
  }

  /* ---------------- marquee ribbons ------------------ */
  // duplicate the chunk set once so the -50% keyframe loops seamlessly
  document.querySelectorAll('.ribbon__track').forEach(function (track) {
    var clone = track.innerHTML;
    track.innerHTML = clone + clone;
  });

  /* ---------------- netlify form success ------------- */
  var form = document.querySelector('form[name="join-the-lab"]');
  var success = document.getElementById('formSuccess');
  if (success && /[?&]success\b/.test(window.location.search)) {
    success.hidden = false;
    if (form) {
      var focusable = success.querySelector('h3') || success;
      focusable.setAttribute('tabindex', '-1');
      focusable.focus({ preventScroll: true });
    }
    var join = document.getElementById('join');
    if (join) join.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---------------- footer year ---------------------- */
  var yr = document.getElementById('year');
  if (yr) yr.textContent = String(new Date().getFullYear());
})();
