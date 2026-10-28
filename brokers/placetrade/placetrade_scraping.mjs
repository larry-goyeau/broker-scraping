// Place Trade Financial, Inc. (Raleigh, North Carolina; FINRA/SIPC member)
// is an introducing broker of Interactive Brokers: its "Open an Account",
// login and pricing links all lead to clientam.com with partnerID=placetrade,
// and the accounts are carried by IBKR LLC. So the book is IBKR's stock and
// ETF universe on the places Place Trade prices. Its investment page says
// "U.S. & Global Stock Markets" and "Trade over 15,000 ETFs globally on 90+
// market centers"; its commission pages price shares and ETFs country by
// country (Americas, EMEA, APAC). The places read are Place Trade's places
// in broker-list.json, each one checked against a priced section of those
// pages (Germany is priced as "Direct Routed (SWB)" and "Direct Routed
// (GETTEX)", which broker-list names Börse Stuttgart and gettex).
//
// The reading is ./ibkrBook.mjs: IBKR's public "Products & Exchanges" lists
// (no login), each contract's own list of exchanges from IBKR's public
// secdef, one row per place a contract trades on, the US venues as one
// NBBO tape (one row per title on its primary listing, so Cboe BZX and
// Texas listings come too), then the lines that cannot be bought dropped
// against the exchanges' own lists (../ibkrus/ibkr_exchange_lists.mjs and
// ../easybroker/venue_lists.mjs: suspended, delisted and sell-only lines,
// ASX non-share lines, TOKYO PRO Market, Expert Market, ...). Country
// places are the country's main exchange (Mexico: Bolsa Mexicana, Austria:
// Wiener Börse, Denmark: Nasdaq Copenhagen, Norway: Oslo Børs, Sweden:
// Nasdaq Stockholm, Switzerland: SIX, Japan: Tokyo, Singapore: SGX, the
// Baltic countries: Nasdaq Tallinn, Riga and Vilnius, Italy: Euronext Milan
// and ETFplus, United Kingdom: LSE plus London IOB depositary receipts).
//
// Left out (in ibkrBook): warrants, rights, interim shares (BTA, BTU),
// when-issued, subscription-receipt and partly-paid lines, test symbols,
// ISINs with a wrong check digit, Spanish SIL company shares, dead
// contracts (.OLD/.NEW/.BAD, no currency), bonds, and Russian ISINs: the
// EMEA page says "PT clients cannot open or close positions on the Moscow
// Stock Exchange (MOEX) at this time" (sanctions).
//
// Kept with a remark (the restriction depends on the client, not the title):
// - NSE. The APAC page prices "Commissions - India" and says "Stocks on the
//   NSE are only available to Indian residents." Its rows carry the house
//   flag indianOnly (as ../mexem), which shows them to India residents only.
// - Non-US ETFs, ETCs and ETNs. The accounts are at IBKR LLC, and IBKR's FAQ
//   467097743 says "U.S. residents are not allowed to trade non-U.S. ETFs
//   as they may not be registered for sale in the United States." Place
//   Trade takes clients worldwide, so a fund line without a US ISIN keeps
//   its row with that remark.
// - Stock Connect STAR Market (688/689) and ChiNext (300/301) codes:
//   Northbound trading in them is for institutional professional investors
//   only (Stock Connect rule, as in ../ibkrus).
//
// Fees (tables in the page's embedded frames, no login):
//   https://placetrade.com/commissions-stocks            (US, Canada, Mexico)
//   https://placetrade.com/commission%3A-stocks-emea-1   (Austria to Germany)
//   https://placetrade.com/commission%3A-stocks-emea-2   (Hungary to Portugal)
//   https://placetrade.com/commission%3A-stocks-emea-3   (Russia to United Kingdom)
//   https://placetrade.com/commissions-stocks-apac       (Australia to Taiwan)
// Sources:
//   https://placetrade.com/investment-types-1
//   https://www.clientam.com/en/trading/products-exchanges.php
//   https://www.interactivebrokers.com/lib/cstools/faq/#/content/467097743
//
//   node brokers/placetrade/placetrade_scraping.mjs
//   (IBKR_BOOK_CACHE=<file> keeps the IBKR read for 24 h between runs)

import { stampRows } from "../../accepted.mjs";
import { ibkrBook } from "./ibkrBook.mjs";
import fs from "node:fs";

const FOLDER = "placetrade";
const BROKER = "Place Trade";

const NSE = "National Stock Exchange of India";
const NSE_REMARK = "Stocks on the NSE are only available to Indian residents.";
const US_PERSON_REMARK = "Non-US fund: IBKR does not let US residents trade non-US ETFs; open to non-US clients.";
const CONNECT = new Set(["Shanghai-Hong Kong Stock Connect", "Shenzhen-Hong Kong Stock Connect"]);
const PROFESSIONAL_REMARK = "STAR Market and ChiNext Northbound lines are for institutional professional investors only.";

const entry = JSON.parse(fs.readFileSync(new URL("../../broker-list.json", import.meta.url), "utf8")).find((item) => item.name === BROKER);
if (!entry) throw new Error(`${BROKER} is not in broker-list.json`);
const places = Object.keys(entry.exchanges);
const restricted = places.filter((place) => entry.exchanges[place].restriction);
if (restricted.length) throw new Error(`broker-list restrictions not handled: ${restricted.join(", ")}`);

const rows = await ibkrBook(places, { cache: process.env.IBKR_BOOK_CACHE || "" });

const remarks = new Map();
for (const row of rows) {
  const notes = [];
  if (row.exchange === NSE) {
    row.indianOnly = true;
    notes.push(NSE_REMARK);
  }
  if (row.type !== "STOCK" && !row.isin.startsWith("US")) notes.push(US_PERSON_REMARK);
  if (CONNECT.has(row.exchange) && /^(68[89]|30[01])/.test(row.ticker)) notes.push(PROFESSIONAL_REMARK);
  if (!notes.length) continue;
  row.remark = notes.join(" ");
  for (const note of notes) remarks.set(note, (remarks.get(note) || 0) + 1);
}

const kept = stampRows(rows);
fs.writeFileSync(new URL(`${FOLDER}-parsed.json`, import.meta.url), JSON.stringify(kept, null, 2));

const types = new Map();
for (const row of kept) types.set(row.type, (types.get(row.type) || 0) + 1);
console.error(`${kept.length} rows (${[...types].map(([type, count]) => `${count} ${type}`).join(", ")}) on ${new Set(kept.map((row) => row.exchange)).size} exchanges, ${kept.filter((row) => !row.isin).length} without ISIN`);
for (const [note, count] of remarks) console.error(`${count} rows remarked: ${note}`);
