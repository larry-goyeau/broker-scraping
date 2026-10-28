// What Sharenet Securities (South Africa) sells on the JSE, with no login.
// Sharenet Securities is a JSE member broker: its "Trade JSE" accounts
// (Online Trader, Classic Trader) buy and sell any line on the JSE order
// book, and the site sells it as the way to "Transfer your JSE-based share
// portfolio to Sharenet Securities". broker-list.json gives one place,
// Johannesburg Stock Exchange, with no restriction, and no page of the
// broker leaves out a board, a segment, ETFs or ETNs. So the catalogue is
// the whole JSE (Main Board and AltX, one venue XJSE, in rand): shares
// (local and inward listings, preference shares), ETFs and actively
// managed ETFs, ETNs and actively managed certificates.
//
// What is left out, all in the shared book ./jseBook.mjs: suspended lines
// (Sharenet's own share page shows "This share has been suspended"),
// delisted lines (no Sharenet share page), lines that never traded,
// warrants, Krugerrands, "Investment Products", "Other Securities" and
// indices; obligation.mjs takes out any bond left.
//
// Client-dependent, kept as a remark and not a removal: the Online Trader
// package says "Excl. Trusts and Companies" and asks a "Min account size
// R 50 000" (Classic Trader R 200 000).
//
// Not covered here: the "Trade International" page offers "shares, ETFs
// and Exchange Traded Commodities" on "nearly 30 international exchanges"
// through a separate platform and tariff ("starting at only 0.5%
// commission"); broker-list.json gives Sharenet the JSE only.
//
//   https://www.sharenet.co.za/securities/costs.php        (fees: "30 basis points (0.3%) or R100 minimum", "monthly administration fee of R96")
//   https://www.sharenet.co.za/securities/trade-jse.php    (packages: Online Trader 0.3%, Classic Trader 0.5%)
//   https://www.sharenet.co.za/securities/trade-international.php
//   https://www.sharenet.co.za/v3/quickshare.php?scode=NPN (share page: sector, suspension banner)
//
// The first run reads every Sharenet share page (about 25 minutes); the
// book is cached 12 hours in the system temp folder.
//
//   node brokers/sharenet/sharenet_scraping.mjs

import { writeJseCatalogue } from "./jseBook.mjs";

const rows = await writeJseCatalogue(import.meta.url, "sharenet-parsed.json", { types: ["STOCK", "ETF", "ETN"] });
// The book must keep the big names of each kind; a broken read fails here.
for (const ticker of ["NPN", "SOL", "AGL", "SBKP", "STX40", "GLD"]) {
  if (!rows.some((row) => row.ticker === ticker && row.mic === "XJSE")) throw new Error(`${ticker} is missing from the Sharenet catalogue`);
}
if (rows.length < 500) throw new Error(`only ${rows.length} Sharenet JSE lines`);
