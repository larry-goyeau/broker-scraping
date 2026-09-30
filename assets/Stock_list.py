import re
import sys
import time
from copy import deepcopy
from typing import Optional
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
    One page of results, retried: a world scan is a couple of hundred requests
    and losing the last one would throw away the other two hundred.
    """
    for attempt in range(1, tries + 1):
        try:
            return _clone_query(q).offset(offset).limit(offset + page_size).get_scanner_data()
        except Exception:
            if attempt == tries:
                raise
            time.sleep(2 * attempt)
    raise RuntimeError("unreachable")


def list_all_stocks(
    market: Optional[str] = None,
    *,
    page_size: int = 1000,
    receipts: bool = True,
) -> pd.DataFrame:
    """
    Return a DataFrame of every share listing TradingView's screener knows for
    the given market.

    Share filter (TradingView): type == 'stock', which covers both common and
    preferred lines, plus type == 'dr' for depositary receipts unless they are
    turned off. A receipt is how a broker sells a foreign company to a local
    client -- NIO on the LSE, Philips in New York -- and it carries its own ISIN
    rather than the ordinary share's, so it is a listing in its own right.

    - market="america" scans US only
    - market=None scans "all world" (uses TradingView's global endpoint with markets=[])
    """
    q = Query()
    if market is None:
        q = q.set_markets()  # global endpoint, markets=[]
    else:
        q = q.set_markets(market)

    kinds = ["stock", "dr"] if receipts else ["stock"]
    base = (
        q.select("name", "description", "isin", "exchange", "type", "typespecs")
        .where(Column("type").isin(kinds))
        .order_by("name", ascending=True)
    )

    # tradingview_screener's "range" behaves like Python slicing: [from, to)
    # so to get `page_size` rows starting at `offset`, we set `to = offset + page_size`.
    total, first_page = _page(base, 0, page_size)
    pages = [first_page]
    print(f"Scanning {total} listings in pages of {page_size}")

    for offset in range(page_size, total, page_size):
        _, df = _page(base, offset, page_size)
        if df.empty:
            break
        pages.append(df)
        if offset % (page_size * 20) == 0:
            print(f"  {offset}/{total}")

    return pd.concat(pages, ignore_index=True)


# Words that name a legal form or a share class rather than the company itself.
# A name made only of these says nothing about who is being bought.
_GENERIC_TOKENS = frozenset(
    {
        "INC", "CORP", "CORPORATION", "CO", "COMPANY", "LTD", "LIMITED", "PLC",
        "LLC", "LP", "AG", "SA", "SE", "NV", "BV", "SPA", "AB", "ASA", "OYJ",
        "GMBH", "KGAA", "PT", "TBK", "BHD", "SDN", "PJSC", "JSC", "OAO", "PAO",
        "HOLDING", "HOLDINGS", "GROUP", "CLASS", "SHS", "SHARES", "ADR", "GDR",
        "SPONSORED", "UNSPONSORED", "REPRESENTING", "REGISTERED", "BEARER",
        "PREF", "PREFERRED", "ORD", "ORDINARY", "NEW", "THE", "AND",
        "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
    }
)


def _descriptiveness(name: str) -> int:
    tokens = [token for token in re.split(r"[^A-Za-z0-9]+", name.upper()) if len(token) > 1]
    return sum(1 for token in tokens if token not in _GENERIC_TOKENS)


def _is_registry_entry(name: str) -> bool:
    """
    Registry names come in shouting capitals ("PING AN BANK CO LTD"),
    where the name a broker shows is written for humans.
    """
    letters = [char for char in name if char.isalpha()]
    return len(letters) > 1 and name == name.upper()


def _canonical_name(names: pd.Series) -> str:
    """
    Pick the name a broker is most likely to display. The same company is
    described differently venue by venue -- "Ping An Bank Co. Ltd. Class A" in
    one place, "PING AN BANK" in another -- and a run that wants to ask twenty
    brokers about one ISIN needs a single name to ask with. The readable form
    wins over the registry's, then the one most listings agree on.
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


if __name__ == "__main__":
    args = [arg for arg in sys.argv[1:]]

    # `--common-only` leaves out the preferred lines, `--no-receipts` the
    # depositary ones, for a file of nothing but ordinary shares.
    common_only = "--common-only" in args
    receipts = "--no-receipts" not in args
    positional = [arg for arg in args if not arg.startswith("--")]

    # Use market="america" for a US-only scan.
    df = list_all_stocks(market=None, page_size=1000, receipts=receipts)

    if common_only:
        before = len(df)
        is_common = df["typespecs"].apply(
            lambda specs: isinstance(specs, list) and "common" in specs
        )
        df = df[is_common]
        print(f"Kept {len(df)} common lines out of {before} scanned")

    # TradingView's `name` is often a short code; `description` holds the readable company name.
    export_df = tidy(
        df.assign(
            name=df["description"].fillna(df["name"]),
            exchange=df["exchange"].fillna(df["ticker"].str.split(":").str[0]),
        )[["ticker", "exchange", "isin", "name"]]
    )

    # Print a small preview (full list is saved to CSV below)
    print(export_df.head(50))
    print(f"\nTotal shares: {len(export_df)} listings kept out of {len(df)} scanned")

    # Optional: save to CSV. Output path can be overridden as the first CLI arg
    # (defaults to stocks.csv).
    output_path = positional[0] if positional else "stocks.csv"
    export_df.to_csv(output_path, index=False)
