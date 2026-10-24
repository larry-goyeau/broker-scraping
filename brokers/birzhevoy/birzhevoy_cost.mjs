// What one round trip costs at Birzhevoy Broker (OOO "Birzhevoy Broker",
// Dushanbe, broker.tj): buy n shares or fund units at price p, sell them back
// at once, in dollars. US lines (Nasdaq, NYSE and the other US places the
// symbol directories name), KASE, AIX and Nasdaq Dubai.
//
// Read on 2026-10-24, "Тарифы на брокерское обслуживание":
//   https://broker.tj/services/broker-account
//
//                                          Инвестор   Трейдер
//   Shares, depositary receipts, fund units
//   on NASDAQ, NYSE, KASE and AIX           0,3 %      0,2 %     of each trade
//   Shares, DRs, fund units and ETFs on
//   Nasdaq Dubai                            от 0,12%   от 0,12%
//   Валютный рынок (currency market)        0,5 %      0,5 %
//   Account opening, crediting money, DEPO account with no trades,
//   withdrawing to the client's account     free
//
// Two subscriptions with different rates: one row each (`query.plan`,
// "investor" and "trader"). The page prints no other difference, no monthly
// fee, no minimum, no cap and no rounding. "Бесплатное открытие и
// обслуживание счёта" (opening and upkeep free). No exchange, clearing or
// regulator fee is printed for any of the four markets: none is added, and
// US SEC / TAF / CAT stay at 0 as in the other US files.
//
// Nasdaq Dubai: "от 0,12%" is a floor with no ceiling printed. It is the
// only figure the broker gives, so the commission is taken at 0.12% each
// way and the remark says it can be higher. The book of Nasdaq Dubai is not
// sourced (spreads/venues.mjs), so the total is N/A there anyway; only the
// broker's column shows the 0.12%.
//
// Cash: somoni and dollars (deposits.mjs). Every US line is in dollars, so
// the 0.5% currency-market fee is a remark ("FX 0.5% when cash ≠ USD.").
// The tenge, dirham and yuan lines (KASE, AIX, Nasdaq Dubai) must be bought
// by converting: 0.5% of the amount each way goes into the total.
//
// US book: no US dealer is named on the site (tariff, FAQ, partners,
// licences pages read on 2026-10-24), so the book is the quoted NBBO of the
// symbol (usBookPerShare with no Q for "birzhevoy"). KASE ("pas de touche
// simultanée"), AIX ("adaptateur non écrit") and Nasdaq Dubai ("pas de carnet
// public") have no sourced book: N/A, broker fees still computed.
//
// Left out: ETFs for non-qualified investors only after a test (the
// catalogue's remark, carried through); securities transfers in or out ($2),
// dollar or euro withdrawals (0.5%, moving cash out, not this order).
//
//   node brokers/birzhevoy/birzhevoy_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/birzhevoy/birzhevoy_cost.mjs AAPL XNAS USD --shares=10 --price=230 --plan=trader
//   node brokers/birzhevoy/birzhevoy_cost.mjs KZ1C00008721 XKAZ KZT --shares=100 --price=500
//   node brokers/birzhevoy/birzhevoy_cost.mjs DEPA DIFX AED --shares=1000 --price=1
//   node brokers/birzhevoy/birzhevoy_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const CATALOGUE = new URL("birzhevoy-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://broker.tj/services/broker-account",
  readOn: "2026-10-24",
  entity: 'OOO "Birzhevoy Broker" (TJ)',
  rule606: "birzhevoy",
};

// Each trade, buy and sell.
const PLANS = {
  investor: { id: "investor", name: "Инвестор", rate: 0.003 },
  trader: { id: "trader", name: "Трейдер", rate: 0.002 },
};
const DEFAULT_PLAN = "investor";
const DUBAI_RATE = 0.0012; // "от 0,12%", both plans
const FX_RATE = 0.005; // Валютный рынок, each conversion

const US_MICS = new Set(["XNAS", "XNYS", "TXSE", "ARCX", "XASE", "BATS"]);
const DUBAI = new Set(["DIFX", "NASDAQDUBAI"]);
const KAZAKH = new Set(["XKAZ", "AIXK", "KAZAKHSTANSTOCKEXCHANGE", "ASTANAINTERNATIONALEXCHANGE"]);
const DUBAI_REMARK = "Nasdaq Dubai commission can be higher.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const joinRemarks = (...xs) => xs.map((x) => String(x || "").trim()).filter(Boolean).join(" ");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

