// What the First International Bank of Israel (FIBI, "הבינלאומי") sells
// online in shares and ETFs, with no login: every share and exchange-traded
// fund on the Tel Aviv Stock Exchange, and US shares and ETFs, a place for
// which it publishes no list.
//
// Annex E of its tariff for individuals and small businesses ("נספח ה' –
// הטבות לפעילות בערוצים ישירים", page 59) prices securities orders by
// channel (internet, automatic machine, mobile app, other channels, clerk):
// "קניה/מכירה של ניירות ערך הנסחרים בבורסה בת"א - מניות ואג"ח" 0.3%,
// minimum 39 shekels, on the internet, the app and the trading systems
// ("מערכות מסחר"), and "קניית/מכירת של ניירות ערך בחו"ל - מניות, אג"ח
// וקרנות בחו"ל" 0.25%, minimum $39, on the same channels. Its online
// trading page (the broker-list URL) sits behind a Radware bot wall and
// could not be read; the annex names no exchange, board or kind of share or
// fund left out, and no page read gives a count.
//
// Tel Aviv: the exchange's whole book (../altshuler/taseBook.mjs): its
// shares (ordinary shares, REITs, partnership units, dual-listed and
// foreign shares), its Israeli ETFs (kranot sal) and the foreign UCITS
// ETFs cross-listed there, less suspended lines. In shekels (prices in
// agorot), MIC XTAE.
//
// United States (broker-list.json's foreign place; the annex says
// "abroad" with no country): no exchange is named, so the catalogue keeps
// the country's exchanges, the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt, warrants, rights, units, when-issued
// lines and listed notes (usBook) and bonds (withoutObligations). OTC lines
// are not named and not in the book. One NBBO market: one row per title,
// on its primary listing, in dollars.
//
//   https://www.fibi.co.il/private/capitalmarket/independenttrade/onlinetrade/
//   https://market.tase.co.il/en/market_data/securities/data/all
//
// Fees: annex E (above): TASE shares and bonds 0.3%, minimum 39 shekels,
// maximum 6,900 (clerk 0.64%, minimum 40); securities abroad 0.25%,
// minimum $39, maximum $6,900 (clerk 0.85%, minimum $40).
//   https://www.fibi.co.il/media/zwodocfm/נספח-ה-הטבות-לפעילות-בערוצים-ישירים.pdf
// The annex is a PDF whose text needs a PDF reader; at run time the file
// must still be served (the site's pages are walled, its files are not).
//
//   node brokers/fibi/fibi_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { taseBook } from "../altshuler/taseBook.mjs";
import { servedPdf } from "../bankleumi/tariffText.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const ANNEX = `https://www.fibi.co.il/media/zwodocfm/${encodeURIComponent("נספח-ה-הטבות-לפעילות-בערוצים-ישירים.pdf")}`;

const annex = await servedPdf(ANNEX);
if (annex.length < 50_000) throw new Error(`${decodeURIComponent(ANNEX)} shrank to ${annex.length} bytes`);

const tase = await taseBook();
const us = await usBook();
const rows = stampRows(withoutObligations([...tase.rows, ...us]));
if (rows.filter((row) => row.mic === "XTAE").length < 800) throw new Error("short TASE part");
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("fibi-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`fibi: ${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(
  `TASE ${tase.tradeDate} lists ${JSON.stringify(tase.counts)}, dropped ${tase.dropped.join(", ") || "none"}; ` +
    `US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`
);
