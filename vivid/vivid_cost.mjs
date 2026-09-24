// What one round trip costs at Vivid: buy n shares at price p, sell them
// back at once, in dollars. A coin is bought by the amount.
//
// The affine triple hid the FX cliff. €1 a side is a constant; 1 % of a
// dollar book is not. `roundTrip` is given the size and charges what is
// charged.
//
// Two products, pages re-read 2026-09-18. Default is Personal Invest
// (`--entity=personal`, `--plan=standard`): Vivid Money GmbH / the
// Standard · Plus · Prime cards. `--entity=business` is Business
// Brokerage (the gRPC shelf `vivid_scraping.mjs` actually walks). The
// cash account is euro. Until the catalogue has been run, this file
// answers that the book is missing.
//
//   Personal, EUR shares / ETFs     €1 a side
//   Personal, USD shares / ETFs     €1 a side + FX markup
//   Personal FX (month 2, default)  Standard 1.00 % · Plus 0.70 % · Prime 0.50 %
//   Personal crypto (turnover < €5k) Standard 2.00 % min €1 · Plus 1.00 % · Prime 0.75 %
//
//   Business, EUR stocks            €1 a side
//   Business, USD stocks            $1 a side + FX markup
//   Business, ETF / iBond           0 on the ticket (AUM in the remark)
//   Business FX                     Free Start 0.45 % · Basic 0.35 % · Pro 0.25 %
//   Business crypto                 2 % min €1 · 1.45 % · 0.95 %
//
// First-month FX promos and the turnover ladders stay out of the number:
// the printed default is the second-month, lowest-turnover rung. Custody
// is 0. AUM on Business ETFs / MMFs is a holding cost, like a TER, so it
// stays in the remark. SEC / TAF / CAT / PTM are not named. Stamp / FTT
// from taxMap by ISIN. Tickets already in the number stay out of the
// remark. FX remarks show the one-way rate only.
//
// Personal help names a markup only on USD. Another listing currency
// still settles in euro, but no % is printed, so none is charged here.
// Business help applies conversion whenever the trade is not in euro.
// Business custody names Interactive Brokers Ireland (among others). A
// US tape uses IBKR's 606, the same rule as the other IB introducing
// names.
//
//   https://support.vivid.money/en/articles/9278373-what-s-the-cost-of-trading-with-the-invest-pocket
//   https://support.vivid.money/en/articles/9297890-are-there-any-fees-for-trading-in-the-crypto-pocket
//   https://vivid.money/en-eu/personal/plans/
//   https://help-business.vivid.money/en/articles/12259477-what-is-the-cost-of-trading-in-business-brokerage
//   https://vivid.money/en-eu/business/plans/treasury/
//
//   node vivid/vivid_cost.mjs VWCE TRADEGATE EUR --shares=10 --price=140
//   node vivid/vivid_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node vivid/vivid_cost.mjs AAPL NASDAQ USD --plan=prime --shares=10 --price=230
//   node vivid/vivid_cost.mjs AAPL NASDAQ USD --entity=business --shares=10 --price=230
//   node vivid/vivid_cost.mjs BTC --amount=1000
//   node vivid/vivid_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { cryptoId, listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("vivid-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  invest: "https://support.vivid.money/en/articles/9278373-what-s-the-cost-of-trading-with-the-invest-pocket",
  crypto: "https://support.vivid.money/en/articles/9297890-are-there-any-fees-for-trading-in-the-crypto-pocket",
  personalPlans: "https://vivid.money/en-eu/personal/plans/",
  business: "https://help-business.vivid.money/en/articles/12259477-what-is-the-cost-of-trading-in-business-brokerage",
  businessPlans: "https://vivid.money/en-eu/business/plans/treasury/",
  readOn: "2026-09-18",
  investHelpOn: "2026-08-14",
  businessHelpOn: "2026-04-22",
  entity: "Vivid Money",
};

