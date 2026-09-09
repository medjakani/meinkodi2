/* ---------------------------------------------------------------------------
   app.js — assembles the screen and owns the page lifecycle.

   Load order matters: boot.js, strings.js, bridge.js, nav.js, the widgets, then
   this. Nothing here runs until the DOM is parsed.

   The page waits for config.json before painting. That is deliberate: the
   language, the theme, the brand name and the whole offer block all come from
   it, so building first and applying config afterwards would mean the viewer
   watches the screen rewrite itself. A 3-second watchdog guarantees the wait
   can never become a hang, and the native splash covers the gap.
   --------------------------------------------------------------------------- */

(function () {
  'use strict';

  /* Which config file this brand uses. One copy of this page serves several
     apps; the shell's content URL names the config with ?c=, so config.json is
     KD Fireboard and config2.json is Lumen Board.

     Relative, so the site can move host or path without editing a URL. The
     charset is whitelisted and '..' rejected: this value comes from a URL and
     must not be able to walk out of the site directory. */
  var CONFIG_URL = (function () {
    try {
      var m = /[?&]c=([A-Za-z0-9._-]{1,40})/.exec(window.location.search || '');
      if (m && m[1].indexOf('..') === -1) { return '../' + m[1]; }
    } catch (e) { }
    return '../config.json';
  })();

  /* How long to wait for config before painting anyway. Long enough for a
     cached same-origin file on a slow stick, short enough not to feel broken. */
  var CONFIG_WAIT_MS = 3000;

  var built = false;
  var contentVersion = null;
  var refreshMinutes = 360;
  var refreshTimer = null;

  /* ------------------------------------------------------------------ toast */

  var toastTimer = null;

  function toast(text) {
    var el = document.getElementById('toast');
    if (!el) { return; }
    el.textContent = text;
    el.className = 'toast on';
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 5000);
  }

  /* ------------------------------------------------------------------ brand */

  function setBrand(name) {
    if (!name) { return; }
    document.title = name;
    var el = document.getElementById('wordmark');
    if (el) { el.textContent = name; }
  }

  /* ---------------------------------------------------------------- actions */
  /* The generic button row. Separate from the promo block: this is for extra
     links, the promo is the one thing the screen is selling. */

  function renderActions(buttons) {
    var host = document.getElementById('actions');
    if (!host) { return; }
    host.innerHTML = '';

    if (!buttons || !buttons.length) { return; }   // .actions:empty hides it

    var list = buttons.slice().filter(function (b) { return b && b.visible !== false; });
    list.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

    for (var i = 0; i < list.length; i++) {
      host.appendChild(buildAction(list[i], i));
    }
    window.Nav.refresh();
  }

  function buildAction(spec, index) {
    var el = document.createElement('button');
    el.className = 'action';
    el.id = 'action-' + (spec.id || index);
    el.setAttribute('data-focusable', '');
    el.setAttribute('tabindex', '0');

    var html = '';
    if (spec.icon) {
      html += '<img class="action-icon" src="' + spec.icon + '" alt="">';
    }
    html += '<span><span class="action-label">' + (spec.label || '') + '</span>';
    if (spec.sublabel) {
      html += '<span class="action-sub" style="display:block">' + spec.sublabel + '</span>';
    }
    html += '</span>';
    el.innerHTML = html;

    var action = spec.action || {};

    if (spec.ifInstalled && action.package && window.Shell.present) {
      window.Shell.isAppInstalled(action.package).then(function (installed) {
        if (!installed) { return; }
        var lab = el.querySelector('.action-label');
        if (lab && spec.ifInstalled.label) { lab.textContent = spec.ifInstalled.label; }
        action = spec.ifInstalled.action || action;
      })['catch'](function () { /* keep the store action */ });
    }

    el.addEventListener('click', function () { runAction(action); }, false);
    return el;
  }

  function runAction(action) {
    if (!action || !action.type) { return; }

    if (!window.Shell.present) {
      toast(window.S['action.err.noshell']);
      return;
    }

    if (action.type === 'appstore') {
      window.Shell.openAppstore(action.package).then(function (r) {
        if (r === 'unavailable') { toast(window.S['action.err.nostore']); }
      })['catch'](function () { toast(window.S['action.err.nostore']); });
      return;
    }

    if (action.type === 'launch') {
      window.Shell.openApp(action.package).then(function (r) {
        if (r === 'not_installed') {
          toast(window.S.fmt('action.err.notfound', action.package));
        }
      })['catch'](function () {
        toast(window.S.fmt('action.err.notfound', action.package));
      });
    }
  }

  /* ----------------------------------------------------------------- config */

  function fetchConfig() {
    return fetch(CONFIG_URL, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) { throw new Error('config-http-' + res.status); }
      return res.json();
    });
  }

  /* Applied on every read, first and subsequent. */
  function applyLive(cfg) {
    if (!cfg) { return; }

    if (cfg.appName) { setBrand(cfg.appName); }

    if (typeof cfg.theme === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(cfg.theme)) {
      document.documentElement.setAttribute('data-theme', cfg.theme.toLowerCase());
    }

    if (window.Shell.present && cfg.keepScreenOn !== undefined) {
      window.Shell.keepScreenOn(cfg.keepScreenOn)['catch'](function () { });
    }

    renderActions(cfg.buttons);

    refreshMinutes = (typeof cfg.refreshMinutes === 'number' && cfg.refreshMinutes >= 5)
        ? cfg.refreshMinutes : 360;
    scheduleRefresh();
  }

  function scheduleRefresh() {
    if (refreshTimer) { clearTimeout(refreshTimer); }
    refreshTimer = setTimeout(function () {
      fetchConfig().then(function (cfg) {
        /* A newer page has been published: reload so TVs that have been on for
           a fortnight pick it up without anyone restarting anything. */
        if (cfg.contentVersion && contentVersion && cfg.contentVersion !== contentVersion) {
          window.location.reload();
          return;
        }
        applyLive(cfg);
      })['catch'](scheduleRefresh);
    }, refreshMinutes * 60 * 1000);
  }

  /* ------------------------------------------------------------ shell hooks */

  window.__shellKey = function (name) {
    if (name === 'menu') { return false; }
    if (name === 'back') { return false; }   // one screen: let the app exit
    return false;
  };

  /* --------------------------------------------------------------- lifecycle */

  function build(cfg) {
    if (built) { return; }
    built = true;

    /* Language first — every widget reads window.S as it mounts. */
    window.setLang(cfg && cfg.lang);

    setBrand(window.__brand || (cfg && cfg.appName) || window.S['app.name']);

    window.Widgets.clock.mount(document.getElementById('clock'), {});
    window.Widgets.speed.mount(document.getElementById('tile-speed'));
    window.Widgets.system.mount(document.getElementById('tile-system'));

    var promoHost = document.getElementById('promo');
    var hasPromo = !!(cfg && cfg.promo && cfg.promo.title);

    if (hasPromo) {
      promoHost.style.display = '';
      window.Widgets.promo.mount(promoHost, cfg.promo);
      /* Switches the whole page to the offer layout: clock to a header line,
         speed and device to a footer. See tv.css. */
      document.getElementById('stage').className = 'has-promo';
    }

    window.Nav.init();

    /* Put the remote on the button, not on a tile. On a television the first
       OK press is the cheapest conversion there is, and making somebody
       navigate to the call to action first throws it away. */
    if (hasPromo) {
      var cta = document.getElementById('promo-cta');
      if (cta) { window.Nav.focus(cta); }
    }

    var stage = document.getElementById('stage');
    stage.className = (hasPromo ? 'has-promo ' : '') + 'ready';

    /* Tell the shell we painted, so it can cross-fade its splash out. */
    if (window.Shell.present) {
      window.Shell.ready()['catch'](function () { });
    }

    applyLive(cfg);
  }

  function start() {
    var done = false;

    fetchConfig().then(function (cfg) {
      if (done) { return; }
      done = true;
      contentVersion = cfg.contentVersion || '';
      build(cfg);
    })['catch'](function () {
      if (done) { return; }
      done = true;
      /* No config is survivable: the clock, the speed test and the device panel
         all work without it. Only the brand and the offer are lost. */
      build(null);
      scheduleRefresh();
    });

    /* Never let a stalled fetch hold the screen black. */
    setTimeout(function () {
      if (done) { return; }
      done = true;
      build(null);
      scheduleRefresh();
    }, CONFIG_WAIT_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, false);
  } else {
    start();
  }
})();
