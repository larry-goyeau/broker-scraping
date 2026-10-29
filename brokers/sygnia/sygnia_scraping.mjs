// What Sygnia Securities sells in shares and exchange-traded funds, with
// no login. Sygnia Securities is Sygnia's execution-only JSE member broker
// (JSE membership since October 2014, retail clients since 2015). Its
// brochure: "Full access to trade all JSE-listed equities and a wide array
// of derivative products, including equities, ETFs, ETNs, AMCs and
// futures", with "An exclusive online client portal"; its app (Sygnia
// Securities, App Store): "Instant access to 300+ JSE equities, ETFs &
// ETNs" and "Buy and sell with just a few taps". "300+" is a floor, not a
// count, and the brochure says all JSE-listed equities, so the book is the
// whole JSE (../sharenet/jseBook.mjs): ordinary and preference shares,
// local and inward listings, ETFs and actively managed ETFs, ETNs and
// actively managed certificates, in rand. Futures are not shares. Left out
// there: suspended, delisted and never-traded lines, warrants, Krugerrands
// and indices. broker-list.json gives the same single place.
//
// Fees: the Sygnia Securities page prints brokerage of 0.50% excl. VAT,
// minimum R150 a transaction, and 0.10% excl. VAT with no minimum on ETFs;
// a R60 excl. VAT monthly safe-custody fee; securities transfer tax 0.25%
// on share purchases (ETFs exempt). sygnia.co.za answers scripts with an
// Incapsula challenge, so those pages cannot be checked at run time; the
// brochure PDF and the App Store text are checked instead.
//
//   https://www.sygnia.co.za/for-securities/ (fees)
//   https://www.sygnia.co.za/our-fees/
//   https://www.sygnia.co.za/wp-content/uploads/2026/05/Sygnia-Securities-Brochure.pdf
//   https://apps.apple.com/za/app/sygnia-securities/id6742809153
//   https://itunes.apple.com/lookup?id=6742809153&country=za
//   (JSE book sources: see ../sharenet/jseBook.mjs; the first run reads
//   every Sharenet share page, about 25 minutes, then caches 12 hours)
//
//   node brokers/sygnia/sygnia_scraping.mjs

import { pdfSays } from "../alphasec/pdfSays.mjs";
import { writeJseCatalogue } from "../sharenet/jseBook.mjs";

const BROCHURE = "https://www.sygnia.co.za/wp-content/uploads/2026/05/Sygnia-Securities-Brochure.pdf";
const APP = "https://itunes.apple.com/lookup?id=6742809153&country=za";

await pdfSays(BROCHURE, [/Full access to trade all JSE-listed equities/, /ETFs, ETNs, AMCs/, /online client portal/]);
const app = await (await fetch(APP, { signal: AbortSignal.timeout(30_000) })).json();
const text = app?.results?.[0]?.description || "";
if (!/JSE equities, ETFs & ETNs/.test(text) || !/Buy and sell/i.test(text)) throw new Error("the Sygnia Securities App Store text no longer sells JSE equities, ETFs and ETNs");

const rows = await writeJseCatalogue(import.meta.url, "sygnia-parsed.json", { types: ["STOCK", "ETF", "ETN"] });
for (const ticker of ["NPN", "SOL", "AGL", "SYG", "STX40", "GLD"]) {
  if (!rows.some((row) => row.ticker === ticker && row.mic === "XJSE")) throw new Error(`${ticker} is missing from the Sygnia catalogue`);
}
if (rows.length < 500) throw new Error(`only ${rows.length} Sygnia JSE lines`);
