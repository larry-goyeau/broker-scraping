// The B3 (São Paulo) book, for the brokers whose one place is B3 and that
// print no list of their own (Nubank, Itaú íon, Ágora, Safra, PagBank and
// the other Brazilian home brokers). It is the exchange's whole cash
// equity book: every share, unit, BDR and ETF that trades today.
//
// The lines come from B3's own instrument file (InstrumentsConsolidated):
// the cash segment of the equity market, plus the fixed-income ETFs
// (IMAB11, B5P211, LFTS11...), which B3 files under its fixed-income
// platform although a home broker sells them like any ETF. Their names
// come from B3's list of listed fixed-income ETFs (else assets/etfs.csv).
//
// The instrument file also carries lines that do not trade: classes with
// no float, companies registered at the CVM but never admitted, issuers
// in liquidation. So a line is kept only when it traded at least once in
// the last twelve months, read from B3's own daily quote history
// (COTAHIST, the year file plus month files back to twelve months); the
// fixed-income ETFs are not in that history and are kept as filed. For
// a Brazilian share or unit, the issuer must also be in good standing at
// the CVM (cad_cia_aberta.csv): a registration that is suspended
// ("SUSPENSO(A) - DECISÃO ADM") or cancelled stays out, and so does an
// issuer that is bankrupt or in liquidation. A company in judicial
// recovery still trades and stays. The issuer of each ticker is matched
// through B3's listed-company register (issuing code to CVM code).
//
// Types: a share or a unit is a STOCK; a BDR of a share is a STOCK; a BDR
// of a foreign ETF (B3 marks it "DRE") is an ETF, and a BDR of a 21Shares
// crypto ETP is an ETN; a Brazilian index fund (equity, foreign index or
// fixed income) is an ETF. A listed closed-end fund (FII real estate,
// FIAGRO, FIP, FIDC, FI-Infra) is a FUND row: the writer leaves FUND
// out unless asked. Left out: the odd lot and block lot (same share, other
// code), subscription receipts, rights, warrants, indexes, the financing
// rate lines ("TAXA", spec "DIA LIVR"), the municipal CEPAC certificates,
// the Porto Sudeste participation security and the old audiovisual
// certificates.
//
//   https://arquivos.b3.com.br/tabelas/InstrumentsConsolidated
//   https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A2026.ZIP
//   https://sistemaswebb3-listados.b3.com.br/listedCompaniesPage/
//   https://sistemaswebb3-listados.b3.com.br/fundsListedProxy/Search/GetListFunds/
//   https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv
//
// The quote history is about 100 MB a year, so the finished book is kept
// for 12 hours in the system temp folder: the scrapers run back to back
// read B3 once.
//
//   import { writeB3Catalogue } from "../nubank/b3Book.mjs";
//   await writeB3Catalogue(import.meta.url, "<folder>-parsed.json");

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { Readable } from "node:stream";
import { createInflateRaw } from "node:zlib";

export const EXCHANGE = "B3";
export const MIC = "BVMF";

const REQUEST = "https://arquivos.b3.com.br/api/download/requestname";
const DOWNLOAD = "https://arquivos.b3.com.br/api/download";
const PAGE = "https://arquivos.b3.com.br/tabelas/InstrumentsConsolidated";
const HISTORY = "https://bvmf.bmfbovespa.com.br/InstDados/SerHist";
const COMPANIES = "https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetInitialCompanies";
const FUNDS = "https://sistemaswebb3-listados.b3.com.br/fundsListedProxy/Search/GetListFunds";
const CVM = "https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const CACHE = path.join(os.tmpdir(), "b3-book-cache.json");
const CACHE_HOURS = 12;
const WINDOW_DAYS = 365;
// The issuer states at the CVM that mean the paper no longer trades.
const GONE = /FALIDA|LIQUIDA/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isinOf(value) {
  const text = clean(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function saoPauloDay(daysAgo) {
  const when = new Date(Date.now() - daysAgo * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}

async function get(url, headers = {}, timeout = 60_000, missing = [404]) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, ...headers },
        signal: AbortSignal.timeout(timeout),
      });
      if (missing.includes(response.status)) return null;
      if (response.status === 429 || response.status >= 500) {
        last = new Error(`${url} answered ${response.status}`);
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      return { bytes: Buffer.from(await response.arrayBuffer()), response };
    } catch (error) {
      last = error;
      if (attempt === 3) break;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw last;
}

