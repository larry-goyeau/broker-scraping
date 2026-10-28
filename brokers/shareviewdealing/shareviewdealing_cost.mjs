// What one round trip costs at Shareview Dealing (Equiniti Financial
// Services Limited), certificated dealing: buy n shares at price p, sell
// them back at once, online, in dollars.
//
// The "Certificated & CSN Rates & Charges" sheet (Sept 26), read on
// 2026-10-26: "Certificated Dealing - Commission is charged at 1.50% on
// first £50,000, 0.25% on remainder", online minimum "£45.00" (telephone
// £60.00), a side:
//
//   commission = max(1.50% x min(V, £50,000) + 0.25% x (V - £50,000)+, £45)
//
// "Corporate Sponsored Nominee Dealing - Commission is charged at 1.00% on
// first £50,000, 0.25% on remainder", online minimum £20.00, only for
// shares already held in a company's sponsored nominee, with "further
// charges" in each nominee's own terms: the remark, not a row.
//
// Deals are paid and settled in pounds (debit card / UK bank account). The
// one line the LSE quotes in dollars (InterContinental Hotels) forces a
// conversion and no Equiniti document prints its rate: that total is N/A.
//
// Equiniti's list gives each company a dealing type; a "postal-only"
// company (BRCK, Caledonia, The Works) cannot be bought online:
// onlineBuy false.
//
// Stamp (SDRT 0.5%, Irish 1%) comes from the tax map; a GB or IE share with
// no tax-map line is N/A (taxGap). PTM "Charge on UK Equity transactions
// over £10,000" £1.50, a side, in a share of a UK, Channel Islands or Isle
// of Man company.
//
// Left out: the optional "Faster Payment £4.99" and "Cheque Payment
// £10.00" for sale proceeds, the late settlement penalty, duplicate
// contract notes, and the depositary-interest fees some registrars add on
// a few CDI lines ("Can vary depending on the security", no figure).
//
//   https://shareview.co.uk/documentrepository/svd/ratesandchargescertificated.pdf
//   https://shareview.co.uk/documentrepository/svd/shareview_dealing_terms_and_conditions.pdf
//
//   node brokers/shareviewdealing/shareviewdealing_cost.mjs BP. XLON GBX --shares=115 --price=638.5
//   node brokers/shareviewdealing/shareviewdealing_cost.mjs IHG XLON USD --shares=8 --price=125
//   node brokers/shareviewdealing/shareviewdealing_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "shareviewdealing";
const CATALOGUE = new URL(`${FOLDER}-parsed.json`, import.meta.url);

const SCHEDULE = {
  charges: "https://shareview.co.uk/documentrepository/svd/ratesandchargescertificated.pdf",
  terms: "https://shareview.co.uk/documentrepository/svd/shareview_dealing_terms_and_conditions.pdf",
  readOn: "2026-10-26",
  guide: "Certificated & CSN Rates & Charges (Sept 26)",
  entity: "Equiniti Financial Services Limited",
};

