// What Toro sells in shares and exchange-traded funds, with no login.
// Toro prints no list of its own. The fee page says brokerage is zero
// on any exchange asset, and names shares and ETFs, then every other
// Bovespa asset. A foreign share or ETF is the B3 certificate, not the
// listing abroad. The names are the exchange's own instrument file.
//
// The cash line is the one a customer trades. The odd lot and the block
// lot are the same share under another code, so they stay out. A listed
// property fund, a right, a warrant, a subscription receipt and an index
// stay out. A receipt of an ETF is an ETF.
//
//   https://www.toroinvestimentos.com.br/info/custos
//   https://arquivos.b3.com.br/tabelas/InstrumentsConsolidated
//
//   node brokers/toro/toro_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const REQUEST = "https://arquivos.b3.com.br/api/download/requestname";
const DOWNLOAD = "https://arquivos.b3.com.br/api/download";
const PAGE = "https://arquivos.b3.com.br/tabelas/InstrumentsConsolidated";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isinOf(value) {
  const text = clean(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function saoPauloDay(daysAgo) {
  const when = new Date(Date.now() - daysAgo * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}

async function getText(url, headers) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, ...headers },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.status === 404) return null;
      if (response.status === 429 || response.status >= 500) {
        last = new Error(`${url} answered ${response.status}`);
        await sleep(400 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      return { text: new TextDecoder("iso-8859-1").decode(bytes), response };
    } catch (error) {
      last = error;
      if (attempt === 3) break;
      await sleep(400 * (attempt + 1));
    }
  }
  throw last;
}

async function instrumentFile() {
  for (let daysAgo = 0; daysAgo < 8; daysAgo += 1) {
    const date = saoPauloDay(daysAgo);
    const asked = await getText(`${REQUEST}?fileName=InstrumentsConsolidated&date=${date}`, {
      Accept: "application/json",
      Referer: PAGE,
    });
    if (!asked) continue;
    const meta = JSON.parse(asked.text);
    if (!meta.token) continue;
    const cookies = (asked.response.headers.getSetCookie?.() || [])
      .map((row) => row.split(";")[0])
      .join("; ");
    const file = await getText(`${DOWNLOAD}?token=${encodeURIComponent(meta.token)}`, {
      Referer: PAGE,
      Cookie: cookies,
    });
    if (!file?.text.includes("TckrSymb")) continue;
    return { date, text: file.text };
  }
  throw new Error("B3 published no instrument file");
}

function kindOf(category, cfi, name) {
  const cat = clean(category).toUpperCase();
  const etp = /\bETPs?\b/i.test(name) && !/\bETFs?\b/i.test(name);
  if (cat.startsWith("ETF")) return etp ? "ETP" : "ETF";
  // A receipt of a foreign fund. The code is the exchange's own mark
  // for that receipt, as against a receipt of a share.
  if (cat === "BDR" && cfi === "EDMXPR") return etp ? "ETP" : "ETF";
  if (cat === "SHARES" || cat === "UNIT" || cat === "BDR") return "STOCK";
  return "";
}

function stillListed(end, reportDay) {
  const day = clean(end);
  if (!day || day === "9999-12-31") return true;
  return day > reportDay;
}

const { date, text } = await instrumentFile();
const lines = text.split(/\r?\n/).filter((line) => line.trim());
const headerAt = lines.findIndex((line) => line.startsWith("RptDt;"));
if (headerAt < 0) throw new Error("the B3 file has no header");
const header = lines[headerAt].split(";");
const column = Object.fromEntries(header.map((name, index) => [name, index]));
for (const name of ["TckrSymb", "SctyCtgyNm", "SgmtNm", "MktNm", "ISIN", "TradgCcy", "CrpnNm", "CFICd", "TradgEndDt"]) {
  if (column[name] == null) throw new Error(`the B3 file has no ${name}`);
}

const listed = [];
const seen = new Set();
let leftOut = 0;

for (const line of lines.slice(headerAt + 1)) {
  const cell = line.split(";");
  if (cell.length < header.length) continue;
  if (cell[column.MktNm] !== "EQUITY-CASH" || cell[column.SgmtNm] !== "CASH") continue;
  const ticker = clean(cell[column.TckrSymb]).toUpperCase();
  const name = clean(cell[column.CrpnNm]);
  const type = kindOf(cell[column.SctyCtgyNm], clean(cell[column.CFICd]), name);
  if (!ticker || !name || !type) {
    leftOut += 1;
    continue;
  }
  if (!stillListed(cell[column.TradgEndDt], date)) {
    leftOut += 1;
    continue;
  }
  if (seen.has(ticker)) throw new Error(`${ticker} is listed twice`);
  seen.add(ticker);
  const currency = clean(cell[column.TradgCcy]).toUpperCase() || "BRL";
  const isin = isinOf(cell[column.ISIN]);
  listed.push({
    query: ticker,
    ticker,
    name,
    exchange: "B3",
    currency,
    type,
    isin,
    raw: [ticker, name, "B3", currency, isin, type].filter(Boolean).join(" "),
  });
}

listed.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  return left.ticker.localeCompare(right.ticker);
});

for (const ticker of ["PETR4", "VALE3", "BOVA11", "IVVB11", "AAPL34", "BIVB39"]) {
  if (!listed.some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
}
for (const ticker of ["HGLG11", "PETR4F", "PETR4M"]) {
  if (listed.some((row) => row.ticker === ticker)) throw new Error(`${ticker} was kept`);
}
if (listed.find((row) => row.ticker === "BOVA11")?.type !== "ETF") throw new Error("BOVA11 is not an ETF");
if (listed.find((row) => row.ticker === "BIVB39")?.type !== "ETF") throw new Error("BIVB39 is not an ETF");
if (listed.find((row) => row.ticker === "AAPL34")?.type !== "STOCK") throw new Error("AAPL34 is not a share");

const shares = listed.filter((row) => row.type === "STOCK").length;
const etfs = listed.filter((row) => row.type === "ETF").length;
if (shares < 1500) throw new Error(`only ${shares} shares`);
if (etfs < 200) throw new Error(`only ${etfs} ETFs`);

const kept = stampRows(withoutObligations(listed));
fs.writeFileSync(new URL("toro-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byType = new Map();
for (const row of kept) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${kept.length} listings from the B3 file of ${date} ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`
);
console.error(`${leftOut} cash lines left out`);
if (kept.length < listed.length) console.error(`${listed.length - kept.length} bonds left out`);
