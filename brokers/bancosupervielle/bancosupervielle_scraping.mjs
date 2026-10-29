// What Banco Supervielle sells in Buenos Aires shares and CEDEARs online,
// with no login. Orders are placed in its Online Banking and app and
// executed by InvertirOnline (IOL, ALyC Integral no. 273, a Supervielle
// group company), where the bank opens a linked comitente account. Its only
// place is BYMA (BCBA / XBUE), the one Argentine market with a share
// segment.
//
// Its pages, read 2026-10-28: "Invertí fácil y rápido Acciones, CEDEARs,
// Bonos y más. Hacé todo desde APP Supervielle"; "Todas las operaciones
// realizadas en Online banking individuos o App mobile del banco son
// operadas a través de InvertirOnline"; CEDEARs: "Invertí en las mejores
// empresas que cotizan en el mercado de EEUU a través de tu Online Banking,
// sin comisión", "¿La operación es en PESOS? La inversión se realiza en
// pesos", and a closed list of ETFs: "¿Cuáles son los ETFs en los que se
// podrá invertir con CEDEARs?" XLE, XLF, SPY and QQQ. Fees: CEDEARs "La
// operación no tiene costos de comisión para la compra y para la venta
// (comisión cero), y tampoco tiene comisión de custodia"; for shares, "A
// los precios de mercado informados para operar se deben sumar las
// comisiones, derechos de mercado e impuestos según corresponda por
// instrumento en InvertirOnline", with a link to IOL's tariff.
//   https://www.supervielle.com.ar/personas/inversiones/valores-negociables
//   https://www.supervielle.com.ar/personas/inversiones/cedears   (fees)
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs (local shares and CEDEARs that trade; block
// lines, closed-end funds, rights, bond CEDEARs and dormant lines left out
// there), peso lines only (the bank sells in pesos; the MEP dollar is a
// separate product), minus every CEDEAR of an ETF that is not one of the
// four on the bank's list. broker-list.json gives the place "Argentina".
//
//   node brokers/bancosupervielle/bancosupervielle_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";
import { evidence } from "../bullmarket/bymaUs.mjs";

const ETFS = new Set(["XLE", "XLF", "SPY", "QQQ"]);

await evidence("https://www.supervielle.com.ar/personas/inversiones/cedears", [
  /La operación no tiene costos de comisión para la compra y para la venta \(comisión cero\)/,
  /¿Cuáles son los ETFs en los que se podrá invertir con CEDEARs\?/,
  /XLE:.*XLF:.*SPY:.*QQQ\)/,
  /La inversión se realiza en pesos/,
]);
await evidence("https://www.supervielle.com.ar/personas/inversiones/valores-negociables", [/operadas a través de InvertirOnline/, /Acciones, CEDEARs, Bonos y más/]);

const { rows: board } = await bymaBook("Banco Supervielle", { cable: false });
const left = [];
const rows = board.filter((row) => {
  if (row.currency !== "ARS") return false;
  if (row.type !== "ETF" || ETFS.has(row.ticker)) return true;
  left.push(row.ticker);
  return false;
});
for (const ticker of ["GGAL", "SUPV", "AAPL", ...ETFS]) if (!rows.some((row) => row.ticker === ticker && row.currency === "ARS")) throw new Error(`${ticker} is missing`);
console.error(`Banco Supervielle: ${rows.length} peso rows; ${left.length} ETF CEDEARs not on the bank's list left out`);
fs.writeFileSync(new URL("bancosupervielle-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
