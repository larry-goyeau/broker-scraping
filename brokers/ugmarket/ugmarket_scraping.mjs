// What UG Market (ЮГ Маркет ЕАД, Plovdiv) sells on the Bulgarian Stock
// Exchange, with no login. UG Market is a BSE member and says every issue
// registered on the exchange can be traded through it:
//
//   https://ugmarket.com/en/trading-on-bse/
//   "Ug Market EAD is a member of the Bulgarian Stock Exchange – Sofia and
//    any of our clients, whether individual or legal entity, may trade
//    directly and cost efficiently with all registered issues of shares,
//    bonds, rights and compensatory instruments."
//   https://ugmarket.com/en/ug-market-trader/
//   UG MARKET TRADER, "an electronic order routing platform for trading in
//   real time on the Bulgarian Stock Exchange – Sofia", gives "Access to
//   information on all issues traded on BSE" and "Submission of orders to
//   BSE".
//
// So the catalogue is the BSE's own list of issues, read from the open data
// feed behind its "Listed Instruments" page (POST /en/dashboard/dispatcher/,
// key instrumentbysegment): every table of the Main Market and of the BaSE
// alternative market. The BSE's SME growth market BEAM is read too (key
// beamcompany, the "beam Equities" table of its company page). UG Market
// calls itself the first market maker of BEAM ("ПЪРВИ МАРКЕТ-МЕЙКЪР НА
// ПАЗАРА ЗА РАСТЕЖ НА МСП BEAM НА БФБ"), and its BEAM page says BEAM trades
// on the BSE's one T7 system under the Main Market's trading rules, so a
// UG MARKET TRADER order reaches it like any other BSE order:
//   https://ugmarket.com/beam-market-listings/
//   "търговията на него се осъществява на същата търговска платформа T7®,
//    и при същите правила за търговия като тези на Основния пазар на БФБ"
//   https://www.bse-sofia.bg/en/listed-instruments
//   https://www.bse-sofia.bg/en/beam-company
//
// The BSE's MTF BSE International (foreign shares, ETFs, ETCs and ETNs on
// the BSE's own T7 book under their Xetra codes, Tradegate as market maker)
// is offered online too: the tariff prices it on its own line for
// UG MARKET TRADER (2.2 "Сделки с финансови инструменти, търгувани на MTF
// BSE International чрез системата UG MARKET TRADER": 0.4% plus BSE and CD
// costs, minimum 11.00 € per executed order). Its list is the feed behind
// https://www.bse-sofia.bg/en/mtf-international-company (key
// mtfintcompany): code, name, ISIN, CFI. Each code's BSE issue card gives
// the security type and the trading currency:
//   shares                        STOCK (ADRs and preference shares too)
//   units                         ETF
//   Exchange Traded Commodities   ETC
//   Exchange traded notes         ETN
// The place is "BSE International", XBUL, as in ../benchmark (a segment of
// the same exchange, not a second venue).
//
// Rules:
//   Shares       every equity table (CFI ES.., EP..): Premium, Standard,
//                EuroBridge and Special Purpose Vehicles (REITs) of the Main
//                Market, the BaSE equities and SPV segments, and BEAM
//                equities: STOCK.
//   ETP segment  units of exchange-traded funds (CFI CE.., CI..: the Expat
//                index ETFs, Expat Gold, and the listed national investment
//                funds such as NIF Dynamic or Concord Fund-7, which trade on
//                the exchange like an ETF): ETF. The warrants on the same
//                segment (CFI RW..: ALFW, SFA3W ...) are left out.
//   Left out     bonds, government securities, compensatory instruments,
//                warrants and rights.
//   ISIN         the BSE's own issue card of each code (key profilmarketinfo,
//                "ISIN Code"; BEAM's table prints it), checked to say
//                "shares" or "units".
//   Currency     the table's own (EUR for every line since the euro replaced
//                the lev on 1 January 2026). UG Market's client accounts are
//                in EUR (both IBANs on its contacts page are EUR accounts),
//                and its tariff is in EUR.
//   Place        "Bulgarian Stock Exchange", XBUL, for every line: Main
//                Market, BaSE and BEAM are markets of the same exchange,
//                traded on its one trading system.
//
// UG Market names no market outside the BSE (no Xetra, US or other foreign
// exchange), so nothing else is read.
//
// Fees: https://ugmarket.com/тарифа/ and the cost disclosure
// https://ugmarket.com/wp-content/uploads/2026/09/2_Тарифа_01122025-EUR.pdf
// (UG MARKET TRADER: shares, rights and compensatory instruments 0.4% plus
// BSE and CD costs, minimum 2.00 EUR per executed order; MTF BSE
// International 0.4% plus BSE and CD costs, minimum 11.00 EUR).
//
// broker-list.json names one place, Bulgarian Stock Exchange, with no
// restriction; the BSE International rows sit on that exchange's book.
//
//   node brokers/ugmarket/ugmarket_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const DISPATCHER = "https://www.bse-sofia.bg/en/dashboard/dispatcher/";
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const EXCHANGE = "Bulgarian Stock Exchange";
const INTERNATIONAL = "BSE International";
// Security type on a BSE International issue card -> our type.
const MTF_TYPES = { shares: "STOCK", units: "ETF", "exchange traded commodities": "ETC", "exchange traded notes": "ETN" };

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
// "AGH#link:issuer-profile/AGH/" -> "AGH"
const label = (value) => clean(String(value ?? "").split("#link:")[0]);

