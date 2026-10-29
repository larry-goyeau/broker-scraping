// What Middle East Financial Brokerage Co. (MEFBC, Kuwait; app "MEFBC
// Broker", web "awsatbroker.com") sells in shares, with no login: every
// share of Boursa Kuwait, its one place, and its REIT. The site's services
// page offers "Electronic Trading Service in Boursa Kuwait ... via mobile
// app/web access/desktop app"; the app's store page says it lets users
// "easily trade within Boursa Kuwait". The brokerage agreement's commission
// schedule names the Premier Market, the Main Market and REITs, and no list
// of its own, so the book is the exchange's whole listing, KFH Capital REIT
// included, read by ../kfic/boursaKuwaitBook.mjs (what is kept and left out
// is written there). Boursa Kuwait lists no ETF. The OTC market, which the
// schedule also prices, is not an exchange board and stays out.
//
// Fees: brokerage agreement (PDF dated 30-03-2026), "1 – Regular Market
// Commissions": Premier Market 0.10 % (250 fils if the trade is under
// 250 KD), Main Market 0.15 % (250 fils under 165 KD), REITs 0.10 %; the
// agreement applies the exchange's amended commissions at once (Article
// Thirty). Boursa Kuwait's market-wide 0.15 % schedule of 4 October 2026 is
// read by ../kfic/kfic_cost.mjs.
//
//   https://www.mefbc.com/MEFBC/services/Other-Services
//   https://www.mefbc.com/Frontend/MEFBC/Brokerage%20Agreement%20(Corporate)%2030-03-2026.pdf
//   https://apps.apple.com/tm/app/awsat-broker/id1347805945
//
//   node brokers/mefbc/mefbc_scraping.mjs

import { writeBoursaKuwaitCatalogue } from "../kfic/boursaKuwaitBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const SERVICES = "https://www.mefbc.com/MEFBC/services/Other-Services";
const AGREEMENT = "https://www.mefbc.com/Frontend/MEFBC/Brokerage%20Agreement%20(Corporate)%2030-03-2026.pdf";
const APP = "https://itunes.apple.com/lookup?id=1347805945";

const textOf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(45_000) });
      if (response.ok) return response;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw new Error(last);
}

const services = textOf(await (await get(SERVICES)).text());
if (!/Electronic Trading Service in Boursa Kuwait/.test(services)) throw new Error(`${SERVICES} no longer offers electronic trading on Boursa Kuwait`);
const agreement = Buffer.from(await (await get(AGREEMENT)).arrayBuffer());
if (agreement.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${AGREEMENT} is no longer a PDF`);
const store = (JSON.parse(await (await get(APP)).text())?.results?.[0]?.description || "").replace(/\s+/g, " ");
if (!/trade within Boursa Kuwait/.test(store)) throw new Error("the MEFBC Broker store page no longer says it trades within Boursa Kuwait");

await writeBoursaKuwaitCatalogue(import.meta.url, "mefbc-parsed.json", { reits: true });
