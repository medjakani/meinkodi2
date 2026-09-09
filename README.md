# meinkodi — remote content for the Fire TV shell app

This repo **is** the app's screen. The Android APK is a thin container that reads
`config.json`, then loads whatever page `contentUrl` points at. Change a file here, push,
and every installed TV picks it up. No APK update, no store review.

## Layout

| Path | What it is |
|---|---|
| `config.json` | Read by the APK **first**, on every launch. Controls which page loads, the minimum app version, and the (currently empty) button list. |
| `app/` | The page the TV actually renders. Button icons, if you add buttons later, go in `app/img/`. |
| `index.html` | A plain landing page for humans who open the domain in a browser. |
| `.nojekyll` | Stops GitHub Pages' Jekyll from eating files that start with `_`. |

## Publishing a change

```
git add -A && git commit -m "..." && git push
```

GitHub Pages rebuilds in roughly 30–60 seconds.

**Two things you must do on every deploy:**

1. Bump `CACHE` in `app/sw.js`. The service worker serves the old files forever if you
   don't, and you will think the deploy silently failed.
2. Bump `contentVersion` in `config.json` if you want running TVs to reload themselves
   without being restarted.

## The escape hatch

`config.json` is fetched from the domain baked into the APK, but `contentUrl` inside it can
point **anywhere**. If you ever leave GitHub Pages, repoint the DNS for `medjakani.github.io/meinkodi`
and nothing else has to change. That indirection is the whole reason for the custom domain.

## Emergency switch

Set `notice` to show a full-screen card rendered by the **app itself**, so it still works
when the page is broken:

```json
"notice": {
  "title": "Back shortly",
  "body": "We're updating the service. Try again in a few minutes.",
  "dismissible": false
}
```

Set it back to `null` when you're done.
