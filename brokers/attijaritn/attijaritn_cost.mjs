// What one round trip costs at Attijari Intermédiation, the Tunis broker
// of Attijari Bank Tunisie: buy n shares on the Bourse de Tunis, sell them
// straight back, in dollars. Self-directed account ("gestion libre"), order
// sent on the Attijari Bourse site or app. Every catalogue line is a dinar
// (TND) line and the account holds dinars only, so nothing is converted.
//
// https://ati.attijaribourse.com.tn/AttijariBourse/assets/documents/CONVENTION_ORDINAIRE_LIBRE.pdf
// read on 2026-10-21 (served since 16 August 2023, PDF made 3 April 2020),
// article 9, the tariff of the ordinary free account. Fees are printed
// before VAT ("hors TVA"):
//   Courtage                 0.6 % "par contrat de négociation", each side.
//                            No floor is printed.
//   Custody                  0.2 % a year of the portfolio, at least 10 DT.
//                            A real yearly cost: in the remark.
//   Opening free, transfer 5 DT a line, closing 20 DT, mail 0.350 DT,
//   dividends free: not trades, left out.
// https://ati.attijaribourse.com.tn/AttijariBourse/assets/documents/CONVENTION_CEA_LIBRE.pdf
// (same day): the equity savings account prints the same 0.6 % courtage,
// custody 0.2 % a year with a 10 DT floor and a 200 DT cap. Same trade
// cost, so no separate row.
// https://ati.attijaribourse.com.tn/AttijariBourse/assets/documents/CONVENTION_SITE_WEB.pdf
// (same day): the web order service bills "les conditions tarifaires en
// vigueur", i.e. the article 9 tariff above.
//
// Statutory lines (article 9: "taxes et commissions sur les transactions
// boursières ... conformément à la législation en vigueur, en sus"):
//   Bourse commission (CTB)  0.15 % of the trade, paid by the buyer and by
//                            the seller, at most 40,000 DT a side.
//                            https://tunis-stockexchange.com/en/investir-en-bourse
//                            (read 2026-10-21: "0.15% of the transaction
//                            volume", amounts excl. VAT) and the Finance
//                            Minister's order of 27 March 1996 as amended,
//                            article 6 (0.15 % each side on listed shares,
//                            40,000 DT cap since 15 May 2020):
//                            https://bvmt.com.tn/sites/default/files/articles/reglementation/fr/arr_270396_fr_v2016.pdf
//                            The CMF's share is 23 % of that commission
//                            (article 1), not an extra line. Shares traded
//                            but not listed (hors cote, BVMT group 13) have
//                            a 0.30 % ceiling and no applied rate printed:
//                            those lines are N/A.
//   VAT                      19 %, the general rate (Code de la TVA,
//                            article 7, LF 2018 art. 43), on the courtage
//                            and on the bourse commission, each side.
//                            https://chaexpert.com/documents/Code%20de%20la%20taxe%20sur%20la%20valeur%20ajout%C3%A9e%202022.pdf
//                            Tunisie Valeurs prints the same "TVA de 19%"
//                            on its courtage:
//                            https://www.tunisievaleurs.com/nos-conditions-tarifaires/
//
// In the total: the book, courtage both ways (brokerFees), and the bourse
// commission plus VAT on both lines (réglementaire). In the remark: custody.
// The Bourse de Tunis book is not stored, so the total stays unknown until
// it is; brokerFees is still given.
//
//   node brokers/attijaritn/attijaritn_cost.mjs AB Tunis TND --shares=100 --price=40
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("attijaritn-parsed.json", import.meta.url);
const PAGE = "https://ati.attijaribourse.com.tn/AttijariBourse/assets/documents/CONVENTION_ORDINAIRE_LIBRE.pdf";
const CEA_PAGE = "https://ati.attijaribourse.com.tn/AttijariBourse/assets/documents/CONVENTION_CEA_LIBRE.pdf";
const WEB_PAGE = "https://ati.attijaribourse.com.tn/AttijariBourse/assets/documents/CONVENTION_SITE_WEB.pdf";
const BOURSE_PAGE = "https://tunis-stockexchange.com/en/investir-en-bourse";
const ORDER_PAGE = "https://bvmt.com.tn/sites/default/files/articles/reglementation/fr/arr_270396_fr_v2016.pdf";
const VAT_PAGE = "https://chaexpert.com/documents/Code%20de%20la%20taxe%20sur%20la%20valeur%20ajout%C3%A9e%202022.pdf";
const READ_ON = "2026-10-21";
const BROKER = "Attijari";
const COURTAGE = 0.006;
const CTB = 0.0015;
const CTB_CAP = 40000;
const VAT = 0.19;
const CASH = "TND";
const HORS_COTE = "13";
const REMARK = "Custody is 0.2% a year, at least 10 TND; at most 200 TND on the CEA.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const boardGroup = (row) => String(row?.raw || "").match(/\bgroup (\d+)\b/)?.[1] ?? null;

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
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/attijaritn/attijaritn_scraping.mjs\`` };
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
    broker: "attijaritn",
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
      `convention de compte ordinaire « gestion libre » ${BROKER} relue le ${READ_ON}, article 9 : courtage 0,6 % hors TVA ` +
      `par contrat, chaque sens, sans minimum (même taux pour le CEA et pour les ordres passés sur le site). ` +
      `Commission de bourse 0,15 % à l'achat et à la vente, plafonnée à 40 000 DT par côté ` +
      `(arrêté du 27 mars 1996 modifié, art. 6, et page de la Bourse de Tunis). TVA 19 % sur le courtage et la commission de bourse.`,
    confidence: "élevée pour les frais : taux unique publié par le courtier et par la Bourse de Tunis",
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { fees: PAGE, cea: CEA_PAGE, web: WEB_PAGE, market: BOURSE_PAGE, order: ORDER_PAGE, vat: VAT_PAGE },
  };
  if (listing.currency !== CASH || listing.mic !== "XTUN") {
    return { ...shared, why: `${BROKER} ne publie un barème que pour la Bourse de Tunis en dinars ; ${listing.exchange} ${listing.currency} n'est pas couvert` };
  }
  if (boardGroup(m.row) === HORS_COTE) {
    return {
      ...shared,
      why: "valeur du hors-cote (groupe 13) : la Bourse de Tunis ne publie pas le taux appliqué de sa commission sur ce marché (plafond 0,30 % par côté)",
    };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = notional * COURTAGE;
  const ctbEach = Math.min(notional * CTB, CTB_CAP);
  const vatEach = (each + ctbEach) * VAT;
  const brokerFees = dollars(each * 2, listing.currency);
  const levies = dollars((ctbEach + vatEach) * 2, listing.currency);
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
    commission: { rate: COURTAGE, each, buy: each, sell: each, currency: listing.currency, eachWay: true },
    market: { ctb: ctbEach, vat: vatEach, eachWay: true, currency: listing.currency },
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
