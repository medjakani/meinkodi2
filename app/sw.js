/* ---------------------------------------------------------------------------
   sw.js — offline support.

   A clock that dies when the router reboots is worse than no clock at all, so
   the shell of this page is precached and served from cache first.

   >>> BUMP `CACHE` ON EVERY SINGLE DEPLOY. <<<

   This is the one footgun that will waste your afternoon. If the version string
   does not change, every installed TV keeps serving the old files forever and
   your push looks like it silently failed. It did not fail; the service worker
   simply never had a reason to fetch anything.
   --------------------------------------------------------------------------- */

/* Both apps are served from the SAME origin (medjakani.github.io), just at
   different paths — and Cache Storage is keyed by ORIGIN, not by path. The
   cleanup below used to delete every cache it did not recognise, which meant
   whichever app activated last wiped the other one's offline cache and broke
   its no-network clock. Scoping every key to this app fixes it. */
var APP   = 'lumen';
var CACHE = APP + '-2026.09.09-1';

var PRECACHE = [
  './',
  'index.html',
  'css/tokens.css',
  'css/themes.css',
  'css/base.css',
  'css/tv.css',
  'js/boot.js',
  'js/strings.js',
  'js/bridge.js',
  'js/nav.js',
  'js/app.js',
  'js/widgets/clock.js',
  'js/widgets/speed.js',
  'js/widgets/system.js',
  'js/widgets/promo.js',
  'img/pulse-player.png',
  'manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* addAll is all-or-nothing: one 404 and the whole install fails, leaving
         no worker at all. Adding individually means a missing optional asset
         costs that asset and nothing else. */
      return Promise.all(PRECACHE.map(function (url) {
        return c.add(url)['catch'](function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        /* Only ever delete OUR OWN stale caches. A key belonging to the
           sibling app on this origin is none of our business. */
        if (k !== CACHE && k.indexOf(APP + '-') === 0) {
          return caches['delete'](k);
        }
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') { return; }

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* Never touch anything off-origin. The speed test in particular must always
     hit the real network — a cached response would report a fictional
     gigabit connection. */
  if (url.origin !== self.location.origin) { return; }

  /* config.json is the live control channel. Caching it would defeat the
     kill switch and delay every content change. */
  if (url.pathname.indexOf('config.json') !== -1) { return; }

  /* Navigations: network first so a fresh page wins, cache as the safety net. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      })['catch'](function () {
        return caches.match('index.html').then(function (hit) {
          return hit || caches.match('./');
        });
      })
    );
    return;
  }

  /* Static assets: stale-while-revalidate. Instant paint from cache, quiet
     refresh behind it, so the next launch already has the new file. */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      })['catch'](function () { return hit; });
      return hit || net;
    })
  );
});
