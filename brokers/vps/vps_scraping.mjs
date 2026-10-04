// What VPS sells in shares and exchange-traded funds, with no login.
// The public price board is the book. Each line names its board and a
// type. Shares are S and funds are E. Covered warrants (W), bonds (T)
// and closed-end fund certificates (U) are other products and are not
// written. The quote feed on the same host prints the ISIN as symCode.
// The four board lists are a check: they must be the same codes.
//
//   https://bgapidatafeed.vps.com.vn/getlistallstock
//   https://bgapidatafeed.vps.com.vn/getliststockdata/VNM,FPT
//   https://bgapidatafeed.vps.com.vn/getlistckindex/hose
//
//   node brokers/vps/vps_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import dns from "node:dns";
import fs from "node:fs";

dns.setDefaultResultOrder("ipv4first");

const FEED = "https://bgapidatafeed.vps.com.vn";
const LIST = `${FEED}/getlistallstock`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const SOLD = { S: "STOCK", E: "ETF" };
const LEFT_OUT = { W: "warrants", T: "bonds", U: "closed-end funds" };
const CHECKS = [
  ["hose", "HOSE", "STOCK"],
  ["hnx", "HNX", "STOCK"],
  ["upcom", "UPCOM", "STOCK"],
  ["hsx_e", "HOSE", "ETF"],
];

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function codesOf(body, url) {
  if (!Array.isArray(body)) throw new Error(`${url} is not a list`);
  return body.map((code) => String(code || "").trim().toUpperCase()).filter(Boolean);
}

const book = await getJson(LIST);
if (!Array.isArray(book) || !book.length) throw new Error(`${LIST} has no listings`);

const rows = [];
const seen = new Set();
const leftOut = new Map();
for (const line of book) {
  const kind = String(line.type || "").trim().toUpperCase();
  const type = SOLD[kind];
  if (!type) {
    if (!LEFT_OUT[kind]) throw new Error(`unknown type ${kind} on ${line.stock_code}`);
    leftOut.set(kind, (leftOut.get(kind) || 0) + 1);
    continue;
  }
  const ticker = String(line.stock_code || "").trim().toUpperCase();
  const exchange = String(line.post_to || "").trim().toUpperCase();
  const name = String(line.name_vn || line.name_en || "").replace(/\s+/g, " ").trim();
  if (!ticker || !name) throw new Error(`unreadable listing ${JSON.stringify(line.stock_code)}`);
  if (exchange !== "HOSE" && exchange !== "HNX" && exchange !== "UPCOM") {
    throw new Error(`${ticker} is on ${exchange || "no board"}`);
  }
  if (seen.has(ticker)) throw new Error(`repeated ${ticker}`);
  seen.add(ticker);
  rows.push({ ticker, name, exchange, type });
}

for (const [path, exchange, type] of CHECKS) {
  const url = `${FEED}/getlistckindex/${path}`;
  const listed = new Set(codesOf(await getJson(url), url));
  const sold = new Set(rows.filter((row) => row.exchange === exchange && row.type === type).map((row) => row.ticker));
  const extra = [...listed].filter((code) => !sold.has(code));
  const missing = [...sold].filter((code) => !listed.has(code));
  if (path === "hsx_e") {
    const offHose = rows.filter((row) => row.type === "ETF" && row.exchange !== "HOSE").map((row) => row.ticker);
    if (offHose.length) missing.push(...offHose);
  }
  if (extra.length || missing.length) {
    throw new Error(`${path} does not match the book: extra ${extra.slice(0, 8).join(", ") || "none"}; missing ${missing.slice(0, 8).join(", ") || "none"}`);
  }
}

const isin = new Map();
let pending = rows.map((row) => row.ticker);
for (let round = 0; round < 4 && pending.length; round += 1) {
  const still = [];
  for (let start = 0; start < pending.length; start += 80) {
    const slice = pending.slice(start, start + 80);
    const url = `${FEED}/getliststockdata/${slice.join(",")}`;
    let body;
    try {
      body = await getJson(url);
    } catch {
      still.push(...slice);
      continue;
    }
    if (!Array.isArray(body)) {
      still.push(...slice);
      continue;
    }
    const got = new Set();
    for (const quote of body) {
      const code = String(quote.sym || "").trim().toUpperCase();
      const codeIsin = String(quote.symCode || "").trim().toUpperCase();
      if (!code || !slice.includes(code)) continue;
      if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(codeIsin)) throw new Error(`no ISIN for ${code}`);
      isin.set(code, codeIsin);
      got.add(code);
    }
    for (const code of slice) if (!got.has(code)) still.push(code);
  }
  pending = still;
  if (pending.length) await new Promise((resolve) => setTimeout(resolve, 400 * (round + 1)));
}
if (pending.length) throw new Error(`no quote for ${pending.slice(0, 12).join(", ")}`);

const listings = rows.map((row) => ({
  query: row.ticker,
  ticker: row.ticker,
  name: row.name,
  exchange: row.exchange,
  currency: "VND",
  type: row.type,
  isin: isin.get(row.ticker),
  raw: [row.ticker, row.name, row.exchange, isin.get(row.ticker), row.type].join(" "),
}));
listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("vps-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));

const byType = new Map();
for (const row of listings) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const skipped = [...leftOut].map(([kind, count]) => `${count} ${LEFT_OUT[kind]}`).join(", ");
console.error(
  `${listings.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}). Left out: ${skipped || "none"}.`
);
