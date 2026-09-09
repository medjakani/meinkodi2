/* ---------------------------------------------------------------------------
   system.js — device facts the shell can read and a web page cannot.

   This widget carries more weight than its size suggests. Amazon rejects apps
   that are "just a wrapper for a website", and native data that no browser
   could ever produce is the clearest possible answer to that. It is also
   genuinely useful: a Fire TV Stick has very little storage, and nothing on
   the stock interface tells you how little is left at a glance.

   HONESTY RULE: outside the shell this says so. It never invents a number,
   never falls back to navigator.deviceMemory, never guesses.
   --------------------------------------------------------------------------- */

window.Widgets = window.Widgets || {};

window.Widgets.system = (function () {
  'use strict';

  /* API level to Fire OS generation. Kept in the PAGE, not the APK, precisely
     so that a new Fire OS can be added with a git push. Verified against
     Amazon's Fire OS overview, August 2026. */
  var FIRE_OS = [
    { min: 35, max: 99, name: 'Fire OS 16' },
    { min: 31, max: 34, name: 'Fire OS 14' },
    { min: 29, max: 30, name: 'Fire OS 8'  },
    { min: 28, max: 28, name: 'Fire OS 7'  },
    { min: 25, max: 27, name: 'Fire OS 6'  },
    { min: 22, max: 24, name: 'Fire OS 5'  }
  ];

  function fireOsName(sdk) {
    for (var i = 0; i < FIRE_OS.length; i++) {
      if (sdk >= FIRE_OS[i].min && sdk <= FIRE_OS[i].max) { return FIRE_OS[i].name; }
    }
    return null;
  }

  /* Decimal units, matching what Fire OS itself shows in Settings. Using GiB
     here would make the app disagree with the device and look wrong.

     The unit is picked per value rather than fixed, because "412 MB free of
     1.5 GB" is how a person actually says it, and a fixed unit gives you
     either "1500 MB" or a uselessly blunt "0.4 GB". */
  function size(bytes) {
    if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) { return null; }
    if (bytes >= 1e9) {
      var g = bytes / 1e9;
      return (g < 10 ? g.toFixed(1) : String(Math.round(g))) + ' GB';
    }
    return Math.round(bytes / 1e6) + ' MB';
  }

  function row(label, id, extra, cls) {
    return '<div class="sys-row' + (cls ? ' ' + cls : '') + '">' +
             '<div class="sys-label">' + label + '</div>' +
             '<div class="sys-value" id="' + id + '">' + (extra || '&mdash;') + '</div>' +
           '</div>';
  }

  function mount(root) {
    root.innerHTML =
      '<div class="tile-head">' +
        '<div class="tile-title">' + window.S['sys.title'] + '</div>' +
      '</div>' +
      '<div id="sys-content"></div>';

    var content = document.getElementById('sys-content');

    if (!window.Shell.present) {
      content.innerHTML =
        '<div class="sys-unavailable">' + window.S['sys.unavailable'] + '</div>';
      return;
    }

    content.innerHTML =
      '<div class="sys-row" style="display:block">' +
        '<div class="sys-label" style="margin-bottom:.2rem">' +
          window.S['sys.storage'] + '</div>' +
        '<div class="sys-value" id="sys-storage">&mdash;</div>' +
        '<div class="bar"><div class="bar-fill" id="sys-storage-bar"></div></div>' +
      '</div>' +
      row(window.S['sys.memory'], 'sys-memory') +
      /* Secondary: still rendered and still read from the bridge, but the promo
         layout hides them. Storage and memory are the two a Fire TV owner
         actually acts on; model and OS version are curiosities. */
      row(window.S['sys.device'], 'sys-device', null, 'sys-row--secondary') +
      row(window.S['sys.system'], 'sys-system', null, 'sys-row--secondary');

    load();
  }

  function fail() {
    var el = document.getElementById('sys-content');
    if (el) {
      el.innerHTML = '<div class="sys-unavailable">' +
        window.S['sys.unreadable'] + '</div>';
    }
  }

  function load() {
    window.Shell.storage().then(function (s) {
      if (!s) { return; }
      var free = s.internalFreeBytes;
      var total = s.internalTotalBytes;
      var el = document.getElementById('sys-storage');
      var bar = document.getElementById('sys-storage-bar');
      if (!el || !bar || !total) { return; }

      var frac = free / total;
      var key = 'sys.free';
      var cls = 'bar-fill';

      /* Thresholds chosen for a device where 8 GB is the whole disk: under
         15% is worth flagging, under 5% and downloads start failing. */
      if (frac < 0.05)      { key = 'sys.storage.critical'; cls = 'bar-fill bad'; }
      else if (frac < 0.15) { key = 'sys.storage.low';      cls = 'bar-fill warn'; }

      el.textContent = window.S.fmt(key, size(free), size(total));
      bar.className = cls;
      /* Bar shows USED, which is what people read a storage bar as. */
      bar.style.width = Math.max(2, Math.round((1 - frac) * 100)) + '%';
    })['catch'](fail);

    window.Shell.memory().then(function (m) {
      if (!m) { return; }
      var el = document.getElementById('sys-memory');
      if (!el) { return; }
      el.textContent = window.S.fmt('sys.free', size(m.availMemBytes), size(m.totalMemBytes));
    })['catch'](function () { /* storage already reported any bridge failure */ });

    window.Shell.info().then(function (i) {
      if (!i) { return; }

      var dev = document.getElementById('sys-device');
      if (dev) {
        var name = i.model || '';
        if (i.manufacturer && name.indexOf(i.manufacturer) === -1) {
          name = i.manufacturer + ' ' + name;
        }
        dev.textContent = name || '—';
      }

      var sys = document.getElementById('sys-system');
      if (sys) {
        var fos = fireOsName(i.androidSdk);
        var parts = [];
        if (fos) { parts.push(fos); }
        if (i.androidRelease) { parts.push('Android ' + i.androidRelease); }
        sys.textContent = parts.length ? parts.join(' · ') : '—';
      }
    })['catch'](function () { /* as above */ });
  }

  return { mount: mount };
})();
