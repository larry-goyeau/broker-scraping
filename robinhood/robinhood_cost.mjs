// For one listing, one venue and one currency, the three coefficients of
//
//     coût (USD) = a × p × n + b × n + c
//
// on Robinhood, with n the number of shares and p the share price. Options are not
// in the catalogue, so they answer `a = null`.
//
// Robinhood is three brokers wearing one name, and which one serves you is decided
// by where you live, not by anything you pick. The residency the front already
// filters on therefore chooses the schedule:
//
//   US        Robinhood Financial LLC. Real US shares, no commission, three
//             regulators, and crypto through Robinhood Crypto.
//   GB        Robinhood U.K. Ltd. The same real shares through the same US
//             clearer, so the same three regulators, plus a currency conversion
//             between the sterling and dollar sides. Shares and ADRs only: no
//             crypto, and no exchange-traded fund at all, which PRIIPs forbids
//             for want of a key information document. That removes 5 919 of the
//             catalogue's 12 267 lines before any price is quoted.
//   EEA       Robinhood Europe UAB. Not a share at all: a Classic Stock Token, a
//             MiFID II derivative issued in Vilnius over the US line. No US
//             regulator reaches it, no commission is charged, and the whole cost
//             is a 0.10 % conversion each way. Crypto is a flat 0.50 % a leg.
//
// The gap between them is not a detail. A French buyer pays 0.20 % on a round trip
// where an American pays two thousandths of a percent, a hundred times less, and
// the Frenchman's crypto costs half the American's. A single schedule for all three
// would be wrong by more than any spread this file measures.
//
// The catalogue already carries the European split: `usOnly` marks the 10 253 lines
// absent from Robinhood Europe's Specific Information Document, the published list
// of underlyings, leaving 2 014 an EEA resident can buy. The British side has no
// such list. What Robinhood publishes there is a set of asset classes it refuses,
// so this file can withhold a whole type but not a name — and Robinhood UK's own
// press puts its universe near 5 000 shares and ADRs where the catalogue holds
// 6 206 shares, so some British narrowing is invisible here.
//
// ---- the American schedule, which the British one inherits ----
//
// Nothing is charged as commission. What is left is the three regulators, and
// Robinhood is unusual in waiving two of them on small orders: the SEC fee is not
// passed on for a sale of 500 $ or less, and the TAF is not passed on for a sale of
// fifty shares or fewer. CAT survives both but rounds to the nearest penny and is
// dropped when it comes to less than one, which a fifty-share order always does.
// So a small American trade here costs exactly zero, and that is a fact the affine
// form cannot hold: `a` and `b` carry the published rates, which overstate the
// small order rather than understate it. `exactCost` applies the waivers.
//
// The same three rates sit in the tastytrade and Alpaca files, being the same
// regulators: 20.60 $ per million on the sell, 0.000195 $ a share on the sell,
// 0.000003 $ a share on both legs — a hundredth of that on OTC, where the fee is
// written per share of OTC equity rather than per equivalent share.
//
// The British account adds one line to that card: 0.10 % to convert between its
// sterling and dollar sides on a weekday, 0.30 % from Friday evening to Sunday
// evening and on US holidays. It sits in `fxIfConverted` rather than in `a`,
// because a general account can hold dollars and never convert. An ISA cannot —
// it is sterling only — so for an ISA the conversion is part of the price.
//
// ---- the European schedule ----
//
// A Classic Stock Token is a derivative contract with Robinhood Europe, recorded on
// a blockchain, one token per underlying share. The fee schedule is one sentence:
// 0.10 % of the euro value on each conversion, euros to dollars on the buy and back
// on the sell, and "Robinhood Europe does not apply any other fees related to the
// trading of Classic Stock Tokens". No SEC, no TAF, no CAT: the client is not
// selling a US security. The conversion cannot be avoided, the account being euro
// only, so it belongs in `a` and not beside it.
//
// The token is quoted at the underlying's price, so the underlying's book is still
// what crossing costs, and the 605 leaf is kept. One caveat the KID states and this
// file cannot: the token trades around the clock from Monday to Saturday, and
// outside US hours the reference market it tracks is thinner than the 605 average.
//
// European crypto is a flat 0.50 % of the euro value each way, one cent minimum,
// and EURC is free — the euro stablecoin bought with euros, the same exemption the
// Revolut file records for USDC bought with dollars.
//
// ---- the American crypto, which is the one that hides ----
//
// Crypto is where the money is, and where the screen says nothing. Since the 4th of
// April 2026 an order takes one of two roads. The app's default routes to market
// makers and shows no fee at all; Robinhood's own routing page prices that road,
// and it is not free — "for every $100 of notional crypto order volume executed
// [through] market maker routing, Robinhood Crypto receives $0.95". That 0.95 % a
// leg is inside the price. The other road, exchange routing, is the only one on
// Legend and on the ladder, and it charges an explicit taker fee whose first tier,
// under 10 000 $ of thirty-day volume, is also 0.95 %. Both roads cost the same to
// a small account, which is why one figure answers for both.
//
// No crypto book is added on top. The 0.95 % is the market maker's compensation
// for crossing, so counting a Binance or Coinbase touch as well would charge the
// spread twice — the same reasoning as the Revolut file.
//
// Nothing here was measured. Every figure is a published rate, and both crypto
// figures are floors: they are what Robinhood is paid, not what the whole spread
// costs. The market maker's own edge sits on top and no ticket names it.
//
//   node robinhood/robinhood_cost.mjs AAPL
//   node robinhood/robinhood_cost.mjs US0378331005 NASDAQ USD --shares=1 --price=230
//   node robinhood/robinhood_cost.mjs AAPL --nat=FR
//   node robinhood/robinhood_cost.mjs BTC --nat=FR
//   node robinhood/robinhood_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue } from "../venues.mjs";
import { plus, times, finite, bookParts } from "../na.mjs";
import { QUOTE, toUsd } from "../fx.mjs";
import { EEA } from "../accepted.mjs";

