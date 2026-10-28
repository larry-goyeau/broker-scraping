// What trii Colombia sells in shares and exchange-traded funds, with no
// login. trii is the app of Acciones & Valores S.A. SCB, which sends its
// clients' orders to the Bolsa de Valores de Colombia; US shares are a
// second account, opened through trii with Vector Capital (a Chilean
// broker) and held at Alpaca Securities LLC.
//
// Bogotá. trii's public "Acciones locales y globales" page is the list:
// every card on its two tabs, "Acciones Locales" (the BVC local market)
// and "Acciones Globales" (the Mercado Global Colombiano, foreign shares
// and ETFs that trade on the BVC in pesos). Each card gives a name and the
// BVC ticker only, so each ticker is matched to the BVC's own book
// (../progresion/bvcColombiaBook.mjs, both segments, a line trii lists kept
// even when it has not traded for a year) for its ISIN, type and status.
// trii's tab is not checked against the BVC board: nuam (NUAMCO), on the
// local tab, trades on the MGC board.
// PEI and TIN (real-estate participation titles) and Compass DVA Silicon
// Fund are on trii's list and are typed FUND, as the BVC files them.
// Left out: a card the BVC book does not hold (suspended or off the board),
// and Canacol (CNEC): the BVC suspended its spot trading in November 2025
// after the TSX halt and the company is in a CCAA restructuring, though the
// BVC status still reads "Inactivo" (see ../progresion). Fees, home page
// "Tarifas": "Bolsa de Colombia ... Compra de acciones $ 12.500 + IVA",
// and above $ 5.000.000 "0.25% + IVA".
//
// United States. The "Acciones EE.UU." page: "A través de trii puedes
// comprar acciones y ETFs completos o fraccionados en NYSE y Nasdaq", and
// "Compra o venta de acciones y ETFs 0.2%" for a standard user (free for
// triipro). It publishes no US list ("Accede a miles de opciones
// internacionales" gives no number), so the owner's rule for a place with
// no list applies: the whole US exchange book of the day
// (../wellstrade/usBook.mjs), kept to the two markets trii names, NYSE and
// Nasdaq ("NYSE" read as the NYSE-named markets NYSE, NYSE American, NYSE
// Arca, where almost every ETF lists, and NYSE Texas; see
// ../tfcapital/usTop.mjs). Lines listed on Cboe BZX (mostly ETFs), the
// Texas Stock Exchange or IEX stay out. usBook drops warrants, rights,
// units, when-issued lines, listed notes and lines with an open trade
// halt; bonds go through withoutObligations. No page mentions OTC
// shares, so none is added. The US is one NBBO market: one row per title,
// on its listing market, in dollars. An MGC line (AAPLCO, in pesos on the
// BVC) and the US line (AAPL) are two places, two rows.
// broker-list.json gives the BVC (130 titles), NYSE and Nasdaq, the same
// places.
//
//   https://trii.co/stock-list   (tabs ?tab=local and ?tab=global)
//   https://trii.co/   (fees)
//   https://trii.co/acciones-estados-unidos   (US offer and fees)
//
// Run (about 10 minutes: the BVC book makes three gentle calls a line):
//   node brokers/triico/triico_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bvcColombiaBook } from "../progresion/bvcColombiaBook.mjs";
import { NYSE_NASDAQ } from "../tfcapital/usTop.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const DROP = new Map([["CNEC", "BVC spot trading suspended since November 2025, CCAA restructuring"]]);

async function page(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(40_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw new Error(last);
}

const plain = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const text = plain(await page(url));
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

const decode = (value) =>
  String(value || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// The two tabs of the stock-list page: { local: [...], global: [...] }.
function cards(html) {
  const out = {};
  for (const tab of ["local", "global"]) {
    const start = html.indexOf(`<div id="${tab}" class="stock-container"`);
    if (start < 0) throw new Error(`the trii stock list has no ${tab} tab`);
    const end = html.indexOf("</ul>", start);
    out[tab] = [...html.slice(start, end).matchAll(/<h2>([^<]*)<\/h2>\s*<h3>([^<]*)<\/h3>/g)].map((hit) => ({
      name: decode(hit[1]),
      ticker: decode(hit[2]).toUpperCase(),
    }));
  }
  if (out.local.length < 25 || out.global.length < 60) throw new Error(`short trii list: ${out.local.length} local, ${out.global.length} global`);
  return out;
}

await evidence("https://trii.co/", [/Bolsa de Colombia Operación Costo Compra de acciones \$ 12\.500 \+ IVA/, /Compra de acciones 0\.25% \+ IVA/]);
await evidence("https://trii.co/acciones-estados-unidos", [
  /comprar acciones y ETFs completos o fraccionados en NYSE y Nasdaq/,
  /Compra o venta de acciones y ETFs 0\.2%/,
  /Alpaca Securities LLC/,
]);
const list = cards(await page("https://trii.co/stock-list"));
const listed = [...list.local.map((card) => ({ ...card, segment: "EQTY" })), ...list.global.map((card) => ({ ...card, segment: "MGC" }))];

const bvc = await bvcColombiaBook({ keep: listed.map((card) => card.ticker), quiet: true });
const byTicker = new Map(bvc.map((row) => [row.ticker, row]));
const home = [];
const missing = [];
const dropped = [];
const moved = [];
for (const card of listed) {
  if (DROP.has(card.ticker)) {
    dropped.push(`${card.ticker} (${DROP.get(card.ticker)})`);
    continue;
  }
  const row = byTicker.get(card.ticker);
  if (!row) {
    missing.push(card.ticker);
    continue;
  }
  if (row.segment !== card.segment) moved.push(`${card.ticker} (trii ${card.segment}, BVC ${row.segment})`);
  const { segment, ...rest } = row;
  home.push({ ...rest, query: row.isin || row.ticker, raw: `${row.raw} | trii: ${card.name}` });
}
if (missing.length > 8) throw new Error(`trii cards the BVC book lacks: ${missing.join(", ")}`);
for (const ticker of ["ECOPETROL", "CIBEST", "ICOLCAP", "AAPLCO"]) if (!home.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);

const book = await usBook();
const us = book.filter((row) => NYSE_NASDAQ.has(row.mic));
for (const ticker of ["AAPL", "JPM", "SPY", "QQQ"]) if (!us.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the US book`);

const rows = stampRows(withoutObligations([...home, ...us]));
fs.writeFileSync(new URL("triico-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`trii list: ${list.local.length} local + ${list.global.length} global cards; ${home.length} kept on the BVC`);
if (moved.length) console.error(`on the other BVC board than trii's tab: ${moved.join(", ")}`);
console.error(`left out: ${dropped.join(", ") || "none"}; not in the BVC book: ${missing.join(", ") || "none"}`);
console.error(`US directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, items] of Object.entries(book.report.leftOut)) if (items.length) console.error(`US left out ${items.length} ${what}`);
console.error(`US left out ${book.length - us.length} lines listed off NYSE/Nasdaq`);
