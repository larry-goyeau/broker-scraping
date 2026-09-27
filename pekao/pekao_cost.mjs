// What one round trip costs at Pekao Biuro Maklerskie: buy n shares at price
// p, sell them back at once, in dollars. Internet orders. The phone line is
// another column and stays out. The under-30 waiver is another offer.
//
// Tariff re-read 2026-09-27. Two promotions run from 1 January 2026 through
// 31 December 2026 and are the rate while they last.
//
//   Poland, part I point 1, internet, no prior turnover (first band)
//     shares, rights, warrants, depositary receipts, REIT,
//     certificates, ETP, structured products
//       0.375 % min 5.90 zł per order
//     the same session's reverse trade, point 12, on shares and ETF
//       0.25 % min 5.90 zł
//     GPW ETF, ETC and ETN, communiqué 104, both legs
//       0.10 % min 5.90 zł
//   Abroad, part II point 2, charged in the order currency
//     communiqué 105, remote channels, except Greece
//       USD  0.25 % min 8 USD
//       GBP  0.25 % min 9 GBP
//       EUR  0.25 % min 10 EUR
//     otherwise the order-size bands of the tariff, first step
//       USD, CHF     0.50 % min 35, then 0.43 % + 21, 0.41 % + 31, 0.40 % + 41
//       EUR          0.50 % min 30, then 0.43 % + 17.50, 0.41 % + 25.50, 0.40 % + 33.60
//       GBP          0.50 % min 20, then 0.43 % + 14, 0.41 % + 20, 0.40 % + 26.50
//       NOK, SEK, DKK  0.50 % min 200, then 0.43 % + 84, 0.41 % + 144, 0.40 % + 204
//       AUD, CAD     0.50 % min 50, then 0.43 % + 21, 0.41 % + 31, 0.40 % + 41
//     a share priced under 0.05 USD, part II point 3
//       0.015 USD a share, min 75 USD, per order
//
// The commission is taken in the currency of the order. Section IV is a
// negotiated conversion, capped, and only when cash is exchanged: at most
// 0.3 % (min 30 zł) to buy foreign currency, at most 1 % (min 100 zł) to buy
// PLN. That cap is the remark, not this ticket. Custody, the 60 zł account
// fee and the 12.30 USD 1042-S form
// are not a ticket either. Stamp and FTT come from the tax map. The tariff
// names no PTM levy and no SEC fee.
//
// A US line is stored as USA. The 2026 execution policy does not name a US
// broker-dealer, so no Rule 606 mix is applied. The book is the quoted NBBO
// of that symbol.
//
//   https://www.pekao.com.pl/dam/jcr:cd6ba73a-187e-4fad-96a8-fd1244f4e547/taryfa-prowizji-i-oplat-biura-maklerskiego-pekao-2021.2025-11-30-17-08-03.pdf
//   https://www.pekao.com.pl/dam/jcr:e208b3ef-1ba3-47f6-89e8-e1defdc24dd6/20251222_104_BM_ZWS_2025.2026-01-07-10-31-56.pdf
//   https://www.pekao.com.pl/dam/jcr:ae52d6d4-7522-44b7-ac1f-c01a6929e0e7/20251222_105_BM_ZWS_2025.2026-01-07-10-32-18.pdf
//
//   node pekao/pekao_cost.mjs PLPKO0000016 GPW PLN --shares=10 --price=50
//   node pekao/pekao_cost.mjs US0378331005 USA USD --shares=10 --price=230
//   node pekao/pekao_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { usBookPerShare } from "../rule606.mjs";
import { bookParts, plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash, fxRemark } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("pekao-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.pekao.com.pl/dam/jcr:cd6ba73a-187e-4fad-96a8-fd1244f4e547/taryfa-prowizji-i-oplat-biura-maklerskiego-pekao-2021.2025-11-30-17-08-03.pdf",
  gpwPromo: "https://www.pekao.com.pl/dam/jcr:e208b3ef-1ba3-47f6-89e8-e1defdc24dd6/20251222_104_BM_ZWS_2025.2026-01-07-10-31-56.pdf",
  foreignPromo: "https://www.pekao.com.pl/dam/jcr:ae52d6d4-7522-44b7-ac1f-c01a6929e0e7/20251222_105_BM_ZWS_2025.2026-01-07-10-32-18.pdf",
  readOn: "2026-09-27",
  tariffOn: "2025-11-30",
  promoFrom: "2026-01-01",
  promoThrough: "2026-12-31",
  entity: "Biuro Maklerskie Pekao",
};

