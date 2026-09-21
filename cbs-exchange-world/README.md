# CBS Exchange Explorer

A static, GitHub Pages-ready website for exploring the CBS undergraduate historical exchange placement distribution file.

## Included in this first build

- All 258 university entries from the supplied CBS CSV
- Interactive world map
- Sortable list view
- Search by university, business school, or country
- Country filter
- Minimum 2026–27 places filter
- Historical availability filter (0–5 years)
- Filter for universities with `Places available` in both 2026–27 and 2025–26
- Detail view showing all five years
- Browser-side coordinate lookup via Wikipedia, cached locally

## Run locally

Because the site loads JSON with `fetch`, serve the folder rather than opening `index.html` directly:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

Upload the contents of this folder to a GitHub repository and enable GitHub Pages for the repository. No build step or backend is required.

## Next data fields to add

The data model is ready to be extended with:

- monthly average temperature
- distance to ocean coast
- distance to significant water
- distance to an accessible beach
- cost of living / housing indicators
- flight distance/time from Copenhagen
- rankings or other user-selected criteria

## Data note

The CBS file is historical distribution data. It explicitly says it is not a list of current partner universities or currently available places. This site preserves that distinction.