// One POST to the BSE's data feed with several streams: { key: params }.
async function dispatch(streams) {
  const body = new URLSearchParams();
  const ids = [];
  streams.forEach(([key, parameters], index) => {
    const id = String(index + 1);
    ids.push(id);
    for (const [name, value] of Object.entries(parameters)) body.set(`${key}_${id}[parameters][${name}]`, value);
    body.set(`${key}_${id}[frequency]`, "0");
  });
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(DISPATCHER, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
        body,
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) {
        const payload = await response.json();
        if (ids.every((id) => payload?.[id]?.result)) return ids.map((id) => payload[id].result);
        last = `the BSE feed answered ${Object.keys(payload || {}).length} of ${ids.length} streams`;
      } else {
        last = `${response.status} ${DISPATCHER}`;
      }
    } catch (error) {
      last = String(error.message || error);
    }
    await pause(1500 * (attempt + 1));
  }
  throw new Error(last);
}

function tableRows(table) {
  const names = table.names || [];
  return (table.data || []).map((line) => Object.fromEntries(names.map((name, index) => [name, line[index]])));
}

const [segments] = await dispatch([["instrumentbysegment", { language: "en" }]]);
const [beam] = await dispatch([["beamcompany", { language: "en", segment: "trades" }]]);
const [international] = await dispatch([["mtfintcompany", { language: "en", segment: "trades" }]]);

const lines = [];
const tally = {};
for (const table of international.tables || []) {
  const all = tableRows(table);
  for (const line of all) {
    // The type and currency come from the issue card below.
    lines.push({ code: label(line.code).toUpperCase(), name: label(line.name), isin: clean(line.isin).toUpperCase(), cfi: clean(line.cfi).toUpperCase(), currency: "", segment: clean(table.table_name), type: "", international: true });
  }
  tally[clean(table.table_name)] = `${all.length}`;
}
if (lines.length < 200) throw new Error(`only ${lines.length} lines on MTF BSE International`);
for (const table of [...(segments.tables || []), ...(beam.tables || [])]) {
  const segment = clean(table.table_name).replace(/^beam /i, "BEAM ");
  const all = tableRows(table);
  let kept = 0;
  for (const line of all) {
    const cfi = clean(line.cfi).toUpperCase();
    let type = "";
    if (/^E[SP]/.test(cfi)) type = "STOCK";
    else if (/^C[EI]/.test(cfi)) type = "ETF";
    if (!type) continue;
    lines.push({ code: label(line.code).toUpperCase(), name: label(line.name), isin: clean(line.isin).toUpperCase(), cfi, currency: clean(line.currency).toUpperCase(), segment, type });
    kept += 1;
  }
  tally[segment] = `${kept}/${all.length}`;
}
console.error(tally);
const stocks = lines.filter((line) => line.type === "STOCK").length;
if (stocks < 200) throw new Error(`only ${stocks} shares on the BSE lists`);
if (!lines.some((line) => line.segment.startsWith("BEAM"))) throw new Error("no BEAM equities");

