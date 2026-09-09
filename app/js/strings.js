/* ---------------------------------------------------------------------------
   strings.js — every piece of user-facing chrome on this page, in every
   language it ships in.

   Promotional copy is NOT here: that lives in config.json, so it can be
   rewritten and pushed without touching code. This file is the furniture —
   labels, units, error messages.

   Language is chosen in this order:
     1. `lang` in config.json          (explicit, per app)
     2. the device's own language      (a German Fire TV gets German)
     3. English                        (last resort)

   RULE: every failure has its own message saying what actually happened and
   what to do about it. "Error" is never acceptable on a screen somebody is
   looking at from a sofa with only a remote.
   --------------------------------------------------------------------------- */

window.STRINGS = {

  en: {
    'app.name':             'KD Fireboard',

    'speed.title':          'Internet speed',
    'speed.hint':           'Press OK to test',
    'speed.hint.again':     'Press OK to test again',
    'speed.idle':           'Ready when you are',
    'speed.idle.sub':       'Nothing is measured until you ask — the test uses real data.',
    'speed.stage.latency':  'Measuring response time…',
    'speed.stage.download': 'Measuring download…',
    'speed.stage.upload':   'Measuring upload…',
    'speed.stage.done':     'Test complete',
    'speed.running':        'Testing…',
    'speed.unit':           'Mbps',
    'speed.metric.down':    'Download',
    'speed.metric.up':      'Upload',
    'speed.metric.ping':    'Latency',
    'speed.metric.jitter':  'Jitter',
    'speed.pending':        '—',

    'speed.err.offline':    'No internet connection. Check your network in Fire TV Settings.',
    'speed.err.blocked':    'Could not reach the test server. A router, DNS filter or VPN may be blocking it.',
    'speed.err.timeout':    'The test timed out. Your connection may be very slow or unstable.',
    'speed.err.http':       'The test server replied with an error ({0}). Try again in a moment.',
    'speed.err.aborted':    'Test stopped.',
    'speed.link.wifi':      'Wi‑Fi · {0} Mbps link',
    'speed.link.wifi.weak': 'Wi‑Fi · {0} Mbps link · weak signal',
    'speed.link.ethernet':  'Wired connection',

    'sys.title':            'This device',
    'sys.storage':          'Storage',
    'sys.memory':           'Memory',
    'sys.device':           'Device',
    'sys.system':           'System',
    'sys.free':             '{0} free of {1}',
    'sys.storage.low':      '{0} free of {1} · running low',
    'sys.storage.critical': '{0} free of {1} · almost full',
    'sys.unavailable':      'Device details are only available inside the app, not in a web browser.',
    'sys.unreadable':       'Device details could not be read.',

    'promo.opens':          'Opens the Amazon Appstore on this device',
    'action.open':          'Open',
    'action.get':           'Get',
    'action.err.nostore':   'The Amazon Appstore could not be opened on this device.',
    'action.err.notfound':  '{0} is not installed on this device.',
    'action.err.noshell':   'This link only works inside the app.',

    'general.offline':      'No internet connection',
    'general.offline.sub':  'The clock keeps working. Everything else resumes when the network is back.'
  },

  de: {
    'app.name':             'KD Fireboard',

    'speed.title':          'Internet­geschwindigkeit',
    'speed.hint':           'OK drücken zum Testen',
    'speed.hint.again':     'OK drücken für erneuten Test',
    'speed.idle':           'Bereit, wenn Sie es sind',
    'speed.idle.sub':       'Es wird nichts gemessen, bevor Sie es starten — der Test verbraucht echtes Datenvolumen.',
    'speed.stage.latency':  'Reaktionszeit wird gemessen…',
    'speed.stage.download': 'Download wird gemessen…',
    'speed.stage.upload':   'Upload wird gemessen…',
    'speed.stage.done':     'Test abgeschlossen',
    'speed.running':        'Test läuft…',
    /* German convention is Mbit/s, not Mbps. Using the English abbreviation
       here is one of those small things that quietly signals a translation. */
    'speed.unit':           'Mbit/s',
    'speed.metric.down':    'Download',
    'speed.metric.up':      'Upload',
    'speed.metric.ping':    'Latenz',
    'speed.metric.jitter':  'Jitter',
    'speed.pending':        '—',

    'speed.err.offline':    'Keine Internetverbindung. Prüfen Sie das Netzwerk in den Fire TV Einstellungen.',
    'speed.err.blocked':    'Der Testserver war nicht erreichbar. Möglicherweise blockiert ein Router, DNS-Filter oder VPN die Verbindung.',
    'speed.err.timeout':    'Zeitüberschreitung beim Test. Ihre Verbindung ist möglicherweise sehr langsam oder instabil.',
    'speed.err.http':       'Der Testserver hat einen Fehler gemeldet ({0}). Bitte gleich noch einmal versuchen.',
    'speed.err.aborted':    'Test abgebrochen.',
    'speed.link.wifi':      'WLAN · {0} Mbit/s Verbindung',
    'speed.link.wifi.weak': 'WLAN · {0} Mbit/s Verbindung · schwaches Signal',
    'speed.link.ethernet':  'LAN-Verbindung',

    'sys.title':            'Dieses Gerät',
    'sys.storage':          'Speicher',
    'sys.memory':           'Arbeitsspeicher',
    'sys.device':           'Gerät',
    'sys.system':           'System',
    'sys.free':             '{0} frei von {1}',
    'sys.storage.low':      '{0} frei von {1} · wird knapp',
    'sys.storage.critical': '{0} frei von {1} · fast voll',
    'sys.unavailable':      'Gerätedaten sind nur in der App verfügbar, nicht im Browser.',
    'sys.unreadable':       'Gerätedaten konnten nicht gelesen werden.',

    'promo.opens':          'Öffnet den Amazon Appstore auf diesem Gerät',
    'action.open':          'Öffnen',
    'action.get':           'Holen',
    'action.err.nostore':   'Der Amazon Appstore konnte auf diesem Gerät nicht geöffnet werden.',
    'action.err.notfound':  '{0} ist auf diesem Gerät nicht installiert.',
    'action.err.noshell':   'Dieser Link funktioniert nur in der App.',

    'general.offline':      'Keine Internetverbindung',
    'general.offline.sub':  'Die Uhr läuft weiter. Alles andere kommt von selbst zurück, sobald das Netzwerk wieder da ist.'
  }
};

