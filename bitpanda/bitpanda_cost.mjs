// What one round trip costs at Bitpanda: buy n units at price p, sell them back
// at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in.
//
// Real Stocks / ETFs / ETCs (Bitpanda Financial Services, executed on Quotrix,
// quoted in EUR). `a` is every linear piece: Quotrix book, taxes, and any
// published % × 2. The help page of 2026-09-09 states a fixed 1 € per trade,
// no custody, no overnight, no published % commission — that ticket is a
// floor (`min fees 2 €` the round trip, `c` = 0), not a rate, so it stays
// out of `a`. The bid/ask is "adjusted" with size and the session; until a
// stable extra vs the Quotrix book is measured, the book itself is the
// spread in `a`. SEC / TAF stay out: the line is a euro Quotrix quote, not
// a US execution.
//
//   https://support.bitpanda.com/hc/en-us/articles/24575224671516-Real-Stocks-ETFs-on-Bitpanda
//   https://support.bitpanda.com/hc/en-us/articles/360000902525-What-fees-and-premiums-can-I-expect-to-pay-on-Bitpanda
//
// Crypto on the retail app (what `bitpanda.mjs` catalogues, not Fusion).
// Bitcoin is published at 0.99 % to buy and 0.99 % to sell, already in the
// quoted price. The trade summary prints 0.00 %–2.49 % depending on the
// asset. This file uses the BTC card for every coin: `a` = 1.98 %. Fusion
// (0.25 % down to 0.02 % by 30-day volume) is another product and is not
// this catalogue.
//
// Conversion of a non-EUR deposit is left out of `a`, the same way Trading212
// leaves its 0.15 %. SEPA in and out is free. Custody is 0.
//
// One live trip on 2026-09-09: 25 € of EUNL (IE00B4L5Y983) both ways. The
// offer quoted 1 € each way, taken from the notional (net 24 € of ETF on the
// buy, 23 € cash back on the sell). Offer price 126.18 / 126.185, same as
// priceWithoutFee — no extra % sitting on top of the book. The 0.4 bp gap
// is the market ticking up, not a cost (sold above the buy). The trade
// object's `price` (131.44 / 120.93) is all-in (25/qty, 23/qty). Cash
// 500 → 498. Position back to 0. The ticket stays in `floor`. `a` keeps
// the Quotrix book (8.64 bp on this ISIN) plus taxes.
//
//   node bitpanda/bitpanda_cost.mjs AAPL
//   node bitpanda/bitpanda_cost.mjs IE00B4L5Y983 QUOTRIX EUR
//   node bitpanda/bitpanda_cost.mjs BTC
//   node bitpanda/bitpanda_cost.mjs --schedule
//   node bitpanda/bitpanda-live-experiment.mjs --probe --amount=25
//   node bitpanda/bitpanda-live-experiment.mjs --live --amount=25
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";

const CATALOGUE = new URL("bitpanda-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);
const TAXES = new URL("../parsed_json/taxes.json", import.meta.url);
const T212 = new URL("../trading212/trading212-parsed.json", import.meta.url);

const SCHEDULE = {
  stocks: "https://support.bitpanda.com/hc/en-us/articles/24575224671516-Real-Stocks-ETFs-on-Bitpanda",
  fees: "https://support.bitpanda.com/hc/en-us/articles/360000902525-What-fees-and-premiums-can-I-expect-to-pay-on-Bitpanda",
  fusion: "https://support.bitpanda.com/hc/en-us/articles/16663481714844-Bitpanda-Fusion",
  readOn: "2026-09-09",
  entity: "Bitpanda Financial Services (AT), Real Securities on Quotrix",
};

const FEE_EACH_EUR = 1;
const CRYPTO_PREMIUM_EACH = 0.0099;
const CRYPTO_PREMIUM_MAX = 0.0249;

const CHECK = {
  isin: "IE00B4L5Y983",
  ticker: "EUNL",
  venue: "QUOTRIX",
  amountFiat: 25,
  buyOffer: 126.18,
  sellOffer: 126.185,
  feeEach: 1,
  cash: { start: 500, end: 498 },
  on: "2026-09-09",
};

const TO_VENUES = {
  QUOTRIX: "QUOTRIX",
  "BÖRSE DÜSSELDORF": "QUOTRIX",
  "BOERSE DUSSELDORF": "QUOTRIX",
  DUSSELDORF: "QUOTRIX",
  XQTX: "QUOTRIX",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};
const taxFile = fs.existsSync(TAXES) ? JSON.parse(fs.readFileSync(TAXES, "utf8")) : null;

const taxByIsin = (() => {
  const out = new Map();
  if (!taxFile?.byCode || !fs.existsSync(T212)) return out;
  const t212 = JSON.parse(fs.readFileSync(T212, "utf8"));
  for (const r of Array.isArray(t212) ? t212 : t212.rows || []) {
    const isin = String(r.isin || "").toUpperCase();
    const entry = r.code ? taxFile.byCode[r.code] : null;
    if (isin && entry && (entry.achat || entry.vente)) out.set(isin, entry);
  }
  return out;
})();

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));
const cryptoBase = (ticker) => String(ticker || "").split("/")[0].toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

