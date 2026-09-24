// What one round trip costs at tastytrade: buy n shares at price p, sell them
// back at once (online), in dollars.
//
// The affine triple hid the TAF cap, the SEC ceil-to-cent and the $1 crypto
// floor. Thirteen real equity trips on 2026-08-25/27 and a $45 BTC trip on
// 2026-09-08 already pinned the rounding. `roundTrip` is given the size and
// charges what the ledger charged.
//
// tastytrade, Inc. (US, Apex). Commissions & Fees re-read 2026-09-17.
// Stocks and ETFs share one line: $0 commission, $0.0008 / share clearing
// each way (Apex), FINRA TAF $0.000195 / share on the sell (cap $9.79),
// SEC $20.60 / $1,000,000 on the sell (their 4 April 2026 print). Fractional
// shares clear at $0.10 a ticket instead. No CAT on the page. Stamp / FTT
// from taxMap by ISIN. Cash is USD and every listing is USD, so FX stays out.
// The catalogue has no OTC tape. The US book is Rule 605, the same leaf
// every other American file reads. Crypto still has no book.
//
// Crypto is Zero Hash. The card now prints a commission, not a silent
// markup: 0.75 % BTC / ETH, 1 % anything else, each way, $1 minimum, 3 %
// cap under ~$33.33. A $45 BTC trip on 2026-09-08 paid that $1 floor both
// ways, fills at the displayed touch. No SEC / TAF / clearing. The 1 % is
// the cost; there is no book.
//
// Clearing is tastytrade's own line, so it is `brokerFees`. SEC and TAF
// are not. Tickets already in the number stay out of the remark. ADR
// pass-through is named without a rate, so it stays in the remark when
// the name says so.
//
//   https://tastytrade.com/commissions-and-fees/
//   https://tastytrade.com/pricing/
//   https://tastytrade.com/crypto/
//
//   node tastytrade/tastytrade_cost.mjs ACWI NASDAQ USD --shares=10 --price=160
//   node tastytrade/tastytrade_cost.mjs AAPL NASDAQ USD --shares=1 --price=230
//   node tastytrade/tastytrade_cost.mjs BTC/USD --amount=1000
//   node tastytrade/tastytrade_cost.mjs --verify
//   node tastytrade/tastytrade_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("tastytrade-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://tastytrade.com/commissions-and-fees/",
  pricing: "https://tastytrade.com/pricing/",
  crypto: "https://tastytrade.com/crypto/",
  readOn: "2026-09-17",
  secAsOf: "2026-04-04",
  entity: "tastytrade, Inc. (US)",
};

const CLEARING_PER_SHARE = 0.0008;
const FRACTIONAL_CLEARING = 0.1;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const SEC_RATE = 0.0000206;
const CRYPTO_BTC_ETH = 0.0075;
const CRYPTO_OTHER = 0.01;
const CRYPTO_MIN = 1;
const CRYPTO_SMALL_CAP = 0.03;
const CRYPTO_SMALL_UNTIL = CRYPTO_MIN / CRYPTO_SMALL_CAP;
const ADR_NAMED = /\b(ADR|GDR|ADS)\b/i;
const WIRE = { domestic: 25, foreign: 45, ccy: "USD" };
const ACAT = { out: 75, ccy: "USD" };

const CRYPTO_CHECK = {
  pair: "BTC/USD",
  amount: 45,
  paid: 2,
  measured: 2 / 45,
  commissionEach: CRYPTO_MIN,
  on: "2026-09-08",
};