const CATALOGUE = new URL("robinhood-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://cdn.robinhood.com/assets/robinhood/legal/RHF+Fee+Schedule.pdf",
  uk: "https://cdn.robinhood.com/assets/robinhood/legal/RHUK_Fee_Schedule.pdf",
  eu: "https://cdn.robinhood.com/assets/robinhood/legal/fee_schedule_EU.pdf",
  crypto: "https://cdn.robinhood.com/assets/robinhood/legal/rhc-fee-schedule.pdf",
  routing: "https://robinhood.com/us/en/support/articles/crypto-order-routing/",
  fees: "https://robinhood.com/us/en/support/articles/trading-fees-on-robinhood/",
  secFrom: "2026-04-04",
  tafFrom: "2026-01-01",
  cryptoFrom: "2026-04-04",
  euOn: "20260622-5628651-17828471",
  ukOn: "20260626-5663461-17983127",
  readOn: "2026-09-13",
};

// Which of the three companies serves a visitor. The EEA list is the one
// `accepted.mjs` already uses to open the broker, so the two cannot drift apart.
// An unnamed country falls to the American card, which is the one the catalogue is
// overwhelmingly written in.
const EEA_SET = new Set(EEA);

export function entityOf(nat) {
  const code = String(nat || "").trim().toUpperCase();
  if (code === "GB") return "uk";
  if (EEA_SET.has(code)) return "eu";
  return "us";
}

const ENTITY_NAME = {
  us: "Robinhood Financial LLC",
  uk: "Robinhood U.K. Ltd",
  eu: "Robinhood Europe UAB",
};

const SEC_RATE = 0.0000206;
// Not passed on below this, on the sale's own notional. The schedule says "equity
// sales with a notional value of $500 or less", so the bound is inclusive.
const SEC_FREE_UPTO = 500;

const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const TAF_FREE_UPTO_SHARES = 50;

const CAT_PER_SHARE = 0.000003;
const CAT_OTC_PER_SHARE = 0.00000003;

const COMMISSION_RATE = 0;

// What the market maker pays Robinhood on the default road, per leg, quoted by
// Robinhood as 0.95 $ per 100 $ of notional. Read as a cost because the client
// meets it in the price.
const CRYPTO_MARKET_MAKER = 0.0095;

// Exchange routing, taker then maker, by trailing thirty-day volume through that
// road. A market order is always a taker, so the taker column is the one a retail
// buy meets. The first tier's taker is the same 0.95 % as the other road.
const CRYPTO_TIERS = [
  { upto: 10e3, taker: 0.0095, maker: 0.005 },
  { upto: 50e3, taker: 0.0075, maker: 0.0035 },
  { upto: 250e3, taker: 0.0025, maker: 0.00125 },
  { upto: 500e3, taker: 0.0015, maker: 0.00075 },
  { upto: 1e6, taker: 0.00125, maker: 0.0006 },
  { upto: 5e6, taker: 0.001, maker: 0.0004 },
  { upto: 10e6, taker: 0.0004, maker: 0.0002 },
  { upto: 25e6, taker: 0.0003, maker: 0.0001 },
  { upto: Infinity, taker: 0.0003, maker: 0 },
];

// Robinhood UK, between its sterling and dollar sides. The weekend rate runs from
// Friday 17:00 New York to Sunday 17:00, and over US holidays.
const UK_FX_WEEKDAY = 0.001;
const UK_FX_WEEKEND = 0.003;

// Robinhood Europe. The conversion is on every order, both ways, and cannot be
// held off since the account is euro only.
const EU_FX_EACH_WAY = 0.001;
const EU_CRYPTO_EACH_WAY = 0.005;
const EU_CRYPTO_MIN_EUR = 0.01;

// Measured, and it is the half of the price the schedule does not mention. A real
// round trip on bitcoin at 02:41 Paris on 2026-09-13 bought at exactly 1 % above
// the price the buy screen was showing, while the sale a minute later went off at
// the price the sell screen was showing, to five decimal places. So the crossing
// costs 1 % and it is all taken on the way in — which doubles a round trip from
// the 1 % the commission announces to 2 %.
//
// Whether Robinhood reads this as a markup over its own quote or as a book whose
// ask is a percent above its bid does not change the euro: the buyer pays it, and
// nothing on either screen names it.
const EU_CRYPTO_MARKUP = 0.01;

const EU_CRYPTO_CHECK = {
  on: "2026-09-13 02:41 Paris",
  coin: "BTC",
  spent: 150.0,
  got: 0.00221969,
  askShown: 66574.84,
  effective: 67240.8,
  markup: 0.010003,
  sellQuoted: 66585.66,
  sellFilled: 66585.34,
  sellSlip: -0.000005,
  roundTrip: 0.019756,
};
// Free on the euro stablecoin bought with euros, as the schedule's footnote says —
// and on that one alone: USDC, which the catalogue does carry, pays the full rate.
// EURC itself is not in the catalogue today, so this is a rule waiting for a line.
const EU_FREE_COINS = new Set(["EURC"]);

