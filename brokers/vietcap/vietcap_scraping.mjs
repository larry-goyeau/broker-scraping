// What Vietcap sells in shares and exchange-traded funds, with no login.
// The public price board is the book. Each line names its board and a
// type. Shares are STOCK and funds are ETF. A line whose board is
// DELISTED is not sold. Covered warrants, bonds, futures, unit trusts
// and debentures are other products and are not written. The board
// calls Ho Chi Minh HSX; the catalogue keeps the name HOSE. Vietcap
// prints no ISIN. The Vietnamese number is the ticker, padded on the
// left with zeros to nine characters, with the country in front and
// the ISO check digit behind.
//
//   https://trading.vietcap.com.vn/api/price/symbols/getAll
//   https://trading.vietcap.com.vn/api/price/symbols/getByGroup?group=HOSE
//
//   node brokers/vietcap/vietcap_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import dns from "node:dns";
import fs from "node:fs";

dns.setDefaultResultOrder("ipv4first");

const LIST = "https://trading.vietcap.com.vn/api/price/symbols/getAll";
const GROUP = "https://trading.vietcap.com.vn/api/price/symbols/getByGroup?group=";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  Accept: "application/json",
  Referer: "https://trading.vietcap.com.vn/",
  Origin: "https://trading.vietcap.com.vn",
};
const BOARDS = { HSX: "HOSE", HNX: "HNX", UPCOM: "UPCOM" };
const SOLD = { STOCK: "STOCK", ETF: "ETF" };
const LEFT_OUT = {
  CW: "covered warrants",
  BOND: "bonds",
  FU: "futures",
  UNIT_TRUST: "unit trusts",
  DEBENTURE: "debenture",
};
const CHECKS = ["HOSE", "HNX", "UPCOM", "ETF"];

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(45_000) });
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
  return body.map((line) => String(line?.symbol || "").trim().toUpperCase()).filter(Boolean);
}

// The body is country plus a nine-character NSIN. Doubling starts at the
// rightmost digit, the same rule as an ISIN built from a CUSIP.
function isinOf(ticker) {
  if (!/^[A-Z0-9]{1,9}$/.test(ticker)) throw new Error(`no ISIN for ${ticker}`);
  const body = `VN${ticker.padStart(9, "0")}`;
  const digits = [...body]
    .map((character) => (/[0-9]/.test(character) ? character : String(character.charCodeAt(0) - 55)))
    .join("");
  let sum = 0;
  let double = true;
  for (let position = digits.length - 1; position >= 0; position -= 1) {
    let digit = Number(digits[position]);
    if (double) digit = digit > 4 ? digit * 2 - 9 : digit * 2;
    sum += digit;
    double = !double;
  }
  return `${body}${(10 - (sum % 10)) % 10}`;
}

const book = await getJson(LIST);
if (!Array.isArray(book) || !book.length) throw new Error(`${LIST} has no listings`);

const rows = [];
const seen = new Set();
const leftOut = new Map();
const aside = { HOSE: [], HNX: [], UPCOM: [] };
let delisted = 0;
for (const line of book) {
  const kind = String(line.type || "").trim().toUpperCase();
  const type = SOLD[kind];
  const board = String(line.board || "").trim().toUpperCase();
  const ticker = String(line.symbol || "").trim().toUpperCase();
  if (!type) {
    if (!LEFT_OUT[kind]) throw new Error(`unknown type ${kind} on ${ticker || line.symbol}`);
    leftOut.set(kind, (leftOut.get(kind) || 0) + 1);
    if (kind === "UNIT_TRUST" && board !== "DELISTED") {
      const exchange = BOARDS[board];
      if (!exchange) throw new Error(`${ticker} is on ${board || "no board"}`);
      aside[exchange].push(ticker);
    }
    continue;
  }
  if (board === "DELISTED") {
    delisted += 1;
    continue;
  }
  const exchange = BOARDS[board];
  const name = String(line.organName || line.enOrganName || "").replace(/\s+/g, " ").trim();
  if (!ticker || !name) throw new Error(`unreadable listing ${JSON.stringify(line.symbol)}`);
  if (!exchange) throw new Error(`${ticker} is on ${board || "no board"}`);
  const isin = isinOf(ticker);
  if (seen.has(ticker) || seen.has(isin)) throw new Error(`repeated ${ticker} ${isin}`);
  seen.add(ticker);
  seen.add(isin);
  rows.push({
    query: ticker,
    ticker,
    name,
    exchange,
    currency: "VND",
    type,
    isin,
    raw: [ticker, name, exchange, isin, type].join(" "),
  });
}

for (const group of CHECKS) {
  const url = `${GROUP}${group}`;
  const listed = new Set(codesOf(await getJson(url), url));
  const sold = new Set(
    group === "ETF"
      ? rows.filter((row) => row.type === "ETF").map((row) => row.ticker)
      : [
          ...rows.filter((row) => row.exchange === group && row.type === "STOCK").map((row) => row.ticker),
          ...(group === "HOSE" ? rows.filter((row) => row.type === "ETF").map((row) => row.ticker) : []),
          ...aside[group],
        ]
  );
  const extra = [...listed].filter((code) => !sold.has(code));
  const missing = [...sold].filter((code) => !listed.has(code));
  if (extra.length || missing.length) {
    throw new Error(`${group} does not match the book: extra ${extra.slice(0, 8).join(", ") || "none"}; missing ${missing.slice(0, 8).join(", ") || "none"}`);
  }
}

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("vietcap-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const byType = new Map();
for (const row of rows) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const skipped = [
  ...(delisted ? [`${delisted} delisted`] : []),
  ...[...leftOut].map(([kind, count]) => `${count} ${LEFT_OUT[kind]}`),
].join(", ");
console.error(
  `${rows.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}). Left out: ${skipped || "none"}.`
);