const latin1 = (bytes) => new TextDecoder("iso-8859-1").decode(bytes);
const base64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64");

// B3's instrument file of the latest session, as a header map and lines.
async function instrumentFile() {
  for (let daysAgo = 0; daysAgo < 8; daysAgo += 1) {
    const date = saoPauloDay(daysAgo);
    // A day with no session answers 400 or 404.
    const asked = await get(
      `${REQUEST}?fileName=InstrumentsConsolidated&date=${date}`,
      { Accept: "application/json", Referer: PAGE },
      60_000,
      [400, 404]
    );
    if (!asked) continue;
    const meta = JSON.parse(latin1(asked.bytes));
    if (!meta.token) continue;
    const cookies = (asked.response.headers.getSetCookie?.() || []).map((row) => row.split(";")[0]).join("; ");
    await sleep(500);
    const file = await get(`${DOWNLOAD}?token=${encodeURIComponent(meta.token)}`, { Referer: PAGE, Cookie: cookies });
    const text = file ? latin1(file.bytes) : "";
    if (!text.includes("TckrSymb")) continue;
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    const headerAt = lines.findIndex((line) => line.startsWith("RptDt;"));
    if (headerAt < 0) throw new Error("the B3 instrument file has no header");
    const header = lines[headerAt].split(";");
    const column = Object.fromEntries(header.map((name, index) => [name, index]));
    for (const name of ["TckrSymb", "SctyCtgyNm", "SgmtNm", "MktNm", "ISIN", "TradgCcy", "CrpnNm", "CFICd", "SpcfctnCd", "TradgEndDt"]) {
      if (column[name] == null) throw new Error(`the B3 instrument file has no ${name}`);
    }
    return { date, column, width: header.length, lines: lines.slice(headerAt + 1) };
  }
  throw new Error("B3 published no instrument file this week");
}

// The single file inside a COTAHIST zip, streamed line by line (a year
// unpacks to about 800 MB, too big to hold).
async function* zipLines(bytes) {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("not a zip file");
  const central = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt32LE(central) !== 0x02014b50) throw new Error("bad zip directory");
  const method = bytes.readUInt16LE(central + 10);
  const size = bytes.readUInt32LE(central + 20);
  const local = bytes.readUInt32LE(central + 42);
  const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
  const data = bytes.subarray(start, start + size);
  if (method !== 8) throw new Error(`zip method ${method}`);
  const stream = Readable.from([data]).pipe(createInflateRaw());
  stream.setEncoding("latin1");
  yield* readline.createInterface({ input: stream, crlfDelay: Infinity });
}

