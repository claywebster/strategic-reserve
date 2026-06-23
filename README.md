# Draining the Reserve

An attractive, mobile-first website that tracks the depletion of the **U.S. Strategic
Petroleum Reserve (SPR)** — now at its lowest level since 1983 — alongside the price of
light sweet crude (WTI), the world's top crude exporters, and oil flow through the
Strait of Hormuz.

It's a plain static site (HTML + CSS + vanilla JS + [Chart.js](https://www.chartjs.org/)
via CDN). No build step, no server. Data lives in `data/*.json` and is refreshed
automatically from the [U.S. EIA Open Data API](https://www.eia.gov/opendata/).

## Layout

| Path | Purpose |
| --- | --- |
| `index.html` | Single page: hero + four data sections |
| `assets/css/styles.css` | Dark, depletion-themed, responsive styling |
| `assets/js/app.js` | Loads `data/*.json`, renders the charts and counters |
| `data/spr.json` | SPR level — current, year-end annual series, peak, events |
| `data/wti.json` | WTI spot price series |
| `data/exporters.json` | Top crude-oil exporters by country |
| `data/hormuz.json` | Strait of Hormuz oil flow & tanker estimate |
| `scripts/fetch-data.mjs` | Pulls fresh EIA data and rewrites `data/*.json` |
| `.github/workflows/update-data.yml` | Daily scheduled refresh + manual trigger |

## Run locally

Charts load data with `fetch()`, so serve over HTTP rather than opening the file
directly:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Keep it up to date

Data refreshes automatically via GitHub Actions (`Refresh EIA data`), which runs the
fetch script daily and commits any changes.

1. Get a free API key at <https://www.eia.gov/opendata/register.php>.
2. In the repo: **Settings → Secrets and variables → Actions → New repository secret**,
   name it `EIA_API_KEY`, paste the key.
3. Trigger **Actions → Refresh EIA data → Run workflow** to populate live numbers, or
   wait for the daily schedule.

To refresh by hand:

```bash
EIA_API_KEY=your_key node scripts/fetch-data.mjs
```

**Data sources:** SPR series `WCSSTUS1`, WTI series `RWTC`, EIA International crude
exports, and EIA World Oil Transit Chokepoints. `exporters.json` and `hormuz.json` are
curated EIA snapshots (those datasets lack a clean unattended series); `spr.json` and
`wti.json` refresh fully from the API.

## Deploy (GitHub Pages)

**Settings → Pages → Build and deployment → Deploy from a branch**, pick the branch and
`/ (root)`. The included `.nojekyll` ensures `assets/` and `data/` are served as-is.

Data: U.S. Energy Information Administration.
