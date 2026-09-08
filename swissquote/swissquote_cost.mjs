// What one round trip costs at Swissquote: buy n shares at price p, sell them back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, like the tastytrade and
// Trading212 files, so the front can add a Swissquote order to an American one without
// asking which currency each term is in. The CHF grid and the 0.85 realtime line are
// converted at the ECB mid — the same mid the bank uses, with no markup — and the
// franc amount is folded into `c`. `cChf` stays as the source figure.
//
// The catalogue was scraped on trade.swissquote.ch, which is that Swiss bank, not
// Swissquote Bank Europe. Europe's card is 0.1 % with a 14.95 € minimum, and a single
// equity round trip there costs at least 29.90 €. Pass `--entity=lu` if that is the
// account; the default is `ch`.
//
// On the Swiss card a small ticket on Switzerland, the USA or the UK is 3 CHF a side.
// Germany is 5, Euronext and Canada 10, Italy / Austria / Scandinavia / Spain /
// Singapore / Australia 20. Above 2 000 of notional the columns collapse to the same
// steps: 29, 49, 79, 129, 190. Hong Kong and Tokyo have their own brackets. OTC is
// 0.5 %, minimum 100, in the listing currency — that one does fit `a` and `floor`.
//
// Crypto is a percentage, Standard I, 1 % taker each way, no minimum, no realtime line.
// A fifty-euro Bitcoin trip on 2026-09-08 paid exactly that: 0.50 € a side, cash 500 →
// 499, 2.00 %. `a` stays 0.02. An equity round trip on Germany still exceeds 10 €.
//
//   node swissquote/swissquote_cost.mjs AAPL NASDAQ USD
//   node swissquote/swissquote_cost.mjs AAPL NASDAQ USD --shares=1 --price=230
//   node swissquote/swissquote_cost.mjs BTC CRYPTO USD
//   node swissquote/swissquote_cost.mjs NESN SIX CHF --entity=ch
//   node swissquote/swissquote_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";

const CATALOGUE = new URL("swissquote-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);
const TAXES = new URL("../parsed_json/taxes.json", import.meta.url);
const T212 = new URL("../trading212/trading212-parsed.json", import.meta.url);

const SCHEDULE = {
  ch: {
    source: "https://www.swissquote.com/en-ch/private/trade/pricing/securities/stocks",
    crypto: "https://www.swissquote.com/en-ch/private/trade/pricing/cryptocurrencies",
    readOn: "2026-09-08",
    revised: "2026-03-13",
  },
  lu: {
    source: "https://www.swissquote.com/en-lu/private/trade/pricing/securities/stocks-etfs",
    crypto: "https://www.swissquote.com/en-lu/private/trade/pricing/cryptocurrencies",
    readOn: "2026-09-08",
  },
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const PTM = { each: 1.5, currency: "GBP", above: 10000 };
const REALTIME_EACH = 0.85;
const CRYPTO_TAKER = 0.01;
const CRYPTO_CHECK = {
  pair: "BTC/EUR",
  amount: 50,
  paid: 1,
  measured: 0.02,
  published: 0.02,
  commissionEach: 0.5,
  on: "2026-09-08",
};
const OTC_RATE = 0.005;
const OTC_MIN = 100;
const LU_RATE = 0.001;
const LU_MIN = 14.95;
const LU_MIN_TOKYO = 24.95;
const LU_DUBAI_RATE = 0.0025;
const LU_DUBAI_MIN = 24.95;

// Swiss federal stamp, charged on SIX (and BX) when a Swiss dealer is a party. Domestic
// securities 0.075 % a side, foreign 0.15 %. Not in the Trading212 tax sweep: that broker
// does not collect a Swiss stamp.
const SIX_STAMP_CH = 0.00075;
const SIX_STAMP_FOREIGN = 0.0015;

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);

// Notional brackets in the product currency, fee in CHF. The first three columns diverge
// only below 2 000; above that the card prints the same number in every column.
const GRID = [
  { upTo: 500, ch: 3, de: 5, eu: 10, other: 20 },
  { upTo: 1000, ch: 5, de: 5, eu: 10, other: 20 },
  { upTo: 2000, ch: 10, de: 10, eu: 10, other: 20 },
  { upTo: 10000, ch: 29, de: 29, eu: 29, other: 29 },
  { upTo: 15000, ch: 49, de: 49, eu: 49, other: 49 },
  { upTo: 25000, ch: 79, de: 79, eu: 79, other: 79 },
  { upTo: 50000, ch: 129, de: 129, eu: 129, other: 129 },
  { upTo: Infinity, ch: 190, de: 190, eu: 190, other: 190 },
];

const HK_GRID = [
  { upTo: 16000, chf: 29 },
  { upTo: 80000, chf: 39 },
  { upTo: 120000, chf: 49 },
  { upTo: 200000, chf: 79 },
  { upTo: 400000, chf: 129 },
  { upTo: Infinity, chf: 190 },
];

const JP_GRID = [
  { upTo: 250000, chf: 20 },
  { upTo: 1000000, chf: 29 },
  { upTo: 2000000, chf: 39 },
  { upTo: 3000000, chf: 49 },
  { upTo: 6000000, chf: 129 },
  { upTo: Infinity, chf: 190 },
];

const MARKET_COL = {
  ch: "ch",
  us: "ch",
  uk: "ch",
  de: "de",
  euronext: "eu",
  ca: "eu",
  other: "other",
};

// -------------------------------------------------------------------------- the files

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
const rows = Array.isArray(catalogue) ? catalogue : catalogue.rows || [];
const spreads = JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {};
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

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
  chf: usdPer("CHF"),
});

