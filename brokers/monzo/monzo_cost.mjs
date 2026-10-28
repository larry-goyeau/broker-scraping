// What one round trip costs at Monzo Investments: buy n units of one of
// Monzo's BlackRock ETFs or ETCs at price p, sell them back at once, in
// dollars. Monzo Bank Ltd, UK: the General Investment Account and the
// Stocks & Shares ISA, dealt and held by Seccl. The pension stays out.
//
// Sources, read on 2026-10-26:
//   https://monzo.com/legal/investments/fees
//   https://monzo.com/investments
//   https://monzo.com/legal/investments/terms-and-conditions
//
//   Dealing            "No trading fees" (investments page); the fee page
//                      prints no dealing or transaction charge: 0.
//   Annual fee         "We charge a fee of 0.25% a year", "or 0.20% if you
//                      subscribe to a plan that offers a lower fee",
//                      capped at £250 a year (£200 on 0.20%). A holding
//                      cost: remark. The plans differ on this fee only, so
//                      one row, not split.
//   Fund charges       BlackRock's, inside the fund price. Not a ticket.
//   FX                 none: "Payments must be ... in pounds sterling" and
//                      every priced line is GBP or GBX. A non-sterling line
//                      would convert at an unpublished rate: N/A.
//   Stamp duty         from the tax map. These are ETFs and ETCs: none.
//                      PTM applies to shares only: none.
//
// Seccl deals the exchange-traded orders on the London Stock Exchange, so
// a line keeps London's book. The four products Monzo names with no single
// LSE line (no ticker, ISIN or currency in the catalogue) have no book: N/A.
//
// In the total: the book. Remark: the annual fee.
//
//   node brokers/monzo/monzo_cost.mjs SWDA XLON GBX --shares=10 --price=10000
//   node brokers/monzo/monzo_cost.mjs ERNS XLON GBP --shares=8 --price=100
//   node brokers/monzo/monzo_cost.mjs SGLN XLON GBX --shares=12 --price=6000
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const CATALOGUE = new URL("monzo-parsed.json", import.meta.url);
const PAGE = "https://monzo.com/legal/investments/fees";
const READ_ON = "2026-10-26";
const CASH = "GBP";
const REMARK = "Annual fee 0.25% (0.20% on some plans), capped at £250 a year.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const sterling = (currency) => {
  const c = String(currency || "").toUpperCase();
  return c === "GBP" || c === "GBX";
};

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
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);
  return { named, matches };
}

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
    url: PAGE,
    remark: REMARK,
  };

  if (!catalogue) {
    return { ...answer, why: "le catalogue Monzo n'existe pas encore : lancer `node brokers/monzo/monzo_scraping.mjs`" };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Monzo` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Monzo`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin || r.name} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "monzo",
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
  const unlisted = !listing.ticker && !listing.isin;
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
  const tax = listing.isin ? taxesOf(listing.isin) : null;
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const convert = !unlisted && !sterling(listing.currency);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `barème Monzo Investments (GIA, ISA), relu le ${READ_ON} : aucun frais de transaction ("No trading fees"). ` +
      `Paiements en livres seulement.`,
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

  const notionalUsd = unlisted ? null : dollars(notional, listing.currency);
  const bookUsd =
    unlisted || partsBook.a == null || notionalUsd == null
      ? null
      : partsBook.b == null
        ? null
        : partsBook.a * notionalUsd + partsBook.b * n;
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
  const fxUsd = convert ? null : 0;
  const brokerFees = plus(0, fxUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd);

  const why = [
    unlisted
      ? `${listing.name || etf} : Monzo ne donne ni ticker ni ISIN et le nom ne désigne pas une seule ligne LSE, pas de carnet`
      : bookUsd == null
        ? `aucun carnet pour ${m.unsourced?.name || listing.exchange || "cette ligne"} : ${m.unsourced?.why || "pas de feuille de carnet"}`
        : null,
    convert ? `change GBP ↔ ${listing.currency} forcé, taux non publié par Monzo` : null,
    gap,
  ].filter(Boolean);

  const confidence = [
    `barème Monzo relu le ${READ_ON}`,
    "aucun frais de transaction",
    unlisted ? "ligne sans cotation identifiée" : convert ? "change non publié : N/A" : "ligne en sterling : pas de change",
    taxTotal ? `droit de timbre ${(taxTotal * 100).toFixed(2)} % à l'achat` : "pas de droit de timbre (ETF/ETC)",
    "frais annuels 0,25 % (0,20 % selon la formule), plafond 250 £/an, en remarque",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp (Seccl, Londres)`
      : marketPerShare != null
        ? `carnet ${marketPerShare} par part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange || listing.name}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { rate: 0, min: 0, flat: 0, currency: CASH, eachWay: true },
    ...(why.length ? { why: why.join(" ; ") } : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency || null,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: 0,
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
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
