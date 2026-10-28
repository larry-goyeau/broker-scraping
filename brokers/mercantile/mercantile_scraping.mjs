// What Mercantile Bank (Bank Mercantile Discount, Israel) sells online,
// with no login: every share and exchange-traded fund on the Tel Aviv
// Stock Exchange, and US shares and ETFs, a place for which it publishes
// no list.
//
// Its online capital-market page: "קבלת מידע אודות תיק ניירות הערך
// האישי שלכם ואודות ניירות ערך ישראלים וזרים. ביצוע פעולות בניירות ערך
// בתיקך האישי" (information on Israeli and foreign securities, and
// orders in the personal portfolio), and the Mercantile TRADE platform.
// Part 4 of its tariff (securities) prices TASE shares, bonds and
// index-tracking funds (4.1.1, "כולל ... קרן מחקה"), with a direct-channel
// rate: "עבור קניה ומכירה בערוץ ישיר יגבה מחיר מופחת בשיעור 0.40% לפעולה
// במניות ואגרות חוב בכפוף למינימום של 25 ש"ח", and securities abroad
// (4.4.1, "ניירות ערך בחוץ לארץ- מניות, אגרות חוב וקרנות נאמנות", 0.79%,
// minimum $25), again with a direct-channel rate: "עבור קניה ומכירה
// המבוצעת באמצעות ערוץ ישיר ייגבה מחיר מופחת של 0.59% בכפוף למינימום של
// 23.5 $". The direct channels are "אינטרנט, אפליקציה סלולרית, מערכות
// מתקדמות למסחר בני"ע: מרכנתילטרייד, שלדג, מנת"ה". No page names an
// exchange, board or kind of share or fund it leaves out, and none gives
// a count.
//
// Tel Aviv: the exchange's whole book (../altshuler/taseBook.mjs): its
// shares (ordinary shares, REITs, partnership units, dual-listed and
// foreign shares), its Israeli ETFs (kranot sal) and the foreign UCITS
// ETFs cross-listed there, less suspended lines (eight on 2026-10-23). In
// shekels (prices in agorot), MIC XTAE.
//
// United States (broker-list.json's foreign place; the tariff says
// "abroad" with no country): no exchange is named, so the catalogue keeps
// the country's exchanges, the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt, warrants, rights, units, when-issued
// lines and listed notes (usBook) and bonds (withoutObligations). OTC
// lines are not named and not in the book. One NBBO market: one row per
// title, on its primary listing, in dollars.
//
//   https://www.mercantile.co.il/private/investments-savings/capital-market/online-capital-market-about/
//   https://www.mercantile.co.il/private/investments-savings/capital-market/mercantile-trade/
//   https://market.tase.co.il/en/market_data/securities/data/all
//
// Fees: https://www.mercantile.co.il/private/generalinfo/price-list-fees-tracks/
// (part 4: https://www.mercantile.co.il/media/wa0inth4/taarifon_private_4.xlsx,
// also as PDF).
//
//   node brokers/mercantile/mercantile_scraping.mjs

import fs from "node:fs";
import { inflateRawSync } from "node:zlib";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { taseBook } from "../altshuler/taseBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const TARIFF = "https://www.mercantile.co.il/media/wa0inth4/taarifon_private_4.xlsx";
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

function check(url, text, patterns) {
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "he-IL,he;q=0.9" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = (await response.text())
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");
  check(url, text, patterns);
}

// The shared strings of the tariff workbook, as one text.
async function tariffText() {
  const response = await fetch(TARIFF, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${TARIFF}`);
  const zip = Buffer.from(await response.arrayBuffer());
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error(`${TARIFF} is not a workbook`);
  let offset = zip.readUInt32LE(end + 16);
  for (let index = 0; index < zip.readUInt16LE(end + 10); index += 1) {
    const nameLength = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (name === "xl/sharedStrings.xml") {
      const local = zip.readUInt32LE(offset + 42);
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const stored = zip.subarray(start, start + zip.readUInt32LE(offset + 20));
      const xml = (zip.readUInt16LE(offset + 10) === 0 ? stored : inflateRawSync(stored)).toString("utf8");
      return xml.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
    }
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  throw new Error(`${TARIFF} has no shared strings`);
}

await evidence("https://www.mercantile.co.il/private/investments-savings/capital-market/online-capital-market-about/", [
  /ניירות ערך ישראלים וזרים\. ביצוע פעולות בניירות ערך בתיקך האישי/,
]);
await pause();
check(TARIFF, await tariffText(), [
  /ניירות ערך הנסחרים בבורסה בתל אביב/,
  /מחיר מופחת בשיעור 0\.40% לפעולה במניות ואגרות חוב/,
  /ניירות ערך בחוץ לארץ- מניות, אגרות חוב וקרנות נאמנות/,
  /ערוץ ישיר ייגבה מחיר מופחת של 0\.59%/,
  /ערוצים ישירים : אינטרנט, אפליקציה סלולרית/,
]);

const tase = await taseBook();
const us = await usBook();
const rows = stampRows(withoutObligations([...tase.rows, ...us]));
if (rows.filter((row) => row.mic === "XTAE").length < 800) throw new Error("short TASE part");
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("mercantile-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`mercantile: ${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(
  `TASE ${tase.tradeDate} lists ${JSON.stringify(tase.counts)}, dropped ${tase.dropped.join(", ") || "none"}; ` +
    `US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`
);
