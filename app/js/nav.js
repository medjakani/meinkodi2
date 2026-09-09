/* ---------------------------------------------------------------------------
   nav.js — D-pad spatial navigation.

   A TV remote gives you five inputs: four directions and OK. There is no Tab
   order that makes sense in two dimensions, so focus movement is computed from
   geometry: from the focused element, find the nearest element that actually
   lies in the direction pressed.

   Two things here are not optional:

     1. `data-nav-up|down|left|right` overrides. Geometry is right about 95% of
        the time; the other 5% needs a human to say where focus goes, and
        without an escape hatch you end up rewriting the algorithm.

     2. The focus watchdog. If focus is ever lost to <body>, the remote stops
        working entirely and the viewer's only recourse is to force-quit the
        app. Recovering automatically is worth far more than it costs.

   Android's WebView already translates DPAD_UP/DOWN/LEFT/RIGHT into
   ArrowUp/Down/Left/Right keydown events and DPAD_CENTER into Enter, so no
   native forwarding is needed for the basics. `window.__shellKey(name)` exists
   for the keys the WebView swallows (Back, Menu, media transport).
   --------------------------------------------------------------------------- */

window.Nav = (function () {
  'use strict';

  var CODE = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
  var NAMED = {
    ArrowLeft: 'left', ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down',
    Left: 'left', Up: 'up', Right: 'right', Down: 'down'   // old WebView spellings
  };

  /* Cross-axis drift is weighted 2x. A tile straight ahead should win over a
     physically closer one off to the side — on a 16:9 grid that ratio is what
     matches what the viewer expects to happen. */
  var CROSS_WEIGHT = 2;

  var last = null;                 // last element that legitimately held focus
  var memory = {};                 // screen name -> element id, for restore
  var screen = 'main';
  var watchdog = null;

  /* --- element collection -------------------------------------------------- */

  function candidates() {
    var all = document.querySelectorAll('[data-focusable]');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.hasAttribute('data-nav-skip')) { continue; }
      if (el.offsetParent === null) { continue; }          // display:none
      var r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) { continue; }
      out.push(el);
    }
    return out;
  }

  function centre(r) {
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* --- direction search ---------------------------------------------------- */

  function best(from, dir) {
    /* An explicit override always wins. */
    var override = from.getAttribute('data-nav-' + dir);
    if (override) {
      var target = document.querySelector(override);
      if (target && target.offsetParent !== null) { return target; }
      return null;   // Deliberate dead end: the author said so.
    }

    var fr = from.getBoundingClientRect();
    var fc = centre(fr);
    var list = candidates();
    var winner = null;
    var bestScore = Infinity;

    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === from) { continue; }

      var r = el.getBoundingClientRect();
      var c = centre(r);
      var primary, cross;

      /* The 1px slack stops elements that merely touch edges from counting as
         "in that direction". */
      if (dir === 'left') {
        if (r.right > fr.left + 1) { continue; }
        primary = fc.x - c.x; cross = Math.abs(c.y - fc.y);
      } else if (dir === 'right') {
        if (r.left < fr.right - 1) { continue; }
        primary = c.x - fc.x; cross = Math.abs(c.y - fc.y);
      } else if (dir === 'up') {
        if (r.bottom > fr.top + 1) { continue; }
        primary = fc.y - c.y; cross = Math.abs(c.x - fc.x);
      } else {
        if (r.top < fr.bottom - 1) { continue; }
        primary = c.y - fc.y; cross = Math.abs(c.x - fc.x);
      }

      if (primary <= 0) { continue; }

      var score = primary + cross * CROSS_WEIGHT;
      if (score < bestScore) { bestScore = score; winner = el; }
    }

    return winner;
  }

  /* --- focus --------------------------------------------------------------- */

  function focus(el) {
    if (!el) { return false; }

    /* The class, not :focus, is what actually draws the highlight. See the
       comment on .nav-focus in tv.css: CSS :focus stops matching whenever the
       WebView loses window-level focus, and a TV screen with no visible
       selection is indistinguishable from a crashed one. */
    if (last && last !== el && last.classList) { last.classList.remove('nav-focus'); }
    if (el.classList) { el.classList.add('nav-focus'); }

    el.focus();
    last = el;
    if (el.id) { memory[screen] = el.id; }
    scrollIntoView(el);
    return true;
  }

  function scrollIntoView(el) {
    /* The options form of scrollIntoView is Chrome 61+; the baseline is 59.
       The page does not scroll in v1, but this keeps future scrollers honest. */
    try {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch (e) {
      try { el.scrollIntoView(false); } catch (e2) { /* nothing more to try */ }
    }
  }

  function current() {
    var a = document.activeElement;
    if (a && a.hasAttribute && a.hasAttribute('data-focusable')) { return a; }
    /* activeElement can drop to <body> while the highlight is still correct
       and still on screen. Trust our own record before declaring focus lost. */
    if (last && last.offsetParent !== null) { return last; }
    return null;
  }

  function focusFirst() {
    var list = candidates();
    if (!list.length) { return false; }

    /* Prefer whatever held focus on this screen before. */
    var remembered = memory[screen];
    if (remembered) {
      var el = document.getElementById(remembered);
      if (el && list.indexOf(el) !== -1) { return focus(el); }
    }
    return focus(list[0]);
  }

  /* --- watchdog ------------------------------------------------------------
     Focus escapes for boring reasons: an element is removed while focused, a
     re-render replaces a node, a stray blur(). On a desktop that is a shrug.
     On a TV it bricks the remote. */

  function guard() {
    var el = current();
    if (el) {
      /* Focus is fine, but the HIGHLIGHT may not be: a re-render that rewrites
         className, or anything that strips the class, leaves the viewer with
         no visible selection even though the element is still focused. Repair
         the ring, not just the focus. */
      if (el.classList && !el.classList.contains('nav-focus')) {
        el.classList.add('nav-focus');
      }
      return;
    }
    var list = candidates();
    if (!list.length) { return; }
    if (last && list.indexOf(last) !== -1) { focus(last); return; }
    focus(list[0]);
  }

  /* --- key handling -------------------------------------------------------- */

  function press(el) {
    /* Amazon asks for a momentary selected state distinct from focus. */
    if (el.classList) {
      el.classList.add('pressed');
      setTimeout(function () { el.classList.remove('pressed'); }, 110);
    }
    el.click();
  }

  function onKeyDown(e) {
    var dir = NAMED[e.key] || CODE[e.keyCode];

    if (dir) {
      var from = current();
      if (!from) { e.preventDefault(); focusFirst(); return; }
      var next = best(from, dir);
      if (next) { focus(next); }
      /* If there is nothing that way, swallow the key anyway — letting the
         WebView do its own thing here produces surprise scrolls. */
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter' || e.keyCode === 13) {
      var el = current();
      if (el) { e.preventDefault(); press(el); }
      return;
    }
  }

  /* --- public -------------------------------------------------------------- */

  function init() {
    var list = candidates();
    for (var i = 0; i < list.length; i++) {
      if (!list[i].hasAttribute('tabindex')) {
        list[i].setAttribute('tabindex', '0');
      }
    }

    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('focusout', function () {
      /* Let the browser finish moving focus before judging where it landed. */
      setTimeout(guard, 0);
    }, false);

    if (watchdog) { clearInterval(watchdog); }
    watchdog = setInterval(guard, 1500);

    focusFirst();
  }

  function refresh() {
    var list = candidates();
    for (var i = 0; i < list.length; i++) {
      if (!list[i].hasAttribute('tabindex')) {
        list[i].setAttribute('tabindex', '0');
      }
    }
    guard();
  }

  function setScreen(name) {
    screen = name || 'main';
    focusFirst();
  }

  return {
    init: init,
    refresh: refresh,
    setScreen: setScreen,
    focusFirst: focusFirst,
    focus: focus,
    current: current
  };
})();