const DEFAULT_ENTITY = "personal";
const DEFAULT_PLAN = { personal: "standard", business: "start" };
const CASH = "EUR";
const ADR_NAMED = /\bADRs?\b|american deposit|depositary receipt/i;
const ETP = new Set(["ETF", "ETC", "ETN"]);

const ENTITIES = {
  personal: { id: "personal", name: "Vivid Invest", cash: CASH },
  business: { id: "business", name: "Vivid Business Brokerage", cash: CASH },
};

const ENTITY_ALIAS = {
  personal: "personal",
  invest: "personal",
  retail: "personal",
  private: "personal",
  standard: "personal",
  business: "business",
  treasury: "business",
  sme: "business",
  company: "business",
};

const PERSONAL_PLANS = {
  standard: {
    id: "standard",
    name: "Vivid Standard",
    fx: 0.01,
    crypto: 0.02,
    cryptoMin: 1,
    sub: null,
  },
  plus: {
    id: "plus",
    name: "Vivid Plus",
    fx: 0.007,
    crypto: 0.01,
    cryptoMin: 0,
    sub: "€6.90/month.",
  },
  prime: {
    id: "prime",
    name: "Vivid Prime",
    fx: 0.005,
    crypto: 0.0075,
    cryptoMin: 0,
    sub: "from €7.90/month.",
  },
};

const BUSINESS_PLANS = {
  start: {
    id: "start",
    name: "Vivid Free Start",
    fx: 0.0045,
    crypto: 0.02,
    cryptoMin: 1,
    etfAum: 0.01,
    sub: null,
  },
  basic: {
    id: "basic",
    name: "Vivid Basic",
    fx: 0.0035,
    crypto: 0.0145,
    cryptoMin: 0,
    etfAum: 0.0075,
    sub: "€6.90/month.",
  },
  pro: {
    id: "pro",
    name: "Vivid Pro",
    fx: 0.0025,
    crypto: 0.0095,
    cryptoMin: 0,
    etfAum: 0.0045,
    sub: "€18.90/month.",
  },
  enterprise: {
    id: "enterprise",
    name: "Vivid Enterprise",
    fx: 0.0015,
    crypto: 0.0045,
    cryptoMin: 0,
    etfAum: 0.0025,
    sub: null,
  },
  enterpriseplus: {
    id: "enterpriseplus",
    name: "Vivid Enterprise+",
    fx: 0.0005,
    crypto: 0.0025,
    cryptoMin: 0,
    etfAum: 0.0015,
    sub: null,
  },
};

const PLAN_ALIAS = {
  personal: {
    standard: "standard",
    std: "standard",
    free: "standard",
    plus: "plus",
    prime: "prime",
  },
  business: {
    start: "start",
    freestart: "start",
    free: "start",
    basic: "basic",
    pro: "pro",
    enterprise: "enterprise",
    enterpriseplus: "enterpriseplus",
    plus: "enterpriseplus",
  },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const settleCcy = (currency) => (code(currency) === "GBX" ? "GBP" : code(currency));
const isCrypto = (row) => code(row?.type) === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));
const isEtp = (row) => ETP.has(code(row?.type));
const cryptoBase = (ticker) => {
  const text = code(ticker);
  const cut = text.search(/[/_:-]/);
  return cut >= 0 ? text.slice(0, cut) : text.replace(/USD$|EUR$/, "");
};

const dollars = (amount, currency) => {
  const v = toUsd(amount, settleCcy(currency) || currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const toCcy = (amount, from, to) => {
  if (settleCcy(from) === settleCcy(to)) return Number(amount);
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(settleCcy(currency) || currency),
});

export function entityOf(name = DEFAULT_ENTITY) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return ENTITIES[ENTITY_ALIAS[key] || key] || null;
}

