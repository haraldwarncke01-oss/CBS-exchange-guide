#!/usr/bin/env python3
"""Build data/arwu2026.json for the CBS Exchange Explorer.

The ranking displayed by the site is ShanghaiRanking's ARWU 2026. ShanghaiRanking
publishes the top 1,000 institutions. This helper retrieves a complete HTML table
mirror of the ARWU 2026 results, matches the CBS partner names conservatively,
and stores only the rank band/name needed by the static site.

Matching is deliberately conservative: uncertain matches are left as null rather
than assigning the wrong university. `matchedInstitution` is kept in the output
so branch-campus/translated-name matches are visible in the UI.
"""
from __future__ import annotations

import io
import json
import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd
import requests
from rapidfuzz import fuzz, process

ROOT = Path(__file__).resolve().parents[1]
UNIVERSITIES = ROOT / "data" / "universities.json"
OUTPUT = ROOT / "data" / "arwu2026.json"
OFFICIAL_SOURCE = "https://www.shanghairanking.com/rankings/arwu/2026"
# Complete ARWU table mirror used only as a machine-readable transport source.
TABLE_SOURCE = "https://nlg.cheersyou.com/ranking/world/arwu"

# Country labels used by ARWU. A few CBS labels differ from the ranking table.
COUNTRY_MAP = {
    "Hong Kong": "China-Hong Kong",
    "Taiwan": "China-Taiwan",
    "Turkey": "Türkiye",
}