const CASH = "GBP";
// Online certificated commission, a side.
const TARIFF = { rate: 0.015, upTo: 50000, above: 0.0025, min: 45 };
// No published conversion rate: a forced conversion is unknown.
const FX = null;
const PTM = { each: 1.5, above: 10000, countries: new Set(["GB", "JE", "GG", "IM"]) };
const UK_BOOKS = new Set(["XLON", "AQXE", "XMSM"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const toGbp = (amount, currency) => {
  const usd = toUsd(amount, currency);
  const perPound = usdPer(CASH);
  if (usd == null || !(perPound > 0)) return null;
  return usd / perPound;
};

const commissionOf = (pounds) =>
  Math.max(TARIFF.rate * Math.min(pounds, TARIFF.upTo) + TARIFF.above * Math.max(pounds - TARIFF.upTo, 0), TARIFF.min);

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? listingKey({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);
  return { named, matches };
}

const REMARK = "Shares held in a Corporate Sponsored Nominee: 1.00%, minimum £20.";

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: CASH,
    url: SCHEDULE.charges,
  };

  if (!catalogue) {
    return { ...answer, why: `le catalogue Shareview Dealing n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Shareview Dealing` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Shareview Dealing`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
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
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };
  const tradeCcy = listingCash(listing.currency);
  // Deals settle in pounds only: a held currency other than the pound
  // would be a remark, any other one is converted on both legs.
  const held = depositHas(FOLDER, null, tradeCcy);
  const foreign = tradeCcy !== CASH;
  const forcedFx = foreign && !held;
  // Equiniti's dealing type, kept in raw by the scraper.
  const postalOnly = /\(postal-only\)\s*$/i.test(String(m.row.raw || ""));
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const partsBook = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const mic = String(m.row.mic || listing.mic || "").toUpperCase();
  const tax = listing.isin ? taxesOf(listing.isin) : null;
  // UK stamp is a London charge: a GB share dealt abroad pays none here.
  const rates = Object.fromEntries(
    Object.entries(taxRates(tax)).filter(([name]) => UK_BOOKS.has(mic) || !/^STAMP_DUTY$/.test(name))
  );
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const gap = taxGap(listing.isin, listing.type, mic);
  const shared = {
    ...answer,
    onlineBuy: !postalOnly,
    listing,
    remark: [REMARK, foreign && held ? fxRemark("", listing.currency) : ""].filter(Boolean).join("\n"),
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème Shareview Dealing (Equiniti), négociation certificated en ligne, fiche ${SCHEDULE.guide} relue le ${SCHEDULE.readOn}. Courtage ${100 * TARIFF.rate} % jusqu'à ${TARIFF.upTo} £ puis ${100 * TARIFF.above} %, minimum ${TARIFF.min} £, par sens.`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  const notional = n > 0 && p > 0 ? n * p : null;
  if (notional == null) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs",
    };
  }

  const notionalUsd = dollars(notional, listing.currency);
  const pounds = toGbp(notional, listing.currency);
  const fxEach = !forcedFx ? 0 : FX == null || pounds == null ? null : pounds * FX;
  const each = pounds == null ? null : commissionOf(pounds);
  const commissionGbp = each == null ? null : each * 2;
  const fxGbp = fxEach == null ? null : fxEach * 2;
  const ptmShare = String(listing.type || "").toUpperCase() === "STOCK" && PTM.countries.has((listing.isin || "").slice(0, 2));
  const ptmDue = !ptmShare ? false : pounds == null ? null : pounds > PTM.above;
  const ptmGbp = ptmDue ? PTM.each * 2 : ptmDue === false ? 0 : null;
  const bookUsd =
    partsBook.a == null || notionalUsd == null
      ? null
      : partsBook.b == null
        ? null
        : partsBook.a * notionalUsd + partsBook.b * n;
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
  const commissionUsd = commissionGbp == null ? null : dollars(commissionGbp, CASH);
  const fxUsd = fxGbp == null ? null : dollars(fxGbp, CASH);
  const ptmUsd = ptmGbp == null ? null : dollars(ptmGbp, CASH);
  const brokerFees = plus(commissionUsd, fxUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd, ptmUsd);

  const why = forcedFx && FX == null
    ? `règlement en livres : une ligne en ${listing.currency} impose un change dont Equiniti ne publie pas le taux`
    : bookUsd == null
      ? `aucun carnet pour ${m.unsourced?.name || listing.exchange || "cette ligne"} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : gap || (postalOnly ? "société en négociation postale uniquement chez Equiniti : pas d'achat en ligne" : null);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { each: finite(each, 6), currency: CASH, eachWay: true, ...TARIFF, ...(forcedFx ? { fx: FX } : {}) },
    ...(why ? { why } : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(plus(taxUsd, ptmUsd), 6),
      change: finite(fxUsd, 6),
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, tariff: TARIFF, fx: FX, ptm: { ...PTM, countries: [...PTM.countries] }, cash: CASH }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : null,
  });
  console.log(JSON.stringify(out, null, 2));
}
