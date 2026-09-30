// What one round trip costs at Fortuneo: buy n shares at price p, sell them
// back at once, online, in dollars.
//
// The Euronext ticket is a step, not a floor. Progress bills 4.90 € at
// 3 000 € and 4.50 € at 3 001 €; Trader Pro bills 9.50 € at 10 000 € and
// 10.00 € a euro later. Starter is a flat 0.35 % with no printed floor.
// `roundTrip` is given the size and charges that step.
//
// Conditions tarifaires of 6 August 2026 (TTC), read 2026-09-20. Default
// is Starter, the opening card. Internet only: the telephone surcharge
// (+7.18 € Starter, +3.59 € Progress / Trader Pro) stays out. One plan
// per account; switching later is 60 € and is not this trip.
//
//   Euronext Paris / Brussels / Amsterdam or Equiduct
//     Starter      0.35 %  (1st order of the month ≤ 500 € is free —
//                  billed here at 0.35 % both ways; the gift is a remark)
//     Progress     4.90 € up to 3 000 €, then 0.15 %
//     Trader Pro   9.50 € up to 10 000 €, then 0.10 %
//   US (NYSE, Nasdaq, Amex)
//     Starter / Progress   0.20 % min 20 € + 30 € foreign-broker
//     Trader Pro           9.50 € up to 10 000 €, then 0.12 %
//   Germany (Frankfurt / Xetra), UK (SETS / LSE), Switzerland (SIX / Virt-x)
//     every plan           0.20 % min 20 € + 30 € foreign-broker
//   Other tapes            1 % min 30 € + 30 €, sell-only by phone
//
// `--pea` is the legal online cap (0.50 %) the brochure prints on
// Euronext and on the German / UK / Swiss card. A PEA cannot hold a
// US line. A PEA buy on those three foreign tapes under 400 € is
// refused, not priced. Front has no PEA row: the default trip is CTO.
//
// Cash is euro. A non-euro quote is converted twice at « taux J+1 +
// 0.12 % ». Custody and account-keeping are 0 €. US streaming quotes
// are free with one US order a month, else 5.98 € — a holding cost,
// in the remark. The Amundi-ETF 0 € window (1 Sep–31 Dec 2026) has
// no list in this deposit, so every tracker keeps the card. No spot
// crypto.
//
// French / Italian / Spanish FTT and stamps come from taxMap, never
// invented. SEC and TAF on an American sale are the current local
// levies the card leaves outside the ticket. PTM is not on the page
// and is not added. Fortuneo names no US BD, so the American book is
// the reconstructed NBBO quoted (605 field 19 + 2 × PI).
//
// Catalogue 9 321 lines (6 494 stocks, 2 827 ETFs) on Euronext,
// Nasdaq, NYSE, Amex, Xetra, LSE and SIX. No live trip in this
// deposit.
//
//   https://www.fortuneo.fr/datas/files/tarifs_fortuneo.pdf
//   https://www.fortuneo.fr/bourse
//   https://www.fortuneo.fr/bourse/ordre-offert-starter
//
//   node fortuneo/fortuneo_cost.mjs TTE EURONEXT EUR --shares=10 --price=78
//   node fortuneo/fortuneo_cost.mjs IWDA EURONEXT EUR --shares=10 --price=100
//   node fortuneo/fortuneo_cost.mjs AAPL NASDAQ USD --shares=1 --price=230
//   node fortuneo/fortuneo_cost.mjs AAPL NASDAQ USD --shares=1 --price=230 --plan=traderpro
//   node fortuneo/fortuneo_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("fortuneo-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.fortuneo.fr/datas/files/tarifs_fortuneo.pdf",
  page: "https://www.fortuneo.fr/bourse",
  starter: "https://www.fortuneo.fr/bourse/ordre-offert-starter",
  readOn: "2026-09-20",
  revised: "2026-08-06",
  entity: "Fortuneo (Arkéa, FR), internet — Starter / Progress / Trader Pro",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const FX_EACH_WAY = 0.0012;
