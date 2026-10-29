// What PandaPanda sells in shares and exchange-traded funds, with no
// login. PandaPanda is a Kenyan app (Panda Panda IP Holding; the broker is
// licensed by Kenya's Capital Markets Authority) that buys US shares and
// ETFs for Kenyans, funded through M-PESA. Its App Store text: "bridge the
// gap between Nairobi and Wall Street", "commission free access to global
// stocks and ETF options", "Trades executed via U.S. regulated partner
// Alpaca Securities, SIPC protection up to $500,000". It names no list, no
// count and no exchange beyond "Wall Street", and no exclusion; OTC is not
// mentioned, so it stays out. broker-list.json gives NYSE and Nasdaq; the
// app's wording is not a closed list of venues, so the place is the whole
// US book (../wellstrade/usBook.mjs): one NBBO market, one row per title
// on its listing market (NYSE, Nasdaq, NYSE American, NYSE Arca, Cboe), in
// dollars, without warrants, rights, units, when-issued lines, listed notes
// and halted lines; bonds go through withoutObligations.
//
// Fees: "Start your digital investment journey for KSh 130 and enjoy
// commission free investing", "Free Investing: Commission free access to
// maximize your investment. FX rate shown clearly before you confirm."
// pandapanda.app refuses connections from here, so the App Store text is
// the evidence checked at run time.
//
//   https://pandapanda.app/
//   https://apps.apple.com/ke/app/pandapanda-invest-globally/id6756781894
//   https://itunes.apple.com/lookup?id=6756781894&country=ke (fees)
//
//   node brokers/pandapanda/pandapanda_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import fs from "node:fs";

const APP = "https://itunes.apple.com/lookup?id=6756781894&country=ke";

const app = await (await fetch(APP, { signal: AbortSignal.timeout(30_000) })).json();
const text = app?.results?.[0]?.description || "";
for (const pattern of [/Wall Street/, /commission free access to global stocks and ETF/i, /Alpaca Securities/, /commission free investing/i]) {
  if (!pattern.test(text)) throw new Error(`the PandaPanda App Store text no longer says ${pattern}`);
}

const book = await usBook();
const rows = stampRows(withoutObligations(book));
fs.writeFileSync(new URL("pandapanda-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
const count = {};
for (const row of rows) count[row.type] = (count[row.type] || 0) + 1;
if (rows.length < 8000) throw new Error(`only ${rows.length} US lines`);
console.error(`${rows.length} US listings (${Object.entries(count).map(([type, n]) => `${n} ${type}`).join(", ")})`);