# Explicit aliases are preferred over fuzzy matching. These cover translations,
# official English names, punctuation variants and clearly-identical branch campuses.
ALIASES = {
    "Australian National University": "The Australian National University",
    "University of Melbourne": "The University of Melbourne",
    "University of New South Wales": "The University of New South Wales",
    "University of Newcastle": "The University of Newcastle, Australia",
    "University of Queensland": "The University of Queensland",
    "University of Technology, Sydney": "University of Technology Sydney",
    "University of Western Australia": "The University of Western Australia",
    "Leopold-Franzens-Universität Innsbruck": "University of Innsbruck",
    "Universität Wien": "University of Vienna",
    "KU Leuven": "KU Leuven",
    "Université Laval": "Laval University",
    "Pontificia Universidad Católica de Chile": "Pontifical Catholic University of Chile",
    "Universidad de Chile": "University of Chile",
    "Universidad De Los Andes": "University of the Andes",
    "Universitas Gadjah Mada": "Gadjah Mada University",
    "Université de Strasbourg": "University of Strasbourg",
    "Freie Universität Berlin": "Free University of Berlin",
    "Humboldt-Universität zu Berlin": "Humboldt University of Berlin",
    "Johann Wolfgang Goethe Universität": "Goethe University Frankfurt",
    "Ludwig-Maximilians-Universität München": "LMU Munich",
    "Technische Universität München": "Technical University of Munich",
    "Universität Hamburg": "University of Hamburg",
    "Universität Mannheim": "University of Mannheim",
    "Universität zu Köln": "University of Cologne",
    "Universität Münster": "University of Munster",
    "Athens University of Economics & Business - AUEB": "Athens University of Economics and Business",
    "The Chinese University of Hong Kong (CUHK)": "The Chinese University of Hong Kong",
    "The Hong Kong Polytechnic University": "The Hong Kong Polytechnic University",
    "The Hong Kong University of Science and Technology (HKUST)": "The Hong Kong University of Science and Technology",
    "The University of Hong Kong (HKU)": "The University of Hong Kong",
    "Università Ca' Foscari Venezia": "Ca' Foscari University of Venice",
    "Università Commerciale Luigi Bocconi": "Bocconi University",
    "Università degli Studi di Bologna 'Alma Mater Studiorum'": "University of Bologna",
    "Università degli Studi di Torino": "University of Turin",
    "Monash University Malaysia": "Monash University",
    "Tec de Monterrey, Campus Guadalajara": "Monterrey Institute of Technology and Higher Education",
    "Tec de Monterrey, Campus Mexico City": "Monterrey Institute of Technology and Higher Education",
    "Tec de Monterrey, Campus Monterrey": "Monterrey Institute of Technology and Higher Education",
    "Tec de Monterrey, Campus Querétaro": "Monterrey Institute of Technology and Higher Education",
    "Tec de Monterrey, Campus Santa Fe": "Monterrey Institute of Technology and Higher Education",
    "Erasmus Universiteit Rotterdam": "Erasmus University Rotterdam",
    "Radboud Universiteit Nijmegen": "Radboud University Nijmegen",
    "Universiteit Utrecht": "Utrecht University",
    "Universiteit van Amsterdam": "University of Amsterdam",
    "Universidade de Lisboa": "University of Lisbon",
    "Universidade Nova de Lisboa": "NOVA University Lisbon",
    "Universidad Carlos III de Madrid": "Carlos III University of Madrid",
    "Universitat Autònoma de Barcelona (UAB)": "Autonomous University of Barcelona",
    "Universitat de Barcelona": "University of Barcelona",
    "Universitat de València": "University of Valencia",
    "Universitat Pompeu Fabra": "Pompeu Fabra University",
    "Uppsala universitet": "Uppsala University",
    "Université de Genève": "University of Geneva",
    "Université de Lausanne": "University of Lausanne",
    "Universität Bern": "University of Bern",
    "Universität Zürich": "University of Zurich",
    "National Taiwan University (NTU)": "National Taiwan University",
    "The University of Manchester": "The University of Manchester",
    "University of Edinburgh": "The University of Edinburgh",
    "University of Sheffield": "The University of Sheffield",
    "University of Strathclyde Glasgow": "University of Strathclyde",
    "Indiana University": "Indiana University Bloomington",
    "North Carolina State University": "North Carolina State University at Raleigh",
    "Ohio State University": "Ohio State University, Columbus",
    "Purdue University": "Purdue University, West Lafayette",
    "State University of New York, Stony Brook": "Stony Brook University",
    "University of Hawaii at Manoa": "University of Hawaii at Manoa",
    "University of Maryland": "University of Maryland, College Park",
    "University of Michigan": "University of Michigan, Ann Arbor",
    "University of Minnesota, Twin Cities": "University of Minnesota, Twin Cities",
    "University of South Carolina": "University of South Carolina, Columbia",
    "University of Texas at Austin": "The University of Texas at Austin",
    "University of Wisconsin - Madison": "University of Wisconsin, Madison",
    # Nottingham Ningbo is a campus of the University of Nottingham; ARWU ranks the parent university.
    "University of Nottingham Ningbo, China": "University of Nottingham",
}

# Avoid known misleading parent/system matches. The exchange unit is not the ranked campus.
NO_AUTO_MATCH = {
    "City University of New York",  # CBS partner is Baruch College; ARWU lists other CUNY campuses separately.
    "The Chinese University of Hong Kong, Campus Shenzhen (CUHKSZ)",  # separate institution from CUHK Hong Kong.
}


