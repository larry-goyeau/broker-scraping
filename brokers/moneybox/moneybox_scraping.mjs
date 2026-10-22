// What Moneybox sells in shares and exchange-traded funds, with no login.
// Moneybox (Digital Moneybox Limited, UK) sells funds, ETFs and 20 US
// shares. The fees are published: a £1 monthly subscription, a 0.45%
// platform fee, no commission per order, and 0.45% currency conversion on
// US shares (Fees & Charges page).
//
// Two support pages are the book. The fund range page is one card per
// fund, each with a KIID link that carries the ISIN. A card whose name says
// ETF is an ETF. The others (Global Shares, Cash Trust, the bond and
// Islamic funds...) are open-ended tracker funds, dealt with the fund
// manager, and are left out. The "Which stocks can I invest in?" FAQ names
// the US shares, one line each, by company name only. The US stocks page
// says the range is 20 companies.
//
// Every moneyboxapp.com host sits behind a Cloudflare wall that refuses a
// script (403, also from a headless browser). The script asks the live page
// first and, when refused, reads the newest Wayback Machine capture of the
// same page, and prints the capture date.
//
// Places. The Order Transmission Policy sends fund and ETF orders to
// Winterflood, which sends exchange-traded funds to a retail service
// provider on the London market, and US share orders to DriveWealth, for
// "US stocks that are listed on the New York Stock Exchange and the
// Nasdaq". So an ETF gets one row per London Stock Exchange main-market
// line the account can hold, read from the LSE. Accounts are in sterling
// only, so only GBP and GBX lines are kept. A US share gets one row on its
// listing exchange in USD; the US is one NBBO market and is not duplicated.
//
// The FAQ gives no ticker. A company name maps to its US line below, and
// the Nasdaq Trader symbol directories confirm the ticker and its listing
// exchange. Alphabet is not said to be class A or C; class A (GOOGL) is
// kept. Berkshire Hathaway is class B, the only class sold fractionally.
//
// broker-list.json carries no restriction on the three places. The US
// shares are sold "exclusively to our Stocks & Shares ISA customers" (US
// stocks page); that depends on the account, not the title, and filters
// nothing.
//
//   https://support.moneyboxapp.com/funds
//   https://support.moneyboxapp.com/faqs/which-stocks-can-i-invest-in/
//   https://support.moneyboxapp.com/investing/stocks/us-stocks
//   https://support.moneyboxapp.com/order-transmission-policy
//   https://support.moneyboxapp.com/fees-and-charges
//   ftp://ftp.nasdaqtrader.com/symboldirectory/nasdaqlisted.txt
//   ftp://ftp.nasdaqtrader.com/symboldirectory/otherlisted.txt
//   https://api.londonstockexchange.com/api/gw/lse/search/autocomplete?q=<ISIN>
//
//   node brokers/moneybox/moneybox_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { lseLines } from "../../lseListings.mjs";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const exec = promisify(execFile);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FUNDS = "https://support.moneyboxapp.com/funds";
const STOCKS = "https://support.moneyboxapp.com/faqs/which-stocks-can-i-invest-in/";
const US_PAGE = "https://support.moneyboxapp.com/investing/stocks/us-stocks";
const HELD = new Set(["GBP", "GBX"]);
const EXCHANGE = { XNAS: "Nasdaq", XNYS: "New York Stock Exchange" };
const LISTING = { Q: "XNAS", N: "XNYS" };

// The FAQ name of each US share, its ticker and ISIN.
const US = {
  "adobe": ["ADBE", "US00724F1012"],
  "alphabet": ["GOOGL", "US02079K3059"],
  "amazon": ["AMZN", "US0231351067"],
  "apple": ["AAPL", "US0378331005"],
  "at&t": ["T", "US00206R1023"],
  "berkshire hathaway": ["BRK.B", "US0846707026"],
  "coca-cola": ["KO", "US1912161007"],
  "jp morgan chase & co": ["JPM", "US46625H1005"],
  "mastercard": ["MA", "US57636Q1040"],
  "mcdonald's": ["MCD", "US5801351017"],
  "meta": ["META", "US30303M1027"],
  "microsoft": ["MSFT", "US5949181045"],
  "nike": ["NKE", "US6541061031"],
  "nvidia": ["NVDA", "US67066G1040"],
  "pfizer": ["PFE", "US7170811035"],
  "procter & gamble": ["PG", "US7427181091"],
  "t-mobile": ["TMUS", "US8725901040"],
  "tesla": ["TSLA", "US88160R1014"],
  "visa": ["V", "US92826C8394"],
  "disney": ["DIS", "US2546871060"],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decode(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// curl, not fetch: the Wayback Machine answers Node's fetch with 429 and
// curl with the page.
async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const { stdout } = await exec("curl", ["-sSL", "--max-time", "60", "-A", UA, "-w", "\n%{http_code} %{url_effective}", url], { maxBuffer: 16_000_000, encoding: "utf8" });
      const cut = stdout.lastIndexOf("\n");
      const [status, final] = stdout.slice(cut + 1).split(" ");
      if (status === "200") return { body: stdout.slice(0, cut), url: final };
      last = `${status} ${url}`;
      if (status === "403" || status === "404") break;
    } catch (error) {
      last = String(error.stderr || error.message || error).trim();
    }
    await sleep(3000 * (attempt + 1));
  }
  throw new Error(last);
}

