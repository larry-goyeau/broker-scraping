// The self-directed book of InvestiFi (broker InvestiFi Securities LLC,
// executing broker and custodian RQD Clearing LLC), the investing portal
// that US credit unions embed in their online banking: River Valley
// (../rivervalleycredi), SouthPoint (../southpointfinanc), Truity
// (../truitycreditunio), WeStreet (../westreetcreditun), Panhandle
// (../panhandlecreditu), Cincinnati Ohio Police (../cincinnatiohiopo),
// Create (../createcreditunio), First Commerce (../firstcommercecre),
// Heritage Valley (../heritagevalleyfe), United Financial
// (../unitedfinancialc) and Northwest (../northwestfederal). Each credit
// union writes its own scraper; this module gives the rows they share.
//
// The list itself sits inside the portal, behind online banking, and
// InvestiFi's own site (investifi.com) answers bots with a Cloudflare 403.
// What is public:
//
// - InvestiFi Securities' Form CRS (FINRA BrokerCheck, CRD 289604):
//   "Our primary business is providing retail customers with brokerage
//   accounts where they can place orders to buy and sell stocks and
//   exchange-traded funds ("ETFs"). We offer small-, mid-, and large-cap
//   equity stocks and ETFs." and, for fees, "We do not charge commissions
//   on trades. However, you may incur charges imposed by RQD and other
//   third parties."
//     https://files.brokercheck.finra.org/crs_289604.pdf
// - The partner pages: "Only equity securities are offered through
//   InvestiFi's platform" (United Financial, Panhandle), and the size of
//   the book, the same portal for every partner: "Buy and sell more than
//   6,500 stocks and ETFs directly from your app" (First Commerce) and "buy
//   and sell over 6,500 stocks and exchange-traded funds (ETFs)" (Heritage
//   Valley).
//     https://www.firstcommercecu.org/investing/
//     https://heritagevalleyfcu.org/digitalinvesting/
//
// So the book starts from the whole US exchange book of the day
// (../wellstrade/usBook.mjs: Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe
// BZX, Texas Stock Exchange; warrants, rights, units, when-issued lines,
// listed notes and halted lines are left out there; OTC lines are not in
// it, and every partner page says "exchange-listed" or names none), less
// ETNs (notes, not equity: "Only equity securities") and bonds
// (withoutObligations). The platform states a number and no list, so
// (owner rule, 2026-10-25) it keeps the 6,500 most popular of those
// titles, shares and ETFs ranked together by 30-day average traded value
// (../tfcapital/usTop.mjs). The CRS's "small-, mid-, and large-cap" is not
// applied as a size floor of its own: the ranking already cuts the
// smallest and thinnest lines. The US is one NBBO market: one row per
// title on its primary listing, in dollars.
//
// Use:
//   import { investifiBook } from "../rivervalleycredi/investifiBook.mjs";
//   const rows = await investifiBook();   // stamped rows; rows.report
//
//   node brokers/rivervalleycredi/investifiBook.mjs   (the counts)

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkPage } from "../cashapp/pageCheck.mjs";
import { usTop } from "../tfcapital/usTop.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

export const CRS = "https://files.brokercheck.finra.org/crs_289604.pdf";
export const COUNT_PAGES = {
  "https://www.firstcommercecu.org/investing/": /Buy and sell more than 6,500 stocks and ETFs/i,
  "https://heritagevalleyfcu.org/digitalinvesting/": /buy and sell over 6,500 stocks and exchange-traded funds/i,
};
export const N = 6500;

export async function investifiBook() {
  await checkPage(CRS, [
    /InvestiFi Securities LLC/,
    /buy and sell stocks and exchange-\s?traded funds/i,
    /We offer small-, mid-, and large-cap equity stocks and ETFs/i,
    /We do not charge commissions on trades/i,
  ], { pdf: true });
  for (const [url, pattern] of Object.entries(COUNT_PAGES)) await checkPage(url, [pattern, /InvestiFi/]);

  const book = await usBook();
  const etns = book.filter((row) => row.type === "ETN");
  const candidates = withoutObligations(book.filter((row) => row.type !== "ETN"));
  if (candidates.length < 10000) throw new Error(`short US book: ${candidates.length} lines`);
  const top = await usTop(candidates, N);
  if (top.length !== N) throw new Error(`only ${top.length} rows`);
  const rows = stampRows(top);
  for (const ticker of ["AAPL", "MSFT", "BRK.B", "SPY", "QQQ"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
  rows.report = { ...book.report, etnsLeftOut: etns.length, candidates: candidates.length, top: top.report };
  return rows;
}

// One credit union's scraper: check its pages ({ url: [patterns] }), write
// its catalogue.
export async function writeCreditUnion(folderUrl, folder, pages) {
  for (const [page, patterns] of Object.entries(pages)) await checkPage(page, patterns);
  const rows = await investifiBook();
  fs.writeFileSync(new URL(`${folder}-parsed.json`, folderUrl), JSON.stringify(rows, null, 2));
  const counts = {};
  for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
  console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
  const { report } = rows;
  console.error(`directories ${JSON.stringify(report.directories)}; halts: ${report.halts.join(", ")}; ${report.etnsLeftOut} ETNs left out; top ${N} of ${report.candidates}: ${JSON.stringify(report.top)}`);
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const rows = await investifiBook();
  console.log(rows.length, rows.report.top, `${rows.report.etnsLeftOut} ETNs left out`);
}
