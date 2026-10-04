// What Choice sells as a share, an ETF, an ETC, an ETN or a coin. The
// public scrip master is the file the trading API routes. Futures,
// options, currency, commodities, spots and indices stay out. A mutual
// fund scheme (NSE series MF) stays out. The file dated 28 September
// 2026 names no ETC, no ETN and no coin; a later file that does is kept.
//
// https://scripmaster.choiceindia.com/scripmaster/SCRIP_MASTER_DDMonYYYY.csv
//   Cash is exchange NSE or BSE. The ticker is Symbol, the name SecDesc.
//   NSE series EQ, BE, BZ, SM, ST and SZ are shares, and so are the BSE
//   groups A, B, T, XT, X, Z, ZP, M, MT, P, TS, E and MS. An ETF is an
//   INF line, including the ones filed in BSE group F. The rest of group
//   F is commercial paper and debentures. Rights, InvIT and REIT stay out.
//
//   node brokers/choice/choice_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { parseCsv, isinOf } from "../../indianCash.mjs";
import fs from "node:fs";

const STEM = "https://scripmaster.choiceindia.com/scripmaster/SCRIP_MASTER_";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const NSE = new Set(["EQ", "BE", "BZ", "SM", "ST", "SZ"]);
const BSE = new Set(["A", "B", "T", "XT", "X", "Z", "ZP", "M", "MT", "P", "TS", "E", "MS"]);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function stamp(daysBack) {
  const when = new Date(Date.now() - daysBack * 86400000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(when);
  const day = parts.find((part) => part.type === "day").value;
  const month = MONTHS[Number(parts.find((part) => part.type === "month").value) - 1];
  const year = parts.find((part) => part.type === "year").value;
  return `${day}${month}${year}`;
}

async function textOf() {
  let last = "";
  for (let daysBack = 0; daysBack < 8; daysBack += 1) {
    const url = `${STEM}${stamp(daysBack)}.csv`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000);
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": UA, Accept: "text/csv" },
          signal: controller.signal,
        });
        if (response.status === 404 || response.status === 403) {
          last = `${response.status} ${url}`;
          break;
        }
        if (response.ok) return response.text();
        last = `${response.status} ${url}`;
      } catch (error) {
        last = String(error.message || error);
      } finally {
        clearTimeout(timer);
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw new Error(last);
}

const skipped = new Map();
function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

function kindOf(series, isin, name) {
  const text = `${series} ${name}`.toUpperCase();
  if (series === "CRYPTO" || /\bCRYPTO\b/.test(text)) return "CRYPTO";
  if (series === "ETN" || /\bETN\b/.test(text)) return "ETN";
  if (series === "ETC" || /\bETC\b/.test(text)) return "ETC";
  if (isin.startsWith("INF")) return "ETF";
  return "";
}

const rows = [];
const seen = new Set();
for (const cell of parseCsv(await textOf())) {
  const exchange = String(cell.Exchange || "").trim().toUpperCase();
  if (exchange !== "NSE" && exchange !== "BSE") {
    skip(exchange ? "contract" : "index");
    continue;
  }
  const series = String(cell.Series || "").trim().toUpperCase();
  const isin = isinOf(cell.ISIN);
  const name = String(cell.SecDesc || cell.Symbol || "").replace(/\s+/g, " ").trim();
  const tagged = kindOf(series, isin, name);
  const share = (exchange === "NSE" && NSE.has(series)) || (exchange === "BSE" && BSE.has(series));
  const listed = tagged === "ETF" || tagged === "ETC" || tagged === "ETN" || tagged === "CRYPTO";
  if (!listed && !share) {
    skip("not a share");
    continue;
  }
  if (!listed && !isin.startsWith("INE") && !isin.startsWith("IN9")) {
    skip("not a share");
    continue;
  }
  const ticker = String(cell.Symbol || "").trim().toUpperCase();
  if (!ticker) throw new Error("unread ticker");
  if (!isin) throw new Error(`unread isin ${ticker}`);
  const key = `${exchange}|${ticker}`;
  if (seen.has(key)) throw new Error(`repeated ${key}`);
  seen.add(key);
  const type = listed ? tagged : "EQ";
  rows.push({
    query: isin,
    ticker,
    name: name || ticker,
    exchange,
    currency: "INR",
    type,
    raw: [ticker, name, exchange, "INR", series, isin].filter(Boolean).join(" "),
    isin,
  });
}

rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

fs.writeFileSync(new URL("choice-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const byBook = new Map();
for (const row of rows) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
const instruments = new Set(rows.map((row) => row.isin)).size;
console.error(
  `${rows.length} listings over ${instruments} instruments ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})` +
    (skipped.size ? `; left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "")
);
