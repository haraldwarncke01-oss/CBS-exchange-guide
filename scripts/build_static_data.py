#!/usr/bin/env python3
"""Refresh the static CBS Exchange Explorer data snapshots.

The deployed website reads local CSV files. This script is intended to run in
GitHub Actions (or locally with internet access) to refresh data that comes from
external sources. It never needs to run in a visitor's browser.

External sources used during the refresh:
- MediaWiki/Wikidata: entity matching, coordinates, founding year, official URL.
- Official university websites: discovery of an official History/About page.
- NASA POWER: 1991-2020 Sep-Dec T2M climatology.

Existing curated values are preserved where possible. Failures are non-fatal:
a missing external response leaves the previous static value in place.
"""

from __future__ import annotations

import csv
import html
import math
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
UA = "CBS-Exchange-Explorer/1.0 (static data refresh; GitHub Pages project)"
NOW = datetime.now(timezone.utc).date().isoformat()
CURRENT_YEAR = datetime.now(timezone.utc).year

WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
NASA_API = "https://power.larc.nasa.gov/api/temporal/monthly/climatology/point"

# Curated campus/city fallbacks take precedence over a parent university's coordinates.
COORD_OVERRIDES = {
    2: (-34.6037, -58.3816), 3: (-32.9442, -60.6505), 26: (50.8798, 4.7005),
    28: (-23.5505, -46.6333), 46: (-33.4489, -70.6693), 51: (22.5431, 114.0579),
    55: (29.8683, 121.5440), 113: (45.4642, 9.1900), 125: (3.0646, 101.6031),
    127: (19.4326, -99.1332), 128: (20.6597, -103.3496), 129: (19.4326, -99.1332),
    130: (25.6866, -100.3161), 131: (20.5888, -100.3899), 132: (19.3574, -99.2760),
    170: (43.2630, -2.9350), 171: (43.3183, -1.9812),
}


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow({k: row.get(k, "") for k in fields})


def get_json(url: str, params: dict | None = None, timeout: int = 20, attempts: int = 3):
    last = None
    for attempt in range(attempts):
        try:
            r = requests.get(url, params=params, headers={"User-Agent": UA}, timeout=timeout)
            r.raise_for_status()
            return r.json()
        except Exception as exc:
            last = exc
            time.sleep(0.8 * (attempt + 1))
    raise last  # type: ignore[misc]


def wiki_exact_batch(rows: list[dict]) -> dict[int, dict]:
    """Resolve exact/redirected English Wikipedia titles in one request."""
    if not rows:
        return {}
    titles = [r["lookup_name"] or r["university"] for r in rows]
    params = {
        "action": "query", "format": "json", "redirects": 1,
        "prop": "pageprops|coordinates|info", "inprop": "url", "colimit": "max",
        "titles": "|".join(titles),
    }
    j = get_json(WIKI_API, params)
    aliases = {}
    q = j.get("query", {})
    for item in q.get("normalized", []) + q.get("redirects", []):
        aliases[item.get("from", "").lower()] = item.get("to", "")
    pages = {p.get("title", "").lower(): p for p in q.get("pages", {}).values() if not p.get("missing")}
    out = {}
    for row, title in zip(rows, titles):
        resolved = aliases.get(title.lower(), title).lower()
        p = pages.get(resolved)
        if p:
            out[int(row["id"])] = p
    return out


def wiki_search_one(row: dict) -> dict | None:
    query = f"{row['lookup_name'] or row['university']} {row['country']} university"
    params = {
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": 0,
        "gsrlimit": 1, "gsrsearch": query,
        "prop": "pageprops|coordinates|info", "inprop": "url", "colimit": "max",
    }
    try:
        j = get_json(WIKI_API, params)
        pages = list(j.get("query", {}).get("pages", {}).values())
        return pages[0] if pages else None
    except Exception:
        return None


def resolve_wikipedia(universities: list[dict]) -> dict[int, dict]:
    pages: dict[int, dict] = {}
    for i in range(0, len(universities), 40):
        batch = universities[i:i + 40]
        try:
            pages.update(wiki_exact_batch(batch))
        except Exception as exc:
            print("Wikipedia exact batch failed:", exc)
        time.sleep(0.08)
    missing = [u for u in universities if int(u["id"]) not in pages]
    with ThreadPoolExecutor(max_workers=5) as pool:
        futs = {pool.submit(wiki_search_one, u): u for u in missing}
        for fut in as_completed(futs):
            u = futs[fut]
            try:
                p = fut.result()
                if p:
                    pages[int(u["id"])] = p
            except Exception:
                pass
    print(f"Wikipedia entity matches: {len(pages)}/{len(universities)}")
    return pages