export function planOf(name, entity = DEFAULT_ENTITY) {
  const house = typeof entity === "string" ? entityOf(entity) : entity;
  if (!house) return null;
  const table = house.id === "business" ? BUSINESS_PLANS : PERSONAL_PLANS;
  const aliases = PLAN_ALIAS[house.id];
  const fallback = DEFAULT_PLAN[house.id];
  const key = String(name || fallback || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return table[aliases[key] || key] || null;
}

export function feeMarketOf(row) {
  if (isCrypto(row)) return "crypto";
  if (isEtp(row)) return "etf";
  return "stock";
}

export function ticketEach({ market, currency, entity, plan }) {
  const house = typeof entity === "string" ? entityOf(entity) : entity;
  const picked = typeof plan === "string" ? planOf(plan, house) : plan;
  if (!house || !picked || market === "crypto") return null;
  const ccy = settleCcy(currency);
  if (house.id === "personal") {
    if (ccy === "EUR" || ccy === "USD") return { amount: 1, currency: "EUR" };
    return null;
  }
  if (market === "etf") return { amount: 0, currency: "EUR" };
  if (ccy === "EUR") return { amount: 1, currency: "EUR" };
  if (ccy === "USD") return { amount: 1, currency: "USD" };
  return null;
}

export function fxRate({ currency, entity, plan }) {
  const house = typeof entity === "string" ? entityOf(entity) : entity;
  const picked = typeof plan === "string" ? planOf(plan, house) : plan;
  if (!house || !picked) return 0;
  const ccy = settleCcy(currency);
  if (!ccy || ccy === "EUR") return 0;
  if (house.id === "personal" && ccy !== "USD") return 0;
  return picked.fx;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rowsNamed(rows, asked, (r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked) return true;
    return isCrypto(r) && loose(cryptoBase(r.ticker)) === asked;
  });

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(place))) {
    const row =
      (wantCurrency && crypto.find((r) => code(r.currency) === wantCurrency)) ||
      crypto.find((r) => code(r.currency) === "EUR") ||
      crypto[0];
    return { named, matches: [{ row, ...listingKey(row) }] };
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
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
    const book = isCrypto(r)
      ? spreadLeaf(spreads, { isin: cryptoId(cryptoBase(r.ticker)), currency: "USD" })
      : spreadLeaf(spreads, {
          isin: r.isin,
          mic: venue?.mic ?? null,
          currency: r.currency,
          unsourced,
          broker: "vivid",
          ticker: r.ticker,
        });
    const market = feeMarketOf(r);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

function remarkOf({ entity, plan, market, adr }) {
  const lines = [];
  if (plan?.sub) lines.push(plan.sub);
  if (entity?.id === "business" && market === "etf" && plan?.etfAum) {
    lines.push(`ETF ${(plan.etfAum * 100).toFixed(2).replace(/\.?0+$/, "")}% a year.`);
  }
  if (adr) lines.push("ADR pass-through billed as incurred.");
  return lines.join("\n");
}

/**
 * The whole bill for buying `shares` at `price` (or putting `amount` into a
 * coin) and selling straight back. `usd` is the number the page prints;
 * `brokerFees` is Vivid's ticket, crypto percentage and, when the listing
 * is not euro, the conversion.
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  amount,
  bp = null,
  perShare = null,
  plan,
  entity = DEFAULT_ENTITY,
}) {
  const house = entityOf(entity);
  const picked = planOf(plan ?? DEFAULT_PLAN[house?.id], house);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: picked?.id ?? plan,
    entity: house?.id ?? entity,
    onlineBuy: true,
    cashCurrency: CASH,
  };

  if (!house) return { ...answer, why: `entité inconnue : ${entity} (personal|business)` };
  if (!picked) return { ...answer, why: `formule inconnue : ${plan}` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Vivid n'existe pas encore : lancer `node vivid/vivid_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Vivid` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Vivid`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const crypto = isCrypto(m.row);
  const market = feeMarketOf(m.row);
  const listingCcy = code(m.row.currency) || (crypto ? "EUR" : null);
  const book = crypto
    ? spreadLeaf(spreads, { isin: cryptoId(cryptoBase(m.row.ticker || etf)), currency: "USD" })
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: listingCcy,
        unsourced: m.unsourced,
        broker: "vivid",
        ticker: m.row.ticker,
      });

  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: crypto ? "Vivid Crypto" : m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: listingCcy,
    brokerExchange: m.row.exchange || null,
    adr: ADR_NAMED.test(String(m.row.name || "")),
  };

  const ticket = ticketEach({ market, currency: listing.currency, entity: house, plan: picked });
  if (!crypto && !ticket) {
    return {
      ...answer,
      listing,
      why: `${listing.currency || "cette devise"} n'a pas de ticket publié chez ${house.name}`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = crypto ? { known: true, buy: {}, sell: {} } : taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const fxPct = crypto ? 0 : fxRate({ currency: listing.currency, entity: house, plan: picked });

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: CASH,
    remark: remarkOf({ entity: house, plan: picked, market, adr: listing.adr }),
    bp: marketBp,
    perShare: marketPerShare,
    url: crypto ? SCHEDULE.crypto : house.id === "business" ? SCHEDULE.business : SCHEDULE.invest,
    basis: `barème ${house.name} ${picked.name}, palier ${market}, relu le ${SCHEDULE.readOn}`,
    tax,
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: fxPct * 2,
  };

  const n = Number(shares);
  const p = Number(price);
  const cash = Number(amount);
  const notional = n > 0 && p > 0 ? n * p : crypto && cash > 0 ? cash : null;

  if (crypto) {
    shared.commission = {
      rate: picked.crypto,
      min: picked.cryptoMin || 0,
      currency: "EUR",
      eachWay: true,
      plan: picked.id,
    };
  } else {
    shared.commission = {
      rate: 0,
      flat: ticket.amount,
      currency: ticket.currency,
      eachWay: true,
      plan: picked.id,
    };
  }

  if (notional == null) {
    return {
      ...shared,
      why: crypto
        ? "aucun montant"
        : !(n > 0)
          ? "aucun nombre de parts"
          : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        house,
        picked,
        market,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        via606: book.via606,
        fxPct,
        taxTotal,
        ticket,
        assumed: book.assumed,
      }),
    };
  }

  const notionalUsd = dollars(notional, crypto ? "USD" : listing.currency);
  let commissionUsd;
  let nativeEach = null;
  if (crypto) {
    const euros = toCcy(notional, "USD", "EUR");
    if (euros == null) {
      return { ...shared, why: "le montant n'a pas pu être converti en euros" };
    }
    nativeEach = Math.max(euros * picked.crypto, picked.cryptoMin || 0);
    commissionUsd = dollars(nativeEach * 2, "EUR");
  } else {
    nativeEach = ticket.amount;
    commissionUsd = dollars(nativeEach * 2, ticket.currency);
  }

  const bookUsd = crypto
    ? marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : 0
    : marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const taxUsd = crypto || notionalUsd == null ? 0 : notionalUsd * taxTotal;
  const fxUsd = fxPct && notionalUsd != null ? notionalUsd * fxPct * 2 : 0;
  const usd = plus(bookUsd, commissionUsd, taxUsd, fxUsd);
  const brokerFees = plus(commissionUsd, fxUsd);

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
      shares: n > 0 ? n : null,
      price: p > 0 ? p : null,
      amount: crypto ? notional : null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: crypto ? "USD" : listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
    },
    confidence: confidenceOf({
      house,
      picked,
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      via606: book.via606,
      fxPct,
      taxTotal,
      ticket,
      assumed: book.assumed,
      nativeEach,
      notionalUsd,
    }),
  };
}

function confidenceOf({
  house,
  picked,
  market,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  via606,
  fxPct,
  taxTotal,
  ticket,
  assumed,
  nativeEach,
  notionalUsd,
}) {
  const said = [];
  said.push(`barème ${house.name} ${picked.name} ${market}, relu le ${SCHEDULE.readOn}`);
  if (market === "crypto") {
    const min = picked.cryptoMin
      ? `, plancher ${picked.cryptoMin} €`
      : "";
    said.push(`${(picked.crypto * 100).toFixed(2)} % par jambe${min}`);
    if (nativeEach != null && picked.cryptoMin && notionalUsd != null) {
      const euros = toCcy(notionalUsd, "USD", "EUR");
      if (euros != null && euros * picked.crypto < picked.cryptoMin) {
        said.push(`le plancher ${picked.cryptoMin} € mord`);
      }
    }
  } else if (ticket) {
    said.push(
      ticket.amount
        ? `ticket ${ticket.amount} ${ticket.currency} par jambe`
        : `ticket 0 sur l'ETF / iBond (Business)`
    );
  }
  if (fxPct) {
    said.push(
      `change ${(fxPct * 100).toFixed(2)} % × 2 : ${listing.currency} n'est pas tenu, donc dans le total` +
        ` (rung par défaut, 2ᵉ mois, plus bas palier de turnover)`
    );
  } else if (market !== "crypto") {
    if (settleCcy(listing.currency) === "EUR") {
      said.push(`change hors du total : le compte tient déjà l'euro`);
    } else {
      said.push(
        `change hors du total : ${listing.currency} n'est pas l'euro, mais Vivid n'imprime un % que sur l'USD`
      );
    }
  }
  if (taxTotal) said.push(`taxe à l'achat ${(100 * taxTotal).toFixed(2)} % du montant, depuis taxMap.mjs`);
  said.push(`SEC / TAF / CAT / PTM ne sont pas nommés`);
  if (marketBp != null) {
    said.push(
      `carnet ${Number(marketBp.toPrecision(4))} bp` +
        (market === "crypto" && assumed ? `, plus large de Coinbase et Binance : Vivid ne nomme pas la place` : "")
    );
  } else if (marketPerShare != null) {
    said.push(
      via606
        ? `carnet 605 × Q IBKR, ${marketPerShare} $ la part`
        : `carnet NBBO reconstitué, ${marketPerShare} $ la part`
    );
  } else if (market === "crypto") {
    said.push(`pas de feuille crypto : le pourcentage est le seul frais Vivid`);
  } else {
    said.push(
      `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${
        unsourced?.why || "pas de source"
      }`
    );
  }
  if (house.id === "business" && market === "etf" && picked.etfAum) {
    said.push(
      `service fee ETF ${(picked.etfAum * 100).toFixed(2)} % / an, hors du trajet (page plans ${SCHEDULE.readOn})`
    );
  }
  said.push(`aucun aller-retour réel dans ce dépôt`);
  if (!leaf && market !== "crypto") said.push(`carnet absent pour cette ligne`);
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
          defaultEntity: DEFAULT_ENTITY,
          defaultPlan: DEFAULT_PLAN,
          entities: ENTITIES,
          personal: PERSONAL_PLANS,
          business: BUSINESS_PLANS,
          cash: CASH,
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
      "usage : node vivid/vivid_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--amount=a] [--plan=…] [--entity=personal|business] [--json]\n" +
        "        node vivid/vivid_cost.mjs --schedule\n" +
        "  ex.   node vivid/vivid_cost.mjs VWCE TRADEGATE EUR --shares=10 --price=140\n" +
        "        node vivid/vivid_cost.mjs AAPL NASDAQ USD --shares=10 --price=230 --plan=prime\n" +
        "        node vivid/vivid_cost.mjs AAPL NASDAQ USD --entity=business --shares=10 --price=230\n" +
        "        node vivid/vivid_cost.mjs BTC --amount=1000"
    );
    process.exit(2);
  }

  const house = flag("entity") || DEFAULT_ENTITY;
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    amount: flag("amount") ? Number(flag("amount")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan: flag("plan") || DEFAULT_PLAN[entityOf(house)?.id],
    entity: house,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);
  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce que Vivid propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.entity}/${out.plan}]\n`
  );

  if (out.trade) {
    const t = out.trade;
    if (t.amount != null) {
      console.log(`${t.amount} $ de crypto\n`);
    } else {
      console.log(
        `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
          (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
          "\n"
      );
    }
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    if (parts.change) console.log(`  change         : ${parts.change} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
