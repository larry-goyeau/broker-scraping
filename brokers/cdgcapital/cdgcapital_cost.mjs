// What one round trip costs at CDG Capital Bourse: buy n shares, sell them
// back, in dollars. Online order on a listed Casablanca share.
//
// https://www.cdgcapitalbourse.ma/Produits/Tarifications read on
// 2026-10-21. The page is filled by the site's own API (POST
// https://www.cdgcapitalbourse.ma/api/, action TARIFICATION). Every line
// is before tax (HT). The maximum rates are the ones used.
//   Online service      50 MAD a month before tax, no limit on orders.
//   Brokerage           0.60 % (maximum), at least 10 MAD an order.
//   SBVC commission     0.10 %, the Casablanca exchange's own fee.
//   Settlement          0.20 % (maximum), no floor printed.
//   Custody             0.30 % (maximum), at least 50 MAD a quarter
//                       (footnote 2).
//   VAT                 10 % on brokerage, the SBVC commission and
//                       settlement. The page prints only HT figures and
//                       no VAT rate. The 10 % is Morocco's VAT on these
//                       commissions as the other Casablanca books print
//                       it on the same three lines: CFG Bank's tariff
//                       booklet (January 2024) prints 0.60 / 0.20 / 0.10 %
//                       before tax as 0.66 / 0.22 / 0.11 % with tax, and
//                       CIH, whose online book is CDG Capital Bourse, adds
//                       the same 10 % (CIH prospectus of December 2022,
//                       CDG Capital's custody sheet, see brokers/cih).
//   Footnotes           (1) the commission is taken on the amount of each
//                       trade. (2) custody is taken each quarter on the
//                       amount of the portfolio.
//   Book                the Casablanca (XCAS) leaf of spreads/book.mjs.
//
// In the total: the book, then (brokerage with its floor + SBVC +
// settlement) x 1.10, each side. The 10 MAD floor binds below 1,666.67
// MAD a trade. Remark: the monthly service fee and the
// custody, which depend on the month and the portfolio, not on the trade.
// The account holds dirhams only (deposits.mjs) and every line is in MAD,
// so there is no conversion. Casablanca prints no transaction tax.
//
//   node brokers/cdgcapital/cdgcapital_cost.mjs ADH Casablanca MAD --shares=10 --price=30
//   node brokers/cdgcapital/cdgcapital_cost.mjs ATW Casablanca MAD --shares=200 --price=700
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("cdgcapital-parsed.json", import.meta.url);
const PAGE = "https://www.cdgcapitalbourse.ma/Produits/Tarifications";
const READ_ON = "2026-10-21";
const BROKERAGE = 0.006;
const BROKERAGE_MIN = 10;
const SBVC = 0.001;
const SETTLEMENT = 0.002;
const VAT = 0.1;
const REMARK =
  "Online service is 50 MAD a month. Custody is up to 0.30% of the portfolio, at least 50 MAD a quarter. Both before VAT.";

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

// One side, in MAD, VAT included.
function leg(notional) {
  return (Math.max(notional * BROKERAGE, BROKERAGE_MIN) + notional * SBVC + notional * SETTLEMENT) * (1 + VAT);
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
    cashCurrency: "",
    url: PAGE,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue CDG Capital n'existe pas encore : lancer `node brokers/cdgcapital/cdgcapital_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue CDG Capital` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez CDG Capital`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "cdgcapital",
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
    cashCurrency: listing.currency,
    basis:
      `ordre en ligne, page Tarifications de CDG Capital relue le ${READ_ON}. ` +
      `Courtage 0,60 % HT min 10 MAD HT par ordre, commission SBVC 0,10 % HT, règlement/livraison 0,20 % HT, ` +
      `TVA 10 % sur l'ensemble, chaque sens.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const one = leg(notional);
  const brokerFees = dollars(one + one, listing.currency);
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
  const rate = (BROKERAGE + SBVC + SETTLEMENT) * (1 + VAT);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy: rate, sell: rate, min: BROKERAGE_MIN * (1 + VAT), currency: listing.currency },
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
