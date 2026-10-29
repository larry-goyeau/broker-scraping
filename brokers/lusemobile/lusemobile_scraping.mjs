// What LuSE Mobile sells in shares, with no login. LuSE Mobile is the
// Lusaka Securities Exchange's own trading app (built by Escrow Systems,
// launched with MTN Zambia in October 2021): the client opens a CSD
// account, picks a member broker in the app and places buy and sell orders
// on the LuSE board from the phone. Its App Store text: "Mobile
// Application for trading securities on the Lusaka Stock Exchange." The
// exchange's monthly report of June 2026 counts 49,611 registered app
// users. The app names no list and no exclusion, so the book is the whole
// LuSE equity board (luseBook.mjs): ordinary and preference shares, in
// kwacha, and Real Estate Investments Zambia (REIZ) in US dollars. Lines
// with no trade for 180 days are left out as dormant or suspended. LuSE
// lists no ETF; bonds are not on this board. The broker-list row names the
// same single place. The board is read from AFX; when AFX does not answer,
// from african-markets alone (luseBook.mjs explains the difference: 2026-10-28
// fallback run, 25 lines, with PMDZ and EIZP kept on their quote date and
// FARM missing; the AFX run of the same day gave 24).
//
// Fees: the exchange's equity trading fee page gives each side of a trade
// 1% to the broker, 0.25% to LuSE and 0.125% to the SEC (1.375% a side).
// That page, like the rest of luse.co.zm, sits behind a Cloudflare
// challenge and cannot be read by a script; the App Store text is checked
// instead.
//
//   https://www.luse.co.zm/trading/trading-fees-equity/ (fees)
//   https://apps.apple.com/zm/app/luse-mobile/id1660881679
//   https://itunes.apple.com/lookup?id=1660881679&country=zm
//   https://www.luse.co.zm/wp-content/uploads/2026/07/june_Market-update-2.pdf
//   (LuSE board sources: see luseBook.mjs)
//
//   node brokers/lusemobile/lusemobile_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { luseBook } from "./luseBook.mjs";
import fs from "node:fs";

const APP = "https://itunes.apple.com/lookup?id=1660881679&country=zm";

const app = await (await fetch(APP, { signal: AbortSignal.timeout(30_000) })).json();
const text = app?.results?.[0]?.description || "";
if (!/trading securities on the Lusaka Stock Exchange/i.test(text)) {
  throw new Error("the LuSE Mobile App Store text no longer says it trades securities on the Lusaka Stock Exchange");
}

const book = await luseBook();
const rows = stampRows(withoutObligations(book.rows));
fs.writeFileSync(new URL("lusemobile-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
const usd = rows.filter((row) => row.currency === "USD").length;
console.error(`${rows.length} listings (${rows.length} STOCK, Lusaka ${rows.length}; ${usd} in USD) from ${book.source}, latest session ${book.latest}`);
console.error(`left out: stale ${book.stale.join(", ") || "none"}; no ISIN ${book.noIsin.join(", ") || "none"}`);
if (book.differ.length) console.error(`other ISIN on african-markets (AFX kept): ${book.differ.join("; ")}`);
if (book.onlyOnAfrican.length) console.error(`only on african-markets: ${book.onlyOnAfrican.join("; ")}`);
