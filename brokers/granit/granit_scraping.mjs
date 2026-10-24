// What Gránit Bank (Hungary) sells on the Budapest Stock Exchange (BÉT),
// with no login. The bank's shares page lists every BÉT share it takes
// orders on, in two columns (premium and standard category), with the
// currency of each:
//
//   https://granitbank.hu/tajekoztatok-es-nyilatkozatok/reszvenyek
//   "A Budapesti Értéktőzsde standard és prémium kategóriájában forgalmazott
//    összes részvényre adhat vételi vagy eladási megbízást:"
//   (orders can be placed on all shares traded in the BÉT standard and
//   premium categories), then the table "Részvény - PRÉMIUM / Devizanem /
//   Részvény - Standard / Devizanem".
//
// That table is the catalogue: one place, the Budapest Stock Exchange
// (XBUD), shares only. No ETF, no Xtend (SME) share, no BETa (foreign)
// share and no other market is offered. The June 2025 article that
// broker-list.json cites says the same shares are traded in the Gránit app:
//   https://granitbank.hu/aktualis/2025/06/19/egyre-tobben-intezik-befekteteseiket-a-mobiljukon
//
// Fees (Kondíciós lista, in force from 2026-10-01): BÉT premium and
// standard shares 0.5% (min. 349 Ft / 1 EUR / 1 USD) in the Gránit App,
// 0.34% under a promotion until 2026-12-31:
//   https://granitbank.hu/tajekoztatok-es-nyilatkozatok/befektetesi-szolgaltatasok
//
// The bank's page names the BÉT code only. The ISIN comes from BÉT's own
// MiFID II pre-trade table (its "name" is the BÉT code), and the currency
// the bank prints is checked against BÉT's trading currency for that line.
// The English company name comes from ../../assets/stocks.csv (BET lines)
// by ISIN; the BÉT code is used when the list has none.
//   https://bet.hu/site/Angol/pages/mifid2
//
// Codes the bank still prints under an old name:
//   DUNAHOUSE  Duna House Holding is now DH Group, BÉT code DHGROUP, same
//              ISIN HU0000177613 (assets/stocks.csv keeps BET:DUNAHOUSE on
//              that ISIN with the name "DH Group").
// A code BÉT no longer quotes (KULCSSOFT, Kulcs-Soft, absent from BÉT's
// table) is not written.
//
// broker-list.json names one place, Budapest Stock Exchange, with no
// restriction.
//
//   node brokers/granit/granit_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const PAGE = "https://granitbank.hu/tajekoztatok-es-nyilatkozatok/reszvenyek";
const BET = "https://bet.hu/site/Angol/pages/mifid2";
const RENAMED = { DUNAHOUSE: "DHGROUP" };
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) =>
  String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*" }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return await response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await pause(1500 * (attempt + 1));
  }
  throw new Error(last);
}

// The bank's table: rows of [premium code, currency, (spacers), standard
// code, currency].
function bankList(html) {
  const at = html.indexOf("összes részvényre");
  if (at < 0) throw new Error("the shares page no longer says it takes orders on all premium and standard shares");
  const table = html.slice(html.indexOf("<table", at), html.indexOf("</table>", at));
  const lines = [];
  for (const [, tr] of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => clean(match[1]));
    const filled = cells.filter(Boolean);
    if (filled.some((cell) => /Részvény|Devizanem/i.test(cell))) continue;
    if (cells.length !== 7) throw new Error(`a row of the shares table has ${cells.length} cells: ${filled.join(" | ")}`);
    for (const [code, currency, category] of [
      [cells[0], cells[1], "premium"],
      [cells[5], cells[6], "standard"],
    ]) {
      if (!code && !currency) continue;
      if (!code || !/^[A-Z]{3}$/.test(currency)) throw new Error(`bad pair in the shares table: ${code} ${currency}`);
      lines.push({ code: code.toUpperCase(), currency, category });
    }
  }
  return lines;
}

// BÉT code -> { isin, currency } from the MiFID II pre-trade table.
function betCodes(html) {
  const at = html.indexOf("dataSourceResults=");
  if (at < 0) throw new Error("BÉT's MiFID II page has no data");
  const data = JSON.parse(html.slice(at + "dataSourceResults=".length, html.indexOf("</script>", at)));
  const rows = data.BetPretradeExchangeTableDataSource || [];
  if (rows.length < 300) throw new Error(`BÉT's pre-trade table has only ${rows.length} lines`);
  const codes = new Map();
  for (const row of rows) {
    const code = clean(row.name).toUpperCase();
    const isin = clean(row.isin).toUpperCase();
    if (!code || !ISIN.test(isin)) continue;
    if (!codes.has(code)) codes.set(code, { isin, currency: clean(row.trCurrency).toUpperCase() });
  }
  return codes;
}

function stockNames() {
  const names = new Map();
  const text = fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("BET:")) continue;
    const [, , isin, ...name] = line.split(",");
    const label = name.join(",").replace(/^"|"$/g, "").trim();
    if (ISIN.test(isin) && label && !names.has(isin)) names.set(isin, label);
  }
  return names;
}

const listed = bankList(await getText(PAGE));
if (listed.length < 45) throw new Error(`the shares table has only ${listed.length} shares`);
const codes = betCodes(await getText(BET));
const names = stockNames();

const rows = [];
const dropped = [];
for (const line of listed) {
  const code = RENAMED[line.code] || line.code;
  const bet = codes.get(code);
  if (!bet) {
    dropped.push(`${line.code} not quoted on BÉT`);
    continue;
  }
  if (bet.currency && bet.currency !== line.currency) throw new Error(`${code} is ${line.currency} at the bank and ${bet.currency} on BÉT`);
  rows.push({
    query: code,
    ticker: code,
    name: names.get(bet.isin) || code,
    exchange: "Budapest Stock Exchange",
    mic: "XBUD",
    currency: line.currency,
    type: "STOCK",
    isin: bet.isin,
    raw: [line.code, line.currency, `BÉT ${line.category}`, code === line.code ? "" : `BÉT code ${code}`].filter(Boolean).join(" | "),
  });
}
if (dropped.length > 3) throw new Error(`${dropped.length} codes are not on BÉT: ${dropped.join("; ")}`);
for (const [ticker, isin, currency] of [
  ["OTP", "HU0000061726", "HUF"],
  ["MOL", "HU0000153937", "HUF"],
  ["GSPARK", "HU0000083696", "EUR"],
  ["DHGROUP", "HU0000177613", "HUF"],
]) {
  const found = rows.find((row) => row.ticker === ticker);
  if (!found || found.isin !== isin || found.currency !== currency) throw new Error(`${ticker} was ${JSON.stringify(found)}`);
}

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("granit-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
const counts = {};
for (const row of written) counts[`${row.exchange} ${row.type} ${row.currency}`] = (counts[`${row.exchange} ${row.type} ${row.currency}`] || 0) + 1;
console.error(counts);
console.error(`${written.length} rows, ${written.filter((row) => row.isin).length} with an ISIN, ${written.filter((row) => row.name !== row.ticker).length} named; left out: ${dropped.join("; ") || "none"}`);
