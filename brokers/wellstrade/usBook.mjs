// The whole US exchange book of the day, for the brokers whose one place
// is "United States" and that publish no list of their own (WellsTrade,
// Citi Self Invest, TIAA, Merrill-style bank and credit-union brokerages,
// and the other brokers of that group). Each of them writes its own
// scraper; this module gives the rows they start from.
//
// The US is one NBBO market: a title is one row, on its primary listing,
// in dollars, whatever venue the broker routes the order to.
//
// The list is Nasdaq Trader's symbol directories of the day, which hold
// every security listed on a US exchange (Nasdaq, NYSE, NYSE American,
// NYSE Arca, Cboe BZX, the Texas Stock Exchange, NYSE Texas, IEX), with
// the primary listing, an ETF flag and a security name. They are read by
// ../raseed/usTape.mjs, which leaves out test issues and refuses a file
// older than the New York date (a security delisted the day before is
// still in yesterday's file; at a weekend Friday's file is taken):
//
//   ftp://ftp.nasdaqtrader.com/symboldirectory/nasdaqlisted.txt
//   ftp://ftp.nasdaqtrader.com/symboldirectory/otherlisted.txt
//   (same files as https://www.nasdaqtrader.com/dynamic/SymDir/,
//   field definitions on https://www.nasdaqtrader.com/trader.aspx?id=symboldirdefs)
//
// A delisted line is gone from the directories. A suspended line is one
// with an open trade halt: a halt with no resumption date in the NYSE
// current trade halts download (all US venues) or in the Nasdaq Trader
// trade-halts RSS (openHalts below; the NYSE file is required, the RSS
// is added when its bot wall lets it through):
//
//   https://www.nyse.com/api/trade-halts/current/download
//   https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts
//
// Kept: common and ordinary shares, ADRs, REITs, partnership common units,
// SPAC class A shares, tracking and dual-class lines (BRK.A, BRK.B,
// MKC.V), preferred shares (equity; ticker NLY.PRG for the directory's
// NLY$G, NLY.PR for a bare NLY$), exchange-listed closed-end funds and
// BDCs (they trade on the exchange like a share; type STOCK, as in
// ../ibkrus, ../moomoous and ../coinbaseus), ETFs and commodity trusts
// (ETF; a trust on NYSE Arca or Cboe BZX the directory does not flag but
// the asset lists hold only as a fund, such as BAR, too) and exchange-traded notes (ETN, when the name says ETN or
// exchange-traded note).
// Left out: warrants and rights (CQS suffix .W/.WS/.R/.RT, Nasdaq "-
// Warrant", "- Rights", "Contingent Value Rights"), SPAC units and other
// units that bundle a share with a warrant, a right or a note (.U, "-
// Units", "Units, each consisting", corporate and tangible equity units,
// note units), when-issued lines of the NYSE family (.V lines named
// "When-Issued"; Nasdaq keeps that word in the names of CEG and SNDK long
// after regular-way trading began, so a Nasdaq name is not read for it),
// and listed notes and debentures (baby bonds such as F$B "6.20% Notes due
// 2059", through ../../obligation.mjs).
// Options: { preferreds: false } leaves the preferred lines out and
// { closedEnd: false } the closed-end funds (a share line the directories
// do not flag as ETF that ../../assets holds on a US exchange only as a
// fund, never as a share), for a broker whose pages exclude them.
//
// OTC Markets lines are not in the directories and are not here. A broker
// that trades OTC adds them itself (see ../moomoous/moomoous_otc.mjs).
//
// The directories print no ISIN. It comes from the US exchange lines of
// ../../assets/stocks.csv and etfs.csv, through usRow in
// ../mitsubishiufjesmart/japan.mjs; a code the lists give several ISINs
// keeps them in `matches`, and a code they do not hold has an empty isin
// and its ticker as query.
//
// Such a row is then given the ISIN the repo's main US catalogues use for
// the same ticker on a US exchange (CATALOGUE_SOURCES: IBKR US, Webull US,
// Robinhood, Alpaca...), when one ISIN wins at least twice as many of them
// as any other and, if the asset lists offered candidates, is one of them
// (typically the new ISIN after a reverse split: ACET, ADIL, AEVA; or the
// listed class: Accenture IE00B4BNMY34). Added 2026-10-25: about 620 of
// 639 rows without an ISIN were filled this way.
//
// Row: { query, ticker, name, exchange (MIC), mic, currency: "USD", type,
// isin, raw[, matches] }. MICs: XNAS Nasdaq, XNYS NYSE, XASE NYSE American,
// ARCX NYSE Arca, BATS Cboe BZX, TXSE Texas Stock Exchange, XCHI NYSE
// Texas, IEXG IEX. The returned array also carries `report` (directory
// dates, halt sources and what was left out, with counts).
//
// Use:
//   import { usBook } from "../wellstrade/usBook.mjs";
//   const rows = await usBook();                       // everything above
//   const rows = await usBook({ preferreds: false });  // no preferreds
//
// Run alone for the counts:
//   node brokers/wellstrade/usBook.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCsv, usRow } from "../mitsubishiufjesmart/japan.mjs";
import { isObligation } from "../../obligation.mjs";
import { tapeKey, usDirectory } from "../raseed/usTape.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url, accept) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

