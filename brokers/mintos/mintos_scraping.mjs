// What Mintos (AS Mintos Marketplace, Latvia) sells in shares, ETFs and
// crypto ETPs, with no login. Every order goes to one place, Tradegate BSX
// (XGAT), in EUR, through Upvest:
//   - Order Execution Policy, Appendix A: "Tradegate BSX (for crypto ETPs,
//     ETFs, and stocks (equity securities))" and "Upvest Securities GmbH
//     (third-party broker for Tradegate execution)"
//     https://assets.mintos.com/72565AA7-59A5-52F1-D3D1-F109B29EB23B.pdf
//   - "Orders are executed via Tradegate Exchange" (stocks, ETFs and crypto
//     ETPs alike)
//     https://help.mintos.com/hc/en-us/articles/51748957200657
//     https://help.mintos.com/hc/en-us/articles/48875726457361
//     https://help.mintos.com/hc/en-us/articles/44051133337489
//   - "Global stocks are offered natively in EUR on the Mintos platform"
//     https://www.mintos.com/en/investing-in-stocks/
//
// So the book is Tradegate's own share and ETP lists, read by the shared
// module brokers/tradegatedirect/tradegateBook.mjs (suspended and
// delisting lines already removed), minus what Mintos's pages exclude:
//   - ETFs: "All ETFs available on Mintos are UCITS-compliant" and "Every
//     ETF is UCITS compliant"
//       https://help.mintos.com/hc/en-us/articles/48872787340817
//       https://help.mintos.com/hc/en-us/articles/48969813274385
//     An ETF whose ISIN is not from an EEA country (US, Canadian and Swiss
//     ETFs and trusts on Tradegate's ETP list) is left out.
//   - ETNs and ETCs: the execution policy names only "crypto ETPs, ETFs,
//     and stocks", so gold, silver, commodity, leveraged and option-income
//     notes are left out. A crypto ETP stays when the selection rule allows
//     it: "ETPs must be 100% backed by actual cryptocurrency held in secure
//     custody" (https://www.mintos.com/en/investing-in-crypto/). The
//     unsecured XBT Provider trackers (Bitcoin/Ether Tracker One and Euro)
//     the futures-based ProShares Bitcoin ETF, and the two notes that hold
//     gold beside bitcoin (Bitwise Diaman Bitcoin & Gold, DDA Bitcoin
//     Macro) are therefore left out.
//     A crypto ETP is told by its issuer (21Shares, CoinShares, Bitwise /
//     ETC Issuance, Valour, Virtune, DDA, nxtAssets, Global X Digital
//     Assets, Sygnum, Xtrackers Galaxy) or by a crypto word in its name;
//     21Shares' FalconX "Anthropic" note tracks a private company, not a
//     crypto asset, and is left out.
//   - Shares: "stocks (equity securities)". The three closed-end funds and
//     trusts on Tradegate's ETP list that Deutsche Börse types as shares
//     (Aberdeen India Fund, Japan Smaller Capitalization Fund, Sprott
//     Physical Silver Trust) are funds, neither a company share nor a UCITS
//     ETF, and are left out.
//
// How many (owner rule 2026-10-25: the N most popular). Mintos gives the
// size of its offer, and all of it is on this one place (Tradegate):
//   https://www.mintos.com/en/investing-in-stocks/
//     "More than 4 000 stocks The most traded US and global names ..."
//   https://www.mintos.com/en/investing-in-etfs/
//     "Over 1 000 ETFs Popular ETFs among European investors"
// So N = 4,000 shares and N = 1,000 ETFs ("more than"/"over" is a floor).
// The list itself is only inside the logged-in account ("browse the full
// selection ... in the Stocks section of your Mintos account") and
// robots.txt disallows /webapp/api/, so the 4,000 shares and the 1,000
// UCITS ETFs kept are the most traded ones on Tradegate. Crypto ETPs (ETN /
// ETC) have no number on Mintos's pages: all of them stay.
// Ranking: Tradegate's own traded value. Its price lists (the same pages
// tradegateBook() reads, one per initial)
//   https://www.tradegatebsx.com/indizes.php?art=aktien&buchstabe=A
//   https://www.tradegatebsx.com/indizes.php?art=etp&buchstabe=A
// give, per line, "Stück" (units traded in the session the list shows: the
// current one while Tradegate trades, else the last) and "ausgef. Orders"
// (executed orders), beside bid and ask. Traded value = Stück × mid price
// (bid+ask)/2, in euro. Ties (lines with no trade): more executed orders
// first, then the narrower relative bid/ask spread, then the ISIN. Tradegate
// publishes no longer per-line history (its monthly "Umsatzstatistik" gives
// only totals per asset class), so the ranking is one session. On 25
// October 2026 (list of Friday 23 October) 4,545 of the 6,447 shares and
// 2,539 of the 3,488 UCITS ETFs had traded.
//
// Kept, with remarks rather than removals:
//   - An older help article on how Mintos picks ETFs asks that "The ETF must
//     be accumulating" (https://help.mintos.com/hc/en-us/articles/20875485660689).
//     It predates the 1,000+ ETF selection and Tradegate's lists do not give
//     the distribution policy, so it is not applied.
//
// Fees: https://www.mintos.com/en/how-it-works/fees/ — "Free for ETFs,
// stocks"; crypto ETP "0.49% per transaction, minimum €0.99".
//
//   node brokers/mintos/mintos_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { tradegateBook } from "../tradegatedirect/tradegateBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("mintos-parsed.json", import.meta.url);

