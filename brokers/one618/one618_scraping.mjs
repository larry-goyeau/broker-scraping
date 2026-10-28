// What ONE618 Financial Services (ex Consultatio Investments S.A., a BYMA
// agent) sells in Buenos Aires shares and CEDEARs, with no login. Its only
// place is BYMA (BCBA / XBUE).
//
// The broker's pages, read 2026-10-25:
//   https://www.one618fs.com/es/productos/otros-productos
//   "Acciones": "En Argentina las acciones se negocian en la Bolsa de
//   Comercio de Buenos Aires". It also sells "Dólar MEP" and "Dólar CCL":
//   "El Contado con Liquidación (CCL) consiste en la compra de un bono en
//   pesos y su posterior venta en dólares en especie "C"" and "Para
//   invertir en Dólar CCL es necesario tener una cuenta en el extranjero, a
//   donde se liquidará el saldo resultante de la operatoria".
//   https://www.one618fs.com/es/productos/etfs-y-cedears
//   "los CEDEARs se negocian en pesos en BYMA" ("principalmente en pesos"),
//   then a closed list headed "Conocé los ETFs disponibles": Nasdaq 100
//   (QQQ), Sector Energético (XLE), Sector Financiero (XLF), S&P 500 (SPY),
//   Brasil (EWZ), Mercados Emergentes (EEM), Dow Jones (DIA), ARK
//   Innovación (ARKK) and Russell 2000 (IWM); the tickers are in the
//   cards' image names.
//
// So the catalogue is BYMA's whole share and CEDEAR board
// (../bancogalicia/bymaBook.mjs: local shares and CEDEARs that trade;
// block lines, closed-end funds, rights, warrants, bond CEDEARs and dormant
// lines left out), minus every CEDEAR of an ETF that is not one of the nine
// on that list (all its lines). The ETN CEDEAR VXX is not an ETF and stays
// with the CEDEARs. Each title gets its peso line, its MEP-dollar (D) line
// and, because the broker offers CCL settlement in "especie C", its cable
// (C) line.
//
// Fees ("Tabla de comisiones Consultatio Investments S.A. a partir del
// 25/03/2022", on the fees page): "ACCIONES Compra / Venta De 0 a 3%",
// minimum "Pesos $300 o Dólar US$ 20", IVA and market rights on top; fees
// on foreign-currency trades are charged in that currency:
//   https://www.one618fs.com/honorarios
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/one618/one618_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const ETFS = new Set(["QQQ", "XLE", "XLF", "SPY", "EWZ", "EEM", "DIA", "ARKK", "IWM"]);

const { rows: board } = await bymaBook("ONE618", { cable: true });
// A dollar line is the peso symbol plus D (MEP) or C (cable).
const stem = (row) => (row.currency === "USD" && /[CD]$/.test(row.ticker) ? row.ticker.slice(0, -1) : row.ticker);
const left = [];
const rows = board.filter((row) => {
  if (row.type !== "ETF" || ETFS.has(stem(row))) return true;
  left.push(row.ticker);
  return false;
});
for (const ticker of ETFS) {
  for (const [line, currency] of [[ticker, "ARS"], [`${ticker}D`, "USD"], [`${ticker}C`, "USD"]]) {
    if (!rows.some((row) => row.ticker === line && row.currency === currency && row.type === "ETF")) throw new Error(`${line} ${currency} is missing`);
  }
}
console.error(`ONE618: ${rows.length} rows; ${left.length} ETF lines not on the broker's ETF list left out`);
fs.writeFileSync(new URL("one618-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
