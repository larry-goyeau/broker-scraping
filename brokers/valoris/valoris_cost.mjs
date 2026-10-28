// What one round trip costs at Valoris Securities: buy n shares, sell them
// back, in dollars. Online order (Valoris Bourse Direct) on a listed
// Casablanca share.
//
// https://www.valorisgroup.ma/upload/vs/PP/Grille_tarifaire.pdf read on
// 2026-10-26. Every line is before tax, "(+TVA 10%)" printed on each.
//   Brokerage           "Volume < 500.000 DH 0.6% HT": the first band of
//                       the yearly volume scale (0.5 % from 500,000 MAD,
//                       0.4 % from 5 M, 0.3 % from 10 M, 0.2 % from 50 M).
//                       One trade of about 1,000 USD sits in the first
//                       band; no floor is printed.
//   Exchange            "Commission d'enregistrement de la Bourse 0.1% HT".
//   Settlement          "Volume < 5.000.000 DH 0.2% HT", "Min 15.00 DH"
//                       (the floor printed on the settlement block).
//   Letter              "Commission de port de lettre par transaction
//                       2.00 DH HT".
//   VAT                 10 % on every line.
//   Custody             0.2 % a year below 2 M MAD, at least 200 MAD,
//                       taken each quarter.
// https://www.valorisgroup.ma/upload/vs/BEL/Convention_BEL.pdf (online
// agreement, article 7): online orders are billed on that same scale and
// "Les frais d'abonnement Web s'élèvent à 75 MAD HT" a month.
//   Book                the Casablanca (XCAS) leaf of spreads/book.mjs.
//
// In the total: the book, then (0.6 % + 0.1 % + settlement with its
// 15 MAD floor + 2 MAD) x 1.10, each side. The floor binds below 7,500
// MAD a trade. Remark: the lower volume bands, the web subscription and
// custody, which depend on the year, the month and the portfolio, not on
// the trade. Left out: the dividend fee and the transfer-out fee. The
// account holds dirhams only and every line is in MAD, so there is no
// conversion. Casablanca prints no transaction tax.
//
//   node brokers/valoris/valoris_cost.mjs ADH Casablanca MAD --shares=300 --price=30
//   node brokers/valoris/valoris_cost.mjs ATW Casablanca MAD --shares=14 --price=700
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("valoris-parsed.json", import.meta.url);
const PAGE = "https://www.valorisgroup.ma/upload/vs/PP/Grille_tarifaire.pdf";
const READ_ON = "2026-10-26";
const BROKERAGE = 0.006;
const SBVC = 0.001;
const SETTLEMENT = 0.002;
const SETTLEMENT_MIN = 15;
const LETTER = 2;
const VAT = 0.1;
const REMARK =
  "Brokerage falls from 0.6% to 0.5% above 500,000 MAD traded a year, down to 0.2% above 50 M. " +
  "Online access is 75 MAD a month. Custody is 0.2% a year, at least 200 MAD. All before VAT.";

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
  return (notional * BROKERAGE + notional * SBVC + Math.max(notional * SETTLEMENT, SETTLEMENT_MIN) + LETTER) * (1 + VAT);
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
    return { ...answer, why: "le catalogue Valoris n'existe pas encore : lancer `node brokers/valoris/valoris_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Valoris` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Valoris`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "valoris",
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
      `ordre en ligne (Valoris Bourse Direct), grille tarifaire Valoris Securities relue le ${READ_ON}. ` +
      `Courtage 0,6 % HT (tranche de volume annuel < 500 000 MAD), commission d'enregistrement de la Bourse 0,1 % HT, ` +
      `règlement/livraison 0,2 % HT min 15 MAD, port de lettre 2 MAD HT, TVA 10 % sur l'ensemble, chaque sens.`,
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
    commission: { buy: rate, sell: rate, fixed: LETTER * (1 + VAT), currency: listing.currency },
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
