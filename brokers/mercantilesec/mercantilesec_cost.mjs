// What one round trip costs at Mercantile Securities: buy n shares at
// price p, sell them back at once, in dollars. Online only.
//
// The site is a Flutter app; its fee tables are in main.dart.js, read on
// 2026-10-23. Buying and selling:
//   Commission          "0.25% of gross trade amount"
//   VAT                 "12% of commission"
//   SCCP                "0.01% of gross trade amount"
//   PSE Transaction     "0.005% of gross trade amount"
//   SEC Fees            "0.005% of Gross Value Traded"
//   SIPF Contribution   "0.001% of Gross Value Traded"
// Selling only:
//   Sales tax           "0.6% of gross trade amount"
// The 0.6% is the stock transaction tax before the Capital Markets
// Efficiency Promotion Act (RA 12214) cut it to 0.1% from 1 July 2025. The
// broker withholds the tax the law sets, so this ticket takes 0.1%, as the
// other PSE files do (col, abcapital, bpi, timson). The page prints no
// floor. A share and the PSE's ETF take this one table.
//
// The account is funded in pesos only (deposits.mjs). The three PSE lines
// in dollars would need a conversion the page does not price: N/A.
//
//   https://www.mercantilesec.com/
//   https://www.mercantilesec.com/main.dart.js
//
//   node brokers/mercantilesec/mercantilesec_cost.mjs SM PSE PHP --shares=20000 --price=5
//   node brokers/mercantilesec/mercantilesec_cost.mjs AETF PSE PHP --shares=100 --price=100
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("mercantilesec-parsed.json", import.meta.url);
const PAGE = "https://www.mercantilesec.com/";
const READ_ON = "2026-10-23";
// The commission and 12% VAT on it, each side. LEVIES are rates of the
// gross, each side. The sales tax is on the sell.
const COMMISSION = 0.0025;
const VAT = 0.12;
const LEVIES = [
  ["SCCP", 0.0001],
  ["PSE transaction", 5e-05],
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
    return { ...answer, why: "le catalogue Mercantile Securities n'existe pas encore : lancer `node brokers/mercantilesec/mercantilesec_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Mercantile Securities` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Mercantile Securities`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "mercantilesec",
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
    basis: `Mercantile en ligne, barème relu le ${READ_ON}. Commission 0,25 % plus TVA 12 % de la commission, SCCP 0,01 %, PSE 0,005 %, SEC 0,005 %, SIPF 0,001 %, chaque côté ; taxe de vente 0,1 % à la vente (la page imprime encore 0,6 %, le taux d'avant juillet 2025).`,
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
