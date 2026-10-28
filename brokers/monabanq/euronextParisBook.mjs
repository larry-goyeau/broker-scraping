// The Euronext Paris book, for the French banks whose only place is
// Euronext Paris and which print no list of their own (Monabanq, Banque
// Chalus). The book is every share, ETF, ETC and ETN line Euronext's own
// product directory lists on the Paris regulated market, minus the lines
// Euronext's halt list shows suspended, minus warrants and subscription
// rights, minus a line that has never traded.
//
// Source, public, no login: the "Download" button of Euronext's product
// directory, one semicolon file per product family and MIC, with name,
// ISIN, symbol, market, trading currency, the last session's prices and
// the last closing price:
//   https://live.euronext.com/en/markets/paris/equities/list
//   https://live.euronext.com/en/pd_es/data/stocks/download?mics=XPAR   (shares)
//   https://live.euronext.com/en/pd_es/data/track/download?mics=XPAR    (ETFs)
//   https://live.euronext.com/en/pd_es/data/etv/download?mics=XPAR      (ETCs, ETNs)
// and the halt list Euronext prints on "Suspended instruments - current",
// filled from a JSON feed of every halted line on every Euronext market:
//   https://live.euronext.com/en/resources/market-events/suspended/current
//   https://live.euronext.com/en/ajax/haltedInstrument/getAjax/current
//
// Kept (exchange "Euronext Paris", MIC XPAR, as the IBKR, Bourse Direct and
// Easybroker scrapers write Paris):
// - Every share of the regulated market, French or foreign (Airbus,
//   ArcelorMittal, Aperam, STMicroelectronics...), with the lines Paris
//   shares with Amsterdam or Brussels ("Euronext Paris, Amsterdam"): one
//   row, on Paris. Certificats coopératifs d'investissement (the CRCAM
//   "CCI" lines) and Robertet's CI / CDV certificates are equity and stay.
//   Type STOCK.
// - Every ETF of the Paris trackers list. Type ETF.
// - Every ETV (Euronext's word for ETCs and ETNs). The file does not give
//   the kind: a name that says ETN or ETC is that; a crypto note
//   (21Shares, Valour, SEBA, VanEck, WisdomTree crypto, CoinShares...) is
//   an ETN; a gold, silver, oil, metal or other commodity line is an ETC;
//   the rest (WisdomTree 3x index notes) is an ETN. Type ETC or ETN.
// Every kept line trades in EUR on XPAR (checked: a non-EUR XPAR line
// stops the run).
// Left out:
// - A line on the halt list with no resumption yet (or a resumption still
//   to come). The halt list is read each run; on 24 October 2026 it held
//   no XPAR share or ETP (one Growth line, Amoeba's DS, and one Access
//   line, Amatheon Agri, which are other places anyway).
// - Warrants and subscription rights the share file mixes in: names with
//   BSA, WARRANT, DS or DPS (AB Science BSA, Casino BSA1 / BSA3, Deezer
//   warrants, Pierre & Vacances BSA, Younited warrants, Arverne warrant).
// - A line with neither a last price nor a closing price: never traded.
// - Euronext Growth Paris (ALXP) and Euronext Access Paris (XMLI): Euronext
//   runs them as separate markets and broker-list.json files them as their
//   own places. `growth: true` / `access: true` add them, as exchange
//   "Euronext Growth Paris" / "Euronext Access Paris" (the repo's labels),
//   for a broker whose pages say it routes there.
// - Euronext Paris Multi-currency Trading (XPMC): the USD, GBP, CHF, JPY,
//   HKD twins of some Paris shares and ETFs (Accor USD, Eiffage USD, ~70
//   ETF lines). `multiCurrency: true` adds them (exchange "Euronext Paris",
//   MIC XPMC, their own currency), for a broker that names them.
// - Funds (Euronext Fund Service, not exchange-traded) and bonds: not read.
//
// Four downloads (seven with every option), a pause between each; the
// halt feed is about 4 MB (mostly warrants); no cache needed.
//
// Use:
//   import { writeParisCatalogue } from "../monabanq/euronextParisBook.mjs";
//   await writeParisCatalogue(import.meta.url, "monabanq-parsed.json");
//   // options: { types: ["STOCK", "ETF", "ETC", "ETN"], growth: false, access: false, multiCurrency: false }
//   // or: const { listed, suspended, idle, leftOut } = await parisBook();
//
//   node brokers/monabanq/euronextParisBook.mjs     (prints the counts, writes nothing)
//   node brokers/monabanq/euronextParisBook.mjs --growth --access --multi-currency

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "https://live.euronext.com/en/pd_es/data/";
const HALTED = "https://live.euronext.com/en/ajax/haltedInstrument/getAjax/current";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FILES = { stocks: "STOCK", track: "ETF", etv: "ETV" };
const MARKETS = {
  XPAR: { exchange: "Euronext Paris", market: /^Euronext (Paris|Amsterdam|Brussels)(, (Paris|Amsterdam|Brussels))*$/, files: ["stocks", "track", "etv"] },
  ALXP: { exchange: "Euronext Growth Paris", market: /^Euronext Growth (Paris|Brussels)(, (Paris|Brussels))*$/, files: ["stocks"] },
  XMLI: { exchange: "Euronext Access Paris", market: /^Euronext Access Paris$/, files: ["stocks"] },
  XPMC: { exchange: "Euronext Paris", market: /^Euronext Paris - Multi-currency Trading$/, files: ["stocks", "track", "etv"] },
};
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
// Warrants (BSA, BSAAR, "BS" when Euronext cuts the name short), rights
// (DS, DPS, droits).
const NOT_A_SHARE = /\bBSA|\bBS$|\bWARR|\bDROITS?\b|\bDPS\b|\bDS\d*$/i;
const CRYPTO = /^(21S|VALOUR|SEBA|VE |AMINA|DDA|CSPHYSICAL|WISDOMTREE |WT CRYPTO)|BITCOIN|\bBTC|ETHER|\bETH\b|SOLANA|CARDANO|POLKADOT|\bDOT\b|\bXRP\b|\bTRON\b|LTCETC|ETHETC/i;
const COMMODITY = /GOLD|SILVER|PLATIN|PALLAD|PHYS|PRECIOUS|METAL|COPPER|CRUDE|\bOIL\b|BRENT|NATURAL GAS|WHEAT|AGRICULT|COMMODIT|CARBON/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

