// What SelectETF sells. VisualVest points at this page as every ETF it
// trades, and the page needs no login.
//
// https://www.visualvest.de/selectetf
// https://www.justetf.com/de/visualvest-etp-universe.html
//
// Orders go to Tradegate, and to Quotrix only when Tradegate is not
// available, so the row keeps Tradegate. The sheet prints its figures in
// euros. The robo-advisor is a managed portfolio, not this list.
//
//   node brokers/visualvest/visualvest_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const PAGE = "https://www.justetf.com/de/visualvest-etp-universe.html";
const OUTPUT = new URL("visualvest-parsed.json", import.meta.url);
const EXCHANGE = "Tradegate";
const CURRENCY = "EUR";

function decode(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function tableBody(html, id) {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) throw new Error(`VisualVest page has no ${id} table`);
  const bodyStart = html.indexOf("<tbody", start);
  const bodyEnd = html.indexOf("</tbody>", bodyStart);
  if (bodyStart < 0 || bodyEnd < 0) throw new Error(`VisualVest ${id} table has no rows`);
  return html.slice(bodyStart, bodyEnd);
}

function classTotals(html) {
  const heading = html.indexOf("ETFs nach Anlageklassen");
  if (heading < 0) throw new Error("VisualVest page has no asset-class totals");
  const tableEnd = html.indexOf("</table>", heading);
  const slice = html.slice(heading, tableEnd);
  const totals = new Map();
  let announced = null;
  for (const match of slice.matchAll(/<td>([^<:]+):<\/td>\s*<td[^>]*>\s*(?:<a[^>]*>)?\s*(\d+)/g)) {
    const label = decode(match[1]);
    const count = Number(match[2]);
    if (label === "Gesamt") announced = count;
    else totals.set(label, count);
  }
  if (!totals.size || announced == null) throw new Error("VisualVest asset-class totals were empty");
  const parts = [...totals.values()].reduce((sum, count) => sum + count, 0);
  if (parts !== announced) throw new Error(`VisualVest classes add up to ${parts}, and the total says ${announced}`);
  return { totals, announced };
}

const response = await fetch(PAGE, {
  headers: {
    Accept: "text/html",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`VisualVest universe answered ${response.status}`);
const html = await response.text();
const stamp = html.match(/Stand:\s*(\d{2}\.\d{2}\.\d{2})/);
if (!stamp) throw new Error("VisualVest universe has no date");

const seenIsin = new Set();
const seenWkn = new Set();
const listings = [];
const body = tableBody(html, "etflistTable");
for (const row of body.matchAll(/<tr>(.*?)<\/tr>/gs)) {
  const cells = [...row[1].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((cell) => cell[1]);
  if (cells.length < 2) throw new Error("VisualVest row is missing its name or its ISIN");
  const name = decode(cells[0].match(/<a[^>]*>(.*?)<\/a>/s)?.[1] || "");
  const isin = cells[0].match(/isin=([A-Z0-9]{12})/i)?.[1] || "";
  const ids = decode(cells[1]).split(" ");
  const printedIsin = ids[0] || "";
  const wkn = ids[1] || "";
  if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(printedIsin)) throw new Error(`VisualVest row has no ISIN: ${name || cells[1]}`);
  if (isin && isin !== printedIsin) throw new Error(`${printedIsin} does not match the link ${isin}`);
  if (!/^[A-Z0-9]{6}$/.test(wkn)) throw new Error(`${printedIsin} has no WKN`);
  if (!name) throw new Error(`${printedIsin} has no name`);
  if (seenIsin.has(printedIsin)) throw new Error(`${printedIsin} is listed twice`);
  if (seenWkn.has(wkn)) throw new Error(`${wkn} is listed twice`);
  seenIsin.add(printedIsin);
  seenWkn.add(wkn);
  const type = /\bETC\b/.test(name) && !/\bETF\b/.test(name) ? "ETC" : "ETF";
  listings.push({
    query: wkn,
    ticker: wkn,
    name,
    exchange: EXCHANGE,
    currency: CURRENCY,
    type,
    isin: printedIsin,
    raw: [wkn, name, EXCHANGE, CURRENCY, printedIsin, type].join(" "),
  });
}

const { totals, announced } = classTotals(html);
if (announced !== listings.length) {
  throw new Error(`VisualVest prints ${announced} ETFs and the table has ${listings.length}`);
}

listings.sort((left, right) => left.ticker.localeCompare(right.ticker) || left.isin.localeCompare(right.isin));
fs.writeFileSync(OUTPUT, JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
const byType = new Map();
for (const row of listings) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${listings.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}), ` +
    `Stand ${stamp[1]}. ` +
    [...totals].map(([label, count]) => `${count} ${label}`).join(", ")
);
