// ALOR Broker publishes its instrument directory through the open market
// data API that feeds its Astras terminal (docs at alor.dev). No login or
// token is needed for the securities list. Two exchanges are read:
//
//   https://api.alor.ru/md/v2/Securities?exchange=MOEX&sector=FOND&cficode=E&limit=5000&offset=0
//   https://api.alor.ru/md/v2/Securities?exchange=SPBX&limit=5000&offset=0
//
// Moscow Exchange: the equity CFI lines of the T+ boards are kept: TQBR
// (shares, depositary receipts, exchange funds), TQTF (ETFs), TQIF (fund
// units), FQBR (foreign shares) and the dollar/euro fund boards. MTQR is
// the MOEX OTC platform ("OTC: shares T+"), not the exchange book, and is
// left out. A unit whose short name says ETF (a BPIF) is an ETF; the other
// mutual, interval and closed-end funds (OPIF, IPIF, ZPIF) are FUND.
//
// SPB Exchange: the board mixes every asset class, so the CFI code decides:
// E* is a share, CE* an exchange fund, CI* a closed-end fund. Bonds (D*),
// the perpetual futures on crypto and US names (currency "USD1"/"USD2",
// no CFI) and other codes are left out. SPB writes "@" after the MOEX ETF
// tickers it relists; the ticker is stored without it.
//
// Only lines in a trading state are kept. Status 2 ("break in trading")
// marks the frozen books (FinEx funds, the blocked US and Hong Kong names
// on SPB since the November 2023 sanctions) and 18 ("no trading") the
// delisted lines. Because of that, the scraper must run while the exchanges
// are open (MOEX runs about 06:50-23:50 Moscow time); outside those hours
// the floors below throw.
//
// The API answers HTTP 429 to quick bursts, so requests are spaced and
// retried with a back-off.
//
//   node brokers/alor/alor_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const API = "https://api.alor.ru/md/v2/Securities";
const LIMIT = 5000;
const LIVE = new Set([17, 119]); // normal trading, opening auction
const MOEX_BOARDS = new Set(["TQBR", "TQTF", "TQIF", "TQPI", "FQBR", "TQFD", "TQTD", "TQTE"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
      if (response.status === 429) await sleep(5000 * (attempt + 1));
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

async function load(query) {
  const found = [];
  for (let offset = 0; ; offset += LIMIT) {
    if (offset > 50_000) throw new Error(`${query} did not end`);
    const page = await getJson(`${API}?${query}&limit=${LIMIT}&offset=${offset}`);
    if (!Array.isArray(page)) throw new Error(`${query} answered ${JSON.stringify(page).slice(0, 200)}`);
    found.push(...page);
    if (page.length < LIMIT) break;
    await sleep(3000);
  }
  return found;
}

const moex = await load("exchange=MOEX&sector=FOND&cficode=E");
await sleep(3000);
const spbx = await load("exchange=SPBX");

const rows = [];
const left = new Map();
function leave(reason) {
  left.set(reason, (left.get(reason) || 0) + 1);
}

function push(item, exchange, mic, type, ticker) {
  const isin = normalize(item.ISIN).toUpperCase();
  rows.push({
    query: ticker,
    ticker,
    name: normalize(item.description) || normalize(item.shortname),
    exchange,
    mic,
    currency: normalize(item.currency).toUpperCase(),
    type,
    isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : "",
    raw: [item.symbol, item.shortname, item.description, item.ISIN, item.board, item.type, item.cfiCode, item.currency, item.tradingStatus, item.tradingStatusInfo]
      .map(normalize)
      .join(" | "),
  });
}

for (const item of moex) {
  if (item.exchange !== "MOEX") throw new Error(`MOEX list holds ${item.symbol} on ${item.exchange}`);
  if (!MOEX_BOARDS.has(item.board)) {
    leave(`MOEX ${item.board}`);
    continue;
  }
  if (!LIVE.has(item.tradingStatus)) {
    leave(`MOEX status ${item.tradingStatus}`);
    continue;
  }
  if (!/^[A-Z]{3}$/.test(normalize(item.currency))) throw new Error(`${item.symbol} is quoted ${item.currency}`);
  let type = "";
  if (item.type === "CS" || item.type === "PS" || item.type === "RDR") type = "STOCK";
  else if (item.type === "ETF") type = "ETF";
  else if (item.type === "MF" || item.type === "COFP") type = /\bETF\b/i.test(item.shortname) ? "ETF" : "FUND";
  if (!type) throw new Error(`MOEX ${item.symbol} has type ${item.type}`);
  push(item, "Moscow Exchange", "MISX", type, normalize(item.symbol));
}

for (const item of spbx) {
  if (item.exchange !== "SPBX") throw new Error(`SPBX list holds ${item.symbol} on ${item.exchange}`);
  if (!LIVE.has(item.tradingStatus)) {
    leave(`SPBX status ${item.tradingStatus}`);
    continue;
  }
  const cfi = normalize(item.cfiCode);
  const currency = normalize(item.currency);
  if (!/^[A-Z]{3}$/.test(currency) || /PERP/.test(item.symbol)) {
    leave("SPBX perpetual future");
    continue;
  }
  const type = /^E/.test(cfi) ? "STOCK" : /^CE/.test(cfi) ? "ETF" : /^CI/.test(cfi) ? "FUND" : "";
  if (!type) {
    leave(`SPBX CFI ${cfi.slice(0, 2)}`);
    continue;
  }
  push(item, "SPB Exchange", "XPET", type, normalize(item.symbol).replace(/@$/, ""));
}

const seen = new Set();
for (const row of rows) {
  const key = `${row.isin || row.ticker}|${row.mic}|${row.currency}`;
  if (seen.has(key)) throw new Error(`${key} twice`);
  seen.add(key);
}

const count = (mic, type) => rows.filter((row) => row.mic === mic && row.type === type).length;
if (count("MISX", "STOCK") < 200) throw new Error(`only ${count("MISX", "STOCK")} MOEX shares: run while MOEX trades`);
if (count("MISX", "ETF") < 100) throw new Error(`only ${count("MISX", "ETF")} MOEX ETFs`);
if (count("XPET", "STOCK") < 100) throw new Error(`only ${count("XPET", "STOCK")} SPB shares: run while SPB trades`);
if (count("XPET", "ETF") < 5) throw new Error(`only ${count("XPET", "ETF")} SPB ETFs`);
for (const [mic, isin, label] of [
  ["MISX", "RU0009029540", "Sberbank on MOEX"],
  ["MISX", "RU0009024277", "Lukoil on MOEX"],
  ["MISX", "RU000A101X76", "TMOS ETF on MOEX"],
  ["XPET", "RU0007661625", "Gazprom on SPB"],
]) {
  if (!rows.some((row) => row.mic === mic && row.isin === isin)) throw new Error(`${label} is missing`);
}

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker));
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("alor-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(counts);
console.error("left out:", Object.fromEntries(left));
