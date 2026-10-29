// What Prex (Uruguay) sells in US shares and ETFs, with no login. Its
// "Cuenta Inversión" opens, through Beca Investment Advisors, an account in
// the client's name at DriveWealth LLC (a US broker dealer, FINRA / SIPC),
// traded in the Prex app: "Apple, Google y +300 disponibles." The list is
// in the app only; no page names an exchange.
//
//   https://www.prexcard.com/cuentainversion
//   https://dtz91nrf417an.cloudfront.net/web/cuenta-inversion/T%C3%A9rminos%20y%20Condiciones%20USUARIO%20INVERSIONES%20PREX.pdf
//
// A stated count and no list: by the owner's rule the catalogue is the 300
// most popular titles of the place. The place is the US (DriveWealth's
// market; broker-list.json gives the United States with count 300), read
// from the whole US exchange book of the day (../wellstrade/usBook.mjs:
// shares, ADRs, REITs, preferreds, closed-end funds, ETFs and ETNs on every
// US exchange, less halts, warrants, rights, units, when-issued lines and
// listed notes), ranked by 30-day average traded value
// (../tfcapital/usTop.mjs). The count covers the app's offer as a whole
// (its wording names shares only, and no page sells or excludes ETFs), so
// shares and ETFs are ranked together. The US is one NBBO market: one row
// per title, in dollars.
//
// Fees (Prex help, "Cuenta inversión"): "¿Debo pagar comisión? Sí. Las
// comisiones varían según la operación: • Para la compra: U$S0.99 + 2% •
// Para la venta: 1% El IVA está incluido en los dos casos.":
//   https://www.prexcard.com/ayuda/11
//
//   node brokers/prex/prex_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence } from "../bullmarket/bymaUs.mjs";
import { usTop } from "../tfcapital/usTop.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const N = 300;
await evidence("https://www.prexcard.com/cuentainversion", [/Apple, Google y \+300 disponibles/, /Drivewealth/i]);
await evidence("https://www.prexcard.com/ayuda/11", [/Para la compra: U\$S ?0\.99 \+ 2%/, /Para la venta: 1%/]);

const book = await usBook();
const top = await usTop(withoutObligations([...book]), N);
if (top.length !== N) throw new Error(`only ${top.length} rows`);
const rows = stampRows(top);
for (const ticker of ["AAPL", "GOOGL", "MSFT", "SPY"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("prex-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
const counts = {};
for (const row of rows) counts[row.type] = (counts[row.type] || 0) + 1;
console.error(`Prex: ${rows.length} US rows`, counts);
