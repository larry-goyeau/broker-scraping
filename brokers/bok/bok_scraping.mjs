// What BOK Financial (BOK Financial Securities, Inc., trading as BOK
// Financial Advisors, BOKFA; clearing and the NetXInvestor online platform
// by Pershing LLC) sells in shares and exchange-traded products, with no
// login. Its Form CRS says "We offer mutual funds, exchange traded funds
// (ETFs), equities, options, fixed income securities, certificates of
// deposit (CDs), structured notes, variable annuities, and select
// alternative investments"; the Premier Checking page offers online equity
// trades "entered on-line through NetXInvestor". No page names a board, a
// segment or a kind of listed share or fund left out, and no list of
// titles is published, so the catalogue is the whole US exchange book of
// the day (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership
// units, preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt.
//
//   https://www.bokfinancial.com/personal/products-and-services/personal-banking/checking-accounts/premier-checking
//   https://edge.sitecorecloud.io/bokfna15473-bokf40a9-prode209-f913/media/Files/PDF/Securities/BOK-Financial-Securities-Inc-Form.pdf
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: the flat rate is
// for "stocks, excluding penny stocks", and no page offers OTC trading.
// The US is one NBBO market: one row per title, on its primary listing, in
// dollars.
//
// Fees: the only published trading rate is the Premier Checking one,
// "$14.95 per equity trade when your BOK Financial Advisors (BOKFA)
// investment account is linked to your Premier, Diamond, Diamond Advantage
// or Private Label Checking account and the trade is entered on-line
// through NetXInvestor" ("Unlimited $14.95 trades ... excluding penny
// stocks"). Without that link "the current applicable commission rate"
// applies, which is not published ("consult your BOKFA financial
// advisor"). A remark, not a removal: the rate needs the linked checking
// account.
//   https://www.bokfinancial.com/personal/products-and-services/personal-banking/checking-accounts/premier-checking
//
//   node brokers/bok/bok_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  let text = await response.text();
  text = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://www.bokfinancial.com/personal/products-and-services/personal-banking/checking-accounts/premier-checking", [
  /\$14\.95 per equity trade when your BOK Financial Advisors \(BOKFA\) investment account is linked/i,
  /entered on-line through NetXInvestor/i,
  /trading of stocks, excluding penny stocks/i,
]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("bok-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (rows.length < book.length) console.error(`${book.length - rows.length} bonds left out`);
