// What Plynk (Digital Brokerage Services LLC, a Fidelity Investments
// company) sells in shares and exchange-traded products. Plynk is an app
// only ("As of right now, Plynk is only available as a mobile app") and
// publishes no list of titles: its Discover and Search screens need a
// signed-in account, and its site has no page per title. It says it offers
// "over 5,000 stocks and 2,000 funds" (FAQ), names no exchange and no
// excluded segment, and charges $0 commission on stocks and funds.
//
//   https://www.plynkinvest.com/faqs
//   https://www.plynkinvest.com/disclosures/fee-schedule
//
// The owner's rule for a broker with a single place and no published list
// (2026-10-25): take the whole place. So the catalogue starts from the
// whole US exchange book of the day (../wellstrade/usBook.mjs: every
// share, ADR, REIT, partnership unit, preferred, closed-end fund, ETF and
// ETN listed on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the
// Texas Stock Exchange, less the lines with an open trade halt). Warrants,
// rights, units, when-issued lines and listed notes (usBook) and bonds
// (withoutObligations) are left out as in the other US catalogues; OTC
// Markets lines are not added, as no Plynk page names them. Plynk's
// mutual funds are not exchange-traded and its four cryptocurrencies are
// not securities, so neither is here.
//
// Owner rule 2026-10-25: the N most popular. The FAQ says "The Plynk app
// offers over 5,000 stocks and 2,000 funds"
// (https://www.plynkinvest.com/faqs), so N = 5,000 for stocks: the 5,000
// book shares (type STOCK) with the highest 30-day average traded value
// in dollars (../wellstrade/usPopular.mjs) are kept. The "2,000 funds" is
// not an ETF count: Plynk's funds are ETFs and mutual funds together (the
// same FAQ names "common stock, ETFs, or mutual funds" as holdings), and
// mutual funds are not exchange-traded, so no N is read for ETFs and ETNs
// and they stay whole.
//
// The US is one NBBO market: one row per title, on its primary listing, in
// dollars.
//
//   node brokers/plynk/plynk_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topN } from "../wellstrade/usPopular.mjs";

const FOLDER = "plynk";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const FAQ = "https://www.plynkinvest.com/faqs";
const STOCKS = 5000;

// The FAQ still says what the header quotes, or the run stops.
const faq = await fetch(FAQ, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
if (!faq.ok) throw new Error(`${faq.status} ${FAQ}`);
const said = (await faq.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ").match(/The Plynk app offers over ([\d,]+) stocks and ([\d,]+) funds/i);
if (!said || Number(said[1].replace(/,/g, "")) !== STOCKS) throw new Error(`${FAQ} no longer says "over 5,000 stocks and 2,000 funds": ${said?.[0]}`);

const rows = await usBook();
const all = withoutObligations(rows);
const stocks = await topN(all, STOCKS, { types: ["STOCK"] });
const top = new Set(stocks);
const kept = stampRows(all.filter((row) => row.type !== "STOCK" || top.has(row)));
if (kept.length < 7000) throw new Error(`only ${kept.length} rows`);
fs.writeFileSync(new URL(`${FOLDER}-parsed.json`, import.meta.url), JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${kept.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
for (const [what, list] of Object.entries(rows.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
const { report } = stocks;
console.error(`stocks: ${report.among} in the book, ${report.kept} kept (the ${STOCKS} most popular); cut-off #${report.cutoff.rank} ${report.cutoff.text}, ${report.cutoff.name}; first left out ${report.firstLeftOut}; kept by size only ${report.keptSizeOnly}, with no data ${report.keptNoData}`);
