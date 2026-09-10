// What one round trip costs at Century Trader: buy n shares at price p, sell
// them back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in.
//
// Century Financial Consultancy LLC (AE, CMA). The catalogue is Century Trader
// (`liveapp.century.ae`, `century.mjs`), not TWS / CQG / MT5. The site still
// calls the lines share CFDs. Every card read on 2026-09-09 printed margin
// 100 %, holding 0 %, dealer spread 0 — cash-like, no overnight on a same-day
// trip. A live NIO trip on a EUR cash account (2026-09-09) charged the 4 €
// minimum each way and nothing else: no SEC, no TAF. The card still prints
// "4 USD min"; the ticket and the cash (20.00 → 11.99) are in euros. `a`
// therefore has no SEC. The US 0.01 € / share stays out of `b` (the 4 € min
// is the whole bill under ~345 shares). Hong Kong's 0.50 % × 2 sits in `a`.
// The ticket is a floor (`min fees`, `c` = 0). `exactCost` answers the real
// step.
//
// The scrape names no venue, only the settlement currency: USD (New York),
// HKD (Hong Kong), SAR (Riyadh). The US underlying book is Rule 605, found by
// trying the NMS MICs — Century does not say which tape. Hong Kong and Tadawul
// have no sourced book in this deposit.
//
// Cards, signed-in session on liveapp.century.ae, 2026-09-09, GETPRODUCTDETAILS:
//   USD  0.01 EUR per Unit (4 USD min)   — 25 / 25 names
//   HKD  0.5 % per Unit (20 USD min)     — 8 / 8 names
//   SAR  "-"                             — 4 / 4 names, not copied as a number
// A public-cache snapshot of the same app once printed 0.16 USD / 10 USD min
// on Apple; that is not this session.
//
// One live trip on 2026-09-09, Century Trader EUR cash. One market buy of 1
// NIO (US62914V1061) at 3.765 then CLOSEPOSITION of 1 at 3.76. History
// Commission −4 € each way. Cash 20.00 → 12.76 → 11.99. P&L −0.01 on the
// stock. Positions back to 0. `c` stays 0; the 8 € is the floor.
//
//   https://www.century.ae/en/shares-trading/
//   https://liveapp.century.ae/
//
//   node century/century_cost.mjs AAPL
//   node century/century_cost.mjs AAPL NASDAQ USD --shares=1 --price=230
//   node century/century_cost.mjs 1772 HKEX HKD
//   node century/century_cost.mjs 1120 TADAWUL SAR
//   node century/century_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("century-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://liveapp.century.ae/",
  shares: "https://www.century.ae/en/shares-trading/",
  readOn: "2026-09-09",
  entity: "Century Financial Consultancy LLC (AE), Century Trader",
};

const US_MICS = ["XNAS", "XNYS", "ARCX", "XASE", "BATS"];
const MARKET_NAME = { us: "USA", hk: "Hong Kong", sa: "Tadawul" };

const CHECK = {
  isin: "US62914V1061",
  ticker: "NIO",
  query: "NIO.EQ",
  accountCcy: "EUR",
  n: 1,
  buy: { price: 3.765, commission: -4, dealId: 4091523 },
  sell: { price: 3.76, commission: -4, pnl: -0.01, dealId: 4091528 },
  cash: { start: 20, afterBuy: 12.76, end: 11.99 },
  commissionPaid: 8,
  on: "2026-09-09",
};

const RULE = {
  us: { perShare: 0.01, perShareCcy: "EUR", min: 4, minCcy: "EUR" },
  hk: { rate: 0.005, min: 20, minCcy: "USD" },
  sa: { rate: null, min: null, minCcy: "USD" },
};

const PLACE_OF = {
  us: ["US", "USA", "NASDAQ", "NYSE", "AMEX", "ARCA", "BATS", "XNAS", "XNYS", "ARCX"],
  hk: ["HKEX", "HONGKONG", "HK", "XHKG", "SEHK"],
  sa: ["TADAWUL", "SAUDI", "XSAU", "SAR"],
};

const EXCHANGE_OF = { us: "NASDAQ", hk: "HKEX", sa: "TADAWUL" };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

export function feeMarketOf(row) {
  const ccy = String(row?.currency || "").toUpperCase();
  if (ccy === "USD") return "us";
  if (ccy === "HKD") return "hk";
  if (ccy === "SAR") return "sa";
  return null;
}

