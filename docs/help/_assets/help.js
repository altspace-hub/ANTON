/* ANTON Help — minimal interactivity.
   Native <details> handles the technical panels; this only adds
   the mobile nav toggle and an "expand all" affordance. */
(function () {
  'use strict';

  // Mobile sidebar toggle
  var btn = document.querySelector('.menu-btn');
  if (btn) {
    btn.addEventListener('click', function () {
      document.body.classList.toggle('nav-open');
    });
  }
  // Close the mobile nav when a link is tapped
  document.querySelectorAll('nav.sidebar a.lnk').forEach(function (a) {
    a.addEventListener('click', function () {
      document.body.classList.remove('nav-open');
    });
  });

  // Keyboard: "t" toggles every technical panel on the page
  document.addEventListener('keydown', function (e) {
    if (e.key !== 't' || e.target.matches('input,textarea')) return;
    var panels = document.querySelectorAll('details.tech');
    var anyClosed = Array.prototype.some.call(panels, function (d) { return !d.open; });
    panels.forEach(function (d) { d.open = anyClosed; });
  });
})();
