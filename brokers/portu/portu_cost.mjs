// What one round trip costs at Portu in Brokerage mode (« Jednotlivé akcie
// a ETF »): buy n shares at price p and sell them straight back, in
// dollars. The Classic account at the Bronze level. The managed
// portfolios, the funds, Gallery and opPORTUnity are other products.
//
// Sazebník služeb in force from 1 September 2026, read on 2026-10-18,
// section IV:
//   https://app.portu.cz/documents/download/generaldocument/cs/PriceList
//   https://magazin.portu.cz/pruvodce-obchodovanim-na-portu-v-brokerage-rezimu/
//   Order fee, Classic account     Bronze 0.4 %, Silver 0.3 %, Gold and
//                                  Platinum 0.2 % of the executed order
//   Minimum                        39 Kč / 2 EUR / 2 USD, in the currency
//                                  of the order. An order worth less than
//                                  the minimum pays its own value
//                                  (footnote 3).
//   Currency exchange for          0.4 %
//   investing
//   Third-party fees and taxes     stamp duty, FTT, ADR fees are passed on
// The level is set by the money invested in the managed portfolios of
// the Classic account (Bronze up to 0.5 m Kč, Silver to 1 m, Gold to 5 m,
// Platinum above), and the Portu <26 account halves the rate of its level
// with the same minimum. Each rate is a row (`query.plan`): bronze (the
// default, a Brokerage-only client), silver, gold (Gold and Platinum),
// u26, u26silver, u26gold. Custody (0.05 % a year) is a charge on holding
// and stays out.
//   https://www.portu.cz/investice/jednotlive-akcie-etf
//   https://www.portu.cz/o-nas/kolik-to-stoji
//
// Places: Prague, Xetra, Amsterdam, London and New York (NYSE, Nasdaq).
// Portu does not name a US broker-dealer, so no Rule 606 mix is applied:
// the US book is the quoted NBBO of the ticker. The price list names no
// SEC or FINRA fee, so none is added. Stamp and transaction taxes come
// from taxMap, on the buy.
//
// Currency. The Brokerage wallet holds the crowns or euros that were sent
// to it. Dollars cannot be deposited; they come only from the 0.4 %
// exchange. A crown or euro line can be paid with cash deposited in that
// currency, so its 0.4 % is the remark ("FX 0.4 % when cash ≠ …"). A
// dollar line cannot: dollars are not a deposit currency, so the line is
// exchanged on the way in and back on the way out, 0.4 % each time, and
// that is in the total.
//
//   node brokers/portu/portu_cost.mjs CEZ XPRA CZK --shares=10 --price=1100
//   node brokers/portu/portu_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/portu/portu_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { isListedUsTape, listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("portu-parsed.json", import.meta.url);

const SCHEDULE = {
  priceList: "https://app.portu.cz/documents/download/generaldocument/cs/PriceList",
  guide: "https://magazin.portu.cz/pruvodce-obchodovanim-na-portu-v-brokerage-rezimu/",
  readOn: "2026-10-18",
  inForceFrom: "2026-09-01",
  entity: "WOOD Retail Investments a.s. (Portu)",
  level: "Bronzová",
};

const RATE = 0.004;
const LEVELS = { bronze: 0.004, silver: 0.003, gold: 0.002, platinum: 0.002 };
// One row per order-fee rate (`query.plan`). The level comes from the money in
// the managed portfolios of the Classic account: Bronze up to 500 000 Kč,
// Silver to 1 m, Gold to 5 m, Platinum above (Gold and Platinum share 0.2 %).
// The Portu <26 account halves the rate of its level; the minimum stays.
const PLANS = {
  bronze: { rate: LEVELS.bronze, label: "niveau Bronze" },
  silver: { rate: LEVELS.silver, label: "niveau Argent" },
  gold: { rate: LEVELS.gold, label: "niveaux Or et Platine" },
  u26: { rate: LEVELS.bronze / 2, label: "compte Portu <26, niveau Bronze" },
  u26silver: { rate: LEVELS.silver / 2, label: "compte Portu <26, niveau Argent" },
  u26gold: { rate: LEVELS.gold / 2, label: "compte Portu <26, niveaux Or et Platine" },
};
const MIN = { CZK: 39, EUR: 2, USD: 2 };
const FX_RATE = 0.004;
const HOLD = new Set(["CZK", "EUR"]);
const PLACES = new Set(["XPRA", "XETR", "XAMS", "XLON", "XNAS", "XNYS"]);

