// What one round trip costs at Racional: buy n shares at price p, sell
// them back at once, in dollars. Two products. Racional Stocks is a US
// account in the client's name at DriveWealth LLC, for US shares and
// ETFs. Racional Portafolios holds Chilean shares and ETFs on the Bolsa
// de Santiago at Vector Capital. Racional itself is an order router
// registered with the CMF.
//
// Two plans on the US account, each a row (`query.plan`):
//   free   the default: 0 commission on ten orders a month, dollar
//          spread about 0.99 % each way.
//   pro    CLP 5,990 a month (annual) or 8,990 (monthly), unlimited
//          orders, dollar spread about 0.49 % each way. The fee stays
//          out of the trip; the remark names it.
// Santiago lines price the same on both plans.
//
// Re-read 2026-10-18.
//   https://racional.cl/stocks
//   https://ayuda.racional.cl/es/articles/5551742-cuanto-cuesta-invertir-por-racional-stocks
//   https://ayuda.racional.cl/es/articles/7207469-cual-es-el-spread-del-dolar
//   https://ayuda.racional.cl/es/articles/5551738-quien-opera-y-custodia-mis-inversiones-en-stocks
//   https://ayuda.racional.cl/es/articles/7829556-en-que-se-diferencia-racional-portafolios-y-racional-stocks
//   https://racional.cl/portafolios
//
//   US shares and ETFs (Stocks)
//     commission    0. Free gives ten buys or sells a month; a round
//                   trip spends two. Pro has no limit.
//     dollar        the account takes pesos only (deposits.mjs). Pesos
//                   sent to the Stocks wallet are bought into dollars,
//                   and a withdrawal sells them back, at the interbank
//                   rate plus a spread of about 0.99 % on Free, 0.49 %
//                   on Pro. The buy pays it on the way in, the sale on
//                   the way out, and both are in the total.
//     SEC, TAF and CAT are not on any Racional page, so they are not
//     added.
//   Chilean shares and ETFs (Portafolios), Bolsa de Santiago
//     commission    0 per trade, and no exchange: the line is in pesos.
//     Portafolios   1.00 % a year on the amount invested, VAT included.
//                   That is the remark: it is a holding fee, not a
//                   ticket. Orders go once a day, near 11:30.
//
// DriveWealth operates and custodies the US account. DriveWealth's 2026
// Q2 606 has no stock mix, so its key gives no Q and the book is the
// quoted NBBO, as the same key does at Baraka and Riise. Santiago is
// read on its own book.
//
//   node brokers/racional/racional_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/racional/racional_cost.mjs AAPL NASDAQ USD --shares=10 --price=230 --plan=pro
//   node brokers/racional/racional_cost.mjs SPY AMEX USD --shares=10 --price=500
//   node brokers/racional/racional_cost.mjs SQM-B BCS CLP --shares=10 --price=59490
//   node brokers/racional/racional_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("racional-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://ayuda.racional.cl/es/articles/5551742-cuanto-cuesta-invertir-por-racional-stocks",
  stocks: "https://racional.cl/stocks",
  dollar: "https://ayuda.racional.cl/es/articles/7207469-cual-es-el-spread-del-dolar",
  dealer: "https://ayuda.racional.cl/es/articles/5551738-quien-opera-y-custodia-mis-inversiones-en-stocks",
  portafolios: "https://racional.cl/portafolios",
  readOn: "2026-10-18",
  entity: "Racional SpA",
  usDealer: "DriveWealth, LLC",
  clDealer: "Vector Capital",
  rule606: "drivewealth",
};

