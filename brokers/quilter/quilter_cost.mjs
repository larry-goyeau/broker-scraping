// What one round trip costs at Quilter Invest (the former Wombat / NuWealth
// app): buy n shares at price p in the app, sell them back at once, in
// dollars. GIA, ISA and JISA price the same.
//
// Sources, read on 2026-10-21:
//   https://www.quilterinvest.com/pricing
//   https://www.quilterinvest.com/app-info-modals/fx-conversion
//   https://www.quilterinvest.com/faq/what-are-the-fees-for-a-quilter-invest-gia-isa-or-jisa
//   https://www.quilterinvest.com/site-terms/order-execution-policy
//   https://www.thetakeoverpanel.org.uk/the-panel/ptm-levy
//
//   Commission           free, every account.
//   FX                   0.40% of the GBP value of each order on a USD or
//                        EUR share, on the buy and on the sell. The in-app
//                        FX modal, the desktop pricing table and the fee FAQ
//                        all print 0.40%. The mobile tabs of the same page
//                        still print 0.75% and the execution policy reserves
//                        "up to 1%": the in-app figure is the one used.
//                        The cash account is GBP only, so the FX is forced
//                        and sits in the total. A GBP or GBX line converts
//                        nothing.
//   Subscription         £2 a month for the investment plan. Remark.
//   Platform fee         0.25% a year of the portfolio, charged monthly.
//                        Remark.
//   Fund provider fee    the ETF's own AMC, inside its price. Not a ticket.
//   Exchange/brokerage   the execution policy says Winterflood (WBS) does not
//                        pass these on. No US regulatory levy is printed: SEC
//                        fee, TAF and CAT stay at 0.
//   Stamp duty           0.5% on the purchase of a UK share, from the tax map
//                        (not on the sale, not on AIM, not on an ETF or ETC).
//                        A UK share with no tax-map line is N/A (taxGap).
//   PTM levy             the Takeover Panel's 150p per contract, on the buy
//                        and on the sell, when the consideration is above
//                        £10,000, on a share of a UK, Channel Islands or
//                        Isle of Man company traded in London or on AIM.
//                        Quilter's pricing page still prints £1; the Panel's
//                        own rate is used.
//
// Every exchange-traded order goes through Winterflood Business Services.
// No US broker-dealer is named, so a US line is priced on the quoted NBBO
// (no Rule 606 Q). A London, Xetra, Brussels or Milan line keeps its own book.
//
// In the total: book + FX + stamp duty + PTM. Remark: subscription and
// platform fee.
//
//   node brokers/quilter/quilter_cost.mjs HSBA XLON GBX --shares=100 --price=1000
//   node brokers/quilter/quilter_cost.mjs AAPL --shares=2 --price=230
//   node brokers/quilter/quilter_cost.mjs SWDA --shares=10 --price=9000
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const CATALOGUE = new URL("quilter-parsed.json", import.meta.url);
const PAGE = "https://www.quilterinvest.com/pricing";
const READ_ON = "2026-10-21";
const CASH = "GBP";
const FX = 0.004;
const PTM = { each: 1.5, above: 10000 };
const PTM_COUNTRIES = new Set(["GB", "JE", "GG", "IM"]);
const UK_MICS = new Set(["XLON", "AIMX"]);
const REMARK = "£2 a month subscription. Platform fee 0.25% a year.";

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
    return { ...answer, why: "le catalogue Quilter n'existe pas encore : lancer `node brokers/quilter/quilter_scraping.mjs`" };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Quilter` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Quilter`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "quilter",
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
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `barème Quilter (GIA, ISA, JISA), relu le ${READ_ON}. Courtage gratuit. ` +
      `Change 0,40 % de la valeur en GBP de chaque ordre sur une action en USD ou EUR, à l'achat et à la vente : compte espèces en GBP seulement.`,
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
  const fxGbp = !convert ? 0 : pounds == null ? null : pounds * FX * 2;
  const ptmShare =
    String(listing.type || "").toUpperCase() === "STOCK" &&
    PTM_COUNTRIES.has(String(listing.isin || "").slice(0, 2)) &&
    UK_MICS.has(String(listing.mic || "").toUpperCase());
  const ptmDue = !ptmShare ? false : pounds == null ? null : pounds > PTM.above;
  const ptmGbp = ptmDue ? PTM.each * 2 : ptmDue === false ? 0 : null;
  const bookUsd =
    partsBook.a == null || notionalUsd == null
      ? null
      : partsBook.b == null
        ? null
        : partsBook.a * notionalUsd + partsBook.b * n;
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
  const fxUsd = fxGbp == null ? null : dollars(fxGbp, CASH);
  const ptmUsd = ptmGbp == null ? null : dollars(ptmGbp, CASH);
  const brokerFees = plus(0, fxUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd, ptmUsd);

  const confidence = [
    `barème Quilter relu le ${READ_ON}`,
    "courtage 0",
    convert ? "change 0,40 % × 2, dans le total (compte en GBP seulement)" : "ligne en sterling : pas de change",
    taxTotal ? `droit de timbre ${(taxTotal * 100).toFixed(2)} % à l'achat` : "pas de droit de timbre",
    ptmDue ? "prélèvement PTM 1,50 £ par sens" : "pas de prélèvement PTM",
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
    commission: { rate: 0, min: 0, flat: 0, currency: CASH, eachWay: true },
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange || "cette ligne"} : ${m.unsourced?.why || "pas de feuille de carnet"}`,
        }
      : gap
        ? { why: gap }
        : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: 0,
      taxes: finite(plus(taxUsd, ptmUsd), 6),
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
