// What DM BDM sells. The foreign book is two public tables. A share row
// is an ISIN, a venue, a name, a Bloomberg ticker and a settlement
// currency. The fund table adds the product. A receipt stays out. The
// ticker drops the suffix the table appends (US, GR, LN, and the odd
// OLD / USD / UA tails). NYS is the NYSE, NAS is Nasdaq, FRA is Xetra.
//
//   https://portal.bdm.pl/instrumenty-zagraniczne-akcje
//   https://portal.bdm.pl/instrumenty-zagraniczne-etf-etc-etn
//
// Warsaw is not in those tables. The client note names the markets the
// orders go to: the main GPW board, the parallel board, NewConnect and
// GlobalConnect. The rows added here are those cash boards, and only
// where the quote is in zloty. Bankier tags every Warsaw ETP as "etf";
// the symbol prefix is the product. GlobalConnect prints the short name
// and not the ISIN. The ticker and the ISIN are the Stooq quote for that
// line, read on 2026-10-06. A short name on the board that is not in
// that set is an error. A name that has left the board is left out.
//
//   https://www.bankier.pl/gielda/notowania/akcje
//   https://www.bankier.pl/gielda/notowania/new-connect
//   https://www.bankier.pl/gielda/notowania/etf
//   https://www.bankier.pl/gielda/notowania/global-connect
//   https://www.bdm.pl/o-nas/o-domu-maklerskim-bdm/zasady-mifid-fatca-skargi-sprawozdania-i-dokumenty-archiwalne?file=files%2Fbdm%2Fo_nas%2Fmifid%2Finformacje_o_dm_bdm_pok.pdf
//
//   node brokers/bdm/bdm_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const SHARES = "https://portal.bdm.pl/instrumenty-zagraniczne-akcje";
const FUNDS = "https://portal.bdm.pl/instrumenty-zagraniczne-etf-etc-etn";
const SHARE_BOARD = "https://www.bankier.pl/gielda/notowania/akcje";
const NC_BOARD = "https://www.bankier.pl/gielda/notowania/new-connect";
const ETF_BOARD = "https://www.bankier.pl/gielda/notowania/etf";
const GC_BOARD = "https://www.bankier.pl/gielda/notowania/global-connect";

