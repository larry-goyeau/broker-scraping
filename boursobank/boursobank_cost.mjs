// What one round trip costs at BoursoBank: buy n shares at price p, sell them
// back at once. `roundTrip(...)` returns the whole bill in dollars, and
// `brokerFees` the part BoursoBank keeps.
//
// Brochure tarifaire, tarifs applicables au 4 septembre 2026 (TTC), read
// 2026-09-14. Four forfaits price Euronext Paris / Amsterdam / Bruxelles and
// the Horaires Étendus session. Foreign markets share two cards that do not
// depend on the forfait at all. Default is Découverte, which costs nothing a
// month. Classic is marked « Uniquement CTO ».
//
//   Découverte       1,99 € up to 500 €,    then 0,60 %
//   Classic          5,50 € up to 1 000 €,  then 0,48 % (min 8,95 €)
//   Trader          16,65 € up to 7 750 €,  then 0,22 %
//   Ultimate Trader  9,90 € up to 10 000 €, then 0,12 %
//   Bourses américaines  6,95 € up to 6 000 €, then 0,12 %   (every forfait)
//   Bourses européennes 11,95 € up to 4 000 €, then 0,30 %   (Xetra, Milan,
//                        Madrid, Zurich, Lisbonne, Londres, Euronext non-euro)
//
// The ticket is a step and not a floor, which is why this file no longer
// answers in a, b, c: at 500 € Découverte bills 1,99 € and at 501 € it bills
// 3,01 €, so the fee falls as the order grows and no affine form can say it.
// The commission is computed for the size asked and for each side.
//
// Custody is free, the monthly subscription is free on Découverte, and the
// account is euro-only, so a line quoted in anything else is converted twice:
// « Taux de change J+1 + 0,0025 points ». The points are absolute on the rate,
// so the margin is 0,0025 divided by the price of a euro in the listing
// currency — near 0,22 % on the dollar, near 0,29 % on the pound.
//
// A purchase under the brochure's minimum is refused rather than priced:
// 20 € on a share, and 200 € on an ETF whatever the account. That floor is the
// reason a small ETF ticket comes back N/A here and not zero.
//
// One live trip on 2026-09-09, CTO Découverte, one TTE, market both ways on
// Horaires étendus (22H). Buy 78.14, sell 78.06. Recap: 1,99 € ticket each
// way; buy FRAIS TOUT COMPRIS 2,30 € (TTF 0,31 € = 0,40 % of the fill); sell
// 1,99 € only. PRU after buy 80.44. Cash 500,00 → 419,56 → 495,63, so the
// trip cost 4,37 € of which 3,98 € is the two tickets and 0,31 € the tax. The
// eight cents of book are not folded in: the board still showed the 17:35
// Euronext close. Classic, Trader, Ultimate, the American card and the
// European one were not traded.
//
// The rest was read off order tickets carried to the confirmation screen and
// abandoned there, which prints the all-in fee and costs nothing. A control on
// the same TTE reproduced this file to the cent, then: a Nasdaq ticket priced
// the American card at 6,95 € and the conversion at 0,220 %, which is what
// fixed the reading above; a London ticket priced the European card at 11,95 €
// and, on a currency trading below the euro, billed the same 0,0025 point as
// 0,298 % where the dollar had paid 0,221 % — two screens matched to the cent
// by absolute points and missed by any flat percentage; three Paris trackers
// all paid the full Euronext ticket, none of them free — and none of them on
// the Boursomarkets list, which turned out to be published as a ranking and is
// now read into `boursomarkets.json`: 171 partner trackers, 147 of them in this
// catalogue, brokered at nothing on both sides, one of which was checked on a
// recap and printed 0,00 €; and a 50 € tracker was
// refused in the bank's own words for the 200 € floor. The selling side, where
// the American regulatory levies sit, was never shown.
//
// One caveat on those recaps: the euro amount they print is padded by about
// 2 % over the market rate, a provisioning cushion rather than a charge, and
// the fees are struck on the padded figure. The rates used here are mid.
//
//   https://www.boursobank.com/content/brochure_tarifaire/boursorama_bt.pdf
//
//   node boursobank/boursobank_cost.mjs TTE --shares=10 --price=78
//   node boursobank/boursobank_cost.mjs IWDA EURONEXT EUR --shares=10 --price=100
//   node boursobank/boursobank_cost.mjs MC EURONEXT EUR --shares=5 --price=600 --plan=trader
//   node boursobank/boursobank_cost.mjs MEDP NASDAQ USD --shares=1 --price=300
//   node boursobank/boursobank_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("boursobank-parsed.json", import.meta.url);
const PARTNERS_FILE = new URL("boursomarkets.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.boursobank.com/content/brochure_tarifaire/boursorama_bt.pdf",
  help: "https://www.boursobank.com/aide-en-ligne/bourse/comment-investir-en-bourse/fonctionnement-de-la-bourse/question/quels-sont-les-frais-de-courtage-chez-boursobank-17227195",
  readOn: "2026-09-14",
  effective: "2026-09-04",
  entity: "BoursoBank (Boursorama, FR)",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const PTM = { each: 1.5, currency: "GBP", above: 10000 };
const UK_REGISTERED = /^(GB|GG|JE|IM)/;

// « Taux de change J+1 + 0,0025 points ». The points are absolute on the rate
// and not a percentage of the amount, which the recap settles: a Nasdaq ticket
// of 225 $US was priced at 198,68 € and billed 0,44 € of conversion, which is
// 0,0025 over a rate of 1,135 dollars to the euro — 0,220 %. A flat 0,25 %
// would have billed 0,50 € and the screen would have read 7,45 € instead of
// 7,39 €. So the margin bites harder on a currency that trades below the euro
// than on one above it, and no single percentage can stand for all of them.
const FX_POINTS = 0.0025;
const PEA_CAP = 0.005;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const DEFAULT_PLAN = "decouverte";

// Brochure p. 23, « Montant d'ordre minimum à l'achat ». Two columns per
// account for Boursomarkets and the rest; they only differ on funds, so the
// figure kept here is the one that binds a share or an ETF.
const MIN_ORDER = {
  etf: { cto: 200, pea: 200 },
  euronext: { cto: 20, pea: 100 },
  europe: { cto: 20, pea: 2500 },
  us: { cto: 20, pea: null },
};

// Neither is part of a round trip, but both are what a reader asks next.
const SWITCH_FEE = { amount: 119, currency: "EUR", free: "un changement par année civile" };
const TRANSFER = { france: 17.85, abroad: 29.8, pea: { each: 15, cap: 150 }, currency: "EUR" };

const CHECK = {
  isin: "FR0000120271",
  ticker: "TTE",
  venue: "22H",
  n: 1,
  buy: 78.14,
  sell: 78.06,
  commissionEach: 1.99,
  feesBuyAllIn: 2.3,
  ttf: 0.31,
  pruAfterBuy: 80.44,
  cash: { start: 500, afterBuy: 419.56, end: 495.63 },
  trip: 4.37,
  on: "2026-09-09",

  // Order tickets carried to the confirmation screen and abandoned there. That
  // panel prints « FRAIS TOUT COMPRIS », the only place the bank itemises a
  // trade before it is sent, so these cost nothing and still read the card.
  // The control first: TotalEnergies at 80 € came back at 1,99 € of commission
  // and 2,31 € all in, the missing 0,32 € being 0,4 % of French turnover tax —
  // the file reproduces the screen to the cent, so the screen can be trusted
  // on the lines where the file was guessing.
  recap: {
    on: "2026-09-15",
    control: { ticker: "TTE", amountEur: 80, commission: 1.99, allIn: 2.31 },
  },
  uk: {
    ticker: "PRU",
    venue: "LSE",
    notionalGbx: 18600,
    amountEur: 221.64,
    commission: 11.95,
    allIn: 13.72,
    stampEur: 1.11,
    fxEur: 0.66,
  },
  us: {
    ticker: "MEDP",
    venue: "NASDAQ",
    notional: 225,
    amountEur: 198.68,
    commission: 6.95,
    allIn: 7.39,
    fxEur: 0.44,
  },
  // No transaction tax and no conversion on a Paris tracker, yet the all-in
  // runs above the ticket by an amount that changes with the fund: it is the
  // product's own entry cost from its key information document, not a charge
  // the bank keeps. `spread.json` already carries that cost, so counting the
  // gap here would count it twice. What matters is the commission column:
  // every one paid the full Euronext ticket, none went free.
  etfs: [
    { ticker: "CC4", amountEur: 208.44, commission: 1.99, allIn: 2.38 },
    { ticker: "500", amountEur: 245.54, commission: 1.99, allIn: 2.36 },
    { ticker: "EEA", amountEur: 209.79, commission: 1.99, allIn: 3.0 },
  ],
  // The other end of the Boursomarkets list: a partner tracker, free.
  partner: { ticker: "AGED", amountEur: 207.0, commission: 0, allIn: 0.91 },
  // Refused before any confirmation screen, in the bank's own words.
  floor: { ticker: "B26A", amountEur: 50, message: "Le minimum de souscription sur cette valeur est de 200.0 euros" },
};

const PLANS = {
  decouverte: { id: "decouverte", label: "Découverte" },
  classic: { id: "classic", label: "Classic" },
  trader: { id: "trader", label: "Trader" },
  ultimate: { id: "ultimate", label: "Ultimate Trader" },
};

const PLAN_ALIAS = {
  decouverte: "decouverte",
  discovery: "decouverte",
  classic: "classic",
  trader: "trader",
  ultimate: "ultimate",
  ultimatetrader: "ultimate",
};

// min / upTo in EUR. Above `upTo` the fee is `rate` of the amount (Classic
// also has minAbove).
const EURONEXT_RULE = {
  decouverte: { min: 1.99, upTo: 500, rate: 0.006 },
  classic: { min: 5.5, upTo: 1000, rate: 0.0048, minAbove: 8.95 },
  trader: { min: 16.65, upTo: 7750, rate: 0.0022 },
  ultimate: { min: 9.9, upTo: 10000, rate: 0.0012 },
};

const OTHER_RULE = {
  us: { min: 6.95, upTo: 6000, rate: 0.0012 },
  europe: { min: 11.95, upTo: 4000, rate: 0.003 },
};

// What each forfait costs when it is not used enough, and what it demands to
// be opened at all. Ultimate is the odd one: the brochure reserves it to a PEA.
// `per`, `why` and `account` feed the confidence text and stay French; `en` is
// the one-line remark, which the shelf writes in English like every other.
const PLAN_STRINGS = {
  classic: {
    idle: 5.95,
    per: "mois",
    why: "aucun ordre exécuté dans le mois",
    account: "CTO uniquement",
    en: "5.95 €/month if no trade that month.",
  },
  trader: {
    idle: 5.95,
    per: "mois",
    why: "aucun ordre exécuté dans le mois",
    account: null,
    en: "5.95 €/month if no trade that month.",
  },
  ultimate: {
    idle: 119,
    per: "mois",
    why: "moins de 30 ordres exécutés dans le mois",
    account: "réservé à l'ouverture d'un PEA, PEA 18-25 ans ou PEA-PME, trois mois minimum",
    en: "119 €/month if under 30 trades that month.",
  },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isEtf = (listing) => String(listing?.type || "").toUpperCase() === "ETF";

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

// The brochure's thresholds are in euro and its PTM levy in pounds, so a line
// quoted in anything else is moved through the dollar. GBX is a hundredth of a
// pound and fx.mjs already knows it, which is why the pence line needs no
// special case here beyond not being GBP.
function convert(amount, from, to) {
  if (amount == null || Number.isNaN(amount)) return null;
  const src = String(from || "").toUpperCase();
  if (src === to) return amount;
  const usd = toUsd(amount, src);
  const per = usdPer(to);
  return usd == null || !(per > 0) ? null : usd / per;
}

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

// The conversion margin for one leg, as a fraction of the amount. GBX is a
// hundredth of a pound but settles in pounds, so the pence quote borrows the
// pound's rate rather than carrying a hundredfold smaller one.
export function fxMarginRate(currency) {
  const c = String(currency || "").toUpperCase() === "GBX" ? "GBP" : String(currency || "").toUpperCase();
  if (!c || c === "EUR") return 0;
  const perUsd = usdPer(c);
  const eurUsd = usdPer("EUR");
  if (!(perUsd > 0) || !(eurUsd > 0)) return null;
  const perEur = eurUsd / perUsd;
  return perEur > 0 ? FX_POINTS / perEur : null;
}

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

export function feeMarketOf(exchange, mic) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  if (US_MICS.has(m) || /^(NASDAQ|NYSE|AMEX|ARCA|BATS)$/.test(code)) return "us";
  if (
    /EURONEXTPARIS|EURONEXTAMSTERDAM|EURONEXTBRUXELLES|EURONEXTBRUSSELS/.test(code) ||
    ["XPAR", "XAMS", "XBRU"].includes(m)
  ) {
    return "euronext";
  }
  return "europe";
}

export function ruleOf(plan, market) {
  const p = planOf(plan);
  if (!p) return null;
  if (market === "euronext") return EURONEXT_RULE[p.id];
  return OTHER_RULE[market] || OTHER_RULE.europe;
}

export function commissionEach(amount, rule) {
  if (!rule || amount == null || !Number.isFinite(Number(amount))) return null;
  const n = Number(amount);
  if (n <= rule.upTo) return rule.min;
  let fee = n * rule.rate;
  if (rule.minAbove != null) fee = Math.max(rule.minAbove, fee);
  return fee;
}

/**
 * One side's commission in euro, at the step the brochure prints, and under
 * the PEA cap when the account is one. Says which of the two bit, because the
 * ticket and the percentage swap places at a size the reader can feel.
 */
// The Boursomarkets trackers, which the bank brokes at 0 € « à l'achat ou
// droits d'entrée » and « à la vente ou sortie ». Read once, and tolerated
// missing: without the list the file simply bills every tracker in full, which
// is what it did before the list existed.
const PARTNERS = (() => {
  try {
    const j = JSON.parse(fs.readFileSync(PARTNERS_FILE, "utf8"));
    return { on: new Set((j.entries || []).map((e) => e.isin)), at: j.generatedAt || null };
  } catch {
    return { on: new Set(), at: null };
  }
})();

export const isPartner = (isin) => PARTNERS.on.has(String(isin || "").toUpperCase());

export function commissionSide({ amount, market, plan = DEFAULT_PLAN, pea = false, partner = false }) {
  const rule = ruleOf(plan, market);
  if (!rule) return null;
  if (partner) {
    return { charged: 0, raw: 0, ticketed: true, capped: false, partner: true, currency: "EUR", rule };
  }
  const raw = commissionEach(amount, rule);
  if (raw == null) return null;
  const ticketed = amount <= rule.upTo;
  // « Les frais de courtage facturés aux clients sur les PEA, PEA 18-25 ans et
  // PEA-PME seront plafonnés à 0,5 % du montant total de l'ordre. »
  const cap = pea && market !== "us" ? Number(amount) * PEA_CAP : null;
  const capped = cap != null && cap < raw;
  return {
    charged: capped ? cap : raw,
    raw,
    ticketed,
    capped,
    currency: "EUR",
    rule,
  };
}

// The proportional transaction taxes on the purchase. The PTM levy is not one
// of them and taxMap.mjs no longer returns it: it is 1,50 £ per order, counted
// below against the brochure's own threshold.
function stampOf(tax) {
  const rates = taxRates(tax);
  const pct = Object.values(rates).reduce((s, r) => s + r, 0);
  return { pct, rates, known: tax?.known === true };
}

function remarkOf({ plan, market, listing, pea }) {
  const lines = [];
  const idle = PLAN_STRINGS[plan.id];
  if (idle) lines.push(idle.en);
  // The minimum order is not a fee but a refusal, and `roundTrip` already
  // answers N/A with the reason when an order falls under it. The account a
  // plan is tied to is spelled out in full in the confidence text.
  return lines.join("\n");
}

function minOrderOf({ market, listing, pea }) {
  const column = pea ? "pea" : "cto";
  if (isEtf(listing)) return MIN_ORDER.etf[column];
  return MIN_ORDER[market]?.[column] ?? null;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
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

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
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

export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  bp = null,
  perShare = null,
  plan = DEFAULT_PLAN,
  pea = false,
}) {
  const picked = planOf(plan);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    plan: picked?.id ?? plan,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "EUR",
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (decouverte|classic|trader|ultimate)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue BoursoBank n'existe pas encore : lancer `node boursobank/boursobank_scraping.mjs`",
    };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue BoursoBank` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez BoursoBank`,
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
  const rule = ruleOf(picked.id, market);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us";
  const tax = taxesOf(listing.isin);
  const stamp = stampOf(tax);
  const converted = listing.currency !== "EUR";
  const fxRate = converted ? fxMarginRate(listing.currency) : 0;
  const minOrder = minOrderOf({ market, listing, pea });

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: fxRate == null ? null : finite(fxRate * 2, 6),
    remark: remarkOf({ plan: picked, market, listing, pea }),
    commission: {
      rate: rule.rate,
      min: rule.min,
      upTo: rule.upTo,
      minAbove: rule.minAbove ?? null,
      currency: "EUR",
      eachWay: true,
      plan: picked.id,
    },
    minOrder: minOrder == null ? null : { amount: minOrder, currency: "EUR" },
    switchFee: SWITCH_FEE,
    transfer: TRANSFER,
  };

  const basis =
    `barème BoursoBank ${picked.label}, palier ${market}, brochure du ${SCHEDULE.effective} lue le ${SCHEDULE.readOn} : ` +
    `${rule.min} € jusqu'à ${rule.upTo} €, puis ${(rule.rate * 100).toFixed(2)} %` +
    (rule.minAbove != null ? ` avec un minimum de ${rule.minAbove} €` : "") +
    `, par ordre`;

  if (pea && american) {
    return {
      ...shared,
      basis,
      why: "un PEA ne peut pas détenir une ligne américaine",
    };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
    };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const notionalEur = convert(notional, listing.currency, "EUR");

  // The brochure refuses the purchase below this, so there is no trip to price
  // rather than a cheap one.
  if (minOrder != null && notionalEur != null && notionalEur < minOrder) {
    return {
      ...shared,
      basis,
      trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
      why:
        `ordre de ${notionalEur.toFixed(2)} € sous le minimum de ${minOrder} € ` +
        `à l'achat ${isEtf(listing) ? "sur un ETF" : `sur ce marché`} chez BoursoBank`,
    };
  }

  // The book is already a round trip — Rule 605 effective spread per share in
  // America, basis points elsewhere — so it is added once, not per side.
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const partner = isPartner(listing.isin);
  const buyComm = commissionSide({ amount: notionalEur, market, plan: picked.id, pea, partner });
  const sellComm = commissionSide({ amount: notionalEur, market, plan: picked.id, pea, partner });
  const buyCommUsd = buyComm ? dollars(buyComm.charged, buyComm.currency) : null;
  const sellCommUsd = sellComm ? dollars(sellComm.charged, sellComm.currency) : null;

  // Stamp duty and the French tax are charges on the purchase alone.
  const stampUsd = notionalUsd == null ? null : notionalUsd * stamp.pct;

  // America's two sell-side levies. The brochure names neither; they are the
  // market's, not BoursoBank's, and every broker on that tape passes them on.
  const secUsd = american ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;
  const tafUsd = american ? Math.min(TAF_PER_SHARE * n, TAF_CAP) : 0;

  // 1,50 £ per order and per side, on a UK-registered share above 10 000 £.
  const notionalGbp = convert(notional, listing.currency, PTM.currency);
  const ptmDue =
    String(listing.type || "").toUpperCase() !== "STOCK" || !UK_REGISTERED.test(listing.isin)
      ? false
      : notionalGbp == null
        ? null
        : notionalGbp > PTM.above;
  const ptmUsd = ptmDue === false ? 0 : ptmDue === null ? null : dollars(2 * PTM.each, PTM.currency);

  // « Taux de change J+1 + 0,0025 points », once on the way in and once out.
  const fxUsd = !converted ? 0 : fxRate == null || notionalUsd == null ? null : notionalUsd * fxRate * 2;

  const usd = plus(bookUsd, buyCommUsd, sellCommUsd, stampUsd, secUsd, tafUsd, ptmUsd, fxUsd);
  // What BoursoBank keeps. The book belongs to whoever quoted it, the French
  // tax and the stamp to a treasury, the SEC, FINRA and PTM levies to their
  // regulators, and no forfait forgives any of them — but the conversion
  // margin is the bank's own, so it sits here beside the two tickets.
  const brokerFees = plus(buyCommUsd, sellCommUsd, fxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why:
            `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ` +
            `${m.unsourced?.why || "pas de source de spread"}`,
        }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    buy: {
      commission: finite(buyCommUsd, 6),
      native: buyComm
        ? {
            charged: finite(buyComm.charged, 6),
            raw: finite(buyComm.raw, 6),
            ticketed: buyComm.ticketed,
            capped: buyComm.capped,
            currency: buyComm.currency,
          }
        : null,
      taxes: finite(stampUsd, 6),
      taxRates: Object.keys(stamp.rates).length ? stamp.rates : null,
      ptm: ptmDue ? finite(dollars(PTM.each, PTM.currency), 6) : ptmDue === null ? null : 0,
    },
    sell: {
      commission: finite(sellCommUsd, 6),
      native: sellComm
        ? {
            charged: finite(sellComm.charged, 6),
            raw: finite(sellComm.raw, 6),
            ticketed: sellComm.ticketed,
            capped: sellComm.capped,
            currency: sellComm.currency,
          }
        : null,
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
      ptm: ptmDue ? finite(dollars(PTM.each, PTM.currency), 6) : ptmDue === null ? null : 0,
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(plus(buyCommUsd, sellCommUsd), 6),
      taxes: finite(stampUsd, 6),
      réglementaire: american ? finite(plus(secUsd, tafUsd), 6) : 0,
      ptm: ptmUsd === null ? null : finite(ptmUsd, 6),
      change: finite(fxUsd, 6),
    },
    pea: pea ? { cap: PEA_CAP, why: "plafond PEA / PEA-PME 0,5 % du montant, marchés EEE" } : null,
    basis,
    confidence: confidenceOf({
      picked,
      market,
      rule,
      buyComm,
      stamp,
      tax,
      american,
      converted,
      fxRate,
      partner,
      ptmDue,
      minOrder,
      listing,
      leaf,
    }),
  };
}

