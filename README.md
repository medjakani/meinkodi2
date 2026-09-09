# meinkodi2 — remote content for Lumen Board

This repo **is** the Lumen Board screen. The Android APK reads `config.json`, then loads
whatever page `contentUrl` points at. Change a file here, push, and every installed TV
picks it up. No APK update, no store review.

| Path | What it is |
|---|---|
| `config.json` | Read by the APK **first**, on every launch. |
| `app/` | The page the TV renders. |
| `index.html` | A plain landing page for humans. |
| `.nojekyll` | Stops GitHub Pages' Jekyll from eating files that start with `_`. |

## Publishing a change

**Bump `CACHE` in `app/sw.js` on every deploy.** Miss it and every installed TV keeps
serving the old files while your push looks like it silently failed.

## Relationship to `meinkodi`

`app/` here is a copy of the same page code that runs KD Fireboard. The two apps are
themed by their config, not by different code. If you fix something in one `app/` folder,
copy it to the other — otherwise the two slowly drift apart and a bug fixed once comes
back in the other app.
