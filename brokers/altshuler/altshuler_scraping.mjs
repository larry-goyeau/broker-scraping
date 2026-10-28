// What Altshuler Shaham Trade (the self-directed trading arm of the
// Altshuler Shaham investment house, Israel) sells, with no login: every
// share and exchange-traded fund on the Tel Aviv Stock Exchange, and US
// shares and ETFs, a place for which it publishes no list.
//
// Its trading page: "ניתן לסחור ממערכת המסחר בבורסות ישראל וארה"ב" (the
// trading system trades on the Israeli and US exchanges); the ALTrade+
// page: "מסחר במניות, אופציות וניירות ערך בישראל ובארה"ב". Its tariff
// prices TASE securities, TASE mutual and exchange-traded funds ("קרנות
// נאמנות וסל הנסחרות בבורסה בת"א") and, abroad, "מסחר במניות ו ETF'S
// בארה"ב". No page names a board, segment or kind of share or fund left
// out on either place, and no page gives a count.
//
// Tel Aviv: the exchange's whole book (./taseBook.mjs): its shares
// (ordinary shares, REITs, partnership units, dual-listed and foreign
// shares), its Israeli ETFs (kranot sal) and the foreign UCITS ETFs
// cross-listed there, less suspended lines (eight on 2026-10-23). In
// shekels (prices in agorot), MIC XTAE.
//
// United States: no exchange is named, so the catalogue keeps the
// country's exchanges, the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt, warrants, rights, units, when-issued
// lines and listed notes (usBook) and bonds (withoutObligations). One NBBO
// market: one row per title, on its primary listing, in dollars.
//
// OTC: the tariff also prices "במניות Pink sheets" and "בעסקאות OTC". Pink
// sheets alone would be the Pink tiers, but OTC trades are priced as well
// and no other tier is named or excluded, so the OTC Markets lines of the four tiers with a public quote, OTCQX,
// OTCQB, OTCID and Pink Limited (../moomoous/otcBook.mjs; owner rule: the
// tiers the broker names, else all of them).
// broker-list.json gives Altshuler the United States and TASE only.
//
//   https://www.as-invest.co.il/trade/
//   https://www.as-invest.co.il/trade/altradeplus/
//   https://market.tase.co.il/en/market_data/securities/data/all
//
// Fees: the full tariff ("ני"ע הנסחרים בבורסה בת"א" 0.15%, minimum 3.5
// shekels; US shares and ETFs "1 סנט למניה, מינימום 9$" or a flat $11 or
// 0.15%) and the new-account offer on the benefits page ("1 סנט למניה
// (מינימום $6)" in the US, "0.07% (מינימום 2.9 ₪)" in Israel):
//   https://www.as-invest.co.il/media/oqdfpafo/תעריפון-מלא-אלטשולר-שחם-טרייד.pdf
//   https://www.as-invest.co.il/trade/trading_benefits/
//
//   node brokers/altshuler/altshuler_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { otcBook } from "../moomoous/otcBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { taseBook } from "./taseBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

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
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://www.as-invest.co.il/trade/", [/ניתן לסחור ממערכת המסחר בבורסות ישראל וארה"ב/]);
await pause();
await evidence("https://www.as-invest.co.il/trade/trading_benefits/", [/1 סנט למניה \(מינימום \$6\)/, /0\.07% \(מינימום 2\.9 ₪\)/]);

const tase = await taseBook();
const us = await usBook();
const otc = await otcBook(us);
const rows = stampRows(withoutObligations([...tase.rows, ...us, ...otc.rows]));
if (rows.filter((row) => row.mic === "XTAE").length < 800) throw new Error("short TASE part");
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("altshuler-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`altshuler: ${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(
  `TASE ${tase.tradeDate} lists ${JSON.stringify(tase.counts)}, dropped ${tase.dropped.join(", ") || "none"}; ` +
    `US directories ${JSON.stringify(us.report.directories)}; halts: ${us.report.halts.join(", ")}`
);
console.error(otc.summary);
