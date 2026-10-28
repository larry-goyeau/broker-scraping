// What one round trip costs at Stratiphy: buy n shares or units at price p
// as a self-directed trade in the app, sell them back at once, in dollars.
// Stratiphy Ltd, UK: general account, Stocks & Shares ISA and IFISA, cash
// and custody at WealthKernel ("WealthKernel is our custodian and partner
// for brokerage services").
//
// Sources, read on 2026-10-26 (the pricing page is a script; its tables are
// read from the page's own bundle, main.*.js, "trades_price"):
//   https://www.stratiphy.io/pricing
//   https://www.stratiphy.io/faq
//
//   Self-directed      "Self directed trades pricing": Stocks "£2", ETPs
//                      ("ETF, ETC, ETN") "£4", the same on Strati-Free,
//                      Starter-Sphere and Strato-Sphere. A trade each way.
//                      "Self-directed orders are limited to £10k": a larger
//                      amount is several orders, each paying the fee.
//   Strategy trades    "Trading costs ... Applies to trades within an
//                      investment strategy": £0. Remark.
//   Subscription       Strati-Free free; Starter-Sphere £4.50 and
//                      Strato-Sphere £9.50 a month. The trade fee is the
//                      same on all three: one row, not split.
//   FX                 none printed. The account holds pounds only, so a
//                      USD, EUR, HKD or JPY line converts on the buy and on
//                      the sell at an unpublished rate: N/A.
//   Stamp duty         0.5% SDRT on the purchase of a UK share, from the tax
//                      map (not on AIM, not on an ETF, ETC or ETN). A UK
//                      share with no tax-map line is N/A (taxGap).
//   PTM levy           the Takeover Panel's £1.50 per contract above
//                      £10,000: an order is capped at £10k, so never due.
//
// Every line is on the London Stock Exchange and keeps London's book.
//
// Left out: the strategy management fee (0.70%–0.90% a year, custom
// strategies only) and the Ready-Made strategy fee, which are not on a
// self-directed holding.
//
// In the total: book + commission + stamp duty. Remark: strategy trades.
//
//   node brokers/stratiphy/stratiphy_cost.mjs HSBA XLON GBX --shares=80 --price=1000
//   node brokers/stratiphy/stratiphy_cost.mjs VUAG XLON GBP --shares=8 --price=100
//   node brokers/stratiphy/stratiphy_cost.mjs CSPX XLON USD --shares=2 --price=650
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const CATALOGUE = new URL("stratiphy-parsed.json", import.meta.url);
const PAGE = "https://www.stratiphy.io/pricing";
const READ_ON = "2026-10-26";
const CASH = "GBP";
const FEE = { STOCK: 2, ETP: 4 };
const ORDER_CAP = 10000;
const REMARK = "Trades placed by a strategy pay no commission.";

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
    return { ...answer, why: "le catalogue Stratiphy n'existe pas encore : lancer `node brokers/stratiphy/stratiphy_scraping.mjs`" };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Stratiphy` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Stratiphy`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "stratiphy",
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
  const convert = !sterling(listing.currency);
  const stock = String(listing.type || "").toUpperCase() === "STOCK";
  const each = stock ? FEE.STOCK : FEE.ETP;
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `barème Stratiphy (ordres manuels, toutes formules), relu le ${READ_ON} : ` +
      `2 £ par ordre sur une action, 4 £ sur un ETP (ETF, ETC, ETN), à l'achat et à la vente ; ordre plafonné à 10 000 £. ` +
      `Compte en GBP seulement ; change non publié.`,
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
  // A self-directed order is capped at £10k: a larger amount is that many orders, each way.
  const orders = pounds == null ? null : Math.max(1, Math.ceil(pounds / ORDER_CAP - 1e-9));
  const commissionGbp = orders == null ? null : each * orders * 2;
  const commissionUsd = commissionGbp == null ? null : dollars(commissionGbp, CASH);
  const fxUsd = convert ? null : 0;
  const bookUsd =
    partsBook.a == null || notionalUsd == null
      ? null
      : partsBook.b == null
        ? null
        : partsBook.a * notionalUsd + partsBook.b * n;
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
  const brokerFees = plus(commissionUsd, fxUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd);

  const why = [
    bookUsd == null
      ? `aucun carnet pour ${m.unsourced?.name || listing.exchange || "cette ligne"} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
    convert ? `change GBP ↔ ${listing.currency} forcé, taux non publié par Stratiphy` : null,
    gap,
  ].filter(Boolean);

  const confidence = [
    `barème Stratiphy relu le ${READ_ON}`,
    `courtage ${each} £ × ${orders ?? "?"} ordre${orders > 1 ? "s" : ""} par sens`,
    convert ? "change non publié, compte en GBP seulement : N/A" : "ligne en sterling : pas de change",
    taxTotal ? `droit de timbre ${(taxTotal * 100).toFixed(2)} % à l'achat` : "pas de droit de timbre",
    "pas de prélèvement PTM (ordre plafonné à 10 000 £)",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} par part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { flat: each, min: 0, rate: 0, currency: CASH, eachWay: true, orderCap: ORDER_CAP },
    ...(why.length ? { why: why.join(" ; ") } : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
      orders,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
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