// ------------------------------------------------------------------------- markets

export function feeMarketOf(exchange, mic) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  if (code === "CRYPTO" || m === "CRYPTO") return "crypto";
  if (code === "OTC" || /PINK|OTCM/i.test(code)) return "otc";
  if (code === "DFM" || code === "DUBAI") return "dubai";
  if (code === "HKEX" || m === "XHKG") return "hk";
  if (code === "TSE" || code === "NAG" || m === "XJPX" || m === "XTKS") return "jp";
  if (code === "SIX" || code === "BX" || m === "XSWX") return "ch";
  if (US_MICS.has(m) || /^(NASDAQ|NYSE|AMEX|ARCA|CBOE|BATS)$/.test(code)) return "us";
  if (code === "LSE" || code === "AQUIS" || m === "XLON") return "uk";
  if (
    code === "XETR" ||
    m === "XETR" ||
    m === "XGAT" ||
    m === "XMUN" ||
    m === "LSEX" ||
    m === "XQTX" ||
    /^(FWB|SWB|DUS|MUN|HAM|HAN|BER|GETTEX|TRADEGATE|LSX|LS)$/.test(code)
  ) {
    return "de";
  }
  if (
    /^(XPAR|XAMS|XBRU|XLIS|EURONEXT)$/.test(code) ||
    ["XPAR", "XAMS", "XBRU", "XLIS"].includes(m)
  ) {
    return "euronext";
  }
  if (code === "OSL" || m === "XOSL") return "euronext";
  if (code === "TSX" || code === "TSXV" || code === "NEO") return "ca";
  return "other";
}

function gridChf(amount, market) {
  if (market === "hk") return (HK_GRID.find((t) => amount <= t.upTo) || HK_GRID.at(-1)).chf;
  if (market === "jp") return (JP_GRID.find((t) => amount <= t.upTo) || JP_GRID.at(-1)).chf;
  const col = MARKET_COL[market] || "other";
  const row = GRID.find((t) => amount <= t.upTo) || GRID.at(-1);
  return row[col];
}

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

