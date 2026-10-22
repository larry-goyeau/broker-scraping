// What Grifin sells, with no login. Grifin (Interest Financial, LLC, an
// adviser; Apex Clearing is the broker) buys a dollar of stock in the
// listed companies where the client shops. Its advisory agreement says
// what can be bought: "The securities available in the Program are a
// limited universe of publicly-traded stocks, which is subject to
// change. All users have access to the same universe of securities."
// So the book is shares only, the same for every client, and no ETF.
// The help centre article "What companies/stocks are available on
// Grifin?" prints that universe as one table, Company Name and Symbol.
// The table is the catalogue.
//
// The fees are published: a subscription of $9 a month or $90 a year
// (as little as $3 a month the first year) and "trading occurs free of
// commission, relevant SEC & FINRA fees may apply" (Commissions and
// Fees page). Section 6 of the advisory agreement adds that the fee
// covers the broker's transaction costs.
//
// The table prints no venue, ISIN or currency. Deposits are in dollars
// and the US book is one NBBO, so each title is one row in USD. Its ISIN
// comes from ../../assets/stocks.csv through usRow in
// ../mitsubishiufjesmart/japan.mjs, as for Bloomo. Its venue is the
// primary listing the US symbol directories of the day give (below), so
// a listing moved since the asset lists were made shows where it is now
// (Sunoco and Dillard's to the Texas Stock Exchange, Kraft Heinz to the
// NYSE, Lumen to Nasdaq). The asset lists' venue stands only for an OTC
// title, which the directories do not hold.
//
// The article is old in places: it still names companies that were
// bought out, went private or went bankrupt years ago (Activision,
// Twitter, Zynga, Bed Bath & Beyond...). A ticker is kept only when the
// US symbol directories of the day name it (a test issue is left out;
// ../raseed/usTape.mjs reads them and throws on a file older than the
// New York date):
//
//   ftp://ftp.nasdaqtrader.com/symboldirectory/nasdaqlisted.txt
//   ftp://ftp.nasdaqtrader.com/symboldirectory/otherlisted.txt
//   (same files as https://www.nasdaqtrader.com/dynamic/SymDir/)
//
// Those files hold the exchange listings only. Two titles of the table are
// OTC ADRs (Ahold Delhaize ADRNY, Volkswagen VWAPY); a ticker absent from
// the directories is kept on OTC Markets when the asset list holds it
// there, and left out otherwise.
//
// A ticker that changed with no change of company takes its new ticker.
// The proof is that the same SEC registrant now files under it
// (https://data.sec.gov/submissions/CIK##########.json, "tickers" and
// "formerNames"):
//   SQ -> XYZ    Block, Inc. (formerly Square), CIK 1512673
//   GPS -> GAP   Gap Inc., CIK 39911
//   FI -> FISV   Fiserv, Inc., now on Nasdaq, CIK 798354
//   BODY -> BODI The Beachbody Company, CIK 1826889
//   ATUS -> OPTU Optimum Communications (formerly Altice USA), CIK 1702780
//   MODG -> CALY Callaway Golf Co (formerly Topgolf Callaway Brands), CIK 837465
//   VSCO -> VSXY Victoria's Secret & Co., same ISIN US9264001028, CIK 1856437
// United Technologies (UTX) is left out: the same registrant is now RTX,
// but after the Raytheon merger and the Carrier and Otis spin-offs it is
// another company.
// "TSMC" is no US ticker: Taiwan Semiconductor's NYSE ADR is TSM.
//
// Some old tickers were given to another company since, so the
// directories still name them. Those rows are wrong titles and are
// left out, or move to the company's new ticker when the same
// registrant files under it (SEC submissions as above):
//   AMTD  TD Ameritrade, bought by Schwab in 2020; now AMTD IDEA Group
//   S     Sprint, merged into T-Mobile in 2020; now SentinelOne
//   STI   SunTrust, merged into BB&T in 2019; now Solidion Technology
//   PARA  Paramount Global, folded into Paramount Skydance (a new
//         registrant) in 2025; now Banzai International
//   BBT -> TFC   BB&T is Truist Financial, CIK 92230; now Beacon Financial
//   LB -> BBWI   L Brands is Bath & Body Works, CIK 701985; now LandBridge
// TFC and BBWI are also in the table, so those two end as repeats.
// The table names BE "Elon Musk"; BE is Bloom Energy, which is what an
// order for BE buys, so the row takes that name.
// The table also lists ADRNY twice (Ahold Delhaize, Koninklijke Ahold);
// it is one title and one row.
//
//   https://help.grifin.com/knowledge/what-companies/stocks-are-available-on-grifin
//   https://www.grifin.com/legal/advisory-agreement
//   https://www.grifin.com/legal/fees
//
//   node brokers/grifin/grifin_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { usRow } from "../mitsubishiufjesmart/japan.mjs";
import { usDirectory } from "../raseed/usTape.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const PAGE = "https://help.grifin.com/knowledge/what-companies/stocks-are-available-on-grifin";
const US_MICS = new Set(["XNYS", "XNAS", "ARCX", "XASE", "BATS", "TXSE"]);
const RENAMED = { SQ: "XYZ", GPS: "GAP", FI: "FISV", BODY: "BODI", ATUS: "OPTU", MODG: "CALY", VSCO: "VSXY", TSMC: "TSM" };
// Old tickers now held by another company: null when the table's
// company is gone, else its new ticker.
const REUSED = { AMTD: null, S: null, STI: null, PARA: null, BBT: "TFC", LB: "BBWI" };
const NAMES = { BE: "Bloom Energy" };