const houseName = (row) => loose(row.query).replace(/(HKEQ|EQ|SA)$/, "");

function venueRow(row) {
  const market = feeMarketOf(row);
  return { ...row, exchange: row.exchange || EXCHANGE_OF[market] || row.exchange };
}

function usBook(isin, currency) {
  const id = String(isin || "").toUpperCase();
  const ccy = String(currency || "USD").toUpperCase();
  for (const mic of US_MICS) {
    const leaf = spreads[id]?.[mic]?.[ccy];
    if (leaf && (leaf.bp != null || leaf.perShare != null)) return { leaf, mic };
  }
  return { leaf: null, mic: null };
}

function remarkOf({ market } = {}) {
  if (market === "sa") return "Tadawul: commission not printed on the card.";
  if (market === "us") return "min fees 8 €.";
  if (market === "hk") return "min fees 40 $.";
  return "";
}


function namedRow(row, asked) {
  return (
    loose(row.isin) === asked ||
    loose(row.ticker) === asked ||
    loose(row.query) === asked ||
    houseName(row) === asked
  );
}

function placeOk(market, wantVenue, wantPlace) {
  if (!wantPlace) return true;
  if (wantVenue && market === "us" && US_MICS.includes(wantVenue.mic)) return true;
  return (PLACE_OF[market] || []).some((alias) => loose(alias) === wantPlace);
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => namedRow(r, asked));
  const matches = named
    .map((r) => ({ row: r, ...listingKey(venueRow(r)) }))
    .filter((m) => placeOk(feeMarketOf(m.row), wantVenue, wantPlace))
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${MARKET_NAME[feeMarketOf(r)] || "place non dite"}`)
    .slice(0, 12);

function bookOf(row, venue) {
  const market = feeMarketOf(row);
  if (market === "us") return usBook(row.isin, row.currency);
  return spreadLeaf(spreads, {
    isin: row.isin,
    mic: venue?.mic ?? null,
    currency: row.currency,
    unsourced: listingKey(venueRow(row)).unsourced,
  });
}

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const market = feeMarketOf(r) || "?";
    const book = bookOf(r);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function commissionEach({ shares, amount, market, currency }) {
  const rule = RULE[market];
  if (!rule || (rule.rate == null && rule.perShare == null)) return null;
  if (rule.perShare != null) {
    if (shares == null || !Number.isFinite(Number(shares))) return dollars(rule.min, rule.minCcy);
    const raw = dollars(rule.perShare * Number(shares), rule.perShareCcy);
    const floor = dollars(rule.min, rule.minCcy);
    if (raw == null) return floor;
    return Math.max(floor, raw);
  }
  const notion = toUsd(amount, currency);
  if (notion == null || !Number.isFinite(notion)) return dollars(rule.min, rule.minCcy);
  return Math.max(dollars(rule.min, rule.minCcy), notion * rule.rate);
}

export function exactCost({ shares, price, market, currency }) {
  const rule = RULE[market];
  if (!rule || (rule.rate == null && rule.perShare == null)) return { commission: null, currency: QUOTE };
  const amount = shares != null && price != null ? Number(shares) * Number(price) : null;
  const each = commissionEach({ shares, amount, market, currency });
  if (each == null) return { commission: null, currency: QUOTE, rule };
  return {
    commission: Number((each * 2).toPrecision(6)),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: QUOTE },
    rule,
  };
}

export function roundTripCost({ etf, place, currency, bp = null, perShare = null }) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    b: 0,
    c: 0,
    ccy: QUOTE,
    floor: null,
    cap: null,
    threshold: null,
    etf,
    place,
    currency,
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Century n'existe pas encore : lancer `node century/century.mjs` avec liveapp.century.ae ouvert",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Century` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Century`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const market = feeMarketOf(m.row);
  const rule = RULE[market];
  const book = bookOf(m.row, m.venue);
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: MARKET_NAME[market] ?? m.venue?.name ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.query || null,
  };

  if (!market || !rule || (rule.rate == null && rule.perShare == null)) {
    return {
      ...answer,
      listing,
      feeMarket: market,
      remark: remarkOf({ market }),
      why: "Tadawul : la fiche Century imprime « - » pour la commission, pas un chiffre",
      tax: taxesOf(listing.isin),
      fx: fxNote(listing.currency),
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us";
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const commissionPct = rule.rate != null ? rule.rate * 2 : 0;
  const knownPct = taxTotal + commissionPct;
  const a = marketBp != null ? marketBp / 1e4 + knownPct : knownPct;
  const bookUsd = american ? (marketPerShare ?? 0) : dollars(marketPerShare ?? 0, listing.currency) ?? 0;
  const floorUsd = rule.min != null ? dollars(rule.min * 2, rule.minCcy) : null;

  return {
    ...answer,
    a: Number(Number(a).toPrecision(4)),
    b: Number(bookUsd.toPrecision(6)),
    c: 0,
    floor: floorUsd,
    listing,
    feeMarket: market,
    remark: remarkOf({ market }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(rates).length ? rates : null,
      commission: commissionPct || null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème Century Trader ${market}, lu le ${SCHEDULE.readOn} (fiche produit)`,
    tax,
    commission: {
      rate: rule.rate ?? null,
      perShare: rule.perShare ?? null,
      perShareCurrency: rule.perShareCcy ?? null,
      min: rule.min,
      currency: rule.minCcy,
      eachWay: true,
    },
    ccy: QUOTE,
    cap: null,
    threshold: null,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    check: american ? CHECK : null,
    confidence:
      `commission ${market} selon la fiche Century Trader du ${SCHEDULE.readOn} ` +
      `(GETPRODUCTDETAILS, liveapp.century.ae). ` +
      (rule.rate != null
        ? `${(rule.rate * 100).toFixed(2)} % par jambe, plancher ${rule.min} ${rule.minCcy}. `
        : `0,01 ${rule.perShareCcy} par part, plancher ${rule.min} ${rule.minCcy}. `) +
      `a = carnet` +
      (taxTotal ? ` + taxes` : "") +
      (commissionPct ? ` + ${(commissionPct * 100).toFixed(2)} % de courtage` : "") +
      `. Ticket dans le plancher, b = ` +
      (american ? `605` : `0`) +
      `, c = 0. Spread dealer imprimé 0, holding 0 %, marge 100 %. ` +
      (american
        ? `Un aller-retour réel le ${CHECK.on} sur ${CHECK.ticker} : achat 1 à ${CHECK.buy.price} ` +
          `puis vente 1 à ${CHECK.sell.price}, courtage ${CHECK.buy.commission} € par exécution ` +
          `(caisse ${CHECK.cash.start} → ${CHECK.cash.end} €), pas de SEC ni TAF. `
        : "") +
      (leaf ? "" : `Pas de feuille de carnet pour cet ISIN / cette place. `),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, rules: RULE, coverage: coverage() }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node century_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node century_cost.mjs --schedule\n" +
        "  ex.   node century_cost.mjs AAPL\n" +
        "        node century_cost.mjs AAPL NASDAQ USD --shares=1 --price=230\n" +
        "        node century_cost.mjs 1772 HKEX HKD\n" +
        "        node century_cost.mjs 1120 TADAWUL SAR"
    );
    process.exit(2);
  }

  const out = roundTripCost({
    etf,
    place,
    currency,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (out.a == null && !out.listing) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce que Century propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.commission) detail.push(`courtage ${out.parts.commission}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : spread 605" : " : rien"})`);
  console.log(`c = ${out.c} $   (par ordre : ticket dans la remark, pas dans c)`);
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
  if (out.why) console.log(out.why);
  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(
    `\ncoût = ${out.a} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ${out.b} × n + ${out.c}   ($ ; p en ${l.currency})`
  );
  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency);
    const affine = amountUsd != null && out.a != null ? out.a * amountUsd + out.b * n + out.c : null;
    const billed = exactCost({ shares: n, price: p, market: out.feeMarket, currency: l.currency });
    console.log(
      `\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` +
        (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : "")
    );
    if (affine != null) console.log(`  a, b, c        : ${affine.toFixed(4)} $`);
    if (billed.commission != null) {
      console.log(
        `  commission     : ${Number(billed.commission).toFixed(4)} $` +
          (billed.native?.each != null ? ` (${Number(billed.native.each).toPrecision(4)} $ × 2)` : "")
      );
    }
  }
  if (out.url) console.log(`\n${out.url}`);
}
