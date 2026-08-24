import re
import sys
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


def list_all_etfs(
    market: Optional[str] = "america",
    *,
    page_size: int = 500,
) -> pd.DataFrame:
    """
    Return a DataFrame of all ETFs from TradingView's screener for the given market.

    ETF filter (TradingView): type == 'fund' and typespecs contains 'etf'.

    - market="america" scans US (default behavior of TradingView screener API)
    - market=None scans "all world" (uses TradingView's global endpoint with markets=[])
    """
    q = Query()
    if market is None:
        q = q.set_markets()  # global endpoint, markets=[]
    else:
        q = q.set_markets(market)

    base = (
        q.select("name", "description", "isin", "exchange", "type", "typespecs")
        .where(Column("type") == "fund", Column("typespecs").has(["etf"]))
        .order_by("name", ascending=True)
    )

    # tradingview_screener's "range" behaves like Python slicing: [from, to)
    # so to get `page_size` rows starting at `offset`, we set `to = offset + page_size`.
    total, first_page = _clone_query(base).offset(0).limit(page_size).get_scanner_data()
    pages = [first_page]

    for offset in range(page_size, total, page_size):
        _, df = _clone_query(base).offset(offset).limit(offset + page_size).get_scanner_data()
        if df.empty:
            break
        pages.append(df)

    return pd.concat(pages, ignore_index=True)


# Words that name a fund family or a legal wrapper rather than the fund itself.
_GENERIC_TOKENS = frozenset(
    {
        "PLC", "ICAV", "LTD", "LIMITED", "SICAV", "FUND", "FUNDS", "ETF", "ETFS",
        "INC", "CO", "CORP", "TRUST", "SA", "AG", "NV", "I", "II", "III", "IV",
        "V", "VI", "VII", "VIII", "IX", "X",
    }
)


def _descriptiveness(name: str) -> int:
    tokens = [token for token in re.split(r"[^A-Za-z0-9]+", name.upper()) if len(token) > 1]
    return sum(1 for token in tokens if token not in _GENERIC_TOKENS)


def _is_registry_entry(name: str) -> bool:
    """
    Registry names come in shouting capitals ("COINSHARES XBT PROVIDER AB"),
    where the name a broker shows is written for humans.
    """
    letters = [char for char in name if char.isalpha()]
    return len(letters) > 1 and name == name.upper()


def _canonical_name(names: pd.Series) -> str:
    """
    Pick the name a broker is most likely to display. TradingView returns only
    the issuer ("IShares Plc.") on some venues, and a legacy name on others —
    London still calls the Russell 2000 ETF an "Index Fund". Those poorest and
    oldest variants each appear on a venue or two, so the name carried by most
    listings wins, provided it says more than the issuer's own.
    """
    counts = names.value_counts()
    described = [name for name in counts.index if _descriptiveness(name) >= 2]
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
    # Use market=None for an "all world" scan (much larger result set).
    df = list_all_etfs(market=None, page_size=500)

    # TradingView's `name` is often a short code; `description` holds the readable fund name.
    export_df = tidy(
        df.assign(
            name=df["description"].fillna(df["name"]),
            exchange=df["exchange"].fillna(df["ticker"].str.split(":").str[0]),
        )[["ticker", "exchange", "isin", "name"]]
    )

    # Print a small preview (full list is saved to CSV below)
    print(export_df.head(50))
    print(f"\nTotal ETFs: {len(export_df)} listings kept out of {len(df)} scanned")

    # Optional: save to CSV. Output path can be overridden as the first CLI arg
    # (defaults to etfs.csv).
    output_path = sys.argv[1] if len(sys.argv) > 1 else "etfs.csv"
    export_df.to_csv(output_path, index=False)
