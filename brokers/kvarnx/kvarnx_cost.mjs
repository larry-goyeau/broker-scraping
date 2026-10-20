// What one round trip costs at Kvarn X: buy n shares at price p and sell
// them straight back, in dollars. Shares, ETFs and ETNs in the Kvarn X
// app. Crypto, Kvarn X Gold and the monthly-saving plan are other tables.
//
// Hinnasto, tab « Osake- ja ETF-kaupankäynti », read on 2026-10-18:
//   https://www.kvarnx.com/fi/hinnasto
//   https://help.kvarnx.com/en/articles/13578356-getting-started-with-stock-and-etf-trading-on-kvarn-x
//   Shares, ETFs and funds         0.06 % (min. 4 €)
//   US share trades                0.06 % (min. 1 $)
//   « Sama kaupankäyntikulu 0,06 % koskee kaikkia asiakkaita – ei tasoja »:
//   one rate for every client and every market, Europe to the US, no
//   tiers. The commission is a percentage of each executed buy and sell,
//   charged in the currency the trade is quoted in. A 4 € floor on a
//   crown, pound or dollar line outside the US is that 4 € at the ECB mid.
//   Account and custody are free. Custom terms agreed in writing are
//   another client.
//
// Kvarn Investment Services Oy receives and transmits the order. The
// account, the custody and the execution are at Interactive Brokers, so
// a US line takes Interactive Brokers LLC's Rule 606 mix on the 605
// (as for LYNX and Air Bank, which also pass through IB Ireland).
//   https://help.kvarnx.com/en/articles/12665206-kvarn-x-investment-services-general-information
//
// Currency. Deposits are euros (SEPA or instant). A dollar, crown or pound
// line needs a currency order placed first, carried out through
// Interactive Brokers. Kvarn X prints no fee of its own for it, so the
// order pays Interactive Brokers' spot-currency commission, Tier I: 0.20
// basis point of the value, at least USD 2.00 per order. Euros are the
// only deposit currency, so the conversion is forced and both orders (in
// before the buy, back after the sale) are in the total. A euro line
// converts nothing.
//   https://www.interactivebrokers.ie/en/pricing/commissions-spot-currencies.php
//
// Taxes. Stamp and transaction taxes come from taxMap, on the buy. SEC and
// FINRA TAF on a US sale are not on Kvarn X's table, so none is added.
// The IB withdrawal fee after the first free one each month is not a trade.
//
//   node brokers/kvarnx/kvarnx_cost.mjs SAN XMAD EUR --shares=10 --price=6
//   node brokers/kvarnx/kvarnx_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/kvarnx/kvarnx_cost.mjs VOLV-B XSTO SEK --shares=10 --price=280
//   node brokers/kvarnx/kvarnx_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { isListedUsTape, listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { qOf } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("kvarnx-parsed.json", import.meta.url);

const SCHEDULE = {
  fees: "https://www.kvarnx.com/fi/hinnasto",
  help: "https://help.kvarnx.com/en/articles/13578356-getting-started-with-stock-and-etf-trading-on-kvarn-x",
  services: "https://help.kvarnx.com/en/articles/12665206-kvarn-x-investment-services-general-information",
  readOn: "2026-10-18",
  entity: "Kvarn Investment Services Oy (RTO) ; compte, garde et exécution chez Interactive Brokers",
  rule606: "interactivebrokers",
};

const CASH = "EUR";
const RATE = 0.0006;
const MIN_EUR = 4;
const US_MIN_USD = 1;
const US_DEALER = SCHEDULE.rule606;
const US_OTC = new Set(["OTCM"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// Interactive Brokers spot currencies, Tier I, per currency order.
const IB_FX_RATE = 0.00002;
const IB_FX_MIN_USD = 2;

function ibFxUsd(notionalUsd) {
  return notionalUsd == null ? null : Math.max(notionalUsd * IB_FX_RATE, IB_FX_MIN_USD);
}

// The conversion is forced and is in the total, so it is not a remark.
function remarkOf() {
  return "";
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

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: CASH,
    url: SCHEDULE.fees,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Kvarn X n'existe pas encore : lancer `node brokers/kvarnx/kvarnx_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Kvarn X` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Kvarn X`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const mic = m.venue?.mic ?? null;
  const usTape = code(m.row.currency) === "USD" && isListedUsTape(mic);
  // « Yhdysvaltain osakekaupat »: a US share trade, listed or OTC.
  const usTrade = code(m.row.currency) === "USD" && (usTape || US_OTC.has(mic));
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: usTrade ? US_DEALER : "kvarnx",
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
  const q = usTape ? qOf(US_DEALER) : null;
  const marketBp = bp ?? (usTape ? null : book.leaf?.bp ?? null);
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const floor = usTrade ? `${US_MIN_USD} $` : `${MIN_EUR} €`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency === CASH ? CASH : "",
    remark: remarkOf(listing.currency),
    basis:
      `hinnasto Kvarn X, relu le ${SCHEDULE.readOn} : 0,06 % par ordre exécuté, minimum ${floor}, à l'achat et à la vente, ` +
      `dans la devise de cotation` +
      (usTape ? ` ; carnet 605 × Q Interactive Brokers${q != null ? ` ${Number(q.toFixed(3))}` : " (pas de Q, NBBO coté)"}` : ""),
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: null,
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const rawUsd = notionalUsd == null ? null : notionalUsd * RATE;
  const floorUsd = usTrade ? US_MIN_USD : dollars(MIN_EUR, CASH);
  const side = rawUsd == null || floorUsd == null ? null : Math.max(rawUsd, floorUsd);
  const commissionUsd = plus(side, side);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: usTape ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  // A line outside euros needs a currency order first, and its cost is not
  // published: unknown, so the total is unknown too.
  const converts = listing.currency !== CASH;
  const fxUsd = converts ? plus(ibFxUsd(notionalUsd), ibFxUsd(notionalUsd)) : 0;
  // The currency orders are part of the broker's bill, as at Portu.
  const brokerFees = plus(commissionUsd, fxUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd);

  const confidence = [
    side == null
      ? "courtage inconnu : pas de cours"
      : `courtage ${side.toFixed(2)} $ par sens (${side === floorUsd ? `minimum ${floor}` : "0,06 %"})`,
    converts ? "change via Interactive Brokers, 0,20 point de base, minimum 2 USD par ordre, deux ordres" : "",
    usTrade ? "SEC et TAF absents du barème Kvarn X : non ajoutés" : "",
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
    commission: {
      rate: RATE,
      min: usTrade ? US_MIN_USD : MIN_EUR,
      minCurrency: usTrade ? "USD" : "EUR",
      eachUsd: finite(side, 6),
      currency: listing.currency,
      eachWay: true,
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
          cash: CASH,
          rate: RATE,
          minEur: MIN_EUR,
          usMinUsd: US_MIN_USD,
          custody: 0,
          fxFee: "Interactive Brokers spot currencies, Tier I: 0.20 bp of the value, min USD 2.00 per order, two orders when the line is not in EUR",
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
    console.error("usage : node brokers/kvarnx/kvarnx_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
