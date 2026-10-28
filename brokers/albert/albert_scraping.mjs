// What Albert (Albert Securities, LLC; clearing Apex) sells in shares and
// exchange-traded products, with no login. The investing page says "Choose
// from thousands of stocks and ETFs to invest and trade" and "Invest as
// much as you want, or as little as $1, in any stock or ETF". The fee
// article says commission-free trading covers accounts "that trade U.S.
// exchange listed securities (including ETFs) via the Albert app", and the
// ETF disclosure also covers leveraged and inverse products and ETNs. No
// page names a board, a segment or a kind of listed share or fund left
// out, so the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt. The app's list itself is not public.
//
//   https://albert.com/about/investing
//   https://help.albert.com/hc/en-us/articles/16988195034135   (How does Investing work?)
//   https://help.albert.com/hc/en-us/articles/16795159503895   (ETF Disclosure)
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: the fee article
// speaks of "U.S. exchange listed securities". The US is one NBBO market:
// one row per title, on its primary listing, in dollars.
//
// Remarks, not removals (they depend on the client): "Albert Investing is
// offered to subscribers on select Albert plans" (plans "range from
// $19.99/mo to $39.99/mo", investing page); market orders only ("Albert
// Securities does not currently allow limit, stop, and other types of
// orders", order handling disclosure).
//
// Fees ("US Listed Equity Securities and ETFs - $0", "FINRA & SEC
// Regulatory Fees - $0", "ACATS, Outgoing - $75.00"):
//   https://help.albert.com/hc/en-us/articles/16795407078423   (Commissions and Fees)
// The help centre pages sit behind a bot wall; the Zendesk API does not,
// so the articles are read through it below.
//
//   node brokers/albert/albert_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PAGE = "https://albert.com/about/investing";
const article = (id) => `https://help.albert.com/api/v2/help_center/en-us/articles/${id}.json`;
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns, json) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  let text = await response.text();
  if (json) text = JSON.parse(text).article.body;
  text = text.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [/Choose from thousands of stocks and ETFs/i, /in any stock or ETF/i]);
await pause();
await evidence(article(16795407078423), [
  /US Listed Equity Securities and ETFs - \$0/i,
  /trade U\.S\. exchange listed securities \(including ETFs\)/i,
], true);
await pause();
await evidence(article(16988195034135), [/offered to subscribers on select Albert plans/i, /thousands of stocks and ETFs/i], true);
await pause();
await evidence(article(16795159503895), [/Exchange Traded Notes/i], true);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("albert-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
