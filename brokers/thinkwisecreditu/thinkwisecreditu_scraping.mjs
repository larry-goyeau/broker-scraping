// What Thinkwise Credit Union sells, with no login. Its Digital Investing
// is InvestiFi's self-directed portal inside online and mobile banking
// (broker InvestiFi Securities LLC, clearing RQD Clearing LLC): "Crypto,
// stocks & ETFs — inside your credit union login", "Buy, sell & hold
// stocks and ETFs", "Invest any amount with fractional shares". The page
// names no list of securities and no segment, board or kind of share it
// does not take; the list sits inside the portal, behind online banking.
// So the catalogue is the whole US exchange book of the day, as for the
// other InvestiFi credit unions (../bluestonefederal, ../elementfederalcr):
// ../wellstrade/usBook.mjs gives shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt.
//
//   https://www.thinkwisecu.org/invest
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). Crypto is not here. OTC Markets lines are not
// added: the page never names them.
// Not a removal, a remark: "Only eligible members over the age of 18 and
// in good standing with Thinkwise Credit Union can buy/sell/hold
// securities", "Individual membership designation types only. Business
// accounts are not eligible", minimum purchase $1.00.
//
// The US is one NBBO market: one row per title, on its primary listing, in
// dollars.
//
// Fees ("Self Directed Commissions $0"; "The cost to trade securities is
// free"), same page:
//   https://www.thinkwisecu.org/invest
//
//   node brokers/thinkwisecreditu/thinkwisecreditu_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const PAGE = "https://www.thinkwisecu.org/invest";

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence(PAGE, [
  /The cost to trade securities is free/i,
  /Self Directed Commissions \$0/i,
  /Buy, sell & hold stocks and ETFs/i,
  /InvestiFi/,
]);

const rows = await usBook();
const kept = stampRows(withoutObligations(rows));
if (kept.length < 10000) throw new Error(`only ${kept.length} rows`);
fs.writeFileSync(new URL("thinkwisecreditu-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${kept.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(rows.report.directories)}; halts: ${rows.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(rows.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
