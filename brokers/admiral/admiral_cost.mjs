// What one round trip costs at Admirals (Invest.MT5): buy n shares at price p,
// sell them back at once, in dollars.
//
// The affine triple this file used to answer — a × p × n + b × n + c — could not
// hold the American rule, and quietly dropped it. Admirals charges 0.02 $ per
// share per side with a 1 $ floor and no ceiling, so the old file folded the
// floor into `c` and left the per-share term out entirely, on the argument that
// the minimum covers everything under fifty shares. It does, and above fifty it
// is wrong by as much as you like: a thousand shares is 20 $ a side, 40 $ the
// round trip, against the 2 $ the affine triple answered. `roundTrip` is given
// the size of the trade and so can charge what is actually charged.
//
// Barème relu le 2026-09-13 sur les trois pages ci-dessous. Commission par sens,
// plancher par sens, aucun plafond :
//
//   États-Unis                       0,02 $ / part, min 1 $
//   Allemagne (Xetra), France        0,10 %, min 1 €
//   Royaume-Uni                      0,10 %, min 1 £
//   reste de l'Europe                0,15 %, min 1 €
//    20//     Suède 10 SEK, Norvège 10 NOK, Danemark 30 DKK, Suisse 1 CHF
//   Asie-Pacifique                   0,15 %, min 8 AUD
//
// Asia Pacific is in the schedule and in no line of this catalogue, which holds
// sixteen venues, all American or European. It is carried below so that a line
// appearing there later is priced rather than guessed.
//
// What else lands on the ticket, all of it now in the number:
//
//   droit de timbre UK               0,5 % à l'achat
//   droit de timbre irlandais        1 % à l'achat
//    30//   TTF française                    0,4 % à l'achat
//   TTF espagnole                    0,2 % à l'achat
//   prélèvement PTM (UK)             1,5 £ par sens au-delà de 10 000 £
//   SEC (US)                         à la vente, sur le produit
//   FINRA TAF (US)                   à la vente, par part, plafonné par exécution
//
// The taxes come from `taxMap.mjs`, which reads Trading212's ex-ante disclosure
// by ISIN: a stamp duty is a fact about the instrument, not about Admirals, and
// the two agree on every rate the broker publishes.
//
//    40// Two things stay out of the number on purpose, and both were put to the test on
// 2026-09-14 before being left there.
//
// The 0.30 % conversion fee bites only where the account's base currency differs
// from the instrument's, and the account currency is the client's choice, so the
// page cannot know it. What the page also could not know was how much of a trade
// it eats, and the fear was OANDA's: a markup on the principal, converted twice,
// worth more than everything else on the ticket. It is not that. Twenty Allianz
// on Xetra — a euro line — bought from a dollar account debited 10 234,78 $ for
// 10 224,62 $ of stock, so the cash moved by the notional and the commission and
// by nothing else. A markup on the principal would have added some 30 $ a side.
// It lands on the P&L and the fees, which is where the remark says it lands, and
// at any ordinary size that is cents. Left out, now for a measured reason.
//
// The standing offer that makes the first one-sided deal of each trading day
// free excludes ETFs, is one side and not the round trip, and can be withdrawn:
// counting on it would make the cheap case look like the rule. Twice now it has
// not fired — Boeing on the 8th and Allianz on the 14th both paid full
// commission on the day's first order — which is the better reason to keep it
// out. Inactivity (10 € / month after 24 months) is a holding cost, not a trip.
//
// Market spread comes from `parsed_json/spread.json` and is already a round trip:
//    50// basis points in Europe, the Rule 605 effective spread per share in America. It
// is added once, not twice. Where no book was ever read the answer is null and
// the page prints N/A, which is the honest reading of a hole — 159 of 3 279
// lines, the Swedish, Finnish and Danish venues chiefly.
//
// Two real trips, one per side of the schedule.
//
// 2026-09-08, Invest.MT5 USD. Three market buys of 0.01 BA (Boeing, NYSE) then
// one close of 0.03. Each execution paid the 1 $ minimum (commission −1, fee 0).
// Cash 500 → 495.99: four tickets plus 0.23 ¢ of book. That is four executions
// and so four floors, which is what `roundTrip` charges for one buy and one
// sell. SEC and TAF were 0 at this notional (~6 $).
//
// 2026-09-14, Invest.MT5 demo, USD — the European tier, which had never been
// checked against a statement. Twenty Allianz on Xetra at 443,00 €, bought and
// sold back within the minute: 10,22 $ of commission in and 10,23 $ out on
// 10 224,62 $ of stock, which is 0,10 % a side and nowhere near the 1 € floor.
// Cash 50 000,00 → 49 979,84, the 20,16 $ being the two commissions less 0,35 $
// the market happened to give back. This file answers 20,59 $ of broker fees for
// that trip against 20,45 $ paid, the gap being the EURUSD it caches.
//    60//
//   node admiral/admiral_cost.mjs AAPL NASDAQ USD
//   node admiral/admiral_cost.mjs AAPL NASDAQ USD --shares=1000 --price=230
//   node admiral/admiral_cost.mjs EUNL XETR EUR --shares=10 --price=126
//   node admiral/admiral_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("admiral-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://admiralmarkets.com/start-trading/admiral-invest-stocks-and-etfs",
  commissions: "https://admiralmarkets.com/start-trading/commissions-calculations",
  fees: "https://admiralmarkets.com/products/fees-and-charges",
  readOn: "2026-09-13",
  entity: "Admirals (CY), Invest.MT5",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const PTM = { each: 1.5, currency: "GBP", above: 10000 };