const LEDGER_SELLS = [
  ["AQLT", 2, 63.96, 0.01, 0.002],
  ["AQLT", 10, 313.6, 0.012, 0.008],
  ["AQLT", 20, 627.218, 0.024, 0.016],
  ["AQLT", 10, 313.5, 0.012, 0.008],
  ["AQLT", 1, 31.225, 0.01, 0.001],
  ["AQLT", 35, 1085.7, 0.037, 0.028],
  ["AQLT", 9, 279.585, 0.012, 0.008],
  ["AQLT", 8, 249.44, 0.012, 0.007],
  ["AQLT", 2, 62.06, 0.01, 0.002],
  ["AQLT", 47, 1458.41, 0.049, 0.038],
  ["CLOI", 2, 105.89, 0.01, 0.002],
  ["CLOI", 10, 529.433, 0.022, 0.008],
  ["IAU", 10, 873.2, 0.022, 0.008],
  ["IAU", 100, 8726.5, 0.2, 0.08],
  ["IAU", 100, 8725.01, 0.2, 0.08],
  ["IAUM", 100, 4626.5, 0.12, 0.08],
  ["IAUM", 100, 4630.5, 0.12, 0.08],
  ["ACWI", 50, 8042.755, 0.18, 0.04],
  ["ACWI", 50, 8043.505, 0.18, 0.04],
  ["ACWI", 50, 8044.25, 0.18, 0.04],
  ["ACWI", 50, 8044.25, 0.18, 0.04],
  ["ACWI", 5, 804.35, 0.021, 0.004],
  ["ACWI", 45, 7239.15, 0.159, 0.036],
];

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const up = (value, step) => Math.ceil(value / step - 1e-9) * step;
const near = (value, step) => Math.round(value / step) * step;

const cryptoBase = (symbol) => {
  const text = code(symbol);
  const cut = text.indexOf("/");
  return cut >= 0 ? text.slice(0, cut) : text.replace(/USD$/, "");
};

const isCrypto = (row) => code(row?.type) === "CRYPTO";
const isAdr = (row) => ADR_NAMED.test(String(row?.name || ""));
const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });

export function cryptoCommission(notional, symbol) {
  const amt = Number(notional);
  if (!(amt > 0)) return null;
  if (amt < CRYPTO_SMALL_UNTIL) return amt * CRYPTO_SMALL_CAP;
  const base = cryptoBase(symbol);
  const rate = base === "BTC" || base === "ETH" ? CRYPTO_BTC_ETH : CRYPTO_OTHER;
  return Math.max(CRYPTO_MIN, amt * rate);
}

export function clearingEach(shares) {
  const n = Number(shares);
  if (!(n > 0)) return null;
  if (!Number.isInteger(n)) return FRACTIONAL_CLEARING;
  return up(n * CLEARING_PER_SHARE, 0.001);
}