async function get(url, as = "text") {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await sleep(5000 * attempt);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", Referer: "https://live.euronext.com/en/markets/paris/equities/list" },
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) {
        last = `${response.status} ${url}`;
        continue;
      }
      return as === "json" ? await response.json() : await response.text();
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
  }
  throw new Error(last);
}

function cells(line) {
  return [...line.matchAll(/("([^"]|"")*"|[^;]*)(;|$)/g)].map((match) => match[1].replace(/^"|"$/g, "").replace(/""/g, '"').trim()).slice(0, -1);
}

// One Euronext download as objects keyed by its header.
async function download(file, mic) {
  const lines = (await get(`${BASE}${file}/download?mics=${mic}`)).replace(/^﻿/, "").split(/\r?\n/);
  const header = cells(lines[0] || "");
  for (const column of ["Name", "ISIN", "Symbol", "Market", "Currency", "last Price", "Closing Price"]) {
    if (!header.includes(column)) throw new Error(`Euronext ${file} ${mic}: no "${column}" column (${lines[0]})`);
  }
  const out = [];
  for (const line of lines.slice(1)) {
    const row = cells(line);
    if (row.length < header.length - 1 || !ISIN.test(row[header.indexOf("ISIN")] || "")) continue;
    out.push(Object.fromEntries(header.map((column, i) => [column, row[i] ?? ""])));
  }
  return out;
}

// "MIC ISIN" -> { name, symbol, halted, reason } for every line halted now.
async function haltedLines() {
  const body = await get(HALTED, "json");
  if (!Array.isArray(body?.data)) throw new Error("Euronext halt list: no data");
  if (body.data.length < 100) throw new Error(`Euronext halt list has only ${body.data.length} lines`);
  const now = Date.now();
  const out = new Map();
  for (const raw of body.data) {
    const [halted, mic, , , isin, name, symbol, , category, reason, resumption] = raw.map(clean);
    const date = resumption.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
    if (date) {
      const [, d, m, y, hh, mm] = date;
      // Paris time, give or take the summer hour: a resumption that is
      // already behind us means the line trades again.
      if (Date.UTC(+y, m - 1, +d, hh - 1, +mm) < now) continue;
    }
    out.set(`${mic} ${isin}`, { name, symbol, category, reason, halted: halted.slice(0, 10) });
  }
  return out;
}

function etvKind(name) {
  if (/ETN/i.test(name)) return "ETN";
  if (/ETC/i.test(name)) return "ETC";
  if (CRYPTO.test(name)) return "ETN";
  if (COMMODITY.test(name)) return "ETC";
  return "ETN";
}

export async function parisBook({ growth = false, access = false, multiCurrency = false } = {}) {
  const mics = ["XPAR", ...(growth ? ["ALXP"] : []), ...(access ? ["XMLI"] : []), ...(multiCurrency ? ["XPMC"] : [])];
  const reads = [];
  for (const mic of mics) {
    for (const file of MARKETS[mic].files) {
      reads.push({ mic, file, lines: await download(file, mic) });
      await sleep(2000);
    }
  }
  const halted = await haltedLines();

  const listed = [];
  const suspended = [];
  const idle = [];
  const leftOut = [];
  const seen = new Set();
  for (const { mic, file, lines } of reads) {
    const { exchange, market } = MARKETS[mic];
    for (const line of lines) {
      const ticker = clean(line.Symbol);
      const isin = clean(line.ISIN).toUpperCase();
      const name = clean(line.Name);
      const currency = clean(line.Currency);
      const label = `${ticker} ${name} (${isin})`;
      if (!market.test(clean(line.Market))) throw new Error(`${label} in the ${mic} ${file} file is on "${line.Market}"`);
      if (mic !== "XPMC" && currency !== "EUR") throw new Error(`${label} on ${mic} trades in ${currency || "nothing"}`);
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`${label} on ${mic} has currency "${currency}"`);
      if (file === "stocks" && NOT_A_SHARE.test(name)) {
        leftOut.push(`${label} on ${mic}: warrant or right`);
        continue;
      }
      const stop = halted.get(`${mic} ${isin}`);
      if (stop) {
        suspended.push({ ticker, name, isin, mic, since: stop.halted, reason: stop.reason });
        continue;
      }
      const priced = (value) => clean(value) && clean(value) !== "-";
      if (!priced(line["last Price"]) && !priced(line["Closing Price"])) {
        idle.push({ ticker, name, isin, mic });
        continue;
      }
      const key = `${mic} ${isin} ${currency}`;
      if (seen.has(key)) {
        leftOut.push(`${label}: twice on ${mic}`);
        continue;
      }
      seen.add(key);
      const type = FILES[file] === "ETV" ? etvKind(name) : FILES[file];
      listed.push({
        query: ticker,
        ticker,
        name,
        exchange,
        mic,
        currency,
        type,
        isin,
        raw: `${ticker} | ${name} | ${clean(line.Market)} | ${currency} | ${isin} | Euronext ${file}`,
      });
    }
  }

  listed.sort((left, right) => left.mic.localeCompare(right.mic) || left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));

  // Sanity: the big names are there, counts hold.
  const has = (ticker, mic = "XPAR") => listed.some((row) => row.ticker === ticker && row.mic === mic);
  for (const ticker of ["MC", "OR", "TTE", "AIR", "SAN", "BNP", "MT", "CW8", "C40", "PAEEM", "GOLD", "WBTC"]) if (!has(ticker)) throw new Error(`${ticker} missing on XPAR`);
  const count = (mic, type) => listed.filter((row) => row.mic === mic && (!type || row.type === type)).length;
  if (count("XPAR", "STOCK") < 250) throw new Error(`only ${count("XPAR", "STOCK")} Paris shares`);
  if (count("XPAR", "ETF") < 500) throw new Error(`only ${count("XPAR", "ETF")} Paris ETFs`);
  if (count("XPAR") - count("XPAR", "STOCK") - count("XPAR", "ETF") < 80) throw new Error("fewer than 80 Paris ETCs and ETNs");
  if (growth && count("ALXP") < 200) throw new Error(`only ${count("ALXP")} Growth Paris lines`);
  if (access && count("XMLI") < 80) throw new Error(`only ${count("XMLI")} Access Paris lines`);
  if (suspended.length > 40) throw new Error(`${suspended.length} lines read as suspended`);
  if (idle.length > 30) throw new Error(`${idle.length} lines read as never traded: ${idle.map((line) => line.ticker).join(" ")}`);
  return { listed, suspended, idle, leftOut };
}

