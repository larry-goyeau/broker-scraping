// What Hellenic American Securities (ΕλληνοΑμερικανική Χρηματιστηριακή
// ΑΕΠΕΥ, Athens) sells, with no login: every share and exchange-traded
// fund on the Athens Stock Exchange, and US shares and ETFs, a place for
// which it publishes no list.
//
// Orders go online through zTrade ("Μέσω της διαδικτυακής ηλεκτρονικής
// εφαρμογής διαβίβασης εντολών zTrade", web, iPhone and Android) or by
// phone. The Greek-market page: the firm is a member of the Athex
// regulated market "στην οποία οι επενδυτές μπορούν να διαπραγματευθούν
// σε Ελληνικές μετοχές, οι οποίες ανήκουν σε διάφορες κατηγορίες
// διαπραγμάτευσης καθώς σε ETFs και ομόλογα" (Greek shares of every
// trading category, ETFs and bonds). The international page offers
// "σύγχρονες πλατφόρμες συναλλαγών για την εκτέλεση είτε απευθείας είτε
// μέσω τηλεφώνου" and "συναλλαγές στα μεγαλύτερα χρηματιστήρια
// παγκοσμίως"; the fee annex prices "ΣΥΝΑΛΛΑΓΕΣ ΣΕ ΜΕΤΟΧΕΣ & ΔΙΑΠΡΑΓΜ.
// ΑΜΟΙΒΑΙΑ ΚΕΦΑΛΑΙΑ (ETFs) ΣΤΙΣ ΔΙΕΘΝΕΙΣ ΑΓΟΡΕΣ", "Markets: US-Core
// Europe- Asia". No page names a board, segment or kind of share or fund
// left out, and none gives a count.
//
// Athens: the exchange's whole book (./athexBook.mjs): the shares of the
// Main Market (with its Surveillance segment) and of EN.A. Growth (the
// former Alternative Market; no page leaves it out), and the ETF (AETF),
// less the lines the exchange's feed marks suspended (six on 2026-10-23).
// In euros, MIC XATH.
//
// United States: no exchange is named, so the catalogue keeps the
// country's exchanges, the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt, warrants, rights, units, when-issued
// lines and listed notes (usBook) and bonds (withoutObligations). One NBBO
// market: one row per title, on its primary listing, in dollars.
//
// Europe and Asia: abroad, Hellenic American routes through Interactive
// Brokers. Its MiFID II pre-contract file lists its execution venues as
// "ΧΡΗΜΑΤΙΣΤΗΡΙΟ ΑΘΗΝΩΝ, Χ-ΝΕΤ, INTERACTIVE BROKERS, EUROBANK", and its
// client contract names the online platforms "(Ζ-TRADE , Interactive
// Brokers)". The fee annex prices "Markets: US-Core Europe- Asia" and names
// no exchange. So the owner's reading (2026-10-26): Core Europe is every
// European place IBKR offers, Asia every Asian place IBKR offers but the
// NSE (Indian residents only), read with ../placetrade/ibkrBook.mjs (IBKR's
// public Products & Exchanges lists and secdef, one row per place a
// contract trades on, less the lines the exchanges' own lists show cannot
// be bought). IBKR files Northbound STAR Market and ChiNext shares in books
// of their own, not read: they are for institutional professional
// investors, not Hellenic American's retail clients. broker-list.json gives
// Hellenic American Athens and the United States only.
//
// KID: the same file says that before a PRIIP is sold to a retail client
// the firm hands over the issuer's key information document ("Πριν από την
// παροχή των επενδυτικών υπηρεσιών ... σε ιδιώτες πελάτες, η Εταιρία ...
// [παραδίδει] ... εγγράφου βασικών πληροφοριών (ΕΒΠ)"). A fund with no KID
// cannot be sold to a retail client, so every fund line, the US and OTC
// ones included, needs one (owner, 2026-10-26), read with
// ../interactivebrokersie/kidRule.mjs (IBIE's order-ticket notice, else
// the fund's domicile).
//
// OTC: the annex sets a minimum fee "για συναλλαγές στις OTC αγορές 60,00 $"
// and names no tier, so the OTC Markets lines of the four tiers with a public quote, OTCQX,
// OTCQB, OTCID and Pink Limited (../moomoous/otcBook.mjs; owner rule: the
// tiers the broker names, else all of them).
//
//   https://www.hellenicamerican.gr/ενημέρωση-πελατών/διαδικασια-ληψησ-εντολων/
//   https://www.hellenicamerican.gr/προϊόντα-και-υπηρεσίες/ελληνική-αγορά-αξιών-και-παραγώγων/
//   https://www.hellenicamerican.gr/προϊόντα-και-υπηρεσίες/διεθνεισ-αγορεσ/
//   https://athens.euronext.com/en/market-data/instruments/stocks
//   https://www.hellenicamerican.gr/wp-content/uploads/2023/03/MiFID23.01.2023.pdf   (execution venues, KID)
//   https://www.hellenicamerican.gr/wp-content/uploads/2023/03/EAsec_221217.pdf      (platforms)
//
// Fees: the contract annex of 17.05.2024 (Athens shares 1% up to
// €2,934.70, 0.75% to €8,804.11, 0.50% above, minimum €5.87; abroad $30
// up to $3,500, then 1%, 0.75% above $10,000):
//   https://www.hellenicamerican.gr/wp-content/uploads/2025/04/ΑΜΟΙΒΑΙΕΣ-ΧΡΕΩΣΕΙΣ-2.pdf
//
//   node brokers/hellenicamerican/hellenicamerican_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { kidRule } from "../interactivebrokersie/kidRule.mjs";
import { otcBook } from "../moomoous/otcBook.mjs";
import { ibkrBook } from "../placetrade/ibkrBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { athexBook } from "./athexBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SITE = "https://www.hellenicamerican.gr/";
const EUROPE = [
  "London Stock Exchange", "London IOB", "Cboe Europe", "Turquoise", "Aquis Exchange", "Wiener Börse",
  "Euronext Brussels", "Euronext Paris", "Euronext Amsterdam", "Euronext Lisbon", "Euronext Dublin", "Euronext Milan", "ETFplus",
  "Bolsa de Madrid", "Börse Xetra", "Börse Frankfurt", "Börse Stuttgart", "gettex", "Tradegate",
  "Nasdaq Copenhagen", "Nasdaq Helsinki", "Nasdaq Stockholm", "Oslo Børs", "SIX Swiss Exchange",
  "Warsaw Stock Exchange", "Prague Stock Exchange", "Budapest Stock Exchange", "Bucharest Stock Exchange", "Ljubljana Stock Exchange",
  "Nasdaq Tallinn", "Nasdaq Riga", "Nasdaq Vilnius",
];
const ASIA = [
  "Hong Kong Stock Exchange", "Shanghai-Hong Kong Stock Connect", "Shenzhen-Hong Kong Stock Connect",
  "Tokyo Stock Exchange", "Singapore Exchange", "Korea Exchange", "Taiwan Stock Exchange", "Taipei Exchange", "Bursa Malaysia",
];
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The pages still say what the header quotes, or the run stops.
async function evidence(path, patterns) {
  const url = SITE + encodeURI(path);
  const response = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const html = await response.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text) && !pattern.test(html)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("ενημέρωση-πελατών/διαδικασια-ληψησ-εντολων/", [/Μέσω της διαδικτυακής ηλεκτρονικής εφαρμογής διαβίβασης εντολών zTrade/]);