const PEA_CAP = 0.005;
const PEA_EUROPE_MIN = 400;
const FOREIGN_BROKER = 30;
const US_STREAM = { idle: 5.98, currency: "EUR" };
const SWITCH_FEE = { amount: 60, currency: "EUR" };
const TRANSFER = { france: 15, abroad: 15, peaCap: 150, currency: "EUR" };
const DEFAULT_PLAN = "starter";
const US_MICS = ["XNAS", "XNYS", "ARCX", "XASE", "BATS"];
const US_MIC_SET = new Set(US_MICS);
const US_EX = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "CBOE", "BATS"]);
const EURONEXT_MICS = new Set(["XPAR", "XAMS", "XBRU"]);
const EUROPE_EX = new Set(["XETR", "LSE", "SIX"]);

const EURONEXT_RULE = {
  starter: { kind: "rate", rate: 0.0035 },
  progress: { kind: "step", min: 4.9, upTo: 3000, rate: 0.0015 },
  traderpro: { kind: "step", min: 9.5, upTo: 10000, rate: 0.001 },
};

const US_RULE = {
  starter: { kind: "floor", rate: 0.002, min: 20, foreign: FOREIGN_BROKER },
  progress: { kind: "floor", rate: 0.002, min: 20, foreign: FOREIGN_BROKER },
  traderpro: { kind: "step", min: 9.5, upTo: 10000, rate: 0.0012 },
};

const EUROPE_RULE = { kind: "floor", rate: 0.002, min: 20, foreign: FOREIGN_BROKER };
const OTHER_RULE = { kind: "floor", rate: 0.01, min: 30, foreign: FOREIGN_BROKER };

const PLANS = {
  starter: { id: "starter", label: "Starter" },
  progress: { id: "progress", label: "Progress" },
  traderpro: { id: "traderpro", label: "Trader Pro" },
};

const PLAN_ALIAS = {
  starter: "starter",
  progress: "progress",
  trader: "traderpro",
  traderpro: "traderpro",
  pro: "traderpro",
};

const MARKET_RANK = { euronext: 0, europe: 1, us: 2, lisbon: 3, other: 4 };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const toCcy = (amount, from, to) => {
  if (String(from || "").toUpperCase() === String(to || "").toUpperCase()) return Number(amount);
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
};

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

export function feeMarketOf(exchange, mic) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  if (m === "XLIS" || code === "XLIS") return "lisbon";
  if (US_MIC_SET.has(m) || US_EX.has(code)) return "us";
  if (code === "XETR" || m === "XETR" || code === "LSE" || m === "XLON" || code === "SIX" || m === "XSWX" || m === "XVTX") {
    return "europe";
  }
  if (EUROPE_EX.has(code)) return "europe";
  if (EURONEXT_MICS.has(m) || code === "EURONEXT") return "euronext";
  return "other";
}

export function ruleOf(plan, market) {
  const p = planOf(plan);
  if (!p) return null;
  if (market === "euronext") return EURONEXT_RULE[p.id];
  if (market === "us") return US_RULE[p.id];
  if (market === "europe") return EUROPE_RULE;
  if (market === "other") return OTHER_RULE;
  return null;
}

function onlineBuy(market) {
  return market !== "other";
}

export function peaCaps(market) {
  return market === "euronext" || market === "europe";
}

/**
 * One side, in euro of notional. `foreign` is the 30 € the brochure adds
 * on a tape that is not Euronext; the PEA cap, when it bites, covers both.
 */