// EEA domiciles: a UCITS ETF on Tradegate is from one of these.
const EEA = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IS",
  "IT", "LI", "LT", "LU", "LV", "MT", "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK",
]);
const CRYPTO_ISSUER = /^(?:1?Valour|21Shares|CoinShares|Bitwise|ETC Issuance GmbH|Virtune|DDA|nxtAssets|Global X Digital Assets|Sygnum|Xtrackers Galaxy)\b/i;
const CRYPTO_WORD = /bitcoin|ethereum|\bether\b|crypto|solana|\bxrp\b|ripple|cardano|polkadot|avalanche|litecoin|chainlink|polygon|\btron\b|\bsui\b|aptos|dogecoin|stellar|cosmos|uniswap|tezos|algorand|\bnear\b|\bbnb\b|binance|hedera|celestia|hyperliquid|\bMVHy|toncoin|\bpyth\b|\baave\b|\bondo\b|internet computer|coindesk|stablecoin|smart contract|digital asset/i;
const NOT_CRYPTO = /anthropic|openai|spacex/i;
const UNBACKED = /tracker (?:one|euro)\b|xbt provider|proshares|bitcoin & gold|bitcoin macro/i;

function isCryptoEtp(name) {
  return (CRYPTO_ISSUER.test(name) || CRYPTO_WORD.test(name)) && !NOT_CRYPTO.test(name);
}

// ---- popularity: Tradegate's own traded value per line ----------------------------
const TOP = { STOCK: 4000, ETF: 1000 };
const TG = "https://www.tradegatebsx.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const INITIALS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// "2 972,00", "4&nbsp;537", "./." -> number or null
function tgNumber(text) {
  const s = String(text || "").replace(/&nbsp;|&#160;|\s/g, "").replace(/\./g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

async function tgPage(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      if (!html.includes('id="kursliste_abc"')) throw new Error("incomplete page");
      return html;
    } catch (error) {
      if (attempt >= 4) throw new Error(`${url}: ${error.message}`);
      await sleep(3000 * attempt);
    }
  }
}

