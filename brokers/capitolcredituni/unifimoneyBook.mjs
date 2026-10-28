// The self-directed book of Unifimoney (Unifimoney Tech QOZB, LLC; broker
// and custodian Apex Clearing), the investing app that Capitol Credit Union
// (../capitolcredituni) and First Fidelity Bank (../firstfidelity) embed in
// their online banking. The list itself sits inside the app, but
// Unifimoney's self-managed page prints the rules it is drawn by:
//
//   "Available securities are limited to a predefined list determined by
//   Unifimoney and the custodian." "Our broker dealer Apex has a number of
//   guidelines for a stock or fund to be listed and available for trade.
//   These are general guidelines and the Investment Committee ultimately
//   decides what to include. General guidelines are: - US exchange listed
//   (OTC securities are not available) - Market capitalization greater
//   than $ 1 billion - If market capitalization is below $1 billion, then
//   3 month average daily dollar volume must be greater than $0.5 million
//   - Exchange listed sponsored ADRs (American Depositary Receipts) -
//   Non-leveraged ETFs", and "We currently support stocks, ETFs,
//   cryptocurrencies, and precious metals"; custom portfolios use "U.S.
//   equities, ETFs, and ADRs".
//
//   https://www.unifimoney.com/invest/self-managed
//
// So the book starts from the whole US exchange book of the day
// (../wellstrade/usBook.mjs: Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe
// BZX, Texas Stock Exchange; warrants, rights, units, when-issued lines,
// listed notes and halted lines are left out there; OTC lines are not in
// it, as the page says) and applies the guidelines:
//
// - Shares, ADRs, preferreds and closed-end funds (type STOCK): kept when
//   Nasdaq's stock screener gives the line a market value over $1 billion,
//   or, below that or with no market value (preferred lines carry none),
//   when the line's dollar volume (volume x last sale) is over $0.5
//   million. The screener prints the volume of the last session only, and
//   no free source gives a three-month average for every US line, so the
//   last session stands in for it. A line the screener does not carry is
//   left out, since neither test can be passed. Exchange-listed ADRs are
//   sponsored programmes, so no ADR is dropped for that.
// - ETFs: kept unless leveraged (a factor over 1x in the name such as
//   "2X" or "-3x", "ProShares Ultra...", "UltraPro", or the word
//   "Leverage(d)" without a 1x factor). Inverse 1x funds are not leveraged
//   and stay. The size test is not applied to ETFs: the screener gives no
//   fund size or volume for them, and the guideline reads as one for
//   companies.
// - ETNs: out. Unifimoney names stocks, ETFs and ADRs, never notes.
// The US is one NBBO market: one row per title on its primary listing, in
// dollars.
//
//   https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true
//
// Fees: "Trade Commissions on self-elected individual cash accounts: Free",
// ACAT out $50 (Unifimoney Fees & Limits schedule, legal library):
//   https://www.unifimoney.com/legal

import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
export const SELF_MANAGED = "https://www.unifimoney.com/invest/self-managed";
export const LEGAL = "https://www.unifimoney.com/legal";
const STOCKS = "https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true";
const CAP_FLOOR = 1e9;
const DOLLAR_VOLUME_FLOOR = 0.5e6;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function text(url, accept = "text/html") {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

export const plain = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&#x27;|[‘’]/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;|&mdash;/g, "-")
    .replace(/\s+/g, " ");

// The page still says what the header quotes, or the run stops.
export async function evidence(url, patterns) {
  const page = plain(await text(url));
  for (const pattern of patterns) if (!pattern.test(page)) throw new Error(`${url} no longer says ${pattern}`);
}

// The fee schedule is a PDF linked from the legal library; its link text
// is "Fee schedule". Only its link is checked here (the PDF name carries
// the schedule's date and changes), the cost file reads the figures.
async function feeSchedule() {
  const html = await text(LEGAL);
  const link = [...html.matchAll(/href="([^"]+\.pdf)"[^>]*>([\s\S]{0,800}?)<\/a>/g)].find((m) => /Fee schedule/i.test(plain(m[2])));
  if (!link) throw new Error(`${LEGAL} no longer links a fee schedule`);
  return link[1];
}

const money = (value) => Number(String(value || "").replace(/[$,]/g, "")) || 0;
// Screener codes write BRK/B and a preferred ABR^D; the book writes BRK.B
// and ABR.PRD.
const bookTicker = (symbol) =>
  String(symbol || "")
    .trim()
    .toUpperCase()
    .replace(/\//g, ".")
    .replace(/\^([A-Z]*)$/, ".PR$1");

export function leveraged(name) {
  const factors = [...String(name).matchAll(/(?:^|[\s(-])(\d+(?:\.\d+)?)\s*x\b/gi)].map((m) => Number(m[1]));
  if (factors.some((f) => f > 1)) return true;
  if (/ProShares Ultra|\bUltraPro\b/i.test(name)) return true;
  return /\bLeverag(?:e|ed)\b/i.test(name) && !factors.includes(1);
}

export async function unifimoneyBook() {
  await evidence(SELF_MANAGED, [
    /\$0 commission online trading of U\.S\. listed stocks and ETFs/i,
    /Available securities are limited to a predefined list determined by Unifimoney and the custodian/i,
    /OTC securities are not available/i,
    /Market capitalization greater than \$ ?1 billion/i,
    /3 month average daily dollar volume must be greater than \$0\.5 million/i,
    /Exchange listed sponsored ADRs/i,
    /Non-leveraged ETFs/i,
  ]);
  await sleep(1000);
  const fees = await feeSchedule();
  await sleep(1000);

  const stockRows = JSON.parse(await text(STOCKS, "application/json")).data?.rows || [];
  if (stockRows.length < 5000) throw new Error(`short screener: ${stockRows.length} shares`);
  const screen = new Map();
  for (const line of stockRows) {
    screen.set(bookTicker(line.symbol), { cap: money(line.marketCap), dollars: money(line.volume) * money(line.lastsale) });
  }

  const book = await usBook();
  const left = { small: [], notScreened: [], leveraged: [], etn: [] };
  const kept = [];
  for (const row of book) {
    if (row.type === "ETN") {
      left.etn.push(row.ticker);
    } else if (row.type === "ETF") {
      if (leveraged(row.name)) left.leveraged.push(row.ticker);
      else kept.push(row);
    } else {
      const quote = screen.get(row.ticker);
      if (!quote) left.notScreened.push(row.ticker);
      else if (quote.cap > CAP_FLOOR || quote.dollars > DOLLAR_VOLUME_FLOOR) kept.push(row);
      else left.small.push(row.ticker);
    }
  }
  kept.report = { ...book.report, fees, left };
  return kept;
}
