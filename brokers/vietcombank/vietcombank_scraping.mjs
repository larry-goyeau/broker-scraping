// What Vietcombank sells in shares and exchange-traded funds,
// with no login. The public price board is the book. Ho Chi Minh, Hanoi
// and UPCOM are three calls. A line marked as a fund is an ETF; the rest
// on those boards are shares. The board prints the ticker and the floor,
// not the company name, so the name is the ticker. Covered warrants,
// bonds, futures and odd-lot views are other products and are not written.
// Vietcombank prints no ISIN. The Vietnamese number is the ticker, padded
// on the left with zeros to nine characters, with the country in front and
// the ISO check digit behind.
//
//   https://invest.vcbs.com.vn/#/price/bang-gia/hsx
//   https://priceboard.vcbs.com.vn/
//
//   node brokers/vietcombank/vietcombank_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const HUB = "https://priceboard.vcbs.com.vn/PriceBoard/signalr";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
// The trading app calls Ho Chi Minh HSX. The catalogue keeps the name HOSE.
const BOARDS = [
  { market: "mk-11", exchange: "HOSE", floor: "10" },
  { market: "mk-12", exchange: "HNX", floor: "02" },
  { market: "mk-13", exchange: "UPCOM", floor: "04" },
];
const STOCK = "2";
const ETF = "3";

async function board(market) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const connectionData = JSON.stringify([{ name: "pbhub" }]);
      const negotiate = await fetch(
        `${HUB}/negotiate?clientProtocol=1.5&connectionData=${encodeURIComponent(connectionData)}`,
        { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) }
      );
      if (!negotiate.ok) throw new Error(`${negotiate.status} negotiate`);
      const cookie = negotiate.headers.get("set-cookie") || "";
      const token = (await negotiate.json()).ConnectionToken;
      if (!token) throw new Error("the price board gave no session");
      const common = `transport=longPolling&clientProtocol=1.5&connectionToken=${encodeURIComponent(token)}&connectionData=${encodeURIComponent(connectionData)}`;
      const payload = JSON.stringify({
        H: "pbhub",
        M: "GetAllStocks",
        A: ["", 0, false, true, "", market, false, true, "", false, false, "", false, ""],
        I: 1,
      });
      const sent = await fetch(`${HUB}/send?${common}`, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          Cookie: cookie,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `data=${encodeURIComponent(payload)}`,
        signal: AbortSignal.timeout(45_000),
      });
      if (!sent.ok) throw new Error(`${sent.status} ${market}`);
      const body = await sent.json();
      const lines = body?.R?.pb?.f;
      if (!Array.isArray(lines) || !lines.length) throw new Error(`${market} has no rows`);
      return lines.map((line) => (typeof line === "string" ? JSON.parse(line) : line));
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
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

const rows = [];
const seen = new Set();
for (const boardSpec of BOARDS) {
  const listed = await board(boardSpec.market);
  for (const line of listed) {
    const ticker = String(line.A || "").trim().toUpperCase();
    const floor = String(line.FC || "");
    const status = String(line.ST || "");
    if (!ticker) throw new Error(`${boardSpec.exchange} has a row with no ticker`);
    if (floor !== boardSpec.floor) throw new Error(`${ticker} is on floor ${floor || "none"}, not ${boardSpec.exchange}`);
    const type = status === ETF ? "ETF" : status === STOCK ? "STOCK" : "";
    if (!type) throw new Error(`${ticker} has status ${status || "none"}`);
    const isin = isinOf(ticker);
    if (seen.has(ticker) || seen.has(isin)) throw new Error(`repeated ${ticker} ${isin}`);
    seen.add(ticker);
    seen.add(isin);
    rows.push({
      query: ticker,
      ticker,
      name: ticker,
      exchange: boardSpec.exchange,
      currency: "VND",
      type,
      isin,
      raw: [ticker, boardSpec.exchange, isin, type].join(" "),
    });
  }
  console.error(`${boardSpec.exchange}: ${listed.length}`);
}

const vic = rows.find((row) => row.ticker === "VIC");
if (!vic || vic.exchange !== "HOSE" || vic.type !== "STOCK") throw new Error("Vingroup was not on HOSE");
const vn30 = rows.find((row) => row.ticker === "E1VFVN30");
if (!vn30 || vn30.exchange !== "HOSE" || vn30.type !== "ETF") throw new Error("E1VFVN30 was not an ETF");

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(
  new URL("vietcombank-parsed.json", import.meta.url),
  JSON.stringify(stampRows(withoutObligations(rows)), null, 2)
);

const byType = new Map();
for (const row of rows) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${rows.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`
);
