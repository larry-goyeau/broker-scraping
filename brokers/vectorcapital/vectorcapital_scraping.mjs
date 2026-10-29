// What Vector Capital Corredores de Bolsa (Chile) sells online in shares
// and ETFs, with no login. Its "Auto-inversión web" lets clients "comprar y
// vender distintos activos a precios de mercado" and its traders terminal
// ("Vector Brokers") is a real-time platform. Its step-by-step guide for
// the web platform: "¿Qué puedo comprar o vender en la plataforma?
// Acciones o cuotas de fondo de inversión (CFI) que se transen en la Bolsa
// de Santiago con liquidación T+2", amounts entered in pesos (CLP). Its
// products page: "puedes invertir con facilidad en acciones de Chile y el
// mundo" and "en una amplia gama de ETFs". It publishes no list.
//
//   https://vectorcapital.cl/formas-de-invertir/
//   https://vectorcapital.cl/wp-content/uploads/2024/05/Paso-a-paso-para-comprar-y-vender-acciones.pdf
//   https://vectorcapital.cl/productos/
//
// Two places, as in broker-list.json:
// - Santiago: the Bolsa de Comercio de Santiago's share and ETF book in
//   pesos, read by ../banchile/santiagoBook.mjs (Chilean shares, the foreign
//   shares and ETFs of the exchange's foreign-securities market quoted in
//   pesos, and the Chilean ETFs, which are CFI or mutual-fund lines;
//   ordinary investment-fund lines, which the platform also sells but are
//   not shares or ETFs, and dormant lines left out there). The guide gives
//   the web platform's orders in CLP only, so the dollar lines are left out.
// - US: "acciones de Chile y el mundo"; no page names an exchange, so the
//   place is the whole US exchange book of the day
//   (../wellstrade/usBook.mjs: shares, ADRs, REITs, preferreds, closed-end
//   funds, ETFs and ETNs on every US exchange, less halts, warrants, rights,
//   units, when-issued lines and listed notes), one NBBO market. Whether
//   these orders go through the web or the desk, no page says they are
//   offline, so they are kept. OTC is not named.
//
// Fees (traders page, "Costos del servicio"): "Comisión por Operaciones:
// equivalente a 0,15% del monto diario transado más Impuesto al Valor
// Agregado", platform "$100.000 mensual" (waived above $100.000 of
// commissions):
//   https://vectorcapital.cl/traders/
//
// The Santiago exchange's site sits behind a bot manager: the price list is
// read in the owner's Chrome on port 9222 (see ../banchile/santiagoBook.mjs).
//
//   node brokers/vectorcapital/vectorcapital_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence, pdf } from "../bullmarket/bymaUs.mjs";
import { santiagoBook } from "../banchile/santiagoBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await evidence("https://vectorcapital.cl/traders/", [/0,15% del monto diario transado/]);
await evidence("https://vectorcapital.cl/productos/", [/acciones de Chile y el mundo/]);
await pdf("https://vectorcapital.cl/wp-content/uploads/2024/05/Paso-a-paso-para-comprar-y-vender-acciones.pdf");

const santiago = await santiagoBook("Vector Capital", { currencies: ["CLP"] });
const book = await usBook();
const us = withoutObligations([...book]);
if (us.length < 10000) throw new Error(`only ${us.length} US rows`);
const rows = stampRows(withoutObligations([...santiago.map(({ traded, ...row }) => row), ...us]));
fs.writeFileSync(new URL("vectorcapital-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(`Vector Capital: ${rows.length} rows (${santiago.length} Santiago, ${us.length} US)`);
