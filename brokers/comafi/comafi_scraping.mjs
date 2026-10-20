// What Comafi Bursátil sells in Buenos Aires shares and CEDEARs, with no
// login. Comafi's own quote board (comafi-inversiones.com.ar, the
// "Cotizaciones" link of comafi.com.ar/bursatil) loads one public file,
// json/main.json, whose asset table holds every line of the board. Its
// equity page has two tabs: "Acciones" (local shares, with a few dollar
// lines such as BMA.D or TECOD) and "Cedears" (every CEDEAR in pesos, ETF
// certificates such as SPY, QQQ and IBIT included, with a few dollar
// lines). Those two tabs are the catalogue. Lines whose asset class is
// "fci" (equity mutual funds shown at the foot of the Acciones tab) are
// funds, not listed shares, and are left out; the bond, option and fund
// tabs are other products.
//
// The board names the BYMA symbol only. Its currency, type and ISIN come
// from BYMA's open data (byma.mjs in this folder, shared with brokers/gio):
// a symbol BYMA no longer quotes and a block line (GGALB, GE..B) are not
// written. The board prints no currency per line, and Comafi lists mostly
// the peso line of each title, so each row keeps the currency of the line
// the board names; no other currency line is added (deposits.mjs has no
// entry for Comafi).
//
// Cable lines (C, contado con liquidación: the line settled in dollars
// held abroad, such as BMA.C, GOGLC, TGSUC) are on the board but are not
// written: nothing Comafi publishes lets a client hold dollars abroad.
// Its FAQ funds an account only by transfer to its two Banco Comafi
// accounts, "En pesos" and "En dólares: C.B.U. Nº 2990000000011591450215"
// (local CBUs); the only currency product on its menu is "Dólar MEP"; its
// fee schedule (F.2910047) has no cable, CCL or foreign-transfer line; and
// an account needs "domicilio en la Argentina". The MEP (D) and peso lines
// stay.
//   https://www.comafi.com.ar/bursatil/json/apps/GetFaq.aspx?note=2694
//   https://www.comafi.com.ar/bursatil/dolar-mep.aspx
//   https://www.comafi.com.ar/bursatil/docs/F.2910047-Conformidad-Comisiones-y-Gastos-Comafi-Bursatil.pdf
//
// A line with no price today, on Comafi's board or on BYMA, that BYMA's
// daily history shows no trade on in two years is listed but never
// quoted, and is not written (byma.mjs).
//
//   https://www.comafi-inversiones.com.ar/json/main.json
//   https://open.bymadata.com.ar/
//
//   node brokers/comafi/comafi_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaRows, clean, expectLine, getText, summary } from "./byma.mjs";

const MAIN = "https://www.comafi-inversiones.com.ar/json/main.json";
const TABS = ["Acciones", "Cedears"];

const text = await getText(MAIN, { Referer: "https://www.comafi-inversiones.com.ar/" });
let main;
try {
  main = JSON.parse(text);
} catch {
  throw new Error(`${MAIN} is not JSON: ${text.slice(0, 80)}`);
}
const tabs = main?.tabs?.equity?.types || [];
for (const tab of TABS) if (!tabs.includes(tab)) throw new Error(`the equity page has no ${tab} tab (${tabs.join(", ")})`);
if (tabs.length !== TABS.length) throw new Error(`the equity page has new tabs: ${tabs.join(", ")}`);
const table = (main.assetTable || []).filter((line) => TABS.includes(line.table));

const entries = [];
let funds = 0;
for (const line of table) {
  const symbol = clean(line.assetName);
  if (line.assetClass === "fci") {
    funds += 1;
    continue;
  }
  if (line.assetClass !== "equity") throw new Error(`${symbol} on ${line.table} is a ${line.assetClass}`);
  entries.push({
    symbol,
    // A price on Comafi's board today: a trade, a bid or an offer.
    live: [line.lastTrade, line.bid, line.offer, line.price].some((value) => Number(value) > 0),
    name: clean(line.longName),
    raw: [line.table, symbol, clean(line.name), clean(line.longName), clean(line.indSector)].filter(Boolean).join(" | "),
  });
}
const perTab = Object.fromEntries(TABS.map((tab) => [tab, table.filter((line) => line.table === tab && line.assetClass === "equity").length]));
if (perTab.Acciones < 90 || perTab.Cedears < 500) throw new Error(`the board was short: ${JSON.stringify(perTab)}`);

const { rows, dropped } = await bymaRows(entries, "Comafi", { cable: false });

expectLine(rows, "GGAL", "ARS", "STOCK", "ARP495251018");
expectLine(rows, "YPFD", "ARS", "STOCK", "ARP9897X1319");
expectLine(rows, "BMA.D", "USD", "STOCK", "ARBANS010010");
expectLine(rows, "AAPL", "ARS", "STOCK", "ARDEUT116183");
expectLine(rows, "SPY", "ARS", "ETF", "ARCAVA460131");
expectLine(rows, "QQQ", "ARS", "ETF");
for (const block of ["GGALB", "AAPLB", "GOGLB", "GE..B", "SPYB"]) {
  if (rows.some((row) => row.ticker === block)) throw new Error(`the block line ${block} was kept`);
}
const local = rows.filter((row) => row.panel === "local");
const cedears = rows.filter((row) => row.panel === "cedear");
if (local.length < 70) throw new Error(`Buenos Aires shares were short: ${local.length}`);
if (cedears.length < 380) throw new Error(`CEDEARs were short: ${cedears.length}`);
if (cedears.filter((row) => row.type === "ETF").length < 40) throw new Error("CEDEAR ETFs were short");

summary("Comafi", rows, dropped);
console.error(`${funds} mutual-fund lines left out`);
const kept = rows.map(({ panel, ...row }) => row);
fs.writeFileSync(new URL("comafi-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(kept)), null, 2));