// The live page, or the newest Wayback capture of it when Cloudflare refuses.
const captures = [];
async function page(url) {
  try {
    const live = await get(url);
    if (!/<title>[^<]*(Just a moment|Attention Required)/i.test(live.body)) {
      captures.push(`${url} live`);
      return live.body;
    }
  } catch {}
  await sleep(1500);
  const archived = await get(`https://web.archive.org/web/29991231235959id_/${url}`);
  const stamp = (archived.url.match(/\/web\/(\d{14})id_\//) || [])[1];
  if (!stamp) throw new Error(`no Wayback capture of ${url}`);
  captures.push(`${url} ${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`);
  return archived.body;
}

function etfCards(html) {
  const cards = [];
  for (const chunk of html.split(/<div id="card_[^"]+" class="lity-hide popup">/).slice(1)) {
    const name = decode((chunk.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1]);
    const isin = (chunk.match(/api\.moneyboxapp\.com\/content\/kiid\/([A-Z0-9]+)"/) || [])[1] || "";
    if (!name) throw new Error("a fund card has no name");
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`${name} has no KIID ISIN`);
    cards.push({ name, isin });
  }
  if (cards.length < 25) throw new Error(`the fund range printed ${cards.length} cards`);
  return cards.filter((card) => /\bETF\b/.test(card.name));
}

function usNames(html) {
  const body = html.split(/we currently offer investment into the following US stocks:/i)[1];
  if (!body) throw new Error("the stocks FAQ lost its list");
  const list = body.split(/How useful was our article/i)[0];
  const names = [...list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>|<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map((match) => decode(match[1] ?? match[2]))
    .filter((line) => /\s[–—-]\s/.test(line))
    .map((line) => line.split(/\s[–—-]\s/)[0].trim());
  if (names.length < 15) throw new Error(`the stocks FAQ named ${names.length} companies`);
  return names;
}

function usDirectory() {
  const directory = new Map();
  for (const [file, header] of [
    ["nasdaqlisted.txt", "Symbol|Security Name|Market Category|Test Issue"],
    ["otherlisted.txt", "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF"],
  ]) {
    let body = "";
    for (const source of [`ftp://ftp.nasdaqtrader.com/symboldirectory/${file}`, `https://www.nasdaqtrader.com/dynamic/SymDir/${file}`]) {
      try {
        body = execFileSync("curl", ["-s", "--max-time", "120", "-A", UA, source], { maxBuffer: 64 << 20 }).toString("utf8");
      } catch {
        body = "";
      }
      if (body.startsWith(header)) break;
    }
    if (!body.startsWith(header)) throw new Error(`${file}: unexpected header ${body.slice(0, 60)}`);
    for (const line of body.split(/\r?\n/).slice(1)) {
      const cells = line.split("|");
      if (cells.length < 7 || line.startsWith("File Creation Time")) continue;
      const nasdaq = file === "nasdaqlisted.txt";
      directory.set(cells[0], { code: nasdaq ? "Q" : cells[2], name: cells[1].trim() });
    }
  }
  if (directory.size < 10000) throw new Error(`the US directories hold only ${directory.size} lines`);
  return directory;
}

const rows = [];

const fundsHtml = await page(FUNDS);
const usText = await page(US_PAGE);
const stocksHtml = await page(STOCKS);

const etfs = etfCards(fundsHtml);
if (etfs.length < 15) throw new Error(`the fund range printed ${etfs.length} ETFs`);
for (const card of etfs) {
  const lines = (await lseLines(card.isin)).filter((line) => HELD.has(line.currency));
  if (!lines.length) throw new Error(`${card.name} ${card.isin} has no sterling LSE line`);
  for (const line of lines) {
    rows.push({
      query: line.ticker,
      ticker: line.ticker,
      name: card.name,
      exchange: "London Stock Exchange",
      currency: line.currency,
      type: "ETF",
      isin: card.isin,
      mic: "XLON",
      raw: [card.name, card.isin, "XLON", line.ticker, line.currency, line.name].join(" "),
    });
  }
}

const announced = Number((decode(usText).match(/includes (\d+) of the biggest/i) || [])[1] || 0);
if (!announced) throw new Error("the US stocks page no longer says how many shares it sells");
const names = usNames(stocksHtml);
if (announced !== names.length) throw new Error(`the US page says ${announced} shares, the FAQ names ${names.length}`);
const directory = usDirectory();
for (const name of names) {
  const known = US[name.toLowerCase()];
  if (!known) throw new Error(`no US line known for ${name}`);
  const [ticker, isin] = known;
  const listed = directory.get(ticker);
  const mic = LISTING[listed?.code];
  if (!mic) throw new Error(`${ticker} (${name}) is not a NYSE or Nasdaq line today`);
  rows.push({
    query: ticker,
    ticker,
    name: listed.name.replace(/\s+-\s+/g, " ").replace(/\s+(New\s+)?Common Stock$/i, "").replace(/\s+/g, " ").trim(),
    exchange: EXCHANGE[mic],
    currency: "USD",
    type: "STOCK",
    isin,
    mic,
    raw: [name, ticker, isin, mic, "USD"].join(" "),
  });
}

const keys = new Set();
for (const row of rows) {
  const key = `${row.mic} ${row.ticker} ${row.currency}`;
  if (keys.has(key)) throw new Error(`repeated ${key}`);
  keys.add(key);
}

fs.writeFileSync(new URL("moneybox-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.type} ${row.exchange}`] = (counts[`${row.type} ${row.exchange}`] || 0) + 1;
console.error(`${rows.length} listings (${Object.entries(counts).map(([key, count]) => `${count} ${key}`).join(", ")}); read ${captures.join("; ")}`);
