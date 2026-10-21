// What one round trip costs at moomoo AU (Moomoo Securities Australia Ltd):
// buy n shares, sell them back, in dollars. Online cash order. US options,
// fractional orders under one share, margin and market-data cards stay out.
//
// https://www.moomoo.com/au/pricing
// Financial Services Guide dated 1 October 2026, part 4 (fees):
// https://risk-disclosure.au.moomoo.com/j/AUOA0017
// Read on 2026-10-20.
//   ASX stocks and ETFs, each side, AUD, GST included
//                                        commission 0.01 %, minimum 1 AUD
//                                        platform 0.02 %, minimum 2 AUD
//                                        (the pricing page: 3 AUD or 0.03 %, whichever is greater)
//   The guide prints no ASX exchange fee and no stamp.
//   US stocks and ETFs, each side, USD
//                                        commission 0, platform 0.99 USD an order
//                                        settlement 0.003 USD a share, at most 1 % of the trade
//                                        CAT 0.000003 USD a share (NMS), both sides
//                                        SEC 0.0000206 of the sale, minimum 0.01 USD
//                                        TAF 0 USD a share: FINRA fee holiday 1 Oct
//                                        to 31 Dec 2026, printed in the guide
//   The pricing page's NVDA examples (5 shares 1.01, 100 shares 1.29) are
//   0.99 plus the settlement fee.
//   Hong Kong stocks and ETFs, each side, HKD
//                                        commission 0.03 %, minimum 3 HKD
//                                        platform 15 HKD
//                                        trading 0.00565 % (min 0.01), SFC 0.0027 % (min 0.01),
//                                        FRC 0.00015 %, settlement 0.0042 %
//                                        stamp 0.1 %, rounded up to the next HKD; none on an ETF
//
// Cash. A deposit is Australian dollars only (deposits.mjs). A US or Hong
// Kong line converts on the buy and back on the sale, so the conversion is
// in the total, both ways. Guide part 4.5, built into the rate:
//   AUD/USD  50 pips (0.005 USD per AUD) both ways over spot
//   AUD/HKD  200 pips (0.02 HKD per AUD) both ways over spot
// One way is that spread over the mid of the pair. The guide prints no
// AUD/CNH pair, so a CNH counter in Hong Kong answers N/A. Checked again on
// 2026-10-20: the guide's table 4.5 has AUD/USD, AUD/HKD and USD/HKD (40
// pips) only; the help centre's exchange limits list AUD, USD and HKD only,
// and its rate note says only "the real-time exchange rate ... no fees will
// be charged". No CNH rate or spread is published anywhere.
//   https://www.moomoo.com/au/support/topic6_91    daily limit per currency
//   https://www.moomoo.com/au/support/topic6_401   note on exchange rates
//   https://www.moomoo.com/au/support/topic6_371   how to exchange currency
//
// ASX orders are executed and cleared by FinClear Execution Ltd (the guide,
// CHESS paragraph). US stocks are transferred in at DTC 4272, the number Futu
// Clearing Inc. uses for Futu HK and moomoo MY; the AU help page does not
// name the firm. Until an alias names it, the US book is the quoted NBBO.
//   https://www.moomoo.com/au/support/topic6_393
//
//   node brokers/moomooau/moomooau_cost.mjs BHP ASX AUD --shares=10 --price=40
//   node brokers/moomooau/moomooau_cost.mjs AAPL Nasdaq USD --shares=10 --price=230
//   node brokers/moomooau/moomooau_cost.mjs 00700 "Hong Kong" HKD --shares=100 --price=400
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";

const CATALOGUE = new URL("moomooau-parsed.json", import.meta.url);
const PAGE = "https://www.moomoo.com/au/pricing";
const FSG = "https://risk-disclosure.au.moomoo.com/j/AUOA0017";
const READ_ON = "2026-10-20";
const FSG_ON = "2026-10-01";
const BASE = "AUD";

// Added spread over spot, in units of the quote currency per AUD.
const FX_PIPS = { USD: 0.005, HKD: 0.02 };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function ceilDollar(amount) {
  return Math.ceil(amount - 1e-6);
}