// The last session each cash-market ticker (and ISIN) traded since `from`
// (YYYYMMDD), from B3's quote history.
async function lastTrades(from) {
  const today = saoPauloDay(0).replace(/-/g, "");
  const year = Number(today.slice(0, 4));
  const files = [];
  const fromYear = Number(from.slice(0, 4));
  if (fromYear < year) {
    const fromMonth = Number(from.slice(4, 6));
    if (fromMonth <= 3) files.push(`COTAHIST_A${fromYear}.ZIP`);
    else for (let month = fromMonth; month <= 12; month += 1) files.push(`COTAHIST_M${String(month).padStart(2, "0")}${fromYear}.ZIP`);
  }
  files.push(`COTAHIST_A${year}.ZIP`);

  const byTicker = new Map();
  const byIsin = new Map();
  let newest = "";
  for (const name of files) {
    const file = await get(`${HISTORY}/${name}`, {}, 600_000);
    if (!file) {
      console.error(`${name} is not published`);
      continue;
    }
    for await (const line of zipLines(file.bytes)) {
      if (!line.startsWith("01")) continue;
      // TPMERC 010 is the cash market (020 is the odd lot).
      if (line.slice(24, 27) !== "010") continue;
      const day = line.slice(2, 10);
      if (day < from) continue;
      const ticker = line.slice(12, 24).trim();
      const isin = line.slice(230, 242).trim();
      if (day > (byTicker.get(ticker) || "")) byTicker.set(ticker, day);
      if (isin && day > (byIsin.get(isin) || "")) byIsin.set(isin, day);
      if (day > newest) newest = day;
    }
    await sleep(1000);
  }
  if (!newest) throw new Error("the B3 quote history is empty");
  return { byTicker, byIsin, newest };
}

// Issuing code (the four letters of a ticker) to the issuer's state at
// the CVM, for the Brazilian companies listed on B3.
async function issuerStates() {
  const codeCvm = new Map();
  for (let page = 1; page < 100; page += 1) {
    const url = `${COMPANIES}/${base64({ language: "pt-br", pageNumber: page, pageSize: 120 })}`;
    const answer = await get(url, { Accept: "application/json" });
    const data = JSON.parse(answer.bytes.toString("utf8"));
    for (const company of data.results || []) {
      const code = clean(company.issuingCompany).toUpperCase();
      if (code && /^\d+$/.test(company.codeCVM)) codeCvm.set(code, String(Number(company.codeCVM)));
    }
    if (page >= (data.page?.totalPages || 0)) break;
    await sleep(700);
  }
  if (codeCvm.size < 1000) throw new Error(`only ${codeCvm.size} issuers in the B3 register`);

  const cvm = await get(CVM);
  const lines = latin1(cvm.bytes).split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(";");
  const at = (name) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`the CVM register has no ${name}`);
    return index;
  };
  const [code, sit, issuer] = [at("CD_CVM"), at("SIT"), at("SIT_EMISSOR")];
  const byCvm = new Map();
  for (const line of lines.slice(1)) {
    const cell = line.split(";");
    if (/^\d+$/.test(cell[code])) byCvm.set(String(Number(cell[code])), { sit: clean(cell[sit]), issuer: clean(cell[issuer]) });
  }
  const states = new Map();
  for (const [issuing, cvmCode] of codeCvm) {
    const state = byCvm.get(cvmCode);
    if (state) states.set(issuing, state);
  }
  return states;
}

// B3's list of listed fixed-income ETFs: issuing code to fund name.
async function fixedIncomeEtfs() {
  const names = new Map();
  for (let page = 1; page < 20; page += 1) {
    const url = `${FUNDS}/${base64({ language: "pt-br", typeFund: "ETF-RF", pageNumber: page, pageSize: 120 })}`;
    const answer = await get(url, { Accept: "application/json" });
    const data = JSON.parse(answer.bytes.toString("utf8"));
    for (const fund of data.results || []) {
      const code = clean(fund.acronym).toUpperCase();
      if (code) names.set(code, clean(fund.fundName || fund.tradingName));
    }
    if (page >= (data.page?.totalPages || 0)) break;
    await sleep(700);
  }
  if (names.size < 30) throw new Error(`only ${names.size} fixed-income ETFs in the B3 list`);
  return names;
}

// The repo's shared ETF list, for a fixed-income ETF that B3's list
// misses (the IT Now NTN-B ETFs TD3511, TD5011, TD6011).
let sharedEtfs;
function sharedEtfName(ticker, isin) {
  if (!sharedEtfs) {
    sharedEtfs = new Map();
    const text = fs.readFileSync(new URL("../../assets/etfs.csv", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith("BMFBOVESPA:")) continue;
      const [symbol, , code, ...rest] = line.split(",");
      sharedEtfs.set(symbol.slice("BMFBOVESPA:".length), { isin: code, name: clean(rest.join(",").replace(/^"|"$/g, "")) });
    }
  }
  const hit = sharedEtfs.get(ticker);
  return hit && hit.isin === isin ? hit.name : "";
}