// ISINs (and, for BSE International, type and currency) from the BSE's
// issue cards, 20 codes a call.
const cards = new Map();
const wanted = lines.filter((line) => line.international || !ISIN.test(line.isin)).map((line) => line.code);
for (let start = 0; start < wanted.length; start += 20) {
  const batch = wanted.slice(start, start + 20);
  const results = await dispatch(batch.map((code) => ["profilmarketinfo", { language: "en", code }]));
  batch.forEach((code, index) => cards.set(code, Object.fromEntries((results[index].data || []).map(([title, text]) => [clean(title), clean(text)]))));
  await pause(300);
}

const rows = [];
const seen = new Set();
const dropped = [];
for (const line of lines) {
  const card = cards.get(line.code);
  const isin = ISIN.test(line.isin) ? line.isin : clean(card?.["ISIN Code"]).toUpperCase();
  const kind = clean(card?.["Security Type"]).toLowerCase();
  if (line.international) {
    if (!card) throw new Error(`no issue card for ${line.code}`);
    line.type = MTF_TYPES[kind];
    if (!line.type) {
      dropped.push(`${line.code} ${kind || "no type"}`);
      continue;
    }
    line.currency = clean(card["Trading currency"]).toUpperCase();
    if (line.currency !== "EUR") throw new Error(`${line.code} trades in ${line.currency || "no currency"} on BSE International`);
    if (ISIN.test(clean(card["ISIN Code"])) && clean(card["ISIN Code"]).toUpperCase() !== line.isin) throw new Error(`${line.code} has two ISINs`);
  } else if (card && kind && !/^(shares|units|preferred shares|preference shares)$/.test(kind)) {
    dropped.push(`${line.code} ${kind}`);
    continue;
  }
  if (!line.international && card?.["Trading currency"] && card["Trading currency"] !== line.currency) throw new Error(`${line.code} is ${line.currency} in the list and ${card["Trading currency"]} on its card`);
  const key = `${line.international ? "intl" : "main"}|${line.code}`;
  if (seen.has(key)) continue;
  seen.add(key);
  rows.push({
    query: line.code,
    ticker: line.code,
    name: line.name,
    exchange: line.international ? INTERNATIONAL : EXCHANGE,
    mic: "XBUL",
    currency: line.currency || "EUR",
    type: line.type,
    isin: ISIN.test(isin) ? isin : "",
    raw: [line.code, line.name, line.segment, line.cfi, line.international ? kind : "", line.currency].filter(Boolean).join(" | "),
  });
}

for (const [ticker, type, isin] of [
  ["AGH", "STOCK", "BG1100085072"],
  ["BSE", "STOCK", "BG1100016978"],
  ["BGX", "ETF", "BG9000011163"],
  ["AMON", "STOCK", "BG1100021226"],
  ["APC", "STOCK", "US0378331005"],
  ["SXR8", "ETF", "IE00B5BMR087"],
  ["4GLD", "ETC", "DE000A0S9GB0"],
  ["VBTC", "ETN", "DE000A28M8D0"],
]) {
  const found = rows.find((row) => row.ticker === ticker);
  if (!found || found.type !== type || found.isin !== isin) throw new Error(`${ticker} was ${JSON.stringify(found)}`);
}
if (rows.some((row) => /W$/.test(row.ticker) && row.raw.includes("RW"))) throw new Error("a warrant was kept");

const unresolved = rows.filter((row) => !resolveVenue(row).venue).map((row) => `${row.ticker} ${row.exchange}`);
if (unresolved.length) throw new Error(`no venue for ${unresolved.join(", ")}`);

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
const written = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("ugmarket-parsed.json", import.meta.url), JSON.stringify(written, null, 2));
const counts = {};
for (const row of written) counts[`${row.exchange} ${row.type} ${row.currency}`] = (counts[`${row.exchange} ${row.type} ${row.currency}`] || 0) + 1;
console.error(counts);
console.error(`${written.length} rows, ${written.filter((row) => row.isin).length} with an ISIN; left out: ${dropped.join("; ") || "none"}`);
