// What Prudence Capital (brokersko-dilersko društvo, Belgrade) sells
// online, with no login: every share on the Belgrade Stock Exchange, and
// the US shares and ETFs, a place for which it publishes no list.
//
// Its brokerage page offers two online routes: the local "WEB platforma za
// trgovanje vam pruža siguran i efikasan kanal za investiranje na domaćem i
// međunarodnim tržištima" (orders placed online, executed by Prudence on
// the Belgrade exchange), and the Interactive Brokers platform ("Investirajte
// putem Interactive Brokers platforme"); its FAQ: "Mogu li da kupujem akcije
// američkih kompanija? Da." and ETFs are among the instruments. Its tariff
// prices both: the WEB platform "do 0.5% od trgovane vrednosti", and on the
// IBKR platform "Akcije / ETF ... SAD". broker-list.json gives the United
// States and the Belgrade Stock Exchange; the IBKR route reaches many other
// markets ("Investirajte na preko 80 globalnih tržišta"), which the row
// does not list and which are not built here.
//
// Belgrade. No page names a tier or class left out, so the catalogue is the
// exchange's book (./belexBook.mjs): every share on its "Securities -
// Shares" list (Prime Listing, Open Market, MTP), less issuers in
// bankruptcy or liquidation and lines with no trade in the last 52 weeks.
// Suspended lines are already off the exchange's list. Belgrade lists no
// ETF. In dinars (RSD, XBEL).
//
// United States. The pages name no US exchange and no count, so the
// catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on the US exchanges, less
// the lines with an open trade halt, warrants, rights, units, when-issued
// lines and listed notes (usBook) and bonds (withoutObligations). One NBBO
// market: one row per title, on its primary listing, in dollars.
//
//   https://prudencecapital.rs/usluge/brokerski-poslovi/
//   https://prudencecapital.rs/tarifnik/
//   https://bgdx.rs/eng/trzista_i_hartije/hartije/akcije/sve
//
// Fees: https://prudencecapital.rs/tarifnik/ (read from the page's own
// content, https://prudencecapital.rs/wp-json/wp/v2/pages?slug=tarifnik:
// "Tarifnik WEB platforma: Naknada za realizaciju naloga – do 0.5% od
// trgovane vrednosti + troškovi saldiranja i ino brokera"; IBKR platform,
// shares and ETFs, US: PROGRESIV 0,15 % (minimum 10 USD), BASIC 0,3 %
// (minimum 15 USD) "od vrednosti realizovanog naloga"; custody 0.3 % a
// year).
//
//   node brokers/prudence/prudence_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { belexBook } from "./belexBook.mjs";
import { says, plain } from "../denizyatrm/evidence.mjs";

await says("https://prudencecapital.rs/usluge/brokerski-poslovi/", [
  /WEB platforma za trgovanje vam pruža siguran i efikasan kanal za investiranje na domaćem i međunarodnim tržištima/,
  /Investirajte putem Interactive Brokers platforme/,
  /Mogu li da kupujem akcije američkih kompanija\?/,
]);
const tariff = await fetch("https://prudencecapital.rs/wp-json/wp/v2/pages?slug=tarifnik", { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60_000) });
if (!tariff.ok) throw new Error(`tariff page content answered ${tariff.status}`);
// The page body is WPBakery shortcodes around the table; drop the codes.
const tariffText = plain((await tariff.json())[0]?.content?.rendered || "")
  .replace(/\[\/?[a-z_]+[^\]]*\]/g, " ")
  .replace(/\s+/g, " ");
for (const pattern of [/Tarifnik WEB platforma Naknada za realizaciju naloga – do 0\.5% od trgovane vrednosti/, /BASIC SAD 0,3% od vrednosti realizovanog naloga/]) {
  if (!pattern.test(tariffText)) throw new Error(`the tariff no longer says ${pattern}`);
}

const belex = await belexBook();
const us = await usBook();
const rows = stampRows(withoutObligations([...belex.rows, ...us]));
if (rows.filter((row) => row.mic === "XBEL").length < 60) throw new Error("short Belgrade part");
if (rows.length < 7000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("prudence-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
const reasons = {};
for (const item of belex.leftOut) (reasons[item.reason] ||= []).push(item.ticker);
console.error(`prudence: ${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`Belgrade: ${belex.listed} listed; left out ${Object.entries(reasons).map(([reason, list]) => `${reason} ${list.length}`).join(", ")}`);
