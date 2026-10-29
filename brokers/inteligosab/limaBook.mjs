// The share and ETF book of the Bolsa de Valores de Lima (BVL, MIC XLIM),
// shared by the scrapers of the Peruvian brokers (sociedades agentes de
// bolsa) whose catalogue is the whole exchange (brokers/inteligosab first).
//
// Source: the BVL's own open data API behind https://www.bvl.com.pe/
// (dataondemand.bvl.com.pe, no login, CORS from www.bvl.com.pe):
// - POST v1/stock-quote/market {isToday: true}: every renta variable line
//   on the day's board, traded or not, with its segment, currency (S/ or
//   US$), sector, last trade time (lastDate) and the date of the previous
//   close (previousDate). Three segments:
//     RV1  the main board of Peruvian shares, the local ETFs (sector UP:
//          Van Eck "Fondo Bursátil" ETFPERUD, ETFPESOV) and the FIBRAs;
//     RV2  the second board (Peruvian shares with little or no trading:
//          banks, insurers, AFPs, farms);
//     RV3  the foreign-securities segment ("mercado extranjero"): US and
//          other foreign shares and ETFs that a sponsor has listed on the
//          BVL, traded on the BVL in dollars.
// - GET v1/issuers/{companyCode}/value: each local issuer's securities with
//   their ISIN. Foreign lines (companyCode XXX) carry no issuer sheet: their
//   ISIN comes from assets/stocks.csv and assets/etfs.csv (BVL:<ticker>US,
//   else the same ticker on its US or London home listing), else it is left
//   empty.
//
// Left out (rows.dropped says which lines, and why):
// - Never-traded and dormant lines: no trade date at all, or the last one
//   more than 365 days old (`dormantDays`). The BVL publishes no suspension
//   list in this API; a line with no trade in a year is not a market. On
//   2026-10-28 that removed some 120 RV2 lines (most banks, insurers and
//   farms of the second board never trade) and about 85 RV3 lines.
// - Investment funds that are not exchange-traded index funds: sector FI
//   (the Coril short-term instrument funds, FICCMP*, FICRPS*...).
// Kept: shares (STOCK), the local Van Eck ETFs and the foreign ETFs (ETF:
// sector UP, or a foreign line that assets/etfs.csv files as an ETF or whose
// name says ETF / Fund / Trust / iShares / SPDR / ProShares / Direxion),
// and the FIBRAs (FIBPRIME, FIBCCAP: listed real-estate trust certificates,
// typed FUND as the closed-end funds of the other books).
// Currency is the line's own: S/ is PEN, US$ is USD. A company quoted in
// both has one row per line.
//
// Use:
//   import { limaBook } from "../inteligosab/limaBook.mjs";
//   const rows = await limaBook();                          // every segment
//   const rows = await limaBook({ segments: ["RV1", "RV2"] }); // local only
//   rows.dropped                                           // left out, and why
//
//   node brokers/inteligosab/limaBook.mjs     (prints the counts)

import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const EXCHANGE = "Bolsa de Valores de Lima";
export const MIC = "XLIM";
export const SEGMENTS = ["RV1", "RV2", "RV3"];
const API = "https://dataondemand.bvl.com.pe/v1";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const HEADERS = { "User-Agent": UA, Origin: "https://www.bvl.com.pe", Referer: "https://www.bvl.com.pe/", Accept: "application/json" };
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const FUNDISH = /\b(ETF|ETN|FUND|TRUST|ISHARES|SPDR|PROSHARES|DIREXION|VANECK|INVESCO QQQ|SELECT SECTOR|UCITS)\b/i;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(path, body) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(`${API}/${path}`, {
        method: body ? "POST" : "GET",
        headers: body ? { ...HEADERS, "Content-Type": "application/json" } : HEADERS,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(40_000),
      });
      if (response.ok) return await response.json();
      last = `${response.status} ${path}`;
    } catch (error) {
      last = `${error.message || error} ${path}`;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(`BVL API: ${last}`);
}