def wikidata_entities(qids: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for i in range(0, len(qids), 45):
        batch = qids[i:i + 45]
        try:
            j = get_json(WIKIDATA_API, {
                "action": "wbgetentities", "format": "json", "ids": "|".join(batch),
                "props": "claims|labels", "languages": "en",
            })
            out.update(j.get("entities", {}))
        except Exception as exc:
            print("Wikidata entity batch failed:", exc)
        time.sleep(0.08)
    return out


def claim_values(entity: dict, prop: str):
    vals = []
    for c in entity.get("claims", {}).get(prop, []):
        dv = c.get("mainsnak", {}).get("datavalue", {}).get("value")
        if dv is not None:
            vals.append(dv)
    return vals


def inception_year(entity: dict) -> int | None:
    years = []
    for v in claim_values(entity, "P571"):
        if not isinstance(v, dict):
            continue
        m = re.match(r"^\+?(\d{1,4})-", str(v.get("time", "")))
        if m:
            y = int(m.group(1))
            if 800 <= y <= CURRENT_YEAR:
                years.append(y)
    return min(years) if years else None


def preferred_url_claim(entity: dict, prop: str) -> str:
    claims = entity.get("claims", {}).get(prop, [])
    preferred = [c for c in claims if c.get("rank") == "preferred"] or claims
    for c in preferred:
        v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(v, str) and v.startswith(("http://", "https://")):
            return v
    return ""


def preferred_official_url(entity: dict) -> str:
    return preferred_url_claim(entity, "P856")


def coord_from_entity(entity: dict):
    for v in claim_values(entity, "P625"):
        if isinstance(v, dict):
            lat, lon = v.get("latitude"), v.get("longitude")
            if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
                return float(lat), float(lon)
    return None


def page_coord(page: dict):
    c = (page.get("coordinates") or [None])[0]
    if c and isinstance(c.get("lat"), (int, float)) and isinstance(c.get("lon"), (int, float)):
        return float(c["lat"]), float(c["lon"])
    return None


def normalize_host(url: str) -> str:
    host = urlparse(url).netloc.lower().split(":")[0]
    return host[4:] if host.startswith("www.") else host


def same_org_host(a: str, b: str) -> bool:
    ha, hb = normalize_host(a), normalize_host(b)
    return bool(ha and hb and (ha == hb or ha.endswith("." + hb) or hb.endswith("." + ha)))


HISTORY_WORDS = [
    ("history", 15), ("heritage", 13), ("our story", 12), ("story", 8),
    ("tradition", 8), ("about us", 5), ("about", 3), ("who we are", 4),
]


def discover_history_url(website: str) -> str:
    if not website:
        return ""
    try:
        r = requests.get(website, headers={"User-Agent": UA}, timeout=10, allow_redirects=True)
        if not r.ok or "html" not in r.headers.get("content-type", "").lower():
            return ""
        soup = BeautifulSoup(r.text[:2_000_000], "html.parser")
        candidates = []
        for a in soup.find_all("a", href=True):
            href = urljoin(r.url, a.get("href", "").strip())
            if not href.startswith(("http://", "https://")) or not same_org_host(r.url, href):
                continue
            text = " ".join(a.stripped_strings).lower()
            low = (text + " " + href.lower()).replace("_", " ").replace("-", " ")
            score = sum(weight for word, weight in HISTORY_WORDS if word in low)
            if score:
                # Favor explicit history pages over generic About navigation.
                if "history" in href.lower() or "heritage" in href.lower():
                    score += 10
                candidates.append((score, len(href), href.split("#")[0]))
        if candidates:
            candidates.sort(key=lambda x: (-x[0], x[1]))
            return candidates[0][2]
    except Exception:
        pass
    return ""


def official_founding_year(url: str) -> int | None:
    """Use only explicit 'founded/established in YEAR' wording from an official page."""
    if not url:
        return None
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=10, allow_redirects=True)
        if not r.ok or "html" not in r.headers.get("content-type", "").lower():
            return None
        text = " ".join(BeautifulSoup(r.text[:2_000_000], "html.parser").stripped_strings)
        patterns = [
            r"\b(?:founded|established|created)\s+(?:in\s+)?(1\d{3}|20\d{2})\b",
            r"\b(?:foundation|establishment)\s+(?:dates?\s+)?(?:to\s+)?(1\d{3}|20\d{2})\b",
        ]
        years = []
        for pat in patterns:
            years += [int(y) for y in re.findall(pat, text, flags=re.I)]
        years = [y for y in years if 800 <= y <= CURRENT_YEAR]
        return min(years) if years else None
    except Exception:
        return None


