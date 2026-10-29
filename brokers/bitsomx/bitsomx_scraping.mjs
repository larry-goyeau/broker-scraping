// What Bitso Acciones (Bitso's stock service in Mexico, in the Bitso app;
// orders executed and held by Alpaca Securities, a US broker-dealer) sells
// in shares and exchange-traded funds, with no login. Its one place is the
// United States.
//
// The stocks page (read 2026-10-28): "Invierte en acciones 24/7, estés
// donde estés. Accede a más de 5,000 acciones y ETFs directamente desde la
// app. Invierte con tus pesos y sin comisiones", "DESDE 20 PESOS SIN
// COMISIONES OPERACIONES 24/7".
//
// There is no list, but a stated number, so the owner's rule for a stated
// count applies: the 5,000 most popular titles of the US exchange book of
// the day (../wellstrade/usBook.mjs), shares and ETFs ranked together as
// the page counts them, by 30-day average traded value on TradingView's US
// scanner (../tfcapital/usTop.mjs). No page names an exchange, an OTC tier
// or another exception. usBook drops warrants, rights, units, when-issued
// lines, listed notes and lines with an open trade halt; bonds go through
// withoutObligations. One row per title, on its listing market, in dollars
// (the client pays in pesos). broker-list.json gives "United States" with
// a count of 5,000.
//
//   https://bitso.com/mx/products/stocks   (offer and fees)
//
//   node brokers/bitsomx/bitsomx_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import { usTop } from "../tfcapital/usTop.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const text = await pageSays("https://bitso.com/mx/products/stocks", [/Accede a más de 5,000 acciones y ETFs/, /sin comisiones/i]);
const N = Number(text.match(/más de ([\d,]+) acciones y ETFs/)[1].replace(/,/g, ""));
if (N !== 5000) throw new Error(`the page now states ${N} titles`);

const book = await usBook();
const top = await usTop(withoutObligations(book), N);
for (const ticker of ["AAPL", "NVDA", "SPY", "QQQ"]) if (!top.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the top ${N}`);
const rows = stampRows(top.sort((a, b) => a.ticker.localeCompare(b.ticker)));
if (rows.length < N * 0.95) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("bitsomx-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`ranking: ${JSON.stringify(top.report)}`);
