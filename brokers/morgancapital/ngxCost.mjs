// The round trip on the Nigerian Exchange, shared by the online brokers
// whose only place is the NGX and whose catalogue is ./ngxWhole.mjs:
// ../morgancapital, ../apel, ../integratedtrust, ../quantumzenith,
// ../falcon, ../newdevco, ../mission. Each broker's <folder>_cost.mjs keeps
// its own header (tariff URL, quote, what is left out) and calls
// `ngxRoundTrip(config)`; the answer has the same shape as
// ../meristem/meristem_cost.mjs (card brokers) and
// ../stanbicibtc/stanbicibtc_cost.mjs (all-in brokers).
//
// The statutory card is the exchange's own,
// https://ngxgroup.com/exchange/trade/equities/trading-market-structure/
// re-read on 2026-10-26:
//   Buy     brokerage 0.75–1.35 %, SEC 0.3 %, stamp duty 0.08 %,
//           trade alert ₦4, VAT 7.5 % of brokerage and the SEC fee
//   Sell    brokerage 0.75–1.35 %, NGX 0.3 %, CSCS 0.3 %, stamp duty 0.08 %,
//           trade alert ₦4, VAT 7.5 % of the NGX fee, the CSCS fee and
//           brokerage
// No minimum and no lot size are printed on the card.
//
// Two kinds of tariff:
//   mode "card"   the broker prints its brokerage only (Morgan Capital
//                 0.75 %, Apel 0.50 %, Mission / Falcon / Newdevco 1.35 %).
//                 brokerFees = brokerage + 7.5 % VAT on it (+ any ticket),
//                 both sides; the rest of the card is `parts.taxes`, as in
//                 ../meristem.
//   mode "allIn"  the broker prints one rate a side that already holds the
//                 card (Integrated Trust 1.88 % / 2.255 %, Quantum Zenith
//                 1.665 % / 2.010 %). brokerFees = those rates (+ `alert`
//                 a side when the broker prints it separately), nothing
//                 from the card on top, as in ../stanbicibtc.
//
// The book is the NSENG touch from spreads/ngx-touch.mjs, read through
// spreads/book.mjs; a missing book stays missing (N/A). Every NGX line is
// a naira line and the accounts are naira accounts: nothing is converted.
//
//   import { ngxRoundTrip, ngxCli } from "../morgancapital/ngxCost.mjs";
//   export const roundTrip = ngxRoundTrip({ folder: "apel", broker: "Apel", ... });
//   ngxCli(import.meta.url, roundTrip);
//
//   node brokers/morgancapital/ngxCost.mjs     (self-test)
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

export const NGX_CARD = "https://ngxgroup.com/exchange/trade/equities/trading-market-structure/";
export const CARD_READ_ON = "2026-10-26";
export const SEC = 0.003;
export const NGX = 0.003;
export const CSCS = 0.003;
export const STAMP = 0.0008;
export const ALERT = 4;
export const VAT = 0.075;
export const CASH = "NGN";
export const CARD_BASIS =
  `frais de place NGX (barème relu le ${CARD_READ_ON}) : achat SEC 0,3 %, vente NGX 0,3 % et CSCS 0,3 %, ` +
  `droit de timbre 0,08 % et alerte 4 ₦ chaque sens, TVA 7,5 % sur ces frais.`;

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// The card without brokerage, in naira, for one buy and one sell of
// `notional` naira. `vat` is the VAT on the card's own fees only.
export function ngxCard(notional) {
  const sec = notional * SEC;
  const ngx = notional * NGX;
  const cscs = notional * CSCS;
  const stamp = notional * STAMP;
  const buy = { sec, stamp, alert: ALERT, vat: VAT * sec };
  const sell = { ngx, cscs, stamp, alert: ALERT, vat: VAT * (ngx + cscs) };
  const buyNgn = sec + stamp + ALERT + buy.vat;
  const sellNgn = ngx + cscs + stamp + ALERT + sell.vat;
  return { buy, sell, buyNgn, sellNgn, ngn: buyNgn + sellNgn };
}

