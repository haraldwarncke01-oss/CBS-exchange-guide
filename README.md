# CBS Exchange Explorer

A static, GitHub Pages-ready website for exploring the CBS undergraduate historical exchange placement distribution file.

## Included

- All 258 university entries from the supplied CBS CSV
- Interactive world map and sortable list view
- Search by university, business school, or country
- Filters for country, number of CBS places and historical availability
- Filter for universities with `Places available` in both 2026–27 and 2025–26
- September, October, November and December average temperatures from NASA POWER climatology data
- ARWU 2026 (ShanghaiRanking) rank/rank band, with filters for top 100 / 200 / 500 / 1000
- Detail view with all five CBS placement years, climate and ranking
- Browser-side university coordinate lookup via Wikipedia, cached locally

## Climate data

The site requests `T2M` (2 m air temperature) from NASA POWER's Climatology API after a university has been located. Only September–December are retained. Nearby universities on the same climate grid cell share a request, and results are cached in the browser so repeat visits are much faster.

NASA POWER: <https://power.larc.nasa.gov/>

## ARWU 2026 data

The visible ranking source is the official ShanghaiRanking ARWU 2026 page:

<https://www.shanghairanking.com/rankings/arwu/2026>

ARWU publishes the best 1,000 of the 2,500+ institutions it assesses. Exact ranks are published at the top of the table and lower positions are published in bands (for example `101-150`). The site therefore says **Not in published top 1000**, rather than `unranked`, when a partner cannot be matched to the published list.

The repository includes `.github/workflows/update-arwu.yml`. After these files are pushed to `main`, GitHub Actions runs `scripts/update_arwu.py`, conservatively matches the CBS partners to the complete ARWU table, writes `data/arwu2026.json`, commits it, and GitHub Pages redeploys automatically. A small verified starter set is included so the UI can show ranking data while the first update is running.

The updater keeps the matched ARWU institution name in the data. This is especially useful for translated names or clear international branch-campus cases (for example Monash University Malaysia → Monash University). Uncertain matches are intentionally left blank instead of being guessed.

## Run locally

Because the site loads JSON with `fetch`, serve the folder rather than opening `index.html` directly:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

Upload the **contents** of this folder to the root of the GitHub repository. With Pages set to `main` → `/(root)`, no application build step or backend is required.

## Data note

The CBS file is historical distribution data. It explicitly says it is not a list of current partner universities or currently available places. This site preserves that distinction.
