// What one round trip costs at Toro: buy n shares at price p, sell
// them back at once, in dollars. The online order, closed by hand.
// A phone order, a forced close and the automatic close are other
// lines.
//
// The fee page, read on 2026-10-15.
//   https://www.toroinvestimentos.com.br/info/custos
//
//   Brokerage, shares and ETFs     R$0 each side. The same zero
//                                  covers a stock future, which is
//                                  not this order.
//   PIS, COFINS and ISS            printed as 0.65%, 4% and 5%.
//                                  They sit on the brokerage. With
//                                  no brokerage they are nothing,
//                                  and the 5.90% "outros" line says
//                                  the same.
//   B3, a regular order            0.030% of the amount, each side:
//                                  0.005% to trade, 0.02240% to the
//                                  clearing house, 0.0026% to
//                                  transfer the shares. The first
//                                  band, an average day under
//                                  R$3 million. The next band is
//                                  not this order.
//   A same-day buy and sell        0.023% a side and no transfer
//                                  fee. The figure stays on the
//                                  regular 0.030%. The remark is
//                                  the cut on the B3 fees, 23%.
//   An opening or closing auction  the trading fee becomes 0.007%.
//                                  Not this order.
// Custody is not charged by Toro and is not this order. The account
// is funded in reais. The page prints no foreign-exchange margin.
//
//   https://www.b3.com.br/pt_br/produtos-e-servicos/tarifas/listados-a-vista-e-derivativos/renda-variavel/tarifas-de-acoes-e-fundos-de-investimento/a-vista/
//
//   node brokers/toro/toro_cost.mjs PETR4 B3 BRL --shares=100 --price=40
//   node brokers/toro/toro_cost.mjs BOVA11 B3 BRL --shares=10 --price=120
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("toro-parsed.json", import.meta.url);
const PAGE = "https://www.toroinvestimentos.com.br/info/custos";
const READ_ON = "2026-10-15";
const NEGOTIATION = 0.00005;
const CCP = 0.000224;
const TRANSFER = 0.000026;
const SIDE = NEGOTIATION + CCP + TRANSFER;
const DAY_TRADE = 0.00023;
// The day-trade fees as a cut of the regular B3 fees.
const SAME_DAY = Math.round(((SIDE - DAY_TRADE) / SIDE) * 100);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function peso(amount) {
  return Math.round(amount * 100 + Number.EPSILON) / 100;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place, currency }).venue : null;
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

function ticket(notional) {
  const gross = peso(notional);
  const side = peso(gross * SIDE);
  return { side, sell: side };
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
    cashCurrency: "BRL",
    url: PAGE,
    remark: SAME_DAY ? `A same-day buy and sell's B3 fees are ${SAME_DAY}% lower.` : "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Toro n'existe pas encore : lancer `node brokers/toro/toro_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Toro` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Toro`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "toro",
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
    cashCurrency: listing.currency || "BRL",
    basis: `Toro en ligne, barème relu le ${READ_ON}. Courtage 0. La B3 prend 0,030 % par côté sur un ordre ordinaire, première tranche.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const fees = ticket(notional);
  const local = peso(fees.side + fees.sell);
  const notionalUsd = dollars(notional, listing.currency);
  const brokerFees = dollars(local, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
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
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      brokerage: 0,
      negotiation: NEGOTIATION,
      ccp: CCP,
      transfer: TRANSFER,
      dayTrade: DAY_TRADE,
      buy: fees.side,
      sell: fees.sell,
      currency: listing.currency,
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
  console.log(JSON.stringify(roundTrip({
    etf,
    place,
    currency,
    shares: Number(arg("shares", "10")),
    price: Number(arg("price", "0")),
  }), null, 2));
}

printCli();
