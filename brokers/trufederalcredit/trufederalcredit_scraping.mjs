// What TRU Federal Credit Union sells in shares and exchange-traded
// products, with no login. Trading runs through the InvestiFi investment
// portal inside TRU online banking (broker InvestiFi Securities LLC,
// clearing RQD Clearing LLC). The portal page says: "Choose from a wide
// range of stocks, ETFs, and Cryptocurrency to fit your goals" and "you can
// buy fractional shares of stocks, ETFs or cryptocurrency".
//
//   https://tru-fcu.org/investment-portal/
//
// No list is published: the portal sits behind online banking, and
// InvestiFi's own sites (investifi.com, investifi.co) answer only with a
// Cloudflare challenge. Other credit unions on the same platform call it "a
// curated selection of exchange-listed stocks and ETFs", and press releases
// put it at "over 6,500 stocks and ETFs" (cuinsight.com, Mid Minnesota
// FCU). TRU's page names no board, segment or kind of listed share left
// out, so the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt. It is likely larger than what the portal
// shows (about 12,000 lines against 6,500).
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: no page mentions
// them. Cryptocurrencies are not shares. The US is one NBBO market: one row
// per title, on its primary listing, in dollars.
//
// Remarks, not removals (they depend on the client or the order): members
// over 18 in good standing, "Commercial accounts may not be used", US
// residents only; "The minimum purchase for securities is $1.00".
//
// Fees: "The cost to trade securities is free" (the crypto fee schedule on
// the same page does not apply to shares). The InvestiFi Securities
// Customer Agreement (section 23, the same agreement as the other InvestiFi
// credit unions): "We do not currently charge fees, such as commissions,
// mark-ups or otherwise, on Customer Account transactions".
//   https://tru-fcu.org/investment-portal/
//
//   node brokers/trufederalcredit/trufederalcredit_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PAGE = "https://tru-fcu.org/investment-portal/";

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [
  /Choose from a wide range of stocks, ETFs, and Cryptocurrency/i,
  /The cost to trade securities is free/i,
  /InvestiFi/,
]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("trufederalcredit-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
