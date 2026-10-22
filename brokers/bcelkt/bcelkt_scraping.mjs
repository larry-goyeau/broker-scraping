// What BCEL-KT Securities sells in shares, with no login. BCEL-KT is a
// member of the Lao Securities Exchange and trades only that market. Its
// book is the LSX share list. The broker's homepage prints a price board
// with one line per listed share. The board gives a short code only, so
// the name and ISIN come from the exchange's own issue list.
//
// Every board line must match an LSX issue, and every LSX issue must be on
// the board, except a halted one. A mismatch throws. The board still prints
// two older codes: "LCC" is LA3000070000, renamed LCTC on the exchange, and
// "JBD" is the exchange's JDB. The exchange code is kept as the ticker. LSX
// lists no ETF. Bonds sit in a separate LSX list and stay out. Every price
// is in kip.
//
// The board keeps a frozen line for a share the exchange has halted, so the
// exchange's own sign list decides. A share with an "H" (trading halt) sign
// in force today is dropped when the halt is open-ended (end date 9999) or
// long (planned for, or already running, more than 30 days). The one- to
// five-day disclosure halts stay, and the Alert, Caution, Warning and NCD
// signs, which do not stop trading, are ignored. Today that drops LCTC,
// halted since 1 December 2024 under a rehabilitation plan. The sign list
// failing or changing shape throws.
//
// Trading fees are published on the trading page: 0.34% a side at the
// counter, 0.306% a side through the online Home Trading System.
//
//   https://www.bcel-kt.com/index.php?r=site/index
//   https://www.bcel-kt.com/index.php?id=11&r=site%2Fdisplay
//   http://lsx.com.la/api-server/api/stock/issue-list
//   http://lsx.com.la/api-server/api/sign-symbol
//   http://lsx.com.la/en/disclosure/company-info
//
//   node brokers/bcelkt/bcelkt_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const exec = promisify(execFile);
const BOARD = "https://www.bcel-kt.com/index.php?r=site/index";
const ISSUES = "http://lsx.com.la/api-server/api/stock/issue-list";
const SIGNS = "http://lsx.com.la/api-server/api/sign-symbol";
const LONG_HALT_DAYS = 30;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
// Board code -> current LSX code.
const OLD_CODES = { LCC: "LCTC", JBD: "JDB" };

async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const { stdout } = await exec("curl", ["-fsSL", "--max-time", "45", "-A", UA, url], { maxBuffer: 8_000_000, encoding: "utf8" });
      return stdout;
    } catch (error) {
      last = String(error.stderr || error.message || error).trim();
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last || url);
}

const clean = (text) => String(text || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// The board is the table headed "ກະດານລາຄາຮຸ້ນ" (share price board).
function boardCodes(html) {
  const start = html.indexOf("ກະດານລາຄາຮຸ້ນ");
  if (start < 0) throw new Error("BCEL-KT homepage has no price board");
  const table = html.slice(start, html.indexOf("</table>", start));
  const codes = [];
  for (const row of table.match(/<tr[\s\S]*?<\/tr>/g) || []) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => clean(match[1]));
    if (cells.length !== 3) continue;
    const code = cells[0].toUpperCase();
    if (!/^[A-Z][A-Z-]{1,9}$/.test(code) || !/^\d[\d,.]*$/.test(cells[1])) throw new Error(`unreadable board line ${JSON.stringify(cells)}`);
    codes.push(code);
  }
  if (codes.length < 10) throw new Error(`BCEL-KT board printed ${codes.length} shares`);
  return codes;
}

function lsxIssues(text) {
  const rows = JSON.parse(text)?.data;
  if (!Array.isArray(rows) || rows.length < 10) throw new Error(`LSX printed ${rows?.length ?? 0} issues`);
  const issues = new Map();
  for (const row of rows) {
    const ticker = String(row.INameEnglishAbbrev || "").trim();
    const isin = String(row.ICode || "").trim().toUpperCase();
    const name = String(row.INameEnglish || "").replace(/\s+/g, " ").trim();
    if (!ticker || !name) throw new Error(`unreadable LSX issue ${JSON.stringify(row)}`);
    if (!/^LA[A-Z0-9]{10}$/.test(isin)) throw new Error(`no ISIN for ${ticker}`);
    if (issues.has(ticker.toUpperCase())) throw new Error(`repeated LSX code ${ticker}`);
    issues.set(ticker.toUpperCase(), { ticker, isin, name, local: String(row.IName || "").trim() });
  }
  return issues;
}

const dayNumber = (yyyymmdd) => Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8)) / 86_400_000;

// ISIN -> reason, for every share under a long or open-ended LSX trading halt
// in force today (Vientiane time).
function longHalts(text, issues) {
  const rows = JSON.parse(text)?.data;
  if (!Array.isArray(rows) || !rows.length) throw new Error("LSX sign list is empty or changed shape");
  const known = new Set([...issues.values()].map((issue) => issue.isin));
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "");
  const halted = new Map();
  for (const row of rows) {
    const isin = String(row.iCode || "").trim().toUpperCase();
    const sign = String(row.shortSymbolName || "").trim();
    const from = String(row.fromDate || "");
    const to = String(row.toDate || "");
    if (!isin || !sign || !/^\d{8}$/.test(from) || !/^\d{8}$/.test(to)) throw new Error(`unreadable LSX sign ${JSON.stringify(row)}`);
    if (sign !== "H" || Number(row.delFlag)) continue;
    if (!known.has(isin)) continue;
    if (from > today || to < today) continue;
    const openEnded = to >= "99990000";
    const planned = openEnded ? Infinity : dayNumber(to) - dayNumber(from);
    const running = dayNumber(today) - dayNumber(from);
    if (openEnded || planned > LONG_HALT_DAYS || running > LONG_HALT_DAYS) {
      halted.set(isin, `trading halt since ${from}${openEnded ? ", open-ended" : ` until ${to}`}`);
    }
  }
  return halted;
}

const codes = boardCodes(await getText(BOARD));
const issues = lsxIssues(await getText(ISSUES));
const halted = longHalts(await getText(SIGNS), issues);
const listings = [];
const used = new Set();
const dropped = [];
for (const code of codes) {
  const issue = issues.get(OLD_CODES[code] || code);
  if (!issue) throw new Error(`board code ${code} is not an LSX issue`);
  if (used.has(issue.isin)) throw new Error(`board repeats ${code}`);
  used.add(issue.isin);
  if (halted.has(issue.isin)) {
    dropped.push(`${issue.ticker} (${halted.get(issue.isin)})`);
    continue;
  }
  listings.push({
    query: issue.ticker,
    ticker: issue.ticker,
    name: issue.name,
    exchange: "Lao Securities Exchange",
    currency: "LAK",
    type: "STOCK",
    isin: issue.isin,
    mic: "XLAO",
    raw: [code, issue.ticker, issue.name, issue.local, "Lao Securities Exchange", issue.isin, "STOCK"].join(" "),
  });
}
const missing = [...issues.values()].filter((issue) => !used.has(issue.isin) && !halted.has(issue.isin)).map((issue) => issue.ticker);
if (missing.length) throw new Error(`LSX issues missing from the BCEL-KT board: ${missing.join(", ")}`);

listings.sort((left, right) => left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("bcelkt-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
console.error(`${listings.length} listings (${listings.length} STOCK, ${listings.length} Lao Securities Exchange); dropped ${dropped.length} under a long LSX trading halt${dropped.length ? `: ${dropped.join(", ")}` : ""}`);
