// What one round trip costs at GEK Capital, an Abidjan SGI: buy n shares on
// the BRVM through its online platform and sell them straight back, in
// dollars. Every catalogue line is a franc CFA (XOF) line and the account is
// held in XOF, so nothing is converted.
//
// https://www.brvm.org/sites/default/files/decision_ndegpamf-umoa_-_036_-_2025_-_homologation_des_tarifs_de_la_sgi_gek_capital.pdf
// read on 2026-10-21: Décision PAMF-UMOA/2025/036 of 14 January 2025, the
// regulator's (AMF-UMOA) approval of GEK Capital's "conditions générales de
// tarification", the only GEK tariff on the BRVM site. Secondary market:
//   Courtage, ordinary transactions   0.10 % to 1 % of the transaction.
//   Courtage, "sur dossier"           0.10 % to 0.81 %, not an online order.
//   Conservation                      0.10 % to 0.50 % a year of the
//                                     portfolio.
//   Transfer of securities            0.10 % a line, 5,000 to 34,375 FCFA
//                                     (not a trade).
// The approval gives a range. The rate charged is the SGI's own order
// simulator, https://gekcapital.com/fr/simulateur/ read the same day:
//   "SIMULATION ACHAT DE TITRES"   Commissions GEK CAPITAL: the label says
//                                  0,8 %, the formula takes 1 % of the gross
//                                  amount. The formula is what the client
//                                  is shown, and it is the approved ceiling;
//                                  1 % is used.
//   "SIMULATION VENTE DE TITRES"   Commissions GEK CAPITAL 0.8 % (label and
//                                  formula agree).
//   Both                           DC/BR 0.1 %, Courtage BRVM 0.2 %, and
//                                  "TAF (10% sur commissions GEK CAPITAL)".
// The 10 % is the Ivorian tax on the SGI's commission (the TOB, "10 % sur
// une base hors taxes", Code général des impôts, art. 395 and 401, as in
// brokers/macafrican). The BRVM and DC/BR lines are
// the BRVM's own, https://www.brvm.org/fr/node/312, payable by the buyer and
// by the seller. In the total: book, courtage, BRVM, DC/BR and the tax on
// the courtage; brokerFees is the courtage alone. In the remark: custody,
// at the top of its range. The BRVM book is not stored, so the total stays
// unknown until it is.
//
//   node brokers/gekcapital/gekcapital_cost.mjs SNTS BRVM XOF --shares=10 --price=25000
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("gekcapital-parsed.json", import.meta.url);
const PAGE = "https://gekcapital.com/fr/simulateur/";
const TARIFF = "https://www.brvm.org/sites/default/files/decision_ndegpamf-umoa_-_036_-_2025_-_homologation_des_tarifs_de_la_sgi_gek_capital.pdf";
const BRVM_PAGE = "https://www.brvm.org/fr/node/312";
const TAX_PAGE = "https://a-tla.org/cote-divoire/code-general-des-impots";
const READ_ON = "2026-10-21";
const BROKER = "GEK Capital";
const BUY = 0.01;
const SELL = 0.008;
const BRVM = 0.002;
const DCBR = 0.001;
const TOB = 0.1;
const CASH = "XOF";
const REMARK = "Custody up to 0.5% a year.";

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
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/gekcapital/gekcapital_scraping.mjs\`` };
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
    broker: "gekcapital",
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
      `simulateur ${BROKER} relu le ${READ_ON} : courtage 1 % à l'achat (formule ; l'étiquette dit 0,8 %), 0,8 % à la vente, ` +
      `dans la fourchette homologuée 0,10 %–1 % (décision PAMF-UMOA/2025/036). Taxe ivoirienne 10 % sur le courtage. ` +
      `Commissions BRVM 0,2 % et DC/BR 0,1 % du montant, à l'achat et à la vente.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { fees: PAGE, tariff: TARIFF, market: BRVM_PAGE, tax: TAX_PAGE },
  };
  if (listing.currency !== CASH || listing.mic !== "XBRV") {
    return { ...shared, why: `${BROKER} ne publie un barème que pour la BRVM en francs CFA ; ${listing.exchange} ${listing.currency} n'est pas couvert` };
  }
  if (listing.type && listing.type !== "STOCK") {
    return { ...shared, why: `${BROKER} ne publie ici que le courtage des actions ; ${listing.type} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const buy = notional * BUY;
  const sell = notional * SELL;
  const marketEach = notional * (BRVM + DCBR);
  const brokerFees = dollars(buy + sell, listing.currency);
  const levies = dollars(marketEach * 2 + (buy + sell) * TOB, listing.currency);
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
    commission: { buyRate: BUY, sellRate: SELL, buy, sell, currency: listing.currency },
    market: { brvm: notional * BRVM, dcbr: notional * DCBR, tob: (buy + sell) * TOB, eachWay: true, currency: listing.currency },
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