// What the British company will not sell. The catalogue carries no preferred
// share, closed-end fund or partnership as a type of its own, so the list it can
// act on is the three exchange-traded products.
const UK_BARRED = new Set(["ETF", "ETC", "ETN"]);

const REMARK_EQUITY = "Free under $500 and 50 shares.";
const REMARK_UK = `FX ${(UK_FX_WEEKDAY * 100).toFixed(2)}% if converted.`;

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
const rows = Array.isArray(catalogue) ? catalogue : catalogue.rows || [];
const spreads = JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const cryptoBase = (ticker) => String(ticker || "").split(/[/:_-]/)[0].toUpperCase();
const isOverTheCounter = (row) => /^(OTC|PINK)/i.test(String(row?.exchange || ""));
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));

const catPerShare = (otc) => (otc ? CAT_OTC_PER_SHARE : CAT_PER_SHARE);
// TAF on the sell, CAT on both legs.
const perShareFees = (otc) => TAF_PER_SHARE + 2 * catPerShare(otc);

// Rounded up to the penny, as the schedule says of the SEC fee alone.
const up = (value, step) => Math.ceil(value / step - 1e-9) * step;
// The other two round to the nearest penny, and to zero below one — which is not
// the same thing as rounding to nearest, and is what makes a small order free.
const penny = (value) => (value < 0.01 ? 0 : Math.round(value * 100) / 100);

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked) return true;
    return isCrypto(r) && loose(cryptoBase(r.ticker)) === asked;
  });

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(place))) {
    return { named, matches: [{ row: crypto[0], venue: null }] };
  }

  const matches = named
    .filter((r) => !isCrypto(r))
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "USD").toUpperCase() === wantCurrency);

  return { named, matches };
}

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, otc: 0 });
    slot.n += 1;
    if (isOverTheCounter(r)) slot.otc += 1;
    if (isCrypto(r)) continue;
    const { venue } = listingKey(r);
    const leaf =
      venue?.mic &&
      spreads[String(r.isin || "").toUpperCase()]?.[venue.mic]?.[String(r.currency || "USD").toUpperCase()];
    if (leaf?.bp != null || leaf?.perShare != null) slot.withBook += 1;
  }
  return out;
}

export function roundTripCost({
  etf,
  place,
  currency,
  nat = "",
  entity = null,
  bp = null,
  perShare = null,
  commission = COMMISSION_RATE,
  weekend = false,
  isa = false,
}) {
  const who = entity || entityOf(nat);
  const european = who === "eu";
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    // The European token pays no regulator, so there is nothing per share at all.
    b: european ? 0 : Number(perShareFees(false).toPrecision(6)),
    c: 0,
    ccy: QUOTE,
    floor: null,
    cap: european
      ? null
      : {
          term: "b",
          part: "FINRA TAF",
          amount: TAF_CAP,
          fromShares: Math.ceil(TAF_CAP / TAF_PER_SHARE),
          per: "exécution",
        },
    entity: who,
    entityName: ENTITY_NAME[who],
    etf,
    place,
    currency,
  };

  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Robinhood` };

  const cryptoRow = named.find(isCrypto);
  if (cryptoRow && (!place || /crypto/i.test(place))) return cryptoCost(cryptoRow, answer, who);

  // A line absent from Robinhood Europe's token list is not sold by the European
  // company at all. `onlineBuy: false` drops the row rather than pricing a trade
  // that cannot be placed.
  if (european && matches.some((m) => m.row.usOnly) && !matches.some((m) => !m.row.usOnly)) {
    return {
      ...answer,
      onlineBuy: false,
      why: `${etf} n'est pas un Classic Stock Token : Robinhood Europe ne le vend pas`,
    };
  }

  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Robinhood`,
      alternatives: named
        .map((r) => `${r.ticker || r.isin} ${r.currency || "USD"} @ ${r.exchange || "place non dite"}`)
        .slice(0, 12),
    };
  }

  const m = matches[0];
  const otc = isOverTheCounter(m.row);
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "USD").toUpperCase(),
    otc,
  };

  // Robinhood U.K. sells American shares and ADRs and very little else. Its help
  // centre rules out exchange-traded funds outright — PRIIPs wants a key
  // information document that an American fund does not publish — along with
  // closed-end funds, partnerships, royalty trusts, units and preferred shares.
  // Only "ETF" is named there; that ETCs and ETNs fall with them is this file's
  // reading of the same KID rule, which reaches every packaged product, and not a
  // sentence anyone published. An ISA is narrower again, US-listed shares and ADRs
  // only, so the over-the-counter lines go too.
  if (who === "uk") {
    const type = String(m.row.type || "").toUpperCase();
    if (UK_BARRED.has(type)) {
      return {
        ...answer,
        listing,
        onlineBuy: false,
        why: `Robinhood U.K. ne vend pas d'${type} : pas de KID au sens PRIIPs`,
      };
    }
    if (isa && otc) {
      return {
        ...answer,
        listing,
        onlineBuy: false,
        why: `l'ISA de Robinhood U.K. ne prend que les titres cotés en bourse américaine et les ADR`,
      };
    }
  }

  const leaf = (listing.mic && spreads[listing.isin]?.[listing.mic]?.[listing.currency]) || null;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const fees = perShareFees(otc);
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => x,
  });

  // An ISA is sterling only, so its conversion is not a choice and joins `a`. A
  // general British account can hold dollars, and a European account never can.
  const ukFx = weekend ? UK_FX_WEEKEND : UK_FX_WEEKDAY;
  const forced = european ? 2 * EU_FX_EACH_WAY : who === "uk" && isa ? 2 * ukFx : 0;

  return {
    ...answer,
    a: european
      ? finite(plus(forced, mkt.a), 4)
      : finite(plus(SEC_RATE, 2 * commission, forced, mkt.a), 4),
    b: european ? finite(mkt.b, 6) : finite(plus(fees, mkt.b), 6),
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? null,
    basis:
      bp || perShare
        ? "imposé"
        : marketBp != null || marketPerShare != null
          ? "publié"
          : "frais seuls",
    waivers: european
      ? null
      : {
          secFreeUpto: SEC_FREE_UPTO,
          tafFreeUptoShares: TAF_FREE_UPTO_SHARES,
          pennyFloor: 0.01,
        },
    fees: european
      ? {
          fxEachWay: EU_FX_EACH_WAY,
          commissionOfAmountEachWay: 0,
          secOfAmount: 0,
          tafPerShare: 0,
          catPerShareEachWay: 0,
          otc,
          schedule: SCHEDULE,
        }
      : {
          secOfAmount: SEC_RATE,
          tafPerShare: TAF_PER_SHARE,
          catPerShareEachWay: catPerShare(otc),
          commissionOfAmountEachWay: commission,
          clearingPerShare: 0,
          fxEachWay: who === "uk" ? ukFx : 0,
          otc,
          schedule: SCHEDULE,
        },
    confidence: confidenceOf({
      market: marketBp ?? marketPerShare,
      match: m,
      touchWide: (marketPerShare ?? 0) > 0.01,
      commission,
      otc,
      type: listing.type,
      entity: who,
      ukFx,
      isa,
    }),
    // The European conversion is inside `a`: it is not an "if".
    fxIfConverted: who === "uk" && !isa ? 2 * ukFx : null,
    measured: null,
    remark: european ? "" : who === "uk" ? REMARK_UK : REMARK_EQUITY,
  };
}

