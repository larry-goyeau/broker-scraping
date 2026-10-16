// What Capital Alliance sells live in shares and ETFs, with no login.
// Atrad sends the order onto the Colombo Stock Exchange. The client
// places it. CAL does not print the codes. The exchange does.
// A voting share and a non-voting share stay. A preference share stays.
// A right, a warrant, a debenture and a closed-end fund unit stay out.
// No exchange-traded fund is in the list. Every line here is quoted in
// rupees.
//
//   https://cal.lk/equities/
//   https://cal.lk/atrad-user-guide/
//   https://www.cse.lk/api/allSecurityCode
//
//   node brokers/capitalalliance/capitalalliance_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { readFileSync } from "node:fs";

const LIST = "https://www.cse.lk/api/allSecurityCode";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const OUTPUT = new URL("capitalalliance-parsed.json", import.meta.url);
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);

// .N voting, .X non-voting, .P preference. .R right, .D debenture,
// .U closed-end fund unit, .W warrant.
const SHARE = new Set(["N", "X", "P"]);

function clean(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function kind(symbol) {
  const match = String(symbol || "").toUpperCase().match(/\.([A-Z])\d*$/);
  return match ? match[1] : "";
}

function isEtf(name) {
  return /\bETF\b|exchange traded fund/i.test(name || "");
}

function lkIsins() {
  const byTicker = new Map();
  const clashes = new Set();
  for (const file of [STOCKS, ETFS]) {
    const text = readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/).slice(1)) {
      if (!line) continue;
      const parts = line.split(",");
      if (parts.length < 4) continue;
      const isin = parts[2].trim().toUpperCase();
      const ticker = parts[0].split(":").pop().trim().toUpperCase();
      if (!isin.startsWith("LK") || !ticker) continue;
      const prev = byTicker.get(ticker);
      if (prev && prev !== isin) clashes.add(ticker);
      else byTicker.set(ticker, isin);
    }
  }
  for (const ticker of clashes) byTicker.delete(ticker);
  return byTicker;
}

const response = await fetch(LIST, {
  headers: { "User-Agent": UA, Accept: "application/json" },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Colombo answered ${response.status}`);
const board = await response.json();
if (!Array.isArray(board) || board.length < 200) throw new Error(`Colombo published ${board?.length || 0} codes`);

const isins = lkIsins();
const seen = new Set();
const results = [];
for (const row of board) {
  if (row.active != null && Number(row.active) !== 1) continue;
  const ticker = clean(row.symbol).toUpperCase();
  const name = clean(row.name);
  const share = kind(ticker);
  if (!ticker || !name) continue;
  if (share && !SHARE.has(share)) continue;
  if (/\bright\b/i.test(name)) continue;
  if (seen.has(ticker)) continue;
  seen.add(ticker);
  const type = isEtf(name) ? "ETF" : "STOCK";
  const isin = isins.get(ticker) || "";
  results.push({
    query: isin || ticker,
    ticker,
    name,
    exchange: "CSE",
    currency: "LKR",
    type,
    raw: [ticker, name, "CSE", "LKR", type].join(" "),
    isin,
  });
}
results.sort((left, right) => left.ticker.localeCompare(right.ticker));

if (results.length < 250) throw new Error(`only ${results.length} Colombo shares stayed`);
if (!results.some((row) => row.ticker === "ABAN.N0000" && row.type === "STOCK")) {
  throw new Error("ABAN.N0000 was not a Colombo share");
}
if (results.some((row) => /\.R\d+$/.test(row.ticker) || row.ticker.endsWith(".D0000") || row.ticker.endsWith(".U0000"))) {
  throw new Error("a right, a debenture or a fund unit stayed in the file");
}

const stamped = stampRows(withoutObligations(results));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const withIsin = stamped.filter((row) => row.isin).length;
const etf = stamped.filter((row) => row.type === "ETF").length;
console.error(`${stamped.length} listings, ${withIsin} with an ISIN, ${etf} ETF`);