function kindOf(category, cfi, spec, name) {
  switch (category) {
    case "SHARES":
      // M: not a share (a city's CEPAC building-rights certificates,
      // the Porto Sudeste participation security PSVM11).
      return cfi.startsWith("M") ? "" : "STOCK";
    case "UNIT":
      return "STOCK";
    case "BDR":
      if (spec.startsWith("DRE")) return /\bETP\b/.test(name) && !/\bETF\b/.test(name) ? "ETN" : "ETF";
      return "STOCK";
    case "ETF EQUITIES":
    case "ETF FOREIGN INDEX":
      return "ETF";
    case "FUNDS":
      // C: a collective investment scheme. The rest are old audiovisual
      // certificates filed as funds.
      return cfi.startsWith("C") ? "FUND" : "";
    default:
      return "";
  }
}

async function build() {
  const file = await instrumentFile();
  const day = file.date;
  const from = new Date(Date.parse(`${day}T12:00:00Z`) - WINDOW_DAYS * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
  const trades = await lastTrades(from);
  const states = await issuerStates();
  const fixedIncome = await fixedIncomeEtfs();

  const { column, width } = file;
  const listed = [];
  const leftOut = {};
  const leave = (reason, ticker) => {
    (leftOut[reason] ||= []).push(ticker);
  };
  const seen = new Set();

  for (const line of file.lines) {
    const cell = line.split(";");
    if (cell.length < width) continue;
    const market = cell[column.MktNm];
    const segment = cell[column.SgmtNm];
    const category = clean(cell[column.SctyCtgyNm]).toUpperCase();
    const ticker = clean(cell[column.TckrSymb]).toUpperCase();
    const isin = isinOf(cell[column.ISIN]);
    const cfi = clean(cell[column.CFICd]).toUpperCase();
    const spec = clean(cell[column.SpcfctnCd]).toUpperCase();
    const end = clean(cell[column.TradgEndDt]);
    let name = clean(cell[column.CrpnNm]);
    let type;

    if (market === "EQUITY-CASH" && segment === "CASH") {
      if (spec === "DIA LIVR") {
        leave("financing rate line", ticker);
        continue;
      }
      type = kindOf(category, cfi, spec, name);
      if (!type) {
        leave(category.toLowerCase(), ticker);
        continue;
      }
    } else if (category === "FIXED INCOME TRADABLE INSTRUMENT T1" && /^BR[A-Z0-9]{4}CTF/.test(isin)) {
      type = "ETF";
      name = fixedIncome.get(ticker.slice(0, 4)) || sharedEtfName(ticker, isin);
      if (!name) {
        leave("fixed-income ETF with no name", ticker);
        continue;
      }
    } else continue;

    if (!ticker || !name) throw new Error(`unreadable B3 line ${line}`);
    if (end && end !== "9999-12-31" && end <= day) {
      leave("trading ended", ticker);
      continue;
    }
    // The fixed-income ETFs trade on another platform, outside COTAHIST,
    // so no trade test for them: the instrument file lists them only
    // while they are listed.
    if (!(type === "ETF" && category.startsWith("FIXED INCOME"))) {
      const lastDay = trades.byTicker.get(ticker) || (isin && trades.byIsin.get(isin)) || "";
      if (!lastDay) {
        leave("no trade in twelve months", ticker);
        continue;
      }
    }
    if ((category === "SHARES" || category === "UNIT") && isin.startsWith("BR")) {
      const state = states.get(ticker.slice(0, 4));
      if (state && state.sit !== "ATIVO") {
        leave(`CVM registration ${state.sit.toLowerCase()}`, ticker);
        continue;
      }
      if (state && GONE.test(state.issuer)) {
        leave(`issuer ${state.issuer.toLowerCase()}`, ticker);
        continue;
      }
    }
    if (seen.has(ticker)) throw new Error(`${ticker} is listed twice`);
    seen.add(ticker);
    const currency = clean(cell[column.TradgCcy]).toUpperCase() || "BRL";
    listed.push({
      query: ticker,
      ticker,
      name,
      exchange: EXCHANGE,
      mic: MIC,
      currency,
      type,
      isin,
      raw: [ticker, name, EXCHANGE, currency, isin, type].filter(Boolean).join(" "),
    });
  }

  listed.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));

  const has = (ticker) => listed.find((row) => row.ticker === ticker);
  for (const [ticker, type] of [["PETR4", "STOCK"], ["VALE3", "STOCK"], ["BPAC11", "STOCK"], ["AAPL34", "STOCK"], ["BOVA11", "ETF"], ["IVVB11", "ETF"], ["IMAB11", "ETF"], ["BIVB39", "ETF"], ["HGLG11", "FUND"]]) {
    if (has(ticker)?.type !== type) throw new Error(`${ticker} is ${has(ticker)?.type || "missing"}, not ${type}`);
  }
  for (const ticker of ["PETR4F", "TAXA100", "CTBA11B", "RSID3"]) {
    if (has(ticker)) throw new Error(`${ticker} was kept`);
  }
  const count = (type) => listed.filter((row) => row.type === type).length;
  if (count("STOCK") < 1000) throw new Error(`only ${count("STOCK")} shares`);
  if (count("ETF") < 250) throw new Error(`only ${count("ETF")} ETFs`);
  return { date: day, history: trades.newest, listed, leftOut };
}

