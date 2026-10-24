// What Al Wathbah Shares & Bonds Center (WSBC, Abu Dhabi) sells, with no
// login: every share and ETF of the Abu Dhabi Securities Exchange and the
// Dubai Financial Market, its two places. Its brokerage page says it
// "provides clients with a full range of leading brokerage services for
// equities listed on ADX and DFM", its online-trading page offers
// "Immediate access to ADX and DFM markets", and its FAQ asks only for "An
// Investor Number (NIN) has issued by related markets ADX &/Or DFM". No
// page names a list of its own or excludes a board, so the book is both
// exchanges' own listings, read by ./uaeBook.mjs (what is kept and left out
// is written there). ETFs are kept: a whole-exchange broker sells them in
// the same book. Nasdaq Dubai is left out: DFM's broker directory gives
// WSBC no Nasdaq membership ("NASDAQMembership": false). Everything trades
// in dirhams.
//
// The site: www.alwathbah.ae itself answers only over plain HTTP, with a
// 301 to stage.alwathbah.ae (its HTTPS fails the TLS handshake). The
// "stage" host is therefore the broker's public site, sent there by its own
// domain; DFM's broker directory lists WSBC as "Active", with e-trading,
// and that same domain as its eTradeURL. The run checks the redirect and
// the directory before writing. The stage pages carry placeholder market
// data (an NBAD ticker, a 4-month free-brokerage promotion), so the tariff
// below may be an old one kept on a rebuilt site.
//
// Fees: FAQ, "Fees & Commissions": "Broker's commission 0.125% Minimum AED
// 30", then market 0.05% (min AED 20), CDS 0.05% (min AED 10) and SCA
// 0.05% (min AED 5).
//
//   http://www.alwathbah.ae/                      (301 to stage.alwathbah.ae)
//   https://stage.alwathbah.ae/services/brokerage-services
//   https://stage.alwathbah.ae/services/online-trading
//   https://stage.alwathbah.ae/faqs
//   https://api2.dfm.ae/web/sf/v1/brokers?$filter=MarketMaker%20eq%20false&$orderby=BrokerName&sf_culture=en
//
//   node brokers/alwathbah/alwathbah_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { adxListings, dfmListings } from "./uaeBook.mjs";
import fs from "node:fs";

const SITE = "https://stage.alwathbah.ae";
const HOME = "http://www.alwathbah.ae/";
const DFM_BROKERS = "https://api2.dfm.ae/web/sf/v1/brokers?$filter=MarketMaker%20eq%20false&$orderby=BrokerName&sf_culture=en";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = [
  { url: `${SITE}/services/brokerage-services`, pattern: /brokerage services for equities listed on ADX and DFM/ },
  { url: `${SITE}/services/online-trading`, pattern: /Immediate access to ADX and DFM markets/ },
  { url: `${SITE}/faqs`, pattern: /Investor Number \(NIN\) has issued by related markets ADX &\/Or DFM/ },
  { url: `${SITE}/faqs`, pattern: /Broker's commission 0\.125% Minimum AED 30/ },
];
const FLOOR = { "DFM STOCK": 55, "ADX STOCK": 80, "ADX ETF": 10 };

const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ");

async function fetchOnce(url, init = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000), ...init });
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(last);
}

async function checkPages() {
  const home = await fetchOnce(HOME, { redirect: "manual" });
  const target = home.headers.get("location") || "";
  if (!/^https?:\/\/stage\.alwathbah\.ae\/?$/.test(target)) {
    throw new Error(`${HOME} answers ${home.status} to "${target}", not stage.alwathbah.ae`);
  }
  const pages = new Map();
  for (const { url, pattern } of EVIDENCE) {
    if (!pages.has(url)) {
      const response = await fetchOnce(url);
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      pages.set(url, textOf(await response.text()));
    }
    if (!pattern.test(pages.get(url))) throw new Error(`${url} no longer says ${pattern}`);
  }
  const directory = await (await fetchOnce(DFM_BROKERS, { headers: { "User-Agent": UA, Referer: "https://www.dfm.ae/" } })).json();
  const wsbc = (directory?.value || []).find((broker) => broker.BrokerID === "WSBC");
  if (!wsbc || wsbc.BrokerStatus !== "Active" || !wsbc.eTrade) {
    throw new Error(`DFM's broker directory no longer lists WSBC as an active e-trading broker`);
  }
  if (wsbc.NASDAQMembership) throw new Error("WSBC is now a Nasdaq Dubai member: add that market");
}

await checkPages();
const [dfm, adx] = await Promise.all([dfmListings(), adxListings()]);
const rows = [...adx.rows, ...dfm.rows];
const kept = stampRows(withoutObligations(rows));

const count = {};
for (const row of kept) count[`${row.exchange} ${row.type}`] = (count[`${row.exchange} ${row.type}`] || 0) + 1;
for (const [key, floor] of Object.entries(FLOOR)) {
  if ((count[key] || 0) < floor) throw new Error(`only ${count[key] || 0} ${key} rows`);
}
fs.writeFileSync(new URL("alwathbah-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const skipped = (leftOut) => Object.entries(leftOut).map(([label, value]) => `${value} ${label}`).join(", ");
console.error(
  `alwathbah: ${kept.length} rows; ` +
    Object.entries(count).map(([key, value]) => `${key} ${value}`).join(", ") +
    `. Left out: ADX ${skipped(adx.leftOut)}; DFM ${skipped(dfm.leftOut)}.`
);
