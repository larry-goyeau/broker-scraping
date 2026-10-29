// What MBI Corredores de Bolsa S.A. sells online in shares and ETFs, with
// no login. Its MBI Trading page (app-trading.mbi.cl, 100% digital account
// opening): "Compra acciones y fondos locales" "directamente en la Bolsa de
// Santiago", and "Mercado internacional Invierte sin fronteras en las
// principales bolsas del mundo: Estados Unidos, Europa y Asia"; FAQ: "a
// través de nuestra plataforma puedes acceder a los principales mercados
// internacionales como EE.UU., Europa y Asia". Its international page sells
// "Acciones - ETF - Fondo de inversión" through StoneX's platform. It
// publishes no list.
//
//   https://www.mbi.cl/landing-corredora/landing01/index.html
//   https://mbi.cl/servicios-internacionales
//
// Two places, as in broker-list.json:
// - Santiago: the Bolsa de Comercio de Santiago's share and ETF book, read
//   by ../banchile/santiagoBook.mjs (Chilean shares, the foreign shares and
//   ETFs of the exchange's foreign-securities market and the Chilean ETFs,
//   in pesos and in dollars as the exchange quotes each line; ordinary
//   investment and mutual-fund lines and dormant lines left out there).
// - US: the whole US exchange book of the day (../wellstrade/usBook.mjs:
//   shares, ADRs, REITs, preferreds, closed-end funds, ETFs and ETNs on
//   every US exchange, less halts, warrants, rights, units, when-issued
//   lines and listed notes); no US exchange is named, so the place is the
//   whole country, one NBBO market. OTC is not named. Europe and Asia, also
//   named, have no broker-list place and are not added.
//
// Fees (MBI Trading FAQ): "Transparencia total en renta variable local:
// comisión de 0,22% del monto de la operación + $5.000 + IVA. Sin cobros
// ocultos." No page prices US orders:
//   https://www.mbi.cl/landing-corredora/landing01/index.html
//
// The Santiago exchange's site sits behind a bot manager: the price list is
// read in the owner's Chrome on port 9222 (see ../banchile/santiagoBook.mjs).
//
//   node brokers/mbicorredores/mbicorredores_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence } from "../bullmarket/bymaUs.mjs";
import { santiagoBook } from "../banchile/santiagoBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await evidence("https://www.mbi.cl/landing-corredora/landing01/index.html", [/comisi[oó]n de 0,22% del monto de la operaci[oó]n \+ \$5\.000 \+ IVA/, /Estados Unidos, Europa y Asia/]);

const santiago = await santiagoBook("MBI Corredores de Bolsa");
const book = await usBook();
const us = withoutObligations([...book]);
if (us.length < 10000) throw new Error(`only ${us.length} US rows`);
const rows = stampRows(withoutObligations([...santiago.map(({ traded, ...row }) => row), ...us]));
fs.writeFileSync(new URL("mbicorredores-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(`MBI Corredores de Bolsa: ${rows.length} rows (${santiago.length} Santiago, ${us.length} US)`);