const venueRow = (row) => ({
  ...row,
  exchange: TO_VENUES[String(row.exchange || "").toUpperCase()] || row.exchange,
});

function taxesOf(isin) {
  if (!taxFile) return { known: false, why: "relevé fiscal absent : lancer node taxes.mjs" };
  const entry = taxByIsin.get(String(isin || "").toUpperCase());
  if (entry) return { known: true, buy: entry.achat ?? {}, sell: entry.vente ?? {} };
  return { known: false, assumedZero: true, why: "pas de ligne fiscale Trading212 pour cet ISIN" };
}

function taxRates(tax) {
  const rates = {};
  for (const [name, line] of Object.entries(tax.buy ?? {})) {
    if (line.ofValue != null) rates[name] = line.ofValue;
  }
  return rates;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked) return true;
    return isCrypto(r) && (loose(cryptoBase(r.ticker)) === asked || loose(r.ticker) === asked);
  });

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(place))) {
    const row =
      (wantCurrency && crypto.find((r) => String(r.currency).toUpperCase() === wantCurrency)) ||
      crypto.find((r) => String(r.currency).toUpperCase() === "EUR") ||
      crypto[0];
    return { named, matches: [{ row, venue: null }] };
  }

  const matches = named
    .filter((r) => !isCrypto(r))
    .map((r) => ({ row: r, ...listingKey(venueRow(r)) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    if (isCrypto(r)) {
      const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
      slot.n += 1;
      const mk = (slot.byMarket.crypto ||= { n: 0, withBook: 0 });
      mk.n += 1;
      continue;
    }
    const { venue, unsourced } = listingKey(venueRow(r));
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[book.mic || venue?.mic || "unsourced"] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function exactCost({ shares, price, crypto = false, currency = "EUR" }) {
  const amount = Number(shares) * Number(price);
  if (crypto) {
    const fee = amount * CRYPTO_PREMIUM_EACH * 2;
    return {
      commission: dollars(fee, currency),
      currency: QUOTE,
      native: { each: amount * CRYPTO_PREMIUM_EACH, roundTrip: fee, currency },
    };
  }
  return {
    commission: dollars(FEE_EACH_EUR * 2, "EUR"),
    currency: QUOTE,
    native: { each: FEE_EACH_EUR, roundTrip: FEE_EACH_EUR * 2, currency: "EUR" },
  };
}

function cryptoCost(row, answer) {
  const listing = {
    isin: null,
    ticker: row.ticker,
    name: row.name,
    type: "CRYPTO",
    mic: null,
    exchange: "Bitpanda (app)",
    currency: String(row.currency || "EUR").toUpperCase(),
  };
  return {
    ...answer,
    a: Number((CRYPTO_PREMIUM_EACH * 2).toPrecision(4)),
    b: 0,
    c: 0,
    floor: null,
    listing,
    feeMarket: "crypto",
    remark: `BTC card 0.99% each way. Ticket prints 0–${(100 * CRYPTO_PREMIUM_MAX).toFixed(2)}%. Fusion (0.25%…) is not this file.`,
    parts: { markupEachWay: CRYPTO_PREMIUM_EACH },
    bp: Number((CRYPTO_PREMIUM_EACH * 2 * 1e4).toFixed(0)),
    perShare: null,
    url: SCHEDULE.fees,
    basis: `barème retail Bitpanda, Bitcoin 0,99 % chaque sens, lu le ${SCHEDULE.readOn}`,
    commission: { rate: CRYPTO_PREMIUM_EACH, eachWay: true, currency: listing.currency },
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `0,99 % à l'achat et à la vente sur Bitcoin, soit 1,98 % l'aller-retour, ` +
      `déjà dans le prix affiché. Les autres coins sortent entre 0 et 2,49 % sur le récap ; ` +
      `ce fichier réutilise la ligne BTC. Fusion n'est pas le catalogue. ` +
      `Aucun aller-retour réel.`,
  };
}

export function roundTripCost({ etf, place, currency, bp = null, perShare = null }) {
  const { named, matches } = findListing({ etf, place, currency });
  const floorUsd = dollars(FEE_EACH_EUR * 2, "EUR");
  const answer = {
    a: null,
    b: 0,
    c: 0,
    ccy: QUOTE,
    floor: floorUsd,
    cap: null,
    threshold: null,
    etf,
    place,
    currency,
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Bitpanda n'existe pas encore : lancer `node bitpanda/bitpanda.mjs` avec app.bitpanda.com ouvert",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Bitpanda` };

  const cryptoRow = named.find(isCrypto);
  if (cryptoRow && (!place || /crypto/i.test(place))) {
    const picked = matches[0]?.row || cryptoRow;
    return cryptoCost(picked, { ...answer, floor: null });
  }

  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Bitpanda`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "EUR").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);

  const a = marketBp != null ? marketBp / 1e4 + taxTotal : taxTotal || null;
  const bookUsd = listing.currency === "USD" ? (marketPerShare ?? 0) : dollars(marketPerShare ?? 0, listing.currency) ?? 0;

  return {
    ...answer,
    a: a == null ? null : Number(a.toPrecision(4)),
    b: Number(bookUsd.toPrecision(6)),
    c: 0,
    floor: floorUsd,
    listing,
    feeMarket: "quotrix",
    remark: "min fees 2 €.",
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(rates).length ? rates : null,
      commissionUsd: floorUsd,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.stocks,
    basis: `Real Securities Bitpanda, ticket 1 € × 2, carnet Quotrix, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      each: dollars(FEE_EACH_EUR, "EUR"),
      roundTrip: floorUsd,
      currency: QUOTE,
      native: { each: FEE_EACH_EUR, roundTrip: FEE_EACH_EUR * 2, currency: "EUR" },
    },
    cEur: FEE_EACH_EUR * 2,
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: listing.currency === "EUR" ? 0 : null,
    confidence:
      `1 € par exécution, soit 2 € l'aller-retour, lu sur l'aide Real Stocks du ${SCHEDULE.readOn} ` +
      `et confirmé le ${CHECK.on} sur ${CHECK.ticker} (${CHECK.amountFiat} €, ` +
      `offre ${CHECK.buyOffer} / ${CHECK.sellOffer}, caisse ${CHECK.cash.start} → ${CHECK.cash.end}). ` +
      `a = carnet Quotrix (le spread) + taxes T212 ; pas de % de courtage publié. ` +
      `Le ticket 1 € n'est pas linéaire, il reste dans le plancher. ` +
      (leaf ? "" : `Pas de feuille Quotrix pour cet ISIN dans spread.json. `),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          feeEachEur: FEE_EACH_EUR,
          cryptoPremiumEach: CRYPTO_PREMIUM_EACH,
          cryptoPremiumMax: CRYPTO_PREMIUM_MAX,
          coverage: coverage(),
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
      "usage : node bitpanda_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node bitpanda_cost.mjs --schedule\n" +
        "  ex.   node bitpanda_cost.mjs AAPL\n" +
        "        node bitpanda_cost.mjs IE00B4L5Y983 QUOTRIX EUR\n" +
        "        node bitpanda_cost.mjs BTC"
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

  if (out.a == null) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce que Bitpanda propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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
  if (out.parts?.markupEachWay != null) detail.push(`premium ${out.parts.markupEachWay} × 2`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part)`);
  console.log(`c = ${out.c} $   (par ordre : ticket dans la remark, pas dans c)`);
  if (out.floor != null) console.log(`plancher ${out.floor} $   (${out.cEur ?? 2} €)`);
  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(
    `\ncoût = ${out.a} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ${out.b} × n + ${out.c}   ($ ; p en ${l.currency})`
  );
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency);
    const affine = amountUsd != null ? out.a * amountUsd + out.b * n + out.c : null;
    const billed = exactCost({ shares: n, price: p, crypto: l.type === "CRYPTO", currency: l.currency });
    console.log(
      `\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` +
        (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : "")
    );
    if (affine != null) console.log(`  a, b, c        : ${affine.toFixed(4)} $`);
    if (billed.commission != null) {
      console.log(
        `  commission     : ${Number(billed.commission).toFixed(4)} $` +
          (billed.native?.each != null ? ` (${billed.native.each} ${billed.native.currency} × 2)` : "")
      );
    }
  }
  if (out.url) console.log(`\n${out.url}`);
}
