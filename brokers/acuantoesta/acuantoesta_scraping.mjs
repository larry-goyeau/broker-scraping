// What A Cuánto Está sells in Buenos Aires shares and CEDEARs, with no
// login. A Cuánto Está is the site of IT Inversiones S.A. (agente
// productor, CNV 1444); every order goes through LBO S.A. (ALyC, CNV 160).
// Its "Cotizaciones" pages, /acciones and /cedears, load two public files
// from data912.com in the browser: live/arg_stocks (local shares, peso
// and dollar lines) and live/arg_cedears (every CEDEAR, ETF certificates
// such as SPY, QQQ and IBIT included, with its dollar lines). Those two
// files are the catalogue. Bonds, letters, options and cauciones are other
// pages.
//
// The files name the BYMA symbol only. Its currency, type and ISIN come
// from BYMA's open data (../comafi/byma.mjs, shared with brokers/comafi
// and brokers/gio). A symbol BYMA no longer quotes, a block line (GGALB),
// a closed-end fund (REIT and its dollar lines) and a kind that is not a
// share, a CEDEAR or an ADR are not written.
//
// Cable lines (C, contado con liquidación: the line settled in dollars
// held abroad, such as AAPLC or REITC) are in the files but are not
// written: the account moves money only through local accounts. The
// tutorial funds it by transfer to a CVU, or for dollars by the option
// "U$S Dolar Local" to LBO's account, always from an account in the
// client's own name, and withdraws to a CBU/CVU the same way. The /cedears
// page itself drops the C lines and shows the D line as the dollar price.
// The MEP (D) and peso lines stay, as two USD and ARS rows.
//   https://www.acuantoesta.com.ar/tutoriales
//
// The fee schedule (/tarifario-comisiones) also prices "Acciones - ETF
// NYSE/ NASDAQ", but no page lists those titles, so none is written.
//
// A line with no price in the file, and none on BYMA, that BYMA's daily
// history shows no trade on in two years is listed but never quoted, and
// is not written (byma.mjs). A price alone does not make a market: the
// files carry stub bids (ADS at 10 pesos against a last of 3,980, YZCA at
// 0.01) and lone offers (ELPCD) on lines that have not traded for years.
// So every line with no trade today in the file (v and q_op zero) is
// looked up again in BYMA's daily history (bymaActivity.mjs, next to this
// file): it is not written with no trade in two years, a last trade more
// than 180 days old (INGD, SCHW), or under 5 trade days and none in the
// last 30 (SBSPD, YELPD). A CEDEAR of a bond (a maturity date
// or a coupon in its name) is not written either.
//
// A dollar line ending in C whose peso stem is the same certificate (same
// ISIN) but which has no D line next to it (EC, next to Eni's E) is the
// cable line too: BYMA labels it USD and byma.mjs only spots a C line by
// its D sibling. The /cedears page drops it with the other C lines, and
// it is not written.
//
//   https://www.acuantoesta.com.ar/acciones
//   https://www.acuantoesta.com.ar/cedears
//   https://www.acuantoesta.com.ar/tarifario-comisiones
//   https://data912.com/live/arg_stocks
//   https://data912.com/live/arg_cedears
//   https://open.bymadata.com.ar/
//
//   node brokers/acuantoesta/acuantoesta_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaRows, clean, expectLine, getText, pause, summary } from "../comafi/byma.mjs";
import { isBondCedear, withoutDormant } from "./bymaActivity.mjs";

const FILES = [
  { url: "https://data912.com/live/arg_stocks", page: "acciones", floor: 80 },
  { url: "https://data912.com/live/arg_cedears", page: "cedears", floor: 900 },
];

const entries = [];
for (const file of FILES) {
  const text = await getText(file.url, { Referer: `https://www.acuantoesta.com.ar/${file.page}` });
  let lines;
  try {
    lines = JSON.parse(text);
  } catch {
    throw new Error(`${file.url} is not JSON: ${text.slice(0, 80)}`);
  }
  if (!Array.isArray(lines)) throw new Error(`${file.url} is not a list`);
  for (const line of lines) {
    const symbol = clean(line?.symbol).toUpperCase();
    if (!/^[A-Z0-9.]+$/.test(symbol)) throw new Error(`${file.url} has symbol ${JSON.stringify(line?.symbol)}`);
    if (typeof line.c !== "number") throw new Error(`${file.url} ${symbol} has no price field`);
    entries.push({
      symbol,
      // A price in the file today: the last trade, a bid or an offer.
      live: [line.c, line.px_bid, line.px_ask].some((value) => Number(value) > 0),
      // A trade in the file today (volume or a count of trades).
      traded: Number(line.v) > 0 || Number(line.q_op) > 0,
      raw: [file.page, symbol].join(" | "),
    });
  }
  console.error(`${file.url}: ${lines.length} lines`);
  if (lines.length < file.floor) throw new Error(`${file.url} has only ${lines.length} lines`);
  await pause(300);
}