const POLISH_RATE = 0.00375;
const POLISH_MIN = 5.9;
const DAY_RATE = 0.0025;
const GPW_ETP_RATE = 0.001;
const PROMO_RATE = 0.0025;
const PENNY = { under: 0.05, perShare: 0.015, min: 75, currency: "USD" };

const PROMO_MIN = { USD: 8, GBP: 9, EUR: 10 };

// Order-size bands. `to` is the top of the band, inclusive. The first band
// has a minimum. The later bands add a fixed amount.
const BANDS = {
  USD: [
    { to: 30000, rate: 0.005, min: 35 },
    { to: 50000, rate: 0.0043, add: 21 },
    { to: 100000, rate: 0.0041, add: 31 },
    { to: Infinity, rate: 0.004, add: 41 },
  ],
  EUR: [
    { to: 25000, rate: 0.005, min: 30 },
    { to: 40000, rate: 0.0043, add: 17.5 },
    { to: 81000, rate: 0.0041, add: 25.5 },
    { to: Infinity, rate: 0.004, add: 33.6 },
  ],
  GBP: [
    { to: 20000, rate: 0.005, min: 20 },
    { to: 30000, rate: 0.0043, add: 14 },
    { to: 65000, rate: 0.0041, add: 20 },
    { to: Infinity, rate: 0.004, add: 26.5 },
  ],
  NOK: [
    { to: 120000, rate: 0.005, min: 200 },
    { to: 300000, rate: 0.0043, add: 84 },
    { to: 600000, rate: 0.0041, add: 144 },
    { to: Infinity, rate: 0.004, add: 204 },
  ],
};
BANDS.CHF = BANDS.USD;
BANDS.SEK = BANDS.NOK;
BANDS.DKK = BANDS.NOK;
BANDS.AUD = [
  { to: 30000, rate: 0.005, min: 50 },
  { to: 50000, rate: 0.0043, add: 21 },
  { to: 100000, rate: 0.0041, add: 31 },
  { to: Infinity, rate: 0.004, add: 41 },
];
BANDS.CAD = BANDS.AUD;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function pct(rate) {
  const n = rate * 100;
  const thousandths = Math.round(n * 1000);
  const digits = thousandths % 10 === 0 ? 2 : 3;
  return `${(thousandths / 1000).toFixed(digits)} %`;
}

