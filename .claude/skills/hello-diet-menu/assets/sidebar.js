/* Responsive sidebar behaviour. No dependencies.
 *
 *   const sidebar = initSidebar(document.querySelector('.sidebar'), {
 *     onNavigate(href, event) { event.preventDefault(); router.go(href); },
 *   });
 *   sidebar.open(); sidebar.close(); sidebar.destroy();
 *
 * Expected markup: see index.html. It needs .toggle, .search (button + input),
 * .menu links with a data-tip attribute, and an optional .empty message.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.initSidebar = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return function initSidebar(sidebar, options) {
    var opts = options || {};
    var toggle = sidebar.querySelector('.toggle');
    var searchBtn = sidebar.querySelector('.search button');
    var input = sidebar.querySelector('.search input');
    var links = Array.prototype.slice.call(sidebar.querySelectorAll('.menu a'));
    var empty = sidebar.querySelector('.empty');
    var backdrop = document.querySelector(opts.backdrop || '.backdrop');
    var ownBackdrop = false;
    var smallScreen = '(max-width: 640px)';
    var cleanups = [];

    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'backdrop';
      document.body.appendChild(backdrop);
      ownBackdrop = true;
    }

    function on(target, type, fn) {
      target.addEventListener(type, fn);
      cleanups.push(function () { target.removeEventListener(type, fn); });
    }

    function isOpen() { return sidebar.classList.contains('active'); }

    function filter() {
      var term = input ? input.value.trim().toLowerCase() : '';
      var shown = 0;
      links.forEach(function (a) {
        var ok = !term || (a.dataset.tip || a.textContent).toLowerCase().indexOf(term) > -1;
        a.parentNode.hidden = !ok;
        if (ok) shown++;
      });
      if (empty) empty.hidden = shown > 0;
    }

    function setOpen(open, focusSearch) {
      sidebar.classList.toggle('active', open);
      backdrop.classList.toggle('on', open);
      if (toggle) {
        toggle.setAttribute('aria-expanded', open);
        toggle.setAttribute('aria-label', open ? 'Close sidebar' : 'Open sidebar');
      }
      if (input) {
        input.tabIndex = open ? 0 : -1;
        if (open && focusSearch) setTimeout(function () { input.focus(); }, 250);
        if (!open) { input.value = ''; filter(); }
      }
      if (opts.onToggle) opts.onToggle(open);
    }

    function setCurrent(href) {
      links.forEach(function (a) {
        if (a.getAttribute('href') === href) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
    }

    if (toggle) on(toggle, 'click', function () { setOpen(!isOpen()); });
    if (searchBtn) on(searchBtn, 'click', function () { setOpen(true, true); });
    on(backdrop, 'click', function () { setOpen(false); if (toggle) toggle.focus(); });
    on(document, 'keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) { setOpen(false); if (toggle) toggle.focus(); }
    });
    if (input) on(input, 'input', filter);

    links.forEach(function (a) {
      on(a, 'click', function (e) {
        setCurrent(a.getAttribute('href'));
        if (opts.onNavigate) opts.onNavigate(a.getAttribute('href'), e);
        if (window.matchMedia(smallScreen).matches) setOpen(false);
      });
    });

    if (input) input.tabIndex = -1;

    return {
      open: function () { setOpen(true); },
      close: function () { setOpen(false); },
      toggle: function () { setOpen(!isOpen()); },
      setCurrent: setCurrent,
      destroy: function () {
        cleanups.forEach(function (fn) { fn(); });
        if (ownBackdrop) backdrop.remove();
      },
    };
  };
});
