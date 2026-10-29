// What Revolut México sells in shares and exchange-traded funds, with no
// login. The service is "Mercados Revolut", run by Revolut Securities
// Singapore Pte Ltd, in the Revolut app. Its one place is the United
// States.
//
// The stock-trading page (read 2026-10-28): "Invierte en una amplia
// variedad de empresas de EE. UU. con un mínimo de $1 USD a través de
// Mercados Revolut. Aprovecha el trading sin comisiones. Pueden aplicarse
// otras comisiones", "Elige entre más de 2,000+ acciones y ETF en la app",
// "Invierte en acciones sin comisiones y paga $0 en comisiones de custodia
// o retiro. Pueden aplicarse otros costos, como el cambio de divisas".
//
// There is no list, but a stated number, so the owner's rule for a stated
// count applies: the 2,000 most popular titles of the US exchange book of
// the day (../wellstrade/usBook.mjs), shares and ETFs ranked together as
// the page counts them, by 30-day average traded value on TradingView's US
// scanner (../tfcapital/usTop.mjs). No page names an exchange, an OTC tier
// or another exception. usBook drops warrants, rights, units, when-issued
// lines, listed notes and lines with an open trade halt; bonds go through
// withoutObligations. One row per title, on its listing market, in
// dollars. broker-list.json gives "United States".
//
// revolut.com answers scripts with a bot wall (403), so the run does not
// re-read the page.
//
//   https://www.revolut.com/es-MX/stock-trading/   (offer and fees)
//
//   node brokers/revolutmx/revolutmx_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usTop } from "../tfcapital/usTop.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const N = 2000;
const book = await usBook();
const top = await usTop(withoutObligations(book), N);
for (const ticker of ["AAPL", "NVDA", "SPY", "QQQ"]) if (!top.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the top ${N}`);
const rows = stampRows(top.sort((a, b) => a.ticker.localeCompare(b.ticker)));
if (rows.length < N * 0.95) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("revolutmx-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`ranking: ${JSON.stringify(top.report)}`);
