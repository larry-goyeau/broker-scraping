// What VIP Broker Montenegro (VIP Broker Diler AD Podgorica) sells, with
// no login: the shares listed on the Montenegro Stock Exchange
// (Montenegroberza), in EUR. VIP is a member of the exchange; its terms
// say so ("VIP Broker Diler AD Podgorica is a member of the Montenegro
// Stock Exchange") and that it gives prices "of all securities traded on
// the stock exchanges in Montenegro". Orders go through its E-trader or
// in writing.
//
//   https://www.vipbroker.net/en/e-trader
//   https://www.vipbroker.net/docs/general_terms_and_conditions.pdf
//
// The broker's screener (/en/stocks, 137 pages, and the "share" select
// on each page with 1,367 symbols) is a history book: delisted issuers,
// firms long in bankruptcy, matured bonds and fund units sit beside live
// shares, and its market segments are the old A and B lists. So the
// exchange's own market pages say what is listed today, and the
// broker's select only confirms the symbol is in the broker's book.
//
//   https://www.vipbroker.net/en/stocks?page=1
//   https://www.mnse.me/code/navigate.asp?Id=8      exchange market
//   https://www.mnse.me/code/navigate.asp?Id=1201   free market
//   https://www.mnse.me/code/navigate.asp?Id=1200   MTP ME (the exchange's MTF)
//
// Kept: the share sections, Prime and Standard of the exchange market,
// free market shares, MTP GROW and MTP ME SUSTAINABLE (PROFIT and "Akcije"
// too when they carry lines). Left out: MTP ME BANKRUPTCY (issuers "u
// stečaju", in bankruptcy proceedings), bonds and short-term paper,
// open-end fund units and closed-end fund shares, which are funds and not
// ETFs. Montenegro lists no ETF. Two closed-end funds (ZIF Eurofond, ZIF
// Trend) sit in MTP ME SUSTAINABLE with an equity CFI code; the broker
// files them under "Akcije Investicionih fondova", so that list and the
// "ZIF" name both take a line out. Each symbol's own exchange page gives
// the ISIN, the status and the CFI code; only an equity (CFI E...) in
// status Trading is written, so a halted line stays out. Prva banka's
// preference share (PBCG, CFI EP...) is a share and stays.
//
//   https://www.mnse.me/code/navigate.asp?Id=14&stockId=<id>
//   https://www.vipbroker.net/en/stocks?market=Akcije+Investicionih+fondova
//
// broker-list.json carries no restriction for this broker. Deposits go
// to the broker's account at NLB Banka in Montenegro, a euro country;
// clients may be "any natural person or legal entity, domestic or
// foreign".
//
//   node brokers/vipbroker/vipbroker_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const VIP = "https://www.vipbroker.net/en/stocks?page=1";
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
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
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

// The broker's book: every symbol in the screener's "share" select.
async function vipSymbols() {
  const html = await text(VIP);
  const select = (html.match(/<select[^>]*name="share"[^>]*>([\s\S]*?)<\/select>/) || [])[1];
  if (!select) throw new Error("the VIP screener has no share select");
  const symbols = new Set(
    [...select.matchAll(/<option[^>]*value="(\d+)"[^>]*>([\s\S]*?)<\/option>/g)].map((m) => decode(m[2]).toUpperCase()).filter(Boolean)
  );
  if (symbols.size < 1000) throw new Error(`the VIP share select had ${symbols.size} symbols`);
  return symbols;
}

// The broker's closed-end fund shares: one short page.
async function vipFunds() {
  const html = await text(`${VIP.replace("?page=1", "")}?market=Akcije+Investicionih+fondova`);
  if (/[?&]page=2\b/.test(html)) throw new Error("the VIP fund-share list runs past one page");
  const symbols = new Set([...html.matchAll(/href="stocks\/\d+">\s*([^<\s]+)\s*</g)].map((m) => m[1].toUpperCase()));
  if (symbols.size < 2) throw new Error(`the VIP fund-share list had ${symbols.size} lines`);
  return symbols;
}

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

// A symbol's exchange page: ISIN, status, CFI code, segment.
function field(html, label) {
  const plain = decode(html.replace(/<script[\s\S]*?<\/script>/g, ""));
  const match = plain.match(new RegExp(`${label} (\\S+)`));
  return match ? match[1] : "";
}

const book = await vipSymbols();
const fundShares = await vipFunds();

const listed = [];
for (const pageId of MARKETS) listed.push(...marketLines(await text(`${MNSE}?Id=${pageId}`), pageId));
const shares = listed.filter((line) => KEEP.has(line.section));
const dropped = listed.filter((line) => DROP.has(line.section));
if (shares.length < 50) throw new Error(`MNSE share sections had ${shares.length} lines`);
if (!dropped.some((line) => line.section === "MTP ME tržište - BANKRUPTCY")) throw new Error("no BANKRUPTCY section on MNSE: the page changed");

const rows = [];
const seen = new Set();
const notTrading = [];
const funds = [];
const notInBook = [];
for (const line of shares) {
  const page = await text(`${MNSE}?Id=14&stockId=${line.stockId}`);
  const isin = field(page, "ISIN");
  const status = field(page, "Status");
  const cfi = field(page, "CFI kod");
  const segment = (decode(page).match(/Prosječna cijena \S+ Segment (.+?) Trenutna cijena/) || [])[1] || "";
  if (!ISIN.test(isin)) throw new Error(`no ISIN on the MNSE page of ${line.symbol}`);
  if (segment !== line.section) throw new Error(`${line.symbol} is in "${line.section}" but its page says "${segment}"`);
  if (!/^[A-Z]{6}$/.test(cfi)) throw new Error(`no CFI code on the MNSE page of ${line.symbol}`);
  if (cfi[0] !== "E" || fundShares.has(line.symbol) || /^ZIF\b/.test(line.issuer)) {
    funds.push(line.symbol);
    continue;
  }
  if (status !== "Trading") {
    notTrading.push(`${line.symbol} ${status || "?"}`);
    continue;
  }
  if (!book.has(line.symbol)) notInBook.push(line.symbol);
  if (seen.has(isin)) throw new Error(`repeated ISIN ${isin}`);
  seen.add(isin);
  // A second share class sits under its issuer with no header of its own.
  const name = line.issuer.replace(/\s+/g, " ");
  if (!name) throw new Error(`no issuer for ${line.symbol}`);
  rows.push({
    query: line.symbol,
    ticker: line.symbol,
    name,
    exchange: "Montenegro Stock Exchange",
    mic: "XMNX",
    currency: "EUR",
    type: "STOCK",
    isin,
    raw: [line.symbol, name, isin, line.section, cfi, status].join(" | "),
  });
}

// The broker's select carries every MNSE symbol of the last two decades;
// a missing one means the screener or the exchange list changed.
if (notInBook.length > 5) throw new Error(`MNSE shares missing from the VIP book: ${notInBook.join(", ")}`);
if (rows.length < 40) throw new Error(`only ${rows.length} listed shares`);

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("vipbroker-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const bySection = new Map();
for (const line of shares) bySection.set(line.section, (bySection.get(line.section) || 0) + 1);
console.error(
  `${kept.length} listings (${kept.length} STOCK, Montenegro Stock Exchange EUR). ` +
    `Sections read: ${[...bySection].map(([key, count]) => `${count} ${key}`).join(", ")}. ` +
    `Left out: ${dropped.length} in bankruptcy/bond/fund sections; closed-end funds: ${funds.join(", ") || "none"}; ` +
    `not trading: ${notTrading.join(", ") || "none"}. Not in the VIP select: ${notInBook.join(", ") || "none"}.`
);