/** Which line of the tariff prices this row: "us", "kz" (KASE, AIX), "dubai" or null. */
export function marketOf(row) {
  const mic = code(row?.mic);
  const exchange = loose(row?.exchange);
  if (US_MICS.has(mic)) return "us";
  if (DUBAI.has(mic) || DUBAI.has(exchange)) return "dubai";
  if (KAZAKH.has(mic) || KAZAKH.has(exchange)) return "kz";
  return null;
}

export function rateOf(market, plan = DEFAULT_PLAN) {
  if (market === "dubai") return DUBAI_RATE;
  if (market === "us" || market === "kz") return (PLANS[plan] || PLANS[DEFAULT_PLAN]).rate;
  return null;
}

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
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace || loose(m.unsourced?.name) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
  const chosen = PLANS[String(plan || DEFAULT_PLAN)] || PLANS[DEFAULT_PLAN];
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "USD",
    url: SCHEDULE.url,
    remark: "",
    plan: chosen.id,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Birzhevoy Broker n'existe pas encore : lancer `node brokers/birzhevoy/birzhevoy_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Birzhevoy Broker` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Birzhevoy Broker`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: SCHEDULE.rule606,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? code(m.row.mic) ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const market = marketOf(m.row);
  const rate = rateOf(market, chosen.id);
  if (rate == null) return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le tarif` };

  const held = depositHas("birzhevoy", null, listing.currency);
  const remark = [
    joinRemarks(m.row.remark, market === "dubai" ? DUBAI_REMARK : ""),
    held ? fxRemark(FX_RATE * 100, listing.currency) : "",
  ]
    .filter(Boolean)
    .join("\n");
  const listed = market === "us" && listing.currency === "USD";
  const via606 = listed && qOf(SCHEDULE.rule606) != null;
  const quoted = listed
    ? usBookPerShare({ broker: SCHEDULE.rule606, ticker: listing.ticker, fallback: book.leaf?.perShare ?? null })
    : book.leaf?.perShare ?? null;
  const marketPerShare = perShare ?? quoted;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: listed && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, r) => sum + r, 0);
  const rateText = market === "dubai" ? "Nasdaq Dubai « от 0,12% » pris à 0,12 %" : `${chosen.name} ${String(rate * 100).replace(".", ",")} %`;
  const shared = {
    ...answer,
    listing,
    remark,
    cashCurrency: held ? listing.currency : "USD",
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `tarif Birzhevoy Broker relu le ${SCHEDULE.readOn} : ${rateText} de chaque opération, à l'achat et à la vente, ` +
      `sans minimum ni frais de bourse imprimés ; marché des changes 0,5 %` +
      (market === "us" ? " ; SEC, TAF et CAT non imprimées, laissées à 0" : ""),
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: FX_RATE,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const side = notionalUsd == null ? null : notionalUsd * rate;
  const commissionUsd = side == null ? null : side * 2;
  // Tenge, dirham and yuan are bought with somoni or dollars and sold back.
  const fxUsd = held ? 0 : notionalUsd == null ? null : notionalUsd * FX_RATE * 2;
  const brokerFees = plus(commissionUsd, fxUsd);
  const bookUsd =
    parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    held
      ? `ligne en ${listing.currency}, devise de dépôt : change hors du chiffre`
      : `${listing.currency} n'est pas une devise de dépôt : change 0,5 % dans chaque sens, dans le chiffre`,
    listed ? (via606 ? "mélange 606" : "aucun courtier US nommé : NBBO coté") : "place du catalogue",
    marketPerShare != null
      ? `carnet ${marketPerShare} la part`
      : marketBp != null
        ? `carnet ${marketBp} bp`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");
  const why =
    usd != null
      ? null
      : notionalUsd == null
        ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs`
        : `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de carnet pour ce ticker"}`;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    commission: { plan: chosen.name, rate, buy: finite(side, 6), sell: finite(side, 6), eachWay: true, currency: "USD", floorOnly: market === "dubai" },
    regulators: { sec: 0, taf: 0, cat: 0 },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      ...(held ? {} : { change: finite(fxUsd, 6) }),
      bourse: 0,
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          plans: PLANS,
          nasdaqDubai: "от 0,12% (floor, taken at 0.12%)",
          fx: "Валютный рынок 0.5%, each conversion; in the total for KZT, AED, CNY lines",
          deposits: "TJS, USD",
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/birzhevoy/birzhevoy_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=investor|trader]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    plan: flag("plan"),
  });
  if (!out.listing) {
    console.log(out.why);
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}, tarif ${out.commission?.plan ?? out.plan}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $   (${out.commission?.buy} $ par sens)`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.change) console.log(`  change         : ${parts.change} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(out.why);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