// `taxMap.mjs` reads Trading212's disclosure, which prints every charge as a
// percentage of the one amount it was quoted on. That is right for a stamp duty
// and wrong for a flat levy: PTM_LEVY carries `amount: 150` — a pound fifty in
// pence — and an `ofValue` that takes 102 different values across the file,
// twenty-fold apart, depending only on the size of each example. Taking it as a
// rate would charge it below the ten-thousand-pound threshold, where it is not
// due at all, and charge it twice where it is. It is billed as the flat fee it
// is, a few lines below.
const FLAT_NOT_RATE = new Set(["PTM_LEVY"]);
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

// The European tier, and the conversion, measured on a USD demo the same way.
// Twenty Allianz on Xetra is a euro line bought with dollars, so one trip prices
// both the 0,10 % and whatever the 0,30 % actually touches.
const CHECK_EU = {
  isin: "DE0008404005",
  ticker: "ALV",
  venue: "XETR",
  n: 20,
  price: 443.0,
  notionalUsd: 10224.62,
  commission: { buy: 10.22, sell: 10.23 },
  cash: { start: 50000.0, end: 49979.84 },
  pl: 0.35,
  account: "Invest.MT5 démo, USD",
  on: "2026-09-14",
};

// Per side. `perShare` where the venue charges by the unit, `rate` where it
// charges by the amount; `min` is the floor, in `ccy`, and there is no cap.
const RULE = {
  us: { perShare: 0.02, min: 1, ccy: "USD" },
  de_fr: { rate: 0.001, min: 1, ccy: "EUR" },
  uk: { rate: 0.001, min: 1, ccy: "GBP" },
  ch: { rate: 0.0015, min: 1, ccy: "CHF" },
  se: { rate: 0.0015, min: 10, ccy: "SEK" },
  no: { rate: 0.0015, min: 10, ccy: "NOK" },
  dk: { rate: 0.0015, min: 30, ccy: "DKK" },
  fi: { rate: 0.0015, min: 1, ccy: "EUR" },
  other_eu: { rate: 0.0015, min: 1, ccy: "EUR" },
  asia_pacific: { rate: 0.0015, min: 8, ccy: "AUD" },
};

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
warmListingIndex(rows);
const spreads = JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

// Money in `to`, from an amount in `from`. A penny is a hundredth of a pound and
// `fx.mjs` knows it, so the 187 GBX lines reach the 1 £ floor without a stray
// factor of a hundred deciding whether the minimum bites.
function convert(amount, from, to) {
  if (amount == null || Number.isNaN(amount)) return null;
  const a = String(from || "").toUpperCase();
  const b = String(to || "").toUpperCase();
  if (a === b) return amount;
  const usd = toUsd(amount, a);
  const per = usdPer(b);
  return usd == null || !(per > 0) ? null : usd / per;
}

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });

const venueRow = (row) => ({ ...row, exchange: TO_VENUES[row.exchange] || row.exchange });

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
  if (/Australia|Japan|Hong Kong|Singapore/i.test(raw)) return "asia_pacific";
  return "other_eu";
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rowsNamed(rows, asked, 
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );

  const matches = named
    .filter((r) => String(r.type || "").toUpperCase() !== "CRYPTO")
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
    if (String(type).toUpperCase() === "CRYPTO") continue;
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

