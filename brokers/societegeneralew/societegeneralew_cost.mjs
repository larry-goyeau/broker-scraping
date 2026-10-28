// What one round trip costs at Société Générale Capital Securities West
// Africa (SGCS, Société Générale's Abidjan SGI, reached through Société
// Générale Côte d'Ivoire's online broker): buy n shares on the BRVM and sell
// them straight back, in dollars. Every catalogue line is a franc CFA (XOF)
// line and the account is held in XOF, so nothing is converted.
//
// https://particuliers.societegenerale.ci/fileadmin/user_upload/SG_Cote_ivoire/migrated/CB_particuliers.pdf
// read on 2026-10-26: "Conditions générales de banque applicables à la
// clientèle des particuliers à juillet 2026", columns "F CFA / HT":
//   9.7.2.1 Achat/Vente           "0,8 % max. avec min. 1 000 Fcfa",
//                                 of the transaction amount.
//   4.2.5 Achat/vente de titres   "0,8% du montant de la transaction"
//   boursiers (via CONNECT)       (the online channel; same rate).
//   9.7.2.4 Transactions sur dossier, same rate (not an online order).
//   9.7.3.1 Droit de garde        0.5 % a year up to 10 million FCFA,
//                                 0.26 % above, minimum 1,250 FCFA a
//                                 quarter (in the remark).
//   9.7.4.2/3 Valorisation 0.0075 % and CREPMF 0.0025 % a quarter of the
//                                 portfolio (0.04 % a year, left out).
//   9.7.4.4 Accès à la Bourse en ligne 1,100 FCFA a month (in the remark).
// "0,8 % max." is the ceiling; it is the rate used, each side, with the
// 1,000 FCFA minimum.
// The exchange lines are the BRVM's own, https://www.brvm.org/fr/node/312
// read on 2026-10-26: "0.2 % et 0.1 % du montant de la transaction payables
// par l'Acheteur et par le Vendeur" (BRVM and DC/BR). They are in usd, not
// in brokerFees. The courtage is printed HT; an Ivorian SGI's commission
// pays the TOB, "10 % sur une base hors taxes" (Code général des impôts,
// art. 395 and 401, https://a-tla.org/cote-divoire/code-general-des-impots),
// each side, on the courtage only. These lines are computed by
// brokers/societegeneralew/brvmCost.mjs, shared by the Abidjan SGIs.
// In the total: book, courtage, BRVM, DC/BR and the TOB; brokerFees is the
// courtage alone, parts.réglementaire the BRVM, DC/BR and TOB lines.
// The BRVM book is not stored, so the total stays unknown until it is.
//
//   node brokers/societegeneralew/societegeneralew_cost.mjs ORAC BRVM XOF --shares=28 --price=20200
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { brvmLegs, isBrvmXof, BRVM_PAGE, CI_TAX_PAGE, MARKET_BASIS, TAX_BASIS } from "./brvmCost.mjs";

const CATALOGUE = new URL("societegeneralew-parsed.json", import.meta.url);
const PAGE = "https://particuliers.societegenerale.ci/fileadmin/user_upload/SG_Cote_ivoire/migrated/CB_particuliers.pdf";
const READ_ON = "2026-10-26";
const BROKER = "Société Générale Capital Securities West Africa";
const SIDE = { rate: 0.008, min: 1000 };
const CASH = "XOF";
const REMARK = "Custody 0.5% a year up to 10M FCFA (0.26% above), at least 1,250 FCFA a quarter. Online access 1,100 FCFA a month.";

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
    cashCurrency: CASH,
    url: PAGE,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/societegeneralew/societegeneralew_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${BROKER}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${BROKER}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "societegeneralew",
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
    basis:
      `conditions générales Société Générale Côte d'Ivoire (juillet 2026, F CFA HT) relues le ${READ_ON} : achat/vente ` +
      `0,8 % max. du montant avec min. 1 000 FCFA chaque sens (9.7.2.1) ; ordre en ligne via CONNECT 0,8 % du montant (4.2.5). ` +
      `Le maximum est retenu. ${TAX_BASIS} ${MARKET_BASIS}`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { fees: PAGE, market: BRVM_PAGE, tax: CI_TAX_PAGE },
  };
  if (!isBrvmXof(listing)) {
    return { ...shared, why: `${BROKER} ne publie un barème que pour la BRVM en francs CFA ; ${listing.exchange} ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const legs = brvmLegs({ notional, buy: SIDE });
  const brokerFees = dollars(legs.courtage, listing.currency);
  const levies = dollars(legs.levies, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levies);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate: SIDE.rate, min: SIDE.min, buy: legs.buy.courtage, sell: legs.sell.courtage, currency: listing.currency, eachWay: true },
    market: {
      brvm: legs.buy.brvm,
      dcbr: legs.buy.dcbr,
      tob: legs.buy.tax,
      eachWay: true,
      levies: legs.levies,
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(levies, 6),
    },
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