// Brokerage one side, in naira: rate × notional, floored at `min`, plus its
// 7.5 % VAT (unless vat is false), plus a flat `ticket`.
export function ngxBrokerage(notional, rate, { min = 0, ticket = 0, vat = true } = {}) {
  const brokerage = Math.max(notional * rate, min);
  return brokerage + (vat ? VAT * brokerage : 0) + ticket;
}

function loadRows(catalogueUrl) {
  const catalogue = fs.existsSync(catalogueUrl) ? JSON.parse(fs.readFileSync(catalogueUrl, "utf8")) : null;
  const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
  if (rows.length) warmListingIndex(rows);
  return { catalogue, rows };
}

function findListing(rows, { etf, place, currency }) {
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

// config:
//   folder       broker folder ("apel"); the catalogue is <folder>-parsed.json
//   broker       name used in the French `why` messages ("Apel")
//   page         tariff URL (answer.url)
//   basis        French sentence(s) on the broker's own tariff; CARD_BASIS is
//                appended in mode "card"
//   mode         "card" | "allIn"
//   buy, sell    rate a side (brokerage in "card", all-in in "allIn")
//   min          card: brokerage floor a side, naira (default 0)
//   ticket       card: flat naira a side on top of brokerage (default 0)
//   vat          card: VAT on brokerage (default true)
//   alert        allIn: naira a side printed outside the rates (default 0)
//   remark       English remark (default "")
//   onlineBuy    default true
//   catalogue    optional URL overriding <folder>-parsed.json
export function ngxRoundTrip(config) {
  const {
    folder,
    broker,
    page,
    basis,
    mode = "card",
    buy: buyRate,
    sell: sellRate,
    min = 0,
    ticket = 0,
    vat = true,
    alert = 0,
    remark = "",
    onlineBuy = true,
  } = config;
  if (mode !== "card" && mode !== "allIn") throw new Error(`ngxRoundTrip: mode ${mode}`);
  if (!(buyRate >= 0) || !(sellRate >= 0)) throw new Error("ngxRoundTrip: buy and sell rates are required");
  const catalogueUrl = config.catalogue || new URL(`../${folder}/${folder}-parsed.json`, import.meta.url);
  const { catalogue, rows } = loadRows(catalogueUrl);
  const fullBasis = mode === "card" ? `${basis} ${CARD_BASIS[0].toUpperCase()}${CARD_BASIS.slice(1)}` : basis;

  return function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
    const answer = {
      usd: null,
      brokerFees: null,
      ccy: QUOTE,
      etf,
      place,
      currency,
      onlineBuy,
      cashCurrency: CASH,
      url: page,
      remark,
    };
    if (!catalogue) {
      return { ...answer, why: `le catalogue ${broker} n'existe pas encore : lancer \`node brokers/${folder}/${folder}_scraping.mjs\`` };
    }
    const { named, matches } = findListing(rows, { etf, place, currency });
    if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${broker}` };
    if (!matches.length) {
      return {
        ...answer,
        why: `${etf} n'est pas coté sur cette place dans cette devise chez ${broker}`,
        alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
      };
    }

    const m = matches[0];
    const book = spreadLeaf(spreads, {
      isin: m.row.isin,
      mic: m.venue?.mic ?? null,
      currency: m.row.currency,
      unsourced: m.unsourced,
      broker: folder,
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
      basis: fullBasis,
      fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
      fxIfConverted: 0,
      bp: marketBp,
      perShare: marketPerShare,
    };
    if (listing.currency !== CASH) {
      return { ...shared, why: `${broker} ne publie un barème que pour le naira ; ${listing.currency} n'est pas couvert` };
    }

    const n = Number(shares);
    const p = Number(price);
    if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
    if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

    const notional = n * p;
    const notionalUsd = dollars(notional, listing.currency);
    let brokerNgn;
    let cardNgn = 0;
    let commission;
    let card = null;
    if (mode === "card") {
      const buySide = ngxBrokerage(notional, buyRate, { min, ticket, vat });
      const sellSide = ngxBrokerage(notional, sellRate, { min, ticket, vat });
      brokerNgn = buySide + sellSide;
      card = ngxCard(notional);
      cardNgn = card.ngn;
      commission = {
        brokerage: buyRate === sellRate ? buyRate : { buy: buyRate, sell: sellRate },
        vat: vat ? VAT : 0,
        ...(min ? { min } : {}),
        ...(ticket ? { ticket } : {}),
        currency: listing.currency,
        buy: buySide,
        sell: sellSide,
        eachWay: true,
      };
    } else {
      const buySide = notional * buyRate + alert;
      const sellSide = notional * sellRate + alert;
      brokerNgn = buySide + sellSide;
      commission = { buy: buyRate, sell: sellRate, alert, currency: listing.currency, buyNgn: buySide, sellNgn: sellSide };
    }
    const brokerFees = dollars(brokerNgn, listing.currency);
    const levies = mode === "card" ? dollars(cardNgn, listing.currency) : 0;
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
      commission,
      ...(card ? { buy: card.buy, sell: card.sell } : {}),
      parts:
        mode === "card"
          ? {
              marché: finite(bookUsd, 6),
              courtage: finite(brokerFees, 6),
              taxes: finite(levies, 6),
              courtageNgn: finite(brokerNgn, 6),
              taxesNgn: finite(cardNgn, 6),
            }
          : { marché: finite(bookUsd, 6), courtage: finite(brokerFees, 6), courtageNgn: finite(brokerNgn, 6) },
      sources: mode === "card" ? { fees: page, ngx: NGX_CARD } : { fees: page },
    };
  };
}

