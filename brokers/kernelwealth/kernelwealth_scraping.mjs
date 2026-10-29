// What Kernel Wealth (Auckland, New Zealand) sells in US shares and ETFs
// through Kernel's "Shares & ETFs", with no login. "Direct access to a
// broad range of US shares and ETFs in one place", held and traded in NZD
// through "our U.S. broker": "Explore a range of 3,000+ US shares alongside
// the biggest and best-known ETFs" and "Diversify your portfolio with 300+
// ETFs from providers you can trust - Vanguard, Invesco and SPDR". Kernel's
// own index funds are managed funds, not exchange-traded, and are not here.
//
//   https://kernelwealth.co.nz/shares-etfs
//
// The list sits in the app. The page speaks of the "US market" and names
// no exchange list ("Own the NYSE in NZD" is a slogan); broker-list.json
// says NYSE and Nasdaq. The place is the United States. Owner rule (stated
// count, top N, per kind when the broker splits them): the 3,000 most
// popular shares (type STOCK: shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds) and the 300 most popular ETFs of the whole
// US exchange book of the day (../wellstrade/usBook.mjs: warrants, rights,
// units, when-issued lines, listed notes and halted lines out; bonds out by
// withoutObligations), each ranked by 30-day average traded value
// (../tfcapital/usTop.mjs). ETNs are notes, neither shares nor ETFs, and
// are left out. No OTC line. One row per title on its primary listing, in
// dollars (bought and held from NZD).
//
// Remarks, not removals: New Zealand residents with a general individual
// Kernel account.
//
// Fees (same page): "No brokerage fees" on every plan; Core "$0 NZD monthly
// 1.5 % FX fee on US shares & ETFs", Plus "$5 NZD monthly 0.6 % FX fee",
// Premium "$15 NZD monthly 0.4 % FX fee".
//
//   node brokers/kernelwealth/kernelwealth_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { usTop } from "../tfcapital/usTop.mjs";
import { readPage, check, describe } from "../bellbank/ekoBook.mjs";

const PAGE = "https://kernelwealth.co.nz/shares-etfs";
const SHARES = 3000;
const ETFS = 300;

check(PAGE, await readPage(PAGE), [
  /Explore a range of 3,000\+ US shares/i,
  /Diversify your portfolio with 300\+ ETFs/i,
  /No brokerage fees/i,
  /\$ ?0 NZD monthly 1\.5 ?% FX fee on US shares & ETFs/i,
]);

const book = await usBook();
const all = stampRows(withoutObligations(book));
if (all.length < 10000) throw new Error(`only ${all.length} rows in the US book`);
const shares = await usTop(all.filter((row) => row.type === "STOCK"), SHARES);
const etfs = await usTop(all.filter((row) => row.type === "ETF"), ETFS);
if (shares.length !== SHARES || etfs.length !== ETFS) throw new Error(`kept ${shares.length} shares and ${etfs.length} ETFs`);
const rows = [...shares, ...etfs];
for (const ticker of ["AAPL", "NVDA", "VOO", "SPY", "QQQ"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
rows.report = book.report;
fs.writeFileSync(new URL("kernelwealth-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(describe(rows));
console.error(`shares: top ${shares.report.kept} of ${shares.report.candidates}, last ${shares.report.cutoff}; ETFs: top ${etfs.report.kept} of ${etfs.report.candidates}, last ${etfs.report.cutoff}`);