// BVL:<ticker>US (and BVL:<ticker>) -> ISIN and ETF flag from the shared
// lists; failing that, the same ticker on a US exchange (NYSE, Nasdaq, NYSE
// American / Arca, Cboe) when the lists hold one ISIN for it, then on the
// LSE (the UCITS ETFs of the segment).
const HOME = ["NYSE", "NASDAQ", "AMEX", "CBOE", "LSE"];
function sharedLists() {
  const map = new Map();
  const home = new Map();
  for (const [file, etf] of [["stocks.csv", false], ["etfs.csv", true]]) {
    const text = fs.readFileSync(new URL(`../../assets/${file}`, import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const [ticker, exchange, isin] = line.split(",");
      if (!ISIN.test(isin || "")) continue;
      if (HOME.includes(exchange)) {
        const key = `${exchange}:${ticker.split(":").pop()}`;
        if (!home.has(key)) home.set(key, new Map());
        home.get(key).set(isin, etf);
      }
      if (exchange !== "BVL") continue;
      const code = ticker.slice(4);
      if (!map.has(code)) map.set(code, { isin, etf });
    }
  }
  map.home = (code) => {
    for (const exchange of HOME) {
      const hit = home.get(`${exchange}:${code}`);
      if (hit?.size === 1) { const [[isin, etf]] = [...hit]; return { isin, etf }; }
    }
    return null;
  };
  return map;
}

export async function limaBook({ segments = SEGMENTS, dormantDays = 365, quiet = false } = {}) {
  const market = await api("stock-quote/market", { sector: "", isToday: true, companyCode: "", inputCompany: "" });
  const lines = Array.isArray(market?.content) ? market.content : [];
  if (lines.length < 500) throw new Error(`BVL board has only ${lines.length} lines`);
  const cutoff = new Date(Date.now() - dormantDays * 86_400_000).toISOString().slice(0, 10);
  const shared = sharedLists();
  const dropped = [];
  const kept = [];
  for (const line of lines) {
    const ticker = String(line.nemonico || "").trim();
    if (!ticker || !segments.includes(line.segment)) continue;
    const traded = String(line.lastDate || line.previousDate || "").slice(0, 10);
    if (!traded) { dropped.push(`${ticker} never traded`); continue; }
    if (traded < cutoff) { dropped.push(`${ticker} last trade ${traded}`); continue; }
    if (line.sectorCode === "FI") { dropped.push(`${ticker} investment fund`); continue; }
    kept.push(line);
  }

  // Local ISINs, one issuer sheet per company.
  const isinOf = new Map();
  const codes = [...new Set(kept.map((line) => line.companyCode).filter((code) => code && code !== "XXX"))];
  for (const code of codes) {
    const values = await api(`issuers/${code}/value`);
    for (const value of Array.isArray(values) ? values : []) {
      if (value?.nemonico && ISIN.test(value.isin || "")) isinOf.set(value.nemonico.trim(), value.isin);
    }
    await sleep(150);
  }

  const rows = [];
  for (const line of kept) {
    const ticker = line.nemonico.trim();
    const name = String(line.companyName || line.shortName || ticker).replace(/\s+/g, " ").trim();
    const foreign = line.segment === "RV3";
    const listed = foreign ? shared.get(`${ticker}US`) || shared.get(ticker) || shared.home(ticker.replace(/\/.*$/, "")) : null;
    const isin = foreign ? listed?.isin || "" : isinOf.get(ticker) || "";
    let type = "STOCK";
    if (line.sectorCode === "UP" || (foreign && (listed?.etf || FUNDISH.test(name)))) type = "ETF";
    else if (/^FIB/.test(ticker)) type = "FUND";
    const currency = line.currency === "S/" ? "PEN" : line.currency === "US$" ? "USD" : "";
    if (!currency) throw new Error(`${ticker}: unknown currency ${line.currency}`);
    rows.push({ query: ticker, ticker, name, exchange: EXCHANGE, mic: MIC, currency, type, isin, segment: line.segment, raw: [ticker, name, isin, currency, line.segment, `last trade ${String(line.lastDate || line.previousDate).slice(0, 10)}`].filter(Boolean).join(" | ") });
  }
  rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
  rows.dropped = dropped;
  if (!quiet) {
    const count = (segment) => rows.filter((row) => row.segment === segment).length;
    console.error(`BVL: ${rows.length} lines (${segments.map((segment) => `${segment} ${count(segment)}`).join(", ")}), ${rows.filter((row) => row.isin).length} with an ISIN; left out ${dropped.length} (${dropped.filter((d) => /never|last trade/.test(d)).length} dormant or never traded, ${dropped.filter((d) => /fund/.test(d)).length} investment funds)`);
  }
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const rows = await limaBook();
  const counts = {};
  for (const row of rows) counts[`${row.segment} ${row.type} ${row.currency}`] = (counts[`${row.segment} ${row.type} ${row.currency}`] || 0) + 1;
  console.error(counts);
}
