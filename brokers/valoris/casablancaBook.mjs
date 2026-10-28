// The Casablanca Stock Exchange book, for the brokers whose online order is
// every line of the Casablanca cash market (Valoris Securities, Sogecapital
// Bourse). The exchange's own pages are read, no login:
//
// - the instrument page lists every listed share with its ISIN (category
//   "ACTIONS 1ERE LIGNE": the first-line shares; rights are on another page);
// - the live market share page gives each share's session status: T
//   (traded), NT (not traded this session) or S (suspended). A suspended
//   share stays out: today SAMIR, Delattre Levivier Maroc and Diac Salaf,
//   halted for years and in liquidation. A share not traded this session is
//   only illiquid and stays in.
// - the live market ETF page is the exchange's ETF list. It prints "Aucune
//   donnée disponible": Casablanca lists no ETF today. If that page ever
//   carries data, the run stops so the ETFs get read.
//
// Rights (droits), bonds, futures and funds are other pages and stay out.
// Every line trades in MAD on XCAS.
//
//   https://www.casablanca-bourse.com/marches-produits/actions
//   https://www.casablanca-bourse.com/live-market/actions
//   https://www.casablanca-bourse.com/live-market/etf
//
// Use from a scraper:
//   import { writeCasablancaCatalogue } from "../valoris/casablancaBook.mjs";
//   await writeCasablancaCatalogue(import.meta.url, "<folder>-parsed.json");
// or `casablancaBook()` for { listed, suspended, leftOut }.

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const exec = promisify(execFile);
const SITE = "https://www.casablanca-bourse.com";
const INSTRUMENTS = `${SITE}/marches-produits/actions`;
const LIVE_SHARES = `${SITE}/live-market/actions`;
const LIVE_ETF = `${SITE}/live-market/etf`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The exchange chain is missing from Node's certificate store. curl uses
// the system store, which does hold it.
async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const { stdout } = await exec("curl", ["-fsSL", "--max-time", "30", "-A", UA, url], { maxBuffer: 8_000_000, encoding: "utf8" });
      return stdout;
    } catch (error) {
      last = String(error.stderr || error.message || error).trim();
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last || url);
}

function settingsOf(html, url) {
  const match = html.match(/<script type="application\/json" data-drupal-selector="drupal-settings-json">(.*?)<\/script>/s);
  if (!match) throw new Error(`${url} has no settings block`);
  return JSON.parse(match[1]);
}

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

// Every listed Casablanca share that is not suspended, as catalogue rows
// sorted by ticker; plus the suspended tickers and the lines left out.
export async function casablancaBook() {
  const instruments = settingsOf(await getText(INSTRUMENTS), INSTRUMENTS)?.boursenova?.actions;
  await sleep(1000);
  const live = settingsOf(await getText(LIVE_SHARES), LIVE_SHARES)?.live_market?.actions;
  await sleep(1000);
  const etfHtml = await getText(LIVE_ETF);

  if (!Array.isArray(instruments) || instruments.length < 70) throw new Error(`the instrument page printed ${instruments?.length ?? 0} shares`);
  if (!Array.isArray(live) || live.length < 70) throw new Error(`the live market printed ${live?.length ?? 0} shares`);

  // The ETF page is empty today. Stop if it carries anything.
  const etfMarket = settingsOf(etfHtml, LIVE_ETF)?.live_market || {};
  // ticker is the scrolling share band, session the market clock, movers
  // the share movers: page furniture, not ETF data.
  const etfKeys = Object.keys(etfMarket).filter((key) => !["ticker", "session", "movers"].includes(key));
  if (!/id="empty-text"[^>]*>\s*Aucune donn/.test(etfHtml) || etfKeys.length) {
    throw new Error(`the Casablanca ETF page now carries data (${etfKeys.join(", ") || "no empty state"}): read the ETFs`);
  }

  const status = new Map();
  for (const line of live) {
    const ticker = clean(line.symbol).toUpperCase();
    const code = clean(line.statut?.fr ?? line.statut).toUpperCase();
    if (!ticker) throw new Error(`unreadable live line ${JSON.stringify(line).slice(0, 200)}`);
    if (!["T", "NT", "S"].includes(code)) throw new Error(`${ticker} has status ${JSON.stringify(line.statut)}`);
    status.set(ticker, code);
  }

  const listed = [];
  const suspended = [];
  const leftOut = [];
  const seen = new Set();
  for (const row of instruments) {
    const kind = clean(row.categorie).toUpperCase();
    const ticker = clean(row.ticker).toUpperCase();
    const isin = clean(row.codeISIN).toUpperCase();
    const name = clean(row.emetteur || row.instrument);
    if (kind !== "ACTIONS 1ERE LIGNE") throw new Error(`${ticker} is ${kind || "unmarked"}, not a share`);
    if (!/^[A-Z0-9]{2,6}$/.test(ticker) || !name) throw new Error(`unreadable listing ${JSON.stringify(row).slice(0, 200)}`);
    if (!/^MA[A-Z0-9]{9}[0-9]$/.test(isin)) throw new Error(`no ISIN for ${ticker}`);
    if (seen.has(ticker) || seen.has(isin)) throw new Error(`repeated ${ticker} ${isin}`);
    seen.add(ticker);
    seen.add(isin);
    const code = status.get(ticker);
    if (!code) {
      leftOut.push(`${ticker} not on the live market`);
      continue;
    }
    if (code === "S") {
      suspended.push(ticker);
      continue;
    }
    listed.push({
      query: ticker,
      ticker,
      name,
      exchange: "Casablanca",
      mic: "XCAS",
      currency: "MAD",
      type: "STOCK",
      isin,
      raw: [ticker, name, "Casablanca", isin, "STOCK"].join(" "),
    });
  }
  for (const ticker of status.keys()) {
    if (!seen.has(ticker)) leftOut.push(`${ticker} on the live market only, no ISIN`);
  }

  listed.sort((left, right) => left.ticker.localeCompare(right.ticker));
  suspended.sort();
  for (const ticker of ["ATW", "IAM", "BCP", "LHM", "MNG"]) {
    if (!listed.some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
  }
  if (suspended.length > 10) throw new Error(`${suspended.length} shares suspended: the status field changed meaning`);
  if (leftOut.length > 5) throw new Error(`${leftOut.length} lines left out: ${leftOut.join(", ")}`);
  if (leftOut.length) console.error(`${leftOut.length} lines left out: ${leftOut.join(", ")}`);
  return { listed, suspended, leftOut };
}

// Writes <file> next to the calling scraper (`here` is its import.meta.url).
export async function writeCasablancaCatalogue(here, file) {
  const { listed, suspended } = await casablancaBook();
  const kept = stampRows(withoutObligations(listed.map((row) => ({ ...row }))));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  console.error(`${kept.length} listings (${kept.length} STOCK; Casablanca ${kept.length}); Casablanca lists no ETF`);
  console.error(`${suspended.length} suspended left out: ${suspended.join(", ") || "none"}`);
  if (kept.length < listed.length) console.error(`${listed.length - kept.length} bonds left out`);
  return kept;
}
