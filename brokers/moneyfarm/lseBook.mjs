// The London Stock Exchange share and ETP book, for the brokers whose one
// place is the LSE (Moneyfarm, First Direct, Shareview Dealing): every
// share, depositary receipt, ETF, ETC and ETN line the LSE quotes today on
// the Main Market (with its Specialist Fund Segment and the International
// Order Book), AIM, admission-to-trading-only (ATT) and the Professional
// Securities Market, one row per line (TIDM), in the line's own trading
// currency (GBX, GBP, USD, EUR, JPY, HKD...).
//
// Two LSE sources, both public:
//  1. The price explorer's own data (the search API behind
//     https://www.londonstockexchange.com/en/price-explorer), read typology
//     "Equity" and "ETPs" on markets MAIN, AIM, ATT and PSM, 100 lines a
//     call. It is today's list: TIDM, ISIN, currency, market, trading
//     status, first trading date and last price. Lines delisted, taken over
//     or renamed since the month-end list are already off it.
//  2. The LSE Instrument List ("All Equity" and "Non-Equity" sheets, as at
//     the last month end), which files each line under its MiFIR class:
//     shares (SHRS), depositary receipts (DPRS), other equity (OTHR, CDIs),
//     ETFs (ETFS), ETCs (ETCS), ETNs (ETNS), securitised derivatives (SDRV,
//     warrants and certificates). It gives the row's type; a line listed
//     after the month end takes the type of another line of its ISIN, else
//     STOCK for an equity line and ETF/ETC/ETN from its name for an ETP.
//
// Left out (counted in the report):
//  - suspended or halted lines: price explorer trading status "Suspended"
//    / "Suspended - Closed" / "Halted" (the LSE quote page shows
//    "Trading Status: Suspended"), and any line whose ISIN is on the FCA
//    Official List of suspended securities (Trading Venue LSE). The FCA
//    file also carries the "A RIGHTS" / "B RIGHTS" election lines of
//    investment-trust schemes (FJVA, MINA, PACA...);
//  - never-traded lines: no last price at all in the price explorer
//    (WisdomTree "MICRO" ETP classes, most Rule 144A GDR lines, assented
//    offer lines such as CABA/CABB, a few old preference shares that only
//    trade off book);
//  - lines whose first trading date is still to come;
//  - warrants and other securitised derivatives (MiFIR SDRV), and nil-paid
//    rights ("NIL PAID", "(NP - date)");
//  - bonds, structured products and anything else that is not typology
//    Equity or ETPs (not read at all).
// Kept, and marked in raw so a scraper can drop them on its broker's own
// words: preference shares, zero-dividend preference shares, VCTs and
// investment trusts (all MiFIR SHRS, exchange-traded), International Order
// Book depositary receipts (segments IOBE/IOBU/IOBS), Rule 144A lines that
// do trade, PSM and ATT lines, temporary fully-paid lines ("(FP - date)").
//
// The crawl (about 80 calls, 1 s apart) is kept in lse-cache.json next to
// this file for 12 hours, so the three scrapers run back to back read the
// LSE once.
//
//   https://www.londonstockexchange.com/en/price-explorer
//   https://apidata.londonstockexchange.com/search/v1/query (POST, the page's own API)
//   https://www.londonstockexchange.com/en/reports/issuers-and-instruments?tab=instruments
//   https://docs.londonstockexchange.com/reports/instruments/latest.json
//   https://marketsecurities.fca.org.uk/officiallist (download "suspended")
//   https://marketsecurities.fca.org.uk/downloadOfficiallist/suspended
//
// Use:
//   import { lseBook } from "../moneyfarm/lseBook.mjs";
//   const { rows, report } = await lseBook();
//   node brokers/moneyfarm/lseBook.mjs          (prints the counts)
//   node brokers/moneyfarm/lseBook.mjs --fresh  (ignores the cache)

import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const EXCHANGE = "London Stock Exchange";
export const AIM = "AIM";
export const MIC = "XLON";

