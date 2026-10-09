// What one round trip costs at Alior Bank Biuro Maklerskie: buy n shares
// at price p, sell them back at once, in dollars. Internet orders. The
// phone column is another channel and stays out. Prior turnover is unknown,
// so Poland uses the first band.
//
// Re-read 2026-09-27.
//
//   Poland, internet, turnover up to 300 000 zł
//     shares and other cash instruments except bonds
//       0.38 % min 3 zł per order
//     the same session's reverse trade, cash market except bonds
//       charged at the order rate, then the gap down to 0.20 % is refunded
//       on the smaller of the two notionals
//     GPW ETF, ETC and ETN, communiqué of 30 June 2026, both legs
//       0 through 31 December 2026
//     GlobalConnect is that Warsaw market in złoty, so it uses this
//       schedule. The foreign-currency tariff has no złoty line.
//   Abroad, one order, in the order currency
//     0.29 %
//     min 5 EUR, 5 USD, 5 GBP, 60 SEK, 60 NOK or 60 DKK
//     a US exchange also floors the order at 0.02 USD a share
//
// The commission is taken in the currency of the order. A transfer in
// another currency uses the bank's dewizy table of 9 Oct 2026, 09:00
// (the unmarked line, not the card or the kantor). Half that spread is
// the remark, not this ticket.
// Custody above the published threshold is not a ticket. Stamp and FTT come
// from the tax map. The tariff names no PTM levy and no SEC fee.
//
// Foreign orders go to Saxo Bank A/S. The communiqué of 31 December 2025
// names no other broker, and the regulation lets Saxo use another firm
// without naming it. Saxo Bank A/S is not a US broker-dealer in the 606
// file, so no Rule 606 mix is applied. A Nasdaq or NYSE line keeps that
// exchange's quoted NBBO.
//
//   https://www.aliorbank.pl/dam/jcr:ca1b9ef9-7529-4aed-9ac1-3fd5ff8a63ff/Taryfa-oplat-i-prowizji-Biura-Maklerskiego-Alior-Banku-S.A-z-dnia-12.11.2025.pdf
//   https://www.aliorbank.pl/dam/jcr:a58c5245-33e8-43e6-a15c-201255915ae2/RNZ-exante.pdf
//   https://www.aliorbank.pl/dam/jcr:375c7199-4817-452d-994d-1903e8584110/brak-prowizji-od-obrotu-instrumentami-ETFETCETN-notowanymi-na-GPW-032026-1-6-2-1.pdf
//   https://www.aliorbank.pl/dam/jcr:5e3db0b4-dde1-420e-ac21-035bbee91caa/Komunikat-Wykaz-depozytariuszy-zagranicznych-i-brokerow-zagranicznych.pdf
//
//   node brokers/alior/alior_cost.mjs PLPKO0000016 GPW PLN --shares=10 --price=50
//   node brokers/alior/alior_cost.mjs US0378331005 XNAS USD --shares=10 --price=230
//   node brokers/alior/alior_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("alior-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.aliorbank.pl/dam/jcr:ca1b9ef9-7529-4aed-9ac1-3fd5ff8a63ff/Taryfa-oplat-i-prowizji-Biura-Maklerskiego-Alior-Banku-S.A-z-dnia-12.11.2025.pdf",
  foreign: "https://www.aliorbank.pl/dam/jcr:a58c5245-33e8-43e6-a15c-201255915ae2/RNZ-exante.pdf",
  gpwPromo: "https://www.aliorbank.pl/dam/jcr:375c7199-4817-452d-994d-1903e8584110/brak-prowizji-od-obrotu-instrumentami-ETFETCETN-notowanymi-na-GPW-032026-1-6-2-1.pdf",
  brokers: "https://www.aliorbank.pl/dam/jcr:5e3db0b4-dde1-420e-ac21-035bbee91caa/Komunikat-Wykaz-depozytariuszy-zagranicznych-i-brokerow-zagranicznych.pdf",
  readOn: "2026-09-27",
  tariffOn: "2025-11-12",
  foreignOn: "2025-12-18",
  promoFrom: "2026-07-01",
  promoThrough: "2026-12-31",
  entity: "Biuro Maklerskie Alior Banku",
  venue: "Saxo Bank A/S",
};

const POLISH_RATE = 0.0038;
const DAY_RATE = 0.002;
const POLISH_MIN = 3;
const FOREIGN_RATE = 0.0029;
const FOREIGN_MIN = { EUR: 5, USD: 5, GBP: 5, SEK: 60, NOK: 60, DKK: 60 };
const US_SHARE = { perShare: 0.02, mics: new Set(["XNAS", "XNYS"]) };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

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
  return ex === "GPW" || ex === "XWAR" || ex === "NEWCONNECT" || ex === "GLOBALCONNECT";
}