// The CLI every broker file prints:
//   node brokers/<folder>/<folder>_cost.mjs GTCO XNGN NGN --shares=10000 --price=128.25
export function ngxCli(metaUrl, roundTrip) {
  let called = false;
  try {
    called = metaUrl === pathToFileURL(process.argv[1]).href;
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

// Self-test: the card at 1.35 % must match ../meristem/meristem_cost.mjs to
// the naira, and an all-in tariff must add nothing from the card.
function selfTest() {
  let called = false;
  try {
    called = import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  const card = ngxRoundTrip({
    folder: "morgancapital",
    broker: "test",
    page: "test",
    basis: "test.",
    buy: 0.0135,
    sell: 0.0135,
  });
  const allIn = ngxRoundTrip({
    folder: "morgancapital",
    broker: "test",
    page: "test",
    basis: "test.",
    mode: "allIn",
    buy: 0.0188,
    sell: 0.02255,
  });
  const q = { etf: "GTCO", place: "XNGN", currency: "NGN", shares: 10000, price: 128.25 };
  const a = card(q);
  const b = allIn(q);
  const N = 10000 * 128.25;
  const wantBroker = 2 * N * 0.0135 * 1.075;
  const wantCard = N * (0.003 + 0.0008) + 4 + 0.075 * N * 0.003 + N * (0.006 + 0.0008) + 4 + 0.075 * N * 0.006;
  const wantAllIn = N * (0.0188 + 0.02255);
  const ok = (x, y) => Math.abs(x - y) / y < 1e-5; // parts are rounded to 6 digits
  console.log(
    JSON.stringify(
      {
        notional: N,
        card: { courtageNgn: a.parts.courtageNgn, taxesNgn: a.parts.taxesNgn, usd: a.usd, bp: a.bp },
        allIn: { courtageNgn: b.parts.courtageNgn, usd: b.usd },
        checks: {
          brokerage: ok(a.parts.courtageNgn, wantBroker),
          card: ok(a.parts.taxesNgn, wantCard),
          allIn: ok(b.parts.courtageNgn, wantAllIn),
        },
      },
      null,
      2
    )
  );
}

selfTest();
