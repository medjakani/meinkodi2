/* ---------------------------------------------------------------------------
   promo.js — the offer block.

   Every word of it comes from `promo` in config.json, so the copy can be
   rewritten and pushed in a minute without touching code or rebuilding an APK.
   That matters more here than anywhere else on the page: promotional wording is
   the thing you will want to change most often, and A/B testing it is only
   possible if changing it is free.

   ---------------------------------------------------------------------------
   WHY THERE ARE NOW TWO BUTTONS

   The earlier version of this file had exactly one, on the standard reasoning
   that a second call to action splits attention and costs conversions on a
   10-foot screen. That reasoning is right in general and wrong here, for a
   reason specific to this app.

   The visitor did not arrive from an advert. They searched the Amazon Appstore
   for "Kodi", found an app whose listing promises to show them how to install
   it, and opened it. They have a question — "how do I get Kodi on this stick?"
   — and a single unexplained button to a product they have never heard of does
   not answer it. It looks like the bait they were half expecting.

   So the screen answers the question honestly and in full: there are two ways,
   here is what each one actually costs you. The manual route is real, it is
   described accurately, and nothing is hidden. It takes about twenty minutes,
   needs developer options, and has to be repeated by hand at every Kodi
   update — and once the viewer has read that, the one-click route sells itself
   without a word of pressure.

   The second button therefore does not compete with the first. It is the
   reason to trust it. It also keeps the store listing honest, which is the
   thing most likely to get this app pulled if it is not.

   The hierarchy still has to be unmistakable, and it is:

   * The primary is filled, glowing, larger, and holds focus on load. Pressing
     OK the moment the screen appears buys Pulse Player. On a television the
     first OK press is the single largest conversion lever there is.
   * The secondary is an outline. Same height, visibly quieter, one D-pad press
     to the right.
   * Each carries a sublabel stating its real cost — "1 Klick · 30 Sekunden"
     against "ADB · ca. 20 Minuten". That contrast is the entire argument, and
     it is made of true statements.

   * Still no countdowns, no fake stock counts, no invented review scores.
     Beyond being dishonest, they are what Amazon looks for when judging
     whether an app is an advert wearing a utility's clothes.
   --------------------------------------------------------------------------- */

window.Widgets = window.Widgets || {};

