// What one round trip costs at Al Wathbah Shares & Bonds Center (WSBC, Abu
// Dhabi): buy n shares at price p on the Abu Dhabi Securities Exchange or
// the Dubai Financial Market, sell them back at once, in dollars. Online
// and mobile trading take the same table; the site names no other.
//
// The FAQ, "Fees & Commissions", read on 2026-10-24 at stage.alwathbah.ae,
// the only host that answers (www.alwathbah.ae redirects there over plain
// HTTP, its HTTPS fails):
//   "Trading Fees:
//    Broker's commission 0.125% Minimum AED 30
//    Market commission 0.05% Minimum AED 20
//    Clearing and Depository Settlement (CDS) commission 0.05% Minimum AED 10
//    Securities and Commodities Authority (ESCA) commission 0.05% Minimum AED 5"
// One table for both exchanges. Each line is a percentage of the trade
// value with its own floor, taken on the buy and on the sell: 0.275% a side
// once the trade is past AED 40,000, and at least AED 65 a side below
// AED 10,000, before VAT. No cap. Opening an account (regular or online) is free and
// there is no minimum deposit (same FAQ).
//
// The FAQ prints no VAT line. The UAE's 5% VAT is added on the broker,
// market and CDS lines, as BHM and xCube print it on the same three lines;
// the SCA line carries none (owner's choice, 2026-10-24). The stage pages carry
// placeholder market data (an NBAD ticker, a "4 Months" free-brokerage
// banner) and the table may be an old one kept on a rebuilt site; it is the
// only one the broker publishes, so it is the one charged.
//
// `brokerFees` is the broker's commission; the market, CDS and SCA lines
// are market charges and sit in `parts.marketFees`. A share and an ETF are
// the same order. The account is in dirhams (deposits.mjs) and every line
// is AED, so there is no FX. No remark.
//
//   https://stage.alwathbah.ae/faqs
//   http://www.alwathbah.ae/                      (301 to stage.alwathbah.ae)
//
//   node brokers/alwathbah/alwathbah_cost.mjs EMAAR DFM AED --shares=100 --price=14
//   node brokers/alwathbah/alwathbah_cost.mjs FAB ADX AED --shares=10000 --price=16
//   node brokers/alwathbah/alwathbah_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("alwathbah-parsed.json", import.meta.url);
const PAGE = "https://stage.alwathbah.ae/faqs";
const READ_ON = "2026-10-24";
const CCY = "AED";
// Each side, on the trade value, in dirhams.
// `vat` is the UAE VAT added on the line after its floor.
const LINES = [
  { name: "BROKER", rate: 0.00125, min: 30, vat: 0.05 },
  { name: "MARKET", rate: 0.0005, min: 20, vat: 0.05 },
  { name: "CDS", rate: 0.0005, min: 10, vat: 0.05 },
  { name: "SCA", rate: 0.0005, min: 5, vat: 0 },
];
const MICS = new Set(["XADS", "XDFM"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

/** One side's lines, in dirhams, for a trade of `notional` dirhams. */
export function sideOf(notional) {
  const lines = {};
  for (const l of LINES) lines[l.name] = Math.max(notional * l.rate, l.min) * (1 + l.vat);
  const total = Object.values(lines).reduce((sum, v) => sum + v, 0);
  return { lines, total, broker: lines.BROKER, market: total - lines.BROKER };
}

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
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
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
    cashCurrency: CCY,
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Al Wathbah n'existe pas encore : lancer `node brokers/alwathbah/alwathbah_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Al Wathbah` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Al Wathbah`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "alwathbah",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `FAQ Al Wathbah relue le ${READ_ON} (stage.alwathbah.ae), même barème ADX et DFM, chaque sens : ` +
      `courtage 0,125 % (minimum 30 AED), marché 0,05 % (minimum 20 AED), CDS 0,05 % (minimum 10 AED), ` +
      `SCA 0,05 % (minimum 5 AED). TVA 5 % ajoutée sur le courtage, le marché et le CDS (pas sur la SCA), comme chez BHM et xCube : la FAQ n'en imprime pas.`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  if (!MICS.has(listing.mic)) {
    return { ...shared, why: `${listing.exchange} n'est ni l'ADX ni le DFM : pas de barème Al Wathbah` };
  }
  if (listing.currency !== CCY) {
    return { ...shared, why: `ligne en ${listing.currency} : le barème Al Wathbah est en dirhams` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const side = sideOf(notional);
  const feesUsd = dollars(side.total * 2, listing.currency);
  const brokerFees = dollars(side.broker * 2, listing.currency);
  const marketFees = dollars(side.market * 2, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, feesUsd, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      lines: LINES,
      each: side.lines,
      eachTotal: side.total,
      currency: listing.currency,
      eachWay: true,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      marketFees: finite(marketFees, 6),
      taxes: taxTotal ? finite(taxUsd, 6) : null,
    },
    confidence: [
      shared.basis,
      `${side.total.toFixed(2)} AED par sens sur ${notional.toFixed(2)} AED`,
      marketPerShare != null
        ? `carnet ${marketPerShare} par part`
        : marketBp != null
          ? `carnet ${marketBp} pb`
          : `pas de feuille de carnet : ${listing.exchange}`,
      "aucun aller-retour réel Al Wathbah dans ce dépôt",
    ].join(" ; "),
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
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ url: PAGE, readOn: READ_ON, currency: CCY, lines: LINES, eachWay: true }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage: node brokers/alwathbah/alwathbah_cost.mjs <ticker|ISIN> [place] [currency] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(
    JSON.stringify(
      roundTrip({
        etf,
        place,
        currency,
        shares: Number(flag("shares") ?? 10),
        price: Number(flag("price") ?? 0),
        bp: flag("bp") ? Number(flag("bp")) : null,
        perShare: flag("per-share") ? Number(flag("per-share")) : null,
      }),
      null,
      2
    )
  );
}

printCli();