// Writes <file> next to the calling scraper. `types` keeps only those row
// types (["STOCK"] for a broker that sells no ETP); `growth`, `access`,
// `multiCurrency` add those Paris markets.
export async function writeParisCatalogue(here, file, { types = ["STOCK", "ETF", "ETC", "ETN"], growth = false, access = false, multiCurrency = false } = {}) {
  const book = await parisBook({ growth, access, multiCurrency });
  const rows = book.listed.filter((row) => types.includes(row.type)).map((row) => ({ ...row }));
  const kept = stampRows(withoutObligations(rows));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  report(book, kept);
  return kept;
}

function report(book, kept) {
  const counts = {};
  for (const row of kept) {
    const key = `${row.mic} ${row.type}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  console.error(`${kept.length} Euronext Paris lines ${JSON.stringify(counts)}`);
  console.error(`${book.suspended.length} suspended left out${book.suspended.length ? ": " : ""}${book.suspended.map((line) => `${line.ticker} (${line.mic}, since ${line.since}, ${line.reason})`).join(", ")}`);
  if (book.idle.length) console.error(`never traded, left out: ${book.idle.map((line) => `${line.ticker} (${line.mic})`).join(", ")}`);
  if (book.leftOut.length) console.error(`left out: ${book.leftOut.join(", ")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const book = await parisBook({
    growth: process.argv.includes("--growth"),
    access: process.argv.includes("--access"),
    multiCurrency: process.argv.includes("--multi-currency"),
  });
  report(book, book.listed);
}
