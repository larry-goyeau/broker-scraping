// What one round trip costs at BRM SSIF (SSIF Bursa Romana de Marfuri):
// buy n shares at price p on the Bucharest Stock Exchange (regulated
// market, AeRO, SMT Intl), online through Arena XT, sell them back at
// once, in dollars.
//
// Fee annex "TAXE ȘI COMISIOANE" to the client contract, read on
// 2026-10-26:
//   "Pentru fiecare tranzacție se va percepe un comision procentual
//   aplicat la valoarea totală a fiecarei tranzacţii, fie că este de
//   vânzare sau de cumpărare", by the value of the client's portfolio:
//     0 – 30.000 LEI                 0,55%
//     30.000,01 – 320.000 LEI        0,45%
//     320.000,01 – 1.200.000 LEI     0,35%
//     Peste 1.200.000 LEI            0.25%
//   plus "Tarif fix ordin | Ordin de tranzactionare | La prima executie a
//   ordinului | 1 leu".
// No minimum is printed. A trip of about 1,000 USD (some 4,500 lei) is
// read with a portfolio in the first band, 0.55 % a side; the other bands
// are portfolio the order does not show and go in the remark as "x% lower",
// a cut of the 0.55 % rate (0.45 % = 18 %, 0.35 % = 36 %, 0.25 % = 55 %;
// the 1 leu order fee is apart). The contract also lets
// the agent negotiate the rate (the "___%" line); the printed grid is the
// price.
//
// Exchange, ASF and Central Depository charges: the annex says BRM passes
// on "numai taxele percepute de DEPOZITARUL CENTRAL" for register changes,
// not on trades; no trading levy is printed, so none is added. The 15 lei
// monthly fee is for assisted (non-online) accounts; account opening
// (10 lei), dividend processing (5 lei) and bank charges are not a trade.
//
// Cash: client accounts in lei, dollars and euro ("Cont LEI / USD / EUR
// SSIF BRM Clients", informatii-ssif). Every line here is in lei, a
// deposit currency, so no conversion is in the total; the remark says
// "FX when cash ≠ RON." (bank rate, no figure printed).
//
// Book: the BVB touch (spreads/bvb-touch.mjs, through spread.json).
// Romania has no transaction tax on shares; capital-gains tax is personal.
//
//   https://ssif.brm.ro/wp-content/uploads/TAXE-SI-COMISIOANE-PENTRU-TRANZACTIONAREA-PRIN-BRM.docx
//   https://ssif.brm.ro/informatii-ssif/
//
//   node brokers/brmssif/brmssif_cost.mjs TLV BVB RON --shares=125 --price=35.7
//   node brokers/brmssif/brmssif_cost.mjs TVBETETF BVB RON --shares=80 --price=57.16
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";

const FOLDER = "brmssif";
const CATALOGUE = new URL("brmssif-parsed.json", import.meta.url);
const PAGE = "https://ssif.brm.ro/wp-content/uploads/TAXE-SI-COMISIOANE-PENTRU-TRANZACTIONAREA-PRIN-BRM.docx";
const READ_ON = "2026-10-26";
// Portfolio bands, lei: [upper bound, rate per side]; the first is the price.
const BANDS = [
  { upTo: 30000, rate: 0.0055 },
  { upTo: 320000, rate: 0.0045 },
  { upTo: 1200000, rate: 0.0035 },
  { upTo: Infinity, rate: 0.0025 },
];
const RATE = BANDS[0].rate;
const ORDER_LEI = 1; // "Tarif fix ordin ... 1 leu", each order
const gap = (rate) => `${Math.round(((RATE - rate) / RATE) * 100)}% lower`;
const TIER_REMARK =
  `Portfolio over 30,000 RON: fees are ${gap(BANDS[1].rate)}; over 320,000 RON: ${gap(BANDS[2].rate)}; over 1,200,000 RON: ${gap(BANDS[3].rate)}.`;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  if (amount == null || Number.isNaN(amount)) return null;
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
      if (loose(m.row.mic) === wantPlace) return true;
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
    cashCurrency: "RON",
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue BRM n'existe pas encore : lancer `node brokers/brmssif/brmssif_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue BRM` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez BRM`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: FOLDER,
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
  const basis =
    `annexe « Taxe și comisioane » de BRM, relue le ${READ_ON} : portefeuille jusqu'à 30 000 lei (première tranche), ` +
    `0,55 % de la valeur de chaque transaction, achat comme vente, plus 1 leu par ordre ; aucun minimum ; ` +
    `aucune taxe de bourse, ASF ou Depozitarul Central imprimée sur une transaction`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: "RON",
    remark: [TIER_REMARK, fxRemark("", "RON")].join("\n"),
    basis,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== "RON") {
    return { ...shared, why: `${listing.currency} n'a pas de ligne dans l'annexe BRM (lei seulement)` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, "RON");
  const sideLei = notional * RATE + ORDER_LEI;
  const brokerFees = dollars(2 * sideLei, "RON");
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, "RON"),
  });
  const bookUsd =
    parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees);
  const unknown = [
    notionalUsd == null ? "aucun cours en dollars pour RON dans fx.mjs" : null,
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: "RON" },
    commission: { rate: RATE, order: ORDER_LEI, side: sideLei, currency: "RON", eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
    },
    confidence: [
      basis,
      "tranche de portefeuille inconnue : la première (jusqu'à 30 000 lei) est retenue, les autres sont dans la remarque",
      "taux négociable avec l'agent (ligne « ___ % » du contrat) : la grille imprimée fait foi",
      "aucun aller-retour réel chez BRM dans ce dépôt",
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
  if (!etf) {
    console.error("usage : node brokers/brmssif/brmssif_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