// ISIN -> { value (EUR), orders, spread } from Tradegate's share and ETP lists.
async function tradegateActivity() {
  const out = new Map();
  for (const art of ["aktien", "etp"]) {
    for (const initial of INITIALS) {
      const html = await tgPage(`${TG}/indizes.php?art=${art}&buchstabe=${initial}`);
      const body = html.split('id="kursliste_abc"')[1].split("</tbody>")[0];
      for (const tr of body.split("<tr").slice(1)) {
        const isin = tr.match(/orderbuch\.php\?isin=([A-Z0-9]{12})"/)?.[1];
        if (!isin || out.has(isin)) continue;
        const cell = (id) => tgNumber((tr.match(new RegExp(`id="${id}_\\d+"[^>]*>([^<]*)<`)) || [])[1]);
        const bid = cell("bid");
        const ask = cell("ask");
        const units = cell("sum") || 0;
        const mid = bid && ask ? (bid + ask) / 2 : bid || ask || 0;
        out.set(isin, { value: units * mid, orders: cell("count") || 0, spread: bid && ask ? (ask - bid) / mid : Infinity });
      }
      await sleep(400);
    }
  }
  if (out.size < 8500) throw new Error(`Tradegate price lists: only ${out.size} lines`);
  return out;
}

const NONE = { value: 0, orders: 0, spread: Infinity };
function byPopularity(activity) {
  return (a, b) => {
    const x = activity.get(a.isin) || NONE;
    const y = activity.get(b.isin) || NONE;
    return y.value - x.value || y.orders - x.orders || x.spread - y.spread || a.isin.localeCompare(b.isin);
  };
}

const book = await tradegateBook({ log: (line) => console.error(line) });
const left = { nonUcitsEtf: 0, nonCryptoEtp: 0, unbackedCrypto: 0, fundShares: 0 };
const rows = [];
for (const line of book) {
  if (line.type === "ETF" && !EEA.has(line.isin.slice(0, 2))) { left.nonUcitsEtf++; continue; }
  if (line.type === "ETN" || line.type === "ETC") {
    if (!isCryptoEtp(line.name)) { left.nonCryptoEtp++; continue; }
    if (UNBACKED.test(line.name)) { left.unbackedCrypto++; continue; }
  }
  if (line.type === "STOCK" && line.list === "etp") { left.fundShares++; continue; }
  const { query, ticker, name, exchange, mic, currency, type, isin, raw } = line;
  rows.push({ query, ticker, name, exchange, mic, currency, type, isin, raw });
}

const whole = withoutObligations(rows);
const before = {};
for (const row of whole) before[row.type] = (before[row.type] || 0) + 1;
if ((before.STOCK || 0) < 5000) throw new Error(`only ${before.STOCK || 0} shares`);
if ((before.ETF || 0) < 2500) throw new Error(`only ${before.ETF || 0} UCITS ETFs`);

// Owner rule 2026-10-25: the 4,000 most traded shares and 1,000 most traded
// UCITS ETFs on Tradegate; every crypto ETP stays.
const activity = await tradegateActivity();
const kept = whole.filter((row) => !TOP[row.type]);
const cutoffs = [];
for (const [type, n] of Object.entries(TOP)) {
  const ranked = whole.filter((row) => row.type === type).sort(byPopularity(activity));
  kept.push(...ranked.slice(0, n));
  const last = ranked[Math.min(n, ranked.length) - 1];
  const a = activity.get(last.isin) || NONE;
  const traded = ranked.filter((row) => (activity.get(row.isin) || NONE).value > 0).length;
  cutoffs.push(`${n}th ${type}: ${last.name} (${last.isin}), EUR ${Math.round(a.value).toLocaleString("en")} traded, ${a.orders} orders; ${traded} of ${ranked.length} traded`);
  if (traded < n) console.error(`warning: only ${traded} ${type} lines traded in the session Tradegate shows; the cut falls among untraded lines (spread decides)`);
}
const byType = {};
for (const row of kept) byType[row.type] = (byType[row.type] || 0) + 1;
if (byType.STOCK !== TOP.STOCK || byType.ETF !== TOP.ETF) throw new Error(`kept ${byType.STOCK} shares and ${byType.ETF} ETFs`);
if ((byType.ETN || 0) + (byType.ETC || 0) < 60) throw new Error("too few crypto ETPs");
for (const isin of ["US0378331005", "IE00B4L5Y983", "XS2940466316"]) {
  if (!kept.some((row) => row.isin === isin)) throw new Error(`${isin} is missing`);
}
if (kept.some((row) => row.isin === "JE00B1VS3770")) throw new Error("WisdomTree Physical Gold was kept");

kept.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker));
fs.writeFileSync(OUTPUT, JSON.stringify(stampRows(kept), null, 2));
console.error(
  `${kept.length} Tradegate lines (${Object.entries(byType).map(([t, n]) => `${n} ${t}`).join(", ")}); ` +
    `left out ${left.nonUcitsEtf} non-UCITS ETFs, ${left.nonCryptoEtp} non-crypto ETNs/ETCs, ` +
    `${left.unbackedCrypto} unbacked crypto notes, ${left.fundShares} closed-end funds, ` +
    `${rows.length - whole.length} obligations; whole place ${whole.length} -> ${kept.length} (owner rule: N most traded)`
);
for (const line of cutoffs) console.error(line);
