// What one round trip costs at Bloomo Securities (ブルーモ証券): buy n
// shares, sell them back, in dollars. US stocks and ETFs bought from a
// taxable (特定) account, the same rate as the NISA growth allowance. The
// NISA tsumitate allowance (no commission) and the robo-advised Bloomo
// Core and Bloomo Income (an advisory fee a year, no ticket) stay out.
//
// https://bloomo.co.jp/support/fee/手数料はどのようなものがかかりますか
// https://storage.googleapis.com/prod-brooklyn-public/documents/上場有価証券等書面・契約締結前交付書面.pdf
// https://bloomo.co.jp/fee-and-comparison/
// Read on 2026-10-20. The support page is dated 2025-11-05.
//   United States stocks and ETFs, each side
//                        0.45% of the fill, 0.495% with consumption tax
//                        No floor, no cap and no rounding are printed.
//   Conversion           0.25% of the fill at the rate of the trade, on the
//                        buy and on the sale ("売買においては約定時の為替
//                        レートを基準に0.25%の為替手数料"). Money is paid in
//                        and out as yen only (deposits.mjs holds JPY), so
//                        both conversions are forced and are in the total.
//   US taxes and levies  the document says they arise and prints no
//                        amount, so SEC, TAF and CAT stay at 0.
//   Withdrawal 145 yen and a transfer out 11,000 yen a name are not this
//                        order.
//   The document names Alpaca Securities LLC as the local broker that
//   takes the orders (現地の証券会社(取次業者)). The book is that firm's
//   Rule 606 once rule606.mjs maps "bloomo" to it; until then the quoted
//   NBBO.
//
//   node brokers/bloomo/bloomo_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/bloomo/bloomo_cost.mjs VOO ARCX USD --shares=10 --price=550
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";

const CATALOGUE = new URL("bloomo-parsed.json", import.meta.url);
const PAGE = "https://bloomo.co.jp/support/fee/手数料はどのようなものがかかりますか";
const READ_ON = "2026-10-20";
const RATE = 0.00495;
const FX_ONE_WAY = 0.0025;
const BASE = "JPY";
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);

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
    cashCurrency: BASE,
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Bloomo n'existe pas encore : lancer `node brokers/bloomo/bloomo_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Bloomo` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Bloomo`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "bloomo",
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
  const american = US_MICS.has(listing.mic) && listing.currency === "USD";
  if (!american) {
    return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le barème Bloomo (actions et ETF américains seulement)` };
  }

  const cash = listingCash(listing.currency);
  const held = depositHas("bloomo", null, cash);
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? cash : BASE,
    remark: held ? fxRemark(String(FX_ONE_WAY * 100), cash) : "",
    basis:
      `livraison en ligne, compte imposable (même taux que le NISA croissance), barème relu le ${READ_ON}. ` +
      `Achat 0,495 % TTC (0,45 % hors taxe), sans minimum ni plafond imprimés. Vente identique. ` +
      (held
        ? `Change 0,25 % par sens quand la caisse n'est pas en dollars, hors de ce ticket.`
        : `Change forcé 0,25 % par sens (dépôts et retraits en yens seulement), dans le total.`) +
      ` SEC, TAF et CAT non chiffrés : 0.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const side = notional * RATE;
  const commissionUsd = dollars(side + side, listing.currency);
  // Forced conversion: yen to dollars on the buy, dollars to yen on the sale.
  const fxUsd = held ? 0 : notionalUsd == null ? null : notionalUsd * FX_ONE_WAY * 2;
  const brokerFees = plus(commissionUsd, fxUsd);
  const marketBp = bp ?? null;
  const marketPerShare =
    perShare ?? usBookPerShare({ broker: "bloomo", ticker: listing.ticker, fallback: book.leaf?.perShare ?? null });
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de 605 pour ce ticker"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy: side, sell: side, currency: listing.currency, rate: RATE, taxIncluded: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
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