function cryptoCost(row, answer, who) {
  const ticker = String(row.ticker || "").toUpperCase();
  const listing = {
    isin: null,
    ticker: row.ticker,
    name: row.name,
    type: "CRYPTO",
    mic: null,
    exchange: who === "eu" ? "Robinhood Europe (crypto)" : "Robinhood Crypto",
    // The European account holds euros and nothing else, and the tickets quote the
    // coin in euros, so the catalogue's dollar is the American book's and not this
    // one's.
    currency: who === "eu" ? "EUR" : String(row.currency || "USD").toUpperCase(),
  };
  // A coin has no currency of its own: what the column names is the cash the
  // account settles in. The European company holds euros and the American one
  // dollars, and the catalogue, which was read from the American book, says
  // dollars for both.
  const cashCurrency = who === "eu" ? "EUR" : "USD";

  // Robinhood UK has no crypto arm. Its fee schedule names stocks, options and
  // futures and stops there, so the row is withdrawn rather than priced.
  if (who === "uk") {
    return {
      ...answer,
      listing,
      feeMarket: "crypto",
      onlineBuy: false,
      why: "Robinhood U.K. Ltd ne vend pas de crypto",
    };
  }

  if (who === "eu") return euCryptoCost(row, answer, listing, ticker, cashCurrency);

  const tier = CRYPTO_TIERS[0];
  return {
    ...answer,
    a: Number((CRYPTO_MARKET_MAKER * 2).toPrecision(4)),
    b: 0,
    c: 0,
    floor: null,
    cap: null,
    listing,
    cashCurrency,
    feeMarket: "crypto",
    remark: "",
    parts: {
      marketMakerEachWay: CRYPTO_MARKET_MAKER,
      exchangeTakerEachWay: tier.taker,
      exchangeMakerEachWay: tier.maker,
    },
    bp: Number((CRYPTO_MARKET_MAKER * 2 * 1e4).toFixed(0)),
    perShare: null,
    url: SCHEDULE.crypto,
    basis:
      `0,95 % par jambe, barème Robinhood Crypto du ${SCHEDULE.cryptoFrom} : ` +
      `routage teneur de marché (défaut de l'app, aucun frais affiché, 0,95 $ par 100 $ reversés à Robinhood) ` +
      `ou routage bourse, premier palier sous 10 000 $ de volume 30 jours, taker 0,95 %`,
    fees: {
      marketMakerEachWay: CRYPTO_MARKET_MAKER,
      takerEachWay: tier.taker,
      makerEachWay: tier.maker,
      secOfAmount: 0,
      tafPerShare: 0,
      tiers: CRYPTO_TIERS,
      schedule: SCHEDULE,
    },
    confidence:
      `les deux routages coûtent le même 0,95 % par jambe à un petit compte, ce qui donne 1,90 % l'aller-retour. ` +
      `Le défaut de l'app n'affiche aucun frais : le chiffre vient de la page de routage de Robinhood, ` +
      `qui dit recevoir 0,95 $ par 100 $ de notionnel du teneur de marché. À lire comme un plancher, ` +
      `puisque c'est ce que Robinhood touche et non tout l'écart payé. ` +
      `Le carnet Binance / Coinbase n'est pas ajouté : la traversée est déjà dedans. ` +
      `Aucun aller-retour réel, barème lu le ${SCHEDULE.readOn}`,
    fxIfConverted: null,
    measured: null,
  };
}

