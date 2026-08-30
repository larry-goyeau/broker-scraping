import warnings
from collections import Counter
from copy import deepcopy

warnings.filterwarnings("ignore")

import pandas as pd
from tradingview_screener import Column, Query


def clone(q):
    new = Query()
    new.query = deepcopy(q.query)
    new.url = q.url
    return new


def scan(conditions, columns=("name", "isin", "type", "typespecs"), limit=3000):
    q = Query().set_markets().select(*columns).where(*conditions).order_by("name", ascending=True)
    return clone(q).offset(0).limit(limit).get_scanner_data()


# Chaque valeur de `type` que la source peut rendre, y compris celles supposées vides.
TYPES = [
    "stock", "dr", "fund", "structured", "bond", "right", "warrant", "option",
    "index", "futures", "forex", "crypto", "economic", "commodity", "spac", "etf",
]

rows = []
for kind in TYPES:
    total, df = scan([Column("type") == kind], limit=1000)
    if total == 0:
        rows.append({"type": kind, "cotations": 0, "avec ISIN (échant.)": "—", "typespecs": "—"})
        continue

    isin = df["isin"].notna() & (df["isin"].astype(str).str.strip() != "")
    specs = Counter()
    for value in df["typespecs"]:
        if isinstance(value, list):
            specs.update(value or ["(vide)"])
        else:
            specs.update(["(absent)"])

    rows.append({
        "type": kind,
        "cotations": total,
        "avec ISIN (échant.)": f"{round(100 * float(isin.mean()), 1)}% de {len(df)}",
        "typespecs": ", ".join(f"{name}:{count}" for name, count in specs.most_common(8)),
    })

print(pd.DataFrame(rows).to_string(index=False, max_colwidth=70))

# Part réelle d'ISIN sur tout le catalogue, type par type, via un compte serveur.
print("\n--- ISIN sur l'ensemble du catalogue ---")
for kind in ["stock", "dr", "fund", "structured", "bond"]:
    total, _ = scan([Column("type") == kind], limit=1)
    with_isin, _ = scan([Column("type") == kind, Column("isin").not_empty()], limit=1)
    print(f"  {kind:12s} {with_isin:>7}/{total:<7} ({round(100 * with_isin / total, 1)}%)")
