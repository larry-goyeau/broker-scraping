// What one round trip costs at finanzen.net ZERO: buy n shares at price p,
// sell them back at once, in dollars. A coin is bought by the dollar
// instead, and answers to `amount`.
//
// One schedule, re-read 2026-09-27. Securities are the July 2026 price list
// (V12). Coins are the crypto page, which that list leaves out.
//
//   shares, ETFs and funds, on gettex
//     0 € an order
//     1 € more when the order value is under 500 €
//   certificates (ETC, ETN, ETP), on gettex
//     0 € an order
//     1 € more when the order is under 500 pieces
//   coins, off exchange through Baader Bank
//     1 % an order
//     1 € more when the order value is under 500 €
//     a reduced spread on top, not a published number
//
// The 7.50 € plus 0.25 % mediation fee is credited back down to the prices
// above, so it is not charged again. A savings plan and the daily fractional
// ticket are other orders. Custody and the wallet are 0. Cash is the euro
// and every line is quoted in euro, so there is no FX. Stamp comes from the
// tax map. No US levy is published on gettex.
//
//   https://www.finanzen.net/zero/wp-content/uploads/2026/08/Preis-Leistungsverzeichnis-V12_Wertpapiere.pdf
//   https://www.finanzen.net/zero/krypto/
//
//   node finanzen/finanzen_cost.mjs US0378331005 --shares=10 --price=200
//   node finanzen/finanzen_cost.mjs IE00B4L5Y983 --shares=1 --price=90
//   node finanzen/finanzen_cost.mjs DE000A1E0HR8 --shares=10 --price=30
//   node finanzen/finanzen_cost.mjs BTC --amount=1000
//   node finanzen/finanzen_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../venues.mjs";
import { bookParts, plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("finanzen-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  securities: "https://www.finanzen.net/zero/wp-content/uploads/2026/08/Preis-Leistungsverzeichnis-V12_Wertpapiere.pdf",
  crypto: "https://www.finanzen.net/zero/krypto/",
  readOn: "2026-09-27",
  entity: "finanzen.net zero GmbH, tied agent of DonauCapital Wertpapier GmbH",
};

const CASH = "EUR";
const SMALL = 500;
const SMALL_EUR = 1;
const CRYPTO_RATE = 0.01;
const CERTIFICATE = new Set(["ETC", "ETN", "ETP"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const eurOf = (amount, currency) => {
  if (code(currency) === CASH) return Number(amount);
  const usd = toUsd(amount, currency);
  const per = usdPer(CASH);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
};

export function isCryptoRow(row) {
  return code(row?.type) === "CRYPTO";
}

// What one order costs, in euro. A round trip is this twice: both legs are
// the same size.
export function orderFeeEur({ type, notionalEur, shares }) {
  const kind = code(type);
  if (kind === "CRYPTO") {
    if (notionalEur == null || !Number.isFinite(Number(notionalEur))) return null;
    const small = Number(notionalEur) < SMALL ? SMALL_EUR : 0;
    return Number(notionalEur) * CRYPTO_RATE + small;
  }
  if (CERTIFICATE.has(kind)) {
    if (!(Number(shares) > 0)) return null;
    return Number(shares) < SMALL ? SMALL_EUR : 0;
  }
  if (notionalEur == null || !Number.isFinite(Number(notionalEur))) return null;
  return Number(notionalEur) < SMALL ? SMALL_EUR : 0;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked) return true;
    return isCryptoRow(r) && loose(r.ticker) === asked;
  });
  const coins = named.filter(isCryptoRow);
  if (coins.length && (!wantPlace || wantPlace === "CRYPTO")) {
    const pool = !wantCurrency ? coins : coins.filter((r) => code(r.currency) === wantCurrency);
    const picked = pool.length ? pool : coins;
    return { named, matches: picked.map((r) => ({ row: r, ...listingKey(r) })) };
  }
  const equities = named.filter((r) => !isCryptoRow(r));
  const want = place ? listingKey({ exchange: place, mic: place }) : {};
  const matches = equities
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (want.venue && m.venue) return m.venue.mic === want.venue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function remarkOf(crypto) {
  return crypto ? "Reduced spread, not in this round trip." : "";
}

/**
 * The whole bill for buying `shares` at `price` (or putting `amount` into a
 * coin) and selling straight back. `usd` is the number the page prints.
 * `brokerFees` is the euro ticket, and on a coin the 1 % as well.
 */
export function roundTrip({ etf, place, currency, shares, price, amount, bp = null, perShare = null }) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: CASH,
  };

  if (!catalogue) {
    return { ...answer, why: "le catalogue finanzen.net ZERO n'existe pas encore : lancer `node finanzen/finanzen_scraping.mjs`" };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue finanzen.net ZERO` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez finanzen.net ZERO`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const crypto = isCryptoRow(m.row);
  const book = crypto
    ? { leaf: null, mic: null }
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: m.row.currency,
        unsourced: m.unsourced,
        broker: "finanzen",
        ticker: m.row.ticker,
      });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: crypto ? null : book.mic ?? m.venue?.mic ?? null,
    exchange: crypto ? "Crypto" : m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || CASH,
    brokerExchange: m.row.exchange || null,
  };
  const leaf = book.leaf;
  const marketBp = crypto ? null : bp ?? leaf?.bp ?? null;
  const marketPerShare = crypto ? null : perShare ?? leaf?.perShare ?? null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: crypto ? m.unsourced : null,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const tax = crypto ? { known: true, buy: {}, sell: {} } : taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: CASH,
    remark: remarkOf(crypto),
    bp: crypto ? 0 : marketBp,
    perShare: marketPerShare,
    url: crypto ? SCHEDULE.crypto : SCHEDULE.securities,
    basis: `barème finanzen.net ZERO, relu le ${SCHEDULE.readOn}`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  const a = Number(amount);
  if (crypto ? !(a > 0) : !(n > 0 && p > 0)) {
    return {
      ...shared,
      why: crypto ? "aucun montant pour cette crypto" : !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
    };
  }

  const notional = crypto ? a : n * p;
  const notionalCcy = crypto ? QUOTE : listing.currency;
  const notionalUsd = crypto ? a : dollars(notional, listing.currency);
  const notionalEur = crypto ? eurOf(a, QUOTE) : eurOf(notional, listing.currency);
  const each = orderFeeEur({ type: listing.type, notionalEur, shares: n });
  const commissionUsd = each == null || notionalEur == null ? null : dollars(each * 2, CASH);
  const bookUsd =
    parts.a == null || notionalUsd == null
      ? null
      : parts.b == null
        ? null
        : parts.a * notionalUsd + parts.b * (crypto ? 0 : n);
  const taxUsd = crypto || notionalUsd == null ? 0 : notionalUsd * taxTotal;
  const usd = plus(bookUsd, commissionUsd, taxUsd);

  const small = crypto || !CERTIFICATE.has(code(listing.type))
    ? notionalEur != null && notionalEur < SMALL
    : n < SMALL;
  const confidence = [
    `barème finanzen.net ZERO, relu le ${SCHEDULE.readOn}`,
    crypto
      ? `provision ${(CRYPTO_RATE * 100).toFixed(0)} % par jambe` + (small ? `, plus ${SMALL_EUR} € sous ${SMALL} €` : "")
      : small
        ? `${SMALL_EUR} € par jambe` + (CERTIFICATE.has(code(listing.type)) ? ` sous ${SMALL} pièces` : ` sous ${SMALL} €`)
        : "exécution 0",
    crypto ? "spread réduit non chiffré, hors du total" : "ligne en EUR : pas de change",
    crypto
      ? "pas de carnet : exécution hors plateforme"
      : marketBp != null
        ? `carnet ${Number(marketBp.toPrecision(4))} bp`
        : marketPerShare != null
          ? `carnet ${marketPerShare} $ la part`
          : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    commission: {
      rate: crypto ? CRYPTO_RATE : 0,
      flat: crypto ? 0 : each,
      small: small ? SMALL_EUR : 0,
      currency: CASH,
      eachWay: true,
    },
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`,
        }
      : {}),
    trade: {
      shares: crypto ? null : n,
      price: crypto ? null : p,
      amount: crypto ? a : null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      notionalEur: finite(notionalEur, 6),
      currency: notionalCcy,
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
    console.log(JSON.stringify({ ...SCHEDULE, cash: CASH, small: SMALL, smallEur: SMALL_EUR, cryptoRate: CRYPTO_RATE }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node finanzen/finanzen_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--amount=usd]"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    amount: flag("amount") ? Number(flag("amount")) : null,
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
    if (t.amount != null) console.log(`${t.amount} ${t.currency} aller-retour\n`);
    else console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
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