// ------------------------------------------------------------------------- listing

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked) return true;
    return r.type === "CRYPTO" && loose(r.ticker) === asked;
  });

  const crypto = named.filter((r) => r.type === "CRYPTO");
  if (crypto.length && (!place || /crypto/i.test(place))) {
    const row =
      (wantCurrency && crypto.find((r) => String(r.currency).toUpperCase() === wantCurrency)) ||
      crypto.find((r) => String(r.currency).toUpperCase() === "USD") ||
      crypto[0];
    return { named, matches: [{ row, venue: null }] };
  }

  const matches = named
    .filter((r) => r.type !== "CRYPTO")
    .map((r) => ({ row: r, ...listingKey(r) }))
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

// ---------------------------------------------------------------------------- the cost

export function roundTripCost({ etf, place, currency, bp = null, perShare = null, entity = "ch" }) {
  const bank = entity === "lu" ? "lu" : "ch";
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    b: 0,
    c: 0,
    ccy: QUOTE,
    floor: null,
    cap: null,
    threshold: null,
    entity: bank,
    etf,
    place,
    currency,
  };

  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Swissquote` };

  const cryptoRow = named.find((r) => r.type === "CRYPTO");
  if (cryptoRow && (!place || /crypto/i.test(place))) {
    const picked = findListing({ etf, place, currency }).matches[0]?.row || cryptoRow;
    return cryptoCost(picked, answer, bank);
  }

  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Swissquote`,
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
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = US_MICS.has(listing.mic) || market === "us";
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  let taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);

  if ((market === "ch" || loose(m.row.exchange) === "SIX" || loose(m.row.exchange) === "BX") && listing.type !== "CRYPTO") {
    const swiss = listing.isin.startsWith("CH") ? SIX_STAMP_CH : SIX_STAMP_FOREIGN;
    rates.SWISS_STAMP = swiss * 2;
    taxTotal += swiss * 2;
  }

  let exchangePct = 0;
  if (listing.mic === "XETR") exchangePct += 0.000038 * 2;
  if (["XPAR", "XAMS", "XBRU"].includes(listing.mic) || loose(m.row.exchange) === "EURONEXT") {
    exchangePct += 0.000063 * 2;
  }
  if (market === "hk") exchangePct += 0.001 * 2;
  if (loose(m.row.exchange) === "SGX") exchangePct += 0.000325 * 2;

  if (market === "otc") {
    const a = OTC_RATE * 2 + taxTotal + (american ? SEC_RATE : 0);
    const bookUsd = american ? (marketPerShare ?? 0) : dollars(marketPerShare ?? 0, listing.currency) ?? 0;
    const realtimeUsd = bank === "ch" ? dollars(2 * REALTIME_EACH, listing.currency) ?? 0 : 0;
    return {
      ...answer,
      a: Number(a.toPrecision(4)),
      b: Number((bookUsd + (american ? TAF_PER_SHARE : 0)).toPrecision(6)),
      c: realtimeUsd,
      floor: dollars(OTC_MIN * 2, listing.currency),
      listing,
      feeMarket: "otc",
      parts: {
        marché: marketPerShare != null ? `${marketPerShare} par part` : marketBp != null ? Number((marketBp / 1e4).toPrecision(4)) : null,
        taxes: Object.keys(rates).length ? rates : null,
        commission: { rate: OTC_RATE, eachWay: true, min: dollars(OTC_MIN, listing.currency), currency: QUOTE, native: { min: OTC_MIN, currency: listing.currency } },
        realtimeEach: bank === "ch" ? REALTIME_EACH : 0,
      },
      bp: marketBp,
      perShare: marketPerShare,
      url: leaf?.url ?? SCHEDULE[bank].source,
      basis: "OTC Swissquote : 0,5 % min. 100, plus 0,85 de temps réel par jambe, le tout en dollars",
      tax,
      commission: null,
      cChf: null,
      fx: fxNote(listing.currency),
      fxIfConverted: 0,
      confidence: confidenceOf({ bank, market: "otc", marketBp, marketPerShare, taxTotal, american, leaf, type: listing.type }),
    };
  }

  const small = gridChf(0, market);
  let a = (marketBp ?? 0) / 1e4 + taxTotal + exchangePct + (american ? SEC_RATE : 0);
  let luFloor = null;
  if (bank === "lu") {
    const rate = market === "dubai" ? LU_DUBAI_RATE : LU_RATE;
    const min = market === "jp" || market === "dubai" ? (market === "dubai" ? LU_DUBAI_MIN : LU_MIN_TOKYO) : LU_MIN;
    a += rate * 2;
    luFloor = min * 2;
  }

  const bookUsd = american ? (marketPerShare ?? 0) : dollars(marketPerShare ?? 0, listing.currency) ?? 0;
  const commUsd = bank === "ch" ? dollars(small * 2, "CHF") ?? 0 : 0;
  const realtimeUsd = bank === "ch" ? dollars(2 * REALTIME_EACH, listing.currency) ?? 0 : 0;

  return {
    ...answer,
    a: Number(a.toPrecision(4)),
    b: Number((bookUsd + (american ? TAF_PER_SHARE : 0)).toPrecision(6)),
    c: Number((commUsd + realtimeUsd).toPrecision(6)),
    floor: bank === "lu" ? dollars(luFloor, "EUR") : null,
    listing,
    feeMarket: market,
    parts: {
      marché:
        marketBp != null ? Number((marketBp / 1e4).toPrecision(4)) : marketPerShare != null ? `${marketPerShare} par part` : null,
      taxes: Object.keys(rates).length ? rates : null,
      réglementaire: american ? { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part` } : null,
      exchangePct: exchangePct || null,
      realtimeEach: bank === "ch" ? REALTIME_EACH : 0,
      commissionUsd: commUsd || null,
      realtimeUsd: realtimeUsd || null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE[bank].source,
    basis:
      bank === "lu"
        ? "barème Swissquote Bank Europe, 0,1 % par jambe, plancher 14,95 € converti en dollars (Tokyo / Dubaï 24,95 €)"
        : "barème Swissquote Bank SA, commission CHF et 0,85 de temps réel convertis en dollars au mid BCE",
    tax,
    commission:
      bank === "ch"
        ? {
            each: dollars(small, "CHF"),
            roundTrip: commUsd,
            currency: QUOTE,
            native: { each: small, roundTrip: small * 2, currency: "CHF" },
            market,
            atNotional: "palier le plus bas (ticket ≤ 500, ou le premier palier HK/JP)",
            grid: market === "hk" ? HK_GRID : market === "jp" ? JP_GRID : GRID,
          }
        : {
            rate: market === "dubai" ? LU_DUBAI_RATE : LU_RATE,
            min: dollars(luFloor / 2, "EUR"),
            currency: QUOTE,
            native: { min: luFloor / 2, currency: "EUR" },
            eachWay: true,
          },
    cChf: bank === "ch" ? small * 2 : null,
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
    fxIfConverted: 0,
    confidence: confidenceOf({ bank, market, marketBp, marketPerShare, taxTotal, american, leaf, type: listing.type, unsourced: m.unsourced }),
  };
}

function cryptoCost(row, answer, bank) {
  const listing = {
    isin: null,
    ticker: row.ticker,
    name: row.name,
    type: "CRYPTO",
    mic: null,
    exchange: "Swissquote (crypto)",
    currency: String(row.currency || "USD").toUpperCase(),
    brokerExchange: "CRYPTO",
  };
  return {
    ...answer,
    a: Number((CRYPTO_TAKER * 2).toPrecision(4)),
    b: 0,
    c: 0,
    floor: null,
    listing,
    feeMarket: "crypto",
    parts: { marché: null, taxes: null, markupEachWay: CRYPTO_TAKER },
    bp: 200,
    perShare: null,
    url: SCHEDULE[bank].crypto,
    basis:
      bank === "lu"
        ? "barème crypto Europe : 1 % sous 10 000 €, 0,75 % jusqu'à 50 000, 0,5 % au-delà, les deux sens, sans minimum"
        : "barème crypto Suisse, palier Standard I : 1 % taker chaque sens ; les paliers inférieurs exigent un volume sur 30 jours",
    commission: { rate: CRYPTO_TAKER, eachWay: true, currency: QUOTE, tier: "Standard I" },
    cChf: null,
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    check: {
      bp: Number((1e4 * CRYPTO_CHECK.measured).toFixed(0)),
      trips: 1,
      range: [CRYPTO_CHECK.paid, CRYPTO_CHECK.paid],
      on: CRYPTO_CHECK.on,
      ratio: Number((CRYPTO_CHECK.measured / CRYPTO_CHECK.published).toFixed(2)),
      note: row.ticker === "BTC" ? null : `mesuré sur ${CRYPTO_CHECK.pair}, pas sur cette paire`,
    },
    confidence:
      `1 % taker à l'achat et à la vente, soit 2 % l'aller-retour, lu sur le barème du ${SCHEDULE[bank].readOn}. ` +
      `Pas de commission minimum, pas de ligne temps réel. ` +
      `Un aller-retour réel de ${CRYPTO_CHECK.amount} € sur ${CRYPTO_CHECK.pair} a payé ` +
      `${CRYPTO_CHECK.paid} € (${(100 * CRYPTO_CHECK.measured).toFixed(2)} %), ` +
      `soit ×${(CRYPTO_CHECK.measured / CRYPTO_CHECK.published).toFixed(2)} le barème : ` +
      `0,50 € de courtage par jambe, caisse 500 → 499 €` +
      (row.ticker === "BTC" ? "" : ` ; mesuré sur ${CRYPTO_CHECK.pair}, pas sur cette paire`),
  };
}

export function exactCost({ amount, market, entity = "ch", currency = "USD" }) {
  const bank = entity === "lu" ? "lu" : "ch";
  if (market === "crypto") {
    return { commission: dollars(amount * CRYPTO_TAKER * 2, currency), currency: QUOTE, realtime: 0 };
  }
  if (market === "otc") {
    const each = Math.max(OTC_MIN, amount * OTC_RATE);
    return {
      commission: dollars(each * 2, currency),
      currency: QUOTE,
      realtime: bank === "ch" ? dollars(2 * REALTIME_EACH, currency) : 0,
      native: { commission: each * 2, currency, realtime: 2 * REALTIME_EACH },
    };
  }
  if (bank === "lu") {
    const rate = market === "dubai" ? LU_DUBAI_RATE : LU_RATE;
    const min = market === "jp" ? LU_MIN_TOKYO : market === "dubai" ? LU_DUBAI_MIN : LU_MIN;
    const each = Math.max(min, amount * rate);
    return {
      commission: dollars(each * 2, "EUR"),
      currency: QUOTE,
      realtime: 0,
      native: { commission: each * 2, currency: "EUR" },
    };
  }
  const commChf = gridChf(amount, market) * 2;
  return {
    commission: dollars(commChf, "CHF"),
    currency: QUOTE,
    realtime: dollars(2 * REALTIME_EACH, currency),
    native: { commission: commChf, currency: "CHF", realtime: 2 * REALTIME_EACH, realtimeCurrency: currency },
  };
}

function confidenceOf({ bank, market, marketBp, marketPerShare, taxTotal, american, leaf, type, unsourced }) {
  const said = [];
  said.push(
    bank === "lu"
      ? `commission Europe 0,1 % par jambe, plancher 14,95 €, lue le ${SCHEDULE.lu.readOn}`
      : `commission Suisse selon le palier ${market}, lue le ${SCHEDULE.ch.readOn} (carte révisée ${SCHEDULE.ch.revised}), ` +
        `convertie en dollars au mid BCE du ${FX_AS_OF} et pliée dans c avec 0,85 de temps réel par jambe`
  );
  if (taxTotal > 0) {
    said.push(`taxes ${(100 * taxTotal).toFixed(2)} % du montant (T212 pour l'instrument, timbre suisse sur SIX)`);
  }
  if (american) {
    said.push(`frais SEC et FINRA à la vente, comme chez tout courtier américain`);
  }
  if (marketPerShare != null) {
    said.push(
      `carnet Rule 605, moyenne 100–499 parts` +
        (marketPerShare > 0.01 ? ` ; à ${marketPerShare} $/part le bucket est déjà large` : "")
    );
  } else if (marketBp != null) {
    said.push(`carnet publié ${marketBp} bp`);
  } else if (unsourced) {
    said.push(`aucun carnet : ${unsourced.name}, ${unsourced.why} — seules commission, taxes et frais sont comptés`);
  } else if (type !== "CRYPTO") {
    said.push(`aucun carnet relevé sur cette ligne : le spread manque`);
  }
  said.push(`aucun aller-retour réel chez Swissquote dans ce dépôt ; le barème n'a pas été recoupé sur un relevé`);
  return said.join(" ; ");
}

// ------------------------------------------------------------------------------- entrée

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ch: SCHEDULE.ch, lu: SCHEDULE.lu, grid: GRID, hk: HK_GRID, jp: JP_GRID, realtimeEach: REALTIME_EACH }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node swissquote_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--entity=ch|lu] [--json]\n" +
        "        node swissquote_cost.mjs --schedule\n" +
        "  ex.   node swissquote_cost.mjs AAPL NASDAQ USD --shares=1 --price=230\n" +
        "        node swissquote_cost.mjs BTC CRYPTO USD\n" +
        "        node swissquote_cost.mjs NESN SIX CHF"
    );
    process.exit(2);
  }

  const entity = flag("entity") === "lu" ? "lu" : "ch";
  const out = roundTripCost({
    etf,
    place,
    currency,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    entity,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (out.a == null) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) console.log(`\nce que Swissquote propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }

  const l = out.listing;
  const crypto = l.type === "CRYPTO";
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${entity === "lu" ? "Swissquote Bank Europe" : "Swissquote Bank SA"}]\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);
  if (out.parts?.exchangePct) detail.push(`frais de place ${out.parts.exchangePct}`);
  if (crypto) detail.push(`taker ${out.parts?.markupEachWay} chaque sens`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : FINRA et/ou spread 605" : " : rien"})`);
  console.log(
    `c = ${out.c} $   (par ordre : ${
      crypto ? "rien" : entity === "lu" ? "rien, le plancher Europe est à part" : `${out.cChf} CHF de commission + ${REALTIME_EACH} × 2 de temps réel, au mid BCE`
    })`
  );
  if (out.cChf != null) {
    console.log(`cChf = ${out.cChf} CHF   (source, marché ${out.feeMarket}, déjà dans c)`);
  }
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(`\ncoût = ${out.a} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ${out.b} × n + ${out.c}   ($ ; p en ${l.currency})`);
  console.log(`  ${out.basis}`);
  for (const line of out.confidence.split(" ; ")) console.log(`  ${line}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency);
    const extra = out.threshold && amount >= out.threshold.above ? out.threshold.c : 0;
    const affine = amountUsd != null ? out.a * amountUsd + out.b * n + out.c + extra : null;
    const billed = exactCost({ amount, market: out.feeMarket, entity, currency: l.currency });
    console.log(`\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` + (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : ""));
    if (affine != null) console.log(`  a, b, c        : ${affine.toFixed(4)} $`);
    if (!crypto && billed.commission != null) {
      console.log(`  commission     : ${Number(billed.commission).toFixed(4)} $` + (billed.native?.commission != null ? ` (${billed.native.commission} ${billed.native.currency})` : ""));
      if (billed.realtime) console.log(`  temps réel     : ${Number(billed.realtime).toFixed(4)} $ (déjà dans c si le palier n'a pas changé)`);
    }
  }
  if (out.url) console.log(`\n${out.url}`);
}
