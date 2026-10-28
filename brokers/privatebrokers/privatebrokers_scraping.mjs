// What Private Brokers (a trading name of HABERL Wealth Management,
// o.c.p., a.s., Bratislava, licensed by the National Bank of Slovakia)
// sells on the US place, with no login. The shares page offers "stovky
// akcií na globálnych trhoch" ("10 000+ akcií") such as "Apple, Tesla,
// Nvidia, Intel, Alphabet", with fractional shares "pre americké akcie na
// burzách v USA"; the ETF page offers "1000+ ETF fondov" tracking "S&P
// 500, MSCI World a iných"; the FAQ says clients can trade "akcií,
// indexov či ETF". The list is in the platform only ("Zoznam dostupných
// titulov nájdete v našej obchodnej platforme"), and no page names a
// board, a segment or a kind of listed share or fund left out, so the
// catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt.
//
//   https://www.privatebrokers.eu/produkty/akcie/
//   https://www.privatebrokers.eu/produkty/etf/
//   https://www.privatebrokers.eu/faq/
//
// broker-list.json says "No US-domiciled ETFs (PRIIPs/KID)" for this
// place. No Private Brokers page says it: the FAQ, the product pages, the
// fee schedule, the general terms (Všeobecné obchodné podmienky), the
// execution policy and the risk description (Opis povahy a rizík, which
// covers "ETF/ETN/ETC" without a word on a KID) were read on 25 October
// 2026. Unverified, it is not applied: US ETFs and ETNs stay, without a
// residency flag.
//   https://www.privatebrokers.eu/dokumenty-a-povinne-udaje/
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: no page names
// them. "Indexy" are index products, not listed titles. The US is one
// NBBO market: one row per title, on its primary listing, in dollars. The
// European shares the platform also offers are other places, not in this
// file.
//
// Fees ("Nákup 0,5 % z hodnoty transakcie, min. 3 USD/EUR/CHF", the same
// for a sale; schedule valid from 3 February 2026):
//   https://www.privatebrokers.eu/poplatky-a-cennik/
//
//   node brokers/privatebrokers/privatebrokers_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#8211;|&ndash;/g, "–").replace(/&nbsp;| |\s+/g, " ").replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://www.privatebrokers.eu/poplatky-a-cennik/", [
  /Nákup 0,5 % z hodnoty transakcie, min\. 3 USD\/EUR\/CHF/i,
  /Predaj 0,5 % z hodnoty transakcie, min\. 3 USD\/EUR\/CHF/i,
]);
await pause();
await evidence("https://www.privatebrokers.eu/produkty/akcie/", [/10 000\+ akcií/i, /pre americké akcie na burzách v USA/i]);
await pause();
await evidence("https://www.privatebrokers.eu/produkty/etf/", [/1000\+ ETF fondov/i]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("privatebrokers-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (rows.length < book.length) console.error(`${book.length - rows.length} bonds left out`);