export function verify() {
  const wrong = [];
  for (const [symbol, shares, proceeds, regulatory, clearing] of LEDGER_SELLS) {
    const model = {
      regulatory: near(shares * TAF_PER_SHARE, 0.001) + up(proceeds * SEC_RATE, 0.01),
      clearing: up(shares * CLEARING_PER_SHARE, 0.001),
    };
    if (Math.abs(model.regulatory - regulatory) > 5e-4 || Math.abs(model.clearing - clearing) > 5e-4) {
      wrong.push({ symbol, shares, proceeds, charged: { regulatory, clearing }, model });
    }
  }
  return { ok: LEDGER_SELLS.length - wrong.length, of: LEDGER_SELLS.length, wrong };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rowsNamed(rows, asked, (r) => {
    if (isCrypto(r) && (loose(cryptoBase(r.ticker)) === asked || loose(r.ticker) === asked)) return true;
    return loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked;
  });

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(String(place)))) {
    return { named, matches: crypto.map((r) => ({ row: r, venue: null, unsourced: { match: "crypto" } })) };
  }

  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named.filter((r) => !isCrypto(r));
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "USD"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function remarkOf({ adr }) {
  return adr ? "ADR fees passed through." : "";
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight
 * back. `usd` is the number the page prints; `brokerFees` is only
 * tastytrade's own line (clearing, or the Zero Hash commission).
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  amount = null,
  bp = null,
  perShare = null,
}) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "USD",
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue tastytrade n'existe pas encore : lancer `node tastytrade/tastytrade_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue tastytrade` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez tastytrade`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const crypto = isCrypto(m.row);
  const book = crypto
    ? { leaf: null, mic: null }
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: m.row.currency,
        unsourced: m.unsourced,
        broker: "tastytrade",
        ticker: m.row.ticker,
      });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: crypto
      ? "tastytrade (Zero Hash)"
      : m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || "USD",
    brokerExchange: m.row.exchange || null,
    adr: isAdr(m.row),
  };

  const leaf = book.leaf;
  const n = Number(shares);
  const p = Number(price);
  const cash = Number(amount);
  const notional = crypto && cash > 0 ? cash : n > 0 && p > 0 ? n * p : null;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = crypto ? { rates: {} } : taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);

  const shared = {
    ...answer,
    listing,
    feeMarket: crypto ? "crypto" : "listed",
    cashCurrency: "USD",
    remark: remarkOf({ crypto, adr: listing.adr }),
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? (crypto ? SCHEDULE.crypto : SCHEDULE.source),
    basis: crypto
      ? `barème tastytrade Zero Hash, relu le ${SCHEDULE.readOn}`
      : `barème tastytrade actions/ETF, relu le ${SCHEDULE.readOn} (SEC au ${SCHEDULE.secAsOf})`,
    tax,
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    validation: crypto ? { check: CRYPTO_CHECK } : { sells: LEDGER_SELLS.length, reproduced: verify().ok, on: "2026-08-27" },
  };

  if (notional == null) {
    return {
      ...shared,
      why: crypto
        ? "aucun montant pour cette ligne crypto"
        : !(n > 0)
          ? "aucun nombre de parts"
          : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        crypto,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        taxPct,
      }),
    };
  }

  const notionalUsd = toUsd(notional, listing.currency);

  if (crypto) {
    const each = cryptoCommission(notional, listing.ticker);
    const brokerFees = each == null ? null : each * 2;
    return {
      ...shared,
      usd: finite(brokerFees, 6),
      brokerFees: finite(brokerFees, 6),
      trade: {
        shares: null,
        price: null,
        amount: notional,
        notional,
        notionalUsd: finite(notionalUsd, 6),
        currency: listing.currency,
      },
      commission: {
        each,
        currency: "USD",
        eachWay: true,
        rate: cryptoBase(listing.ticker) === "BTC" || cryptoBase(listing.ticker) === "ETH" ? CRYPTO_BTC_ETH : CRYPTO_OTHER,
        min: CRYPTO_MIN,
      },
      parts: { marché: 0, courtage: finite(brokerFees, 6), réglementaire: 0, taxes: 0 },
      check: CRYPTO_CHECK,
      confidence: confidenceOf({
        crypto,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        taxPct,
        each,
        notional,
      }),
    };
  }

  const clearing = clearingEach(n);
  const tafRaw = Math.min(near(n * TAF_PER_SHARE, 0.001), TAF_CAP);
  const secUsd = up(notionalUsd * SEC_RATE, 0.01);
  const bookUsd =
    marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const taxUsd = notionalUsd == null ? 0 : notionalUsd * taxPct;
  const brokerFees = plus(clearing, clearing);
  const usd = plus(bookUsd, brokerFees, secUsd, tafRaw, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${
            m.unsourced?.why || "pas de feuille de carnet"
          }`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      amount: null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    commission: { each: 0, currency: "USD", eachWay: true, clearingEach: clearing },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(plus(secUsd, tafRaw), 6),
      taxes: finite(taxUsd, 6),
    },
    sell: { sec: finite(secUsd, 6), taf: finite(tafRaw, 6), tafCapped: n * TAF_PER_SHARE >= TAF_CAP },
    confidence: confidenceOf({
      crypto,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      n,
      notional,
      clearing,
    }),
  };
}

function confidenceOf({
  crypto,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  taxPct,
  each,
  n,
  notional,
  clearing,
}) {
  const said = [];
  if (crypto) {
    const base = cryptoBase(listing.ticker);
    const rate = base === "BTC" || base === "ETH" ? CRYPTO_BTC_ETH : CRYPTO_OTHER;
    said.push(
      `commission Zero Hash ${100 * rate} % par sens (BTC/ETH 0,75 %, sinon 1 %), ` +
        `plancher ${CRYPTO_MIN} $, plafond ${100 * CRYPTO_SMALL_CAP} % sous ~${CRYPTO_SMALL_UNTIL.toFixed(2)} $, ` +
        `lue le ${SCHEDULE.readOn}`
    );
    if (each != null) said.push(`ticket ${Number(each.toPrecision(4))} $ par sens`);
    said.push(
      `mesuré le ${CRYPTO_CHECK.on} : ${CRYPTO_CHECK.amount} $ sur ${CRYPTO_CHECK.pair} → ${CRYPTO_CHECK.paid} $ (plancher)`
    );
    said.push(`pas de carnet : le % est le coût, pas N/A`);
  } else {
    said.push(
      `compensation ${CLEARING_PER_SHARE} $/part chaque sens, TAF ${TAF_PER_SHARE} $/part à la vente ` +
        `plafonnée à ${TAF_CAP} $, SEC ${SEC_RATE} du montant à la vente (taux du ${SCHEDULE.secAsOf}), ` +
        `lus le ${SCHEDULE.readOn}`
    );
    said.push(`23 ventes du grand livre reproduites (${verify().ok}/${LEDGER_SELLS.length})`);
    if (clearing != null) said.push(`compensation ${clearing} $ par sens`);
    if (taxPct) said.push(`taxe de transfert ${(100 * taxPct).toFixed(2)} % prise dans taxMap.mjs`);
    if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part`);
    else if (marketBp != null) said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
    else {
      said.push(
        `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${
          unsourced?.why || "pas de source"
        }`
      );
    }
    if (!leaf) said.push(`carnet absent pour cette ligne`);
  }
  said.push(
    `hors trajet : virement ${WIRE.domestic} $ / ${WIRE.foreign} $, ACAT sortant ${ACAT.out} $. ` +
      `Compte en dollars, pas de change. CAT non nommé`
  );
  if (n && notional) said.push(`${n} parts, ${Number(notional).toFixed(2)} ${listing.currency}`);
  return said.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--verify")) {
    const v = verify();
    console.log(`modèle de frais contre le grand livre : ${v.ok} ventes sur ${v.of}`);
    for (const w of v.wrong) {
      console.log(
        `  ✗ ${w.symbol} ×${w.shares} : facturé ${w.charged.regulatory}/${w.charged.clearing}, ` +
          `modèle ${w.model.regulatory.toFixed(3)}/${w.model.clearing.toFixed(3)}`
      );
    }
    process.exit(v.wrong.length ? 1 : 0);
  }

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          equity: {
            commission: 0,
            clearing: CLEARING_PER_SHARE,
            fractional: FRACTIONAL_CLEARING,
            taf: { perShare: TAF_PER_SHARE, cap: TAF_CAP },
            sec: SEC_RATE,
          },
          crypto: {
            btcEth: CRYPTO_BTC_ETH,
            other: CRYPTO_OTHER,
            min: CRYPTO_MIN,
            smallCap: CRYPTO_SMALL_CAP,
            smallUntil: CRYPTO_SMALL_UNTIL,
            check: CRYPTO_CHECK,
          },
          withdraw: WIRE,
          acat: ACAT,
          verify: verify(),
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
    console.error(
      "usage : node tastytrade/tastytrade_cost.mjs <ticker|ISIN|paire> [place] [devise] [--shares=n] [--price=p]\n" +
        "        node tastytrade/tastytrade_cost.mjs --verify\n" +
        "        node tastytrade/tastytrade_cost.mjs --schedule\n" +
        "  ex.   node tastytrade/tastytrade_cost.mjs ACWI NASDAQ USD --shares=10 --price=160\n" +
        "        node tastytrade/tastytrade_cost.mjs BTC/USD --amount=1000"
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
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que tastytrade propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  if (out.trade) {
    const t = out.trade;
    console.log(
      (t.shares
        ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}`
        : `${t.notional.toFixed(2)} ${t.currency}`) +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
        "\n"
    );
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.réglementaire) console.log(`  réglementaire  : ${parts.réglementaire} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