function cached() {
  try {
    const kept = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - kept.at < CACHE_HOURS * 3600_000 && Array.isArray(kept.book?.listed)) return kept.book;
  } catch {
    // no cache, or an unreadable one: read B3 again
  }
  return null;
}

// Every B3 line that trades, as catalogue rows (with mic BVMF), sorted by
// type then ticker: { date, history, listed, leftOut }. `date` is the
// instrument file's session, `history` the newest session in the quote
// history, `leftOut` maps each reason to the tickers it removed.
export async function b3Book({ fresh = false } = {}) {
  const hit = fresh ? null : cached();
  if (hit) return hit;
  const book = await build();
  try {
    fs.writeFileSync(CACHE, JSON.stringify({ at: Date.now(), book }));
  } catch {}
  return book;
}

// Writes <file> next to the calling scraper (`here` is its
// import.meta.url). `types` keeps only those row types (add "FUND" for the
// listed real-estate and other closed-end funds); `keep` is an optional
// row filter for the broker's own exceptions; `mic: false` drops the mic.
export async function writeB3Catalogue(here, file, { types = ["STOCK", "ETF", "ETN"], keep = () => true, mic = true } = {}) {
  const { date, history, listed, leftOut } = await b3Book();
  const rows = listed
    .filter((row) => types.includes(row.type) && keep(row))
    .map((row) => {
      if (mic) return { ...row };
      const { mic: _mic, ...rest } = row;
      return rest;
    });
  const kept = stampRows(withoutObligations(rows));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  const byType = new Map();
  for (const row of kept) byType.set(row.type, (byType.get(row.type) || 0) + 1);
  console.error(
    `${kept.length} listings from the B3 file of ${date}, trades to ${history} ` +
      `(${[...byType].map(([type, n]) => `${n} ${type}`).join(", ")})`
  );
  for (const [reason, tickers] of Object.entries(leftOut)) console.error(`${tickers.length} left out: ${reason}`);
  const other = listed.filter((row) => !types.includes(row.type)).length;
  if (other) console.error(`${other} rows of another type left out`);
  if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
  return kept;
}
