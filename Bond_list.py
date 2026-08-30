import re
import sys
import time
from copy import deepcopy
from typing import Optional, Sequence
import pandas as pd
from tradingview_screener import Column, Query


def _clone_query(q: Query) -> Query:
    """
    tradingview_screener.Query.copy() does NOT copy the URL, so we implement a safe clone here.
    """
    new = Query()
    new.query = deepcopy(q.query)
    new.url = q.url
    return new


def _page(q: Query, offset: int, page_size: int, tries: int = 4):
    """
    One page of results, retried: a world scan is scores of requests and losing
    the last one would throw away all the others.
    """
    for attempt in range(1, tries + 1):
        try:
            return _clone_query(q).offset(offset).limit(offset + page_size).get_scanner_data()
        except Exception:
            if attempt == tries:
                raise
            time.sleep(2 * attempt)
    raise RuntimeError("unreachable")


def list_all_bonds(
    market: Optional[str] = None,
    *,
    page_size: int = 1000,
    min_volume: float = 0,
    venues: Optional[Sequence[str]] = None,
) -> pd.DataFrame:
    """
    Return a DataFrame of bond listings from TradingView's screener.

    The source knows 169,169 bond listings and serves no average volume for a
    single one of them, so the only evidence that a line trades is the volume of
    the last session. Asking for `volume > 0` cuts the catalogue to roughly
    37,500 — the ones that printed something — which is what makes the file
    worth handing to a scraper. It also makes the file a snapshot: a bond that
    traded on Friday and not on Monday moves in and out of it, so a run is a
    sample of what is live rather than a register. Pass min_volume=0 with
    `--all` to take the whole catalogue instead.

    Naming venues narrows the scan to them. It matters more here than elsewhere:
    of the lines that print, four in five are FINRA reports of American OTC
    trades and Luxembourg listings, neither of which is a book a retail client
    can send an order to. RETAIL_VENUES holds the ones that are.

    - market="america" scans US only
    - market=None scans "all world" (uses TradingView's global endpoint with markets=[])
    """
    q = Query()
    if market is None:
        q = q.set_markets()  # global endpoint, markets=[]
    else:
        q = q.set_markets(market)

    conditions = [Column("type") == "bond"]
    if min_volume > 0:
        conditions.append(Column("volume") >= min_volume)
    if venues:
        conditions.append(Column("exchange").isin(list(venues)))

    base = (
        q.select(
            "name",
            "description",
            "isin",
            "exchange",
            "typespecs",
            "country",
            "maturity_date",
            "volume",
        )
        .where(*conditions)
        .order_by("name", ascending=True)
    )

    total, first_page = _page(base, 0, page_size)
    pages = [first_page]
    print(f"Scanning {total} listings in pages of {page_size}")

    for offset in range(page_size, total, page_size):
        _, df = _page(base, offset, page_size)
        if df.empty:
            break
        pages.append(df)
        if offset % (page_size * 10) == 0:
            print(f"  {offset}/{total}")

    return pd.concat(pages, ignore_index=True)


# What a bond is called says the issuer, the coupon and the maturity, and those
# last two are what separate two lines of the same borrower: "Eviny AS FRN
# 14-NOV-2029" is not "Eviny AS FRN 07-MAR-2031". So the tokens worth nothing
# here are the legal forms and the words every bond carries.
_GENERIC_TOKENS = frozenset(
    {
        "AS", "ASA", "AB", "SA", "SE", "NV", "BV", "AG", "PLC", "LTD", "LIMITED",
        "INC", "CORP", "CORPORATION", "CO", "COMPANY", "LLC", "LP", "GMBH", "SPA",
        "OYJ", "JSC", "PJSC", "GROUP", "HOLDING", "HOLDINGS", "BANK",
        "BOND", "BONDS", "NOTE", "NOTES", "SENIOR", "SUBORDINATED", "CALLABLE",
        "PERPETUAL", "SERIES", "TRANCHE", "DUE", "MTN", "REGS", "144A",
    }
)


def _descriptiveness(name: str) -> int:
    tokens = [token for token in re.split(r"[^A-Za-z0-9]+", name.upper()) if len(token) > 1]
    return sum(1 for token in tokens if token not in _GENERIC_TOKENS)


def _is_registry_entry(name: str) -> bool:
    """
    Registry names come in shouting capitals ("NORSKE SKOG ASA"), where the name
    a broker shows is written for humans.
    """
    letters = [char for char in name if char.isalpha()]
    return len(letters) > 1 and name == name.upper()


