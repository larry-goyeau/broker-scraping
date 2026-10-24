// What OTP banka d.d. (Croatia) sells online, with no login: the shares
// and ETFs listed on the Zagreb Stock Exchange.
//
// The brokerage page offers "posredovanje pri kupnji / prodaji svih
// financijskih instrumenata izlistanih na Zagrebačkoj burzi te na važnijim
// stranim tržištima (dionice, obveznice, prava, ETF i sl.)". Its only
// online channel is ZSE: "trgovanje financijskim instrumentima na
// Zagrebačkoj burzi putem internetske trgovinske platforme", and OTP
// e-trader is "trgovanje na Zagrebačkoj burzi posredstvom ovlaštenih
// brokera (telefonom) te internetsko trgovanje putem ... OTP e-trader".
//
//   https://www.otpbanka.hr/globalna-trzista/brokersko-poslovanje
//
// So ZSE's list is the catalogue: ZSE publishes every listed security,
// with a status, a type and a trading model on each line. Listed
// ordinary and preference shares and depositary receipts are STOCK, listed
// ETFs are ETF; bonds, bills and certificates stay out, as do delisted
// lines. The Progress Market (ZSE's MTF) is not on that page and is not
// "izlistan", so it gets no row.
//
//   https://zse.hr/en/securities/26
//
// The foreign markets of the tariff (Austria, Belgium, Finland, France,
// Ireland, Italy, Netherlands, Germany, Portugal, Spain, Slovenia, US,
// Switzerland, UK, Australia, Canada, Hungary, Japan, Poland, Sweden,
// Norway, Denmark) and the other places in broker-list.json are reached
// only through OTP's brokers by phone, and OTP publishes no list of the
// foreign titles it handles. They get no row.
//
// Currency: ZSE trades in euro, and the bank's accounts are in euro.
//
//   node brokers/otpbankahr/otpbankahr_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LIST = "https://zse.hr/en/securities/26";
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const PLACE = { exchange: "Zagreb Stock Exchange", mic: "XZAG", currency: "EUR" };

async function text(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(last);
}

const decode = (s) =>
  String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

// The ZSE type label -> our type, or null to leave the line out.
function typeOf(label) {
  const parts = label.split(",");
  if (parts[0] === "EQTY") return "STOCK";
  if (parts[0] === "ETF") return "ETF";
  if (parts[0] === "DEBT" || parts[0] === "STRP") return null;
  throw new Error(`unread ZSE type ${label}`);
}

const html = await text(LIST);
const lines = [...html.matchAll(/<tr\b([^>]*\bdata-status="[^"]*"[^>]*)>([\s\S]*?)<\/tr>/g)];
if (lines.length < 500) throw new Error(`${LIST} had ${lines.length} securities`);

const rows = [];
const seen = new Set();
let listed = 0;
for (const [, attributes, body] of lines) {
  const status = (attributes.match(/data-status="([^"]*)"/) || [])[1];
  const label = (attributes.match(/data-type="([^"]*)"/) || [])[1] || "";
  if (status !== "LISTED_SECURITIES") continue;
  listed += 1;
  const type = typeOf(label);
  if (!type) continue;
  const cells = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => decode(cell[1]));
  const [ticker, isin, name, sector, quantity, nominal, listedOn, delistedOn] = cells;
  if (!ticker || !ISIN.test(isin || "")) throw new Error(`unreadable ZSE line ${cells.join(" | ")}`);
  if (delistedOn && delistedOn !== "-") continue;
  if (seen.has(isin)) continue;
  seen.add(isin);
  rows.push({
    query: ticker,
    ticker,
    name,
    ...PLACE,
    type,
    isin,
    raw: [ticker, isin, name, sector, label, `listed ${listedOn}`].join(" | "),
  });
}

if (!rows.some((row) => row.ticker === "HT") || !rows.some((row) => row.type === "ETF")) {
  throw new Error("the ZSE list lost HT or every ETF");
}

rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("otpbankahr-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byType = new Map();
for (const row of kept) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const unresolved = kept.some((row) => !resolveVenue(row).venue) ? `${PLACE.exchange}/${PLACE.mic}/${PLACE.currency}` : "none";
console.error(
  `${kept.length} ZSE listings in EUR (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}) ` +
    `of ${listed} listed securities; ${kept.filter((row) => row.isin).length} with an ISIN. Unresolved: ${unresolved}.`
);
