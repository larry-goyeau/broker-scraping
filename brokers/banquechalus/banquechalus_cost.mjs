// What one round trip costs at Banque Chalus (Invest Store, its online
// stock-market service): buy n shares at price p on Euronext Paris, sell
// them back at once, online, in dollars. Shares, ETFs, ETCs and ETNs of the
// Paris book (the catalogue's only place).
//
// "Principales conditions tarifaires - Particuliers", en vigueur au 1er
// janvier 2026 (file dated 22-10-2025), read on 2026-10-26:
//   https://www.banque-chalus.fr/content/dam/assetsca/cr764/npc/documents/tarifs/2026/conditions-tarifaires-particulier-22-10-2025.pdf
//
//   Commission     "Les ordres de bourse en France - Achat et vente d'actions
//                  ou d'obligations en Bourse de Paris", compte titres, "Par
//                  internet": 0,63 %, "Frais fixes (forfait à la ligne)"
//                  2,60 €, "Montant minimum (hors frais fixes à la ligne)"
//                  8,10 €. Each way: max(8.10 €, 0.63 %) + 2.60 €. The phone
//                  column (1.44 %, 5.20 €, min 11.50 €) is not online.
//   Market fees    the same line says "hors frais de marché prélevés en sus
//                  et variables selon le lieu d'exécution de l'ordre". No
//                  amount is printed, by the bank or (searched) by another
//                  Crédit Agricole regional bank. Unknown + x = unknown: the
//                  total is N/A; brokerFees still carries the commission.
//   Subscription   "Service de bourse en ligne - Invest Store Initial 2,90
//                  €/mois" under the online-banking subscriptions. Monthly,
//                  not per trip: remark.
//   Custody        compte titres, per year: 5,30 € per French line + 0,34 %
//                  of value ("Autres valeurs françaises"), 16 € per foreign
//                  line + 0,60 % ("Actions et obligations étrangères"),
//                  minimum 40 € per account. Holding cost: remark.
//   Taxes          French TTF 0.40 % on the buy of a French share, from
//                  taxMap.mjs; a French share with no tax-map line is N/A
//                  (taxGap).
//   FX             every kept Paris line trades in euros, the account's
//                  currency: none.
//
// Left out: the PEA / PEA-PME column (0.50 %), foreign markets (1.84 %, min
// 50.10 €, not in this catalogue), OPC subscriptions, Invest Store Intégral
// (no separate trading grid printed).
//
//   node brokers/banquechalus/banquechalus_cost.mjs TTE XPAR EUR --shares=17 --price=58
//   node brokers/banquechalus/banquechalus_cost.mjs CW8 XPAR EUR --shares=2 --price=600
//   node brokers/banquechalus/banquechalus_cost.mjs AIR XPAR EUR --shares=5 --price=180
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const BROKER = "banquechalus";
const NAME = "Banque Chalus";
const CATALOGUE = new URL(`${BROKER}-parsed.json`, import.meta.url);
const PAGE =
  "https://www.banque-chalus.fr/content/dam/assetsca/cr764/npc/documents/tarifs/2026/conditions-tarifaires-particulier-22-10-2025.pdf";
const READ_ON = "2026-10-26";
const SHEET = "conditions tarifaires particuliers Banque Chalus en vigueur au 1er janvier 2026";
const CASH = "EUR";
const PARIS = { label: "Bourse de Paris, compte titres, par internet", ccy: "EUR", rate: 0.0063, min: 8.1, fixed: 2.6 };
// "hors frais de marché prélevés en sus": no amount printed anywhere.
const MARKET_FEE = null;
const REMARK_FR = "Invest Store costs €2.90/month. Custody 0.34% a year + €5.30/line (min €40).";
const REMARK_FOREIGN = "Invest Store costs €2.90/month. Custody 0.60% a year + €16/line (min €40).";

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
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

// One side, in euros: the 0.63 % with its 8.10 € floor, plus the 2.60 € line fee.
export function commissionEach(amountEur) {
  if (amountEur == null) return null;
  return Math.max(PARIS.min, amountEur * PARIS.rate) + PARIS.fixed;
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
    remark: REMARK_FR,
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue ${NAME} n'existe pas encore : lancer \`node brokers/${BROKER}/${BROKER}_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${NAME}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${NAME}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: BROKER,
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
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = listing.isin ? taxesOf(listing.isin) : null;
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const basis =
    `${SHEET}, relues le ${READ_ON} : ${PARIS.label} ${(PARIS.rate * 100).toLocaleString("fr-FR")} % ` +
    `min ${PARIS.min.toLocaleString("fr-FR")} € plus ${PARIS.fixed.toLocaleString("fr-FR")} € de frais fixes à la ligne, ` +
    `par sens, « hors frais de marché prélevés en sus » (montant non imprimé)`;
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    basis,
    remark: listing.isin && !listing.isin.startsWith("FR") ? REMARK_FOREIGN : REMARK_FR,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `${listing.currency} : ligne hors euro, aucun change imprimé pour la Bourse de Paris` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = commissionEach(notional);
  const commissionUsd = each == null ? null : dollars(each * 2, PARIS.ccy);
  const marketUsd = MARKET_FEE == null ? null : dollars(MARKET_FEE * 2, PARIS.ccy);
  const brokerFees = commissionUsd;
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, marketUsd, taxUsd);
  const floored = notional * PARIS.rate < PARIS.min;
  const unknown = [
    marketUsd == null ? "« frais de marché prélevés en sus » sans montant publié : total inconnu" : null,
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    commission: { each, currency: PARIS.ccy, eachWay: true, rate: PARIS.rate, min: PARIS.min, fixed: PARIS.fixed, floored },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      "frais de marché": marketUsd == null ? null : finite(marketUsd, 6),
      change: 0,
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      basis,
      floored
        ? `au plancher : ${PARIS.min.toLocaleString("fr-FR")} € + ${PARIS.fixed.toLocaleString("fr-FR")} € par sens, le taux n'en donnerait que ${(notional * PARIS.rate).toFixed(2)}`
        : `au taux : ${each.toFixed(2)} € par sens, frais fixes compris`,
      "frais de marché en sus non chiffrés, ni par la banque ni par une autre caisse du groupe : total N/A",
      taxTotal ? `taxe à l'achat ${(taxTotal * 100).toFixed(2)} % depuis taxMap.mjs` : "aucune taxe dans taxMap.mjs pour cet ISIN",
      "abonnement Invest Store et droits de garde hors aller-retour ; colonnes PEA et téléphone non comptées",
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
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