def make_history_note(name: str, year: int | None, city: str, country: str, official_history_url: str) -> str:
    loc = ", ".join(x for x in [city, country] if x)
    if year:
        age = max(0, CURRENT_YEAR - year)
        s = f"Founded in {year}, {name} is about {age} years old"
        if loc:
            s += f" and is based in {loc}"
        s += "."
    else:
        s = f"{name}"
        if loc:
            s += f" is based in {loc}"
        s += ". Its founding year has not yet been verified in the local dataset."
    if official_history_url:
        s += " An official university history/about page is available from the link below."
    return s


def grid_key(lat: float, lon: float):
    return round(lat * 2) / 2, round(lon / 0.625) * 0.625


def nasa_climate(lat: float, lon: float) -> dict | None:
    params = {
        "parameters": "T2M", "community": "SB", "longitude": lon, "latitude": lat,
        "format": "JSON", "start": 1991, "end": 2020,
    }
    for attempt in range(3):
        try:
            j = get_json(NASA_API, params=params, timeout=25, attempts=1)
            p = j.get("properties", {}).get("parameter", {}).get("T2M", {})
            vals = {m: float(p[m]) for m in ["SEP", "OCT", "NOV", "DEC"]}
            if all(math.isfinite(v) and v > -90 for v in vals.values()):
                vals["AVG"] = sum(vals.values()) / 4
                return vals
        except Exception:
            time.sleep(1.0 * (attempt + 1))
    return None


