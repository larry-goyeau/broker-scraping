// What ASB Securities sells online in shares and exchange-traded funds.
// New Zealand and Australia are the online book. An international order
// is the phone desk, and NZDX fixed interest is the phone desk too.
//
// ASB names no tickers. It says most New Zealand and Australian shares,
// more than 170 NZX companies and over 2,000 ASX equities, and a wide
// range of NZX and ASX ETFs. The catalogues are the exchanges' own
// boards: the NZX Main Board page, and the ASX lines in the TMX
// tradable file. Warrants, rights, options, notes and open-end funds
// stay out.
//
//   https://www.asb.co.nz/asb-securities/shares.html
//   https://www.asb.co.nz/asb-securities/markets-you-can-trade-guide.html
//   https://www.nzx.com/markets/NZSX
//   https://www.tmxaustralia.com/equities/support/reference-data
//
//   node brokers/asb/asb_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const NZX_PAGE = "https://www.nzx.com/markets/NZSX";
const REFERENCE = "https://www.tmxaustralia.com/equities/support/reference-data";
const COMPANIES = "https://asx.api.cmfyapp.com/asx-research/1.0/companies/directory/file";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

// The tradable file's TYPE and INSTRUMENTSUBTYPE. An ordinary share is
// 1/1, a stapled security or a listed trust unit is 1/6, and a
// preference share is 1/17. An ETF is 3/7, an active ETF 3/36, a CDI
// of an ETF 3/33, and the quoted gold product 1/16.
const STOCK = new Set(["1/1", "1/6", "1/17"]);
const ETF = new Set(["3/7", "3/36", "3/33", "1/16"]);

async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "*/*" },
        signal: AbortSignal.timeout(45000),
      });
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      return await response.text();
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last || url);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  return rows;
}

function companyNames(csv) {
  const table = parseCsv(csv);
  const header = table[0]?.map((cell) => cell.trim().toLowerCase());
  if (header?.[0] !== "asx code" || header?.[1] !== "company name") {
    throw new Error(`ASX company file header is ${(header || []).join(",")}`);
  }
  const names = new Map();
  for (const line of table.slice(1)) {
    const ticker = String(line[0] || "").trim().toUpperCase();
    const name = String(line[1] || "").replace(/\s+/g, " ").trim();
    if (!ticker || !name) continue;
    if (!names.has(ticker)) names.set(ticker, name);
  }
  if (names.size < 1500) throw new Error(`ASX company file printed ${names.size} names`);
  return names;
}

function tradableUrl(html) {
  const found = new Set();
  for (const match of html.matchAll(/https:\/\/cdn\.cboe\.com\/data\/au\/equities\/cxatsl\/cxa\/PROD_CXATSL_[0-9_]+\.txt/g)) {
    found.add(match[0]);
  }
  if (found.size !== 1) throw new Error(`TMX reference page linked ${found.size} tradable files`);
  return [...found][0];
}

function tradableRows(text) {
  const lines = text.split(/\r?\n/).filter((line) => line && !line.startsWith("T|"));
  const header = lines[0]?.replace(/^H\|/, "").split("|");
  const column = Object.fromEntries((header || []).map((name, index) => [name, index]));
  for (const name of ["CXACODE", "DESC", "ISIN", "CURR", "MIC", "TYPE", "INSTRUMENTSUBTYPE"]) {
    if (column[name] === undefined) throw new Error(`TMX tradable file has no ${name} column`);
  }
  const rows = [];
  for (const line of lines.slice(1)) {
    const cell = line.replace(/^D\|/, "").split("|");
    if (cell.length < header.length) continue;
    rows.push({
      ticker: cell[column.CXACODE].trim().toUpperCase(),
      desc: cell[column.DESC].replace(/\s+/g, " ").trim(),
      isin: cell[column.ISIN].trim().toUpperCase(),
      currency: cell[column.CURR].trim().toUpperCase(),
      mic: cell[column.MIC].trim().toUpperCase(),
      kind: `${cell[column.TYPE].trim()}/${cell[column.INSTRUMENTSUBTYPE].trim()}`,
    });
  }
  if (rows.length < 3000) throw new Error(`TMX tradable file printed ${rows.length} rows`);
  return rows;
}