const read = await bymaRows(entries, "A Cuánto Está", { cable: false });
const { dropped, board } = read;

// The cable line with no D sibling (EC): a USD line ending in C whose
// stem is a peso line of the same ISIN, with no D line on BYMA.
const byTicker = new Map(read.rows.map((row) => [row.ticker, row]));
const lone = new Set(
  read.rows
    .filter((row) => {
      if (!row.ticker.endsWith("C") || row.currency !== "USD" || !row.isin) return false;
      const stem = byTicker.get(row.ticker.slice(0, -1));
      return stem?.currency === "ARS" && stem.isin === row.isin && !board.has(`${row.ticker.slice(0, -1)}D`);
    })
    .map((row) => row.ticker)
);
const bonds = new Set(read.rows.filter(isBondCedear).map((row) => row.ticker));
for (const ticker of lone) dropped.push(`${ticker} cable line with no D line`);
for (const ticker of bonds) dropped.push(`${ticker} CEDEAR of a bond: ${byTicker.get(ticker).name}`);
const traded = new Set(entries.filter((entry) => entry.traded).map((entry) => entry.symbol));
if (traded.size < 300) throw new Error(`only ${traded.size} lines of the files traded today`);
const active = await withoutDormant(
  read.rows.filter((row) => !lone.has(row.ticker) && !bonds.has(row.ticker)),
  traded,
  "A Cuánto Está"
);
dropped.push(...active.dropped);
const rows = active.rows;
console.error(
  `A Cuánto Está: ${active.checked} lines with no trade today checked on BYMA's history; left out ` +
    `${active.counts.never} with no trade in two years, ${active.counts.stale} last traded over 180 days ago, ` +
    `${active.counts.few} with under 5 trade days and none in 30, ${lone.size} cable lines with no D line, ${bonds.size} bond CEDEARs` +
    (active.dropped.length ? ` (${active.dropped.join("; ")})` : "")
);

const listed = new Set(entries.map((entry) => entry.symbol));
const gone = [...listed].filter((symbol) => !board.has(symbol));
if (gone.length > 20) throw new Error(`${gone.length} symbols of the files are not on BYMA: ${gone.slice(0, 20).join(" ")}`);

expectLine(rows, "GGAL", "ARS", "STOCK", "ARP495251018");
expectLine(rows, "GGALD", "USD", "STOCK", "ARP495251018");
expectLine(rows, "YPFD", "ARS", "STOCK", "ARP9897X1319");
expectLine(rows, "BMA.D", "USD", "STOCK", "ARBANS010010");
expectLine(rows, "AAPL", "ARS", "STOCK", "ARDEUT116183");
expectLine(rows, "AAPLD", "USD", "STOCK", "ARDEUT116183");
expectLine(rows, "SPY", "ARS", "ETF", "ARCAVA460131");
expectLine(rows, "SPYD", "USD", "ETF", "ARCAVA460131");
for (const left of ["AAPLC", "GGALB", "REIT"]) {
  if (rows.some((row) => row.ticker === left)) throw new Error(`${left} was kept`);
}
const local = rows.filter((row) => row.panel === "local");
const cedears = rows.filter((row) => row.panel === "cedear");
if (local.length < 75) throw new Error(`Buenos Aires shares were short: ${local.length}`);
if (cedears.length < 550) throw new Error(`CEDEARs were short: ${cedears.length}`);
if (cedears.filter((row) => row.type === "ETF").length < 60) throw new Error("CEDEAR ETFs were short");

summary("A Cuánto Está", rows, dropped);
const kept = rows.map(({ panel, ...row }) => row);
fs.writeFileSync(new URL("acuantoesta-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(kept)), null, 2));
