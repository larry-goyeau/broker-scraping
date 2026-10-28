// The OTC Markets lines a broker sells when it publishes no OTC list, read
// from OTC Markets' own stock screener (./moomoous_otc.mjs, headless Chrome;
// it refreshes this folder's screener cache). By default the four tiers with
// a public quote: OTCQX (1), OTCQB (10), OTCID (20) and Pink Limited (21);
// a broker that names its tiers passes them. Grey and Expert Market have no
// public quote and are never read.
//
// Kept as shares: common and ordinary shares, ADRs, New York registry
// shares, preferred shares, trust and partnership units (blank-check units
// out) and "Other Security Type" (CDIs, stapled securities, NVDRs); as ETF
// the "ETFs" lines (as ETN the "Structured Product" notes, iPath and the
// like, as ETF the others). Left out: warrants, rights, debt lines and
// "Fund" (mutual funds, not exchange-traded), and a symbol already in the
// broker's US exchange book. One row a title on "OTC Markets" (mic OTCM,
// USD). ISIN: the one ISIN the OTC rows of ../ibkrus, ../moomoous and
// ../webullus agree on (stampRows fills the rest from the shared lists).

import fs from "node:fs";
import { otcScreener } from "./moomoous_otc.mjs";

export const OTC_PUBLIC = ["1", "10", "20", "21"];

const OTC_TYPE = {
  "Common Stock": "STOCK",
  "Foreign Ordinary Shares": "STOCK",
  ADRs: "STOCK",
  "New York Registry Shs": "STOCK",
  "Preferred Stock": "STOCK",
  Units: "STOCK",
  "Other Security Type": "STOCK",
  ETFs: "ETF",
  "Structured Product": "ETF",
};
const BLANK_CHECK = /\b(ACQ|ACQUISITION|ACQSITIO|MERGER|SPAC)\b/i;
const DEBT = /\b\d+(\.\d+)?%?\s+(SR|SUB|NTS?|NOTES?|DEB)\b/i;
const NOTE = /\bETNs?\b|\bIPATH\b/i;
const SHARE_NAME = /\b(ADRS?|S\/ADR|SP\/ADR|U\/ADR|NY REG|NEW YORK REGISTRY|REGISTRY|FIBRA?|REIT)\b/i;

function otherOtcIsins() {
  const found = new Map();
  for (const folder of ["ibkrus", "moomoous", "webullus"]) {
    const file = new URL(`../${folder}/${folder}-parsed.json`, import.meta.url);
    if (!fs.existsSync(file)) continue;
    for (const row of JSON.parse(fs.readFileSync(file, "utf8"))) {
      if (!(row.mic === "OTCM" || /^OTC/i.test(row.exchange || "")) || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(row.isin || "")) continue;
      found.set(row.ticker, new Set([...(found.get(row.ticker) || []), row.isin]));
    }
  }
  return found;
}

// usRows: the broker's US exchange rows (their tickers are not written
// twice). Returns { rows, left, screener, summary }.
export async function otcBook(usRows = [], { markets = OTC_PUBLIC } = {}) {
  const screener = await otcScreener(markets);
  const listed = new Set(usRows.map((row) => row.ticker));
  const isins = otherOtcIsins();
  const rows = [];
  const left = {};
  const seen = new Set();
  for (const market of markets) {
    for (const stock of screener[market].stocks) {
      const symbol = String(stock.symbol || "").toUpperCase();
      const name = String(stock.name || "").replace(/\s+/g, " ").trim();
      const leave = (reason) => { left[reason] = (left[reason] || 0) + 1; };
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      let type = OTC_TYPE[stock.type];
      if (!type) { leave(`${stock.type || "untyped"} (not a share or ETF)`); continue; }
      if (stock.type === "Units" && BLANK_CHECK.test(name)) { leave("blank-check unit"); continue; }
      if (DEBT.test(name) && stock.type !== "Preferred Stock") { leave("debt line"); continue; }
      if (listed.has(symbol)) { leave("also listed on a US exchange"); continue; }
      if (type === "ETF" && SHARE_NAME.test(name)) type = "STOCK";
      else if (type === "ETF" && NOTE.test(name)) type = "ETN";
      const found = [...(isins.get(symbol) || [])];
      const isin = found.length === 1 ? found[0] : "";
      rows.push({
        query: isin || symbol,
        ticker: symbol,
        name,
        exchange: "OTC Markets",
        mic: "OTCM",
        currency: "USD",
        type,
        isin,
        raw: [symbol, name, `OTC ${stock.market}`, stock.type, stock.country, stock.caveatEmptor ? "Caveat Emptor" : ""].filter(Boolean).join(" | "),
      });
    }
  }
  if (markets.length === OTC_PUBLIC.length && rows.length < 8000) throw new Error(`only ${rows.length} OTC rows`);
  const summary = `OTC screener ${markets.map((market) => `${market}:${screener[market].count}@${screener[market].at.slice(0, 10)}`).join(" ")}, ${rows.length} kept, left out ${JSON.stringify(left)}`;
  return { rows, left, screener, summary };
}