function euCryptoCost(row, answer, listing, ticker, cashCurrency) {
  const free = EU_FREE_COINS.has(ticker);
  const minUsd = toUsd(EU_CRYPTO_MIN_EUR, "EUR");
  // Commission both ways, plus the crossing, which is taken once and on the buy.
  const all = 2 * EU_CRYPTO_EACH_WAY + EU_CRYPTO_MARKUP;
  return {
    ...answer,
    a: free ? 0 : Number(all.toPrecision(4)),
    b: 0,
    c: 0,
    // One cent a leg, so two on the trip. It bites under four euros and nowhere
    // else, which is why it is a floor and not a `c`.
    floor: free || minUsd == null ? null : { amount: Number((minUsd * 2).toFixed(4)), per: "aller-retour" },
    cap: null,
    listing,
    cashCurrency,
    feeMarket: "crypto",
    remark: free ? "0% if buy with eur." : "",
    parts: {
      eachWay: free ? 0 : EU_CRYPTO_EACH_WAY,
      markup: free ? 0 : EU_CRYPTO_MARKUP,
      minEur: free ? 0 : EU_CRYPTO_MIN_EUR,
    },
    bp: free ? 0 : Number((all * 1e4).toFixed(0)),
    perShare: null,
    url: SCHEDULE.eu,
    basis:
      free
        ? `barème Robinhood Europe : l'EURC est exempté, achat comme vente`
        : `0,50 % par transaction au barème Robinhood Europe, plus 1,00 % pris dans le prix à l'achat, mesuré`,
    fees: {
      eachWay: free ? 0 : EU_CRYPTO_EACH_WAY,
      markup: free ? 0 : EU_CRYPTO_MARKUP,
      minEur: EU_CRYPTO_MIN_EUR,
      freeCoins: [...EU_FREE_COINS],
      stakingOfRewards: 0.15,
      schedule: SCHEDULE,
    },
    confidence: free
      ? `l'EURC est gratuit à l'achat et à la vente chez Robinhood Europe, comme le dit la note du barème ` +
        `(${SCHEDULE.euOn}). Reste l'écart du carnet, que ce fichier ne chiffre pas pour un jeton à 1,0000`
      : `1,00 % de commission sur l'aller-retour, plus 1,00 % pris dans le prix d'achat : 2,00 % en tout, ` +
        `soit à peu près le coût américain et non la moitié. Le barème n'annonce que la première moitié. ` +
        `Aller-retour réel sur BTC le ${EU_CRYPTO_CHECK.on} : ${EU_CRYPTO_CHECK.spent} € ont acheté ` +
        `${EU_CRYPTO_CHECK.got} BTC quand l'écran affichait ${EU_CRYPTO_CHECK.askShown} €, soit un prix payé de ` +
        `${EU_CRYPTO_CHECK.effective} € — 1,0003 % au-dessus. La vente une minute plus tard est partie au prix ` +
        `affiché à 0,0005 % près, commission comprise et rien d'autre : la marge est entière sur l'achat. ` +
        `Aller-retour constaté 1,98 % à prix constant. Minimum 1 centime, il ne mord que sous 2 €`,
    fxIfConverted: null,
    measured: free ? null : EU_CRYPTO_CHECK,
  };
}

export function exactCost({
  shares,
  price,
  bp = null,
  perShare = null,
  commission = COMMISSION_RATE,
  otc = false,
  crypto = false,
  entity = "us",
  ticker = "",
  weekend = false,
  isa = false,
}) {
  const proceeds = shares * price;
  const market = ((bp ?? 0) / 1e4) * proceeds + (perShare ?? 0) * shares;

  if (crypto) {
    if (entity === "uk") return { routed: null, market: null, alone: null, marginal: null };
    if (entity === "eu") {
      const free = EU_FREE_COINS.has(String(ticker).toUpperCase());
      const minUsd = toUsd(EU_CRYPTO_MIN_EUR, "EUR") ?? 0;
      // The minimum is per transaction, so each leg meets it on its own. The
      // crossing rides on the buy alone, and it is inside the price rather than
      // billed, so it joins `market` and not `routed`.
      const leg = free ? 0 : Math.max(proceeds * EU_CRYPTO_EACH_WAY, minUsd);
      const fee = 2 * leg;
      const crossed = market + (free ? 0 : proceeds * EU_CRYPTO_MARKUP);
      return {
        routed: Number(fee.toFixed(6)),
        market: Number(crossed.toFixed(4)),
        markup: free ? 0 : Number((proceeds * EU_CRYPTO_MARKUP).toFixed(4)),
        alone: Number((fee + crossed).toFixed(4)),
        marginal: Number((fee + crossed).toFixed(4)),
        atMinimum: !free && proceeds * EU_CRYPTO_EACH_WAY < minUsd,
      };
    }
    const fee = 2 * proceeds * CRYPTO_MARKET_MAKER;
    return {
      routed: Number(fee.toFixed(6)),
      market: Number(market.toFixed(4)),
      alone: Number((fee + market).toFixed(4)),
      marginal: Number((fee + market).toFixed(4)),
    };
  }

  if (entity === "eu") {
    const fx = 2 * proceeds * EU_FX_EACH_WAY;
    return {
      sec: 0,
      taf: 0,
      cat: 0,
      fx: Number(fx.toFixed(6)),
      commission: 0,
      market: Number(market.toFixed(4)),
      alone: Number((fx + market).toFixed(4)),
      marginal: Number((fx + market).toFixed(4)),
      waived: { sec: true, taf: true, cat: true },
    };
  }

  // Both waivers read the sale, which is one leg of the trip.
  const sec = proceeds <= SEC_FREE_UPTO ? 0 : up(proceeds * SEC_RATE, 0.01);
  const taf = shares <= TAF_FREE_UPTO_SHARES ? 0 : penny(Math.min(shares * TAF_PER_SHARE, TAF_CAP));
  const cat = penny(2 * shares * catPerShare(otc));
  const fee = 2 * proceeds * commission;
  const fx = entity === "uk" && isa ? 2 * proceeds * (weekend ? UK_FX_WEEKEND : UK_FX_WEEKDAY) : 0;

  return {
    sec: Number(sec.toFixed(6)),
    taf: Number(taf.toFixed(6)),
    cat: Number(cat.toFixed(6)),
    fx: Number(fx.toFixed(6)),
    commission: Number(fee.toFixed(6)),
    market: Number(market.toFixed(4)),
    alone: Number((sec + taf + cat + fee + fx + market).toFixed(4)),
    marginal: Number((sec + taf + cat + fee + fx + market).toFixed(4)),
    waived: {
      sec: proceeds <= SEC_FREE_UPTO,
      taf: shares <= TAF_FREE_UPTO_SHARES,
      cat: 2 * shares * catPerShare(otc) < 0.01,
    },
  };
}