// Short name on the Bankier board, ticker and ISIN on the Stooq quote.
const GLOBAL_CONNECT = [
  ["ADIDAS", "ADS", "DE000A1EWWW0", "Adidas", "STOCK"],
  ["ADVANCED", "AMD", "US0079031078", "Advanced", "STOCK"],
  ["ALLIANZ", "ALV", "DE0008404005", "Allianz", "STOCK"],
  ["ALPHABET", "GOGL", "US02079K3059", "Alphabet", "STOCK"],
  ["AMAZON", "AMZN", "US0231351067", "Amazon", "STOCK"],
  ["APPLE", "AAPL", "US0378331005", "Apple", "STOCK"],
  ["ASML", "ASML", "NL0010273215", "ASML", "STOCK"],
  ["BAYER", "BAY", "DE000BAY0017", "Bayer", "STOCK"],
  ["BERKSHIRE", "BRKB", "US0846707026", "Berkshire", "STOCK"],
  ["BMW", "BMW", "DE0005190003", "BMW", "STOCK"],
  ["BOEING", "BOEG", "US0970231058", "Boeing", "STOCK"],
  ["CARLSBERG", "CARL", "DK0010181759", "Carlsberg", "STOCK"],
  ["COCACOLA", "COLA", "US1912161007", "Cocacola", "STOCK"],
  ["ELILILLY", "LILY", "US5324571083", "Elililly", "STOCK"],
  ["EXXONMOB", "EXXN", "US30233Q1085", "Exxonmob", "STOCK"],
  ["HANDM", "HANM", "SE0000106270", "Handm", "STOCK"],
  ["INDITEX", "ITX", "ES0148396007", "Inditex", "STOCK"],
  ["INPOST", "INPT", "LU2290522684", "Inpost", "STOCK"],
  ["INTEL", "INTL", "US4581401001", "Intel", "STOCK"],
  ["JERONIMO", "JMT", "PTJMT0AE0001", "Jeronimo", "STOCK"],
  ["JPMORGAN", "JPM", "US46625H1005", "Jpmorgan", "STOCK"],
  ["MCDONALDS", "MCDL", "US5801351017", "Mcdonalds", "STOCK"],
  ["MERCEDES", "MBG", "DE0007100000", "Mercedes", "STOCK"],
  ["META", "META", "US30303M1027", "META", "STOCK"],
  ["MICRONTEC", "MCRN", "US5951121038", "Microntec", "STOCK"],
  ["MICROSOFT", "MSFT", "US5949181045", "Microsoft", "STOCK"],
  ["NETFLIX", "NFLX", "US64110L1061", "Netflix", "STOCK"],
  ["NIKE", "NIKE", "US6541061031", "NIKE", "STOCK"],
  ["NVIDIA", "NVDA", "US67066G1040", "Nvidia", "STOCK"],
  ["NVONORDSK", "NVO", "DK0062498333", "Nvonordsk", "STOCK"],
  ["ORACLE", "ORCL", "US68389X1054", "Oracle", "STOCK"],
  ["PALANTIR", "PLTR", "US69608A1088", "Palantir", "STOCK"],
  ["PORSCHE", "PSHE", "DE000PAH0038", "Porsche", "STOCK"],
  ["PROCTER", "PCGL", "US7427181091", "Procter", "STOCK"],
  ["PROSUS", "PRX", "NL0013654783", "Prosus", "STOCK"],
  ["RHEINMET", "RHM", "DE0007030009", "Rheinmet", "STOCK"],
  ["ROBINHOOD", "HOOD", "US7707001027", "Robinhood", "STOCK"],
  ["RWE", "RWE", "DE0007037129", "RWE", "STOCK"],
  ["SAP", "SAP", "DE0007164600", "SAP", "STOCK"],
  ["SIEMENS", "SIE", "DE0007236101", "Siemens", "STOCK"],
  ["SPACEEXPL", "SPCX", "US84615Q1031", "Spaceexpl", "STOCK"],
  ["TAKETWO", "TTWO", "US8740541094", "Taketwo", "STOCK"],
  ["TESLA", "TSLA", "US88160R1014", "Tesla", "STOCK"],
  ["UBER", "UBER", "US90353T1007", "UBER", "STOCK"],
  ["VESTAS", "VEST", "DK0061539921", "Vestas", "STOCK"],
  ["VISA", "VISA", "US92826C8394", "VISA", "STOCK"],
  ["VOLKSWAGEN", "VOW", "DE0007664039", "Volkswagen", "STOCK"],
  ["VOLVO", "VOLV", "SE0000115446", "Volvo", "STOCK"],
  ["ZALANDO", "ZAL", "DE000ZAL1111", "Zalando", "STOCK"],
  ["ETFAIFS", "ETFAIFS", "IE000X59ZHE2", "iShares AI Infrastructure UCITS ETF", "ETF"],
  ["ETFEUNM", "ETFEUNM", "IE00B4L5YC18", "iShares MSCI EM UCITS ETF", "ETF"],
  ["ETFISIJPA", "ETFISIJPA", "IE00B4L5YX21", "iShares Core MSCI Japan IMI UCITS ETF", "ETF"],
  ["ETFIWDA", "ETFIWDA", "IE00B4L5Y983", "iShares Core MSCI World UCITS ETF", "ETF"],
  ["ETFSLVR", "ETFSLVR", "IE000UL6CLP7", "Global X Silver Miners UCITS ETF", "ETF"],
  ["ETFV60A", "ETFV60A", "IE00BMVB5P51", "Vanguard LifeStrategy 60% Equity UCITS ETF", "ETF"],
];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const VENUE = {
  NYS: "NYSE",
  NAS: "NASDAQ",
  FRA: "XETR",
  LSE: "XLON",
  PAR: "XPAR",
  AMS: "XAMS",
  BRU: "XBRU",
};
const SUFFIX = new Set(["US", "GR", "GY", "GF", "LN", "FP", "NA", "BB", "FR", "OLD", "USD", "UA"]);

