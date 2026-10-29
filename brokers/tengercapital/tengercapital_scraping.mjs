// What Tenger Capital (Тэнгэр Капитал ҮЦК ХХК, Ulaanbaatar) sells in shares
// online, with no login. It is a member broker of the Mongolian Stock
// Exchange; its clients trade "манай онлайн арилжааны платформ, гар утасны
// аппликейшн" (its online platform and app, https://trader.tengercapital.mn/)
// on the MSE order book. The offerings page:
//
//   "Эрхэм та манай онлайн арилжааны платформ, гар утасны аппликейшныг
//    ашиглан ... МХБ болон дэлхийн хөрөнгийн биржүүдийн анхдагч болон
//    хоёрдогч зах зээлийн арилжаанд оролцож ... ✓ Хувьцаа ✓ Компанийн бонд
//    ✓ Засгийн газрын бонд ✓ Хөрөнгөөр баталгаажсан үнэт цаас"
//   https://tengercapital.mn/offerings
//
// Fees: the FAQ on the home page (served in the site's script bundle):
//   "Хувьцаа худалдан авахад ямар комисс авах вэ? ... Дотоодын хувьцаа:
//    **0.5%** (хамгийн багадаа ₮500). Бонд: **0.25%**."
//   https://tengercapital.mn/
//
// So the MSE catalogue is the exchange's whole share book: every listed
// company share and the two exchange-traded funds (ALTT, FTI), in tugriks;
// suspended, delisted and never-traded lines, closed-end funds, bonds and
// asset-backed securities out (../invescore/mseBook.mjs, shared with
// InvesCore Capital and Bulgan Broker).
//
// United States (broker-list.json, "Through the Interactive Brokers
// platform", reliability medium): the offerings page says clients can trade
// "Interactive Brokers платформыг ашиглан 35 улсын 160 гаруй биржийн
// арилжаанд", but the same FAQ restricts foreign markets to VIP clients
// after a meeting with an adviser ("Гадаадын зах зээлд хандах боломжийг VIP
// харилцагчдад үзүүлдэг"; "Хамгийн бага портфел: $25,000. Зөвлөхтэй уулзалт
// хийж ...") and Tenger publishes no commission for foreign trades. With no
// fee and no plain online access, the US place is left out.
//
// Run-time checks: the offerings page must still offer shares on the MSE
// online, and the FAQ bundle must still carry the share commission.
//
//   node brokers/tengercapital/tengercapital_scraping.mjs

import { writeMseCatalogue } from "../invescore/mseBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SITE = "https://tengercapital.mn";

async function text(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

const offerings = (await text(`${SITE}/offerings`)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
if (!offerings.includes("онлайн арилжааны платформ") || !offerings.includes("Хувьцаа")) throw new Error(`${SITE}/offerings no longer offers shares online`);
const home = await text(`${SITE}/`);
let fee = false;
for (const chunk of new Set(home.match(/\/_next\/static\/chunks\/[^"']+\.js/g) || [])) {
  if ((await text(`${SITE}${chunk}`)).includes("Дотоодын хувьцаа: **0.5%**")) {
    fee = true;
    break;
  }
}
if (!fee) throw new Error("the Tenger Capital FAQ no longer gives the 0.5% share commission");

const rows = await writeMseCatalogue({
  broker: "Tenger Capital",
  out: new URL("tengercapital-parsed.json", import.meta.url),
});
for (const ticker of ["APU", "KHAN", "GLMT", "TTL", "MSE"]) {
  if (!rows.some((row) => row.ticker === ticker && /^MN/.test(row.isin))) throw new Error(`${ticker} is missing from the Tenger Capital catalogue`);
}
