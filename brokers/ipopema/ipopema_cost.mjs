// What one round trip costs at IPOPEMA: buy n shares at price p, sell
// them back at once, in dollars. Orders placed in the online system.
// Phone and branch orders are another line and stay out.
//
// Tariff of 12 May 2026, in force from 15 June 2026. Section 5, the
// online system: 0.39 % of the value filled on each order, minimum 3 PLN,
// for every instrument except bonds. Shares, ETF, ETC and ETN on the GPW
// and on NewConnect use that one line. Bonds are not in the catalogue.
// A negotiated rate is not this number.
//
// Custody of instruments registered at KDPW is 0.01 % of the portfolio a
// quarter, and is not charged when those holdings are under 100,000 PLN.
// That is a holding charge, so it stays in the remark. Real-time
// one-level GPW quotes are 0 PLN.
//
//   https://ipopemasecurities.pl/wp-content/uploads/2026/05/TOiP_20260512.pdf
//
//   node brokers/ipopema/ipopema_cost.mjs PLPKO0000016 GPW PLN --shares=10 --price=50
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { plus, finite } from "../../na.mjs";
import { QUOTE, toUsd, listingCash } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("ipopema-parsed.json", import.meta.url);
const SPREADS = new URL("../../spreads/spread.json", import.meta.url);

const SCHEDULE = {
  url: "https://ipopemasecurities.pl/wp-content/uploads/2026/05/TOiP_20260512.pdf",
  readOn: "2026-10-05",
  tariffOn: "2026-06-15",
};

const RATE = 0.0039;
const MIN_PLN = 3;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

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
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function sideUsd(notional, listingCcy) {
  const raw = dollars(notional * RATE, listingCcy);
  const floor = dollars(MIN_PLN, "PLN");
  if (raw == null || floor == null) return null;
  return Math.max(raw, floor);
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
    cashCurrency: "PLN",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue IPOPEMA n'existe pas encore : lancer `node brokers/ipopema/ipopema_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue IPOPEMA` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez IPOPEMA`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
  });
  const listing = {
    isin: code(m.row.isin),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type),
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  const remark =
    "Custody of instruments registered at KDPW is 0.01% a quarter, not charged when those holdings are under 100,000 PLN.";
  const basis = `tarif du ${SCHEDULE.tariffOn}, relu le ${SCHEDULE.readOn}, système en ligne : 0,39 % min 3 PLN par ordre`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: listingCash(listing.currency) || "PLN",
    url: SCHEDULE.url,
    remark,
    basis,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;
  const one = sideUsd(notional, listing.currency);
  const brokerFees = plus(one, one);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de source de spread"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate: RATE, min: MIN_PLN, currency: "PLN", eachWay: true },
  };
}

function arg(flag, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return hit ? hit.slice(flag.length + 3) : fallback;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: Number(arg("shares", "10")),
    price: Number(arg("price", "0")),
  });
  console.log(JSON.stringify(out, null, 2));
}
