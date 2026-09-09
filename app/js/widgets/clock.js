/* ---------------------------------------------------------------------------
   clock.js — the centrepiece.

   Three details that separate this from a naive clock:

     1. Ticks are scheduled to the next real second boundary, not on
        setInterval(1000). setInterval drifts, and worse, it accumulates a
        backlog of missed callbacks while the WebView is hidden, all of which
        fire at once when it returns.

     2. Only the text nodes that actually changed are written. A DOM rebuild
        once a second on a $25 stick is visible as a stutter.

     3. Slow pixel drift. A static bright clock left on an OLED panel for hours
        will ghost permanently. Sub-10px movement over minutes is invisible to
        the viewer and completely defeats it.
   --------------------------------------------------------------------------- */

window.Widgets = window.Widgets || {};

window.Widgets.clock = (function () {
  'use strict';

  var elTime, elSecs, elMeridiem, elDate, stage;
  var timer = null, rafId = null;
  var lastHM = '', lastSec = '', lastMeridiem = '', lastDate = '';
  var twelveHour = false;
  var driftEnabled = true;

  /* The page's language, not the browser's. A German Fire TV set to English,
     or a desktop browser previewing the page, would otherwise print an English
     date under German copy — which is exactly the kind of seam that makes a
     product look assembled rather than made. */
  function locale() {
    return (window.S && window.S.lang) ? window.S.lang : undefined;
  }

  /* Does this locale write 1 PM or 13:00? Asking the platform beats a table. */
  function detect12Hour() {
    try {
      return /am|pm/i.test(new Date(2020, 0, 1, 13, 0, 0).toLocaleTimeString(locale()));
    } catch (e) {
      return false;
    }
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function formatDate(d) {
    try {
      return d.toLocaleDateString(locale(), {
        weekday: 'long', day: 'numeric', month: 'long'
      });
    } catch (e) {
      return d.toDateString();
    }
  }

  function render() {
    var d = new Date();
    var h = d.getHours();
    var meridiem = '';

    if (twelveHour) {
      meridiem = h < 12 ? 'AM' : 'PM';
      h = h % 12;
      if (h === 0) { h = 12; }
    }

    var hm = (twelveHour ? String(h) : pad(h)) + ':' + pad(d.getMinutes());
    var sec = pad(d.getSeconds());
    var date = formatDate(d);

    /* Write only what moved. */
    if (hm !== lastHM) { elTime.firstChild.nodeValue = hm; lastHM = hm; }
    if (sec !== lastSec) { elSecs.firstChild.nodeValue = sec; lastSec = sec; }
    if (meridiem !== lastMeridiem) {
      elMeridiem.firstChild.nodeValue = meridiem;
      lastMeridiem = meridiem;
    }
    if (date !== lastDate) { elDate.firstChild.nodeValue = date; lastDate = date; }
  }

  function schedule() {
    var now = Date.now();
    /* +8ms so we land just after the boundary rather than just before it and
       render the previous second. */
    var delay = 1000 - (now % 1000) + 8;
    timer = setTimeout(tick, delay);
  }

  function tick() {
    if (!document.hidden) { render(); }
    schedule();
  }

  /* --- burn-in drift -------------------------------------------------------
     Two sine waves with deliberately non-harmonic periods (97s and 131s) so
     the path never repeats in a way that would itself burn in. Amplitude is
     under 10px: enough to spread the load across pixels, far too slow and
     small to notice. */

  function drift() {
    if (!driftEnabled || !stage) { return; }
    var t = Date.now();
    var x = Math.sin(t / 97000) * 8;
    var y = Math.cos(t / 131000) * 6;
    stage.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    stage.style.webkitTransform = stage.style.transform;
  }

  function driftLoop() {
    drift();
    /* Once every 4 seconds. There is no reason to spend a frame budget on
       something that moves 8px over two minutes. */
    rafId = setTimeout(driftLoop, 4000);
  }

  function mount(root, opts) {
    opts = opts || {};
    stage = document.getElementById('stage');
    twelveHour = (opts.twelveHour === undefined) ? detect12Hour() : !!opts.twelveHour;
    driftEnabled = (opts.burnInGuard === undefined) ? true : !!opts.burnInGuard;

    root.innerHTML =
      '<div class="clock-time"><span id="clk-hm">--:--</span>' +
        '<span class="clock-secs" id="clk-s">--</span>' +
        '<span class="clock-meridiem" id="clk-m"></span></div>' +
      '<div class="clock-date" id="clk-d">&nbsp;</div>';

    elTime     = document.getElementById('clk-hm');
    elSecs     = document.getElementById('clk-s');
    elMeridiem = document.getElementById('clk-m');
    elDate     = document.getElementById('clk-d');

    /* Guarantee a text node exists so render() can poke nodeValue directly
       instead of thrashing innerHTML. */
    if (!elMeridiem.firstChild) { elMeridiem.appendChild(document.createTextNode('')); }

    render();
    schedule();
    driftLoop();

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { render(); }
    }, false);
  }

  function destroy() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (rafId) { clearTimeout(rafId); rafId = null; }
  }

  return { mount: mount, destroy: destroy };
})();