def _canonical_name(names: pd.Series) -> str:
    """
    One ISIN quoted in Frankfurt, Stuttgart and Gettex is described three ways,
    and a run that asks twenty brokers about that ISIN needs one wording to ask
    with. The readable form wins over the registry's, then the one most listings
    agree on.
    """
    counts = names.value_counts()
    described = [name for name in counts.index if _descriptiveness(name) >= 1]
    pool = described or list(counts.index)
    return max(
        pool,
        key=lambda name: (
            not _is_registry_entry(name),
            counts[name],
            _descriptiveness(name),
            len(name),
            name,
        ),
    )


def tidy(df: pd.DataFrame) -> pd.DataFrame:
    """
    Drop what cannot be matched and give every ISIN a single name.
    """
    df = df.assign(
        name=df["name"].fillna("").str.replace(r"\s+", " ", regex=True).str.strip(),
        isin=df["isin"].fillna("").str.strip().str.upper(),
    )

    without_isin = int((df["isin"] == "").sum())
    df = df[df["isin"] != ""]

    before = len(df)
    df = df.drop_duplicates(subset=["ticker", "exchange", "isin"])
    duplicates = before - len(df)

    canonical = df.groupby("isin")["name"].agg(_canonical_name)
    renamed = int((df["name"] != df["isin"].map(canonical)).sum())
    df = df.assign(name=df["isin"].map(canonical))

    print(
        f"Tidied: dropped {without_isin} rows without an ISIN, "
        f"{duplicates} duplicate listings, renamed {renamed} rows to the fullest "
        f"name of their ISIN."
    )
    return df.reset_index(drop=True)


def _kind(specs) -> str:
    """
    Corporate or government, as the screener files it.
    """
    if isinstance(specs, list) and specs:
        return specs[0]
    return "bond"


def write_kinds(df: pd.DataFrame, output_path: str) -> str:
    """
    The four-column contract of the CSV is fixed: every scraper reads the name as
    everything following the ISIN, so a fifth column would end up glued to the
    name. Corporate or government therefore travels beside the file, keyed by
    ISIN.
    """
    kinds_path = re.sub(r"(\.csv)?$", "-kinds.csv", output_path, count=1)
    kinds = df.groupby("isin")["kind"].agg(lambda values: values.mode().iat[0])
    kinds.rename("kind").to_csv(kinds_path)
    print(f"Wrote {len(kinds)} isin,kind rows to {kinds_path}")
    return kinds_path


# Where a private client can actually route a bond order, as against a venue
# that merely lists the line or reports a trade after the fact. LS and LSX are
# Lang & Schwarz, which is where Trade Republic and much of the German discount
# trade is routed, and which quotes every line it carries — hence their 100%
# print rate against Frankfurt's 1.4%.
RETAIL_VENUES = (
    "TRADEGATE", "GETTEX", "FWB", "SWB", "XETR", "MUN", "HAM", "DUS", "LS", "LSX",
    "EUROTLX", "SIX", "EURONEXT", "LSE",
)


if __name__ == "__main__":
    args = sys.argv[1:]

    # `--all` takes the whole catalogue, quoted lines included; `--min-volume=N`
    # raises the bar above "printed anything at all"; `--retail` or an explicit
    # `--venues=A,B` narrows the scan to venues a private client can reach.
    take_all = "--all" in args
    chosen = next((arg.split("=", 1)[1] for arg in args if arg.startswith("--min-volume=")), None)
    min_volume = 0.0 if take_all else float(chosen) if chosen else 1.0

    named = next((arg.split("=", 1)[1] for arg in args if arg.startswith("--venues=")), None)
    venues = (
        [venue.strip().upper() for venue in named.split(",") if venue.strip()]
        if named
        else list(RETAIL_VENUES)
        if "--retail" in args
        else None
    )

    positional = [arg for arg in args if not arg.startswith("--")]

    df = list_all_bonds(market=None, page_size=1000, min_volume=min_volume, venues=venues)
    df = df.assign(kind=df["typespecs"].apply(_kind))

    print("\nScanned by kind:")
    print(df["kind"].value_counts().to_string())
    print("\nTop venues:")
    print(df["exchange"].value_counts().head(10).to_string())

    # TradingView's `name` is a short code; `description` holds the issuer, the
    # coupon type and the maturity, which is what tells two lines apart.
    export_df = tidy(
        df.assign(
            name=df["description"].fillna(df["name"]),
            exchange=df["exchange"].fillna(df["ticker"].str.split(":").str[0]),
        )[["ticker", "exchange", "isin", "name", "kind"]]
    )

    print(export_df.head(30).to_string())
    print(
        f"\nTotal bonds: {len(export_df)} listings kept out of {len(df)} scanned, "
        f"{export_df['isin'].nunique()} distinct ISINs"
    )

    output_path = positional[0] if positional else "bonds.csv"
    export_df[["ticker", "exchange", "isin", "name"]].to_csv(output_path, index=False)
    write_kinds(export_df, output_path)