// One side of the trade, in the currency the commission is quoted in. The floor
// is per transaction, which is what makes a round trip two floors and not one:
// the live BA trip paid 1 $ on each of its four executions.
export function commissionSide({ shares, notional, currency, market }) {
  const rule = RULE[market];
  if (!rule) return null;
  if (rule.perShare != null) {
    if (!(Number(shares) > 0)) return null;
    const raw = rule.perShare * Number(shares);
    return { raw, charged: Math.max(rule.min, raw), currency: rule.ccy, floored: raw < rule.min };
  }
  const inCcy = convert(notional, currency, rule.ccy);
  if (inCcy == null) return null;
  const raw = inCcy * rule.rate;
  return { raw, charged: Math.max(rule.min, raw), currency: rule.ccy, floored: raw < rule.min };
}

// The remark carries what the number does not. Everything the round trip
// actually charges — the floors, the stamp duties, the PTM levy — is in `usd`
// and broken out under `buy` and `sell`, so naming it here would only invite
// the reader to add it twice. The conversion fee is the one charge left out,
// because it turns on the account's base currency rather than on the listing.
const remarkOf = (currency) => fxRemark((100 * FX_ON_SETTLEMENT).toFixed(2), currency);

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `usd` is the number the page prints; `buy` and `sell` say what each side paid.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const base = { usd: null, etf, place, currency, onlineBuy: true, cashCurrency: "" };

  if (!catalogue) {
    return {
      ...base,
      why: "le catalogue Admirals n'existe pas encore : lancer `node admiral/admiral_scraping.mjs` avec admiralmarkets.com ouvert",
    };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...base, why: `${etf} n'est pas dans le catalogue Admirals` };
  if (!matches.length) {
    return {
      ...base,
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
  const american = market === "us";
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;

  const n = Number(shares);
  const p = Number(price);
  const answer = {
    ...base,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    fx: fxNote(listing.currency),
  };
  // No size, or no price on file for this line: the rules are known and the bill
  // is not, which is a different thing from a trade that costs nothing.
  if (!(n > 0) || !(p > 0)) {
    return {
      ...answer,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      remark: remarkOf(listing.currency),
    };
  }

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);

  // The book is already a round trip — basis points in Europe, the Rule 605
  // effective spread per share in America — so it is added once, not per side.
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const buyComm = commissionSide({ shares: n, notional, currency: listing.currency, market });
  const sellComm = commissionSide({ shares: n, notional, currency: listing.currency, market });
  const buyCommUsd = buyComm ? dollars(buyComm.charged, buyComm.currency) : null;
  const sellCommUsd = sellComm ? dollars(sellComm.charged, sellComm.currency) : null;

  // Stamp duty and the transaction taxes are levied on the purchase only.
  const tax = taxesOf(listing.isin);
  const rates = Object.fromEntries(
    Object.entries(taxRates(tax)).filter(([name]) => !FLAT_NOT_RATE.has(name))
  );
  const taxRate = Object.values(rates).reduce((s, r) => s + r, 0);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxRate;

  // American sell-side levies. The TAF is capped per execution, and one sale is
  // one execution here.
  // A levy we cannot convert is a levy we cannot price. Zero would say the
  // trade escaped it, which is the one thing we know to be false.
  const secUsd = american ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;
  const tafUsd = american ? Math.min(TAF_PER_SHARE * n, TAF_CAP) : 0;

  // The PTM levy rides on the consideration, so it is judged in pounds whatever
  // the line is quoted in — pence for most of the London book.
  const considerationGbp = convert(notional, listing.currency, PTM.currency);
  // Three states, not two. Off London the levy is not due and that is a zero;
  // on London above ten thousand pounds it is due; on London with no rate to
  // judge the consideration by, whether it is due is unknown, and an unknown
  // threshold must not be read as a threshold that was not crossed.
  const ptmApplies =
    listing.mic !== "XLON" ? false : considerationGbp == null ? null : considerationGbp >= PTM.above;
  const ptmEach = ptmApplies == null ? null : ptmApplies ? dollars(PTM.each, PTM.currency) : 0;
  const ptmUsd = ptmApplies == null ? null : ptmApplies ? dollars(PTM.each * 2, PTM.currency) : 0;

  const usd = plus(bookUsd, buyCommUsd, sellCommUsd, taxUsd, secUsd, tafUsd, ptmUsd);
  // What the broker keeps, told apart from the total because the page prints the
  // two side by side. A free trade, a discount, a plan waives a commission and
  // nothing else: the book belongs to whoever quoted it, the transaction taxes
  // to a treasury, the regulatory levies to a regulator, and no broker can
  // forgive any of them. A remark about free trades next to a single number
  // would read as if it did.
  const brokerFees = plus(buyCommUsd, sellCommUsd);

  return {
    ...answer,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    remark: remarkOf(listing.currency),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    buy: {
      commission: finite(buyCommUsd, 6),
      native: buyComm ? { charged: finite(buyComm.charged, 6), raw: finite(buyComm.raw, 6), currency: buyComm.currency } : null,
      taxes: finite(taxUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
      ptm: finite(ptmEach, 6),
    },
    sell: {
      commission: finite(sellCommUsd, 6),
      native: sellComm ? { charged: finite(sellComm.charged, 6), raw: finite(sellComm.raw, 6), currency: sellComm.currency } : null,
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
      ptm: finite(ptmEach, 6),
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(plus(buyCommUsd, sellCommUsd), 6),
      taxes: finite(taxUsd, 6),
      réglementaire: american ? finite(plus(secUsd, tafUsd), 6) : 0,
      ptm: ptmUsd,
    },
    tax,
    fxIfConverted: FX_ON_SETTLEMENT,
    fxNote: `${(100 * FX_ON_SETTLEMENT).toFixed(2)} % si la devise du compte diffère de ${listing.currency} (P&L et frais), hors du total`,
    check: american ? CHECK : null,
    basis:
      `barème Invest.MT5 relu le ${SCHEDULE.readOn}, palier ${market} : ` +
      (rule.perShare != null
        ? `${rule.perShare} ${rule.ccy} par part et par sens, plancher ${rule.min} ${rule.ccy}`
        : `${(100 * rule.rate).toFixed(2)} % par sens, plancher ${rule.min} ${rule.ccy}`),
    confidence: confidenceOf({
      market,
      marketBp,
      marketPerShare,
      taxRate,
      american,
      type: listing.type,
      unsourced: m.unsourced,
      buyComm,
      n,
    }),
  };
}

function confidenceOf({ market, marketBp, marketPerShare, taxRate, american, type, unsourced, buyComm, n }) {
  const said = [];
  said.push(
    `commission Invest.MT5, palier ${market}, lue le ${SCHEDULE.readOn} (${SCHEDULE.fees}), ` +
      `facturée par sens et convertie en dollars au mid BCE du ${FX_AS_OF}`
  );
  if (buyComm) {
    said.push(
      buyComm.floored
        ? `le plancher mord : ${Number(buyComm.raw.toPrecision(3))} ${buyComm.currency} calculés, ${buyComm.charged} ${buyComm.currency} facturés par sens`
        : `au-dessus du plancher : ${Number(buyComm.charged.toPrecision(4))} ${buyComm.currency} par sens`
    );
  }
  if (american) {
    said.push(
      `0,02 $ par part sans plafond : c'est le terme que le modèle affine omettait, et à ${n} parts il vaut ${Number((0.02 * n).toPrecision(4))} $ par sens`
    );
    said.push(`SEC et FINRA à la vente comme chez tout courtier américain`);
  }
  if (taxRate) said.push(`taxe à l'achat ${(100 * taxRate).toFixed(2)} % du montant`);
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) {
    said.push(`carnet Rule 605, ${marketPerShare} $ la part, moyenne 100–499 parts`);
    if (marketPerShare > 0.01) {
      said.push(`ATTENTION carnet large : sous 100 parts l'amélioration de ce chiffre n'a souvent pas lieu`);
    }
  } else {
    said.push(
      `aucun carnet : ${unsourced?.name || "cette place"}, ${unsourced?.why || "pas de source"}. Le total est nul faute de mesure, pas faute de frais`
    );
  }
  if (american) {
    said.push(
      `un aller-retour réel le ${CHECK.on} sur ${CHECK.ticker} (${CHECK.venue}) : ` +
        `trois achats de 0,01 puis vente de 0,03, courtage ${CHECK.buys[0].commission} $ par exécution ` +
        `(caisse ${CHECK.cash.start} → ${CHECK.cash.end}) — quatre exécutions, donc quatre planchers`
    );
  } else if (market === "de_fr") {
    said.push(
      `un aller-retour réel le ${CHECK_EU.on} sur ${CHECK_EU.ticker} (Xetra), ${CHECK_EU.account} : ` +
        `${CHECK_EU.n} actions à ${CHECK_EU.price} €, soit ${CHECK_EU.notionalUsd} $, courtage ` +
        `${CHECK_EU.commission.buy} $ à l'achat et ${CHECK_EU.commission.sell} $ à la vente — ` +
        `0,10 % des deux côtés, très au-dessus du plancher (caisse ${CHECK_EU.cash.start} → ${CHECK_EU.cash.end})`
    );
  } else {
    said.push(
      `courtage palier ${market} non recoupé sur un relevé ; les aller-retours réels sont ${CHECK.ticker} NYSE ` +
        `à 1 $ le ticket et ${CHECK_EU.ticker} Xetra à 0,10 % le sens`
    );
  }
  if (type === "STOCK" && american) {
    said.push(`le catalogue US Admirals n'a pas d'ETF : une action paie les mêmes frais, le carnet est le 605 de son symbole`);
  }
  said.push(
    `hors total : ${(100 * FX_ON_SETTLEMENT).toFixed(2)} % de conversion si la devise du compte diffère — et il ` +
      `ne mord pas sur le principal, ce qui a été vérifié le ${CHECK_EU.on} : une ligne en euros achetée avec des ` +
      `dollars a débité le notionnel et le courtage, rien d'autre, quand 0,30 % du montant aurait fait 30 $ de plus`
  );
  said.push(
    `hors total : l'offre « premier ordre du jour sans commission », qui exclut les ETF et ne vaut que pour un sens — ` +
      `elle n'a joué ni le ${CHECK.on} ni le ${CHECK_EU.on}, les deux premiers ordres du jour ayant payé plein tarif`
  );
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
      "usage : node admiral_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node admiral_cost.mjs --schedule\n" +
        "  ex.   node admiral_cost.mjs AAPL NASDAQ USD --shares=1000 --price=230\n" +
        "        node admiral_cost.mjs EUNL XETR EUR --shares=10 --price=126"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce qu'Admirals propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`);

  if (out.usd == null) {
    console.log(`coût N/A — ${out.why || "carnet manquant"}`);
    console.log(`  ${out.basis}`);
    process.exit(0);
  }

  const t = out.trade;
  const money = (x) => (x == null ? "N/A" : `${Number(x).toFixed(4)} $`);
  console.log(
    `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ` +
      `${t.notional.toFixed(2)} ${t.currency} (${t.notionalUsd.toFixed(2)} $)\n`
  );
  console.log(`achat`);
  console.log(`  commission   ${money(out.buy.commission)}` + (out.buy.native ? `   (${Number(out.buy.native.charged.toPrecision(6))} ${out.buy.native.currency}${out.buy.native.charged > out.buy.native.raw ? ", plancher" : ""})` : ""));
  if (out.buy.taxes) console.log(`  taxes        ${money(out.buy.taxes)}   (${Object.keys(out.buy.taxRates || {}).join(", ")})`);
  if (out.buy.ptm) console.log(`  PTM          ${money(out.buy.ptm)}`);
  console.log(`vente`);
  console.log(`  commission   ${money(out.sell.commission)}` + (out.sell.native ? `   (${Number(out.sell.native.charged.toPrecision(6))} ${out.sell.native.currency})` : ""));
  if (out.sell.sec) console.log(`  SEC          ${money(out.sell.sec)}`);
  if (out.sell.taf) console.log(`  FINRA TAF    ${money(out.sell.taf)}`);
  if (out.sell.ptm) console.log(`  PTM          ${money(out.sell.ptm)}`);
  console.log(`marché`);
  console.log(`  carnet       ${money(out.parts.marché)}   (aller-retour)`);
  console.log(`\ntotal        ${money(out.usd)}   soit ${((100 * out.usd) / t.notionalUsd).toFixed(3)} % du montant`);
  console.log(`  ${out.basis}`);
  for (const line of out.confidence.split(" ; ")) console.log(`  ${line}`);
  if (out.url) console.log(`\n${out.url}`);
}
