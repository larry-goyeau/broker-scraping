// What one round trip costs at Share Invest (SSIF Share Invest, Craiova):
// buy n shares at price p on the Bucharest Stock Exchange (regulated
// market, AeRO, SMT Intl), online through Arena XT, sell them back at
// once, in dollars.
//
// Fee page "TAXE SI COMISIOANE", read on 2026-10-26:
//   "Share Invest SA percepe un comision pentru fiecare tranzacție de
//   cumpărare sau vânzare astfel:
//     Pentru rulaj anual mai mic de 50.000 lei                1,5%
//     Pentru rulaj anual între 50.001 lei și 150.000 lei      1,0%
//     Pentru rulaj anual mai mare de 150.000 lei              0,7%
//     Pentru tranzacțiile intra-day                           0,5%"
// "Rulajul anual" is buys plus sells in a calendar year; a lower band is
// granted by an addendum at the client's request. Nothing on file has a
// turnover, so the first band, 1.5 % a side, is the price; the other bands
// go in the remark as "x% lower", a cut of that commission (33 %, 53 %).
// An intraday trip pays 0.5 % a side: "Same day sell fees are 67% lower."
// No minimum and no fixed order fee are printed (the contract template
// has a fixed-fee field; the page sets none). Online access is free
// (contract annex "TRANZACŢIONARE ONLINE": "Accesul este gratuit").
//
// The Central Depository page (Taxe_si_comisioane_DC.pdf) lists statements,
// transfers by succession and dividend processing, not trades; no exchange
// or ASF levy is printed, so none is added. Bank charges are not a trade.
//
// Cash: one client account in lei at BCR Craiova ("Contul in care clientii
// pot vira banii destinati cumpararii de actiuni"); every line is in lei,
// so no conversion and no FX remark.
//
// Book: the BVB touch (spreads/bvb-touch.mjs, through spread.json).
// Romania has no transaction tax on shares; capital-gains tax is personal.
//
//   https://www.shareinvest.ro/taxe-si-comisioane.php
//   https://www.shareinvest.ro/docs/Taxe_si_comisioane_DC.pdf
//   https://www.shareinvest.ro/docs/PF_2025.03.25_V1.doc
//
//   node brokers/shareinvest/shareinvest_cost.mjs TLV BVB RON --shares=125 --price=35.7
//   node brokers/shareinvest/shareinvest_cost.mjs TVBETETF BVB RON --shares=80 --price=57.16
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const FOLDER = "shareinvest";
const CATALOGUE = new URL("shareinvest-parsed.json", import.meta.url);
const PAGE = "https://www.shareinvest.ro/taxe-si-comisioane.php";
const READ_ON = "2026-10-26";
const RATE = 0.015; // annual turnover below 50,000 lei, each side
const MID = 0.01; // 50,001 to 150,000 lei
const HIGH = 0.007; // above 150,000 lei
const INTRADAY = 0.005;
// A rate as a cut of the first band's commission.
const lower = (rate) => `${Math.round(((RATE - rate) / RATE) * 100)}% lower`;
const REMARK = [
  `Same day sell fees are ${lower(INTRADAY)}.`,
  `50,000 RON or more traded a year: fees are ${lower(MID)}; over 150,000 RON: ${lower(HIGH)}.`,
].join("\n");

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
    return { ...answer, why: "le catalogue Share Invest n'existe pas encore : lancer `node brokers/shareinvest/shareinvest_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Share Invest` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Share Invest`,
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
    `page « Taxe si comisioane » de Share Invest, relue le ${READ_ON} : chiffre d'affaires annuel inférieur à 50 000 lei ` +
    `(première tranche), 1,5 % de chaque transaction d'achat ou de vente ; aucun minimum, aucun forfait par ordre ; ` +
    `aucune taxe de bourse, ASF ou Depozitarul Central imprimée sur une transaction`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: "RON",
    remark: REMARK,
    basis,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== "RON") {
    return { ...shared, why: `${listing.currency} n'a pas de ligne dans le barème Share Invest (lei seulement)` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, "RON");
  const sideLei = notional * RATE;
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
    commission: { rate: RATE, side: sideLei, currency: "RON", eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
    },
    confidence: [
      basis,
      "chiffre d'affaires annuel inconnu : la première tranche est retenue, les autres et le taux intraday (0,5 %) sont dans la remarque",
      "aucun aller-retour réel chez Share Invest dans ce dépôt",
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
    console.error("usage : node brokers/shareinvest/shareinvest_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
