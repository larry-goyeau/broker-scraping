// The NEPSE share book for the Nepal brokers with no security list of their
// own that can be read (Thrive, Sagarmatha, Sweta, Neev, Sharepro, Hatemalo,
// Kalash, Garima, NMB Securities). Each one says on its own pages that its
// clients trade the securities listed on the Nepal Stock Exchange, and every
// client orders through the exchange's TMS, so the book is every share the
// exchange lets trade today.
//
// The exchange's list is read by ../kumari/nepseShares.mjs (a real Chrome
// opens nepalstock.com.np/company and makes the signed calls from inside the
// page; the crawl is cached 12 hours in ../kumari/nepse-cache.json, so the
// Nepal scrapers run back to back read NEPSE once). What it keeps: ordinary,
// promoter and perpetual preference shares that are active and permitted to
// trade, all in rupees. What it leaves out: debentures (bonds), mutual funds
// (closed-end funds, not ETFs; Nepal lists no ETF), suspended and delisted
// lines, legacy lines with no ISIN, and promoter lines of companies with no
// open public share.
//
// Here each scraper's evidence is read again: the page that ties the broker
// to the whole exchange must still say so, or the run fails.
//
//   https://nepalstock.com.np/company
//   https://nepalstock.com.np/api/nots/company/list
//   https://nepalstock.com.np/api/nots/security?nonDelisted=true
//   https://nepalstock.com.np/api/nots/security/<id>

import { nepseShares, EXCHANGE } from "../kumari/nepseShares.mjs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return await response.text();
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await pause(1000 * (attempt + 1));
  }
  throw new Error(last || url);
}

// The page's words, without tags, scripts or entities.
export function pageWords(html) {
  return String(html)
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ");
}

// evidence: [{ url, pattern, text? }]; text(url) returns the words to test,
// for a site whose words are in a script bundle.
// symbols: the broker's own symbols, when it prints some (a ticker), which
// must be NEPSE lines.
export async function writeNepseBook({ broker, out, evidence, symbols }) {
  for (const { url, pattern, text } of evidence) {
    const words = text ? await text(url) : pageWords(await getText(url));
    if (!pattern.test(words)) throw new Error(`${url} no longer says ${pattern} (${broker})`);
  }
  const { rows, left, fromCache } = await nepseShares();
  // The book must keep the big names; a broken read fails here.
  for (const ticker of ["NABIL", "NICA", "NTC", "CHCL"]) {
    if (!rows.some((row) => row.ticker === ticker && /^NP/.test(row.isin))) throw new Error(`${ticker} is missing from the NEPSE book`);
  }
  let check = "";
  if (symbols) {
    const book = new Set(rows.map((row) => row.ticker));
    const shared = [...symbols].filter((symbol) => book.has(symbol));
    // The ticker also prints debentures and funds, which the book leaves out.
    if (shared.length < Math.min(250, symbols.size * 0.6)) throw new Error(`only ${shared.length} of the ${symbols.size} symbols ${broker} prints are NEPSE shares`);
    check = `; ${shared.length} of the ${symbols.size} symbols on the ticker of ${broker} are in the book`;
  }
  const stamped = stampRows(withoutObligations(rows.map((row) => ({ ...row }))));
  if (stamped.length !== rows.length) throw new Error(`${rows.length - stamped.length} shares were taken for bonds`);
  fs.writeFileSync(out, JSON.stringify(stamped, null, 2));
  const promoters = rows.filter((row) => row.raw.endsWith(" promoter")).length;
  const leftOut = Object.entries(left).map(([reason, count]) => `${count} ${reason}`).join(", ");
  console.error(
    `${broker}: ${stamped.length} listings (${stamped.length} STOCK in NPR, ${promoters} of them promoter shares) on ${EXCHANGE}` +
      `${fromCache ? " (NEPSE read from nepse-cache.json)" : ""}; left out ${leftOut}${check}`,
  );
  return stamped;
}
