// What Think Alpha (Think Alpha / Trading Alpha, introducing broker-dealer;
// clearing and custody Wedbush Securities) sells in shares and
// exchange-traded products, with no login. Its Form CRS: customers "effect
// buy and sell transactions in U.S. equity securities (including
// exchange-listed stocks, adrs, and exchange-traded products, as well as
// some stocks that trade in over-the-counter markets) and U.S. exchange
// listed options", and "The Firm's brokerage services are conducted
// entirely online".
//
//   https://tradingalpha.com/csr/
//
// No list of titles is published, so:
// - United States: the whole US exchange book of the day
//   (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
//   preferreds, closed-end funds, ETFs and ETNs (exchange-traded products)
//   on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock
//   Exchange, less the lines with an open trade halt; warrants, rights,
//   units, when-issued lines and listed notes are left out there, bonds by
//   withoutObligations.
// - OTC Markets: "some stocks" with no list and no tier named, so (owner
//   rule, 2026-10-25) the four tiers with a public quote, OTCQX, OTCQB,
//   OTCID and Pink Limited (../moomoous/otcBook.mjs; Grey and Expert Market
//   out). This overstates "some"; it is the rule while no list is public.
// The US is one NBBO market: one row per title on its primary listing, in
// dollars; an OTC title is one row on "OTC Markets".
//
// Remarks, not removals: "account minimum is $50,000" (account form on the
// home page); a day-trading broker for "professional retail and boutique
// clients".
//
// Fees: "Equity Commission Starting at .0025/share", "High Volume traders
// please contact us for pricing" (home page); the CRS: "we charge
// transaction-based fees to buy and sell securities", plus market data,
// clearing, regulatory and exchange fees. Only the starting rate is
// printed.
//   https://tradingalpha.com/
//
//   node brokers/thinkalpha/thinkalpha_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage, countLine } from "../cashapp/pageCheck.mjs";
import { otcBook } from "../moomoous/otcBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

await checkPage("https://tradingalpha.com/csr/", [
  /exchange-listed stocks, adrs, and exchange-traded products, as well as some stocks that trade in over-the-counter markets/i,
  /brokerage services are conducted entirely online/i,
  /Wedbush/,
]);
await checkPage("https://tradingalpha.com/", [/Equity Commission Starting at \.0025\/share/i, /account minimum is \$50,000/i]);

const us = await usBook();
const otc = await otcBook(us);
const rows = stampRows(withoutObligations([...us, ...otc.rows]));
if (rows.length < 20000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("thinkalpha-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(countLine(rows));
console.error(`directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}; ${otc.summary}`);