def norm(value: str) -> str:
    value = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode("ascii")
    value = value.lower().replace("&", " and ")
    value = re.sub(r"\([^)]*\)", " ", value)
    value = re.sub(r"\b(the|campus|regular|undergraduate)\b", " ", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


def clean_rank(v: object) -> str | None:
    s = str(v).strip().replace("–", "-")
    if not s or s.lower() == "nan":
        return None
    # Accept exact ranks and ARWU bands only.
    if re.fullmatch(r"\d+", s) or re.fullmatch(r"\d+-\d+", s):
        return s
    m = re.search(r"(\d+(?:-\d+)?)", s)
    return m.group(1) if m else None


def fetch_table() -> pd.DataFrame:
    headers = {"User-Agent": "Mozilla/5.0 (compatible; CBS-Exchange-Explorer/1.0)"}
    r = requests.get(TABLE_SOURCE, headers=headers, timeout=45)
    r.raise_for_status()
    tables = pd.read_html(io.StringIO(r.text))
    for df in tables:
        cols = [str(c).strip().lower() for c in df.columns]
        if any("world rank" in c for c in cols) and any("institution" in c for c in cols):
            rank_col = df.columns[next(i for i, c in enumerate(cols) if "world rank" in c)]
            inst_col = df.columns[next(i for i, c in enumerate(cols) if "institution" in c)]
            country_col = df.columns[next((i for i, c in enumerate(cols) if "country" in c or "region" in c), 2)]
            out = df[[rank_col, inst_col, country_col]].copy()
            out.columns = ["rank", "institution", "country"]
            out["rank"] = out["rank"].map(clean_rank)
            out["institution"] = out["institution"].astype(str).str.strip()
            out["country"] = out["country"].astype(str).str.strip()
            out = out[out["rank"].notna() & out["institution"].ne("")]
            if len(out) >= 900:
                return out.reset_index(drop=True)
    raise RuntimeError("Could not locate a complete ARWU 2026 ranking table")


def candidate_country(cbs_country: str) -> str:
    return COUNTRY_MAP.get(cbs_country, cbs_country)


def match_one(name: str, country: str, table: pd.DataFrame) -> tuple[str | None, str | None, str]:
    if name in NO_AUTO_MATCH:
        return None, None, "excluded"

    alias = ALIASES.get(name)
    if alias:
        exact = table[table["institution"].map(norm).eq(norm(alias))]
        if not exact.empty:
            row = exact.iloc[0]
            return str(row["rank"]), str(row["institution"]), "alias"
        # Keep searching if the mirror's spelling changes slightly.

    target_country = candidate_country(country)
    country_rows = table[table["country"].eq(target_country)].copy()
    # Parent-campus aliases may legitimately cross the CBS country label.
    search_rows = table if alias in {"Monash University", "University of Nottingham"} else country_rows
    if search_rows.empty:
        return None, None, "no-country"

    target = alias or name
    target_n = norm(target)
    choices = {idx: norm(inst) for idx, inst in search_rows["institution"].items()}
    # Exact normalized match first.
    exact_idx = [idx for idx, n in choices.items() if n == target_n]
    if exact_idx:
        row = search_rows.loc[exact_idx[0]]
        return str(row["rank"]), str(row["institution"]), "exact"

    best = process.extractOne(target_n, choices, scorer=fuzz.WRatio, score_cutoff=93)
    if not best:
        return None, None, "unmatched"
    _, score, idx = best
    row = search_rows.loc[idx]

    # Guard against generic-name false positives: demand meaningful token overlap.
    a = {t for t in target_n.split() if len(t) > 2 and t not in {"university", "universidad", "universite", "universitat"}}
    b = {t for t in norm(row["institution"]).split() if len(t) > 2 and t not in {"university", "universidad", "universite", "universitat"}}
    overlap = len(a & b) / max(1, min(len(a), len(b)))
    if overlap < 0.5:
        return None, None, "low-overlap"
    return str(row["rank"]), str(row["institution"]), f"fuzzy:{score:.1f}"


def main() -> int:
    partners = json.loads(UNIVERSITIES.read_text(encoding="utf-8"))
    table = fetch_table()
    results: dict[str, dict[str, object]] = {}
    ranked = 0
    methods: dict[str, int] = {}

    for u in partners:
        rank, matched, method = match_one(u["name"], u["country"], table)
        methods[method] = methods.get(method, 0) + 1
        if rank:
            ranked += 1
        results[str(u["id"])] = {
            "rank": rank,
            "matchedInstitution": matched,
            "matchMethod": method,
        }

    payload = {
        "year": 2026,
        "status": "complete",
        "source": OFFICIAL_SOURCE,
        "tableTransport": TABLE_SOURCE,
        "note": "ARWU publishes its best 1,000 institutions; null means no conservative match in the published top 1,000.",
        "partnerCount": len(partners),
        "matchedPartnerEntries": ranked,
        "universities": results,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"ARWU: matched {ranked}/{len(partners)} CBS partner entries; methods={methods}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ARWU update failed: {exc}", file=sys.stderr)
        raise
