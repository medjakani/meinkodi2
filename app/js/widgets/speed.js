/* ---------------------------------------------------------------------------
   speed.js — on-demand internet speed test.

   Measures against Cloudflare's public speed endpoints (the same ones that
   power speed.cloudflare.com). No API key, no account, no server of our own.

   Design decisions worth knowing before you change anything:

   * IT NEVER RUNS BY ITSELF. A speed test spends the viewer's bandwidth and, on
     a metered or capped connection, their money. It runs when somebody presses
     OK, and at no other time.

   * Sizes are adaptive. Fixed payloads either take 40 seconds on a slow line or
     finish too fast to measure on a fast one. Each stage picks its next size
     from what the previous one actually achieved.

   * Latency is subtracted from transfer time. On a short download the
     round-trip is a large fraction of the elapsed time, and not removing it
     makes slow-but-high-latency links look far worse than they are.

   * There is no AbortController. It is Chrome 66+; the baseline here is ~59.
     Instead every stage checks the remaining time budget BEFORE starting, and
     a race-based timeout stops us waiting on a response that will never come.
     An orphaned fetch finishes into the void, which is harmless.
   --------------------------------------------------------------------------- */

window.Widgets = window.Widgets || {};

window.Widgets.speed = (function () {
  'use strict';

  var DOWN = 'https://speed.cloudflare.com/__down?bytes=';
  var UP   = 'https://speed.cloudflare.com/__up';

  var PING_COUNT   = 12;
  var TOTAL_BUDGET = 22000;   // hard ceiling for the whole run
  var STAGE_TIMEOUT = 12000;  // any single transfer

  var DOWN_SIZES = [1e6, 1e7, 2.5e7];
  var UP_SIZES   = [2.5e5, 1e6, 4e6];

  var running = false;
  var started = 0;
  var els = {};

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function budgetLeft() { return TOTAL_BUDGET - (now() - started); }

  function mbps(bytes, ms) {
    if (ms <= 0) { return 0; }
    return (bytes * 8) / (ms / 1000) / 1e6;
  }

  /* --- gauge ---------------------------------------------------------------
     A 270-degree arc with the gap at the bottom.

     Drawn as an explicit arc path, not a dashed <circle>. A circle's path has
     an implicit start point and winding direction, so a dash gap lands
     somewhere you have to discover empirically and re-derive every time you
     touch it. An arc command states the geometry outright.

     pathLength="100" renormalises the path so dash maths is a straight
     percentage, independent of the radius. Change R and nothing else breaks.

     The scale is logarithmic (1 Mbps empty, 1000 Mbps full) because on a linear
     dial every domestic connection sits bunched in the first eighth. */

  var R = 42;

  /* Endpoints at 135 deg (bottom-left) and 45 deg (bottom-right), sweeping
     clockwise the long way round through 9, 12 and 3 o'clock. */
  function polar(deg) {
    var rad = deg * Math.PI / 180;
    return (50 + R * Math.cos(rad)).toFixed(3) + ' ' + (50 + R * Math.sin(rad)).toFixed(3);
  }

  var ARC_PATH = 'M ' + polar(135) + ' A ' + R + ' ' + R + ' 0 1 1 ' + polar(45);

  function gaugeSvg() {
    return '<svg viewBox="0 0 100 100">' +
      '<path class="gauge-track" d="' + ARC_PATH + '" fill="none" ' +
        'stroke-width="7" stroke-linecap="round"/>' +
      /* Starts hidden, not merely empty: see the note in setGauge about the
         round cap painting a dot at zero length. */
      '<path class="gauge-fill" id="sp-arc" d="' + ARC_PATH + '" fill="none" ' +
        'stroke-width="7" stroke-linecap="round" opacity="0" ' +
        'pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>' +
      '</svg>';
  }

  function setGauge(value) {
    if (!els.arc) { return; }
    var f = 0;
    if (value > 1) { f = Math.log(value) / Math.log(1000); }
    if (f > 1) { f = 1; }
    if (f < 0) { f = 0; }
    els.arc.setAttribute('stroke-dashoffset', (100 - f * 100).toFixed(2));

    /* A round line cap on a zero-length dash still paints a dot, so an idle
       gauge shows a stray blue speck at the arc's start that reads as a
       rendering glitch. Hide the fill outright when there is nothing to show. */
    els.arc.style.opacity = (f <= 0) ? '0' : '1';
  }

  /* --- transfer primitives ------------------------------------------------- */

  function httpError(status) {
    var e = new Error('http');
    e.__http = status;
    return e;
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('timeout')); }, ms);
      })
    ]);
  }

  function ping() {
    var t0 = now();
    return withTimeout(
      fetch(DOWN + '0&r=' + Math.random(), { cache: 'no-store' }).then(function (res) {
        if (!res.ok) { throw httpError(res.status); }
        return res.arrayBuffer();
      }),
      4000
    ).then(function () { return now() - t0; });
  }

  function download(bytes, onProgress) {
    var t0 = now();
    return withTimeout(
      fetch(DOWN + Math.round(bytes) + '&r=' + Math.random(), { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) { throw httpError(res.status); }

          /* Stream when we can, so the number climbs live instead of appearing
             all at once at the end. */
          if (res.body && res.body.getReader) {
            var reader = res.body.getReader();
            var got = 0;
            return (function pump() {
              return reader.read().then(function (r) {
                if (r.done) { return { bytes: got, ms: now() - t0 }; }
                got += r.value.length;
                if (onProgress) { onProgress(got, now() - t0); }
                return pump();
              });
            })();
          }

          return res.arrayBuffer().then(function (b) {
            return { bytes: b.byteLength, ms: now() - t0 };
          });
        }),
      STAGE_TIMEOUT
    );
  }

  function upload(bytes) {
    var payload = new Uint8Array(Math.round(bytes));
    var t0 = now();
    return withTimeout(
      fetch(UP, {
        method: 'POST',
        cache: 'no-store',
        body: payload,
        headers: { 'Content-Type': 'application/octet-stream' }
      }).then(function (res) {
        if (!res.ok) { throw httpError(res.status); }
        return res.text();
      }),
      STAGE_TIMEOUT
    ).then(function () { return { bytes: payload.length, ms: now() - t0 }; });
  }

  /* --- reporting ----------------------------------------------------------- */

  function setValue(v) {
    els.value.innerHTML = (v === null ? '&mdash;' : v.toFixed(v < 10 ? 1 : 0)) +
      '<span class="unit">' + window.S['speed.unit'] + '</span>';
  }

  function setStage(text) { els.stage.textContent = text; }

  function setDetail(text, isError) {
    els.detail.textContent = text || '';
    els.detail.className = isError ? 'speed-detail error' : 'speed-detail';
  }

  function setMetric(id, text, pending) {
    var el = els[id];
    if (!el) { return; }
    el.textContent = text;
    el.className = pending ? 'metric-value pending' : 'metric-value';
  }

  function describeError(err) {
    if (err && err.__http) { return window.S.fmt('speed.err.http', err.__http); }
    if (err && err.message === 'timeout') { return window.S['speed.err.timeout']; }
    if (typeof navigator.onLine === 'boolean' && !navigator.onLine) {
      return window.S['speed.err.offline'];
    }
    /* A bare TypeError from fetch means DNS failure, CORS refusal, or a
       middlebox eating the request — which from here is indistinguishable and
       all point at the same advice. */
    return window.S['speed.err.blocked'];
  }

  /* --- the run ------------------------------------------------------------- */

  function run() {
    if (running) { return; }
    running = true;
    started = now();

    setValue(null);
    setGauge(0);
    els.gauge.className = 'gauge';
    setMetric('mDown', window.S['speed.pending'], true);
    setMetric('mUp', window.S['speed.pending'], true);
    setMetric('mPing', window.S['speed.pending'], true);
    setMetric('mJitter', window.S['speed.pending'], true);
    setDetail('');
    setStage(window.S['speed.stage.latency']);
    els.hint.textContent = window.S['speed.running'];

    var latencyMs = 0;
    var results = { down: 0, up: 0 };

    /* Check the network through the shell first when we can — navigator.onLine
       inside a WebView is close to meaningless. */
    var precheck = window.Shell.present
      ? window.Shell.network()['catch'](function () { return null; })
      : Promise.resolve(null);

    precheck.then(function (net) {
      if (net && net.type === 'none') {
        throw new Error('offline-known');
      }
      return pingSeries();
    })
      .then(function () { return downloadSeries(); })
      .then(function () { return uploadSeries(); })
      .then(function () {
        setStage(window.S['speed.stage.done']);
        setValue(results.down);
        setGauge(results.down);
        els.gauge.className = 'gauge';
        return annotateLink();
      })
      ['catch'](function (err) {
        if (err && err.message === 'offline-known') {
          setStage('');
          setDetail(window.S['speed.err.offline'], true);
        } else {
          setStage('');
          setDetail(describeError(err), true);
        }
        setValue(null);
        setGauge(0);
      })
      .then(function () {
        running = false;
        els.hint.textContent = window.S['speed.hint.again'];
      });

    /* --- stages --- */

    function pingSeries() {
      var samples = [];
      function next(i) {
        if (i >= PING_COUNT || budgetLeft() < 3000) { return Promise.resolve(); }
        return ping().then(function (ms) {
          samples.push(ms);
          return next(i + 1);
        });
      }
      return next(0).then(function () {
        if (!samples.length) { throw new Error('timeout'); }
        samples.sort(function (a, b) { return a - b; });
        latencyMs = samples[Math.floor(samples.length / 2)];   // median

        /* Jitter as mean absolute difference between consecutive samples —
           the same definition the ITU uses, and it matches what people mean
           when they say a call "breaks up". */
        var jit = 0;
        for (var i = 1; i < samples.length; i++) {
          jit += Math.abs(samples[i] - samples[i - 1]);
        }
        jit = samples.length > 1 ? jit / (samples.length - 1) : 0;

        setMetric('mPing', Math.round(latencyMs) + ' ms', false);
        setMetric('mJitter', Math.round(jit) + ' ms', false);
      });
    }

    function downloadSeries() {
      setStage(window.S['speed.stage.download']);
      var best = 0;

      function attempt(i) {
        if (i >= DOWN_SIZES.length) { return Promise.resolve(); }
        if (budgetLeft() < 6000) { return Promise.resolve(); }

        return download(DOWN_SIZES[i], function (bytes, ms) {
          var live = mbps(bytes, Math.max(1, ms - latencyMs));
          setValue(live);
          setGauge(live);
        }).then(function (r) {
          var v = mbps(r.bytes, Math.max(1, r.ms - latencyMs));
          if (v > best) { best = v; }
          results.down = best;
          setValue(best);
          setGauge(best);
          setMetric('mDown', best.toFixed(best < 10 ? 1 : 0) + ' ' + window.S['speed.unit'], false);

          /* Stop early once the sample is long enough to trust. Under ~800ms
             the measurement is mostly ramp-up and TCP slow start. */
          if (r.ms < 800 && i + 1 < DOWN_SIZES.length) { return attempt(i + 1); }
          if (r.ms < 3000 && i + 1 < DOWN_SIZES.length) { return attempt(i + 1); }
          return null;
        });
      }

      return attempt(0);
    }

    function uploadSeries() {
      if (budgetLeft() < 5000) { return Promise.resolve(); }

      setStage(window.S['speed.stage.upload']);
      els.gauge.className = 'gauge up';
      var best = 0;

      function attempt(i) {
        if (i >= UP_SIZES.length) { return Promise.resolve(); }
        if (budgetLeft() < 4000) { return Promise.resolve(); }

        return upload(UP_SIZES[i]).then(function (r) {
          var v = mbps(r.bytes, Math.max(1, r.ms - latencyMs));
          if (v > best) { best = v; }
          results.up = best;
          setValue(best);
          setGauge(best);
          setMetric('mUp', best.toFixed(best < 10 ? 1 : 0) + ' ' + window.S['speed.unit'], false);
          if (r.ms < 1500 && i + 1 < UP_SIZES.length) { return attempt(i + 1); }
          return null;
        });
      }

      return attempt(0);
    }

    /* Context for the number. "38 Mbps" means something quite different over a
       72 Mbps Wi-Fi link than over gigabit ethernet, and the viewer cannot see
       the difference without being told. */
    function annotateLink() {
      if (!window.Shell.present) { return null; }
      return window.Shell.network().then(function (net) {
        if (!net) { return; }
        if (net.type === 'ethernet') {
          setDetail(window.S['speed.link.ethernet'], false);
        } else if (net.type === 'wifi' && net.wifiLinkSpeedMbps > 0) {
          var weak = (typeof net.wifiSignalLevel === 'number' && net.wifiSignalLevel <= 1);
          setDetail(window.S.fmt(
            weak ? 'speed.link.wifi.weak' : 'speed.link.wifi',
            net.wifiLinkSpeedMbps
          ), false);
        }
      })['catch'](function () { /* annotation is a bonus, never a failure */ });
    }
  }

  /* --- mount --------------------------------------------------------------- */

  function mount(root) {
    root.innerHTML =
      '<div class="tile-head">' +
        '<div class="tile-title">' + window.S['speed.title'] + '</div>' +
        '<div class="tile-hint" id="sp-hint">' + window.S['speed.hint'] + '</div>' +
      '</div>' +
      '<div class="speed-body">' +
        '<div class="gauge" id="sp-gauge">' + gaugeSvg() + '</div>' +
        '<div class="speed-readout">' +
          '<div class="speed-value" id="sp-value">&mdash;' +
            '<span class="unit">' + window.S['speed.unit'] + '</span></div>' +
          '<div class="speed-stage" id="sp-stage">' + window.S['speed.idle'] + '</div>' +
          '<div class="speed-detail" id="sp-detail">' + window.S['speed.idle.sub'] + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="speed-metrics">' +
        metric('speed.metric.down', 'sp-m-down') +
        metric('speed.metric.up', 'sp-m-up') +
        metric('speed.metric.ping', 'sp-m-ping') +
        metric('speed.metric.jitter', 'sp-m-jitter') +
      '</div>';

    els = {
      gauge:  document.getElementById('sp-gauge'),
      arc:    document.getElementById('sp-arc'),
      value:  document.getElementById('sp-value'),
      stage:  document.getElementById('sp-stage'),
      detail: document.getElementById('sp-detail'),
      hint:   document.getElementById('sp-hint'),
      mDown:  document.getElementById('sp-m-down'),
      mUp:    document.getElementById('sp-m-up'),
      mPing:  document.getElementById('sp-m-ping'),
      mJitter: document.getElementById('sp-m-jitter')
    };

    root.addEventListener('click', run, false);
  }

  function metric(key, id) {
    return '<div class="metric">' +
             '<div class="metric-label">' + window.S[key] + '</div>' +
             '<div class="metric-value pending" id="' + id + '">' +
               window.S['speed.pending'] + '</div>' +
           '</div>';
  }

  return { mount: mount, run: run };
})();
