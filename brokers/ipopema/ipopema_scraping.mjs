// IPOPEMA sells what is listed on the Warsaw Stock Exchange. The account
// page says every instrument on the GPW: shares, ETFs, closed-end fund
// certificates and structured products. The service order in force is
// narrower and is the one followed here: the regulated market and
// NewConnect, in zloty and in euro, and not futures, options or warrants.
// BondSpot is in that order too. Those lines are bonds, so they stay out.
// A structured note that is a bond stays out the same way.
//
// There is no IPOPEMA list. The rows are the three cash boards Bankier
// prints for that market. A quote that is not in zloty or euro is not a
// cash line and is left out. The ticker is the short name in the heading,
// not the board's symbol.
//
//   https://ipopemasecurities.pl/klienci-prywatni/rachunki-maklerskie/
//   https://www.bankier.pl/gielda/notowania/akcje
//   https://www.bankier.pl/gielda/notowania/new-connect
//   https://www.bankier.pl/etf/notowania
//
//   node brokers/ipopema/ipopema_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const SHARE_BOARD = "https://www.bankier.pl/gielda/notowania/akcje";
const NC_BOARD = "https://www.bankier.pl/gielda/notowania/new-connect";
const ETF_BOARD = "https://www.bankier.pl/etf/notowania";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(text) ? text : "";
}

function currencyOf(unit) {
  const text = normalize(unit).toLowerCase();
  if (text === "zł" || text === "zl" || text === "pln") return "PLN";
  if (text === "eur" || text === "€" || text === "euro") return "EUR";
  return "";
}

function productOf(ticker) {
  if (/^ETC/i.test(ticker)) return "ETC";
  if (/^ETN/i.test(ticker)) return "ETN";
  return "ETF";
}

function boardSymbols(html) {
  const body = html.split("<tbody>").at(-1)?.split("</tbody>")[0] ?? "";
  const symbols = [];
  const seen = new Set();
  for (const match of body.matchAll(/quote\.html\?symbol=([^"&]+)/g)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    symbols.push(match[1]);
  }
  return symbols;
}

async function board(url, label) {
  const response = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(40_000) });
  if (!response.ok) throw new Error(`${label} answered ${response.status}`);
  const symbols = boardSymbols(await response.text());
  if (!symbols.length) throw new Error(`${label} has no symbols`);
  return symbols;
}

async function profileHead(symbol) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response;
    try {
      response = await fetch(
        `https://www.bankier.pl/inwestowanie/profile/quote.html?symbol=${encodeURIComponent(symbol)}`,
        { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) }
      );
    } catch (error) {
      last = `${symbol} profile ${error.message}`;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      continue;
    }
    if (!response.ok) {
      last = `${symbol} profile answered ${response.status}`;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      continue;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    let html = "";
    while (size < 400_000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
      html = Buffer.concat(chunks).toString("utf8");
      if (html.includes("data-isin=") && html.includes("data-unit=") && html.includes("a-heading__suffix")) break;
    }
    await reader.cancel();
    return html;
  }
  throw new Error(last || `${symbol} profile did not answer`);
}

function profileRow(html, symbol, exchange, type) {
  const isin = toIsin(html.match(/data-isin="([^"]+)"/)?.[1]);
  const currency = currencyOf(html.match(/data-unit="([^"]+)"/)?.[1]);
  if (!isin || !currency) return null;
  const suffix = normalize(html.match(/a-heading__suffix[^"]*">([^<]+)/)?.[1]);
  const wrapped = suffix.match(/^(.*)\(([^)]+)\)\s*$/);
  const ticker = normalize(wrapped ? wrapped[2] : symbol).toUpperCase();
  const name = normalize(wrapped ? wrapped[1] : suffix) || ticker;
  if (!ticker) return null;
  if (/\bwarrant\b/i.test(name)) return null;
  return {
    query: isin,
    ticker,
    name,
    exchange,
    currency,
    type,
    raw: [ticker, name, exchange, currency, type].filter(Boolean).join(" "),
    isin,
  };
}

async function listings() {
  const [shares, nc, etf] = await Promise.all([
    board(SHARE_BOARD, "GPW share board"),
    board(NC_BOARD, "NewConnect board"),
    board(ETF_BOARD, "GPW ETF board"),
  ]);
  const jobs = [
    ...shares.map((symbol) => ({ symbol, exchange: "GPW", type: "STOCK" })),
    ...nc.map((symbol) => ({ symbol, exchange: "NewConnect", type: "STOCK" })),
    ...etf.map((symbol) => ({ symbol, exchange: "GPW", type: productOf(symbol) })),
  ];
  console.error(`boards: ${shares.length} GPW, ${nc.length} NewConnect, ${etf.length} ETF`);
  const rows = [];
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;
      const html = await profileHead(job.symbol);
      const row = profileRow(html, job.symbol, job.exchange, job.type);
      if (row) rows.push(row);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  return rows;
}

const seen = new Set();
const results = [];
for (const row of await listings()) {
  const key = `${row.isin}:${row.exchange}:${row.currency}`;
  if (seen.has(key)) continue;
  seen.add(key);
  results.push(row);
}
results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(right.ticker);
});

const kept = stampRows(withoutObligations(results));
const outputPath = new URL("ipopema-parsed.json", import.meta.url);
fs.writeFileSync(outputPath, JSON.stringify(kept, null, 2));

const byBook = new Map();
for (const row of kept) {
  const label = `${row.exchange} ${row.type}`;
  byBook.set(label, (byBook.get(label) || 0) + 1);
}
console.error(
  `${kept.length} listings over ${new Set(kept.map((row) => row.isin)).size} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ") || "none"})`
);
if (kept.length < results.length) console.error(`${results.length - kept.length} bonds left out`);