function confidenceOf({ picked, market, rule, buyComm, stamp, tax, american, converted, fxRate, partner, ptmDue, minOrder, listing, leaf }) {
  const lines = [];

  // A partner tracker never reaches the grid, so quoting the grid at it would
  // only contradict the zero printed two lines below.
  if (!partner) {
    lines.push(
      `Commission ${picked.label} sur le palier ${market}, brochure du ${SCHEDULE.effective} lue le ${SCHEDULE.readOn}. ` +
        (buyComm?.ticketed
          ? `L'ordre tient sous ${rule.upTo} €, donc le ticket de ${rule.min} € s'applique tel quel, par sens.`
          : `L'ordre dépasse ${rule.upTo} €, donc ${(rule.rate * 100).toFixed(2)} % s'applique, par sens.`) +
        (buyComm?.capped ? ` Le plafond PEA de 0,5 % mord et remplace le barème.` : "")
    );

    lines.push(
      `Le ticket est une marche et non un plancher : à ${rule.upTo} € l'ordre coûte ${rule.min} €, ` +
        `un euro plus haut il coûte ${(rule.upTo * rule.rate).toFixed(2)} €. ` +
        `Le coût est calculé pour la taille demandée, ce qu'une forme affine ne savait pas dire.`
    );
  }

  if (market !== "us" && market !== "euronext") {
    lines.push(
      `La brochure ne liste pas les « bourses européennes » qu'elle facture 11,95 € et renvoie au site, ` +
        `donc toute place qui n'est ni Paris, ni Amsterdam, ni Bruxelles, ni américaine prend cette carte ici.`
    );
  }

  if (stamp.pct) {
    lines.push(
      `Taxe de transaction ${(100 * stamp.pct).toFixed(2)} % à l'achat seulement, ` +
        `depuis la divulgation ex-ante relevée dans taxMap.mjs : ${Object.keys(stamp.rates).join(", ")}.`
    );
  } else if (tax?.known) {
    lines.push(`Ligne chiffrée sans taxe de transaction à l'achat : un zéro mesuré, pas une absence de réponse.`);
  } else if (/^(IT|ES)/.test(String(listing.isin || ""))) {
    lines.push(
      `Aucune ligne fiscale pour cet ISIN, et aucune taxe italienne ni espagnole n'est ajoutée d'office. ` +
        `Bolsa de Madrid a été balayée intégralement sans une seule taxe à l'achat, donc le zéro espagnol est mesuré. ` +
        `Côté italien seuls des émetteurs achetés hors de leur place ont été chiffrés, et un ordre passé sur Milan ` +
        `même reste une question ouverte.`
    );
  } else {
    lines.push(`Aucune ligne fiscale pour cet ISIN : la divulgation ex-ante ne l'a jamais chiffré.`);
  }

  if (american) {
    lines.push(
      `SEC ${SEC_RATE} et FINRA ${TAF_PER_SHARE} $ par part à la vente, plafonnée à ${TAF_CAP} $. ` +
        `La brochure ne les imprime pas — elles ne sont pas de BoursoBank — et un achat ne les porte pas : ` +
        `le récapitulatif ${CHECK.us.venue} de ${CHECK.us.amountEur} € n'ajoutait que le change au ticket. ` +
        `Le sens vendeur, lui, n'a pas été mesuré.`
    );
  }

  if (converted) {
    lines.push(
      fxRate == null
        ? `Compte en euro et ligne en ${listing.currency}, mais aucun taux pour cette devise : la conversion n'est pas chiffrée.`
        : `Compte en euro : la ligne est convertie deux fois, à ${(100 * fxRate).toFixed(3)} % par sens. ` +
          `Ce n'est pas un pourcentage de barème mais 0,0025 point sur le taux, mesuré sur deux devises : ` +
          `${CHECK.us.fxEur} € de change sur un ticket ${CHECK.us.venue} de ${CHECK.us.amountEur} €, soit 0,221 %, ` +
          `et ${CHECK.uk.fxEur} € sur un ticket ${CHECK.uk.venue} de ${CHECK.uk.amountEur} €, soit 0,298 %. ` +
          `Les deux tombent au centime sur 0,0025 point, et un taux plat de 0,25 % manquerait les deux écrans. ` +
          `La ponction dépend donc du niveau de la paire, et celui d'ici date du ${FX_AS_OF}.`
    );
  }

  if (ptmDue) {
    lines.push(`Prélèvement PTM de ${PTM.each} £ par ordre et par sens, l'ordre dépassant ${PTM.above} £.`);
  }

  if (minOrder != null) {
    lines.push(
      `Minimum d'ordre à l'achat ${minOrder} €${isEtf(listing) ? " sur un ETF, quel que soit le compte" : ""} : ` +
        `en dessous, l'ordre est refusé et ce fichier rend N/A plutôt qu'un prix. ` +
        (isEtf(listing)
          ? `Un ticket de ${CHECK.floor.amountEur} € s'est fait renvoyer « ${CHECK.floor.message} ».`
          : `Le refus vient de la brochure, non d'un essai.`)
    );
  }

  const idle = PLAN_STRINGS[picked.id];
  if (idle) {
    lines.push(
      `Hors aller-retour : ${idle.idle} €/${idle.per} si ${idle.why}` +
        (idle.account ? `, et la formule est ${idle.account}` : "") +
        `. Droits de garde et abonnement gratuits sinon.`
    );
  }

  if (partner) {
    lines.push(
      `Tracker Boursomarkets : courtage nul dans les deux sens, « 0 € à l'achat ou droits d'entrée » et ` +
        `« 0 € à la vente ou sortie ». La liste des ${PARTNERS.on.size} partenaires est relevée le ${PARTNERS.at} ` +
        `depuis le palmarès de la banque, et vérifiée sur un récapitulatif : ` +
        `${CHECK.partner.ticker} de ${CHECK.partner.amountEur} € s'affiche à ${CHECK.partner.commission} € de frais au passage. ` +
        `L'écart de carnet, lui, reste dû.`
    );
  } else if (isEtf(listing)) {
    lines.push(
      `Tracker hors Boursomarkets : il paie la carte Euronext dans les deux sens. ` +
        `Les ${CHECK.etfs.length} trackers portés au récapitulatif et absents de la liste — ` +
        `${CHECK.etfs.map((e) => e.ticker).join(", ")} — ont tous payé le ticket plein de ${CHECK.etfs[0].commission} €, ` +
        `ce qui recoupe la liste par l'autre bout.`
    );
  }

  if (picked.id === "decouverte" && market === "euronext") {
    lines.push(
      `Aller-retour réel le ${CHECK.on} sur ${CHECK.ticker} (${CHECK.venue}) : achat ${CHECK.buy} / vente ${CHECK.sell}, ` +
        `${CHECK.commissionEach} € de courtage par jambe, TTF ${CHECK.ttf} € à l'achat, ` +
        `caisse ${CHECK.cash.start} → ${CHECK.cash.end}, soit ${CHECK.trip} € pour la boucle. Le carnet n'y était pas visible.`
    );
  } else {
    lines.push(
      market === "europe" && picked.id === "decouverte"
        ? `Le ticket de ${CHECK.uk.commission} € a été lu sur un récapitulatif ${CHECK.uk.venue} de ${CHECK.uk.amountEur} €, ` +
          `sans qu'aucun ordre ne parte. Le sens vendeur, lui, n'a pas été montré.`
        : `Ni ${picked.label} ni le palier ${market} n'ont été recoupés sur un relevé : ` +
          `le seul aller-retour réel est ${CHECK.ticker} en Découverte sur Euronext, à ${CHECK.commissionEach} € le ticket.`
    );
  }

  if (!leaf) lines.push(`Pas de feuille de carnet pour cet ISIN et cette place.`);

  return lines.join(" ; ");
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
          defaultPlan: DEFAULT_PLAN,
          plans: PLANS,
          euronext: EURONEXT_RULE,
          other: OTHER_RULE,
          minOrder: MIN_ORDER,
          idle: PLAN_STRINGS,
          switchFee: SWITCH_FEE,
          transfer: TRANSFER,
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
      "usage : node boursobank_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=decouverte|classic|trader|ultimate] [--pea] [--json]\n" +
        "        node boursobank_cost.mjs --schedule\n" +
        "  ex.   node boursobank_cost.mjs TTE --shares=10 --price=78\n" +
        "        node boursobank_cost.mjs MC EURONEXT EUR --shares=5 --price=600 --plan=trader\n" +
        "        node boursobank_cost.mjs MEDP NASDAQ USD --shares=1 --price=300"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
    pea: process.argv.includes("--pea"),
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (!out.listing) {
    console.log(`aller-retour     : N/A — ${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce que BoursoBank propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${picked?.label || out.plan}]\n`
  );

  const t = out.trade;
  if (t) {
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd} $)` : "") +
        "\n"
    );
  }

  console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  const p = out.parts || {};
  if (p.marché != null) console.log(`  carnet         : ${p.marché} $`);
  if (p.commission != null) {
    console.log(
      `  courtage       : ${p.commission} $` +
        (out.buy?.native ? `   (${Number(out.buy.native.charged).toFixed(2)} € × 2${out.buy.native.ticketed ? ", au ticket" : ", au pourcentage"}${out.buy.native.capped ? ", plafonné PEA" : ""})` : "")
    );
  }
  if (p.taxes) console.log(`  taxes          : ${p.taxes} $`);
  if (p.réglementaire) console.log(`  réglementaire  : ${p.réglementaire} $`);
  if (p.ptm) console.log(`  PTM            : ${p.ptm} $`);
  if (p.change) console.log(`  change         : ${p.change} $`);
  console.log("");
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const line of out.remark.split("\n")) console.log(`  · ${line}`);
  if (out.url) console.log(`\n${out.url}`);
}