const confidenceOf = ({ market, match, touchWide, commission, otc, type, entity, ukFx, isa }) => {
  const kind = type === "STOCK" ? "action" : type === "ETF" ? "fonds" : type || "titre";
  const base =
    entity === "eu"
      ? `Classic Stock Token de Robinhood Europe (${kind} sous-jacent) : un dérivé MiFID II émis à Vilnius, ` +
        `pas la part américaine. Aucune commission, aucun régulateur américain, ` +
        `${(EU_FX_EACH_WAY * 100).toFixed(2)} % de change à l'aller et au retour, soit ` +
        `${(EU_FX_EACH_WAY * 200).toFixed(2)} % l'aller-retour — inévitable, le compte étant en euros. ` +
        `Barème ${SCHEDULE.euOn}, lu le ${SCHEDULE.readOn}. ` +
        `Le jeton se traite du lundi au samedi en continu : hors séance américaine, ` +
        `le marché de référence est plus mince que la moyenne 605 ci-dessous`
      : `frais lus au barème ${entity === "uk" ? "Robinhood U.K." : "Robinhood Financial"} (${kind}` +
        (otc ? ", OTC : CAT à 0,00000003 $ la part" : "") +
        `), commission nulle sur les titres américains` +
        (commission ? `, commission de ${(commission * 100).toFixed(2)} % par jambe imposée` : "") +
        (entity === "uk"
          ? `, plus ${(ukFx * 100).toFixed(2)} % de change entre les poches livre et dollar` +
            (isa ? `, inévitable en ISA donc compté dans a` : `, évitable en gardant des dollars donc hors de a`)
          : "") +
        `. SEC en vigueur depuis le ${SCHEDULE.secFrom}, TAF depuis le ${SCHEDULE.tafFrom}, lus le ${SCHEDULE.readOn}. ` +
        `Deux dispenses que la forme affine ne peut pas porter : pas de SEC sous ${SEC_FREE_UPTO} $ de vente, ` +
        `pas de TAF à ${TAF_FREE_UPTO_SHARES} parts ou moins, et le CAT tombe à zéro sous le centime — ` +
        `un petit ordre ne paie donc rien du tout, et a et b le surestiment. Aucun aller-retour réel`;
  if (market == null) {
    return (
      `${base}. Aucun carnet : ${match.unsourced?.name || "cette place"}, ` +
      `${match.unsourced?.why || "pas de source 605"}. À lire comme un plancher`
    );
  }
  return (
    `${base}. Spread effectif publié : moyenne mensuelle sur les ordres immédiats de 100 à 499 ` +
    `parts, cinq teneurs, Citadel et Virtu manquants` +
    (touchWide
      ? `. ATTENTION carnet large : sous 100 parts, l'amélioration de prix que ce chiffre ` +
        `contient n'a pas lieu. Pour un lot rompu, passer la touche cotée en \`perShare\``
      : "")
  );
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = argv.filter((a) => !a.startsWith("--"));

  if (argv.includes("--schedule")) {
    console.log(`barème Robinhood, lu le ${SCHEDULE.readOn}`);
    console.log(`  titres US  ${SCHEDULE.source}`);
    console.log(`  titres UK  ${SCHEDULE.uk}`);
    console.log(`  Europe     ${SCHEDULE.eu}`);
    console.log(`  crypto US  ${SCHEDULE.crypto}`);
    console.log(`  routage    ${SCHEDULE.routing}\n`);
    console.log("  trois sociétés, la résidence décide :");
    console.log(`    US   ${ENTITY_NAME.us} — la part américaine`);
    console.log(`    GB   ${ENTITY_NAME.uk} — la même part, plus le change`);
    console.log(`    EEE  ${ENTITY_NAME.eu} — un Classic Stock Token, dérivé MiFID II\n`);
    console.log("  États-Unis et Royaume-Uni, actions, ETF, ETN, ETC et OTC :");
    console.log(`    commission     0`);
    console.log(`    SEC            ${SEC_RATE} du montant, à la vente seule, arrondi au centime supérieur`);
    console.log(`                   dispensée sous ${SEC_FREE_UPTO} $ de vente, en vigueur depuis le ${SCHEDULE.secFrom}`);
    console.log(`    FINRA TAF      ${TAF_PER_SHARE} par part, à la vente seule, plafond ${TAF_CAP} $`);
    console.log(`                   dispensée à ${TAF_FREE_UPTO_SHARES} parts ou moins, en vigueur depuis le ${SCHEDULE.tafFrom}`);
    console.log(`    CAT            ${CAT_PER_SHARE} par part cotée, ${CAT_OTC_PER_SHARE.toFixed(8)} par part OTC, aux deux jambes`);
    console.log(`    arrondi        SEC au centime supérieur ; TAF et CAT au centime le plus proche, à 0 sous le centime`);
    console.log(`    change UK      ${UK_FX_WEEKDAY} en semaine, ${UK_FX_WEEKEND} du vendredi 17 h à New York au dimanche`);
    console.log(`                   entre les poches livre et dollar ; inévitable en ISA, qui est en livres seules`);
    console.log(`\n  Europe, Classic Stock Tokens (${SCHEDULE.euOn}) :`);
    console.log(`    commission     0, et aucun régulateur américain : c'est un dérivé, pas une part`);
    console.log(`    change         ${EU_FX_EACH_WAY} de la valeur en euros par ordre, aux deux sens, inévitable`);
    console.log(`    crypto         ${EU_CRYPTO_EACH_WAY} par transaction, minimum ${EU_CRYPTO_MIN_EUR} €, ${[...EU_FREE_COINS].join(" / ")} exempté`);
    console.log(`                   plus ${EU_CRYPTO_MARKUP} pris dans le prix à l'achat, hors barème, mesuré le ${EU_CRYPTO_CHECK.on}`);
    console.log(`    staking        15 % des récompenses`);
    console.log(`    perpétuels     0,02 % maker / 0,02 % taker, plus 0,02 % de place — pas au catalogue`);
    console.log(`\n  crypto américaine, depuis le ${SCHEDULE.cryptoFrom}, deux routages :`);
    console.log(`    teneur de marché  aucun frais affiché, ${CRYPTO_MARKET_MAKER} par jambe dans le prix (0,95 $ par 100 $)`);
    console.log(`    bourse            EDX / Bitstamp, taker puis maker par volume 30 jours :`);
    for (const t of CRYPTO_TIERS) {
      const upto =
        t.upto === Infinity
          ? "au-delà"
          : t.upto >= 1e6
            ? `jusqu'à ${t.upto / 1e6} M$`
            : `jusqu'à ${t.upto / 1e3} k$`;
      console.log(`      ${upto.padEnd(18)} ${(t.taker * 100).toFixed(3)} %   ${(t.maker * 100).toFixed(3)} %`);
    }
    console.log(`\n  ce que le Royaume-Uni refuse : ${[...UK_BARRED].join(", ")} (PRIIPs, pas de KID), la crypto,`);
    console.log(`    les fonds fermés, sociétés en commandite, royalty trusts, units et actions de préférence`);
    console.log(`    l'ISA se limite aux titres cotés en bourse américaine et aux ADR, donc sans l'OTC`);
    console.log(`  hors sujet ici : options ${0.5} $ le contrat (${0.35} $ en Gold), marge 5,00 % sous 50 000 $`);
    console.log(`  non modélisé : droits de garde ADR, prélevés par la banque dépositaire et variables`);
    console.log(`  pas au catalogue : options, contrats à terme`);
    const cover = coverage();
    if (cover) {
      const euLines = rows.filter((r) => !r.usOnly).length;
      console.log("\n  catalogue :");
      for (const [type, row] of Object.entries(cover)) {
        const extra = type === "CRYPTO" ? "" : `, ${row.withBook} avec carnet 605, ${row.n - row.withBook} frais seuls`;
        const otc = row.otc ? `, dont ${row.otc} OTC` : "";
        console.log(`    ${String(type).padEnd(6)} ${row.n} lignes${extra}${otc}`);
      }
      console.log(`    dont ${euLines} vendues par Robinhood Europe, ${rows.length - euLines} par les seules US et UK`);
    }
    process.exit(0);
  }

  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node robinhood/robinhood_cost.mjs <ticker|ISIN> [place] [devise]\n" +
        "        [--nat=FR] [--entity=us|uk|eu] [--isa] [--weekend] [--shares=n] [--price=p] [--json] [--schedule]\n" +
        "  ex.   node robinhood/robinhood_cost.mjs AAPL NASDAQ USD --shares=1 --price=230\n" +
        "        node robinhood/robinhood_cost.mjs AAPL --nat=FR    (Classic Stock Token)\n" +
        "        node robinhood/robinhood_cost.mjs AAPL --nat=GB --isa\n" +
        "        node robinhood/robinhood_cost.mjs BTC --nat=FR"
    );
    process.exit(1);
  }

  const commission = arg("commission") != null ? Number(arg("commission")) : COMMISSION_RATE;
  const nat = arg("nat") || "";
  const weekend = argv.includes("--weekend");
  const isa = argv.includes("--isa");
  const answer = roundTripCost({
    etf,
    place,
    currency,
    nat,
    entity: arg("entity"),
    bp: arg("bp") != null ? Number(arg("bp")) : null,
    perShare: arg("perShare") != null ? Number(arg("perShare")) : null,
    commission,
    weekend,
    isa,
  });

  if (argv.includes("--json")) {
    console.log(JSON.stringify(answer, null, 2));
    process.exit(answer.a == null ? 1 : 0);
  }

  // A null `a` on a listing that was found is not a failure: OTC has no
  // consolidated book, so the market term is unknown and stays unknown. Only a
  // listing that was never found has nothing to print.
  if (!answer.listing || answer.onlineBuy === false) {
    console.error(answer.why);
    if (answer.alternatives?.length) console.error(`  ailleurs : ${answer.alternatives.join(", ")}`);
    process.exit(1);
  }

  const show = (x) => (x == null ? "N/A" : x);
  const l = answer.listing;
  const crypto = l.type === "CRYPTO";
  const eu = answer.entity === "eu";
  console.log(`${l.ticker || l.isin} — ${l.name || "sans nom"}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}`);
  console.log(`${answer.entityName}${nat ? `, résidence ${nat.toUpperCase()}` : ""}\n`);
  const marketA = answer.bp != null ? ` + ${answer.bp} bp de carnet` : "";
  const marketB = answer.perShare != null ? ` + ${answer.perShare} de spread effectif` : "";
  const ukFxInA = answer.entity === "uk" && isa ? ` + change ${weekend ? UK_FX_WEEKEND : UK_FX_WEEKDAY} aux deux jambes` : "";
  console.log(
    `a = ${show(answer.a)}   (au prorata : ${
      crypto
        ? eu
          ? `${answer.fees.eachWay} chaque sens${answer.fees.markup ? ` + ${answer.fees.markup} dans le prix à l'achat` : ""}`
          : `${CRYPTO_MARKET_MAKER} chaque sens, dans le prix`
        : eu
          ? `change ${EU_FX_EACH_WAY} aux deux jambes${marketA}`
          : `frais SEC ${SEC_RATE}${commission ? ` + commission ${commission} aux deux jambes` : ""}${ukFxInA}${marketA}`
    })`
  );
  console.log(
    `b = ${show(answer.b)}   (par part : ${
      crypto
        ? "rien"
        : eu
          ? `aucun régulateur américain${marketB}`
          : `CAT ${answer.fees.catPerShareEachWay.toFixed(8)} aux deux jambes + TAF ${TAF_PER_SHARE} à la vente${marketB}`
    })`
  );
  console.log(`c = ${answer.c}   (par ordre : ${crypto ? "rien, le taux est dans a" : "aucune commission"})`);
  console.log(`\ncoût = ${show(answer.a)} × p × n + ${show(answer.b)} × n + ${answer.c}   (${answer.basis})`);
  if (answer.waivers) {
    console.log(
      `  dispenses : pas de SEC sous ${answer.waivers.secFreeUpto} $ de vente, ` +
        `pas de TAF à ${answer.waivers.tafFreeUptoShares} parts ou moins, TAF et CAT à 0 sous le centime`
    );
  }
  if (answer.floor?.amount != null) {
    console.log(`  plancher ${answer.floor.amount} ${answer.ccy} par ${answer.floor.per}`);
  }
  if (answer.fxIfConverted) {
    console.log(`  change ${answer.fxIfConverted} l'aller-retour si converti, hors de a`);
  }
  console.log(`  ${answer.confidence}`);
  if (answer.url) console.log(`\n${answer.url}`);

  const shares = arg("shares") != null ? Number(arg("shares")) : null;
  const price = arg("price") != null ? Number(arg("price")) : null;
  if (shares && price) {
    const exact = exactCost({
      shares,
      price,
      bp: answer.bp,
      perShare: answer.perShare,
      commission,
      otc: l.otc,
      crypto,
      entity: answer.entity,
      ticker: l.ticker,
      weekend,
      isa,
    });
    const affine = plus(times(answer.a, price, shares), times(answer.b, shares), answer.c);
    console.log(`\n${shares} part${shares > 1 ? "s" : ""} à ${price} ${l.currency} :`);
    console.log(`  formule affine            ${affine == null ? "N/A" : affine.toFixed(4)} ${l.currency}`);
    if (crypto) {
      console.log(
        `  ${eu ? `commission ${answer.fees.eachWay} × 2` : `routage ${CRYPTO_MARKET_MAKER} × 2`}   ${exact.routed} ${l.currency}` +
          (exact.atMinimum ? "   (au minimum du centime)" : "")
      );
      if (exact.markup) {
        console.log(`  marge ${EU_CRYPTO_MARKUP} sur l'achat   ${exact.markup} ${l.currency}`);
      }
    } else {
      // A book that was never read is not a book worth nothing: say so rather than
      // print the zero `exactCost` had to use to add the fees up.
      const known = answer.bp != null || answer.perShare != null;
      console.log(
        `  ${known ? "coût exact, arrondis compris" : "frais seuls, arrondis compris"} ${exact.alone.toFixed(4)} ${l.currency}`
      );
      console.log(
        `  dont marché ${known ? exact.market.toFixed(4) : "N/A"}` +
          (eu
            ? `, change ${exact.fx}`
            : `, SEC ${exact.sec}, TAF ${exact.taf}, CAT ${exact.cat}${exact.fx ? `, change ${exact.fx}` : ""}`)
      );
      if (!eu) {
        const off = Object.entries(exact.waived)
          .filter(([, yes]) => yes)
          .map(([name]) => name.toUpperCase());
        if (off.length) console.log(`  dispensé : ${off.join(", ")}`);
      }
    }
  }
}
