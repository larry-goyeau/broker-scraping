// The share and ETF book of the Bolsa de Comercio de Santiago (BCS, MIC
// XSGO), shared by the scrapers of the Chilean corredoras whose catalogue
// is the Santiago exchange (brokers/banchile first). Same reading as
// ../ccbolsa/ccbolsa_scraping.mjs, which keeps its own copy, with three
// changes so that several scrapers can share it:
//
// - Both currencies are kept. The exchange's price list gives each line its
//   currency (MONEDA): a foreign share or ETF of the "mercado de valores
//   extranjeros" can be quoted in pesos (KOCL) and in dollars (KO), and the
//   house rule is one row per currency when the source gives it per line.
//   A scraper whose broker trades pesos only passes { currencies: ["CLP"] }.
// - Each row carries the line's traded amount of the day (row.traded, from
//   the price list's amount field) so that a broker that states a number of
//   titles can keep the most traded ones (topSantiago below).
// - The result is kept in santiago-book.json next to this file and served
//   from there while it is under MAX_AGE_DAYS old.
//
// Source: the exchange's own price list (the page
// https://www.bolsadesantiago.com/acciones_precios and the two calls behind
// it, RV_ResumenMercado/getAccionesPrecios for NEMO, ISIN, MONEDA and the
// foreign-security flags, RV_ResumenMercado/getInstrumentos for the names).
// bolsadesantiago.com sits behind a Radware bot manager that answers a
// captcha page to scripts and to headless browsers, so, as for CCBolsa, the
// calls are made from inside the page in the owner's own Chrome, started
// with --remote-debugging-port=9222 and with the site already open once,
// with the site's CSRF token. Nothing here solves or skips the captcha: if
// the page is not served, the run stops and says so.
//
// Kept: Chilean shares, foreign shares (flag VALORES_EXTRANJEROS), foreign
// ETFs (flag ETFs_EXTRANJEROS, or a foreign line whose name says ETF) and
// the Chilean ETFs, which are a mutual-fund line (CFMITNIPSA, It Now MSCI
// IPSA) or an investment-fund line (CFI*) whose name says ETF. Left out: a
// CFI* or CFM* line whose name is not an ETF (an ordinary investment or
// mutual fund), and a line with no trade in the last 365 days when the
// price list gives a last-trade date (dormant and suspended lines; the
// exchange publishes no suspension flag in this list). rows.dropped says
// which lines and why. The ISIN is the exchange's own; a line without one
// gets the ticker's BCS ISIN in ../../assets/stocks.csv when there is
// exactly one.
//
// Use:
//   import { santiagoBook, topSantiago } from "../banchile/santiagoBook.mjs";
//   const rows = await santiagoBook("Banchile");                 // CLP and USD lines
//   const rows = await santiagoBook("X", { currencies: ["CLP"] });
//   const top = topSantiago(rows, { STOCK: 80, ETF: 230 });      // most traded
//
//   node brokers/banchile/santiagoBook.mjs   (reads the exchange again, prints the counts)

import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const EXCHANGE = "BCS";
export const MIC = "XSGO";
const PAGE = "https://www.bolsadesantiago.com/acciones_precios";
const BOOK = new URL("santiago-book.json", import.meta.url);
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const MAX_AGE_DAYS = 3;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function puppeteer() {
  try {
    const require = createRequire(import.meta.url);
    return (await import(require.resolve("puppeteer-core"))).default;
  } catch {
    return (await import("puppeteer-core")).default;
  }
}

// The two lists, read from inside the exchange's page in the local Chrome.
async function readExchange() {
  const browser = await (await puppeteer()).connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null }).catch((error) => {
    throw new Error(`santiagoBook needs the local Chrome on port 9222 (as ../ccbolsa does): ${error.message}`);
  });
  const page = await browser.newPage();
  let lists = null;
  try {
    for (let attempt = 0; attempt < 5 && !lists; attempt += 1) {
      await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await sleep(10_000);
      if (/captcha|block page/i.test(await page.title())) throw new Error("bolsadesantiago.com answered its bot-manager page; open it once by hand in that Chrome");
      lists = await page.evaluate(async () => {
        const call = async (path) => {
          const token = await (await fetch("/api/Securities/csrfToken")).json();
          const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json;charset=UTF-8", "X-CSRF-Token": token.csrf }, body: "{}" });
          if (!response.ok) return null;
          return (await response.json()).listaResult;
        };
        const prices = await call("/api/RV_ResumenMercado/getAccionesPrecios");
        const names = await call("/api/RV_ResumenMercado/getInstrumentos");
        return Array.isArray(prices) && Array.isArray(names) ? { prices, names } : null;
      });
    }
  } finally {
    await page.close();
    browser.disconnect();
  }
  if (!lists) throw new Error("bolsadesantiago.com refused the price list five times");
  return lists;
}

// The first numeric field among the names the price list may use for the
// day's traded amount, and the first date field for the last trade.
const AMOUNT_KEYS = ["MONTO", "MONTO_TRANSADO", "MONTO_NEGOCIADO", "MONTO_ACUMULADO", "MONTO_TRANSADO_CLP", "VOLUMEN_MONTO"];
const DATE_KEYS = ["FECHA_ULTIMA_TRANSACCION", "FECHA_ULT_TRANSACCION", "FECHA_ULTIMO_PRECIO", "FECHA_TRANSACCION", "FECHA"];
const pick = (line, keys) => keys.find((key) => line[key] !== undefined && line[key] !== null && line[key] !== "");

