# JARVIS Command Center

A separate static command-center view of the public Grok Bots daily snapshot. It does not replace the original dashboard, and it does not write back to that site.

The intended public address, once this folder is published from its own repository, is:

https://nlaughter100.github.io/grokbot-javis-dashboard/

The spelling `javis` is intentional. This copy is not deployed by the work in the original `grokbot-dashboard` repository.

## What it reads

The page polls:

https://nlaughter100.github.io/grokbot-dashboard/data.json

- Cache-busting query `t` plus `cache: "no-store"`
- Automatic refresh every 60 seconds while the tab is visible
- Manual refresh from the header, the quick commands, and the retry chip
- Footer shows the file’s source time, the last fetch time, the age, and the source note

GitHub Pages serves that file with `Access-Control-Allow-Origin: *`, so this site can read it from another Pages project on any host.

The file is a daily snapshot (routines, done / pending / needs lists, week cells, metrics, and a year field). It is not live process telemetry. The board says so in the hero, the feed, the week panel, and the footer.

## Honest empty states

| State | Meaning |
| --- | --- |
| SNAPSHOT CURRENT | File timestamp is under 40 hours old |
| STALE SNAPSHOT | Timestamp is older than 40 hours; rows still show that file |
| LINK OFFLINE | Latest fetch failed; the last good file stays on screen |
| NO SNAPSHOT | Nothing has loaded; counts stay blank instead of becoming zeros |
| SOURCE UNKNOWN | Payload or timestamp could not be trusted |
| NO DATA | A week cell, year field, or metric was absent. `null` is not drawn as zero |

Week cells follow the file legend: `1` done, `0.5` partial, `0` missed, `null` no data. Unrecognized numbers are labeled unrecognized. Year text is shown only when the file has it. There is no annual total, and there are no hardware gauges, because the file does not contain those measurements.

Emails, phone numbers, and `password:` / token-shaped values are redacted on screen if a future snapshot includes them. The current public file is operational status, not a contact list.

## Run locally

No build step. From this directory:

```bash
python3 -m http.server 8765
```

Open http://127.0.0.1:8765/

Logic checks (needs network access to the public snapshot):

```bash
node self-check.mjs
```

## Publish in the separate repository

Do this only in a new repository named `grokbot-javis-dashboard`. Do not merge these files into `grokbot-dashboard` `main`, do not change that repository’s Pages settings, and do not edit its `data.json` or daily update workflow.

1. Create an empty public repository `nlaughter100/grokbot-javis-dashboard`.
2. Copy the contents of this folder to that repository’s root so `index.html` is at the root:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `favicon.svg`
   - `.nojekyll`
   - `README.md`
3. Commit and push to that repository’s default branch.
4. In that repository only: Settings → Pages → Deploy from branch → the default branch → `/ (root)`.
5. Wait until the Pages check is green, then open https://nlaughter100.github.io/grokbot-javis-dashboard/
6. Confirm the status pill, source time, and eight agent names match the original `data.json`. A failed fetch must say `NO SNAPSHOT` or `LINK OFFLINE`, not a row of zeros.

There is no compile, bundler, or environment variable. Optional query `?source=` accepts only an `https://nlaughter100.github.io/...data.json` URL. Anything else is ignored and the original public file is used.

Relative asset paths mean the site works from a project-pages subpath. Do not add a leading slash to the stylesheet or script.

## Files

| File | Role |
| --- | --- |
| `index.html` | Shell, navigation, dialogs |
| `styles.css` | Command-center layout, 1200px desktop and smaller breakpoints |
| `app.js` | Snapshot polling, views, globe, and waveform |
| `self-check.mjs` | Logic checks and a live read of the public file |
| `favicon.svg` | Icon |
| `.nojekyll` | Stops GitHub Pages from running Jekyll |
