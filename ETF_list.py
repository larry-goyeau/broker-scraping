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
        q.select("name", "description", "isin", "type", "typespecs")
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


if __name__ == "__main__":
    # Use market=None for an "all world" scan (much larger result set).
    df = list_all_etfs(market=None, page_size=500)

    # TradingView's `name` is often a short code; `description` holds the readable fund name.
    export_df = df.assign(name=df["description"].fillna(df["name"]))[
        ["ticker", "isin", "name"]
    ]

    # Print a small preview (full list is saved to CSV below)
    print(export_df.head(50))
    print(f"\nTotal ETFs: {len(df)}")

    # Optional: save to CSV
    export_df.to_csv("etfs.csv", index=False)
