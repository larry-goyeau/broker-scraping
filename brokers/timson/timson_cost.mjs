// What one round trip costs at Timson Securities (Timson Trade): buy n
// shares at price p, sell them back at once, in dollars. Online only.
//
// The FAQ "What are the fees when buying and selling stocks?", read on
// 2026-10-23:
//   Commission Rate     0.25% based on Gross Value Traded
//   VAT                 12% of Commission
//   SCCP Fees           0.01% of Gross Value Traded
//   PSE Fees            0.005% of Gross Value Traded
//   SEC Fees            0.005% of Gross Value Traded
//   SIPF Contribution   0.001% of Gross Value Traded
//   Sales Tax           0.1% of Gross Value Traded, on the sell
// The page prints no floor. There is no maintenance fee. An account
// inactive for six months or under P100,000 may be moved to a traditional
// (broker-assisted) account at 0.25% or PHP 150: not this online order.
//
// The account is funded in pesos only (deposits.mjs). The three PSE lines
// in dollars would need a conversion the page does not price: N/A.
//
//   https://www.timson.com.ph/faq/what-are-the-fees-when-buying-and-selling-stocks/
//   https://www.timson.com.ph/faq/is-there-a-maintenance-fee-that-i-have-to-pay-regularly-for-my-account/
//
//   node brokers/timson/timson_cost.mjs SM PSE PHP --shares=20000 --price=5
//   node brokers/timson/timson_cost.mjs DTEL PSE USD --shares=10 --price=25
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("timson-parsed.json", import.meta.url);
const PAGE = "https://www.timson.com.ph/faq/what-are-the-fees-when-buying-and-selling-stocks/";
const READ_ON = "2026-10-23";
// The commission and 12% VAT on it, each side. LEVIES are rates of the
// gross, each side. The sales tax is on the sell.
const COMMISSION = 0.0025;
const VAT = 0.12;
const LEVIES = [
  ["SCCP", 0.0001],
  ["PSE", 5e-05],
  ["SEC", 5e-05],
  ["SIPF", 1e-05],
];
const SALES_TAX = 0.001;
// Cash the account takes (deposits.mjs). A line in another currency would be
// bought through a conversion the broker does not price.
const CASH = ["PHP"];

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function ticket(notional) {
  const commission = notional * COMMISSION;
  const vat = commission * VAT;
  const levies = LEVIES.reduce((sum, [, rate]) => sum + notional * rate, 0);
  const buy = commission + vat + levies;
  return { commission, vat, levies, buy, sell: buy + notional * SALES_TAX };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "PHP",
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Timson n'existe pas encore : lancer `node brokers/timson/timson_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Timson` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Timson`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "timson",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency || "PHP",
    remark: "",
    basis: `Timson Trade en ligne, FAQ relue le ${READ_ON}. Commission 0,25 % plus TVA 12 % de la commission, SCCP 0,01 %, PSE 0,005 %, SEC 0,005 %, SIPF 0,001 %, chaque côté ; taxe de vente 0,1 % à la vente.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!CASH.includes(listing.currency)) {
    return { ...shared, why: `${listing.ticker || etf} est coté en ${listing.currency} : le compte est en ${CASH.join(", ")} et la conversion n'a pas de taux publié` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const fees = ticket(notional);
  const local = fees.buy + fees.sell;
  const notionalUsd = dollars(notional, listing.currency);
  const brokerFees = dollars(local, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { ...fees, currency: listing.currency },
  };
}

function printCli() {
  let called = false;
  try {
    called = import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
