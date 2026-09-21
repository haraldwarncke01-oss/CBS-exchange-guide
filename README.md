# CBS Exchange Explorer

A static, GitHub Pages-ready website for exploring CBS undergraduate historical exchange placements on a world map and in a sortable list.

## What's new in v3

- CBS competitiveness/status is read from the **original Excel cell colors**, not inferred from CSV blanks.
- The exact CBS workbook colors are used in the site:
  - `#8586C6` — All places filled — very competitive
  - `#FDDB71` — All places filled — competitive
  - `#50D691` — All places filled
  - no fill — Places available / No places / No data
- A **History window** selector recalculates map colors for the latest 1, 2, 3, 4 or all 5 years.
- A **CBS demand level** filter works against the currently selected history window.
- Each year in the university detail view uses the original CBS color/category.
- Temperature is simplified to a **September–December average** in the map/list/detail headline, with the four individual months expandable in the detail view.
- The temperature filter can still use the Sep–Dec average or a specific month.

## Overall CBS demand rule

The selected history window is summarized transparently:

1. `Places available`, `All places filled`, `Competitive`, and `Very competitive` are comparable categories, ordered from lower to higher demand.
2. `No places` and `No data` are excluded rather than treated as low or high demand.
3. The most frequent category in the selected period is the default overall category.
4. Ties are resolved in favor of the most recent comparable year.
5. Recency override: if the two most recent comparable years agree and are at least two category levels away from the older majority, the recent category is used. An extreme one-year reversal (`Places available` ↔ `Very competitive`) can also override the older majority.

This is intended to reflect the user's preference that a 3/5 historical majority should normally dominate unless the newest observations show a clearly different pattern.

## Dataset

The site contains 258 exchange-university entries from 46 countries. Across the five CBS years, the workbook contains:

- 493 `Places available` observations
- 334 `All places filled` observations
- 202 `Competitive` observations
- 142 `Very competitive` observations
- 74 `No places` observations
- 45 `No data` observations

The CBS workbook states that its color code takes into account the number of applicants, number of places, and academic standing of students selected for a university.

## Climate data

The site requests `T2M` (2 m air temperature) from NASA POWER's Climatology API after a university has been located. September–December values are retained and their arithmetic mean is used as the exchange-period headline temperature.

NASA POWER: <https://power.larc.nasa.gov/>

## ARWU 2026 data

The visible ranking source is the official ShanghaiRanking ARWU 2026 page:

<https://www.shanghairanking.com/rankings/arwu/2026>

The included `.github/workflows/update-arwu.yml` runs `scripts/update_arwu.py`, conservatively matches CBS universities to the published ARWU 2026 table, updates `data/arwu2026.json`, and lets GitHub Pages redeploy automatically.

## GitHub Pages

Upload the **contents** of this folder to the root of the existing GitHub repository, replacing the older version. Keep Pages set to `main` → `/(root)`. No backend is required.

## Data note

The CBS source is historical distribution data. It explicitly says it is not a list of current partner universities or currently available places.