function gpwBoard(exchange) {
  const ex = loose(exchange);
  // The waiver names the Warsaw exchange, which runs GlobalConnect.
  return ex === "GPW" || ex === "XWAR" || ex === "GLOBALCONNECT";
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

// 1 currency = PLN. Skup, then sprzedaż. Dewizy, table 2026100909000.
const FX_BOARD = {
  USD: [3.7224, 4.0753],
  EUR: [4.1791, 4.5745],
  GBP: [4.9264, 5.3945],
  NOK: [0.3889, 0.4261],
  DKK: [0.559, 0.6121],
  SEK: [0.3737, 0.4093],
};

function fxNote(currency) {
  const cash = listingCash(currency) || "listing";
  if (cash === "PLN") return "";
  const pair = FX_BOARD[cash];
  if (!pair) return `FX at the custodian bank's rate when cash ≠ ${cash}.`;
  const [bid, offer] = pair;
  const half = ((offer - bid) / (offer + bid)) * 100;
  return fxRemark(half.toFixed(3), cash);
}

function legsOf(listing, notional, shares) {
  const etp = listing.type === "ETF" || listing.type === "ETC" || listing.type === "ETN";
  if (polishMarket(listing.brokerExchange)) {
    if (etp && gpwBoard(listing.brokerExchange) && promoLive()) {
      return {
        buy: 0,
        sell: 0,
        currency: "PLN",
        label: "0 PLN",
        note: "promotion GPW ETF/ETC/ETN jusqu'au 2026-12-31",
      };
    }
    const gross = Math.max(notional * POLISH_RATE, POLISH_MIN);
    const refund = notional * (POLISH_RATE - DAY_RATE);
    return {
      buy: gross,
      sell: gross - refund,
      currency: "PLN",
      label: `${pct(POLISH_RATE)} min ${POLISH_MIN} PLN à l'achat, ${pct(DAY_RATE)} à la vente`,
      note: "première tranche, sans historique d'ordres ; vente le jour même au day trading",
    };
  }
  const cash = listingCash(listing.currency);
  const floor = FOREIGN_MIN[cash];
  if (floor == null) return null;
  const american = US_SHARE.mics.has(listing.mic) || US_SHARE.mics.has(loose(listing.brokerExchange));
  let one = Math.max(notional * FOREIGN_RATE, floor);
  if (american) one = Math.max(one, US_SHARE.perShare * shares);
  const us = american ? `, et ${money(US_SHARE.perShare)} USD par action` : "";
  return {
    buy: one,
    sell: one,
    currency: cash,
    label: `${pct(FOREIGN_RATE)} min ${floor} ${cash}${us}`,
    note: american ? `exécution ${SCHEDULE.venue}, plancher américain` : `exécution ${SCHEDULE.venue}`,
  };
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
    return { ...answer, why: "le catalogue Alior n'existe pas encore : lancer `node brokers/alior/alior_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Alior` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Alior`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "alior",
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
  const rule = legsOf(listing, priced ? n * p : 0, priced ? n : 0);
  if (!rule) {
    return {
      ...answer,
      listing,
      why: `${listing.currency} n'a pas de ligne dans la taryfa`,
    };
  }
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: rule.currency,
    remark: fxNote(listing.currency),
    url: polishMarket(listing.brokerExchange) ? SCHEDULE.url : SCHEDULE.foreign,
    basis: `taryfa Alior relue le ${SCHEDULE.readOn} : ${rule.label}${rule.buy === rule.sell ? " par ordre" : ""}`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!priced) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null
      ? null
      : parts.b == null
        ? null
        : parts.a * notionalUsd + parts.b * n;
  const buyUsd = dollars(rule.buy, rule.currency);
  const sellUsd = dollars(rule.sell, rule.currency);
  const commissionUsd = plus(buyUsd, sellUsd);
  const brokerFees = commissionUsd;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    rule.note,
    polishMarket(listing.brokerExchange) ? "marché polonais, ordre internet" : `ordre en ${rule.currency}`,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { rate: FOREIGN_RATE, min: FOREIGN_MIN[rule.currency] ?? POLISH_MIN, currency: rule.currency, eachWay: rule.buy === rule.sell },
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
          poland: "0.38 % min 3 PLN, internet, first turnover band",
          dayTrade: "0.20 % on the same-session reverse trade, after the order rate is charged",
          gpwEtp: "0 through 2026-12-31",
          rates: "0.29 % min 5 EUR, 5 USD, 5 GBP, 60 SEK, 60 NOK or 60 DKK; US exchanges also 0.02 USD a share",
          conversion: "custodian bank's rate, in the remark",
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
    console.error("usage : node brokers/alior/alior_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
