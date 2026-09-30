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


# Every kind of fund the screener files under type == 'fund'. An ETF is one of
# five, and the other four are bought and sold on the same books, through the
# same brokers, on the same ISIN: closed-end funds (the Sprott metal trusts,
# the PIMCO income funds), the handful of mutual funds that carry an exchange
# quote, SPAC units, and REITs held in a fund wrapper rather than as a company.
FUND_KINDS = ("etf", "closedend", "mutual", "unit", "reit")

# Certificates. Only 83 of them are in this source, a residue of a market that
# runs to hundreds of thousands of lines on EUWAX and Frankfurt, but the 83 are
# real listings with real ISINs so they are collected with the rest.
STRUCTURED_KIND = "structured"


def list_all_funds(
    market: Optional[str] = None,
    *,
    page_size: int = 500,
    structured: bool = True,
) -> pd.DataFrame:
    """
    Return a DataFrame of every fund listing TradingView's screener knows for
    the given market, with a `kind` column naming which sort of fund each is.

    One scan covers the lot: filtering on the type alone and sorting the kinds
    out locally costs nothing extra and keeps the paging to a single pass.

    - market="america" scans US only
    - market=None scans "all world" (uses TradingView's global endpoint with markets=[])
    """
    q = Query()
    if market is None:
        q = q.set_markets()  # global endpoint, markets=[]
    else:
        q = q.set_markets(market)

    types = ["fund", "structured"] if structured else ["fund"]
    base = (
        q.select(
            "name",
            "description",
            "isin",
            "exchange",
            "type",
            "typespecs",
            "average_volume_30d_calc",
        )
        .where(Column("type").isin(types))
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


def _kind(row) -> str:
    """
    Name the sort of instrument a listing is. The screener says `structured` in
    the type and everything else in the typespecs, where a fund carries exactly
    one of the five kinds.
    """
    if row["type"] == "structured":
        return STRUCTURED_KIND

    specs = row["typespecs"] if isinstance(row["typespecs"], list) else []
    for kind in FUND_KINDS:
        if kind in specs:
            return kind
    return "fund"


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


def traded_only(df: pd.DataFrame) -> pd.DataFrame:
    """
    Keep the ISINs that trade somewhere. A line quoted on Gettex and never hit
    is still a line the same ISIN trades on in New York, so the test is applied
    per ISIN and not per listing — otherwise a fund would lose the venues that
    happen to be quiet without gaining anything.
    """
    volume = pd.to_numeric(df["average_volume_30d_calc"], errors="coerce").fillna(0)
    alive = df.assign(volume=volume).groupby("isin")["volume"].max() > 0
    keep = df["isin"].map(alive).fillna(False)
    print(f"Traded-only: dropped {int((~keep).sum())} listings on ISINs that never print")
    return df[keep]


def write_kinds(df: pd.DataFrame, output_path: str) -> str:
    """
    The four-column contract of the CSV is fixed: every scraper reads the name
    as everything following the ISIN, so a fifth column would end up glued to
    the name and break the matching. The kind therefore travels beside the
    file, keyed by ISIN, for whoever wants to label a match.
    """
    kinds_path = re.sub(r"(\.csv)?$", "-kinds.csv", output_path, count=1)
    kinds = df.groupby("isin")["kind"].agg(lambda values: values.mode().iat[0])
    kinds.rename("kind").to_csv(kinds_path)
    print(f"Wrote {len(kinds)} isin,kind rows to {kinds_path}")
    return kinds_path


if __name__ == "__main__":
    args = sys.argv[1:]

    # `--etf-only` restores the original scope of this script, `--no-structured`
    # leaves the certificates out, `--kinds=a,b` picks the fund kinds by hand.
    etf_only = "--etf-only" in args
    structured = "--no-structured" not in args and not etf_only
    only_traded = "--traded-only" in args

    chosen = next((arg.split("=", 1)[1] for arg in args if arg.startswith("--kinds=")), None)
    kinds: Sequence[str] = (
        [kind.strip() for kind in chosen.split(",") if kind.strip()]
        if chosen
        else (["etf"] if etf_only else list(FUND_KINDS))
    )
    if structured:
        kinds = [*kinds, STRUCTURED_KIND]

    positional = [arg for arg in args if not arg.startswith("--")]

    # Use market="america" for a US-only scan.
    df = list_all_funds(market=None, page_size=500, structured=structured)
    df = df.assign(kind=df.apply(_kind, axis=1))

    print("\nScanned by kind:")
    for kind, count in df["kind"].value_counts().items():
        mark = "" if kind in kinds else "  (dropped)"
        print(f"  {kind:11s} {count:>6}{mark}")

    df = df[df["kind"].isin(kinds)]

    # TradingView's `name` is often a short code; `description` holds the readable fund name.
    prepared = df.assign(
        name=df["description"].fillna(df["name"]),
        exchange=df["exchange"].fillna(df["ticker"].str.split(":").str[0]),
    )
    if only_traded:
        prepared = traded_only(prepared)

    export_df = tidy(prepared[["ticker", "exchange", "isin", "name", "kind"]])

    # Print a small preview (full list is saved to CSV below)
    print(export_df.head(50))
    print(f"\nTotal: {len(export_df)} listings kept out of {len(df)} scanned")
    print(export_df["kind"].value_counts().to_string())

    # Optional: save to CSV. Output path can be overridden as the first CLI arg
    # (defaults to etfs.csv).
    output_path = positional[0] if positional else "etfs.csv"
    export_df[["ticker", "exchange", "isin", "name"]].to_csv(output_path, index=False)
    write_kinds(export_df, output_path)