export function commissionEach(amount, rule) {
  if (!rule || amount == null || !Number.isFinite(Number(amount))) return null;
  const n = Number(amount);
  if (rule.kind === "rate") {
    return { charged: n * rule.rate, raw: n * rule.rate, stepped: false, floored: false, foreign: 0 };
  }
  if (rule.kind === "step") {
    if (n <= rule.upTo) {
      return { charged: rule.min, raw: rule.min, stepped: true, floored: false, foreign: 0 };
    }
    return { charged: n * rule.rate, raw: n * rule.rate, stepped: false, floored: false, foreign: 0 };
  }
  const raw = n * rule.rate;
  const ticket = Math.max(rule.min, raw);
  const foreign = rule.foreign || 0;
  return { charged: ticket + foreign, raw, stepped: false, floored: raw < rule.min, foreign };
}

export function commissionSide({ amountEur, plan, market, pea = false, firstFree = false }) {
  const picked = planOf(plan);
  const rule = ruleOf(plan, market);
  if (!picked || !rule || amountEur == null || !Number.isFinite(Number(amountEur))) return null;
  const n = Number(amountEur);
  if (firstFree && picked.id === "starter" && market === "euronext" && n <= 500) {
    return { charged: 0, raw: 0, stepped: false, floored: false, foreign: 0, peaCapped: false, gift: true, currency: "EUR" };
  }
  const part = commissionEach(n, rule);
  if (!part) return null;
  const cap = pea && peaCaps(market) ? n * PEA_CAP : null;
  const charged = cap != null ? Math.min(part.charged, cap) : part.charged;
  return { ...part, charged, peaCapped: cap != null && charged < part.charged, gift: false, currency: "EUR" };
}

function remarkOf(plan, market) {
  const lines = [];
  if (plan.id === "starter" && market === "euronext") {
    lines.push("One free Euronext order ≤ €500 per month.");
  }
  if (market === "us") lines.push(`US quotes €${US_STREAM.idle}/month if no US trade.`);
  if (market === "lisbon") lines.push("Lisbon is listed; the brochure names no card for it.");
  if (market === "other") lines.push("Sell-only by phone off fortuneo.fr.");
  return lines.join("\n");
}

export function taxesFor(isin) {
  const tax = taxesOf(isin);
  const mapped = taxRates(tax);
  if (Object.keys(mapped).length) return { tax, rates: mapped, source: "taxMap" };
  return { tax, rates: {}, source: null };
}

function usMic(row, venue) {
  if (venue?.mic && US_MIC_SET.has(venue.mic)) return venue.mic;
  const resolved = listingKey(row).venue?.mic;
  if (resolved && US_MIC_SET.has(resolved)) return resolved;
  const code = loose(row.exchange);
  if (code === "NYSE") return "XNYS";
  if (code === "AMEX" || code === "ARCA") return "XASE";
  return "XNAS";
}

