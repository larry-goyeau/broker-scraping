import sys
import time
from copy import deepcopy
from typing import Optional
import pandas as pd
from tradingview_screener import Column, Query


def _clone_query(q: Query) -> Query:
    new = Query()
    new.query = deepcopy(q.query)
    new.url = q.url
    return new


def _page(q: Query, offset: int, page_size: int, tries: int = 4):
    for attempt in range(1, tries + 1):
        try:
            return _clone_query(q).offset(offset).limit(offset + page_size).get_scanner_data()
        except Exception:
            if attempt == tries:
                raise
            time.sleep(2 * attempt)
    raise RuntimeError("unreachable")


def list_all_coins(*, page_size: int = 1000) -> pd.DataFrame:
    """
    Return every coin TradingView files as a unique cryptoasset.

    The `coin` market is the register of coins, one row per token, quoted as a
    synthetic USD index. The `crypto` market is the pairs those coins trade in
    -- Binance, Coinbase, Uniswap -- and runs to tens of thousands of DEX
    leftovers. This scan is the coins; `--pairs` is the pairs.
    """
    q = Query().set_markets("coin")
    base = (
        q.select(
            "name",
            "description",
            "exchange",
            "type",
            "typespecs",
            "crypto_total_rank",
            "market_cap_calc",
        )
        .order_by("name", ascending=True)
    )

    total, first_page = _page(base, 0, page_size)
    pages = [first_page]
    print(f"Scanning {total} coins in pages of {page_size}")

    for offset in range(page_size, total, page_size):
        _, df = _page(base, offset, page_size)
        if df.empty:
            break
        pages.append(df)
        print(f"  {offset}/{total}")

    return pd.concat(pages, ignore_index=True)


def list_all_pairs(*, page_size: int = 1000) -> pd.DataFrame:
    """
    Return every crypto pair TradingView knows, DEX lines included.
    """
    q = Query().set_markets("crypto")
    base = (
        q.select("name", "description", "exchange", "type", "typespecs", "volume")
        .order_by("name", ascending=True)
    )

    total, first_page = _page(base, 0, page_size)
    pages = [first_page]
    print(f"Scanning {total} pairs in pages of {page_size}")

    for offset in range(page_size, total, page_size):
        _, df = _page(base, offset, page_size)
        if df.empty:
            break
        pages.append(df)
        if offset % (page_size * 10) == 0:
            print(f"  {offset}/{total}")

    return pd.concat(pages, ignore_index=True)


def _coin_ticker(value: str) -> str:
    """
    TradingView names the synthetic as BTCUSD. The coin itself is BTC.
    """
    text = (value or "").strip().upper()
    if text.endswith("USD") and len(text) > 3:
        return text[:-3]
    return text


def tidy_coins(df: pd.DataFrame) -> pd.DataFrame:
    df = df.assign(
        ticker=df["name"].map(_coin_ticker),
        exchange=df["exchange"].fillna("CRYPTO"),
        name=df["description"].fillna(df["name"]).str.replace(r"\s+", " ", regex=True).str.strip(),
        isin="",
    )
    df = df[df["ticker"] != ""]
    before = len(df)
    df = df.drop_duplicates(subset=["ticker"])
    print(f"Tidied: dropped {before - len(df)} duplicate tickers")
    return df.reset_index(drop=True)


def tidy_pairs(df: pd.DataFrame) -> pd.DataFrame:
    df = df.assign(
        ticker=df["name"].fillna("").str.upper().str.strip(),
        exchange=df["exchange"].fillna(df["ticker"].str.split(":").str[0]),
        name=df["description"].fillna(df["name"]).str.replace(r"\s+", " ", regex=True).str.strip(),
        isin="",
    )
    df = df[df["ticker"] != ""]
    before = len(df)
    df = df.drop_duplicates(subset=["ticker", "exchange"])
    print(f"Tidied: dropped {before - len(df)} duplicate pairs")
    return df.reset_index(drop=True)


if __name__ == "__main__":
    args = sys.argv[1:]
    pairs = "--pairs" in args
    positional = [arg for arg in args if not arg.startswith("--")]

    if pairs:
        df = list_all_pairs(page_size=1000)
        export_df = tidy_pairs(df)[["ticker", "exchange", "isin", "name"]]
        output_path = positional[0] if positional else "cryptos-pairs.csv"
        print(f"\nTotal pairs: {len(export_df)} listings kept out of {len(df)} scanned")
    else:
        df = list_all_coins(page_size=1000)
        export_df = tidy_coins(df)[["ticker", "exchange", "isin", "name"]]
        output_path = positional[0] if positional else "cryptos.csv"
        print(export_df.head(20).to_string(index=False))
        print(f"\nTotal coins: {len(export_df)} kept out of {len(df)} scanned")

    export_df.to_csv(output_path, index=False)
    print(f"Wrote {len(export_df)} rows to {output_path}")
