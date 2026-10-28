// What first direct (HSBC UK) sells through its Sharedealing account and
// Stocks & Shares ISA on the London Stock Exchange, with no login.
//
// first direct's product page: "you can trade in most UK and Irish equities
// listed on the London Stock Exchange, UK government securities (gilts)
// and a range of UK listed Exchange Traded Funds", and on ETFs: "We don't
// offer synthetically backed ETFs on the sharedealing website". The ETF
// list itself is only shown after logging on, and no share list is
// published, so the catalogue is the LSE book cut down to those words.
// Note: both pages also say "we are no longer accepting applications for
// new first direct Sharedealing accounts" (existing customers only).
//
//   https://www.firstdirect.com/savings-and-investments/sharedealing/what-you-can-trade-in/
//   https://www.firstdirect.com/savings-and-investments/sharedealing/sharedealing-services/   (fees: "£10.50 for the first nine trades each quarter, then £7.95")
//   https://www.firstdirect.com/content/dam/wpb/fsdt/en/documents/pdf/rates-and-charges.pdf
//
// Shares: every share line of the LSE book (Main Market, AIM, ATT) quoted
// in sterling (GBX/GBP), investment trusts, VCTs, REITs and preference
// shares included; a USD/EUR twin of a sterling line is dropped. A share
// the LSE quotes only in another currency is kept in that currency when
// the issuer is British, Irish or from the Crown Dependencies (ISIN GB, IE,
// JE, GG, IM): Compass Group and IHG now trade in USD only, and the charges
// sheet has a "Transactions in Euro" commission: "Trading in Irish equities
// listed on the London Stock Exchange will attract commission in Euros"
// (Kerry, Glanbia, PTSB...). Left out as not "UK and Irish equities":
// other foreign shares with no sterling line (Jardine, Hong Kong Land,
// BBVA, TotalEnergies, Rule 144A GDRs, the Diageo ADR...), International
// Order Book depositary receipts (segments IOBE / IOBU / IOBS) and the
// Professional Securities Market (foreign GDRs). "Most" names no
// exception, so nothing else is dropped.
//
// ETFs: the LSE book's ETF lines (MiFIR class ETFS) quoted in sterling,
// "UK listed Exchange Traded Funds" for a sterling account. ETCs and ETNs
// are not funds and are left out, as are the ETFs whose name says they are
// synthetic ("SWAP", "SYNTHETIC"). A synthetic ETF whose name does not say
// so cannot be told apart from the public data and stays in.
//
// The LSE book is shared with Moneyfarm and Shareview Dealing (see
// ../moneyfarm/lseBook.mjs): today's price-explorer lines, typed by the
// LSE Instrument List, without suspended, halted, never-traded lines and
// warrants.
//
//   node brokers/firstdirect/firstdirect_scraping.mjs

import { lseBook, EXCHANGE, AIM } from "../moneyfarm/lseBook.mjs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const STERLING = new Set(["GBX", "GBP"]);
const FOREIGN_SEGMENTS = new Set(["IOBE", "IOBU", "IOBS"]);
const SYNTHETIC = /\bSWAP\b|\bSYNTH/i;
const HOME_ISIN = /^(GB|IE|JE|GG|IM)/;

const { rows: book, report } = await lseBook();
console.error(`LSE book: ${book.length} lines (${report.instrumentListAsAt} instrument list, built ${report.built})`);

const sterlingIsins = new Set(book.filter((row) => row.type === "STOCK" && STERLING.has(row.currency)).map((row) => row.isin));
const dropped = new Map();
const drop = (reason) => dropped.set(reason, (dropped.get(reason) || 0) + 1);
const results = [];
for (const row of book) {
  const parts = row.raw.split(" | ");
  const market = parts[4];
  const segment = parts[7];
  if (row.type === "ETC" || row.type === "ETN") { drop(`${row.type} (not a fund)`); continue; }
  if (row.type === "STOCK" && market === "PSM") { drop("Professional Securities Market"); continue; }
  if (row.type === "STOCK" && FOREIGN_SEGMENTS.has(segment)) { drop("International Order Book"); continue; }
  const homeOnlyLine = row.type === "STOCK" && HOME_ISIN.test(row.isin) && !sterlingIsins.has(row.isin);
  if (!STERLING.has(row.currency) && !homeOnlyLine) { drop(`${row.type} line not in sterling (twin or foreign)`); continue; }
  if (row.type === "ETF" && SYNTHETIC.test(row.name)) { drop("synthetic ETF"); continue; }
  results.push(row);
}
results.sort((left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name));

const count = (rows, field) => [...rows.reduce((map, row) => map.set(row[field], (map.get(row[field]) || 0) + 1), new Map())].map(([key, value]) => `${value} ${key}`).join(", ");
console.error(`${results.length} rows (${count(results, "type")}; ${count(results, "exchange")})`);
console.error(`left out: ${[...dropped].map(([reason, n]) => `${n} ${reason}`).join(", ")}`);

const want = [
  ["GB0005405286", "HSBC Holdings"],
  ["GB00BP6MXD84", "Shell"],
  ["GB00BHJYC057", "InterContinental Hotels Group (USD only)"],
  ["IE0004906560", "Kerry Group (EUR)"],
  ["IE00B3XXRP09", "Vanguard S&P 500 UCITS ETF"],
];
for (const [isin, label] of want) {
  if (!results.some((row) => row.isin === isin)) throw new Error(`${label} (${isin}) missing`);
}
if (!results.some((row) => row.exchange === AIM) || !results.some((row) => row.exchange === EXCHANGE)) throw new Error("AIM or Main Market missing");
if (results.length < 2500) throw new Error(`only ${results.length} rows, expected about 3,200`);

fs.writeFileSync(new URL("firstdirect-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(results)), null, 2));