function money(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function warsawDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function promoLive(now = new Date()) {
  const day = warsawDay(now);
  return day >= SCHEDULE.promoFrom && day <= SCHEDULE.promoThrough;
}

function polishMarket(exchange) {
  const ex = loose(exchange);
  return ex === "GPW" || ex === "XWAR" || ex === "NEWCONNECT";
}

function gpwBoard(exchange) {
  const ex = loose(exchange);
  return ex === "GPW" || ex === "XWAR";
}

function greece(exchange) {
  return loose(exchange) === "XATH";
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
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function flat(rate, min, currency, label) {
  return { rate, min, currency, label: label || `${pct(rate)} min ${money(min)} ${currency}` };
}

function orderAmount(notional, shares, spec) {
  if (!spec) return null;
  if (spec.penny) return Math.max(spec.perShare * shares, spec.min);
  if (spec.add != null) return notional * spec.rate + spec.add;
  return Math.max(notional * spec.rate, spec.min);
}

function bandSpec(notional, currency) {
  const bands = BANDS[currency];
  if (!bands) return null;
  const band = bands.find((row) => notional <= row.to) || bands.at(-1);
  if (band.min != null) return flat(band.rate, band.min, currency);
  return {
    rate: band.rate,
    add: band.add,
    currency,
    label: `${pct(band.rate)} + ${money(band.add)} ${currency}`,
  };
}

function legsOf(listing, notional, price) {
  if (polishMarket(listing.brokerExchange)) {
    const etp = listing.type === "ETF" || listing.type === "ETC" || listing.type === "ETN";
    if (etp && gpwBoard(listing.brokerExchange) && promoLive()) {
      const leg = flat(GPW_ETP_RATE, POLISH_MIN, "PLN");
      return { buy: leg, sell: leg, note: "promotion GPW ETF/ETC/ETN, communiqué 104" };
    }
    const buy = flat(POLISH_RATE, POLISH_MIN, "PLN");
    const dayTrade = listing.type === "STOCK" || listing.type === "ETF";
    const sell = dayTrade ? flat(DAY_RATE, POLISH_MIN, "PLN") : buy;
    return {
      buy,
      sell,
      note: dayTrade
        ? "première tranche, sans historique d'ordres ; vente le jour même au day trading"
        : "première tranche, sans historique d'ordres",
    };
  }
  if (listing.type === "STOCK" && listingCash(listing.currency) === "USD" && price < PENNY.under) {
    const leg = {
      penny: true,
      perShare: PENNY.perShare,
      min: PENNY.min,
      currency: PENNY.currency,
      label: "0.015 USD par action, min 75 USD",
    };
    return { buy: leg, sell: leg, note: "action sous 0,05 USD, partie II point 3" };
  }
  const cash = listingCash(listing.currency);
  if (promoLive() && PROMO_MIN[cash] != null && !greece(listing.brokerExchange)) {
    const leg = flat(PROMO_RATE, PROMO_MIN[cash], cash);
    return { buy: leg, sell: leg, note: "promotion des ordres en EUR, USD et GBP, communiqué 105" };
  }
  const leg = bandSpec(notional, cash);
  if (!leg) return null;
  const note = greece(listing.brokerExchange)
    ? "Grèce hors promotion, barème de la partie II point 2"
    : "barème de la partie II point 2";
  return { buy: leg, sell: leg, note };
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the ticket.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Pekao n'existe pas encore : lancer `node pekao/pekao_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Pekao` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Pekao`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "pekao",
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
  const n = Number(shares);
  const p = Number(price);
  const priced = n > 0 && p > 0;
  const rule = priced ? legsOf(listing, n * p, p) : legsOf(listing, 0, Number.POSITIVE_INFINITY);
  if (!rule) {
    return {
      ...answer,
      listing,
      why: `${listing.currency} n'a pas de ligne dans la taryfa`,
    };
  }
  const same = rule.buy.label === rule.sell.label;
  const rateText = same ? `${rule.buy.label} par ordre` : `${rule.buy.label} à l'achat, ${rule.sell.label} à la vente`;
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: rule.buy.currency,
    remark: fxRemark("max 0.3", listing.currency, "(min 30 PLN) to buy foreign currency, max 1% (min 100 PLN) to buy PLN"),
    url: SCHEDULE.url,
    basis: `taryfa Pekao du ${SCHEDULE.tariffOn}, relue le ${SCHEDULE.readOn} : ${rateText}`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!priced) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const american = loose(listing.brokerExchange) === "USA" && listing.currency === "USD";
  const leaf = book.leaf;
  let marketBp = bp ?? leaf?.bp ?? null;
  let marketPerShare = perShare ?? leaf?.perShare ?? null;
  if (american && marketBp == null && marketPerShare == null) {
    const quoted = usBookPerShare({ broker: "pekao", ticker: listing.ticker });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null
      ? null
      : parts.b == null
        ? null
        : parts.a * notionalUsd + parts.b * n;
  const buyLocal = orderAmount(notional, n, rule.buy);
  const sellLocal = orderAmount(notional, n, rule.sell);
  const buyUsd = buyLocal == null ? null : dollars(buyLocal, rule.buy.currency);
  const sellUsd = sellLocal == null ? null : dollars(sellLocal, rule.sell.currency);
  const commissionUsd = plus(buyUsd, sellUsd);
  const brokerFees = commissionUsd;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    rule.note,
    polishMarket(listing.brokerExchange)
      ? "marché polonais, ordre internet"
      : `ordre internet, commission en ${rule.buy.currency}`,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? american
          ? `carnet NBBO coté ${marketPerShare} $ la part`
          : `carnet ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: {
      rate: rule.buy.penny ? null : rule.buy.rate,
      min: rule.buy.min ?? null,
      currency: rule.buy.currency,
      eachWay: same,
      sellRate: rule.sell.penny ? null : rule.sell.rate,
    },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`,
        }
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
      courtage: finite(commissionUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          promoLive: promoLive(),
          poland: "0.375 % min 5.90 PLN, internet, first turnover band",
          dayTrade: "0.25 % min 5.90 PLN on the same-session reverse trade, shares and ETF",
          gpwEtp: "0.10 % min 5.90 PLN through 2026-12-31",
          rates: "0.25 % min 8 USD, 9 GBP or 10 EUR through 2026-12-31, Greece excluded",
          penny: "0.015 USD a share, min 75 USD, under 0.05 USD",
          conversion: "none in the ticket; section IV caps are in the remark",
          rule606: null,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node pekao/pekao_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