function bookOf(row, venue, unsourced) {
  const market = feeMarketOf(row.exchange, venue?.mic);
  return spreadLeaf(spreads, {
    isin: row.isin,
    mic: market === "us" ? usMic(row, venue) : venue?.mic ?? null,
    currency: row.currency,
    unsourced,
    broker: "fortuneo",
    ticker: row.ticker,
  });
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
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) {
        if (m.venue.mic === wantVenue.mic) return true;
        if (EURONEXT_MICS.has(wantVenue.mic) && loose(m.row.exchange) === "EURONEXT") return true;
        if (US_MIC_SET.has(wantVenue.mic) && US_EX.has(loose(m.row.exchange))) return true;
      }
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  if (!wantPlace && !wantCurrency) {
    matches.sort(
      (a, b) =>
        (MARKET_RANK[feeMarketOf(a.row.exchange, a.venue?.mic)] ?? 9) -
        (MARKET_RANK[feeMarketOf(b.row.exchange, b.venue?.mic)] ?? 9)
    );
  }

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
    const book = bookOf(r, venue, unsourced);
    const market = feeMarketOf(r.exchange, book.mic ?? venue?.mic);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    const hasBook = book.leaf?.bp != null || book.leaf?.perShare != null;
    if (hasBook) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (hasBook) mk.withBook += 1;
  }
  return out;
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `brokerFees` is Fortuneo's ticket, the 30 € foreign-broker add-on and the
 * 0.12 % conversion — not the book, not the taxes, not SEC / TAF.
 */
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
  firstFree = false,
}) {
  const picked = planOf(plan);
  const answer = {
    usd: null,
    brokerFees: null,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "EUR",
    plan: picked?.id ?? plan,
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (starter|progress|traderpro)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Fortuneo n'existe pas encore : lancer `node fortuneo/fortuneo_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Fortuneo` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Fortuneo`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = bookOf(m.row, m.venue, m.unsourced);
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
    query: m.row.query || null,
  };

  const market = feeMarketOf(m.row.exchange, listing.mic);
  const rule = ruleOf(picked.id, market);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us";
  const { tax, rates, source: taxSource } = taxesFor(listing.isin);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  const converted = listing.currency !== "EUR";
  const fxPct = converted ? FX_EACH_WAY : 0;
  const canBuy = onlineBuy(market);
  const minOrder = pea && market === "europe" ? PEA_EUROPE_MIN : null;

  const shared = {
    ...answer,
    onlineBuy: canBuy,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: converted ? finite(fxPct * 2, 6) : 0,
    remark: remarkOf(picked, market),
    pea: pea ? { cap: PEA_CAP } : null,
    minOrder: minOrder == null ? null : { amount: minOrder, currency: "EUR" },
    switchFee: SWITCH_FEE,
    transfer: TRANSFER,
  };

  const basis = rule
    ? basisOf({ picked, market, rule })
    : `aucun palier publié pour ${listing.brokerExchange || listing.exchange || "cette place"} chez Fortuneo`;

  if (!rule) {
    return {
      ...shared,
      basis,
      why:
        market === "lisbon"
          ? "Euronext Lisbonne n'est pas sur la carte Paris / Bruxelles / Amsterdam / Equiduct"
          : `${listing.ticker || listing.isin} n'a pas de palier de courtage publié chez Fortuneo`,
      confidence: confidenceOf({
        picked,
        market,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        pea,
      }),
    };
  }

  if (pea && american) {
    return {
      ...shared,
      basis,
      why: "un PEA ne peut pas détenir une ligne américaine",
      confidence: confidenceOf({ picked, market, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, pea }),
    };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        picked,
        market,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        taxPct,
        taxSource,
        fxPct,
        american,
        pea,
      }),
    };
  }

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);
  const notionalEur = toCcy(notional, listing.currency, "EUR");

  if (minOrder != null && notionalEur != null && notionalEur < minOrder) {
    return {
      ...shared,
      basis,
      trade: {
        shares: n,
        price: p,
        notional,
        notionalUsd: finite(notionalUsd, 6),
        notionalEur: finite(notionalEur, 6),
        currency: listing.currency,
      },
      why: `ordre de ${notionalEur.toFixed(2)} € sous le minimum PEA de ${minOrder} € à l'achat sur ce marché chez Fortuneo`,
    };
  }

  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const buy = commissionSide({ amountEur: notionalEur, plan: picked.id, market, pea, firstFree });
  const sell = commissionSide({ amountEur: notionalEur, plan: picked.id, market, pea, firstFree: false });
  const buyUsd = buy ? dollars(buy.charged, "EUR") : null;
  const sellUsd = sell ? dollars(sell.charged, "EUR") : null;
  const fxUsd = fxPct && notionalUsd != null ? notionalUsd * fxPct * 2 : 0;
  const brokerFees = plus(buyUsd, sellUsd, fxUsd);

  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const secUsd = american ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;
  const tafUsd = american ? Math.min(TAF_CAP, TAF_PER_SHARE * n) : 0;
  const usd = plus(bookUsd, brokerFees, taxUsd, secUsd, tafUsd);

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
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      notionalEur: finite(notionalEur, 6),
      currency: listing.currency,
    },
    buy: {
      commission: finite(buyUsd, 6),
      native: buy
        ? {
            charged: finite(buy.charged, 6),
            raw: finite(buy.raw, 6),
            foreign: buy.foreign,
            stepped: buy.stepped,
            floored: buy.floored,
            peaCapped: buy.peaCapped,
            gift: buy.gift,
            currency: buy.currency,
          }
        : null,
      taxes: finite(taxUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
      fx: finite(fxUsd ? fxUsd / 2 : 0, 6),
    },
    sell: {
      commission: finite(sellUsd, 6),
      native: sell
        ? {
            charged: finite(sell.charged, 6),
            raw: finite(sell.raw, 6),
            foreign: sell.foreign,
            stepped: sell.stepped,
            floored: sell.floored,
            peaCapped: sell.peaCapped,
            currency: sell.currency,
          }
        : null,
      fx: finite(fxUsd ? fxUsd / 2 : 0, 6),
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(plus(buyUsd, sellUsd), 6),
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
      réglementaire: american ? finite(plus(secUsd, tafUsd), 6) : 0,
    },
    commission: {
      each: buy?.charged ?? null,
      rate: rule?.rate ?? null,
      min: rule?.min ?? null,
      upTo: rule?.upTo ?? null,
      foreign: rule?.foreign ?? 0,
      currency: "EUR",
      eachWay: true,
      plan: picked.id,
      pea,
    },
    basis,
    confidence: confidenceOf({
      picked,
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      taxSource,
      fxPct,
      american,
      pea,
      buy,
      n,
      tafUsd,
      firstFree,
    }),
  };
}

