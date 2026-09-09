/* ---------------------------------------------------------------------------
   boot.js — runs first, before anything else.

   Three jobs, in this order:
     1. Set the root font size, so every rem downstream is correct.
     2. Install an error trap that PAINTS ON SCREEN. A Fire TV has no console.
        Without this, any mistake is a black rectangle and no way to diagnose it
        from the sofa.
     3. Register the service worker.

   BASELINE: Chromium ~59 (Fire OS 6/7 WebView). No `?.`, no `??`, no
   `Object.entries`, no template-literal-only tricks that older parsers choke
   on. A syntax error here takes the entire page down silently.
   --------------------------------------------------------------------------- */

(function () {
  'use strict';

  /* --- 1. Root font size ---------------------------------------------------
     Everything is sized in rem. Driving the root off viewport height means one
     layout serves 720p, 1080p and 4K identically instead of three designs.
     1080 / 34 = ~31.8px, so body text clears Amazon's ~28px floor at 1080p. */

  function setRootSize() {
    var h = window.innerHeight || 1080;
    var px = h / 34;
    /* The clamps are defensive only. Every TV is at least 720p, where this
       yields 21px — so on real hardware neither bound is ever reached. Keep the
       floor LOW: clamping upward in a short viewport keeps the type big while
       the space shrinks, which is exactly how you get an overflowing layout. */
    if (px < 8)  { px = 8; }
    if (px > 56) { px = 56; }
    document.documentElement.style.fontSize = px + 'px';
  }

  setRootSize();

  /* --- 1b. Brand, from the URL ---------------------------------------------
     The theme name and display name travel in the content URL (?t= and ?b=),
     which the shell already knows at load time. Applying them here, in <head>,
     means the correct palette is in place before the first pixel is drawn.

     Reading them from config.json instead would work, but the viewer would
     watch the page repaint from one brand's colours into another's. */
  try {
    var q = window.location.search || '';

    /* Whitelisted charset: this value goes into an attribute selector, and a
       remote file should never get to put arbitrary text there. */
    var t = /[?&]t=([A-Za-z0-9_-]{1,24})/.exec(q);
    document.documentElement.setAttribute(
        'data-theme', t ? t[1].toLowerCase() : 'aurora');

    var b = /[?&]b=([^&]{1,40})/.exec(q);
    if (b) { window.__brand = decodeURIComponent(b[1].replace(/\+/g, ' ')); }
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'aurora');
  }

  /* Recompute from several angles. A WebView can report a stale innerHeight
     during startup, and some hosts resize the viewport without ever firing a
     resize event — in which case the whole layout stays sized for a viewport
     that no longer exists. */
  window.addEventListener('resize', setRootSize, false);
  window.addEventListener('orientationchange', setRootSize, false);
  document.addEventListener('DOMContentLoaded', setRootSize, false);
  window.addEventListener('load', setRootSize, false);
  if (window.visualViewport && window.visualViewport.addEventListener) {
    window.visualViewport.addEventListener('resize', setRootSize);
  }

  /* Events are not enough on their own. An Android WebView is laid out after
     the Activity settles, and it can report the pre-layout height at script
     time and then never fire a resize event at all — leaving the whole page
     sized for a viewport that never existed. Re-check a handful of times over
     the first few seconds; after that the size is fixed for the session, so
     this costs nothing at steady state.

     This is not theoretical: it reproduced during development, and the symptom
     is a layout that overflows the screen with no error anywhere. */
  var recheck = [100, 300, 800, 2000, 4000];
  for (var i = 0; i < recheck.length; i++) {
    setTimeout(setRootSize, recheck[i]);
  }

  /* --- 2. Visible error reporting ------------------------------------------ */

  var fatalShown = false;

  function showFatal(title, detail) {
    if (fatalShown) { return; }
    fatalShown = true;
    var el = document.getElementById('fatal');
    if (!el) { return; }
    var h = el.querySelector('h2');
    var pre = el.querySelector('pre');
    if (h) { h.textContent = title; }
    if (pre) { pre.textContent = detail; }
    el.className = 'on';
  }

  window.Boot = { showFatal: showFatal };

  window.onerror = function (msg, src, line, col) {
    var where = (src || 'unknown');
    // Trim the origin so the useful part of the path is readable at 10 feet.
    var slash = where.lastIndexOf('/');
    if (slash !== -1) { where = where.substring(slash + 1); }
    showFatal(
      'Something went wrong on this screen',
      String(msg) + '\n\nat ' + where + ':' + line + ':' + col
    );
    return false;
  };

  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    var text = r && r.message ? r.message : String(r);
    showFatal('Something went wrong on this screen', text);
  }, false);

  /* --- 3. Boot watchdog ----------------------------------------------------
     If app.js never gets as far as revealing the stage, say so rather than
     leaving a black screen that looks like dead hardware. */

  setTimeout(function () {
    var stage = document.getElementById('stage');
    if (stage && stage.className.indexOf('ready') === -1) {
      showFatal(
        'This screen did not finish loading',
        'The page loaded but never became ready within 12 seconds.\n' +
        'This usually means a script failed to parse, or the network stalled.'
      );
    }
  }, 12000);

  /* --- 4. Service worker ---------------------------------------------------
     Offline is the point: a clock that dies when the router reboots is worse
     than no clock. Registration failure is never fatal. */

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        // Non-fatal by design. Log only; the page works fine without it.
        if (window.console && console.warn) {
          console.warn('service worker registration failed:', err);
        }
      });
    }, false);
  }
})();