window.Widgets.promo = (function () {
  'use strict';

  var spec = null;
  var guideOpen = false;

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

  /* A button label plus the small line under it. The sublabel is optional and
     both buttons share the markup, so the two stay the same height however
     the copy is rewritten — an action row whose halves are different heights
     reads as a bug from the sofa. */
  function buttonInner(label, sublabel) {
    return '<span class="cta-label">' + esc(label) + '</span>' +
           (sublabel ? '<span class="cta-sub">' + esc(sublabel) + '</span>' : '');
  }

  /* ------------------------------------------------------------------ main */

  function mount(root, promoSpec) {
    spec = promoSpec || {};

    var cta = spec.cta || {};
    var alt = spec.alt || null;

    /* The second button only exists if config.json asks for it AND there are
       steps for it to show. A half-configured promo falls back to the original
       single-action layout rather than offering a button that goes nowhere. */
    var hasAlt = !!(alt && alt.label && spec.guide && spec.guide.steps &&
                    spec.guide.steps.length);

    root.innerHTML =
      '<div class="promo-main">' +
        (spec.eyebrow ? '<div class="promo-eyebrow">' + esc(spec.eyebrow) + '</div>' : '') +
        '<div class="promo-title">' + esc(spec.title || '') + '</div>' +
        (spec.subtitle ? '<div class="promo-subtitle">' + esc(spec.subtitle) + '</div>' : '') +
        (spec.lead ? '<div class="promo-lead">' + esc(spec.lead) + '</div>' : '') +

        '<div class="promo-actions' + (hasAlt ? '' : ' single') + '">' +
          '<button class="promo-cta" id="promo-cta" data-focusable tabindex="0">' +
            buttonInner(cta.label || '', cta.sublabel) +
          '</button>' +
          (hasAlt
            ? '<button class="promo-alt" id="promo-alt" data-focusable tabindex="0">' +
                buttonInner(alt.label, alt.sublabel) +
              '</button>'
            : '') +
        '</div>' +

        /* Both halves of the fine print on one line. The separator only
           appears when there is something on each side of it, so a config
           without a `note` does not render a leading middot. */
        '<div class="promo-fine">' +
          (spec.note ? esc(spec.note) + ' &middot; ' : '') +
          '<span class="promo-opens">' + esc(window.S['promo.opens']) + '</span>' +
        '</div>' +
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

    var altBtn = document.getElementById('promo-alt');
    if (altBtn) { altBtn.addEventListener('click', showGuide, false); }
  }

  /* ----------------------------------------------------------------- guide */
  /* The manual route, described accurately.

     It is a separate screen rather than an expanding panel because the main
     screen has no vertical room to give — see the budget note at the top of
     the promo section in tv.css — and because a viewer who wants the steps
     wants only the steps, at a size they can read from a sofa.

     The steps are laid out in two columns. Six numbered lines stacked
     vertically is a scroll on a 720p panel, and a TV must never scroll. */

  function stepList(steps) {
    var n = Math.min(steps.length, 8);      // two columns of four; past that, redesign
    var half = Math.ceil(n / 2);
    var html = '';
    var i;

    html += '<ol class="guide-steps" start="1">';
    for (i = 0; i < half; i++) {
      html += '<li><span class="guide-num">' + (i + 1) + '</span>' +
              '<span>' + esc(steps[i]) + '</span></li>';
    }
    html += '</ol><ol class="guide-steps" start="' + (half + 1) + '">';
    for (i = half; i < n; i++) {
      html += '<li><span class="guide-num">' + (i + 1) + '</span>' +
              '<span>' + esc(steps[i]) + '</span></li>';
    }
    return html + '</ol>';
  }

  function mountGuide() {
    var host = document.getElementById('guide');
    var g = spec.guide || {};
    if (!host) { return null; }

    host.innerHTML =
      '<div class="guide-head">' +
        '<div class="guide-title">' + esc(g.title || '') + '</div>' +
        (g.lead ? '<div class="guide-lead">' + esc(g.lead) + '</div>' : '') +
      '</div>' +

      '<div class="guide-body">' + stepList(g.steps || []) + '</div>' +

      '<div class="guide-foot">' +
        '<div class="guide-actions">' +
          /* The offer follows the viewer here rather than making them navigate
             back to find it. Somebody who has just read six steps and a warning
             about repeating them at every update is the most persuaded they
             will ever be; the button has to be under their thumb at that
             moment, not one screen away. */
          '<button class="promo-cta guide-cta" id="guide-cta" data-focusable tabindex="0">' +
            buttonInner(g.cta || (spec.cta && spec.cta.label) || '', g.ctaSub) +
          '</button>' +
          '<button class="promo-alt guide-back" id="guide-back" data-focusable tabindex="0">' +
            buttonInner(g.back || window.S['guide.back'], '') +
          '</button>' +
        '</div>' +
        (g.footnote ? '<div class="guide-foot-note">' + esc(g.footnote) + '</div>' : '') +
      '</div>';

    var go = document.getElementById('guide-cta');
    if (go) { go.addEventListener('click', open, false); }

    var back = document.getElementById('guide-back');
    if (back) { back.addEventListener('click', hideGuide, false); }

    return host;
  }

  function showGuide() {
    if (guideOpen) { return; }
    var host = mountGuide();
    if (!host) { return; }

    host.style.display = '';
    document.getElementById('stage').className += ' guide-open';
    guideOpen = true;

    /* Back must close this screen instead of quitting the app. The shell only
       routes the key to the page while this is on, so it is turned off again
       the moment the guide closes — otherwise Back at the root would stop
       working and the viewer would be trapped, which Amazon fails apps for. */
    if (window.Shell && window.Shell.present) {
      window.Shell.backHandled(true)['catch'](function () { });
    }

    window.Nav.refresh();
    window.Nav.setScreen('guide');
    /* setScreen focuses the remembered element for the screen, which on the
       first visit is whatever comes first in the DOM. Name the button
       explicitly so the offer holds focus here too. */
    var go = document.getElementById('guide-cta');
    if (go) { window.Nav.focus(go); }
  }

  function hideGuide() {
    if (!guideOpen) { return; }
    var stage = document.getElementById('stage');
    var host = document.getElementById('guide');

    if (host) { host.style.display = 'none'; }
    if (stage) {
      stage.className = stage.className.split(' guide-open').join('');
    }
    guideOpen = false;

    if (window.Shell && window.Shell.present) {
      window.Shell.backHandled(false)['catch'](function () { });
    }

    window.Nav.refresh();
    window.Nav.setScreen('main');
    /* Return focus to the button the viewer left from, not to the primary.
       Silently moving focus somewhere else is how a remote stops feeling
       connected to the screen. */
    var alt = document.getElementById('promo-alt');
    if (alt) { window.Nav.focus(alt); }
  }

  /* ---------------------------------------------------------------- action */

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
    var cta = (spec && spec.cta) || {};
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
     on it beats navigating away to find out.

     isGuideOpen and hideGuide are exported for app.js's Back handler: the
     shell asks the page what to do with the key, and only this module knows
     whether a sub-screen is showing. */
  return {
    mount: mount,
    open: open,
    storeUri: storeUri,
    showGuide: showGuide,
    hideGuide: hideGuide,
    isGuideOpen: function () { return guideOpen; }
  };
})();
