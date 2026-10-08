// What one round trip costs at CIH, whose online book is CDG Capital
// Bourse: buy n shares, sell them back, in dollars. Online order on a
// listed Casablanca share.
//
// https://www.cihbank.ma/themes/ciht/pdf/Tarification_particuliers_VF.pdf
// read on 2026-10-06. The guide was updated on 4 July 2025. Prices are
// before tax.
//   Order collection     0.10 % of the order, each side.
//   Settlement           0.20 % of the amount paid or received, each side.
//                        CDG Capital's custody sheet prints the same 0.20 %.
//   Brokerage            0.60 % before tax. The December 2022 CIH capital
//                        increase prints this as the société de bourse
//                        commission, billed by the account keeper. CDG
//                        Capital Bourse does not publish another rate.
//   Bourse commission    0.10 % before tax, same prospectus, and the
//                        exchange's negotiation commission.
//   VAT                  10 % on those commissions. CDG Capital prints
//                        "TVA à 10 %" on its custody sheet. The prospectus
//                        adds the same 10 % on top of brokerage, the bourse
//                        commission and settlement.
//   Custody              0.075 % to 0.30 % by the size of the portfolio,
//                        at least 50 MAD. The portfolio is not an input,
//                        so it stays in the remark.
//   Casablanca           no book is published here
//
//   node brokers/cih/cih_cost.mjs ADH Casablanca MAD --shares=10 --price=30
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("cih-parsed.json", import.meta.url);
const PAGE = "https://www.cihbank.ma/themes/ciht/pdf/Tarification_particuliers_VF.pdf";
const READ_ON = "2026-10-06";
const COLLECTION = 0.001;
const SETTLEMENT = 0.002;
const BROKERAGE = 0.006;
const BOURSE = 0.001;
const VAT = 0.1;
const RATE = (COLLECTION + SETTLEMENT + BROKERAGE + BOURSE) * (1 + VAT);
const CUSTODY = "Custody is 0.075% to 0.30% a year by the portfolio, at least 50 MAD.";

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
    remark: CUSTODY,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue CIH n'existe pas encore : lancer `node brokers/cih/cih_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue CIH` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez CIH`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "cih",
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
      `livraison en ligne, guide CIH du 4 juillet 2025 relu le ${READ_ON}. ` +
      `Collecte 0,10 % et règlement 0,20 % hors taxe. Courtage 0,60 % et commission de bourse 0,10 % hors taxe, prospectus CIH de décembre 2022. TVA 10 % sur l'ensemble, chaque sens.`,
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
  const one = notional * RATE;
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

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy: RATE, sell: RATE, currency: listing.currency },
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