function remarkOf(currency, plan = "bronze") {
  const lines = [];
  if (HOLD.has(currency)) lines.push(fxRemark("0.4", currency));
  lines.push(String(plan).startsWith("u26") ? "Custody 0.025%/year." : "Custody 0.05%/year.");
  return lines.join("\n");
}

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// One side, in the order currency: the rate, floored, never above the order.
export function orderFee(notional, currency, rate = RATE) {
  const min = MIN[currency];
  if (min == null || !(notional > 0)) return null;
  return Math.min(notional, Math.max(notional * rate, min));
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
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = "bronze" }) {
  const level = PLANS[plan] || PLANS.bronze;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
    url: SCHEDULE.priceList,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Portu n'existe pas encore : lancer `node brokers/portu/portu_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Portu` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Portu`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const mic = m.venue?.mic ?? null;
  const american = code(m.row.currency) === "USD" && isListedUsTape(mic);
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "portu",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? mic,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const held = HOLD.has(listing.currency);
  const min = MIN[listing.currency];
  const marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? listing.currency : "",
    remark: remarkOf(listing.currency, plan),
    basis:
      `sazebník Portu du ${SCHEDULE.inForceFrom}, relu le ${SCHEDULE.readOn}, Brokerage, ${level.label} : ` +
      `${String(Number((level.rate * 100).toFixed(4))).replace(".", ",")} % par ordre exécuté, minimum ${min ?? "non imprimé"} ${listing.currency}, jamais plus que l'ordre` +
      (held ? "" : " ; change 0,4 % à l'aller et au retour, les dollars ne pouvant être déposés"),
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: held ? FX_RATE * 2 : 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!PLACES.has(mic)) {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'est pas une des places du mode Brokerage` };
  }
  if (min == null) {
    return { ...shared, why: `le sazebník n'imprime pas de minimum en ${listing.currency}` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const side = orderFee(notional, listing.currency, level.rate);
  const commissionUsd = dollars(side * 2, listing.currency);
  // A dollar line is bought with exchanged crowns or euros and sold back
  // into them: 0.4 % of the order each way. Dollars are not a deposit
  // currency, so this conversion is forced and is in the total.
  const fxUsd = held ? 0 : notionalUsd == null ? null : notionalUsd * FX_RATE * 2;
  const brokerFees = plus(commissionUsd, fxUsd);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  const confidence = [
    `courtage ${side.toFixed(2).replace(".", ",")} ${listing.currency} par sens` +
      (side === min ? " (minimum)" : side === notional ? " (plafonné à la valeur de l'ordre)" : " (0,4 %)"),
    held ? "pas de change : la devise peut être déposée" : "change 0,4 % deux fois, dans le total : les dollars ne peuvent être déposés",
    american ? "Portu ne nomme pas de courtier US : carnet au NBBO coté, sans 606 ; SEC et TAF absents du sazebník" : "",
    taxPct > 0 ? `taxes à l'achat ${(100 * taxPct).toFixed(2).replace(".", ",")} % (taxMap)` : "",
    marketPerShare != null
      ? `carnet ${marketPerShare} $ la part`
      : marketBp != null
        ? `carnet ${marketBp} bp à ${listing.exchange}`
        : `pas de carnet pour ${listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate: level.rate, min, each: finite(side, 6), currency: listing.currency, eachWay: true, fx: held ? 0 : FX_RATE },
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
  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          rate: RATE,
          levels: LEVELS,
          plans: Object.fromEntries(Object.entries(PLANS).map(([id, p]) => [id, p.rate])),
          min: MIN,
          minCapsAtOrderValue: true,
          fxRate: FX_RATE,
          hold: [...HOLD],
          custodyPerYear: 0.0005,
          places: [...PLACES],
        },
        null,
        2
      )
    );
    return;
  }
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/portu/portu_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
