// GStocks PH is the stock corner of the GCash app. The broker behind it is
// AB Capital Securities: "GStocks PH is powered by AB Capital Securities,
// Inc." It sells one place, the Philippine Stock Exchange, and prints no
// list of its own. The help centre says GStocks PH "lets users invest in
// stocks listed on the Philippine Stock Exchange", and the dividend page
// says its examples "are part of the 280+ PSE-listed stocks you can buy in
// GStocks PH". The GCash page says "over 280 Philippine-listed companies".
// The PSE lists about 285 companies, so this is the whole board, as at AB
// Capital (../abcapital). The catalogue is every open PSE line, ETFs
// included (they trade on the same board).
//
//   https://help.gcash.com/hc/en-us/articles/47625159654937-What-is-GStocks-PH
//   https://help.gcash.com/hc/en-us/articles/31218842595353-Are-there-dividend-stocks-on-GStocks-PH
//   https://help.gcash.com/hc/en-us/articles/17542731035289-GStocks-PH-fees
//   https://gcash.com/services/gstocks-ph
//
// The help centre pages sit behind Cloudflare; their JSON API answers. The
// two sentences above are checked at each run.
//
// The PSE crawl is shared: ../col/pseBook.mjs reads the PSE Edge company
// directory and each company's stock page, keeps the open lines and drops
// suspended lines, warrants, rights, pre-IPO lines and bonds. TradingView
// supplies the description, the currency and the ETF mark.
//
//   https://edge.pse.com.ph/companyDirectory/search.ax
//   https://edge.pse.com.ph/companyPage/stockData.do
//
//   node brokers/gstocks/gstocks_scraping.mjs

import { writePseCatalogue } from "../col/pseBook.mjs";

const ARTICLE = "https://help.gcash.com/api/v2/help_center/en-us/articles";
const evidence = [
  { id: "47625159654937", pattern: /invest in stocks listed on the Philippine Stock Exchange/i },
  { id: "47625159654937", pattern: /powered by AB Capital Securities/i },
  { id: "31218842595353", pattern: /280\+ PSE-listed stocks you can buy in GStocks PH/i },
];

for (const { id, pattern } of evidence) {
  const response = await fetch(`${ARTICLE}/${id}.json`, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GCash help article ${id} answered ${response.status}`);
  const body = (await response.json())?.article?.body || "";
  const text = body.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  if (!pattern.test(text)) throw new Error(`GCash help article ${id} no longer says ${pattern}`);
}

const kept = await writePseCatalogue(import.meta.url, "gstocks-parsed.json", { mic: "XPHS" });
if (kept.length < 280) throw new Error(`only ${kept.length} lines, GCash says over 280`);