const exec = promisify(execFile);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SEARCH = "https://apidata.londonstockexchange.com/search/v1/query";
const SEARCH_HEADERS = { "Content-Type": "application/json", Accept: "application/json", Origin: "https://www.londonstockexchange.com", Referer: "https://www.londonstockexchange.com/en/price-explorer" };
const INSTRUMENT_INDEX = "https://docs.londonstockexchange.com/reports/instruments/latest.json";
const FCA_SUSPENDED = "https://marketsecurities.fca.org.uk/downloadOfficiallist/suspended";
const CACHE = new URL("lse-cache.json", import.meta.url);
const CACHE_HOURS = 12;
const MARKETS = ["MAIN", "AIM", "ATT", "PSM"];
const PAGE = 100; // the API refuses more: "endRow - startRow + 1 must not exceed 100"
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const STOPPED = /Suspended|Halted/i;
const NIL_PAID = /NIL PAID|\(NP\b/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

// curl, as ../dnb/officialLists.mjs: --max-time 30, five tries.
async function curl(url, { method = "GET", body = null, headers = {}, out = null } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const args = ["-sSL", "--compressed", "--max-time", "30", "-A", UA, "-X", method];
      for (const [name, value] of Object.entries(headers)) args.push("-H", `${name}: ${value}`);
      if (body) args.push("--data-binary", body);
      if (out) args.push("-o", out);
      args.push("-w", "\n%{http_code}", url);
      const { stdout } = await exec("curl", args, { maxBuffer: 64_000_000, encoding: "utf8" });
      const cut = stdout.lastIndexOf("\n");
      const status = Number(stdout.slice(cut + 1));
      if (status >= 200 && status < 300) return stdout.slice(0, cut);
      last = `${status} ${url} ${stdout.slice(0, Math.min(cut, 200))}`;
    } catch (error) {
      last = `${String(error.stderr || error.message || error).trim()} ${url}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

// ---- 1. the price explorer ----------------------------------------------

// The API files every line of the venue (bonds included, 2.5 million
// documents). Its set filters are strict, and past the last match it pads
// the page with unrelated documents, so a page is read until a line no
// longer matches the filter.
async function explorerLines(typology) {
  const lines = new Map();
  let total = 0;
  for (let start = 0; start < 10_000; start += PAGE) {
    const body = JSON.stringify({
      type: "instrument",
      group: false,
      tradingVenue: "LSE",
      startRow: start,
      endRow: start + PAGE - 1,
      sortModel: [{ colId: "tidm", sort: "asc" }],
      filterModel: { typology: { filterType: "set", values: [typology] }, marketCode: { filterType: "set", values: MARKETS } },
    });
    const answer = JSON.parse(await curl(SEARCH, { method: "POST", body, headers: SEARCH_HEADERS }));
    if (answer.statusCode !== 200 || !Array.isArray(answer.Data)) throw new Error(`the LSE price explorer answered ${answer.statusCode}: ${answer.message}`);
    const hits = answer.Data.filter((line) => line.typology === typology && MARKETS.includes(line.marketCode));
    total += hits.length;
    // The index holds a second, shorter document for some lines (display
    // name without "TIDM | "); the fields that matter are the same.
    for (const line of hits) {
      const held = lines.get(line.tidm);
      if (!held || (!held.instrumentDisplayName?.includes(" | ") && line.instrumentDisplayName?.includes(" | "))) lines.set(line.tidm, line);
    }
    if (hits.length < answer.Data.length || answer.Data.length < PAGE) break;
    await sleep(1000);
  }
  return { lines: [...lines.values()], documents: total };
}

// ---- 2. the Instrument List ---------------------------------------------

const SHEETS = {
  "1.1 Shares": "STOCK",
  "1.2 Depository Receipts": "STOCK",
  "1.3 ETFs": "ETF",
  "1.4 Certificates": "STOCK",
  "1.5 Others": "STOCK",
  "2.2 ETCs": "ETC",
  "2.3 ETNs": "ETN",
  "2.4 Securitised Derivatives": "SDRV",
};

const READ_SHEETS = `
import json, sys, openpyxl
book = openpyxl.load_workbook(sys.argv[1], read_only=True)
names = json.loads(sys.argv[2])
out = {"asAt": "", "sheets": {}}
for name in names:
    if name not in book.sheetnames:
        raise SystemExit("sheet missing: " + name)
    rows = list(book[name].iter_rows(values_only=True))
    for row in rows[:8]:
        if row and isinstance(row[0], str) and row[0].startswith("As at "):
            out["asAt"] = row[0][6:]
    head = next((i for i, row in enumerate(rows) if row and row[0] == "TIDM"), None)
    if head is None:
        raise SystemExit("no TIDM header in " + name)
    keys = [str(k or "") for k in rows[head]]
    out["sheets"][name] = [{k: (None if v is None else str(v)) for k, v in zip(keys, row)} for row in rows[head + 1:] if row and row[0]]
print(json.dumps(out))
`;

async function instrumentList() {
  const index = JSON.parse(await curl(INSTRUMENT_INDEX));
  const link = index?.Data?.find((item) => item.reportType === "latest-instrument-list")?.downloadLink;
  if (!link) throw new Error("the LSE instrument report index names no Instrument List");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lse-book-"));
  try {
    const file = path.join(dir, "instrument-list.xlsx");
    await curl(link, { out: file });
    // python3 + openpyxl, as ../ibkrus/ibkr_exchange_lists.mjs reads workbooks.
    const run = spawnSync("python3", ["-c", READ_SHEETS, file, JSON.stringify(Object.keys(SHEETS))], { cwd: dir, encoding: "utf8", maxBuffer: 200_000_000 });
    if (run.status !== 0) throw new Error(`reading the LSE Instrument List failed: ${run.stderr}`);
    const parsed = JSON.parse(run.stdout);
    const byTidm = new Map();
    const byIsin = new Map();
    for (const [sheet, kind] of Object.entries(SHEETS)) {
      for (const row of parsed.sheets[sheet]) {
        const line = { tidm: clean(row.TIDM), isin: clean(row.ISIN), kind, mifir: clean(row["MiFIR Identifier Code"]), segment: clean(row["Market Segment Code"]), market: clean(row["LSE Market"]), currency: clean(row["Trading Currency"]) };
        byTidm.set(line.tidm, line);
        if (!byIsin.has(line.isin)) byIsin.set(line.isin, line);
      }
    }
    const equity = parsed.sheets["1.1 Shares"].length + parsed.sheets["1.3 ETFs"].length;
    if (equity < 4000) throw new Error(`the LSE Instrument List holds only ${equity} shares and ETFs`);
    return { asAt: parsed.asAt, link, byTidm, byIsin };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---- 3. the FCA list of suspended securities ----------------------------

async function fcaSuspended() {
  let text = await curl(FCA_SUSPENDED);
  // The page answers with a script that sends the browser to the file.
  const redirect = text.match(/https:\/\/[a-z0-9.-]+\.force\.com\/sfc\/dist\/version\/download\/\?[^'"]+/i)?.[0];
  if (redirect) text = await curl(redirect);
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  if (!/^Company Name,.*ISIN/.test(lines[0] || "")) throw new Error(`the FCA suspended list changed: ${lines[0]}`);
  const isins = new Set();
  for (const line of lines.slice(1)) {
    if (!/,LSE,/.test(line)) continue;
    for (const isin of line.match(/\b[A-Z]{2}[A-Z0-9]{9}\d\b/g) || []) isins.add(isin);
  }
  if (lines.length < 10) throw new Error(`the FCA suspended list has only ${lines.length - 1} lines`);
  return isins;
}

// ---- the book ------------------------------------------------------------

// An ETP line the month-end list does not file yet: an Irish or Luxembourg
// fund is an ETF, a note programme (XS, JE, GB, CH: GraniteShares, Leverage
// Shares, 21Shares, which the list files as ETNS) an ETN, unless it says ETC.
function etpKind(name, isin) {
  if (/\bETC\b|PHYSICAL (GOLD|SILVER|PLATINUM|PALLADIUM|METAL)/i.test(name)) return "ETC";
  if (/^(IE|LU)/.test(isin) || /\bETF\b|UCITS/i.test(name)) return "ETF";
  return "ETN";
}

async function build() {
  const listed = await instrumentList();
  const suspended = await fcaSuspended();
  const equity = await explorerLines("Equity");
  await sleep(1000);
  const etps = await explorerLines("ETPs");
  const live = [...equity.lines, ...etps.lines];
  if (equity.lines.length < 1300 || etps.lines.length < 3500) throw new Error(`the LSE price explorer gave ${equity.lines.length} equity and ${etps.lines.length} ETP lines`);

  const today = new Date().toISOString().slice(0, 10);
  const dropped = {};
  const drop = (reason) => (dropped[reason] = (dropped[reason] || 0) + 1);
  const rows = [];
  const seen = new Set();
  let newSinceList = 0;
  for (const line of live) {
    const tidm = clean(line.tidm);
    const isin = clean(line.isin).toUpperCase();
    const currency = clean(line.currency).toUpperCase();
    const name = clean(String(line.instrumentDisplayName || "").replace(/^[^|]*\|\s*/, "")) || clean(`${line.issuerName || ""} ${line.instrumentName || ""}`);
    const status = clean(line.tradingStatus);
    const price = clean(line.price);
    if (!tidm || !ISIN.test(isin) || !currency) {
      drop("no TIDM, ISIN or currency");
      continue;
    }
    if (STOPPED.test(status)) {
      drop(`LSE trading status ${status.replace(/ - Closed$/, "")}`);
      continue;
    }
    if (suspended.has(isin)) {
      drop("FCA Official List: suspended");
      continue;
    }
    if (!price || price === "-") {
      drop("never traded (no last price on the LSE)");
      continue;
    }
    if (line.firstTradingDate && line.firstTradingDate > today) {
      drop("first trading date still to come");
      continue;
    }
    const own = listed.byTidm.get(tidm);
    const filed = own && own.isin === isin ? own : listed.byIsin.get(isin);
    if (!filed) newSinceList += 1;
    let type = filed?.kind || (line.typology === "ETPs" ? etpKind(name, isin) : "STOCK");
    if (type === "SDRV") {
      drop("warrant or securitised derivative (MiFIR SDRV)");
      continue;
    }
    if (line.typology === "Equity" && NIL_PAID.test(name)) {
      drop("nil-paid rights");
      continue;
    }
    // An ETP the list files as a share class of a fund stays an ETF.
    if (line.typology === "ETPs" && type === "STOCK") type = etpKind(name, isin);
    if (seen.has(tidm)) continue;
    seen.add(tidm);
    rows.push({
      query: isin,
      ticker: tidm,
      name,
      exchange: line.marketCode === "AIM" ? AIM : EXCHANGE,
      mic: MIC,
      currency,
      type,
      isin,
      raw: [tidm, name, isin, currency, line.marketCode, line.typology, filed?.mifir || "new since list", filed?.segment || "", status, line.firstTradingDate || "", price].join(" | "),
    });
  }
  rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
  const byType = {};
  const byMarket = {};
  for (const row of rows) {
    byType[row.type] = (byType[row.type] || 0) + 1;
    const market = row.raw.split(" | ")[4];
    byMarket[market] = (byMarket[market] || 0) + 1;
  }
  const quoted = new Set(live.map((item) => item.tidm));
  const gone = [...listed.byTidm.values()].filter((line) => line.kind !== "SDRV" && !quoted.has(line.tidm)).length;
  return {
    rows,
    report: {
      built: new Date().toISOString(),
      instrumentListAsAt: listed.asAt,
      instrumentList: listed.link,
      explorerLines: live.length,
      kept: rows.length,
      byType,
      byMarket,
      dropped,
      newSinceList,
      onListButNoLongerQuoted: gone,
      fcaSuspendedIsins: suspended.size,
    },
  };
}

// Every quoted share and ETP line of the LSE, as rows. { fresh: true }
// skips the 12-hour cache.
export async function lseBook({ fresh = false } = {}) {
  if (!fresh) {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE, "utf8"));
      if (Date.now() - Date.parse(cached.report.built) < CACHE_HOURS * 3_600_000 && cached.rows?.length) return cached;
    } catch {}
  }
  const book = await build();
  fs.writeFileSync(CACHE, `${JSON.stringify(book)}\n`);
  return book;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, report } = await lseBook({ fresh: process.argv.includes("--fresh") });
  console.log(JSON.stringify(report, null, 2));
  console.log(`${rows.length} rows`);
}