function basisOf({ picked, market, rule }) {
  let card = `barème Fortuneo ${picked.label}, palier ${market}, brochure du ${SCHEDULE.revised} lue le ${SCHEDULE.readOn}`;
  if (!rule) return card;
  if (rule.kind === "rate") {
    card += ` : ${(rule.rate * 100).toFixed(2)} % par ordre`;
  } else if (rule.kind === "step") {
    card += ` : ${rule.min} € jusqu'à ${rule.upTo} €, puis ${(rule.rate * 100).toFixed(2)} %`;
  } else {
    card += ` : ${(rule.rate * 100).toFixed(2)} % min. ${rule.min} €`;
    if (rule.foreign) card += ` + ${rule.foreign} € de brokers étrangers`;
  }
  return `${card}, par sens`;
}

function confidenceOf({
  picked,
  market,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  taxPct,
  taxSource,
  fxPct,
  american,
  pea,
  buy,
  n,
  tafUsd,
  firstFree,
}) {
  const said = [];
  const rule = ruleOf(picked.id, market);
  said.push(
    `commission ${picked.label} sur le palier ${market}, brochure du ${SCHEDULE.revised} lue le ${SCHEDULE.readOn}`
  );
  if (buy?.gift) {
    said.push(`premier ordre Starter du mois ≤ 500 € : 0 € sur cette jambe`);
  } else if (buy?.stepped) {
    said.push(`l'ordre tient sous ${rule.upTo} €, donc le ticket de ${rule.min} € s'applique tel quel, par sens`);
  } else if (buy?.floored) {
    said.push(
      `le plancher mord : ${rule.min} €` +
        (buy.foreign ? ` + ${buy.foreign} € de brokers étrangers` : "") +
        ` par sens`
    );
  } else if (buy) {
    said.push(
      `${(rule.rate * 100).toFixed(2)} %` +
        (buy.foreign ? ` + ${buy.foreign} € de brokers étrangers` : "") +
        ` : ${Number(buy.charged.toPrecision(4))} € par sens` +
        (buy.peaCapped ? `, plafond PEA ${(PEA_CAP * 100).toFixed(1)} %` : "")
    );
  }
  if (firstFree && picked.id === "starter" && market === "euronext") {
    said.push(`le 0 € du premier ordre mensuel ≤ 500 € a été appliqué à l'achat seulement`);
  } else if (picked.id === "starter" && market === "euronext") {
    said.push(
      `le premier ordre Euronext du mois ≤ 500 € est offert : ce fichier le laisse hors du chiffre, ` +
        `les deux jambes paient 0,35 %`
    );
  }
  if (fxPct) {
    said.push(`compte en euro : change J+1 + ${(FX_EACH_WAY * 100).toFixed(2)} % par sens`);
  } else {
    said.push(`cotation EUR : pas de change`);
  }
  if (taxPct) {
    said.push(`taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant, depuis taxMap.mjs`);
  } else if (taxSource === null) {
    said.push(`aucune ligne fiscale pour cet ISIN : la divulgation ex-ante ne l'a jamais chiffré`);
  }
  if (american) {
    said.push(
      `vente américaine : SEC ${SEC_RATE} du montant et TAF FINRA ${TAF_PER_SHARE} $ la part (plafond ${TAF_CAP} $)` +
        (tafUsd != null && n != null && TAF_PER_SHARE * n > TAF_CAP
          ? ` — le plafond mord : ${Number(tafUsd.toPrecision(4))} $`
          : "") +
        `. La brochure ne les imprime pas`
    );
  }
  if (pea && peaCaps(market)) {
    said.push(`plafond PEA 0,50 % appliqué à la commission en ligne, y compris les 30 € de brokers étrangers`);
  }
  if (pea && market === "europe") {
    said.push(`minimum d'achat PEA 400 € hors courtage sur ce palier, en dessous l'ordre est refusé`);
  }
  if (market === "lisbon") {
    said.push(
      `Euronext Lisbonne : la brochure du ${SCHEDULE.revised} nomme Paris, Bruxelles, Amsterdam et Equiduct, ` +
        `pas Lisbonne. Pas de palier voisin inventé, le courtage est N/A`
    );
  }
  if (market === "other") {
    said.push(`autres marchés : vente seule, par téléphone, 1 % min. 30 € + 30 € — pas sur fortuneo.fr`);
  }
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) {
    said.push(
      american
        ? `carnet NBBO reconstitué, ${marketPerShare} $ la part — Fortuneo ne nomme pas de broker-dealer américain`
        : `carnet Rule 605, ${marketPerShare} $ la part`
    );
  } else {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. ` +
        `Le total est N/A faute de mesure, pas faute de frais`
    );
  }
  said.push(
    `hors total : droits de garde 0 €, flux US ${US_STREAM.idle} € / mois sans ordre US, ` +
      `téléphone + ${picked.id === "starter" ? "7,18" : "3,59"} €, changement de formule ${SWITCH_FEE.amount} €, ` +
      `sélection Amundi à 0 € jusqu'au 31.12.2026 absente de ce dépôt. Aucun aller-retour réel`
  );
  return said.join(" ; ");
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
          defaultPlan: DEFAULT_PLAN,
          fxEachWay: FX_EACH_WAY,
          peaCap: PEA_CAP,
          plans: PLANS,
          euronext: EURONEXT_RULE,
          us: US_RULE,
          europe: EUROPE_RULE,
          other: OTHER_RULE,
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
      "usage : node fortuneo_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=starter|progress|traderpro] [--pea] [--first-free] [--json]\n" +
        "        node fortuneo_cost.mjs --schedule\n" +
        "  ex.   node fortuneo_cost.mjs TTE EURONEXT EUR --shares=10 --price=78\n" +
        "        node fortuneo_cost.mjs AAPL NASDAQ USD --shares=1 --price=230 --plan=traderpro"
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
    firstFree: process.argv.includes("--first-free"),
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce que Fortuneo propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.query || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${picked?.label || out.plan}]\n`
  );

  if (out.trade?.notional != null) {
    const t = out.trade;
    console.log(
      `${t.shares ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ` : ""}` +
        `${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "")
    );
    console.log();
  }

  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) {
      if (v) console.log(`  ${name.padEnd(15)}: ${v} $`);
    }
  }
  if (!out.onlineBuy) console.log(`  en ligne        : vente seule (hors fortuneo.fr)`);
  console.log();
  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
