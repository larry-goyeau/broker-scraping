// The Montenegro Stock Exchange (Montenegroberza, MIC XMNX) share book, for
// the brokers that sell the whole exchange and print no list of their own
// (TF Capital first). The reading of the exchange's pages is the one
// ../vipbroker/vipbroker_scraping.mjs makes, without VIP's own screener.
//
// The exchange's three market pages list, by section, every line it
// quotes today; each line's own page gives its ISIN, status, CFI code and
// segment:
//   https://www.mnse.me/code/navigate.asp?Id=8      exchange market
//   https://www.mnse.me/code/navigate.asp?Id=1201   free market
//   https://www.mnse.me/code/navigate.asp?Id=1200   MTP ME (the exchange's MTF)
//   https://www.mnse.me/code/navigate.asp?Id=14&stockId=<id>
//
// Kept: the share sections, Prime and Standard of the exchange market,
// free market shares, MTP GROW and MTP ME SUSTAINABLE (PROFIT and "Akcije"
// too when they carry lines). Left out: MTP ME BANKRUPTCY (issuers "u
// stečaju", in bankruptcy proceedings), bonds and short-term paper,
// open-end fund units and closed-end fund shares (the "Akcije
// investicionih fondova" section, and a ZIF, a closed-end investment
// fund, filed among the shares), which are funds and not ETFs. Montenegro
// lists no ETF. Only an equity (CFI E...) in status Trading is written, so
// a halted line stays out. Every line trades in euros.
//
// Use:
//   import { mnseBook } from "../tfcapital/mnseBook.mjs";
//   const rows = await mnseBook();   // rows.report: what was left out
//
//   node brokers/tfcapital/mnseBook.mjs     (prints the counts)

import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const EXCHANGE = "Montenegro Stock Exchange";
export const MIC = "XMNX";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const MNSE = "https://www.mnse.me/code/navigate.asp";
const MARKETS = [8, 1201, 1200];
const ISIN = /^ME[A-Z0-9]{9}\d$/;

const KEEP = new Set([
  "Berzansko tržište - Prime prestige",
  "Berzansko tržište - Prime classic",
  "Berzansko - Standard tržište",
  "Slobodno tržište - Akcije",
  "MTP GROW tržište",
  "MTP ME tržište - SUSTAINABLE",
  "MTP ME tržište - PROFIT",
  "MTP ME tržište - Akcije",
]);
const DROP = new Set([
  "MTP ME tržište - BANKRUPTCY",
  "Slobodno tržište - Akcije investicionih fondova",
  "Slobodno tržište - Investicione jedinice otvorenih fondova",
  "Slobodno tržište - Državne obveznice",
  "Slobodno tržište - Korporativne obveznice",
  "Slobodno tržište - Kratkoročne dužničke hartije",
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function text(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(500 * (attempt + 1));
  }
  throw new Error(last);
}

const decode = (s) =>
  String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

// One market page: <h3> section titles, then a table whose issuer rows
// (colspan 4) precede that issuer's symbol rows.
function marketLines(html, pageId) {
  const lines = [];
  const parts = html.split(/<h3>/).slice(1);
  if (!parts.length) throw new Error(`MNSE page ${pageId} has no sections`);
  for (const part of parts) {
    const section = decode(part.slice(0, part.indexOf("</h3>")));
    if (!KEEP.has(section) && !DROP.has(section)) throw new Error(`unread MNSE section "${section}" on page ${pageId}`);
    let issuer = "";
    for (const tr of part.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const head = tr[1].match(/<td class="td_color1_02" colspan="4">([\s\S]*?)<\/td>/);
      if (head) {
        issuer = decode(head[1]);
        continue;
      }
      const link = tr[1].match(/stockId=(\d+)' title='([^']+)'/);
      if (link) lines.push({ section, issuer, stockId: link[1], symbol: link[2].trim().toUpperCase() });
    }
  }
  return lines;
}

function field(html, label) {
  const plain = decode(html.replace(/<script[\s\S]*?<\/script>/g, ""));
  const match = plain.match(new RegExp(`${label} (\\S+)`));
  return match ? match[1] : "";
}

export async function mnseBook() {
  const listed = [];
  for (const pageId of MARKETS) listed.push(...marketLines(await text(`${MNSE}?Id=${pageId}`), pageId));
  const shares = listed.filter((line) => KEEP.has(line.section));
  const dropped = listed.filter((line) => DROP.has(line.section));
  if (shares.length < 50) throw new Error(`MNSE share sections had ${shares.length} lines`);
  if (!dropped.some((line) => line.section === "MTP ME tržište - BANKRUPTCY")) throw new Error("no BANKRUPTCY section on MNSE: the page changed");

  const rows = [];
  const seen = new Set();
  const report = { sections: {}, droppedSections: dropped.length, funds: [], notTrading: [] };
  for (const line of shares) {
    report.sections[line.section] = (report.sections[line.section] || 0) + 1;
    await sleep(300);
    const page = await text(`${MNSE}?Id=14&stockId=${line.stockId}`);
    const isin = field(page, "ISIN");
    const status = field(page, "Status");
    const cfi = field(page, "CFI kod");
    const segment = (decode(page).match(/Prosječna cijena \S+ Segment (.+?) Trenutna cijena/) || [])[1] || "";
    if (!ISIN.test(isin)) throw new Error(`no ISIN on the MNSE page of ${line.symbol}`);
    if (segment !== line.section) throw new Error(`${line.symbol} is in "${line.section}" but its page says "${segment}"`);
    if (!/^[A-Z]{6}$/.test(cfi)) throw new Error(`no CFI code on the MNSE page of ${line.symbol}`);
    if (cfi[0] !== "E" || /^ZIF\b|\bZIF\b|investicion\w* fond/i.test(line.issuer)) {
      report.funds.push(line.symbol);
      continue;
    }
    if (status !== "Trading") {
      report.notTrading.push(`${line.symbol} ${status || "?"}`);
      continue;
    }
    if (seen.has(isin)) throw new Error(`repeated ISIN ${isin}`);
    seen.add(isin);
    const name = line.issuer.replace(/\s+/g, " ");
    if (!name) throw new Error(`no issuer for ${line.symbol}`);
    rows.push({
      query: isin,
      ticker: line.symbol,
      name,
      exchange: EXCHANGE,
      mic: MIC,
      currency: "EUR",
      type: "STOCK",
      isin,
      raw: [line.symbol, name, isin, line.section, cfi, status].join(" | "),
    });
  }
  if (rows.length < 40) throw new Error(`only ${rows.length} Montenegro shares`);
  rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
  rows.report = report;
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const rows = await mnseBook();
  console.log(`${rows.length} Montenegro shares`, rows.report);
}
