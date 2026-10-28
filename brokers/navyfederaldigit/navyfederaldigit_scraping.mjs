// What Navy Federal Digital Investor (Navy Federal Investment Services,
// LLC, for Navy Federal Credit Union members; the platform is run by Apex
// Fintech Solutions) sells in its self-directed accounts, with no login.
// The product page offers "access to over 5,000 individual stocks and
// ETFs" (the investments page says "over 5,700 stocks and ETFs"), bought
// in full or fractional shares from $1. Neither page, nor the Client
// Relationship Summary, names a segment, board or kind of share it leaves
// out, and no security list is published (the list is behind the members'
// login). So the catalogue starts from the whole US exchange book of the
// day, read by ../wellstrade/usBook.mjs (shares, ADRs, REITs, preferreds,
// closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE
// Arca, Cboe BZX and the Texas Stock Exchange; warrants, rights, units,
// when-issued lines, listed notes and halted lines are left out there).
// The US is one NBBO market: one row per title on its primary listing, in
// dollars. OTC Markets lines are not offered on the pages and are not in
// the book.
//
// Owner rule 2026-10-25: the N most popular. "self-directed investing
// gives you research tools and over 5,700 stocks and ETFs to choose from"
// (Digital Investor, https://www.navyfederal.org/investment-services/investments.html);
// the product page's "over 5,000 individual stocks and ETFs" is the same
// offer said more loosely, so N = 5,700, stocks and ETFs together (the
// broker gives no split): the 5,700 book lines with the highest 30-day
// average traded value in dollars (../wellstrade/usPopular.mjs) are kept.
//
// Fees: "You only pay a flat $3.50 a month" ($2.50 with Active Duty
// Checking), which "covers up to 2,000 shares traded per month"; above
// that, $0.01 a share is passed through (Client Relationship Summary).
// Other service fees are in the Digital Investor fee schedule PDF.
// Not a removal, a remark: the account is for Navy Federal members only.
//
//   https://www.navyfederal.org/investment-services/investments.html
//   https://www.navyfederal.org/investment-services/investments/digital-investor.html
//   https://www.navyfederal.org/content/dam/nfculibs/pdfs/nffg/digital-investor-crs-form.pdf   (subscription and per-share fee)
//   https://www.navyfederal.org/content/dam/nfculibs/pdfs/nffg/Digital%20Investor%20Fee%20Schedule.pdf   (service fees)
//
//   node brokers/navyfederaldigit/navyfederaldigit_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topN } from "../wellstrade/usPopular.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const INVESTMENTS = "https://www.navyfederal.org/investment-services/investments.html";
const PRODUCT = "https://www.navyfederal.org/investment-services/investments/digital-investor.html";

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(INVESTMENTS, [/You only pay a flat \$3\.50 a month/i, /2,000 commission-free shares every month/i, /over 5,700 stocks and ETFs/i]);
await new Promise((resolve) => setTimeout(resolve, 1000));
await evidence(PRODUCT, [/over 5,000 individual stocks and ETFs/i, /\$3\.50 per month/i]);

// "over 5,700 stocks and ETFs" (investments page): owner rule 2026-10-25, the N most popular.
const TITLES = 5700;
const all = withoutObligations(await usBook());
const top = await topN(all, TITLES);
const chosen = new Set(top);
const rows = stampRows(all.filter((row) => chosen.has(row)));
fs.writeFileSync(new URL("navyfederaldigit-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
const { report } = top;
console.error(`${report.among} lines in the book, ${report.kept} kept (the ${TITLES} most popular); cut-off #${report.cutoff.rank} ${report.cutoff.text}, ${report.cutoff.name}; first left out ${report.firstLeftOut}; kept by size only ${report.keptSizeOnly}, with no data ${report.keptNoData}`);
