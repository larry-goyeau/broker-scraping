// What tyba Perú (tyba por Credicorp, BCP group) sells in US shares and
// ETFs, with no login. tyba.pe sells a "Plataforma de acciones y ETFs ...
// para invertir en las bolsas de EE. UU." and sends to tyba.tech, the
// platform of Credicorp Capital Advisors LLC (a US broker dealer, FINRA /
// SIPC) for Peru, Chile and Colombia: "Acciones & ETFs Puedes hacer parte de
// las empresas más grandes del mundo desde 1 USD", "Conéctate con la
// energía de Wall Street y el NASDAQ". The list is in the app only; no page
// names a board, a segment or a kind of listed share or fund left out, and
// no count is given.
//
//   https://tyba.pe/
//   https://tyba.tech/
//
// So the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs: shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs on every US exchange, less open trade halts,
// warrants, rights, units, when-issued lines and listed notes): "Wall
// Street y el NASDAQ" are examples ("las bolsas de EE. UU."), so by the
// owner's rule the place is the whole country. The US is one NBBO market:
// one row per title, in dollars. OTC is not named and is not added.
// broker-list.json gives tyba Peru the United States. (tyba Colombia,
// brokers/tyba, sells the same platform through Credicorp Capital Colombia;
// its broker-list place is the NYSE only.)
//
// Fees (tyba.tech): "Operación simple, comisión 0% en acciones completas"
// and "Al invertir en acciones completas, eliminamos comisiones"; tyba.pe's
// T&Cs are titled "0% de comisión Acciones y ETFs":
//   https://tyba.tech/
//
//   node brokers/tybaperu/tybaperu_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence } from "../bullmarket/bymaUs.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await evidence("https://tyba.pe/", [/invertir en las bolsas de EE\. UU\./]);
await evidence("https://tyba.tech/", [/comisi[oó]n 0% en acciones completas/, /Wall Street y el NASDAQ/]);

const book = await usBook();
const rows = stampRows(withoutObligations([...book]));
if (rows.length < 10000) throw new Error(`only ${rows.length} US rows`);
fs.writeFileSync(new URL("tybaperu-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`tyba Perú: ${rows.length} US rows`, counts);
