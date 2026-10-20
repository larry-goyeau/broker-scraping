// DSE Hisa Kiganjani is the Dar es Salaam Stock Exchange's own mobile app;
// it trades every security on the DSE equity board. The DSE publishes, with
// no login, the list of its 28 listed companies and, on its home page, the
// live equity board: every listed share plus the exchange traded funds.
//
//   https://dse.co.tz/listed/company/list
//   https://dse.co.tz/
//
// The home board is the list kept: one row per symbol, shares then the
// "-ETF" lines. The company list is the check: the same companies must be
// on the board (the list still says TCPLC for Tanga Cement, which trades as
// TCCL). Government and corporate bonds, shown in other tables, stay out.
// The site gives no company names in a table, so the names below come from
// each company's profile page; an unknown new symbol keeps its symbol as
// name. Kenyan cross-listings (EABL, JHL, KA, KCB, NMG, USL) are the DSE
// lines, quoted in shillings (TZS). No ISINs are shown.
//
//   node brokers/dsehisa/dsehisa_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const HOME = "https://dse.co.tz/";
const LIST = "https://dse.co.tz/listed/company/list";
const LIST_ALIAS = { TCPLC: "TCCL" };

// From https://dse.co.tz/listed/company/profile?id=N and the ETF listing notices.
const NAMES = {
  AFRIPRISE: "Afriprise Investment PLC",
  CRDB: "CRDB Bank PLC",
  DCB: "DCB Commercial Bank PLC",
  DSE: "Dar es Salaam Stock Exchange PLC",
  EABL: "East African Breweries Limited",
  JATU: "JATU PLC",
  JHL: "Jubilee Holdings Limited",
  KA: "Kenya Airways Limited",
  KCB: "KCB Group PLC",
  MBP: "Maendeleo Bank PLC",
  MCB: "Mwalimu Commercial Bank PLC",
  MKCB: "Mkombozi Commercial Bank PLC",
  MUCOBA: "Mufindi Community Bank PLC",
  NICO: "National Investment Company Limited",
  NMB: "NMB Bank PLC",
  NMG: "Nation Media Group PLC",
  PAL: "Precision Air Services PLC",
  SWALA: "Swala Oil and Gas (Tanzania) PLC",
  SWIS: "Swissport Tanzania PLC",
  TBL: "Tanzania Breweries PLC",
  TCC: "Tanzania Cigarette Company PLC",
  TCCL: "Tanga Cement PLC",
  TOL: "TOL Gases Limited",
  TPCC: "Tanzania Portland Cement PLC",
  TTP: "Tanzania Tea Packers Limited",
  USL: "Uchumi Supermarkets Limited",
  VODA: "Vodacom Tanzania PLC",
  YETU: "Yetu Microfinance Bank PLC",
  "IEACLC-ETF": "iTrust EAC Large Cap ETF",
  "VERTEX-ETF": "Vertex International Securities ETF",
  "ZAN-ETF": "Zan Securities Timiza ETF",
};

function decode(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
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
        headers: { "User-Agent": UA, Accept: "text/html" },
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

function tables(page) {
  return [...page.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map(([, table]) =>
    [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(([, row]) => [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => decode(cell[1]))),
  );
}

const home = await get(HOME);
await sleep(400);
const list = await get(LIST);

const board = tables(home).find((table) => table[0]?.[0] === "Symbol" && table[0].includes("MCAP (TZS 'B)"));
if (!board) throw new Error("equity board table not found on the home page");
const header = board[0];
const lines = board.slice(1).filter((cells) => cells[0]);

const listed = tables(list)
  .find((table) => table[0]?.[1] === "Company Code")
  ?.slice(1)
  .map((cells) => cells[1])
  .filter(Boolean);
if (!listed || listed.length < 25) throw new Error(`company list parsed ${listed?.length} codes`);

const symbols = new Set(lines.map((cells) => cells[0]));
const missing = listed.filter((code) => !symbols.has(LIST_ALIAS[code] || code));
if (missing.length) throw new Error(`listed companies not on the board: ${missing.join(" ")}`);
const shares = lines.filter((cells) => !/-ETF$/.test(cells[0]));
if (shares.length !== listed.length) throw new Error(`board has ${shares.length} shares, company list ${listed.length}`);

const rows = [];
for (const cells of lines) {
  const ticker = cells[0];
  const type = /-ETF$/.test(ticker) ? "ETF" : "STOCK";
  if (!NAMES[ticker]) console.error(`no name for ${ticker}, the symbol is used`);
  rows.push({
    query: ticker,
    ticker,
    name: NAMES[ticker] || ticker,
    exchange: "Dar es Salaam Stock Exchange",
    mic: "XDAR",
    currency: "TZS",
    type,
    isin: "",
    raw: header.map((name, index) => `${name}: ${cells[index] ?? ""}`).join(" | "),
  });
}

for (const ticker of ["CRDB", "NMB", "TBL", "VODA"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing`);
}
if (!rows.some((row) => row.type === "ETF")) throw new Error("no ETF on the board");
if (rows.length < 28) throw new Error(`only ${rows.length} rows`);

rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("dsehisa-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(counts);
