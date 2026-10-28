// What Banco Galicia (Banco de Galicia y Buenos Aires S.A., ALyC Integral
// no. 22 at the CNV) sells in Buenos Aires shares and CEDEARs, with no
// login. Its only place is BYMA (BCBA / XBUE).
//
// The bank's pages, read 2026-10-25:
//   https://www.galicia.ar/personas/inversiones/bonos-acciones
//   "Podés comprar acciones de empresas que cotizan en bolsas y mercados
//   argentinos, así como bonos. Si invertís en CEDEAR, podés comprar
//   acciones de empresas que cotizan fuera del país"; orders online through
//   "Online Banking > Inversiones > Nueva inversión > Bonos, Acciones y
//   CEDEAR"; "Invertís en pesos o en dólares"; prices "durante la rueda
//   bursátil de BYMA".
//   https://www.galicia.ar/personas/inversiones/cedear-etf
//   CEDEARs "en pesos o dólares", and for ETFs a closed list: "Los ETFs
//   disponibles para invertir son:" SPY, QQQ, XLF, XLE, DIA, EWZ, ARKK, IWM
//   and EEM (one card each, ordered from "Nueva inversión > ETF").
//
// So the catalogue is BYMA's whole share and CEDEAR board (bymaBook.mjs in
// this folder: local shares and CEDEARs that trade, block lines, closed-end
// funds, rights, bond CEDEARs and dormant lines left out), with the peso
// line and the MEP-dollar (D) line of each title, minus every CEDEAR of an
// ETF that is not one of the nine on the bank's list (their peso and D
// lines). The ETN CEDEAR VXX is not an ETF and stays with the CEDEARs.
// Cable (C) lines are not written: the bank's pages and fee schedule name
// no cable / CCL settlement (the only mention of "Contado con
// Liquidación" is as a driver of CEDEAR prices) and dollars go to the
// client's local "Caja de Ahorro en dólares".
//
// Fees ("Comisiones y cargos - Individuos. Bonos, Acciones, CEDEARs"):
// "Compra / Venta de Acciones y CEDEARs 1,1% + IVA" on the traded value, no
// minimum; custody "Bonificado 100%"; BYMA market fees on top:
//   https://www.galicia.ar/content/dam/galicia/emails/personas/comisiones-minoristas/Bonos_Acciones_CEDEARs_2026_110626.pdf
//
//   node brokers/bancogalicia/bancogalicia_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "./bymaBook.mjs";

const ETFS = new Set(["SPY", "QQQ", "XLF", "XLE", "DIA", "EWZ", "ARKK", "IWM", "EEM"]);

const { rows: board } = await bymaBook("Banco Galicia", { cable: false });
const left = [];
const rows = board.filter((row) => {
  if (row.type !== "ETF") return true;
  const stem = row.currency === "USD" && row.ticker.endsWith("D") ? row.ticker.slice(0, -1) : row.ticker;
  if (ETFS.has(stem)) return true;
  left.push(row.ticker);
  return false;
});
for (const ticker of ETFS) {
  for (const [line, currency] of [[ticker, "ARS"], [`${ticker}D`, "USD"]]) {
    if (!rows.some((row) => row.ticker === line && row.currency === currency && row.type === "ETF")) throw new Error(`${line} ${currency} is missing`);
  }
}
console.error(`Banco Galicia: ${rows.length} rows; ${left.length} ETF lines not on the bank's ETF list left out`);
fs.writeFileSync(new URL("bancogalicia-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