function toDate(value) {
  const text = String(value);
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso.slice(1).join("-");
  const cl = text.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
  return cl ? `${cl[3]}-${cl[2]}-${cl[1]}` : "";
}

function build(lists) {
  const nameOf = new Map(lists.names.map((row) => [String(row.NEMO || "").trim(), String(row.RAZON_SOCIAL || "").replace(/\s+/g, " ").trim()]));
  const catalogue = new Map();
  for (const line of fs.readFileSync(STOCKS, "utf8").split(/\r?\n/)) {
    const [ticker, place, isin] = line.split(",");
    if (place !== "BCS" || !ISIN.test(isin || "")) continue;
    const code = ticker.split(":").pop().replace(/_/g, "-");
    if (!catalogue.has(code)) catalogue.set(code, new Set());
    catalogue.get(code).add(isin);
  }
  const cutoff = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const rows = [];
  const dropped = [];
  const seen = new Set();
  for (const line of lists.prices) {
    const ticker = String(line.NEMO || "").trim();
    const currency = String(line.MONEDA || "").trim().toUpperCase();
    if (!ticker || seen.has(`${ticker} ${currency}`)) continue;
    seen.add(`${ticker} ${currency}`);
    const name = nameOf.get(ticker) || ticker;
    const etf = /\bETF\b/i.test(name);
    const foreign = Boolean(line.VALORES_EXTRANJEROS);
    const foreignEtf = Boolean(line.ETFs_EXTRANJEROS) || (foreign && etf);
    if (/^CF[IM]/.test(ticker) && !etf) { dropped.push(`${ticker} fund that is not an ETF`); continue; }
    if (currency !== "CLP" && currency !== "USD") { dropped.push(`${ticker} currency ${currency || "none"}`); continue; }
    const dateKey = pick(line, DATE_KEYS);
    const last = dateKey ? toDate(line[dateKey]) : "";
    if (last && last < cutoff) { dropped.push(`${ticker} last trade ${last}`); continue; }
    let isin = ISIN.test(line.ISIN || "") ? line.ISIN : "";
    if (!isin && catalogue.get(ticker)?.size === 1) isin = [...catalogue.get(ticker)][0];
    const amountKey = pick(line, AMOUNT_KEYS);
    const traded = amountKey ? Number(String(line[amountKey]).replace(/[^\d.-]/g, "")) || 0 : null;
    const kind = foreignEtf ? "foreign ETF" : foreign ? "foreign share" : etf ? "Chilean ETF" : "Chilean share";
    rows.push({ query: ticker, ticker, name, exchange: EXCHANGE, mic: MIC, currency, type: foreignEtf || etf ? "ETF" : "STOCK", isin, kind, traded, raw: [ticker, name, isin, currency, kind, last && `last trade ${last}`].filter(Boolean).join(" | ") });
  }
  const shares = rows.filter((row) => row.kind === "Chilean share").length;
  if (shares < 150) throw new Error(`only ${shares} Chilean shares on the Santiago price list`);
  rows.sort((a, b) => a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
  const sample = lists.prices[0] || {};
  return { built: new Date().toISOString(), fields: Object.keys(sample), rows, dropped };
}

function cached() {
  try {
    const book = JSON.parse(fs.readFileSync(BOOK, "utf8"));
    if (Date.now() - Date.parse(book.built) < MAX_AGE_DAYS * 86_400_000) return book;
  } catch {}
  return null;
}

export async function santiagoBook(label, { currencies = ["CLP", "USD"], fresh = false } = {}) {
  let book = fresh ? null : cached();
  if (book) console.error(`${label}: Santiago price list from santiago-book.json, read ${book.built.slice(0, 10)}`);
  else {
    book = build(await readExchange());
    fs.writeFileSync(BOOK, JSON.stringify(book, null, 1));
  }
  const rows = book.rows.filter((row) => currencies.includes(row.currency)).map(({ kind, ...row }) => ({ ...row }));
  rows.dropped = [...book.dropped, ...book.rows.filter((row) => !currencies.includes(row.currency)).map((row) => `${row.ticker} ${row.currency} line`)];
  rows.kinds = Object.fromEntries(book.rows.filter((row) => currencies.includes(row.currency)).reduce((map, row) => map.set(row.kind, (map.get(row.kind) || 0) + 1), new Map()));
  return rows;
}

// A broker that states how many titles it sells: the most traded titles of
// each type (one ticker = one title, all its currency lines kept), by the
// day's traded amount on the price list. Stops when the list carries no
// amount field.
export function topSantiago(rows, counts) {
  if (rows.some((row) => row.traded === null)) throw new Error("the Santiago price list has no traded-amount field to rank by; see santiago-book.json fields");
  const kept = new Set();
  for (const [type, count] of Object.entries(counts)) {
    const byTicker = new Map();
    for (const row of rows.filter((r) => r.type === type)) byTicker.set(row.ticker, (byTicker.get(row.ticker) || 0) + row.traded);
    [...byTicker].sort((a, b) => b[1] - a[1]).slice(0, count).forEach(([ticker]) => kept.add(ticker));
  }
  return rows.filter((row) => kept.has(row.ticker));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const rows = await santiagoBook("Santiago", { fresh: true });
  console.error(`Santiago: ${rows.length} rows`, rows.kinds, `${rows.filter((row) => row.isin).length} with an ISIN; left out ${rows.dropped.length}`);
}
