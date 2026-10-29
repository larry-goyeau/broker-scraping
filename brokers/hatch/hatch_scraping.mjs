// What Hatch (Hatch Invest, Wellington, New Zealand) sells in US shares
// and ETFs, with no login. Hatch connects New Zealanders to "the US share
// markets by connecting with DriveWealth, a US broker-dealer", and names
// its markets: "Now Kiwis have affordable access to largest share markets
// in the world (the NYSE and the Nasdaq)". The offer: "Through Hatch, you
// can buy and sell shares in over 5,800+ companies and 1,900+ exchange
// traded funds (ETFs) from professional fund managers like Vanguard,
// BlackRock, and Ark" (the FAQ adds "over 500 ADRs", among the companies).
//
//   https://www.hatchinvest.nz/faqs
//
// The list sits in the app. "The NYSE and the Nasdaq" reads like a closed
// list, but the same FAQ names Ark among the ETF providers, and Ark's ETFs
// (ARKK and the others) list on Cboe BZX: the two names are the largest
// markets, not a limit. So the place is the United States. Owner rule
// (stated count, top N, per kind when the broker splits them): the 5,800
// most popular shares (type STOCK: shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds) and the 1,900 most popular ETFs of the
// whole US exchange book of the day, each ranked by 30-day average traded
// value (../tfcapital/usTop.mjs). ETNs are notes, neither companies nor
// funds, and are left out. The book is ../wellstrade/usBook.mjs (Nasdaq,
// NYSE, NYSE American, NYSE Arca, Cboe BZX, Texas Stock Exchange;
// warrants, rights, units, when-issued lines, listed notes and halted lines
// out; bonds out by withoutObligations). No OTC line. One row per title on
// its primary listing, in dollars.
//
// Remarks, not removals: New Zealand residents; Kids Accounts pay 50c USD.
//
// Fees (pricing page): "$3 USD To buy or sell shares Flat fee to buy or
// sell up to 300 shares + 1c USD for every additional share after that per
// transaction"; "0.5% To exchange money" (NZD/USD on deposit and
// withdrawal).
//   https://www.hatchinvest.nz/pricing
//
//   node brokers/hatch/hatch_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { usTop } from "../tfcapital/usTop.mjs";
import { readPage, check, describe } from "../bellbank/ekoBook.mjs";

const FAQS = "https://www.hatchinvest.nz/faqs";
const PRICING = "https://www.hatchinvest.nz/pricing";
const SHARES = 5800;
const ETFS = 1900;

check(FAQS, await readPage(FAQS), [
  /buy and sell shares in over 5,800\+ companies and 1,900\+ exchange traded funds \(ETFs\)/i,
  /largest share markets in the world \(the NYSE and the Nasdaq\)/i,
  /DriveWealth/,
  /BlackRock, and Ark/i,
]);
check(PRICING, await readPage(PRICING), [/Flat fee to buy or sell up to 300 shares \+ 1. USD for every additional share/i]);

const book = await usBook();
const all = stampRows(withoutObligations(book));
if (all.length < 10000) throw new Error(`only ${all.length} rows in the US book`);
const shares = await usTop(all.filter((row) => row.type === "STOCK"), SHARES);
const etfs = await usTop(all.filter((row) => row.type === "ETF"), ETFS);
if (shares.length !== SHARES || etfs.length !== ETFS) throw new Error(`kept ${shares.length} shares and ${etfs.length} ETFs`);
const rows = [...shares, ...etfs];
for (const ticker of ["AAPL", "BABA", "NIO", "VOO", "ARKK"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
rows.report = book.report;
fs.writeFileSync(new URL("hatch-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(describe(rows));
console.error(`shares: top ${shares.report.kept} of ${shares.report.candidates}, last ${shares.report.cutoff}; ETFs: top ${etfs.report.kept} of ${etfs.report.candidates}, last ${etfs.report.cutoff}`);
