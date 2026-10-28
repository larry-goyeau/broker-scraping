// What Webull México (webull.com.mx) sells, with no login. US trading is
// done in a dollar account at Webull Financial LLC: "Con Webull Financial
// LLC, puedes tener una cuenta en la que depositas tus dólares y operas
// (compra/venta) en el mercado de valores de Estados Unidos" (Vifaru, the
// Mexican casa de bolsa, holds the peso side and buys the dollars). The
// help centre says what that account trades: "Puedes operar con acciones
// cotizadas en la bolsa estadounidense, acciones extrabursátiles (OTC),
// fondos cotizados en bolsa (ETF), ofertas públicas iniciales (IPOs),
// Opciones de acciones y Opciones de índices."
//
//   https://www.webull.com.mx/
//   https://www.webull.com.mx/help/faq/1016   (Inversiones admitidas y Tipos de órdenes)
//
// 1. Listed lines. No page names a board, a segment or a kind of listed
//    share or fund left out, so they are the whole US exchange book of the
//    day (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership
//    units, preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE,
//    NYSE American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less
//    the lines with an open trade halt.
//
// 2. OTC lines. "Webull Financial, LLC., admite la negociación de un número
//    limitado de valores OTC, que se enumeran aquí" (the Mexican page
//    carries no link). That list is Webull Financial's own OTC list, the
//    one webull.com/ko-yield/otc-list loads: quotes-gw.webullfintech.com
//    .../wlas/ranking/otclist?rankType=otc_v2.all&regionId=6 (OTC_URL
//    below, read with the US web site's headers as brokers/webullus does).
//    Each line becomes an "OTC Markets" (OTCM) row in USD; its ISIN comes
//    from assets/stocks.csv's OTC line, else it is left empty.
//      https://www.webull.com.mx/help/faq/1073   (Valores excluidos de cotización)
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). The US is one NBBO market: one row per title, on
// its primary listing, in dollars.
//
// Remarks, not removals: the peso account at Vifaru, S.A. de C.V., Casa
// de Bolsa converts MXN to USD ("Aprovecha un tipo de cambio competitivo
// al depositar pesos mexicanos y operar en dólares americanos").
//
// Fees: the site's "COMISIONES" link (https://www.webull.com.mx/pricing)
// redirects to Webull Financial's schedule: "Webull does not charge
// commissions for trading stocks, ETFs and options listed on U.S.
// exchanges", plus SEC and CAT pass-through fees and "Potential Fees for
// trading OTC securities" (low-priced securities, F-stocks):
//   https://www.webull.com/pricing
//
//   node brokers/webullmexico/webullmexico_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const STOCKS_CSV = new URL("../../assets/stocks.csv", import.meta.url);
const OTC_URL =
  "https://quotes-gw.webullfintech.com/api/wlas/ranking/otclist?direction=-1&pageIndex=1&pageSize=500&rankType=otc_v2.all&regionId=6";
const GATEWAY_HEADERS = {
  app: "global",
  appid: "wb_web_us",
  "app-group": "broker",
  platform: "web",
  "device-type": "Web",
  hl: "en",
  os: "web",
  ver: "1.0.0",
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0",
};
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

async function getJson(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: GATEWAY_HEADERS, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`${response.status} for ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  throw lastError;
}

function splitCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

// assets/stocks.csv keys OTC lines as "OTC:<ticker>".
function otcIndex() {
  const index = new Map();
  for (const line of fs.readFileSync(STOCKS_CSV, "utf8").split(/\r?\n/)) {
    if (!line.startsWith("OTC:")) continue;
    const [key, exchange, isin, name] = splitCsvLine(line);
    if (exchange !== "OTC" || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin || "")) continue;
    const ticker = key.slice(4).replace(/[\s/]+/g, ".").toUpperCase();
    if (!index.has(ticker)) index.set(ticker, { isin, name: (name || "").trim() });
  }
  return index;
}

await evidence("https://www.webull.com.mx/", [
  /Con Webull Financial LLC, puedes tener una cuenta en la que depositas tus d.lares/,
]);
await pause();
await evidence("https://www.webull.com.mx/help/faq/1016", [
  /acciones cotizadas en la bolsa estadounidense, acciones extraburs.tiles \(OTC\), fondos cotizados en bolsa \(ETF\)/,
]);
await pause();
await evidence("https://www.webull.com.mx/help/faq/1073", [/admite la negociaci.n de un n.mero limitado de valores OTC/]);
await pause();
await evidence("https://www.webull.com/pricing", [
  /Webull does not charge commissions for trading stocks, ETFs and options listed on U\.S\. exchanges/,
  /Potential Fees for trading OTC securities/,
]);
await pause();

// 1. Listed lines.
const book = await usBook();
const rows = [...book];
const listed = new Set(rows.map((row) => row.ticker));

// 2. Webull Financial's OTC list.
const otc = await getJson(OTC_URL);
const entries = (otc.data || []).map((entry) => entry.ticker).filter(Boolean);
if (entries.length < 100) throw new Error(`OTC list came back with ${entries.length} names`);
if (otc.hasMore) throw new Error(`OTC list holds more than one page (${otc.total})`);
const csv = otcIndex();
const seen = new Set();
let withIsin = 0;
const skipped = [];
for (const entry of entries) {
  if (entry.listStatus !== 1 || entry.template !== "stock") {
    skipped.push(`${entry.symbol} (${entry.template}, listStatus ${entry.listStatus})`);
    continue;
  }
  const ticker = String(entry.disSymbol || entry.symbol || "").replace(/[\s/]+/g, ".").toUpperCase();
  if (!ticker || seen.has(ticker) || listed.has(ticker)) continue;
  seen.add(ticker);
  const found = csv.get(ticker);
  if (found) withIsin += 1;
  const currency = entry.currencyCode || "USD";
  rows.push({
    query: found?.isin || ticker,
    ticker,
    name: found?.name || String(entry.name || ticker).trim(),
    exchange: "OTC Markets",
    mic: "OTCM",
    currency,
    type: "STOCK",
    isin: found?.isin || "",
    raw: [ticker, String(entry.name || "").trim(), entry.disExchangeCode, entry.isAdr ? "ADR" : "", currency].filter(Boolean).join(" | "),
  });
}

const out = stampRows(withoutObligations(rows));
if (out.length < 10000) throw new Error(`only ${out.length} rows`);
fs.writeFileSync(new URL("webullmexico-parsed.json", import.meta.url), JSON.stringify(out, null, 2));

const counts = {};
for (const row of out) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${out.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`OTC: ${entries.length} on Webull's list, ${seen.size} rows, ${withIsin} with an ISIN; skipped ${skipped.length}${skipped.length ? `: ${skipped.join(", ")}` : ""}`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
