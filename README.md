# CBS Exchange Explorer

Static GitHub Pages site for exploring CBS bachelor exchange destinations.

## Included in v4

- Interactive world map with CBS competitiveness colors from the original Excel workbook.
- History-window selector for 1, 2, 3, 4, or all 5 CBS distribution years.
- Country and continent filters.
- ARWU 2026 ranking filter and sorting.
- September–December temperature averages from NASA POWER 1991–2020 climatology, with monthly breakdowns.
- Extra coordinate fallbacks and climate request retries for partner/campus names that were previously missing temperatures, including Tec de Monterrey campuses.
- Numbeo 2026 Mid-Year country Cost of Living + Rent Index as a relative cost proxy, with sorting and filtering.
- University age filter and detail history: founded year from Wikidata P571 plus a short Wikipedia introduction.

## Data caveats

- CBS distribution history is historical and does not guarantee future placement availability.
- The Numbeo value is country-level, crowdsourced, and not a student monthly budget. It is best used for relative comparison.
- Founded year describes the institution and does not prove that the exchange campus or its buildings are equally old.
- Wikipedia/Wikidata history data is loaded in the browser and cached locally, so it may take a short moment on first visit.

## Publish on GitHub Pages

Upload the contents of this folder to the repository root. Keep Pages set to `main` / `(root)`. GitHub Pages will redeploy automatically after the commit.
