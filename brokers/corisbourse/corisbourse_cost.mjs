// What one round trip costs at Coris Bourse, the Ouagadougou SGI of the
// Coris group: buy n shares on the BRVM through the My Coris Bourse app and
// sell them straight back, in dollars. Every catalogue line is a franc CFA
// (XOF) line and the account is funded in XOF, so nothing is converted.
//
// https://www.brvm.org/sites/default/files/decision_pcr_da_2018_052_coris_bourse_homologation_tarifs.pdf
// read on 2026-10-19: Décision PCR/DA/2018/052 of 29 January 2018, the
// regulator's (CREPMF, now AMF-UMOA) approval of Coris Bourse's "conditions
// générales de tarification", the only Coris Bourse tariff on the BRVM site.
// The SGI's own site prints no grid. Secondary market:
//   Courtage, ordinary transactions   maximum 1 % of the transaction
//                                     amount; no side printed, taken on
//                                     each side. The ceiling is used.
//   Courtage, "sur dossier"           maximum 0.5 %, not an online order.
//   Conservation                      maximum 0.5 % a year of the portfolio.
//   Tenue de compte                   maximum 10,000 FCFA, flat, no period
//                                     printed.
//   Transfer of securities            maximum 15,000 FCFA a line (not a
//                                     trade).
// The exchange lines are the BRVM's own, https://www.brvm.org/fr/node/312
// read the same day: BRVM 0.2 % and DC/BR 0.1 % of the transaction,
// "payables par l'Acheteur et par le Vendeur". They are in usd, not in
// brokerFees. The same page says the contract note also carries "les
// taxes"; the tariff does not say whether its rates are before or after
// tax. That tax is Burkina Faso's taxe sur les activités financières (TAF),
// created by article 28 of the 2021 finance law: 17 % of the gross
// commissions of anyone "réalisant de l'intermédiation financière", in place
// of VAT, read on 2026-10-19 in the tax office's interview at
// https://www.sidwaya.info/nouvelle-taxe-sur-les-activites-financieres-les-operations-soumises-a-la-taf-sont-exonerees-de-la-tva-dixit-linspecteur-des-impots-idrissa-ouedraogo/
// The tariff's rates are taken as before tax, so 17 % is added to the
// courtage on each side.
// The BRVM book is not stored either.
//
//   node brokers/corisbourse/corisbourse_cost.mjs SNTS BRVM XOF --shares=10 --price=25000
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("corisbourse-parsed.json", import.meta.url);
const PAGE = "https://www.brvm.org/sites/default/files/decision_pcr_da_2018_052_coris_bourse_homologation_tarifs.pdf";
const BRVM_PAGE = "https://www.brvm.org/fr/node/312";
const READ_ON = "2026-10-19";
const BROKER = "Coris Bourse";
const COURTAGE = 0.01;
const BRVM = 0.002;
const DCBR = 0.001;
// TAF on the commission, each side.
const COMMISSION_TAX = 0.17;
const TAX_PAGE = "https://www.sidwaya.info/nouvelle-taxe-sur-les-activites-financieres-les-operations-soumises-a-la-taf-sont-exonerees-de-la-tva-dixit-linspecteur-des-impots-idrissa-ouedraogo/";
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
const joinRemark = (...xs) => xs.map((x) => String(x || "").trim()).filter(Boolean).join(" ");

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
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/corisbourse/corisbourse_scraping.mjs\`` };
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
    broker: "corisbourse",
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
    remark: joinRemark(m.row.remark, REMARK),
    listing,
    basis:
      `tarifs homologués ${BROKER} (décision PCR/DA/2018/052) relus le ${READ_ON} : courtage au plus 1 % du montant, ` +
      `pris au plafond, chaque sens. Commissions BRVM 0,2 % et DC/BR 0,1 % du montant, à l'achat et à la vente. ` +
      `TAF burkinabè 17 % (loi de finances 2021, art. 28) ajoutée au courtage.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { fees: PAGE, market: BRVM_PAGE, tax: TAX_PAGE },
  };
  if (listing.currency !== CASH || listing.mic !== "XBRV") {
    return { ...shared, why: `${BROKER} ne publie un barème que pour la BRVM en francs CFA ; ${listing.exchange} ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = notional * COURTAGE;
  const marketEach = notional * (BRVM + DCBR);
  const brokerFees = dollars(each * 2, listing.currency);
  const levies = dollars(marketEach * 2, listing.currency);
  const taxEach = COMMISSION_TAX == null ? null : each * COMMISSION_TAX;
  const tax = taxEach == null ? null : dollars(taxEach * 2, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levies, tax);
  const why = [
    bookUsd == null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    tax == null ? `taux de la taxe sur le courtage d'une SGI burkinabè non publié` : null,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(usd == null && why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate: COURTAGE, ceiling: true, each, buy: each, sell: each, currency: listing.currency, eachWay: true },
    market: { brvm: notional * BRVM, dcbr: notional * DCBR, tax: taxEach, eachWay: true, currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(levies, 6),
      taxe: finite(tax, 6),
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