// Symbol key -> "SYMBOL date reason on venue (source)" for every halt with
// no resumption date. The same reading as openHalts in ../raseed/usTape.mjs,
// whose NYSE request (Accept: text/csv) the NYSE now answers with 406; this
// one asks for any type. The NYSE file is required and must keep its
// header; the Nasdaq RSS is added when its bot wall lets it through.
export async function openHalts() {
  const open = new Map();
  open.sources = [];
  const nyse = parseCsv(await get("https://www.nyse.com/api/trade-halts/current/download", "text/csv,*/*"));
  const head = (nyse[0] || []).map((cell) => cell.replace(/^\uFEFF/, "").trim());
  const want = ["Halt Date", "Halt Time", "Symbol", "Name", "Exchange", "Reason", "Resume Date"];
  if (want.some((name, index) => head[index] !== name)) throw new Error(`NYSE trade halts header is ${head.join(",")}`);
  for (const [date, , symbol, , exchange, reason, resume] of nyse.slice(1)) {
    if (!symbol && !date) continue;
    if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`NYSE trade halts line ${date} ${symbol}`);
    if (!String(resume || "").trim()) open.set(tapeKey(symbol), `${symbol} ${date} ${reason} on ${exchange} (NYSE)`);
  }
  open.sources.push(`NYSE ${nyse.length - 1} halts`);
  await sleep(1500);
  let rss = "";
  for (let attempt = 0; attempt < 3 && !rss.includes("<rss"); attempt += 1) {
    if (attempt) await sleep(3000 * attempt);
    rss = await get("https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts", "application/rss+xml,*/*").catch(() => "");
  }
  if (!rss.includes("<rss")) {
    open.sources.push("Nasdaq RSS not answered (bot wall), not read");
    return open;
  }
  const count = rss.match(/<ndaq:numItems>(\d+)<\/ndaq:numItems>/);
  if (!count || !/NASDAQ Trade Halts/.test(rss)) throw new Error(`Nasdaq trade halts RSS changed: ${rss.slice(0, 120)}`);
  const items = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  if (items.length !== Number(count[1])) throw new Error(`Nasdaq trade halts RSS: ${items.length} items for ${count[1]}`);
  const tag = (item, name) => {
    const found = item.match(new RegExp(`<ndaq:${name}>([^<]*)</ndaq:${name}>|<ndaq:${name}\\s*/>`));
    return found ? (found[1] || "").trim() : null;
  };
  for (const item of items) {
    const symbol = tag(item, "IssueSymbol");
    const resume = tag(item, "ResumptionDate");
    if (!symbol || resume === null) throw new Error(`Nasdaq trade halts RSS item without symbol or resumption field: ${item.slice(0, 160)}`);
    if (!resume && !open.has(tapeKey(symbol))) open.set(tapeKey(symbol), `${symbol} ${tag(item, "HaltDate")} ${tag(item, "ReasonCode")} on ${tag(item, "Market")} (Nasdaq)`);
  }
  open.sources.push(`Nasdaq RSS ${items.length} halts`);
  return open;
}

// Directory exchange codes usTape does not map. Today they carry test
// issues only (MTEST, ZIEXT...), but a real listing may follow.
const MORE_LISTINGS = { M: "XCHI", V: "IEXG" };
const US_MICS = new Set(["XNAS", "XNYS", "XASE", "ARCX", "BATS", "TXSE", "XCHI", "IEXG"]);

