// What TF Capital (TF Capital AD Podgorica, licensed by Montenegro's
// Capital Market Authority) sells in shares and exchange-traded funds, with
// no login. TF Capital prints no list.
//
// United States. The TF Trader app: "Stocks, fractional shares of U.S.
// companies listed on the NYSE and NASDAQ exchanges, ETFs. All in the TF
// Trader app" (home page); "Access to 5,000+ stocks and ETFs" and
// "Clearing and settlement of US securities is provided by Alpaca
// Securities LLC" (US markets page). The pricing page charges "US Stock
// Exchanges, Trading via the TF Trader app — stocks and ETFs on US
// exchanges": $2.50 up to $500, $5.00 up to $1,000, 0.5% above, plus SEC,
// TAF and CAT fees. The app is a front end on Alpaca: an order for a title
// Alpaca does not mark tradable cannot be placed. So the book is Alpaca's
// tradable book (../alpaca/alpaca-parsed.json, owner 2026-10-26, as for
// ../investlink), less its OTC lines (not an exchange) and the PTPs Alpaca
// keeps for US residents (`usResidentsOnly`: no qualified notice, 10% IRS
// withholding for a non-US account); shares only when listed on the NYSE
// or Nasdaq, the two markets named ("NYSE" read as the NYSE-named markets
// NYSE, NYSE American and NYSE Arca), ETFs (and the ETNs filed with them)
// on any US exchange since none is named for them. Then, the page giving a
// number and no list, the 5,000 most popular of those titles, stocks and
// ETFs together as the page counts them, ranked by 30-day average traded
// value (./usTop.mjs). No page names an OTC, leveraged-ETF or price
// exception. The US is one NBBO market: one row per title, on its listing
// market, in dollars.
//
// Montenegro is left out. The pricing page charges the "Montenegro Stock
// Exchange, Local securities market" (EUR 10.00 up to EUR 1,500, 0.7%
// above), but orders are not placed online: "You can submit a trading
// order to our brokerage team at the company's offices every working day
// from 8 am to 4 pm or by sending an email" (Montenegro Stock Exchange
// page). Only what can be bought online is kept (owner, 2026-10-25). The
// run stops if that sentence leaves the page, so the place is looked at
// again. ./mnseBook.mjs, the exchange's whole share book, stays for
// another broker.
//
// Left out: the "International Stock Exchanges" of the pricing page
// ("Order execution on exchanges in Europe and North America": Germany,
// AT, NL, BE, CH, DK, IE, FI, PT, ES, IT, NO, FR, SE, GB, Slovenia,
// Croatia, Romania, Canada) and the LSE, Euronext, Deutsche Börse, Tokyo,
// Hong Kong and Shanghai the US markets page shows under "Available
// exchanges". No page says which titles or which channel (app or broker),
// Alpaca, which clears the app's trades, offers US securities only, and
// the 5,000 count is given for the US offer. broker-list.json lists those
// places; they are not read here.
//
//   https://tfcapital.me/en
//   https://tfcapital.me/en/usa-berza
//   https://tfcapital.me/en/pricing   (fees)
//   https://tfcapital.me/en/montenegroberze
//
//   node brokers/tfcapital/tfcapital_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import { usTop } from "./usTop.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const US_COUNT = 5000;
const ALPACA = new URL("../alpaca/alpaca-parsed.json", import.meta.url);
// Alpaca's venue (last word of raw) -> exchange, MIC, and whether a share
// listed there is on a market TF Capital names.
const VENUES = {
  NYSE: { exchange: "NYSE", mic: "XNYS", named: true },
  NASDAQ: { exchange: "NASDAQ", mic: "XNAS", named: true },
  AMEX: { exchange: "AMEX", mic: "XASE", named: true },
  ARCA: { exchange: "AMEX", mic: "ARCX", named: true },
  BATS: { exchange: "CBOE", mic: "BATS", named: false },
};
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

// The page still says what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const source = await response.text();
  const text = source
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text) && !pattern.test(source)) throw new Error(`${url} no longer says ${pattern}`);
}

await evidence("https://tfcapital.me/en", [/listed on the NYSE and NASDAQ exchanges, ETFs/]);
await pause();
await evidence("https://tfcapital.me/en/usa-berza", [/Access to 5,000\+ stocks and ETFs/, /Alpaca Securities LLC/]);
await pause();
await evidence("https://tfcapital.me/en/pricing", [/Up to \$500\.00 \$2\.50/, /Up to €1,500\.00 €10\.00/]);
await pause();
await evidence("https://tfcapital.me/en/montenegroberze", [/by sending an email/]);

if (!fs.existsSync(ALPACA)) throw new Error("Alpaca's book is missing: run node brokers/alpaca/alpaca_scraping.mjs");
const ageDays = (Date.now() - fs.statSync(ALPACA).mtimeMs) / 86_400_000;
if (ageDays > 45) console.error(`warning: Alpaca's book is ${Math.round(ageDays)} days old`);

const left = {};
const leave = (reason) => (left[reason] = (left[reason] || 0) + 1);
const named = [];
for (const row of JSON.parse(fs.readFileSync(ALPACA, "utf8"))) {
  if (row.type !== "STOCK" && row.type !== "ETF") { leave(row.type === "CRYPTO" ? "crypto" : row.type); continue; }
  const venue = String(row.raw || "").trim().split(/\s+/).pop().toUpperCase();
  const place = VENUES[venue];
  if (!place) { leave(`${venue} line (not a US exchange)`); continue; }
  if (row.usResidentsOnly) { leave("PTP for US residents only at Alpaca"); continue; }
  if (row.type === "STOCK" && !place.named) { leave(`share listed on ${venue} (not NYSE or Nasdaq)`); continue; }
  named.push({ query: row.query, ticker: row.ticker, name: row.name, exchange: place.exchange, mic: place.mic, currency: "USD", type: row.type, isin: row.isin, raw: row.raw });
}
const unresolved = new Set(named.filter((row) => !resolveVenue(row).venue).map((row) => `${row.exchange}|${row.mic}`));
if (unresolved.size) throw new Error(`venues not resolved: ${[...unresolved].join(", ")}`);
const us = await usTop(named, US_COUNT);
if (us.length !== US_COUNT) throw new Error(`only ${us.length} US titles`);
for (const ticker of ["AAPL", "MSFT", "SPY", "QQQ", "BRK.B"]) if (!us.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is not in the US top ${US_COUNT}`);

const rows = stampRows(withoutObligations(us));
fs.writeFileSync(new URL("tfcapital-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`Alpaca book ${Math.round(ageDays)} days old: ${named.length} lines on the named markets or ETFs, left out ${JSON.stringify(left)}; top ${US_COUNT}: ${JSON.stringify(us.report)}`);