function text(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cells(row) {
  return [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((match) => text(match[1]));
}

function tableRows(html) {
  const body = html.split("<tbody>")[1]?.split("</tbody>")[0] ?? "";
  return [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((match) => cells(match[1]));
}

function isinOf(value) {
  const isin = text(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) ? isin : "";
}

function tickerOf(value) {
  const parts = text(value).toUpperCase().split(" ").filter(Boolean);
  while (parts.length > 1 && SUFFIX.has(parts.at(-1))) parts.pop();
  return parts.join(" ");
}

// The share table leaves the ticker cell empty on a line that still has
// an ISIN. The symbol is the one assets/stocks.csv prints for that place.
function catalogueTicker(isin, exchange) {
  const file = fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8");
  const found = new Set();
  for (const line of file.split("\n")) {
    const cells = line.split(",");
    if (cells[2] !== isin || cells[1] !== exchange) continue;
    const symbol = cells[0].slice(cells[0].indexOf(":") + 1);
    if (symbol) found.add(symbol);
  }
  if (found.size !== 1) throw new Error(`no ticker for ${isin} on ${exchange}`);
  return [...found][0];
}

function listing({ isin, ticker, name, exchange, currency, type }) {
  return {
    query: isin,
    ticker,
    name: name || ticker,
    exchange,
    currency,
    type,
    isin,
    raw: [ticker, name, exchange, currency, type].filter(Boolean).join(" "),
  };
}

async function page(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function foreignShares(html) {
  const rows = [];
  let receipts = 0;
  for (const [isinCell, venueCell, nameCell, tickerCell, currencyCell] of tableRows(html)) {
    if (!isinCell && !venueCell && !tickerCell) continue;
    const isin = isinOf(isinCell);
    const exchange = VENUE[text(venueCell).toUpperCase()];
    const currency = text(currencyCell).toUpperCase();
    const ticker = tickerOf(tickerCell) || catalogueTicker(isin, exchange);
    const name = text(nameCell);
    if (!isin || !exchange || !/^[A-Z]{3}$/.test(currency) || !ticker) {
      throw new Error(`unreadable share row ${isinCell} ${venueCell} ${tickerCell}`);
    }
    if (/\b(ADR|GDR|DEPOSITARY|DEPOSITORY)\b/i.test(name)) {
      receipts += 1;
      continue;
    }
    rows.push(listing({ isin, ticker, name, exchange, currency, type: "STOCK" }));
  }
  return { rows, receipts };
}

function foreignFunds(html) {
  const rows = [];
  for (const [isinCell, venueCell, nameCell, tickerCell, currencyCell, typeCell] of tableRows(html)) {
    if (!isinCell && !venueCell && !tickerCell) continue;
    const isin = isinOf(isinCell);
    const exchange = VENUE[text(venueCell).toUpperCase()];
    const currency = text(currencyCell).toUpperCase();
    const ticker = tickerOf(tickerCell);
    const name = text(nameCell);
    const printed = text(typeCell).toUpperCase();
    const type = printed || (/\bETN\b/i.test(name) ? "ETN" : /\bETC\b/i.test(name) ? "ETC" : /\bETF\b/i.test(name) ? "ETF" : "");
    if (!isin || !exchange || !/^[A-Z]{3}$/.test(currency) || !ticker || !["ETF", "ETC", "ETN"].includes(type)) {
      throw new Error(`unreadable fund row ${isinCell} ${venueCell} ${tickerCell} ${typeCell}`);
    }
    rows.push(listing({ isin, ticker, name, exchange, currency, type }));
  }
  return rows;
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

function warsawProduct(ticker) {
  if (/^ETC/i.test(ticker)) return "ETC";
  if (/^ETN/i.test(ticker)) return "ETN";
  return "ETF";
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
  const isin = isinOf(html.match(/data-isin="([^"]+)"/)?.[1]);
  const unit = html.match(/data-unit="([^"]+)"/)?.[1] ?? "";
  if (!isin || unit !== "zł") return null;
  const suffix = text(html.match(/a-heading__suffix[^"]*">([^<]+)/)?.[1]);
  const wrapped = suffix.match(/^(.*)\(([^)]+)\)\s*$/);
  const ticker = text(wrapped ? wrapped[2] : symbol).toUpperCase();
  const name = text(wrapped ? wrapped[1] : suffix);
  if (!ticker) return null;
  return listing({ isin, ticker, name, exchange, currency: "PLN", type });
}

async function warsawRows() {
  const [sharesHtml, ncHtml, etfHtml] = await Promise.all([page(SHARE_BOARD), page(NC_BOARD), page(ETF_BOARD)]);
  const jobs = [
    ...boardSymbols(sharesHtml).map((symbol) => ({ symbol, exchange: "GPW", type: "STOCK" })),
    ...boardSymbols(ncHtml).map((symbol) => ({ symbol, exchange: "NewConnect", type: "STOCK" })),
    ...boardSymbols(etfHtml).map((symbol) => ({ symbol, exchange: "GPW", type: warsawProduct(symbol) })),
  ];
  if (jobs.filter((job) => job.exchange === "GPW" && job.type === "STOCK").length < 350) {
    throw new Error("GPW share board is short");
  }
  if (jobs.filter((job) => job.exchange === "NewConnect").length < 250) throw new Error("NewConnect board is short");
  if (jobs.filter((job) => job.type !== "STOCK").length < 20) throw new Error("GPW ETF board is short");
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
  await Promise.all(Array.from({ length: 12 }, worker));
  return rows;
}

function globalConnectNames(html) {
  const body = html.split("<tbody>")[1]?.split("</tbody>")[0] ?? "";
  const names = [];
  for (const row of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cell = row[1].match(/<td>([\s\S]*?)<\/td>/);
    if (!cell) continue;
    const name = text(cell[1]).toUpperCase();
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

async function globalConnectRows() {
  const quoted = new Set(globalConnectNames(await page(GC_BOARD)));
  if (quoted.size < 50) throw new Error(`GlobalConnect board is short: ${quoted.size}`);
  const known = new Map(GLOBAL_CONNECT.map((row) => [row[0], row]));
  const missing = [...quoted].filter((name) => !known.has(name));
  if (missing.length) throw new Error(`GlobalConnect name with no ISIN: ${missing.join(", ")}`);
  return [...quoted].map((name) => {
    const [, ticker, isin, label, type] = known.get(name);
    return listing({ isin, ticker, name: label, exchange: "GlobalConnect", currency: "PLN", type });
  });
}

const shareBook = foreignShares(await page(SHARES));
const fundBook = foreignFunds(await page(FUNDS));
if (shareBook.rows.length < 1100) throw new Error(`foreign share table is short: ${shareBook.rows.length}`);
if (fundBook.length < 180) throw new Error(`foreign fund table is short: ${fundBook.length}`);

const seen = new Set();
const results = [];
function add(row) {
  const key = `${row.isin}:${row.exchange}:${row.currency}`;
  if (seen.has(key)) throw new Error(`repeated ${key}`);
  seen.add(key);
  results.push(row);
}
for (const row of shareBook.rows) add(row);
for (const row of fundBook) add(row);
const foreign = results.length;
let warsaw = 0;
for (const row of [...(await warsawRows()), ...(await globalConnectRows())]) {
  const key = `${row.isin}:${row.exchange}:${row.currency}`;
  if (seen.has(key)) continue;
  seen.add(key);
  results.push(row);
  warsaw += 1;
}

results.sort((left, right) => left.type.localeCompare(right.type) || left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("bdm-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(results)), null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const warsawBy = new Map();
for (const row of results.filter((row) => row.exchange === "GPW" || row.exchange === "NewConnect" || row.exchange === "GlobalConnect")) {
  warsawBy.set(`${row.exchange} ${row.type}`, (warsawBy.get(`${row.exchange} ${row.type}`) || 0) + 1);
}
console.error(
  `${results.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}). ` +
    `Foreign tables ${foreign}, receipts left out ${shareBook.receipts}. ` +
    `Warsaw ${warsaw}: ${[...warsawBy].map(([label, count]) => `${count} ${label}`).join(", ")}.`
);
