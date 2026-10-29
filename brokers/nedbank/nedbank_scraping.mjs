// What Nedbank Online Share Trading (Nedbank Stockbroking, Nedgroup
// Private Wealth Stockbrokers, a JSE member) sells in shares and
// exchange-traded funds, with no login. Two books, both traded on the same
// website:
//
// - JSE. The share trading account trades local shares, and "you will be
//   able to trade ETFs on your normal trading account via the website like
//   equity share" (FAQ). No page names a list or leaves out a board, so
//   the place is the whole JSE (../sharenet/jseBook.mjs): ordinary and
//   preference shares, ETFs and actively managed ETFs, ETNs and actively
//   managed certificates, in rand, without suspended, delisted and
//   never-traded lines, warrants, Krugerrands and indices. (CFDs, also
//   offered, are not shares.)
//
// - Offshore. The offshore account is run with Saxo Bank: "This offering
//   is accessible through our online trading platform", "Can I trade
//   online? Yes", with "access to a diverse array of globally listed
//   companies across 38 exchanges, providing a broad selection of
//   approximately 1 400 offshore counters across various markets"
//   (ordinary shares, ETFs, bonds, mutual funds). The 38 exchanges are not
//   named; broker-list.json gives the United States as the one foreign
//   place. The owner's stated-count rule (a number and no list: the N most
//   popular titles) is applied there: the 1,400 most traded US shares and
//   ETFs, by 30-day average traded value (../tfcapital/usTop.mjs) over the
//   whole US book (../wellstrade/usBook.mjs: one NBBO market, one row per
//   title on its listing market, in dollars; warrants, rights, units,
//   when-issued lines, listed notes and halted lines left out). The other
//   37 exchanges are left out until Nedbank or Saxo names them. The number
//   is read from the brochure at run time.
//
// Fees: local brokerage "Minimum: R70 or 0.50% of the trade value" (Our
// offering, Costs; the FAQ: "The brokerage minimum fee is R70,00 per
// trade"), plus JSE fees, STT, Strate and VAT. Offshore: "Shares, ETFs and
// bonds ... Brokerage Minimum: 20 USD or 0.25% of the trade value", custody
// 0.10% a year, asset-swap account 0.30% a year, FX conversion 0.25%.
//
//   https://onlinesharetrading.nedbank.co.za/#/static/our-offerings (fees; an Angular app: the text is in its scripts)
//   https://onlinesharetrading.nedbank.co.za/assets/content/Offshore_KID_brochure.pdf (offshore offer and fees)
//   https://onlinesharetrading.nedbank.co.za/assets/content/Shares_ETFs_KID_brochure.pdf
//   https://scanner.tradingview.com/america/scan (US ranking)
//   (JSE book sources: see ../sharenet/jseBook.mjs; the first run reads
//   every Sharenet share page, about 25 minutes, then caches 12 hours)
//
//   node brokers/nedbank/nedbank_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { pdfSays, getBytes } from "../alphasec/pdfSays.mjs";
import { jseBook } from "../sharenet/jseBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { usTop } from "../tfcapital/usTop.mjs";
import fs from "node:fs";

const SITE = "https://onlinesharetrading.nedbank.co.za/";
const OFFSHORE = `${SITE}assets/content/Offshore_KID_brochure.pdf`;
const LOCAL = `${SITE}assets/content/Shares_ETFs_KID_brochure.pdf`;

const offshore = await pdfSays(OFFSHORE, [/across 38 exchanges/, /Can I trade online\?\s*Yes/, /Exchange-traded funds \(ETFs\)/, /Minimum: 20 USD or 0\.25% of the trade value/]);
const counters = Number(offshore.match(/approximately ([\d ]+?) offshore counters/)?.[1].replace(/\s/g, ""));
if (!(counters >= 500 && counters <= 20000)) throw new Error(`the offshore brochure no longer gives a number of counters (${counters})`);
await pdfSays(LOCAL, [/online trading platform/, /Both local and international options are available/]);

// The FAQ and the fee table live in the app's main script.
const index = (await getBytes(SITE)).body.toString("utf8");
const main = index.match(/src="(main-[A-Z0-9]+\.js)"/)?.[1];
if (!main) throw new Error("the Nedbank site no longer loads a main script");
const script = (await getBytes(SITE + main)).body.toString("utf8");
for (const pattern of [/The brokerage minimum fee is R70,00 per trade/, /trade ETFs on your normal trading account via the website/]) {
  if (!pattern.test(script)) throw new Error(`the Nedbank site no longer says ${pattern}`);
}

const jse = await jseBook();
const us = await usTop(await usBook(), counters);
const rows = stampRows(withoutObligations([...jse.rows, ...us]));
fs.writeFileSync(new URL("nedbank-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const count = (filter) => rows.filter(filter).length;
for (const ticker of ["NPN", "SOL", "STX40"]) if (!rows.some((row) => row.ticker === ticker && row.mic === "XJSE")) throw new Error(`JSE ${ticker} missing`);
for (const ticker of ["AAPL", "NVDA", "SPY"]) if (!rows.some((row) => row.ticker === ticker && row.currency === "USD")) throw new Error(`US ${ticker} missing`);
if (count((row) => row.mic === "XJSE") < 500) throw new Error("JSE book too small");
console.error(
  `${rows.length} listings: JSE ${count((row) => row.mic === "XJSE")} (${jse.suspended.length} suspended left out), ` +
    `US ${count((row) => row.mic !== "XJSE")} of ${us.report.candidates} (top ${counters}, cutoff ${us.report.cutoff}); ` +
    `${count((row) => row.type === "ETF")} ETF, ${count((row) => row.type === "ETN")} ETN`
);