function decode(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.8" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

const html = await get(PAGE);
const asOf = decode(html.match(/Last updated:\s*([A-Z][a-z]+ \d{1,2}, \d{4})/)?.[1] || "");
if (!asOf) throw new Error("the article no longer says when it was updated");
const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map((match) => match[1]);
if (tables.length !== 1) throw new Error(`the article has ${tables.length} tables`);

const lines = [];
for (const [, row] of tables[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
  const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((match) => decode(match[1]));
  if (cells.length !== 2) throw new Error(`a row has ${cells.length} cells: ${cells.join(" | ")}`);
  if (cells[0] === "Company Name" && cells[1] === "Symbol") continue;
  lines.push(cells);
}
if (lines.length < 380) throw new Error(`the table has only ${lines.length} rows`);

// --- US symbol directories ---
const { symbols: directory, created } = await usDirectory();
const listing = (ticker) => [ticker, ticker.replace(/[/-]/g, "."), ticker.replace(/[./-]/g, "")].map((spelling) => directory.get(spelling)).find(Boolean);

const gone = [];
const venueMoved = [];
const reused = [];
const renamed = [];
const repeated = [];
const rows = [];
const seen = new Map();
// Lines under their current ticker first, so a repeat keeps the
// table's own line for that title.
const moved = ([, rawTicker]) => (rawTicker.trim().toUpperCase() in REUSED || rawTicker.trim().toUpperCase() in RENAMED ? 1 : 0);
for (const [name, rawTicker] of [...lines].sort((left, right) => moved(left) - moved(right))) {
  const ticker = rawTicker.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]*(?:[./-][A-Z0-9]+)?$/.test(ticker)) throw new Error(`unreadable ticker ${rawTicker} (${name})`);
  if (REUSED[ticker] === null) {
    reused.push(`${ticker} (${name})`);
    continue;
  }
  let listedTicker = REUSED[ticker] || ticker;
  if (!REUSED[ticker] && !listing(ticker) && RENAMED[ticker] && listing(RENAMED[ticker])) listedTicker = RENAMED[ticker];
  if (seen.has(listedTicker)) {
    repeated.push(`${ticker} (${seen.get(listedTicker)} / ${name})`);
    continue;
  }
  seen.set(listedTicker, name);
  if (listedTicker !== ticker) renamed.push(`${ticker}->${listedTicker}`);
  const listed = listing(listedTicker);
  // Grifin sells no ETF; a symbol the directories mark as one means the
  // table now holds something else.
  if (listed?.etf) throw new Error(`${ticker} is an ETF in the US directories`);
  const row = usRow({ symbol: listedTicker, name, type: "STOCK" });
  if (listed) {
    // On an exchange today: the directory gives the venue. The ISIN on
    // file stands only from an exchange line of the asset lists.
    if (!listed.mic) throw new Error(`${listedTicker} is on an unknown exchange code ${listed.code}`);
    if (!US_MICS.has(row.mic)) {
      row.isin = "";
      row.query = listedTicker;
      delete row.matches;
    } else if (row.mic !== listed.mic) venueMoved.push(`${listedTicker} ${row.mic}->${listed.mic}`);
    row.mic = listed.mic;
    row.exchange = row.mic;
  } else if (row.mic !== "OTCM" || !row.isin) {
    gone.push(`${ticker} (${name})`);
    continue;
  }
  rows.push({
    query: row.query,
    ticker: row.ticker,
    name: NAMES[ticker] || row.name,
    exchange: row.exchange,
    ...(row.mic ? { mic: row.mic } : {}),
    currency: "USD",
    type: "STOCK",
    isin: row.isin || "",
    raw: [name, rawTicker].join(" | "),
    // Several ISINs on file for the ticker: the candidates, as usRow
    // leaves them.
    ...(row.matches ? { matches: row.matches } : {}),
  });
}

function expect(ticker, exchange) {
  const row = rows.find((item) => item.ticker === ticker);
  if (!row) throw new Error(`${ticker} is missing`);
  if (exchange && row.exchange !== exchange) throw new Error(`${ticker} is on ${row.exchange}`);
}
expect("AMZN", "XNAS");
expect("SBUX", "XNAS");
expect("WMT");
expect("MCD", "XNYS");
expect("XYZ", "XNYS");
if (rows.length < 330) throw new Error(`short list: ${rows.length} shares`);
if (gone.length > 0.15 * lines.length) throw new Error(`${gone.length} tickers in no directory`);

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("grifin-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`not in the US directories, left out (${gone.length}): ${gone.join("; ")}`);
console.error(`ticker now another company's, left out (${reused.length}): ${reused.join("; ")}`);
console.error(`venue from the directories of ${created["nasdaqlisted.txt"]} ET, not the asset lists' (${venueMoved.length}): ${venueMoved.join(" ") || "none"}`);
console.error(`under a new ticker (${renamed.length}): ${renamed.join(" ")}; listed twice: ${repeated.join("; ") || "none"}`);
console.error(`Grifin list ${asOf}: ${lines.length} table rows, ${rows.length} STOCK, ${rows.filter((row) => row.isin).length} with an ISIN`, counts);
