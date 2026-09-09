/* ---------------------------------------------------------------------------
   bridge.js — the only door between this page and the Android shell.

   The shell may expose the bridge one of two ways, depending on how old the
   device's WebView is:

     ASYNC  window.MeinKodiBridge   WebViewCompat.addWebMessageListener.
                                    Preferred: the origin allowlist is enforced
                                    natively, so a page on another origin
                                    physically cannot reach it. WebView 88+.

     SYNC   window.MeinKodiShell    addJavascriptInterface. The Fire OS 6/7
                                    fallback. Returns JSON strings.

   Both are normalised to the same promise-based API, so nothing downstream has
   to care which one it got.

   If NEITHER is present the page is running in a plain browser. Every call
   rejects with 'no-shell', and widgets are required to say so honestly rather
   than invent numbers.
   --------------------------------------------------------------------------- */

window.Shell = (function () {
  'use strict';

  var SYNC_NAME  = 'MeinKodiShell';
  var ASYNC_NAME = 'MeinKodiBridge';
  var CALL_TIMEOUT_MS = 4000;

  var sync  = window[SYNC_NAME]  || null;
  var async = window[ASYNC_NAME] || null;

  var pending = {};
  var seq = 0;

  if (async && typeof async.postMessage === 'function') {
    async.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      var slot = pending[msg.id];
      if (!slot) { return; }
      delete pending[msg.id];
      if (msg.error) { slot.reject(new Error(msg.error)); }
      else { slot.resolve(msg.result); }
    };
  } else {
    async = null;
  }

  var present = !!(sync || async);

  function call(method, args) {
    return new Promise(function (resolve, reject) {
      if (!present) {
        reject(new Error('no-shell'));
        return;
      }

      /* Synchronous interface: call straight through and parse the JSON. */
      if (sync && typeof sync[method] === 'function') {
        var raw;
        try { raw = sync[method].apply(sync, args || []); }
        catch (e) { reject(e); return; }

        if (raw === undefined || raw === null || raw === '') { resolve(null); return; }
        if (typeof raw !== 'string') { resolve(raw); return; }
        try { resolve(JSON.parse(raw)); } catch (e2) { resolve(raw); }
        return;
      }

      if (!async) { reject(new Error('no-method:' + method)); return; }

      /* Asynchronous port: correlate by id, and always time out. A dropped
         reply must not leave a widget spinning forever. */
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };

      try {
        async.postMessage(JSON.stringify({ id: id, method: method, args: args || [] }));
      } catch (e3) {
        delete pending[id];
        reject(e3);
        return;
      }

      setTimeout(function () {
        if (pending[id]) {
          delete pending[id];
          reject(new Error('shell-timeout'));
        }
      }, CALL_TIMEOUT_MS);
    });
  }

  return {
    /* True when running inside the Android shell. Widgets branch on this. */
    present: present,

    /* Read-only device facts. */
    info:    function ()    { return call('getShellInfo', []); },
    storage: function ()    { return call('getStorage', []); },
    memory:  function ()    { return call('getMemory', []); },
    network: function ()    { return call('getNetwork', []); },

    /* Dormant in v1. Built now so that adding a button later is a config edit
       and never an APK release. */
    openAppstore:   function (pkg) { return call('openAppstore', [pkg]); },
    /* Safe to expose unconditionally: on an APK built before this method
       existed the call simply rejects, and the page falls back to navigating
       to the amzn: URL itself. */
    openAppstoreAsin: function (asin) { return call('openAppstoreAsin', [asin]); },
    openApp:        function (pkg) { return call('openApp', [pkg]); },
    isAppInstalled: function (pkg) { return call('isAppInstalled', [pkg]); },

    /* Shell control. */
    keepScreenOn: function (on) { return call('setKeepScreenOn', [!!on]); },
    backHandled:  function (on) { return call('setBackHandled', [!!on]); },
    ready:        function ()   { return call('ready', []); },

    raw: call
  };
})();
