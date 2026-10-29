// What Madison County Federal Credit Union (Anderson, Indiana) sells in
// shares and exchange-traded products, with no login. Its investment
// portal is InvestiFi's, inside MCFCU online banking (broker InvestiFi
// Securities LLC, clearing RQD Clearing LLC): "With InvestiFi, you can
// easily invest in stocks, ETFs (exchange-traded funds), and
// cryptocurrency", "You can purchase up to $5,000 of stocks and ETFs in a
// single transaction".
//
//   https://www.madcofcu.org/investifi/
//   https://www.madcofcu.org/investifi-faq/
//
// The list sits inside the portal, behind online banking. Neither page
// gives a number of lines (broker-list.json's 8,600 is not on them) nor
// names a board, segment or kind of listed share left out. So the
// catalogue is the whole US exchange book of the day, as for the other
// InvestiFi credit unions (../thinkwisecreditu, ../bluestonefederal):
// ../wellstrade/usBook.mjs gives shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt. Left out: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). Crypto is not here; OTC Markets lines are not
// added (never named). One row per title on its primary listing, in
// dollars.
//
// Remarks, not removals: "Only members over the age of 18 and in good
// standing with the financial institution can buy/sell/hold securities.
// Commercial accounts may not be used."; US residents only; market orders
// only; at most $5,000 a purchase, minimum $1.00.
//
// Fees: "for as little as $1.00 with no fee charges for purchasing" (invest
// page; "Low Fees ... competitive, transparent pricing"). The page prints
// no charge for selling; the executing broker's InvestiFi Securities
// Customer Agreement (section 23, the agreement the other InvestiFi credit
// unions publish, e.g. frankenmuthcu.org/wp-content/uploads/2025/06/
// InvestiFi-Securities-Customer-Agreement-FINAL.pdf) says "We do not
// currently charge fees, such as commissions, mark-ups or otherwise, on
// Customer Account transactions" (stand-in for the sell side).
//
//   node brokers/madisoncountyfed/madisoncountyfed_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { readPage, check, describe } from "../bellbank/ekoBook.mjs";

const PAGE = "https://www.madcofcu.org/investifi/";
const FAQ = "https://www.madcofcu.org/investifi-faq/";

const page = await readPage(PAGE);
check(PAGE, page, [
  /invest in stocks, ETFs \(exchange-traded funds\), and cryptocurrency/i,
  /no fee charges for purchasing/i,
  /purchase up to \$5,000 of stocks and ETFs in a single transaction/i,
  /InvestiFi Securities/i,
]);
const faq = await readPage(FAQ);
check(FAQ, faq, [/Only members over the age of 18 and in good standing/i, /limits buys and sells to market orders only/i]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
for (const ticker of ["AAPL", "BRK.B", "SPY"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
fs.writeFileSync(new URL("madisoncountyfed-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(describe(rows));
