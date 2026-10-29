// Leo Invest (Leobank, Baku; brokerage by "Unicapital İnvestisiya Şirkəti"
// ASC) sells shares in the Leobank app. Its investments page:
//
//   "1000-dən çox alət: S&P 500 şirkətlərinin — Tesla, Apple, Amazon,
//    Google, Microsoft — səhmləri, Bakı Fond Birjasında Azərbaycan
//    şirkətlərinin səhmləri və Bitcoin, Ethereum, Ripple kriptovalyutaları"
//   "Nə qədər və hansı səhmləri ala bilərəm? ... Hazırda S&P 500 siyahısından
//    səhmlərimiz var – bu siyahıdan istədiyinizi ala bilərsiniz."
//   Fees: "Şirkət səhmlərinin və ya indekslərin alqı-satqısı üzrə komissiya
//   haqqı Qiyməti 10 USD və daha çox olan aktivlər üçün — əməliyyat
//   məbləğinin 0,25%-i (minimum 1 USD)"; "Azərbaycan şirkətlərinin
//   səhmlərinin alışı/satışı (Bakı Fond Birjası) 0,25% (minimum 1 ₼)".
//   https://leobank.az/az/investments
//
// So the catalogue is:
//   - United States: the members of the S&P 500 (a closed list: "S&P 500
//     siyahısından"), read from the daily holdings of the SPDR S&P 500 ETF
//     Trust (SPY), which holds every index member:
//       https://www.ssga.com/us/en/intermediary/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx
//     Each ticker is matched to its line of the US book of the day
//     (../wellstrade/usBook.mjs: one row per title, primary listing, USD).
//     The "indices" Leobank also sells are not named and are left out;
//     crypto is not a share.
//   - Baku Stock Exchange: with no list, every BSE share that trades
//     (../xalq/bakuBook.mjs: suspended and delisted lines out), in manats.
//     A Market Watch line whose issuer page shows no card for its ISIN is
//     left out and logged (option missingCard: "skip"; in October 2026
//     Bank Respublika, AZ1004002882 on the Market Watch, AZ1003002883 on
//     its card).
//
// Restriction in broker-list.json, United States: "S&P 500 stocks and
// selected index products only" (the page says the same; the index
// products are not listed and stay out).
//
// Run-time checks: the investments page must still carry the lines above.
//
//   node brokers/leoinvest/leoinvest_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bakuBook } from "../xalq/bakuBook.mjs";
import { xlsxRows } from "../jtrust/jp_listings.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://leobank.az/az/investments";
const SPY = "https://www.ssga.com/us/en/intermediary/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx";

async function get(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response;
}

const page = (await (await get(PAGE)).text()).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
for (const phrase of ["Hazırda S&P 500 siyahısından səhmlərimiz var", "Bakı Fond Birjasında Azərbaycan şirkətlərinin səhmləri", "(Bakı Fond Birjası) 0,25%"]) {
  if (!page.includes(phrase)) throw new Error(`${PAGE} no longer says: ${phrase}`);
}

// S&P 500 members from the SPY holdings file.
const sheet = xlsxRows(Buffer.from(await (await get(SPY)).arrayBuffer()), "SPY holdings");
const header = sheet.findIndex((cells) => cells[0] === "Name" && cells[1] === "Ticker");
if (header < 0) throw new Error("SPY holdings: no header line");
const asOf = String(sheet.find((cells) => cells[0] === "Holdings:")?.[1] || "");
const members = sheet
  .slice(header + 1)
  .filter((cells) => cells[1] && cells[1] !== "-" && cells[7] === "USD" && /^[A-Z]{1,5}([.\-][A-Z])?$/.test(cells[1]))
  .map((cells) => ({ ticker: cells[1].replace("-", "."), name: cells[0] }));
if (members.length < 495 || members.length > 510) throw new Error(`SPY holdings: ${members.length} members`);

const us = await usBook();
const byTicker = new Map(us.map((row) => [row.ticker, row]));
const usRows = [];
const unmatched = [];
for (const member of members) {
  const row = byTicker.get(member.ticker);
  if (!row) {
    unmatched.push(member.ticker);
    continue;
  }
  usRows.push({ ...row, raw: `${row.raw} | S&P 500 member (SPY holdings ${asOf})` });
}
if (unmatched.length > 5) throw new Error(`S&P 500 members missing from the US book: ${unmatched.join(" ")}`);

const baku = await bakuBook({ missingCard: "skip" });
for (const [isin, label] of [["AZ1012006628", "Pasha Bank"], ["AZ1004004581", "ABB"]]) {
  if (!baku.some((row) => row.isin === isin)) throw new Error(`${label} ${isin} is missing from the BSE book`);
}

const rows = [...usRows, ...baku];
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("leoinvest-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`${written.length} rows: ${usRows.length} S&P 500 members (${asOf}; not in the US book: ${unmatched.join(" ") || "none"}), ${baku.length} BSE shares`);