const CASH = "CLP";
const FREE_TRADES = 10;
const FX_FREE = 0.0099;
const FX_PRO = 0.0049;
const PRO_CLP = { annualPerMonth: 5990, monthly: 8990 };
const PORTAFOLIOS_YEARLY = 0.01;
const US_PLACES = new Set(["NASDAQ", "NYSE", "AMEX", "CBOEBZX", "US"]);
const spaced = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, " ");
const comma = (rate) => (100 * rate).toFixed(2).replace(".", ",");
const PLANS = {
  free: {
    name: "Free",
    fx: FX_FREE,
    freeOrders: FREE_TRADES,
    // The trip spends two of the free orders, so its commission is 0.
    remark: `If more than ${FREE_TRADES} orders a month, Pro is required (from ${PRO_CLP.annualPerMonth.toLocaleString("en-US")} CLP/month).`,
    basis: (readOn) =>
      `Racional Stocks, plan Free, relu le ${readOn} : 0 commission sur les ${FREE_TRADES} premiers ordres du mois ; écart du dollar ${comma(FX_FREE)} % à l'achat des dollars et à leur revente`,
  },
  pro: {
    name: "Pro",
    fx: FX_PRO,
    freeOrders: null,
    remark: `Pro costs ${PRO_CLP.annualPerMonth.toLocaleString("en-US")} CLP/month (annual) or ${PRO_CLP.monthly.toLocaleString("en-US")} monthly.`,
    basis: (readOn) =>
      `Racional Stocks, plan Pro (${spaced(PRO_CLP.annualPerMonth)} CLP par mois à l'année ou ${spaced(PRO_CLP.monthly)} au mois, hors de cet aller-retour), relu le ${readOn} : 0 commission, ordres illimités ; écart du dollar ${comma(FX_PRO)} % à l'achat des dollars et à leur revente`,
  },
};
// The Portafolios fee is a yearly charge on the amount held, like custody.
const CL_REMARK = "Custody 1%/year.";

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
      if (loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return false;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
  const chosen = PLANS[String(plan)] || PLANS.free;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: CASH,
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Racional n'existe pas encore : lancer `node brokers/racional/racional_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Racional` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Racional`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const american = US_PLACES.has(loose(m.row.exchange)) && code(m.row.currency) === "USD";
  const santiago = loose(m.row.exchange) === "BCS" && code(m.row.currency) === CASH;
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: american ? SCHEDULE.rule606 : "racional",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? (m.row.mic || null),
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  let marketBp = bp ?? book.leaf?.bp ?? null;
  let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  if (american && bp == null && perShare == null) {
    const quoted = usBookPerShare({ broker: SCHEDULE.rule606, ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) {
      marketPerShare = quoted;
      marketBp = null;
    }
  }
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    url: santiago ? SCHEDULE.portafolios : SCHEDULE.url,
    remark: american ? chosen.remark : santiago ? CL_REMARK : "",
    basis: american
      ? chosen.basis(SCHEDULE.readOn)
      : `Racional Portafolios, relu le ${SCHEDULE.readOn} : 0 commission par ordre, ligne en pesos, pas de change`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!american && !santiago) {
    return { ...shared, why: `${listing.brokerExchange} en ${listing.currency} n'a pas de ligne dans les tarifs Racional` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  if (notionalUsd == null) return { ...shared, why: "pas de cours pour cette devise" };
  const commissionUsd = 0;
  const fxUsd = american ? notionalUsd * chosen.fx * 2 : 0;
  const brokerFees = plus(commissionUsd, fxUsd);
  const taxUsd = notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: american ? null : m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd = parts.a == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    listing.type === "ETF" ? "barème ETF" : "barème action",
    american
      ? marketPerShare != null
        ? `carnet ${marketPerShare} $ la part : DriveWealth n'a pas de mélange 606 actions, NBBO coté`
        : `pas de 605 pour ce ticker`
      : marketBp != null
        ? `carnet ${Number(marketBp.toPrecision(4))} bp`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
    american ? "SEC, TAF et CAT non publiés par Racional, hors du total" : "commission Portafolios annuelle hors du total",
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || (american ? "pas de 605 pour ce ticker" : "pas de feuille de carnet")}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { each: 0, eachWay: true, currency: listing.currency, ...(american && chosen.freeOrders ? { freeOrders: chosen.freeOrders } : {}) },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
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
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({
      ...SCHEDULE,
      cash: CASH,
      default: "free",
      plans: {
        free: { dollarSpread: FX_FREE, freeTradesPerMonth: FREE_TRADES, remark: PLANS.free.remark, basis: PLANS.free.basis(SCHEDULE.readOn) },
        pro: { dollarSpread: FX_PRO, clp: PRO_CLP, remark: PLANS.pro.remark, basis: PLANS.pro.basis(SCHEDULE.readOn) },
      },
      santiago: "même tarif sur les deux plans",
      portafoliosYearly: PORTAFOLIOS_YEARLY,
    }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/racional/racional_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({
    etf,
    place,
    currency,
    shares: Number(flag("shares") ?? "10"),
    price: Number(flag("price") ?? "0"),
    plan: flag("plan"),
  }), null, 2));
}

printCli();
