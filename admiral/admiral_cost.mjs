// What one round trip costs at Admirals (Invest.MT5): buy n shares at price p,
// sell them back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in. The published ticket is in the commission
// currency of the venue; it is converted at the ECB mid and folded into `c`.
//
// Invest.MT5, card of admiralmarkets.com (entity CY in broker-list.txt), stocks
// and ETFs the same schedule. The US line is per share; Europe is a percentage
// of the notional, each with a minimum per side:
//
//   United States                    0.02 $ / part, min 1 $
//   Germany (Xetra), France          0.10 %, min 1 €
//   United Kingdom                   0.10 %, min 1 £
//   other Europe                     0.15 %, min 1 €
//     Sweden 10 SEK, Norway 10 NOK, Denmark 30 DKK, Switzerland 1 CHF
//
// Europe's % × 2 sits in `a`. The US 0.02 $/share stays out of `b` (the $1 min
// is the whole bill under 50 shares). The ticket is a floor (`min fees`, `c` = 0).
// `exactCost` answers the real step.
//
// Conversion is 0.30 % on amounts settled in another currency (P&L, charges).
// Left out of `a`, the same way Trading212 leaves its 0.15 %: it is not the
// ticket. Inactivity (10 € / month after 24 months) is a holding cost.
//
// Crypto in this catalogue is Trade.MT5 CFDs, not Invest.MT5. The card prices
// them by the spread, not a single published `a`. They answer `a = null`.
//
// No US ETF is in the catalogue (2 391 US lines, all STOCK). The 605 table
// is still keyed by symbol for those shares.
//
// One live trip on 2026-09-08, Invest.MT5 USD. Three market buys of 0.01 BA
// (Boeing, NYSE) then one close of 0.03. Each execution paid the 1 $ minimum
// (commission −1, fee 0). Cash 500 → 495.99: four tickets plus 0.23 ¢ of book.
// `c` stays 2 — that is one buy and one sell of a single lot. The three
// tickets were three executions, not the published affine. The 7.7 ¢/share
// of book is not folded into `a`: Rule 605 for BA is 4.02 ¢ (100–499).
// SEC and TAF were 0 at this notional (~6 $); they stay in a/b as published.
//
//   node admiral/admiral_cost.mjs AAPL NASDAQ USD
//   node admiral/admiral_cost.mjs AAPL NASDAQ USD --shares=1 --price=230
//   node admiral/admiral_cost.mjs EUNL XETR EUR
//   node admiral/admiral_cost.mjs BTC/USD
//   node admiral/admiral_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("admiral-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://admiralmarkets.com/start-trading/admiral-invest-stocks-and-etfs",
  commissions: "https://admiralmarkets.com/start-trading/commissions-calculations",
  fees: "https://admiralmarkets.com/products/fees-and-charges",
  readOn: "2026-09-08",
  entity: "Admirals (CY), Invest.MT5",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const PTM = { each: 1.5, currency: "GBP", above: 10000 };
const FX_ON_SETTLEMENT = 0.003;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);

const CHECK = {
  isin: "US0970231058",
  ticker: "BA",
  venue: "NYSE",
  n: 0.03,
  buys: [
    { n: 0.01, price: 211.68, commission: 1, fee: 0 },
    { n: 0.01, price: 211.66, commission: 1, fee: 0 },
    { n: 0.01, price: 211.66, commission: 1, fee: 0 },
  ],
  sell: { n: 0.03, price: 211.59, commission: 1, fee: 0 },
  book: 0.0023,
  bookPerShare: 0.0767,
  cash: { start: 500, end: 495.99 },
  commissionPaid: 4,
  fee: 0,
  on: "2026-09-08",
};

const US = { perShare: 0.02, min: 1, ccy: "USD" };

// rate of notional per side, min in `ccy`. de_fr is Germany and France.
const RULE = {
  us: US,
  de_fr: { rate: 0.001, min: 1, ccy: "EUR" },
  uk: { rate: 0.001, min: 1, ccy: "GBP" },
  ch: { rate: 0.0015, min: 1, ccy: "CHF" },
  se: { rate: 0.0015, min: 10, ccy: "SEK" },
  no: { rate: 0.0015, min: 10, ccy: "NOK" },
  dk: { rate: 0.0015, min: 30, ccy: "DKK" },
  fi: { rate: 0.0015, min: 1, ccy: "EUR" },
  other_eu: { rate: 0.0015, min: 1, ccy: "EUR" },
};

function remarkOf({ market, type } = {}) {
  if (type === "CRYPTO") return "";
  const r = RULE[market] || RULE.other_eu;
  const ccy = r.ccy === "EUR" ? "€" : r.ccy;
  const ticket = market === "us" ? "min fees 2 $." : `min fees ${r.min * 2} ${ccy}.`;
  return `${ticket}\nFX 0.30% on converted P&L.`;
}

