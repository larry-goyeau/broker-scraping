// The London Stock Exchange book, for the brokers whose single place is the
// United Kingdom and that print no list of their own (Stratiphy, Monzo,
// Investwizz): every line traded on an LSE order book, shares, depositary
// receipts and exchange-traded products, with suspended lines left out.
//
// The LSE's own price explorer is read. Its data API answers every LSE line
// with its TIDM, ISIN, trading currency, market (Main Market, AIM, Admission
// to Trading Only, Professional Securities Market), type (Equity, ETPs,
// Bonds, Others), its search tags (Shares, Depository Receipts, IOB
// (International Order Book), Specialist Fund Segment, ETF, ETN, ETC, Trade
// Reporting Only) and its trading status ("Normal", "Suspended", "Halted",
// each with " - Closed" outside trading hours). The same filters as the
// price explorer page are applied: types Equity and ETPs, markets MAIN, AIM,
// ATT and PSM, 100 lines a call (the API's limit), about 65 calls.
//
//   https://www.londonstockexchange.com/en/price-explorer
//   https://apidata.londonstockexchange.com/search/v1/query (POST)
//
// Left out:
// - a suspended or halted line (trading status "Suspended" or "Halted"):
//   the LSE shows it as "Trading Status: Suspended - Closed"; nothing can be
//   bought there;
// - a "Trade Reporting Only" line (the 144A GDRs, the MISC/MISL segment and
//   the ETCs filed there): it has no order book, trades are only reported;
// - a corporate-action line: "A RIGHTS"/"B RIGHTS" conversion or tender
//   rights, nil-paid ("NP") and fully-paid ("FP") new-share lines, assented
//   ("ASSD") takeover lines;
// - a line not trading yet (first trading date after today) or with no
//   valid ISIN;
// - the lines with no LSE market code: the "0xxx" foreign shares and ETFs
//   the LSE carries for off-book trade reporting only (about 4,800). They
//   are not on the LSE's Instrument List.
// Bonds, warrants and other securitised derivatives are another type and
// are not read.
//
// The currency is the line's trading currency on the LSE (GBX for a line in
// pence, GBP, USD, EUR...). A title quoted in two currencies has one row
// per line. Every row is exchange "London Stock Exchange", MIC XLON;
// International Order Book GDRs included (option iob: false drops them).
//
// The read is kept for 12 hours in the system temp folder, so the scrapers
// run back to back read the LSE once.

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const API = "https://apidata.londonstockexchange.com/search/v1/query";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  Accept: "application/json",
  "Content-Type": "application/json",
  Origin: "https://www.londonstockexchange.com",
  Referer: "https://www.londonstockexchange.com/",
};
const PAGE = 100;
const MARKETS = ["MAIN", "AIM", "ATT", "PSM"];
const CACHE = path.join(os.tmpdir(), "lse-book-cache.json");
const CACHE_HOURS = 12;
const CURRENCIES = new Set(["GBX", "GBP", "USD", "EUR", "CHF", "JPY", "HKD", "SEK", "NOK", "DKK", "CAD", "AUD", "SGD", "PLN", "MXN", "NZD", "ILS", "ZAR", "CZK", "HUF"]);
const CORPORATE_ACTION = /\b[AB] RIGHTS\b|\bRIGHTS\b|\((?:NP|FP)\b|\bNIL PAID\b|\bASSD\b|\bASSENTED\b/i;
const ETP_TAGS = ["ETF", "ETN", "ETC"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

function isinOk(isin) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return false;
  const digits = isin.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

async function page(start) {
  const body = {
    apiBody: { type: "instrument", group: false, tradingVenue: "LSE" },
    startRow: start,
    endRow: start + PAGE - 1,
    filterModel: {
      typology: { filterType: "set", values: ["Equity", "ETPs"] },
      marketCode: { filterType: "set", values: MARKETS },
    },
    sortModel: [{ colId: "tidm", sort: "asc" }],
  };
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(API, { method: "POST", headers: HEADERS, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data?.Data) && Number.isInteger(data.rowCount)) return data;
        last = `no Data in the answer for row ${start}`;
      } else {
        last = `${response.status} for row ${start}`;
      }
    } catch (error) {
      last = `${error.message || error} for row ${start}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(`the LSE price explorer API failed: ${last}`);
}

async function crawlOnce() {
  const lines = [];
  let total = null;
  for (let start = 0; start < 20_000; start += PAGE) {
    const data = await page(start);
    total ??= data.rowCount;
    lines.push(...data.Data);
    if (data.Data.length < PAGE || lines.length >= total) break;
    await sleep(700);
  }
  const tidms = new Set(lines.map((line) => line.tidm));
  return { lines, total, unique: tidms.size };
}

async function crawl() {
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - cached.at < CACHE_HOURS * 3600_000 && Array.isArray(cached.lines)) return cached.lines;
  } catch {}
  // The book is paged by TIDM; a line added or removed during the read
  // shifts the pages, so a read that does not add up is done again.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { lines, total, unique } = await crawlOnce();
    if (lines.length === total && unique === total) {
      if (total < 5000) throw new Error(`the LSE price explorer has only ${total} lines`);
      try {
        fs.writeFileSync(CACHE, JSON.stringify({ at: Date.now(), lines }));
      } catch {}
      return lines;
    }
    console.error(`LSE read ${lines.length} lines (${unique} TIDMs) of ${total}; reading again`);
    await sleep(5000);
  }
  throw new Error("the LSE price explorer did not answer a whole, stable book");
}

// The raw price-explorer lines (TIDM, ISIN, currency, market, searchTag,
// tradingStatus...), as the API answers them; read by the IBKR London pass.
export async function lseLines() {
  return crawl();
}

// Every LSE line that can be bought, as catalogue rows; plus the suspended
// lines and the lines left out (TIDM and reason).
//   markets: LSE market codes kept (MAIN, AIM, ATT, PSM)
//   iob:     keep the International Order Book depositary receipts
export async function lseBook({ markets = MARKETS, iob = true } = {}) {
  const lines = await crawl();
  const today = new Date().toISOString().slice(0, 10);
  const listed = [];
  const suspended = [];
  const leftOut = [];

  for (const line of lines) {
    const tidm = normalize(line.tidm).toUpperCase();
    const tags = (line.searchTag || []).map(normalize);
    const status = normalize(line.tradingStatus);
    const display = normalize(line.instrumentDisplayName);
    const name = normalize(display.startsWith(`${tidm} |`) ? display.slice(tidm.length + 2) : display) || normalize(line.issuerName);
    const isin = normalize(line.isin).toUpperCase();
    const currency = normalize(line.currency).toUpperCase();
    const out = (reason) => leftOut.push(`${tidm} ${reason}`);

    if (!markets.includes(line.marketCode)) continue;
    if (tags.some((tag) => /Trade Reporting Only/i.test(tag))) {
      out("trade reporting only");
      continue;
    }
    if (/^(Suspended|Halted)\b/i.test(status)) {
      suspended.push(`${tidm} ${status}`);
      continue;
    }
    if (!/^Normal\b/i.test(status)) {
      out(`status ${status || "none"}`);
      continue;
    }
    if (!iob && tags.some((tag) => /IOB/.test(tag))) {
      out("International Order Book");
      continue;
    }
    if (CORPORATE_ACTION.test(line.instrumentName || "")) {
      out(`corporate-action line: ${normalize(line.instrumentName)}`);
      continue;
    }
    if (line.firstTradingDate && line.firstTradingDate > today) {
      out(`not trading before ${line.firstTradingDate}`);
      continue;
    }
    if (!isinOk(isin)) {
      out(`ISIN ${isin || "none"}`);
      continue;
    }
    if (!CURRENCIES.has(currency)) throw new Error(`${tidm} trades in ${currency || "no currency"}`);

    let type;
    if (line.typology === "Equity") type = "STOCK";
    else if (line.typology === "ETPs") {
      type = ETP_TAGS.find((tag) => tags.includes(tag));
      if (!type) throw new Error(`${tidm} is an ETP tagged ${tags.join("/") || "nothing"}`);
    } else throw new Error(`${tidm} is typed ${line.typology}`);

    listed.push({
      query: tidm,
      ticker: tidm,
      name,
      exchange: "London Stock Exchange",
      mic: "XLON",
      currency,
      type,
      isin,
      raw: [tidm, name, isin, currency, line.marketName || line.marketCode, tags.join("/"), status].join(" | "),
    });
  }

  listed.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));

  const has = (ticker, type) => listed.some((row) => row.ticker === ticker && row.type === type);
  for (const [ticker, type] of [["BP.", "STOCK"], ["VOD", "STOCK"], ["VUSA", "ETF"], ["SGLN", "ETC"]]) {
    if (markets.includes("MAIN") && !has(ticker, type)) throw new Error(`missing ${ticker} (${type})`);
  }
  const count = (type) => listed.filter((row) => row.type === type).length;
  if (markets.includes("MAIN") && (count("STOCK") < 1000 || count("ETF") < 3000)) {
    throw new Error(`only ${count("STOCK")} shares and ${count("ETF")} ETFs`);
  }
  if (suspended.length > 400) throw new Error(`${suspended.length} lines suspended: the status field changed`);
  return { listed, suspended, leftOut };
}

// The rows only.
export async function lseRows(options = {}) {
  return (await lseBook(options)).listed;
}

// Writes <file> next to the calling scraper (pass import.meta.url as
// `here`). `types` keeps only those row types; `markets` and `iob` as in
// lseBook; `drop(row)` returns true for a row the broker does not sell.
export async function writeLseCatalogue(here, file, { types = ["STOCK", "ETF", "ETN", "ETC"], markets = MARKETS, iob = true, drop = null } = {}) {
  const { listed, suspended, leftOut } = await lseBook({ markets, iob });
  const rows = listed.filter((row) => types.includes(row.type) && !(drop && drop(row)));
  const kept = stampRows(withoutObligations(rows));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  const by = (key) => Object.entries(kept.reduce((acc, row) => ((acc[row[key]] = (acc[row[key]] || 0) + 1), acc), {}))
    .map(([k, n]) => `${n} ${k}`)
    .join(", ");
  console.error(`${kept.length} London lines over ${new Set(kept.map((row) => row.isin)).size} instruments (${by("type")}; ${by("currency")})`);
  console.error(`${suspended.length} suspended or halted lines left out`);
  console.error(`${leftOut.length} other lines left out (trade reporting only, corporate-action lines, no ISIN)`);
  if (listed.length - rows.length) console.error(`${listed.length - rows.length} lines of another type or dropped by the broker's rule`);
  if (rows.length - kept.length) console.error(`${rows.length - kept.length} bonds left out`);
  return kept;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { listed, suspended, leftOut } = await lseBook();
  const by = (key) => listed.reduce((acc, row) => ((acc[row[key]] = (acc[row[key]] || 0) + 1), acc), {});
  console.log(JSON.stringify({ rows: listed.length, byType: by("type"), byCurrency: by("currency"), suspended: suspended.length, leftOut: leftOut.length }, null, 1));
  console.log("suspended:", suspended.join("; "));
  console.log("left out:", leftOut.join("; "));
}
