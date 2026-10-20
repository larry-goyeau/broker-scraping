// BRAC EPL Stock Brokerage publishes the current price of every code on
// the Dhaka Stock Exchange main board, with no login: one table, one line
// per trading code (633 today), with no name and no sector.
//
//   https://www.bracepl.com/brokerage/market/stockprice
//   https://www.dse.com.bd/companies              (name and sector per code)
//   https://www.cse.com.bd/company/listedcompanies (Chittagong board)
//
// The exchange's company directory gives each code its name and sector.
// Treasury bonds, corporate bonds (the PBOND codes), debentures and sukuk
// stay out. The closed-end mutual funds are listed and traded like shares,
// so they stay in as FUND. The rest are STOCK; no ETF is listed in Dhaka.
// BRAC EPL also trades on the Chittagong Stock Exchange (broker-list
// places). Its price page shows Dhaka only, so a kept code that the
// Chittagong directory also lists gets a second row there. Chittagong-only
// and SME codes are not on BRAC EPL's page and stay out. Every line is in
// taka. The page does not mark suspended codes. Five banks declared
// non-operational on 5 November 2025 (EXIM, First Security Islami, Global
// Islami, Social Islami, Union) are being merged into Sammilito Islami Bank;
// both exchanges halted their shares on 6 November 2025 until further notice
// and the central bank values them at zero, so they are left out.
//   https://en.prothomalo.com/business/local/jqzqvqbpxd
//
//   node brokers/bracepl/bracepl_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PRICES = "https://www.bracepl.com/brokerage/market/stockprice";
const DSE = "https://www.dse.com.bd/companies";
const CSE = "https://www.cse.com.bd/company/listedcompanies";
const DROP_SECTOR = new Set(["treasury bond", "corporate bond", "debenture"]);
const HALTED = new Set(["EXIMBANK", "FIRSTSBANK", "GIB", "SIBL", "UNIONBANK"]);

function clean(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// curl, not fetch: the Chittagong server does not send its intermediate
// certificate, which Node rejects and curl completes from the system store.
async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const { stdout } = await execFileAsync(
        "curl",
        ["-fsSL", "--compressed", "-m", "90", "-A", UA, "-H", "Accept: text/html", url],
        { maxBuffer: 50 * 1024 * 1024 },
      );
      if (stdout.includes("<")) return stdout;
      last = `empty page ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

// BRAC EPL table: serial, code, LTP, high, low, close, YCP, change, trades, value, volume.
function priceLines(html) {
  const start = html.indexOf('id="dataTables-example"');
  if (start < 0) throw new Error("price table not found");
  const table = html.slice(start, html.indexOf("</table>", start));
  return [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((match) => [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => clean(cell[1])))
    .filter((cells) => cells.length >= 11 && /^\d+$/.test(cells[0]));
}

// Dhaka directory card: code, name, sector.
function dhakaDirectory(html) {
  const card =
    /class="block flex-1 min-w-0" href="\/company\/([^"]+)"[\s\S]{0,1600}?font-semibold tracking-tight">([^<]+)<\/span>[\s\S]{0,900}?text-muted\)">([^<]*)<span class="hidden md:inline"> · <!-- -->([^<]+)<\/span>/g;
  const directory = new Map();
  for (const match of html.matchAll(card)) {
    directory.set(clean(match[2]).toUpperCase(), { name: clean(match[3]), sector: clean(match[4]) });
  }
  return directory;
}

function chittagongDirectory(html) {
  const codes = new Map();
  for (const match of html.matchAll(/<option value='([^'|]+)\|([^']*)'>\s*[^<|]+?\|\s*([^<]+)<\/option>/g)) {
    codes.set(clean(match[1]).toUpperCase(), { board: clean(match[2]), name: clean(match[3]) });
  }
  return codes;
}

const pricePage = await get(PRICES);
await sleep(500);
const dhaka = dhakaDirectory(await get(DSE));
await sleep(500);
const chittagong = chittagongDirectory(await get(CSE));

const lines = priceLines(pricePage);
if (lines.length < 550) throw new Error(`price page has ${lines.length} codes`);
if (Number(lines.at(-1)[0]) !== lines.length) throw new Error(`serials end at ${lines.at(-1)[0]}, parsed ${lines.length}`);
if (dhaka.size < 550) throw new Error(`Dhaka directory has ${dhaka.size} codes`);
if (chittagong.size < 300) throw new Error(`Chittagong directory has ${chittagong.size} codes`);

const rows = [];
const unknown = [];
for (const cells of lines) {
  const code = cells[1].toUpperCase();
  const listed = dhaka.get(code);
  if (!listed) {
    unknown.push(code);
    continue;
  }
  const sector = listed.sector.toLowerCase();
  if (DROP_SECTOR.has(sector) || /\b(sukuk|bonds?|debenture)\b/i.test(listed.name) || /SUKUK|PBOND/.test(code)) continue;
  if (HALTED.has(code)) continue;
  const type = sector === "mutual funds" ? "FUND" : "STOCK";
  const raw = [...cells.slice(1, 7), listed.name, listed.sector].join(" | ");
  rows.push({ query: code, ticker: code, name: listed.name, exchange: "Dhaka Stock Exchange", mic: "XDHA", currency: "BDT", type, isin: "", raw });
  if (chittagong.get(code)?.board === "Main") {
    rows.push({ query: code, ticker: code, name: listed.name, exchange: "Chittagong Stock Exchange", mic: "XCHG", currency: "BDT", type, isin: "", raw });
  }
}
if (unknown.length > 10) throw new Error(`codes missing from the Dhaka directory: ${unknown.join(" ")}`);

const dhakaRows = rows.filter((row) => row.mic === "XDHA");
if (dhakaRows.length < 350) throw new Error(`only ${dhakaRows.length} Dhaka rows`);
if (rows.length - dhakaRows.length < 300) throw new Error(`only ${rows.length - dhakaRows.length} Chittagong rows`);
for (const ticker of ["GP", "SQURPHARMA", "BRACBANK", "BATBC"]) {
  if (!dhakaRows.some((row) => row.ticker === ticker && row.type === "STOCK")) throw new Error(`${ticker} missing`);
}
if (dhakaRows.filter((row) => row.type === "FUND").length < 20) throw new Error("mutual funds were short");

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
// The shared lists file Bangladeshi codes under Dhaka (DSEBD) only, so
// stamping fills Dhaka rows. It leaves a FUND alone; a closed-end mutual
// fund's units are filed there too (etfs.csv), so they are looked up by code.
// The same code on the Chittagong board is the same share.
const stamped = stampRows(withoutObligations(rows));
const dhakaList = new Map();
for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
  for (const line of fs.readFileSync(new URL(file, import.meta.url), "utf8").split(/\r?\n/)) {
    const [code, place, isin] = line.split(",");
    if (place === "DSEBD" && /^BD[0-9A-Z]{10}$/.test(isin || "")) dhakaList.set(code.slice("DSEBD:".length), isin);
  }
}
for (const row of stamped) if (row.mic === "XDHA" && !row.isin && dhakaList.has(row.ticker)) row.isin = dhakaList.get(row.ticker);
const dhakaIsin = new Map(stamped.filter((row) => row.mic === "XDHA" && row.isin).map((row) => [row.ticker, row.isin]));
for (const row of stamped) if (row.mic === "XCHG" && !row.isin && dhakaIsin.has(row.ticker)) row.isin = dhakaIsin.get(row.ticker);
fs.writeFileSync(new URL("bracepl-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(counts, unknown.length ? { notInDirectory: unknown } : "");
