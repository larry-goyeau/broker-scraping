// What Standard Capital Securities (scstrade.com) sells in shares and ETFs,
// with no login. Its company snapshot page carries, for its search box,
// every Pakistan Stock Exchange company it covers, one "SYMBOL - Name" per
// line, with the flags the broker adds after the name: "(Defaulter)",
// "(NON-COMPLIANT)", "(Gem)" and "(DELISTED)". The online account trades
// the PSX ready market; the Pakistan Stock Exchange is the only place.
//
//   https://www.scstrade.com/stockscreening/SS_CompanySnapShot.aspx?symbol=PRL
//   https://www.scstrade.com/OnlineTrading/OT_OnlineTradingStocks.aspx
//
// Kept: shares, preference shares, modarabas, REITs and the nine ETFs.
// Left out:
//   - a line the broker itself marks "(DELISTED)" (Cyan, Gillette, ...);
//   - a right ("Convt Pref Right"): an entitlement, not a share;
//   - a closed-end mutual fund (HBL Growth Fund, Tri-Star Mutual Fund,
//     ...): a fund, not an ETF;
//   - a company the exchange prints as delisted or suspended, or that has
//     not traded for six months (psxStatus.mjs, the same filter as akd,
//     chase and ktrade). While the PSX data portal does not answer, a
//     fallback list there, from the PSX's suspension list and TradingView's
//     PSX scanner, drops the suspended lines the portal was never read for:
//     TRIBL, PICL, HATM, ..., SGABL, SPCL, SWL (21 lines; ANLPS and GIL go
//     on the six-month rule). Sources in psxStatus.mjs.
// A "(Defaulter)" or "(NON-COMPLIANT)" line stays: the broker lists it and
// the exchange still trades it on its own counter. It carries a remark
// naming that counter, plus "winding-up proceedings" when the PSX portal
// flags the company WINDING-UP (CJPL). A GEM Board line (GEMPACRA,
// GEMPAPL, ...) stays with the accredited-investor remark of
// psxStatus.mjs (GEM_REMARK, source there). Every line is in rupees.
// The page prints no ISIN; stampRows fills it from the shared lists, and
// psxIsins.mjs (next to this script, sources there) the nine ETFs and the
// few companies those lists lack.
//
//   node brokers/standardcapital/standardcapital_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { GEM_REMARK, psxFlags, psxGemBoard, withoutDelisted } from "../../psxStatus.mjs";
import { fillPsxIsins } from "./psxIsins.mjs";
import fs from "node:fs";

const PAGE = "https://www.scstrade.com/stockscreening/SS_CompanySnapShot.aspx?symbol=PRL";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const OUTPUT = new URL("standardcapital-parsed.json", import.meta.url);
const PLACE = "Pakistan Stock Exchange";

function clean(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function text(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(last);
}

// The page cuts some labels short, closing bracket included ("(Defaulter").
const FLAG = /\s*\((?:DELISTED|Defaulter|NON-COMPLI[A-Z]*|Non-Compli[a-z]*|Gem|GEM)(?:\)\.?|$)/g;

function kindOf(name) {
  if (/\bETF\b|exchange traded fund/i.test(name)) return "ETF";
  if (/\bREIT\b/i.test(name)) return "STOCK";
  if (/\bfund\b/i.test(name)) return "FUND";
  return "STOCK";
}

const html = await text(PAGE);
const block = (html.match(/availableTags\s*=\s*(\[[\s\S]*?\]);/) || [])[1];
if (!block) throw new Error("the company list (availableTags) is not on the snapshot page");
const tags = JSON.parse(block);
if (tags.length < 450) throw new Error(`the snapshot page lists ${tags.length} companies`);

const rows = [];
const dropped = { delisted: [], right: [], fund: [] };
const seen = new Set();
for (const tag of tags) {
  const cut = String(tag).indexOf(" - ");
  if (cut < 0) continue;
  const ticker = clean(tag.slice(0, cut)).toUpperCase();
  const label = clean(tag.slice(cut + 3));
  if (!ticker || seen.has(ticker)) continue;
  seen.add(ticker);
  if (/\(DELISTED\)/i.test(label)) {
    dropped.delisted.push(ticker);
    continue;
  }
  if (/\brights?\b/i.test(label)) {
    dropped.right.push(ticker);
    continue;
  }
  const type = kindOf(label);
  if (type === "FUND") {
    dropped.fund.push(ticker);
    continue;
  }
  const name = clean(label.replace(FLAG, "")) || ticker;
  const counter = /\(Defaulter/i.test(label) ? "PSX defaulter: traded on the exchange's defaulters' counter"
    : /\(NON-COMPLI/i.test(label) ? "PSX non-compliant company: traded on the exchange's non-compliant counter"
    : "";
  const remark = psxGemBoard(ticker) || /\(Gem\b/i.test(label) ? GEM_REMARK
    : counter ? `${counter}${/WINDING-UP/.test(psxFlags(ticker)) ? "; winding-up proceedings" : ""}.`
    : "";
  rows.push({
    query: ticker,
    ticker,
    name,
    exchange: PLACE,
    mic: "XKAR",
    currency: "PKR",
    type,
    isin: "",
    raw: [ticker, label, "PSX", "PKR", type].join(" "),
    ...(remark ? { remark } : {}),
  });
}
rows.sort((left, right) => left.ticker.localeCompare(right.ticker));

const must = (ticker, type) => {
  if (!rows.some((row) => row.ticker === ticker && row.type === type)) throw new Error(`${ticker} is not a ${type} line`);
};
must("OGDC", "STOCK");
must("MIIETF", "ETF");
must("DCR", "STOCK");
if (rows.filter((row) => row.type === "ETF").length < 8) throw new Error("fewer than 8 PSX ETFs");
if (rows.some((row) => /\bright\b/i.test(row.raw))) throw new Error("a right stayed in the file");

// Delisted and suspended companies stay in some lists but cannot be bought.
const stamped = stampRows(withoutDelisted(withoutObligations(rows)));
const mapped = fillPsxIsins(stamped);
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const etf = stamped.filter((row) => row.type === "ETF").length;
const gem = stamped.filter((row) => row.remark === GEM_REMARK).length;
const counter = stamped.filter((row) => /counter/.test(row.remark || "")).length;
const withIsin = stamped.filter((row) => row.isin).length;
console.error(
  `${tags.length} companies on the page, ${stamped.length} listings, ${withIsin} with an ISIN (${mapped} from psxIsins.mjs), ${etf} ETF;`,
  `left out: ${dropped.delisted.length} marked delisted, ${dropped.right.length} right, ${dropped.fund.length} closed-end funds,`,
  `${rows.length - stamped.length} delisted, suspended or without a trade for six months at the PSX;`,
  `remarks: ${gem} GEM Board, ${counter} defaulters' or non-compliant counter`,
);