def main():
    universities = read_csv(DATA / "universities.csv")
    locations = {int(r["id"]): r for r in read_csv(DATA / "university_locations.csv")}
    profiles = {int(r["university_id"]): r for r in read_csv(DATA / "university_profiles.csv")}
    climate = {int(r["university_id"]): r for r in read_csv(DATA / "climate.csv")}
    if not universities:
        raise SystemExit("data/universities.csv is missing or empty")

    pages = resolve_wikipedia(universities)
    qid_by_id = {}
    qids = []
    for uid, p in pages.items():
        qid = p.get("pageprops", {}).get("wikibase_item")
        if qid:
            qid_by_id[uid] = qid
            qids.append(qid)
    entities = wikidata_entities(sorted(set(qids)))

    # First update structured metadata and coordinates.
    for u in universities:
        uid = int(u["id"])
        loc = locations.setdefault(uid, {})
        prof = profiles.setdefault(uid, {})
        p = pages.get(uid, {})
        ent = entities.get(qid_by_id.get(uid, ""), {})

        loc.update({"id": uid, "university": u["university"], "country": u["country"],
                    "city": loc.get("city", ""), "continent": loc.get("continent", "")})
        if uid in COORD_OVERRIDES:
            lat, lon = COORD_OVERRIDES[uid]
            loc["latitude"], loc["longitude"], loc["location_source"] = lat, lon, "manual campus/city fallback"
        elif not (loc.get("latitude") and loc.get("longitude")):
            c = page_coord(p) or coord_from_entity(ent)
            if c:
                loc["latitude"], loc["longitude"] = c
                loc["location_source"] = "Wikimedia metadata snapshot"

        qid = qid_by_id.get(uid, "")
        prof.update({"university_id": uid, "university": u["university"], "wikidata_qid": qid})
        if not prof.get("founded_year"):
            fy = inception_year(ent)
            if fy:
                prof["founded_year"] = fy
                prof["metadata_source"] = "Wikidata inception snapshot"
        if not prof.get("official_website"):
            site = preferred_official_url(ent)
            if site:
                prof["official_website"] = site
        if not prof.get("official_history_url"):
            # Wikidata's official About-page URL (P14659), when present, is preferred.
            about_url = preferred_url_claim(ent, "P14659")
            if about_url:
                prof["official_history_url"] = about_url
                prof["history_source"] = "Official university website"
        prof["refreshed_at"] = NOW

    # Find official history/about pages concurrently. We deliberately do not display copied text.
    todo = [(uid, p.get("official_website", "")) for uid, p in profiles.items()
            if p.get("official_website") and not p.get("official_history_url")]
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = {pool.submit(discover_history_url, site): uid for uid, site in todo}
        for fut in as_completed(futs):
            uid = futs[fut]
            try:
                url = fut.result()
                if url:
                    profiles[uid]["official_history_url"] = url
                    profiles[uid]["history_source"] = "Official university website"
            except Exception:
                pass

    # Where an official history page explicitly states a founding year, prefer that source.
    official_year_todo = [(uid, p.get("official_history_url", "")) for uid, p in profiles.items() if p.get("official_history_url")]
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(official_founding_year, url): uid for uid, url in official_year_todo}
        for fut in as_completed(futs):
            uid = futs[fut]
            try:
                y = fut.result()
                if y:
                    old = profiles[uid].get("founded_year")
                    # Only replace if missing or plausibly the same institution date.
                    if not old or abs(int(old) - y) <= 2:
                        profiles[uid]["founded_year"] = y
                        profiles[uid]["metadata_source"] = "Official university history/about page"
            except Exception:
                pass

    by_univ_id = {int(u["id"]): u for u in universities}
    for uid, prof in profiles.items():
        u = by_univ_id.get(uid, {})
        loc = locations.get(uid, {})
        fy = int(prof["founded_year"]) if str(prof.get("founded_year", "")).isdigit() else None
        prof["history_note"] = make_history_note(u.get("university", prof.get("university", "University")), fy,
                                                 loc.get("city", ""), u.get("country", ""),
                                                 prof.get("official_history_url", ""))
        prof["refreshed_at"] = NOW

    # Climate: fetch once per NASA grid cell and apply to universities at that cell.
    groups = {}
    for uid, loc in locations.items():
        try:
            lat, lon = float(loc.get("latitude", "")), float(loc.get("longitude", ""))
        except (TypeError, ValueError):
            continue
        key = grid_key(lat, lon)
        groups.setdefault(key, []).append(uid)
    existing_by_grid = {}
    for key, ids in groups.items():
        for uid in ids:
            r = climate.get(uid, {})
            try:
                vals = [float(r.get(k, "")) for k in ["sep_c", "oct_c", "nov_c", "dec_c"]]
            except (ValueError, TypeError):
                continue
            if all(math.isfinite(v) for v in vals):
                existing_by_grid[key] = {"SEP": vals[0], "OCT": vals[1], "NOV": vals[2], "DEC": vals[3], "AVG": sum(vals)/4}
                break

    pending = [key for key in groups if key not in existing_by_grid]
    fetched = dict(existing_by_grid)
    with ThreadPoolExecutor(max_workers=5) as pool:
        futs = {pool.submit(nasa_climate, key[0], key[1]): key for key in pending}
        for i, fut in enumerate(as_completed(futs), 1):
            key = futs[fut]
            try:
                v = fut.result()
                if v:
                    fetched[key] = v
            except Exception:
                pass
            if i % 25 == 0:
                print(f"NASA climate grids: {len(existing_by_grid)+i}/{len(groups)} checked")

    for u in universities:
        uid = int(u["id"])
        loc = locations.get(uid, {})
        row = climate.setdefault(uid, {})
        row.update({"university_id": uid, "university": u["university"], "city": loc.get("city", ""),
                    "country": u["country"], "period": "1991-2020", "source_url": "https://power.larc.nasa.gov/"})
        try:
            key = grid_key(float(loc.get("latitude", "")), float(loc.get("longitude", "")))
        except (ValueError, TypeError):
            continue
        v = fetched.get(key)
        if v:
            row.update({"sep_c": f"{v['SEP']:.1f}", "oct_c": f"{v['OCT']:.1f}", "nov_c": f"{v['NOV']:.1f}",
                        "dec_c": f"{v['DEC']:.1f}", "sep_dec_avg_c": f"{v['AVG']:.1f}", "refreshed_at": NOW})

    location_fields = ["id", "university", "country", "city", "continent", "latitude", "longitude", "location_source"]
    profile_fields = ["university_id", "university", "founded_year", "official_website", "official_history_url", "history_note",
                      "metadata_source", "history_source", "wikidata_qid", "refreshed_at"]
    climate_fields = ["university_id", "university", "city", "country", "sep_c", "oct_c", "nov_c", "dec_c", "sep_dec_avg_c",
                      "period", "source_url", "refreshed_at"]
    write_csv(DATA / "university_locations.csv", [locations[int(u["id"])] for u in universities], location_fields)
    write_csv(DATA / "university_profiles.csv", [profiles[int(u["id"])] for u in universities], profile_fields)
    write_csv(DATA / "climate.csv", [climate[int(u["id"])] for u in universities], climate_fields)

    mapped = sum(bool(r.get("latitude") and r.get("longitude")) for r in locations.values())
    profiled = sum(bool(r.get("founded_year") or r.get("official_website")) for r in profiles.values())
    climate_n = sum(bool(r.get("sep_c") and r.get("dec_c")) for r in climate.values())
    official = sum(bool(r.get("official_website")) for r in profiles.values())
    history_links = sum(bool(r.get("official_history_url")) for r in profiles.values())
    print(f"Static refresh complete: {mapped}/{len(universities)} mapped, {climate_n}/{len(universities)} climate, "
          f"{profiled}/{len(universities)} profiles, {official} official websites, {history_links} official history/about links.")


if __name__ == "__main__":
    main()
