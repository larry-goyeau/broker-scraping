// What Betterment sells in its self-directed investing accounts (Betterment
// Securities, cleared by Apex Clearing), with no login. Its FAQ "What can
// and can't I invest in?" says: "Betterment's self-directed accounts
// currently support trading in U.S.-listed stocks from the S&P 500 and
// Russell 3000 indices, along with a wide range of ETFs. If you can't find
// a particular ticker, it may be because it's outside that universe,
// doesn't meet our liquidity or custody standards, generates a K-1 tax
// form, or is under review for onboarding." No security list is published
// (search is behind the login). So the book is the US exchange book of the
// day, read by ../wellstrade/usBook.mjs (Nasdaq, NYSE, NYSE American, NYSE
// Arca, Cboe BZX, Texas Stock Exchange; warrants, rights, units,
// when-issued lines, listed notes and halted lines are left out there),
// cut to what that sentence allows:
//
// - Shares: only members of the Russell 3000 or the S&P 500. FTSE Russell
//   and S&P publish no free constituent file, so membership is read from
//   the holdings of Vanguard's index funds on them, which Vanguard
//   publishes with ISINs (month-end, about 2,980 lines for the Russell
//   3000 ETF VTHR and 503 for the S&P 500 ETF VOO). A book line is a
//   member when its ISIN is in those holdings, or, for a line the asset
//   lists give no single ISIN, when its ticker is (Vanguard writes BRK B
//   for BRK.B). Preferreds, closed-end funds and most ADRs are not index
//   members and fall out here.
// - ETFs: kept ("a wide range of ETFs"), except the funds that send a
//   Schedule K-1, which the FAQ excludes. No free list marks them; they
//   are the commodity pools taxed as partnerships, recognised here by
//   name: the United States Commodity Funds (USO, UNG, BNO, UGA, USL, UNL,
//   USCI, CPER), Invesco DB funds, the four Teucrium single-commodity
//   funds and TAGS, the iShares GSCI Commodity-Indexed Trust, and the
//   commodity, currency and VIX funds of ProShares Trust II. A "No K-1"
//   fund stays.
// - ETNs: out. They are notes, neither a stock nor an ETF.
// Lines that fail Betterment's liquidity or custody standards or are
// "under review" cannot be told apart from outside and stay.
// The US is one NBBO market: one row per title on its primary listing, in
// dollars.
//
// Fees: "All trades are commission-free" and the wrap fee is waived on
// self-directed accounts (same page).
//
//   https://www.betterment.com/self-directed-investing   (universe and fees)
//   https://investor.vanguard.com/vmf/api/VTHR/portfolio-holding/stock
//   https://investor.vanguard.com/vmf/api/VOO/portfolio-holding/stock
//
//   node brokers/betterment/betterment_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://www.betterment.com/self-directed-investing";
const HOLDINGS = (fund, start) => `https://investor.vanguard.com/vmf/api/${fund}/portfolio-holding/stock?start=${start}&count=500`;

// Commodity pools that send a K-1 (see the header).
const K1 = new RegExp(
  [
    /\bL\.?P\.?(?:\s+ETV)?$/,
    /^United States (?:Oil|Gasoline|Natural Gas|Brent Oil|12 Month|Commodity Index|Copper)\b/,
    /^Invesco DB /,
    /^Teucrium (?:Corn|Wheat|Soybean|Sugar|Agricultural) Fund\b/,
    /GSCI Commodity-Indexed Trust/,
    /^ProShares (?:Ultra|UltraShort|Short) (?:Bloomberg (?:Crude Oil|Natural Gas)|Silver|Gold|Euro|Yen|VIX)\b/,
    /^(?:ProShares )?VIX (?:Short|Mid)-Term Futures ETF$/,
  ]
    .map((pattern) => pattern.source)
    .join("|"),
  "i"
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function text(url, json) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: json ? "application/json" : "text/html" }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

async function holdings(fund, least) {
  const lines = [];
  for (let start = 1; ; start += 500) {
    const body = JSON.parse(await text(HOLDINGS(fund, start), true));
    const page = body.fund?.entity || [];
    lines.push(...page);
    if (!page.length || lines.length >= body.size) {
      console.error(`${fund}: ${lines.length} holdings as of ${String(body.asOfDate).slice(0, 10)}`);
      break;
    }
    await sleep(800);
  }
  if (lines.length < least) throw new Error(`${fund} holds only ${lines.length} lines`);
  return lines;
}

const page = (await text(PAGE)).replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ").replace(/[‘’]/g, "'");
for (const pattern of [
  /support trading in U\.S\.-listed stocks from the S&(?:amp;)?P 500 and Russell 3000 indices, along with a wide range of ETFs/i,
  /generates a K-1 tax form/i,
  /All trades are commission-free/i,
]) {
  if (!pattern.test(page)) throw new Error(`${PAGE} no longer says ${pattern}`);
}

const members = [...(await holdings("VTHR", 2500)), ...(await holdings("VOO", 490))];
const isins = new Set(members.map((line) => line.isin).filter(Boolean));
const tickers = new Set(members.map((line) => String(line.ticker || "").trim().replace(/ /g, ".")).filter(Boolean));

const book = await usBook();
const left = { notMember: [], k1: [], etn: [] };
const kept = [];
for (const row of book) {
  if (row.type === "STOCK") {
    if ((row.isin && isins.has(row.isin)) || (!row.isin && tickers.has(row.ticker))) kept.push(row);
    else left.notMember.push(row.ticker);
  } else if (row.type === "ETN") {
    left.etn.push(row.ticker);
  } else if (K1.test(row.name)) {
    left.k1.push(`${row.ticker} ${row.name}`);
  } else {
    kept.push(row);
  }
}

const shares = kept.filter((row) => row.type === "STOCK").length;
if (shares < 2500 || kept.length - shares < 4000) throw new Error(`short book: ${shares} shares, ${kept.length - shares} ETFs`);
for (const ticker of ["AAPL", "BRK.B", "SPY"]) if (!kept.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);

const rows = stampRows(withoutObligations(kept));
fs.writeFileSync(new URL("betterment-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`left out ${left.notMember.length} shares outside the Russell 3000 / S&P 500, ${left.etn.length} ETNs, ${left.k1.length} K-1 funds: ${left.k1.join("; ")}`);