/* The active table. Widgets read window.S, so this must be populated before
   anything mounts. */
window.S = {};

window.setLang = function (lang) {
  var table = null;

  if (lang && window.STRINGS[lang]) {
    table = window.STRINGS[lang];
  } else {
    /* "de-DE" and "de-AT" both mean the German table. */
    var nav = (navigator.language || 'en').toLowerCase().split('-')[0];
    table = window.STRINGS[nav] || window.STRINGS.en;
    lang = window.STRINGS[nav] ? nav : 'en';
  }

  /* Copy rather than reassign, so anything that captured a reference to
     window.S earlier still sees the right strings. */
  for (var k in window.S) {
    if (Object.prototype.hasOwnProperty.call(window.S, k) && k !== 'fmt') {
      delete window.S[k];
    }
  }
  for (var j in table) {
    if (Object.prototype.hasOwnProperty.call(table, j)) { window.S[j] = table[j]; }
  }

  window.S.lang = lang;
  document.documentElement.setAttribute('lang', lang);
  return lang;
};

/* Tiny positional formatter: S.fmt('a {0} b', 'x'). No dependencies, and it
   keeps placeholder order under the translator's control. */
window.S.fmt = function (key, a, b) {
  var s = window.S[key];
  if (s === undefined) { return key; }          // Loud on purpose: a missing
  if (a !== undefined) { s = s.split('{0}').join(a); }  // key shows as the key.
  if (b !== undefined) { s = s.split('{1}').join(b); }
  return s;
};

/* Sensible default immediately, so nothing can read an empty table. app.js
   calls setLang again once config.json has been read. */
window.setLang(null);