// One conversion AUD <-> ccy, as a fraction of the amount.
function fxOneWay(ccy) {
  const pips = FX_PIPS[ccy];
  const aud = usdPer(BASE);
  const other = usdPer(ccy);
  if (pips == null || !(aud > 0) || !(other > 0)) return null;
  const mid = aud / other; // ccy per AUD
  return pips / mid;
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

function marketOf(listing) {
  const mic = listing.mic;
  const place = loose(listing.brokerExchange);
  if (mic === "XASX" || place === "ASX") return "AU";
  if (mic === "XHKG" || place === "HONGKONG") return "HK";
  if (["XNAS", "XNYS", "ARCX", "XASE", "BATS"].includes(mic) || /NASDAQ|NEWYORK|NYSE|CBOE/.test(place)) return "US";
  return "";
}

function auSide(notional) {
  return Math.max(1, notional * 0.0001) + Math.max(2, notional * 0.0002);
}

function hkSide(notional, etf) {
  const broker = Math.max(3, notional * 0.0003) + 15;
  const levy =
    notional * 0.000042 +
    Math.max(0.01, notional * 0.0000565) +
    Math.max(0.01, notional * 0.000027) +
    notional * 0.0000015 +
    (etf ? 0 : ceilDollar(notional * 0.001));
  return { broker, levy };
}

function usLevies(shares, notional) {
  const settlement = Math.min(shares * 0.003, notional * 0.01);
  const cat = shares * 0.000003;
  const sec = Math.max(0.01, notional * 0.0000206);
  return settlement * 2 + cat * 2 + sec;
}

const BASIS = {
  AU: `livraison en ligne, guide des services du ${FSG_ON} relu le ${READ_ON}. Commission 0,01 % (min 1 AUD) et plateforme 0,02 % (min 2 AUD), TTC. Vente identique.`,
  US: `livraison en ligne, guide des services du ${FSG_ON} relu le ${READ_ON}. Commission 0, plateforme 0,99 USD l'ordre. Règlement 0,003 USD l'action (au plus 1 %), CAT 0,000003 USD l'action à chaque sens, SEC 0,00206 % de la vente (min 0,01 USD), TAF 0 (exonération FINRA jusqu'au 31/12/2026). Vente identique.`,
  HK: `livraison en ligne, guide des services du ${FSG_ON} relu le ${READ_ON}. Commission 0,03 % (min 3 HKD), plateforme 15 HKD. Frais de place HKEX, SFC, FRC et timbre 0,1 % arrondi au HKD supérieur hors ETF. Vente identique.`,
};

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
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue moomoo AU n'existe pas encore : lancer `node brokers/moomooau/moomooau_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue moomoo AU` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez moomoo AU`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "moomooau",
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
  const market = marketOf(listing);
  const cash = listingCash(listing.currency);
  const held = depositHas("moomooau", null, cash);
  const fxEach = held ? 0 : fxOneWay(cash);
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? cash : BASE,
    url: FSG,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!market) return { ...shared, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };

  const fxBasis = held
    ? ""
    : fxEach == null
      ? ` Change forcé AUD → ${listing.currency} : ni le guide ni l'aide n'impriment de change AUD/${listing.currency} (plafonds de change : AUD, USD, HKD seulement).`
      : ` Change forcé AUD ↔ ${cash}, ${cash === "USD" ? "50 points (0,005 USD par AUD)" : "200 points (0,02 HKD par AUD)"} au-dessus du cours, soit ${(fxEach * 100).toFixed(3).replace(".", ",")} % par sens, dans le total.`;
  const basis = BASIS[market] + fxBasis;

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, basis, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, basis, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  // Hong Kong fees are printed in HKD, a USD or CNH counter included.
  const feeCcy = market === "HK" ? "HKD" : listing.currency;
  const feeNotional =
    feeCcy === listing.currency ? notional : notionalUsd == null || !(usdPer(feeCcy) > 0) ? null : notionalUsd / usdPer(feeCcy);
  if (feeNotional == null) return { ...shared, basis, why: `pas de cours ${listing.currency}/${feeCcy} dans fx.mjs` };
  let brokerLocal;
  let levyLocal;
  if (market === "AU") {
    brokerLocal = auSide(notional) * 2;
    levyLocal = 0;
  } else if (market === "US") {
    brokerLocal = 0.99 * 2;
    levyLocal = usLevies(n, notional);
  } else {
    const side = hkSide(feeNotional, listing.type === "ETF");
    brokerLocal = side.broker * 2;
    levyLocal = side.levy * 2;
  }
  brokerLocal = Number(brokerLocal.toPrecision(12));
  levyLocal = Number(levyLocal.toPrecision(12));
  const commissionUsd = dollars(brokerLocal, feeCcy);
  const levyUsd = dollars(levyLocal, feeCcy);
  // AUD out on the buy, back to AUD on the sale.
  const fxUsd = held ? 0 : fxEach == null || notionalUsd == null ? null : notionalUsd * fxEach * 2;
  const brokerFees = plus(commissionUsd, fxUsd);

  let marketBp = bp ?? book.leaf?.bp ?? null;
  let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  if (market === "US" && bp == null && perShare == null) {
    const quoted = usBookPerShare({ broker: "moomooau", ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: market === "US" && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levyUsd);
  const unknown = [
    !held && fxEach == null ? `change forcé AUD → ${listing.currency} : ni le guide ni l'aide n'impriment de change AUD/${listing.currency} (plafonds de change : AUD, USD, HKD seulement)` : null,
    bookUsd == null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
  ].filter(Boolean);

  return {
    ...shared,
    basis,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy: brokerLocal / 2, sell: brokerLocal / 2, currency: feeCcy },
    levy: { amount: levyLocal, currency: feeCcy },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
      réglementaire: finite(levyUsd, 6),
    },
    confidence: [
      basis,
      market === "US"
        ? "carnet 605 × Q du courtier américain une fois l'alias posé, sinon NBBO coté"
        : marketBp != null
          ? `carnet ${Number(marketBp.toPrecision(4))} bp`
          : "pas de carnet",
    ].join(" ; "),
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
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [symbol, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({
    etf: symbol,
    place,
    currency,
    shares: Number(arg("shares", "10")),
    price: Number(arg("price", "0")),
  }), null, 2));
}

printCli();
