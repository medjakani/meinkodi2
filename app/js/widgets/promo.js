/* ---------------------------------------------------------------------------
   promo.js — the offer block.

   Every word of it comes from `promo` in config.json, so the copy can be
   rewritten and pushed in a minute without touching code or rebuilding an APK.
   That matters more here than anywhere else on the page: promotional wording is
   the thing you will want to change most often, and A/B testing it is only
   possible if changing it is free.

   Design intent, for whoever edits this next:

   * ONE action. A television remote has no cursor and no back-of-mind "I'll
     look at the other thing later" — the viewer does what the focused button
     says or leaves. Adding a second call to action reliably lowers conversion
     on a 10-foot screen rather than raising it.

   * The button takes focus on load, so pressing OK is the very first thing the
     remote can do. On a TV this is the single largest conversion lever there
     is; anything that costs the viewer a D-pad press costs conversions.

   * The line under the button says exactly what pressing it does. Click
     anxiety on a shared living-room screen is real, and "opens the Amazon
     Appstore" removes it for the price of one small line.

   * No countdowns, no fake stock counts, no invented review scores. Beyond
     being dishonest, they are what Amazon looks for when judging whether an
     app is an advert wearing a utility's clothes.
   --------------------------------------------------------------------------- */

window.Widgets = window.Widgets || {};

window.Widgets.promo = (function () {
  'use strict';

  var spec = null;

  /* config.json is data, not markup. It is a file on the public internet, and
     it goes into innerHTML — so it gets escaped like any other untrusted text. */
  function esc(s) {
    if (s === undefined || s === null) { return ''; }
    return String(s)
      .split('&').join('&amp;')
      .split('<').join('&lt;')
      .split('>').join('&gt;')
      .split('"').join('&quot;');
  }

  function bulletList(items) {
    if (!items || !items.length) { return ''; }
    var html = '<ul class="promo-bullets">';
    /* Three is the limit on a television. A fourth line pushes the button
       below the comfortable reading zone and is rarely read anyway. */
    var n = Math.min(items.length, 3);
    for (var i = 0; i < n; i++) {
      html += '<li><span class="promo-tick" aria-hidden="true"></span>' +
              '<span>' + esc(items[i]) + '</span></li>';
    }
    return html + '</ul>';
  }

  function artwork(s) {
    /* A real product image converts better than any amount of typography, so
       the slot is here and ready. Until one exists, fall back to a mark rather
       than a broken-image icon or an empty hole. */
    if (s.image) {
      return '<div class="promo-art">' +
               '<img src="' + esc(s.image) + '" alt="" ' +
               'onerror="this.parentNode.className=\'promo-art fallback\';this.remove();">' +
             '</div>';
    }
    /* No image configured: render nothing at all. An empty placeholder box
       costs vertical space the call to action needs, and reads as unfinished
       rather than as deliberate restraint. */
    return '';
  }

  function mount(root, promoSpec) {
    spec = promoSpec || {};

    root.innerHTML =
      '<div class="promo-main">' +
        (spec.eyebrow ? '<div class="promo-eyebrow">' + esc(spec.eyebrow) + '</div>' : '') +
        '<div class="promo-title">' + esc(spec.title || '') + '</div>' +
        (spec.subtitle ? '<div class="promo-subtitle">' + esc(spec.subtitle) + '</div>' : '') +
        (spec.lead ? '<div class="promo-lead">' + esc(spec.lead) + '</div>' : '') +
        '<button class="promo-cta" id="promo-cta" data-focusable tabindex="0">' +
          esc(spec.cta && spec.cta.label ? spec.cta.label : '') +
        '</button>' +
        (spec.note ? '<div class="promo-note">' + esc(spec.note) + '</div>' : '') +
        '<div class="promo-opens">' + esc(window.S['promo.opens']) + '</div>' +
      '</div>' +
      /* Bullets live in the second column, not under the pitch. A television is
         wide and short: stacking everything vertically runs the call to action
         off the bottom of the screen, which is precisely where it must not be. */
      '<div class="promo-side">' + artwork(spec) + bulletList(spec.bullets) + '</div>';

    /* Written outside the promo block on purpose — see index.html. */
    var legal = document.getElementById('promo-legal');
    if (legal && spec.disclaimer) { legal.textContent = spec.disclaimer; }

    var btn = document.getElementById('promo-cta');
    if (btn) { btn.addEventListener('click', open, false); }
  }

  /* Amazon takes an extra parameter that opens its purchase/install dialog
     over the current screen instead of the full listing page:

        amzn://apps/android?initiatePurchaseFlow=true&asin=...

     Set `"purchaseFlow": true` on the cta in config.json to use it.

     It is off by default, and the reason is conversion rather than caution: for
     an app nobody has heard of, the listing page is doing real work — the
     screenshots, the description and the reviews are what convince somebody
     who arrived sceptical. A bare price dialog removes all of that and asks
     for money immediately. The dialog is the better ending for a visitor who
     is already sold; the page is better for one who is not yet. */
  function storeUri(asin, pkg) {
    var cta = spec.cta || {};
    var flow = cta.purchaseFlow ? 'initiatePurchaseFlow=true&' : '';
    if (asin) { return 'amzn://apps/android?' + flow + 'asin=' + encodeURIComponent(asin); }
    if (pkg)  { return 'amzn://apps/android?' + flow + 'p=' + encodeURIComponent(pkg); }
    return null;
  }

  function open() {
    var cta = spec.cta || {};
    var asin = cta.asin;
    var pkg = cta.package;

    /* Outside the shell there is no Android to hand an intent to, so go
       straight to the web listing. */
    if (!window.Shell || !window.Shell.present) {
      if (cta.webUrl) { window.location.href = cta.webUrl; }
      return;
    }

    /* Best transport first, each falling back to the next.

       The last rung matters: navigating to an amzn: URL is caught by the
       shell's own navigation lock, which turns it into an Intent. That means
       this works on APKs built before openAppstoreAsin existed — nobody has to
       reinstall to get a working button. */
    if (cta.purchaseFlow) {
      fallbackNavigate(asin, pkg, cta);
      return;
    }

    if (asin && typeof window.Shell.openAppstoreAsin === 'function') {
      window.Shell.openAppstoreAsin(asin).then(function (r) {
        if (r === 'unavailable') { fallbackNavigate(asin, pkg, cta); }
      })['catch'](function () { fallbackNavigate(asin, pkg, cta); });
      return;
    }

    if (pkg && typeof window.Shell.openAppstore === 'function') {
      window.Shell.openAppstore(pkg).then(function (r) {
        if (r === 'unavailable') { fallbackNavigate(asin, pkg, cta); }
      })['catch'](function () { fallbackNavigate(asin, pkg, cta); });
      return;
    }

    fallbackNavigate(asin, pkg, cta);
  }

  function fallbackNavigate(asin, pkg, cta) {
    var uri = storeUri(asin, pkg);
    if (uri) {
      try { window.location.href = uri; return; } catch (e) { }
    }
    if (cta && cta.webUrl) { window.location.href = cta.webUrl; }
  }

  /* storeUri is exported because it is a pure string builder and the single
     place the purchaseFlow switch actually takes effect — being able to assert
     on it beats navigating away to find out. */
  return { mount: mount, open: open, storeUri: storeUri };
})();
