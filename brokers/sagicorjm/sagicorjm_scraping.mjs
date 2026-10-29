// What Sagicor Investments Jamaica Limited (member dealer of the Jamaica
// Stock Exchange) sells online in shares and ETFs, with no login. Its
// "JSE Online Trading" page sells self-directed trading on the JSE's
// JTrader Pro platform, and its securities-trading page offers "the
// flexibility to trade securities online with the Jamaica Stock Exchange";
// the JSE's JTrader Pro FAQ lists "Sagicor Investment Limited" among the
// participating brokers. Sagicor publishes no list and names no market or
// security type it leaves out; it sells its own two JSE-listed index funds
// as "JSE Exchange Traded Fund".
//
//   https://www.sagicor.com/en-jm/personal-solution/investment/jse-online-trading
//   https://www.sagicor.com/en-jm/personal-solution/investment/securites-trading
//   https://jtraderpro.jamstockex.com/Content/Files/Online%20Trading%20FAQs%20-%2013102026.pdf
//
// So the catalogue is the JSE's equity markets, read by
// ../jmmb/jamaicaBook.mjs: the Main Market and the Junior Market in JMD and
// the USD Market (ordinary and preference shares; SELECTF and SELECTMD typed
// ETF), less lines off the day's board and suspended lines; bond markets
// are not read. A company quoted in JMD and USD has one row per currency.
//
// Fees: Sagicor's fee guide prices "Jamaican Stocks – Online 0.5% of Trade
// + JSE Fees" (JSE cess 0.30%, JCSD trade fee 0.03%), and its client
// advisory says it "reduced its online trading fee to 0.5 per cent for
// clients having an online trading account with the Jamaica Stock Exchange
// (JSE) trading platform (Jtraderpro)":
//   https://www.sagicor.com/-/media/jamaica-pdfs/20sij619-sijl-fee-guide-april-1-2020-digital.pdf
//   https://www.sagicor.com/en-JM/Sagicor%20Investments%20COVID%2019%20Updates
// sagicor.com answers 403 to scripts (Akamai), so the run checks only the
// JSE's FAQ, which names Sagicor as a JTrader Pro broker.
//
//   node brokers/sagicorjm/sagicorjm_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { jamaicaBook } from "../jmmb/jamaicaBook.mjs";

const FAQ = "https://jtraderpro.jamstockex.com/Content/Files/Online%20Trading%20FAQs%20-%2013102026.pdf";
const faq = await fetch(FAQ, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" } });
if (!faq.ok) throw new Error(`${FAQ}: ${faq.status}`);
if (!Buffer.from(await faq.arrayBuffer()).subarray(0, 5).toString().startsWith("%PDF")) throw new Error(`${FAQ} is no longer a PDF`);

const rows = await jamaicaBook();
const written = stampRows(withoutObligations(rows));
if (written.length < 100) throw new Error(`only ${written.length} JSE rows`);
fs.writeFileSync(new URL("sagicorjm-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
console.error(`Sagicor Investments Jamaica: ${written.length} JSE rows`);
