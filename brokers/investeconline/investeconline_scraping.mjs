// What Investec Online (Investec Wealth & Investment "W&I Online", the
// execution-only online stockbroking account of Investec South Africa)
// sells in shares and exchange-traded funds, with no login. Its fact sheet
// lists "Online trading of local shares, Exchange Traded Funds (ETF) and
// Contracts for Difference (CFD)", with orders on the JSE ("when your
// trades are executed on the JSE"); offshore holdings are only viewed, not
// traded online, and CFDs are not shares. broker-list.json gives the same
// single place, the Johannesburg Stock Exchange. No page names a list or
// leaves out a board or a kind of fund, so the book is the whole JSE
// (../sharenet/jseBook.mjs): ordinary and preference shares, local and
// inward listings, ETFs and actively managed ETFs, and the ETNs and
// actively managed certificates that trade on the same order book, in
// rand; suspended, delisted and never-traded lines, warrants, Krugerrands
// and indices are left out there.
//
// Fees, same fact sheet, online trading column: brokerage "On the first
// R100 000 0.70%", "On the next R500 000 0.60%", "On the next R10 000 000
// 0.50%", "Thereafter 0.40%", "Minimum transaction fee R120",
// administrative fee R1 500 a year, minimum account value R1 000 000
// (Private Bank account holders: 0.50% flat, R100 minimum, no minimum
// account). The product page (online-stockbroking.html) sits behind a
// Cloudflare challenge; the fact sheet PDF answers and is checked here.
//
//   https://www.investec.com/en_za/investment/self-managed-investing/online-stockbroking.html
//   https://www.investec.com/content/dam/south-africa/myself/private-banking/factsheets/online_share_trading_factsheet.pdf (fees)
//   (JSE book sources: see ../sharenet/jseBook.mjs; the first run reads
//   every Sharenet share page, about 25 minutes, then caches 12 hours)
//
//   node brokers/investeconline/investeconline_scraping.mjs

import { pdfSays } from "../alphasec/pdfSays.mjs";
import { writeJseCatalogue } from "../sharenet/jseBook.mjs";

const FACTSHEET = "https://www.investec.com/content/dam/south-africa/myself/private-banking/factsheets/online_share_trading_factsheet.pdf";

await pdfSays(FACTSHEET, [/Online trading of local\s*shares, ETF/, /executed\s*on\s*the JSE/, /On the first R100 000\s*0\.70%/, /Minimum transaction\s*fee\s*R120/]);

const rows = await writeJseCatalogue(import.meta.url, "investeconline-parsed.json", { types: ["STOCK", "ETF", "ETN"] });
for (const ticker of ["NPN", "SOL", "AGL", "INL", "STX40", "GLD"]) {
  if (!rows.some((row) => row.ticker === ticker && row.mic === "XJSE")) throw new Error(`${ticker} is missing from the Investec Online catalogue`);
}
if (rows.length < 500) throw new Error(`only ${rows.length} Investec Online JSE lines`);