// Admirals writes "US (NASDAQ)". `venues.mjs` must not see "Sweden (NASDAQ)"
// or that line becomes XNAS.
const TO_VENUES = {
  "US (NASDAQ)": "NASDAQ",
  "US (NYSE)": "NYSE",
  "US (AMEX)": "AMEX",
  "UK (LSE)": "LSE",
  "Germany (Xetra)": "XETR",
  "France (Euronext)": "EURONEXT",
  "Netherlands (Euronext)": "XAMS",
  "Belgium (Euronext)": "XBRU",
  "Portugal (Euronext)": "XLIS",
  "Switzerland (SWX)": "SIX",
  "Spain (BME)": "BME",
  "Sweden (NASDAQ)": "XSTO",
  "Norway (NASDAQ)": "OSL",
  "Finland (NASDAQ)": "OMXHEX",
  "Austria (VIE)": "VIE",
  "Denmark (CSE)": "CSE",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {};

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
  exchange: TO_VENUES[row.exchange] || row.exchange,
});

export function feeMarketOf(exchange, mic) {
  const raw = String(exchange || "");
  const m = String(mic || "").toUpperCase();
  if (/^US \(/i.test(raw) || US_MICS.has(m) || /^(NASDAQ|NYSE|AMEX|ARCA|CBOE|BATS)$/i.test(raw)) {
    return "us";
  }
  if (/Germany \(Xetra\)/i.test(raw) || /France \(Euronext\)/i.test(raw) || m === "XETR") return "de_fr";
  if (/UK \(LSE\)/i.test(raw) || m === "XLON" || /^LSE$/i.test(raw)) return "uk";
  if (/Switzerland/i.test(raw) || m === "XSWX") return "ch";
  if (/Sweden/i.test(raw)) return "se";
  if (/Norway/i.test(raw)) return "no";
  if (/Denmark/i.test(raw)) return "dk";
  if (/Finland/i.test(raw)) return "fi";
  return "other_eu";
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
      crypto.find((r) => String(r.currency).toUpperCase() === "USD") ||
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
    const market = feeMarketOf(r.exchange, book.mic ?? venue?.mic);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function commissionEach({ shares, amount, market }) {
  const rule = RULE[market];
  if (!rule) return null;
  if (market === "us") {
    if (shares == null || !Number.isFinite(Number(shares))) return rule.min;
    return Math.max(rule.min, rule.perShare * Number(shares));
  }
  if (amount == null || !Number.isFinite(Number(amount))) return rule.min;
  return Math.max(rule.min, Number(amount) * rule.rate);
}

export function exactCost({ shares, price, market, currency }) {
  const rule = RULE[market];
  if (!rule) return { commission: null, currency: QUOTE };
  const amount = shares != null && price != null ? Number(shares) * Number(price) : null;
  const each = commissionEach({ shares, amount, market });
  return {
    commission: dollars(each * 2, rule.ccy),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: rule.ccy },
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
      why: "le catalogue Admirals n'existe pas encore : lancer `node admiral/admiral_scraping.mjs` avec admiralmarkets.com ouvert",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Admirals` };

  const cryptoRow = named.find(isCrypto);
  if (cryptoRow && (!place || /crypto/i.test(place))) {
    const picked = matches[0]?.row || cryptoRow;
    return {
      ...answer,
      listing: {
        isin: null,
        ticker: picked.ticker,
        name: picked.name,
        type: "CRYPTO",
        mic: null,
        exchange: "Admirals (Trade.MT5)",
        currency: String(picked.currency || "USD").toUpperCase(),
      },
      feeMarket: "crypto",
      remark: remarkOf({ type: "CRYPTO" }),
      why:
        "crypto Trade.MT5 : CFD, écart du teneur, pas de taux unique publié — a reste null. " +
        "Ce n'est pas Invest.MT5",
    };
  }

  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Admirals`,
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
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row.exchange, listing.mic);
  const rule = RULE[market];
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us";
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);

  const knownPct = taxTotal + (american ? SEC_RATE : 0) + (american ? 0 : (rule.rate ?? 0) * 2);
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => (american ? x : dollars(x, listing.currency)),
  });
  const a = plus(mkt.a, knownPct);
  const bookUsd = mkt.b;
  const commUsd = dollars(rule.min * 2, rule.ccy) ?? 0;

  return {
    ...answer,
    a: finite(a, 4),
    b: finite(plus(bookUsd, american ? TAF_PER_SHARE : 0), 6),
    c: 0,
    floor: commUsd,
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
      réglementaire: american ? { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part` } : null,
      commissionUsd: commUsd,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème Invest.MT5, palier ${market}, ticket ${rule.min} ${rule.ccy} × 2 converti en dollars au mid BCE`,
    tax,
    commission: {
      each: dollars(rule.min, rule.ccy),
      roundTrip: commUsd,
      currency: QUOTE,
      native: { each: rule.min, roundTrip: rule.min * 2, currency: rule.ccy },
      market,
      rule,
      perShare: american ? US.perShare : null,
    },
    cNative: rule.min * 2,
    cNativeCcy: rule.ccy,
    ccy: QUOTE,
    cap: american ? { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" } : null,
    threshold:
      listing.mic === "XLON"
        ? {
            c: dollars(2 * PTM.each, "GBP"),
            currency: QUOTE,
            above: PTM.above,
            aboveCurrency: "GBP",
            why: `prélèvement PTM de ${PTM.each} £ par ordre et par sens, au-delà de ${PTM.above} £`,
          }
        : null,
    fx: fxNote(listing.currency),
    fxIfConverted: listing.currency === "USD" ? 0 : null,
    fxNote:
      listing.currency === "USD"
        ? null
        : `${(100 * FX_ON_SETTLEMENT).toFixed(2)} % sur les montants convertis (P&L, frais), hors de a`,
    check: american ? CHECK : null,
    confidence: confidenceOf({
      market,
      marketBp,
      marketPerShare,
      taxTotal,
      american,
      type: listing.type,
      unsourced: m.unsourced,
    }),
  };
}

function confidenceOf({ market, marketBp, marketPerShare, taxTotal, american, type, unsourced }) {
  const said = [];
  said.push(
    `commission Invest.MT5, palier ${market}, lue le ${SCHEDULE.readOn} (${SCHEDULE.source}), ` +
      `convertie en dollars au mid BCE du ${FX_AS_OF} et pliée dans c au ticket le plus bas`
  );
  if (american) {
    said.push(
      `0,02 $ par part au-delà de 50 parts (exactCost) ; SEC et FINRA à la vente comme chez tout courtier américain`
    );
  }
  if (taxTotal) said.push(`taxes ${(100 * taxTotal).toFixed(2)} % du montant`);
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp`);
  else if (marketPerShare != null) {
    said.push(`carnet Rule 605, ${marketPerShare} $ la part, moyenne 100–499 parts`);
    if (marketPerShare > 0.01) {
      said.push(
        `ATTENTION carnet large : sous 100 parts l'amélioration de ce chiffre n'a souvent pas lieu`
      );
    }
  } else {
    said.push(
      `aucun carnet : ${unsourced?.name || "cette place"}, ${unsourced?.why || "pas de source"}. À lire comme un plancher`
    );
  }
  if (american) {
    said.push(
      `un aller-retour réel le ${CHECK.on} sur ${CHECK.ticker} (${CHECK.venue}) : ` +
        `trois achats de 0,01 à ${CHECK.buys.map((d) => d.price).join("/")} puis vente de 0,03 à ${CHECK.sell.price}, ` +
        `courtage ${CHECK.buys[0].commission} $ par exécution (caisse ${CHECK.cash.start} → ${CHECK.cash.end}), ` +
        `c reste 2 $, le carnet ${CHECK.bookPerShare} $/part n'est pas plié dans a ; ` +
        `SEC et TAF à 0 sur ~6 $ de notional, le barème publié reste dans a/b`
    );
  } else {
    said.push(
      `courtage palier ${market} non recoupé sur un relevé ; le seul aller-retour réel est ${CHECK.ticker} NYSE à 1 $ le ticket`
    );
  }
  if (type === "STOCK" && american) {
    said.push(`le catalogue US Admirals n'a pas d'ETF : une action paie les mêmes frais, le carnet est le 605 de son symbole`);
  }
  return said.join(" ; ");
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
      "usage : node admiral_cost.mjs <ticker|ISIN|paire> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node admiral_cost.mjs --schedule\n" +
        "  ex.   node admiral_cost.mjs AAPL NASDAQ USD\n" +
        "        node admiral_cost.mjs AAPL NASDAQ USD --shares=1 --price=230\n" +
        "        node admiral_cost.mjs EUNL XETR EUR\n" +
        "        node admiral_cost.mjs BTC/USD"
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
      console.log(`\nce qu'Admirals propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : FINRA et/ou spread 605" : " : rien"})`);
  console.log(
    `c = ${out.c} $   (par ordre : ${out.cNative} ${out.cNativeCcy} de commission au palier bas, au mid BCE)`
  );
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(
    `\ncoût = ${out.a} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ${out.b} × n + ${out.c}   ($ ; p en ${l.currency})`
  );
  console.log(`  ${out.basis}`);
  for (const line of out.confidence.split(" ; ")) console.log(`  ${line}`);
  if (out.fxNote) console.log(`  ${out.fxNote}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency);
    const extra = out.threshold && amount >= out.threshold.above ? out.threshold.c : 0;
    const affine = amountUsd != null ? out.a * amountUsd + out.b * n + out.c + extra : null;
    const billed = exactCost({ shares: n, price: p, market: out.feeMarket, currency: l.currency });
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