await pause();
await evidence("προϊόντα-και-υπηρεσίες/ελληνική-αγορά-αξιών-και-παραγώγων/", [
  /διαπραγματευθούν σε Ελληνικές μετοχές, οι οποίες ανήκουν σε διάφορες κατηγορίες διαπραγμάτευσης καθώς σε ETFs/,
]);
await pause();
await evidence("προϊόντα-και-υπηρεσίες/διεθνεισ-αγορεσ/", [/συναλλαγές στα μεγαλύτερα χρηματιστήρια παγκοσμίως/]);
await pause();
await evidence("ενημέρωση-πελατών/αμοιβεσ-χρεωσεισ-εξοδα/", [/ΑΜΟΙΒΑΙΕΣ-ΧΡΕΩΣΕΙΣ-2\.pdf/]);

const athens = await athexBook();
const us = await usBook();
const otc = await otcBook(us);
const abroad = await ibkrBook([...EUROPE, ...ASIA], { cache: process.env.IBKR_BOOK_CACHE || "" });

const kid = kidRule();
const kidLeft = {};
const sellable = [...athens.rows, ...us, ...otc.rows, ...abroad].filter((row) => {
  const reason = kid.noKid(row.type, row.isin);
  if (reason) kidLeft[reason] = (kidLeft[reason] || 0) + 1;
  return !reason;
});
const rows = stampRows(withoutObligations(sellable));
if (rows.filter((row) => row.mic === "XATH").length < 120) throw new Error("short Athens part");
if (rows.length < 40000) throw new Error(`only ${rows.length} rows`);
for (const [isin, mic, present] of [["US78462F1030", "ARCX", false], ["IE00BK5BQT80", "XETR", true], ["US0378331005", "XNAS", true], ["JP3633400001", "XTKS", true], ["HK0000069689", "XHKG", true]]) {
  if (rows.some((row) => row.isin === isin && row.mic === mic) !== present) throw new Error(`${isin} on ${mic} should ${present ? "" : "not "}be in`);
}
fs.writeFileSync(new URL("hellenicamerican-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`hellenicamerican: ${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(
  `Athens ${athens.tradeDate} lists ${JSON.stringify(athens.counts)}, dropped ${athens.dropped.join(", ") || "none"}; ` +
    `US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`
);
console.error(otc.summary);
console.error(`abroad (IBKR): ${abroad.length} rows`);
console.error(`KID: left out ${JSON.stringify(kidLeft)}; read from IBIE's notice ${kid.source.ibie}, from the domicile ${kid.source.domicile}`);
