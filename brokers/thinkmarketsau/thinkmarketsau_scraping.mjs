// What ThinkMarkets Australia sells as cash equities (TF Global Markets
// Equities (Aust) Pty Ltd, Corporate Authorised Representative 1280662 of
// TF Global Securities (Aust) Pty Ltd, AFSL 412816; cleared by FinClear):
// the shares and ETFs quoted on the ASX. There is no list of its own.
// Everything else ThinkMarkets sells in Australia is CFDs and stays out.
//
//   "ThinkMarkets offers eligible Australian clients access to Cash
//   Equities, allowing clients to buy and hold supported Australian-listed
//   shares."
//     https://support.thinkmarkets.com/hc/en-gb/articles/11613207707537-Cash-Equities-CE-account-Australia-Only
//   "Enjoy access to 3,000+ ASX shares and ETFs" ... "a flat brokerage fee
//   of just $8." FAQ: "The brokerage fee is $8 per trade up to $200,000.
//   For each trade above $200,000, a 0.05% fee applies."
//     https://www.thinkmarkets.com/au/cash-equities/
//   "What markets/products can I trade? ThinkMarkets currently offers
//   Direct Market Access (DMA) to cash equities listed in Australia."
//   Rate Card: "Brokerage Fee $8.00 Per trade below $200,000".
//     https://www.thinkmarkets.com/au/support/trading-fees/ (Cash equities, Trading & fees)
//   The equities Terms and Conditions (8 March 2024) repeat the fee table:
//   "Brokerage Fee $8.00 Per trade below $200,000", "Brokerage Fee 0.05%
//   Per trade above $200,000".
//     https://www.thinkmarkets.com/tfxmain/media/img/pdf/TF-Global-Markets-Equities-(Aust)-Pty-Ltd-Terms-and-Conditions.pdf
//
// thinkmarkets.com answers 403 (a Cloudflare challenge) to every script,
// so its pages were read from the Internet Archive's copies: cash-equities
// of 16 February 2026, trading-fees of 13 March 2026, the Terms and
// Conditions PDF. At run time the help-centre sentence is read live, and
// the cash-equities sentence live or else from the Archive's latest copy.
//
// Place: ASX only, as in broker-list.json. The archived FinClear Best
// Execution Policy page on ThinkMarkets' site (May 2024) says "The
// execution venues for FinClear includes both ASX TradeMatch, Chi-X
// Australia and NSX", and reviews say the $8 applies to ASX and Chi-X
// trades, but no current ThinkMarkets page names Cboe Australia: the
// pages speak of "ASX shares and ETFs". Funds listed on Cboe alone are not
// ASX shares and stay out.
//   https://www.thinkmarkets.com/au/shares/legal-and-regulation/finclear-best-execution-policy/
//
// ETFs are kept ("3,000+ ASX shares and ETFs"). No international shares:
// the FAQ names Australian cash equities only. Currency: AUD.
// The ASX listing is read by ../netwealth/australia.mjs.
//
//   node brokers/thinkmarketsau/thinkmarketsau_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { australianRows, fetchWith, logCounts, pageText } from "../netwealth/australia.mjs";

const HELP = "https://support.thinkmarkets.com/api/v2/help_center/en-gb/articles/11613207707537.json";
const PAGE = "https://www.thinkmarkets.com/au/cash-equities/";
const ARCHIVE = `https://archive.org/wayback/available?url=${encodeURIComponent(PAGE)}`;

const help = pageText((await fetchWith(HELP, { kind: "json" }))?.article?.body || "");
if (!/eligible Australian clients access to Cash Equities, allowing clients to buy and hold supported Australian-listed shares/i.test(help)) {
  throw new Error(`${HELP} no longer offers Australian-listed shares`);
}

async function cashEquitiesPage() {
  try {
    return { text: pageText(await fetchWith(PAGE, { tries: 1 })), from: PAGE };
  } catch {
    const snapshot = (await fetchWith(ARCHIVE, { kind: "json" }))?.archived_snapshots?.closest;
    if (!snapshot?.available || !snapshot.timestamp) throw new Error(`no archived copy of ${PAGE}`);
    const url = `https://web.archive.org/web/${snapshot.timestamp}id_/${PAGE}`;
    return { text: pageText(await fetchWith(url)), from: url };
  }
}

let page = null;
try {
  page = await cashEquitiesPage();
} catch (error) {
  console.error(`cash-equities page unread (${error.message}); the help-centre sentence stands alone`);
}
if (page && !/access to [\d,]+\+? ASX shares and ETFs/i.test(page.text)) throw new Error(`${page.from} no longer offers ASX shares and ETFs`);
if (page && /\b(US|international|global) shares\b/i.test(page.text.replace(/CFD Shares \(ASX & International\)/gi, ""))) {
  throw new Error(`${page.from} now speaks of foreign shares: look for a list`);
}

const { rows, dropped } = await australianRows({ places: ["ASX"] });
for (const ticker of ["BHP", "VAS", "NWSLV", "GOLD"]) {
  if (!rows.some((row) => row.ticker === ticker && row.exchange === "ASX")) throw new Error(`${ticker} is missing on the ASX`);
}

fs.writeFileSync(new URL("thinkmarketsau-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
logCounts(rows, dropped);