function cleanDesc(desc, ticker) {
  return desc
    .replace(new RegExp(`\\s*\\[${ticker}\\]\\s*$`), "")
    .replace(/\s+FPO\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nzxBoards(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("the NZX Main Board page had no catalogue");
  const data = JSON.parse(match[1]);
  const queries = data?.props?.pageProps?.dehydratedState?.queries;
  if (!Array.isArray(queries)) throw new Error("the NZX Main Board page had no instrument list");
  const read = (key) => queries.find((query) => JSON.stringify(query.queryKey) === JSON.stringify(key))?.state?.data;
  const active = read(["activeInstruments"]);
  const board = read(["marketInstruments", "NZSX"]);
  if (!Array.isArray(active) || !Array.isArray(board)) throw new Error("the NZX lists were empty");
  return { active, board };
}

function nzxListings({ active, board }) {
  const byCode = new Map(active.map((row) => [String(row.code || "").toUpperCase(), row]));
  const rows = [];
  const seen = new Set();
  let dropped = 0;
  for (const line of board) {
    const ticker = String(line.code || "").toUpperCase();
    const fact = byCode.get(ticker);
    const sub = fact?.subCategory || "";
    const kind = fact?.type || "";
    const name = String(fact?.name || line.description || "").replace(/\s+/g, " ").trim();
    if (!ticker || !name) throw new Error("an NZX line had no code");
    const etf = sub === "ETF" || /\bETF\b/.test(name);
    const share = kind === "SHRS" || (kind === "UNIT" && !etf && sub !== "OPENEND");
    if (kind === "WNTS" || /warrant|rights/i.test(name) || sub === "OPENEND" || (!etf && !share)) {
      dropped += 1;
      continue;
    }
    const isin = String(fact?.isin || line.ISIN || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`${ticker} on the NZX had no ISIN`);
    const currency = String(fact?.currencyCode || line.currency || "").toUpperCase();
    if (currency !== "NZD") throw new Error(`${ticker} on the NZX was priced in ${currency || "no currency"}`);
    if (seen.has(ticker)) throw new Error(`repeated NZX ${ticker}`);
    seen.add(ticker);
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: "NZX",
      currency: "NZD",
      type: etf ? "ETF" : "STOCK",
      isin,
      raw: [ticker, name, "NZX", isin].join(" "),
    });
  }
  return { rows, dropped };
}

function asxListings(book, names) {
  const rows = [];
  const seen = new Set();
  let dropped = 0;
  for (const entry of book) {
    if (entry.mic !== "XASX") continue;
    const type = STOCK.has(entry.kind) ? "STOCK" : ETF.has(entry.kind) ? "ETF" : "";
    if (!type) {
      dropped += 1;
      continue;
    }
    if (entry.currency !== "AUD") throw new Error(`${entry.ticker} on the ASX was priced in ${entry.currency || "no currency"}`);
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(entry.isin)) throw new Error(`${entry.ticker} on the ASX had no ISIN`);
    if (seen.has(entry.ticker)) throw new Error(`repeated ASX ${entry.ticker}`);
    seen.add(entry.ticker);
    const name = names.get(entry.ticker) || cleanDesc(entry.desc, entry.ticker);
    if (!name) throw new Error(`no name for ASX ${entry.ticker}`);
    rows.push({
      query: entry.ticker,
      ticker: entry.ticker,
      name,
      exchange: "ASX",
      currency: "AUD",
      type,
      isin: entry.isin,
      raw: [entry.ticker, name, "ASX", entry.isin].join(" "),
    });
  }
  return { rows, dropped };
}

const nzx = nzxListings(nzxBoards(await getText(NZX_PAGE)));
const asx = asxListings(tradableRows(await getText(tradableUrl(await getText(REFERENCE)))), companyNames(await getText(COMPANIES)));
const listings = [...nzx.rows, ...asx.rows];

const count = (exchange, type) => listings.filter((row) => row.exchange === exchange && row.type === type).length;
const nzxStocks = count("NZX", "STOCK");
const nzxEtfs = count("NZX", "ETF");
const asxStocks = count("ASX", "STOCK");
const asxEtfs = count("ASX", "ETF");
if (nzxStocks < 100) throw new Error(`the NZX share board was short: ${nzxStocks}`);
if (nzxEtfs < 40) throw new Error(`the NZX ETF board was short: ${nzxEtfs}`);
if (asxStocks < 1500) throw new Error(`the ASX share board was short: ${asxStocks}`);
if (asxEtfs < 350) throw new Error(`the ASX ETF board was short: ${asxEtfs}`);

const one = (ticker, exchange) => listings.filter((row) => row.ticker === ticker && row.exchange === exchange);
const anz = one("ANZ", "NZX");
const nzg = one("NZG", "NZX");
const bhp = one("BHP", "ASX");
if (anz.length !== 1 || anz[0].type !== "STOCK" || anz[0].currency !== "NZD") throw new Error("ANZ was not a New Zealand share");
if (nzg.length !== 1 || nzg[0].type !== "ETF" || nzg[0].currency !== "NZD") throw new Error("NZG was not a New Zealand ETF");
if (bhp.length !== 1 || bhp[0].type !== "STOCK" || bhp[0].currency !== "AUD") throw new Error("BHP was not an Australian share");
if (listings.some((row) => row.ticker === "MEEWA" || row.exchange === "Cboe Australia")) {
  throw new Error("a warrant or a Cboe line was kept");
}

listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
const kept = stampRows(withoutObligations(listings));
fs.writeFileSync(new URL("asb-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));
console.error(
  `${kept.length} listings (${nzxStocks} NZX STOCK, ${nzxEtfs} NZX ETF, ${asxStocks} ASX STOCK, ${asxEtfs} ASX ETF); ` +
    `${nzx.dropped + asx.dropped} left out`
);