// US catalogues whose rows carry the broker's own ISIN (see the header).
const CATALOGUE_SOURCES = ["ibkrus", "webullus", "robinhood", "alpaca", "firstrade", "public", "tradestationus", "sofi", "m1", "moomoous", "tastytradeus", "tradier", "siebert", "stash", "tradezero", "tradeup", "sogotrade", "choicetrade", "just2trade", "gotradeglobal"];
const voteKey = (ticker) => String(ticker || "").toUpperCase().replace(/[ ./]/g, "");

// ticker -> Map(isin -> number of catalogues), US-exchange rows only.
function catalogueVotes() {
  const votes = new Map();
  const brokers = fileURLToPath(new URL("../", import.meta.url));
  for (const folder of CATALOGUE_SOURCES) {
    let rows;
    try {
      rows = JSON.parse(fs.readFileSync(`${brokers}${folder}/${folder}-parsed.json`, "utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(rows)) rows = rows?.rows || [];
    const seen = new Set();
    for (const row of rows) {
      if (!row.isin || !row.ticker || !US_MICS.has(row.mic)) continue;
      const key = `${voteKey(row.ticker)}|${row.isin}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const tally = votes.get(voteKey(row.ticker)) || new Map();
      tally.set(row.isin, (tally.get(row.isin) || 0) + 1);
      votes.set(voteKey(row.ticker), tally);
    }
  }
  return votes;
}
const US_LISTS = new Set(["NYSE", "NASDAQ", "AMEX", "CBOE"]);

const ETN = /\bETNs?\b|exchange[- ]traded notes?\b/i;
const RIGHT_OR_WARRANT =
  /\s-\s(?:share\s+)?(?:rights?|warrants?)\b|\b(?:rights?|warrants?)\s*$|\b(?:redeemable\s+)?(?:warrants?|rights?),?\s+(?:each|to\s+(?:purchase|acquire|subscribe)|exercisable|entitling)\b|\bcontingent value rights?\b/i;
const NOT_A_SHARE_UNIT =
  /\bunits?,?\s+each\s+consisting\b|\s-\s+units?\.?\s*$|\b(?:corporate|tangible equity|equity)\s+units\b|\bnote\s+units?\b/i;
const PREFERRED_SYMBOL = /\$([A-Z]?)$/;
const DERIVED_SUFFIX = /\.(W|WS|WD|R|RT)$/;
const UNIT_SUFFIX = /\.U$/;

// The directory's ACT symbol -> the house spelling (BRK.B stays, NLY$G is
// NLY.PRG, a bare series NLY$ is NLY.PR).
export function houseTicker(act) {
  return String(act || "").trim().toUpperCase().replace(PREFERRED_SYMBOL, ".PR$1");
}

function assetTickers(file) {
  const tickers = new Set();
  for (const [ticker, exchange] of parseCsv(fs.readFileSync(new URL(`../../assets/${file}`, import.meta.url), "utf8")).slice(1)) {
    if (US_LISTS.has(exchange)) tickers.add(String(ticker).split(":").pop().toUpperCase());
  }
  if (tickers.size < 2000) throw new Error(`assets/${file} holds only ${tickers.size} US exchange tickers`);
  return tickers;
}

export async function usBook({ preferreds = true, closedEnd = true } = {}) {
  const tape = await usDirectory();
  const halts = await openHalts();
  const funds = assetTickers("etfs.csv");
  const stocks = assetTickers("stocks.csv");

  const rows = [];
  const left = { rights: [], units: [], whenIssued: [], notes: [], halted: [], preferreds: [], closedEnd: [] };
  let closedEndKept = 0;
  let preferredKept = 0;
  for (const [act, entry] of tape.symbols) {
    const mic = entry.mic || MORE_LISTINGS[entry.code];
    if (!mic) throw new Error(`${act} (${entry.name}) is listed on unknown exchange code ${entry.code}`);
    const name = entry.name.replace(/\s+/g, " ").trim();
    const nasdaq = entry.code === "Q";
    const preferred = PREFERRED_SYMBOL.test(act);
    if (!entry.etf) {
      if ((!nasdaq && DERIVED_SUFFIX.test(act)) || RIGHT_OR_WARRANT.test(name)) {
        left.rights.push(act);
        continue;
      }
      if ((!nasdaq && UNIT_SUFFIX.test(act)) || NOT_A_SHARE_UNIT.test(name)) {
        left.units.push(act);
        continue;
      }
      if (!nasdaq && /when[- ]issued/i.test(name)) {
        left.whenIssued.push(act);
        continue;
      }
    }
    let type = ETN.test(name) ? "ETN" : entry.etf ? "ETF" : "STOCK";
    if (type === "STOCK" && isObligation(name, type)) {
      left.notes.push(act);
      continue;
    }
    if (halts.has(tapeKey(act))) {
      left.halted.push(halts.get(tapeKey(act)));
      continue;
    }
    if (preferred) {
      if (!preferreds) {
        left.preferreds.push(act);
        continue;
      }
      preferredKept += 1;
    }
    const ticker = houseTicker(act);
    // A trust on NYSE Arca or Cboe BZX that the asset lists hold only as a
    // fund is a commodity trust the directory does not flag (BAR): an ETF.
    // Closed-end funds list on NYSE, Nasdaq and NYSE American.
    if (type === "STOCK" && (mic === "ARCX" || mic === "BATS") && funds.has(ticker) && !stocks.has(ticker)) type = "ETF";
    if (type === "STOCK" && !preferred && funds.has(ticker) && !stocks.has(ticker)) {
      if (!closedEnd) {
        left.closedEnd.push(act);
        continue;
      }
      closedEndKept += 1;
    }
    const found = usRow({ symbol: ticker, name, type: type === "STOCK" ? "STOCK" : "ETF" });
    const sure = US_MICS.has(found.mic);
    const isin = sure ? found.isin || "" : "";
    rows.push({
      query: isin || ticker,
      ticker,
      name,
      exchange: mic,
      mic,
      currency: "USD",
      type,
      isin,
      raw: [act, name, `exchange ${entry.code}`, entry.etf ? "ETF flag" : ""].filter(Boolean).join(" | "),
      ...(sure && found.matches ? { matches: found.matches } : {}),
    });
  }

  for (const [ticker, type, mic] of [
    ["AAPL", "STOCK", "XNAS"],
    ["JPM", "STOCK", "XNYS"],
    ["BRK.B", "STOCK", "XNYS"],
    ["SPY", "ETF", "ARCX"],
    ["QQQ", "ETF", "XNAS"],
  ]) {
    const row = rows.find((item) => item.ticker === ticker);
    if (!row || row.type !== type || row.mic !== mic) throw new Error(`${ticker} should be a ${type} on ${mic}: ${JSON.stringify(row)}`);
  }
  const etfs = rows.filter((row) => row.type !== "STOCK").length;
  if (rows.length - etfs < 5000 || etfs < 4000) throw new Error(`short book: ${rows.length - etfs} shares, ${etfs} ETFs/ETNs`);

  // Rows the asset lists leave without an ISIN: the catalogues' vote.
  const votes = catalogueVotes();
  let voted = 0;
  for (const row of rows) {
    if (row.isin) continue;
    const tally = [...(votes.get(voteKey(row.ticker)) || new Map())].sort((a, b) => b[1] - a[1]);
    if (!tally.length || (tally[1] && tally[0][1] < 2 * tally[1][1])) continue;
    const [isin] = tally[0];
    const offered = (row.matches || []).map((match) => (typeof match === "string" ? match : match?.isin)).filter((code) => /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(code || ""));
    if (offered.length && !offered.includes(isin)) continue;
    row.isin = isin;
    row.query = isin;
    delete row.matches;
    voted += 1;
  }

  rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
  rows.report = {
    isinFromCatalogues: voted,
    directories: tape.created,
    halts: halts.sources,
    kept: { preferreds: preferredKept, closedEnd: closedEndKept },
    leftOut: left,
  };
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const rows = await usBook();
  const counts = {};
  for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
  const byType = {};
  for (const row of rows) byType[row.type] = (byType[row.type] || 0) + 1;
  const { report } = rows;
  console.log(`${rows.length} rows`, byType, `${rows.filter((row) => row.isin).length} with an ISIN, ${rows.filter((row) => row.matches).length} with several`);
  console.log(counts);
  console.log(`directories ${JSON.stringify(report.directories)}; halts: ${report.halts.join(", ")}`);
  console.log(`kept ${report.kept.preferreds} preferreds, ${report.kept.closedEnd} closed-end funds`);
  for (const [what, list] of Object.entries(report.leftOut)) console.log(`left out ${list.length} ${what}${list.length && list.length < 40 ? `: ${list.join("; ")}` : ""}`);
}
