# Oil Price Tracker (WTI/Brent) — TRMNL plugin

Crude oil prices on your TRMNL e-ink display: WTI and Brent, with daily/weekly/monthly change, 52-week range, the Brent–WTI spread, and a 30-session chart.

Published as a public TRMNL recipe: **[trmnl.com/recipes/375844](https://trmnl.com/recipes/375844)**

![Oil Price Tracker on TRMNL](https://trmnl-public.s3.us-east-2.amazonaws.com/7i5dayr509sydoqcic3d153jnutz)

## How it works

No server, no hosting cost, no API key. A scheduled job fetches the prices, commits a static `data.json`, and TRMNL polls that file.

```
scheduled trigger
  → scripts/fetch-oil.mjs  (Yahoo Finance chart API)
  → data.json  (committed to the repo)
  → served over GitHub Pages
  → TRMNL polling strategy → Liquid templates → e-ink screen
```

All the display geometry is precomputed in Node at build time — the SVG sparkline points, the chart line and area paths, the last-point marker coordinates, every percentage. The Liquid templates only interpolate strings; they run no math. That keeps rendering fast and stays well within what Liquid can express.

## Repository layout

| Path | Role |
| --- | --- |
| `scripts/fetch-oil.mjs` | Node ESM, zero dependencies. Fetches both symbols, computes the stats and the SVG geometry, writes `data.json` |
| `data.json` | The file TRMNL polls |
| `.github/workflows/update-oil.yml` | Runs the script and commits the result |

The Liquid templates live in the TRMNL plugin editor rather than in this repo.

## Data source

[Yahoo Finance](https://finance.yahoo.com) chart endpoint, one year of daily closes per symbol:

- **WTI** — `CL=F` (NYMEX Light Sweet Crude futures)
- **Brent** — `BZ=F` (Brent Crude Last Day Financial futures)

No authentication, no key, no quota to manage.

One deliberate choice worth flagging: the daily change is computed against the second-to-last close of our own series, not against Yahoo's `previousClose` / `chartPreviousClose`. Those fields can point at a desynchronised session on futures that trade nearly around the clock, which silently doubles the reported day change.

## Update frequency

The GitHub Actions cron (`17 */3 * * *`) is a safety net only. The real cadence comes from an external trigger (cron-job.org) calling the workflow more often, so the screen stays close to the market without burning Actions minutes on a tight schedule.

## What's in data.json

Per asset (`wti`, `brent`):

`price`, `day_change`, `day_change_pct`, `week_change_pct`, `month_change_pct`, `low_52w`, `high_52w`, `trend`, `sparkline_points` (SVG polyline, 200×44), and a `chart` object (`view_box`, `line_path`, `area_path`, `last_x`, `last_y`, `min`, `max`) on a fixed 200×90 viewBox.

Top level also carries `generated_at`, `spread` and `spread_pct` (Brent minus WTI).

## Use it

Easiest path — install the published recipe, nothing to configure:

**[Install Oil Price Tracker](https://trmnl.com/recipes/375844)**

To run your own copy:

1. Fork this repo
2. **Settings → Actions → General → Workflow permissions → Read and write permissions**
3. **Settings → Pages → Deploy from branch**, so `data.json` is publicly reachable
4. **Actions** tab → *Update Oil Prices* → **Run workflow**, to generate the first file
5. In TRMNL, create a private plugin with the **Polling** strategy pointing at your `data.json` URL

## Other TRMNL plugins

All of my published recipes, with live install counts: **[nbbou81000/trmnl-recipes](https://github.com/nbbou81000/trmnl-recipes)**

## License

MIT

