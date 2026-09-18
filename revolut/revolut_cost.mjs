// What one round trip costs at Revolut: buy n shares at price p, sell them
// back at once, in dollars. Coins are bought by the amount, so they are
// handed that and no price.
//
// The affine triple hid the cliffs. A stock bills max(0.25 %, €1) a side
// on the Lithuanian card, a US sell bills TAF then stops at $9.79, and a
// crypto exchange under €200 pays a step instead of the percentage.
// `roundTrip` is given the size and charges what is charged.
//
// Two companies, re-read 2026-09-16. Default is Revolut Securities Europe
// UAB (`--entity=eu`), the catalogue's Lithuanian card. `--entity=uk` is
// Revolut Trading Ltd (GIA / ISA): same percentages, no €1 floor, billed
// in the instrument currency. Trading Pro is an add-on, not a row on the
// page — `--plan=pro` still prices its 0.12 % on top of Standard's FX and
// crypto.
//
//   EEA / US stock     0.25 %, min €1 (EU) / no min (UK)   Ultra / Pro 0.12 %
//   EEA ETF / ETC / ETN  0.10 % every plan, no minimum
//   crypto               1.49 % Standard / Plus, 0.99 % Premium / Metal,
//                        0.49 % Ultra, or the euro step under €200
//
// Two tickets read in the app on 2026-09-12 settle what the cards do not
// say: a stablecoin bought with its own currency costs nothing, and the
// crypto price itself carries a markup the ticket never names (1.23 %
// on BTC vs Kraken / Coinbase). The volume tiers that used to cut those
// percentages ended on 10 August 2026; the first-tier rates are now the
// flat card.
//
// Custody is 0 since 13 February 2024. No entry, exit or inactivity.
// The monthly free-trade grant (1 / 3 / 5 / 10) stays out of the number and
// sits in the remark, one figure per plan:
// a round trip is two orders, and even Standard's single grant cannot
// cover both legs. FX stays out too — the account holds EUR and USD —
// and is only reported for Standard (1 % above €1 000 / month) and Plus
// (0.5 %). France's help page prints a flat €1; the MiFID ex-ante still
// says max(0.25 %, €1), and that is what is copied. A Dutch US-stock
// PDF (v7.0-NL) prints 0.10 % for every plan; the English US card is
// still 0.25 % / 0.12 %. SEC / TAF use the current levies, not the
// stale $27.80 / $0.000166 / $8.30 the PDFs still quote. No CAT on
// either card. Stamp / FTT come from the tax map. Investment-plan and
// recurring ETF buys are free one way and cannot close the trip.
//
//   https://cdn.revolut.com/legal/terms/RSEUAB-ex-ante-costs-report-EEA-stocks-v3.2-EN.pdf
//   https://cdn.revolut.com/legal/terms/RSEUAB-ex-ante-costs-report-US-stocks-v6.3-EN.pdf
//   https://cdn.revolut.com/legal/terms/RSEUAB-ex-ante-costs-report-ETFs-v6.0-LT-EN.pdf
//   https://cdn.revolut.com/legal/terms/Revolut_Trading_Ltd/Ex-ante_Costs_and_Charges_Disclosure_US_Stocks_10042025.pdf
//   https://www.revolut.com/en-SI/legal/exchangingcryptocurrenciespersonalfees/
//
//   node revolut/revolut_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node revolut/revolut_cost.mjs AAPL NASDAQ USD --entity=uk --shares=10 --price=230
//   node revolut/revolut_cost.mjs VWCE TRADEGATE EUR --plan=ultra --shares=10 --price=120
//   node revolut/revolut_cost.mjs BTC --amount=1000
//   node revolut/revolut_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("revolut-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  eeaStocks: "https://cdn.revolut.com/legal/terms/RSEUAB-ex-ante-costs-report-EEA-stocks-v3.2-EN.pdf",
  usStocks: "https://cdn.revolut.com/legal/terms/RSEUAB-ex-ante-costs-report-US-stocks-v6.3-EN.pdf",
  etfs: "https://cdn.revolut.com/legal/terms/RSEUAB-ex-ante-costs-report-ETFs-v6.0-LT-EN.pdf",
  ukUs: "https://cdn.revolut.com/legal/terms/Revolut_Trading_Ltd/Ex-ante_Costs_and_Charges_Disclosure_US_Stocks_10042025.pdf",
  crypto: "https://www.revolut.com/en-SI/legal/exchangingcryptocurrenciespersonalfees/",
  readOn: "2026-09-16",
  previouslyRead: "2026-09-12",
  entity: "Revolut Securities Europe UAB",
  entityUk: "Revolut Trading Ltd",
  cryptoEntity: "Revolut Digital Assets Europe Ltd",
};

const DEFAULT_PLAN = "standard";
const DEFAULT_ENTITY = "eu";

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const CENT = 0.01;
const CUSTODY_UNTIL_2024 = 0.0012;
const STOCK_MIN = 1;

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "OTCM"]);
const US_EX = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "CBOE", "BATS", "OTC"]);
const ETP = new Set(["ETF", "ETC", "ETN"]);
const HOLD = new Set(["EUR", "USD"]);

const CRYPTO_STEPS = {
  "1.49": [[2, null], [5, 0.99], [25, 1.49], [100, 1.99], [150, 2.49], [200, 2.99]],
  "0.99": [[2, null], [50, 0.99], [150, 1.49], [200, 1.99]],
  "0.49": [[2, null], [200, 0.99]],
};

const CRYPTO_MARKUP_BP = 123;
const CRYPTO_MARKUP_READ = "2026-09-12 22:14 Paris, BTC 50 $";
const STABLECOINS = new Set(["USDC", "USDT", "DAI"]);

const PLANS = {
  standard: { id: "standard", label: "Revolut Standard", stock: 0.0025, etf: 0.001, crypto: 0.0149, fx: 0.01, free: 1, sub: 0 },
  plus: { id: "plus", label: "Revolut Plus", stock: 0.0025, etf: 0.001, crypto: 0.0149, fx: 0.005, free: 3, sub: 2.99 },
  premium: { id: "premium", label: "Revolut Premium", stock: 0.0025, etf: 0.001, crypto: 0.0099, fx: 0, free: 5, sub: 7.99 },
  metal: { id: "metal", label: "Revolut Metal", stock: 0.0025, etf: 0.001, crypto: 0.0099, fx: 0, free: 10, sub: 13.99 },
  ultra: { id: "ultra", label: "Revolut Ultra", stock: 0.0012, etf: 0.001, crypto: 0.0049, fx: 0, free: 10, sub: 45 },
  pro: { id: "pro", label: "Trading Pro", stock: 0.0012, etf: 0.001, crypto: 0.0149, fx: 0.01, free: 10, sub: 15 },
};

const PLAN_ALIAS = {
  standard: "standard",
  std: "standard",
  free: "standard",
  plus: "plus",
  premium: "premium",
  metal: "metal",
  ultra: "ultra",
  pro: "pro",
  tradingpro: "pro",
};

const ENTITIES = {
  eu: { id: "eu", label: "Revolut Securities Europe UAB", stockMin: STOCK_MIN },
  uk: { id: "uk", label: "Revolut Trading Ltd", stockMin: 0 },
};

const ENTITY_ALIAS = {
  eu: "eu",
  eea: "eu",
  lt: "eu",
  rseuab: "eu",
  uk: "uk",
  gb: "uk",
  gia: "uk",
  isa: "uk",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));
const isStablecoin = (row) => isCrypto(row) && STABLECOINS.has(String(row?.ticker || "").toUpperCase());
const isAdr = (row) => /\bADRs?\b|american deposit/i.test(String(row?.name || ""));

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

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

const up = (value) =>
  value == null || Number.isNaN(value) ? null : value > 0 ? Math.ceil(value / CENT - 1e-9) * CENT : 0;

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

export function entityOf(name = DEFAULT_ENTITY) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return ENTITIES[ENTITY_ALIAS[key] || key] || null;
}

export function feeMarketOf(row, mic) {
  const type = String(row?.type || "").toUpperCase();
  const ex = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  if (type === "CRYPTO" || ex === "CRYPTO") return "crypto";
  if (US_MICS.has(m) || US_EX.has(ex)) return "us";
  if (ETP.has(type)) return "etf";
  return "eea";
}

export function ruleOf(plan, market, { stablecoin = false, entity = DEFAULT_ENTITY } = {}) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  const house = typeof entity === "string" ? entityOf(entity) : entity;
  if (!picked || !market || !house) return null;
  if (market === "crypto") {
    if (stablecoin) return { rate: 0, min: 0, steps: null, currency: "EUR", stablecoin: true };
    const steps = CRYPTO_STEPS[(picked.crypto * 100).toFixed(2)] || null;
    const min = steps ? (steps.find(([, fee]) => fee != null)?.[1] ?? 0) : 0;
    return { rate: picked.crypto, min, steps, currency: "EUR" };
  }
  const currency = house.id === "uk" ? null : "EUR";
  if (market === "etf") return { rate: picked.etf, min: 0, currency: currency || "EUR" };
  return { rate: picked.stock, min: house.stockMin, currency: currency || "EUR" };
}

export function cryptoStep(amount, steps) {
  if (!steps || amount == null || !Number.isFinite(Number(amount))) return null;
  for (const [ceiling, fee] of steps) {
    if (Number(amount) < ceiling) return fee == null ? Number(amount) * 0.5 : fee;
  }
  return null;
}

export function commissionEach(amount, rule) {
  if (!rule) return null;
  const rate = rule.rate || 0;
  if (amount == null || !Number.isFinite(Number(amount))) return rate ? null : 0;
  let fee = Number(amount) * rate;
  const step = rule.steps ? cryptoStep(amount, rule.steps) : null;
  const floor = step ?? rule.min ?? 0;
  if (floor) fee = Math.max(floor, fee);
  return fee;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter(
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(place))) {
    const row =
      (wantCurrency && crypto.find((r) => String(r.currency).toUpperCase() === wantCurrency)) ||
      crypto.find((r) => String(r.currency).toUpperCase() === "EUR") ||
      crypto[0];
    const { venue, unsourced } = listingKey(row);
    return { named, matches: [{ row, venue, unsourced }] };
  }

  const matches = named
    .filter((r) => !isCrypto(r))
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
    const book = isCrypto(r)
      ? { leaf: null, mic: null }
      : spreadLeaf(spreads, {
          isin: r.isin,
          mic: venue?.mic ?? null,
          currency: r.currency,
          unsourced,
        });
    const market = feeMarketOf(r, book.mic ?? venue?.mic);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

function taxParts(isin) {
  const tax = taxesOf(isin);
  const rates = { ...taxRates(tax) };
  delete rates.PTM_LEVY;
  delete rates.PTM;
  const taxTotal = Object.values(rates).reduce((sum, rate) => sum + rate, 0);
  return { tax, rates, taxTotal };
}

function remarkOf({ plan, market, stablecoin, adr, currency }) {
  if (stablecoin) return "0% if same currency with the stablecoin.";
  const lines = [];
  if (plan.free) {
    lines.push(`${plan.free} free trade${plan.free > 1 ? "s" : ""}/month.`);
  }
  if (plan.sub) lines.push(`${plan.sub} €/month.`);
  if (plan.fx && market !== "crypto") {
    lines.push(fxRemark((plan.fx * 100).toFixed(2), currency));
  }
  if (adr) lines.push("ADR 0.01–0.05 $/share (holding).");
  return lines.join("\n");
}

/**
 * The whole bill for buying `shares` at `price` (or putting `amount` into a
 * coin) and selling straight back. `usd` is the number the page prints;
 * `brokerFees` is Revolut's commission and, on crypto, the measured markup.
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
  plan = DEFAULT_PLAN,
  entity = DEFAULT_ENTITY,
}) {
  const picked = planOf(plan);
  const house = entityOf(entity);
  const { named, matches } = findListing({ etf, place, currency });
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
    cashCurrency: "",
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (standard|plus|premium|metal|ultra|pro)` };
  if (!house) return { ...answer, why: `entité inconnue : ${entity} (eu|uk)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Revolut n'existe pas encore : lancer `node revolut/revolut_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Revolut` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Revolut`,
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
      });

  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: crypto ? "Crypto" : m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
    adr: isAdr(m.row),
  };

  const stablecoin = isStablecoin(m.row);
  const market = feeMarketOf(m.row, listing.mic);
  const ticketCcy = house.id === "uk" && market !== "crypto" ? listing.currency || "USD" : "EUR";
  const rule = {
    ...ruleOf(picked, market, { stablecoin, entity: house }),
    currency: ticketCcy,
  };
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us";
  const { tax, rates, taxTotal } = taxParts(listing.isin);
  const holdable = HOLD.has(listing.currency);

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: holdable ? listing.currency : crypto ? "USD" : "",
    onlineBuy: true,
    remark: remarkOf({ plan: picked, market, stablecoin, adr: listing.adr, currency: listing.currency }),
    bp: marketBp,
    perShare: marketPerShare,
    url:
      leaf?.url ??
      (crypto
        ? SCHEDULE.crypto
        : house.id === "uk"
          ? SCHEDULE.ukUs
          : market === "etf"
            ? SCHEDULE.etfs
            : american
              ? SCHEDULE.usStocks
              : SCHEDULE.eeaStocks),
    basis: `barème ${picked.label} / ${house.id}, palier ${market}, relu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      rate: rule.rate,
      min: rule.min || 0,
      cap: null,
      flat: null,
      currency: rule.currency,
      eachWay: true,
      plan: picked.id,
      entity: house.id,
      freeTradesPerMonth: picked.free,
      stablecoin: stablecoin || undefined,
    },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: picked.fx * 2,
    custody: 0,
  };

  const n = Number(shares);
  const p = Number(price);
  const cash = Number(amount);
  const notional = n > 0 && p > 0 ? n * p : crypto && cash > 0 ? cash : null;

  if (notional == null) {
    return {
      ...shared,
      why: crypto
        ? "aucun montant"
        : !(n > 0)
          ? "aucun nombre de parts"
          : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        picked,
        house,
        market,
        rule,
        listing,
        leaf,
        crypto,
        american,
        taxTotal,
        marketBp,
        marketPerShare,
        stablecoin,
        unsourced: m.unsourced,
      }),
    };
  }

  const fromCcy = crypto ? "USD" : listing.currency;
  const notionalUsd = dollars(notional, fromCcy);
  const nativeNotional = toCcy(notional, fromCcy, rule.currency);
  const each = commissionEach(nativeNotional, rule);
  const commissionUsd = each == null ? null : dollars(each * 2, rule.currency);

  const bookUsd = crypto
    ? stablecoin
      ? 0
      : notionalUsd == null
        ? null
        : (notionalUsd * CRYPTO_MARKUP_BP * 2) / 1e4
    : marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? american
          ? marketPerShare * n
          : dollars(marketPerShare * n, listing.currency)
        : null;

  const secUsd = american && notionalUsd != null ? up(notionalUsd * SEC_RATE) : american ? null : 0;
  const tafRaw = american && n > 0 ? Math.min(n * TAF_PER_SHARE, TAF_CAP) : 0;
  const tafUsd = american ? up(tafRaw) : 0;
  const taxUsd = crypto || notionalUsd == null ? (crypto ? 0 : null) : notionalUsd * taxTotal;

  const usd = plus(bookUsd, commissionUsd, secUsd, tafUsd, taxUsd);
  const brokerFees = crypto ? plus(bookUsd, commissionUsd) : commissionUsd;

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
      currency: fromCcy,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      réglementaire: american ? finite(plus(secUsd, tafUsd), 6) : null,
      taxes: finite(taxUsd, 6),
    },
    sell: american
      ? { sec: finite(secUsd, 6), taf: finite(tafUsd, 6), tafCapped: tafRaw >= TAF_CAP }
      : null,
    confidence: confidenceOf({
      picked,
      house,
      market,
      rule,
      listing,
      leaf,
      crypto,
      american,
      taxTotal,
      marketBp,
      marketPerShare,
      stablecoin,
      unsourced: m.unsourced,
      each,
      nativeNotional,
      tafCapped: american && tafRaw >= TAF_CAP,
    }),
  };
}

function confidenceOf({
  picked,
  house,
  market,
  rule,
  listing,
  leaf,
  crypto,
  american,
  taxTotal,
  marketBp,
  marketPerShare,
  stablecoin,
  unsourced,
  each,
  nativeNotional,
  tafCapped,
}) {
  const said = [];
  if (stablecoin) {
    said.push(
      `stablecoin sans frais ni palier, ticket lu le ${SCHEDULE.previouslyRead} : 50 $ rendent 50 USDC à 1,0000 pile`
    );
  } else {
    said.push(
      `${(rule.rate * 100).toFixed(2)} % par jambe sur le palier ${market} du plan ${picked.label} ` +
        `(${house.label}), relu le ${SCHEDULE.readOn} (inchangé depuis le ${SCHEDULE.previouslyRead})`
    );
  }
  if (rule.min && crypto && each != null && nativeNotional != null && each !== nativeNotional * (rule.rate || 0)) {
    said.push(
      `plancher ${each} € par jambe (palier sous 200 €) : le ticket lu le ${SCHEDULE.previouslyRead} ` +
        `a facturé 1,99 € / 2,31 $ en euro sur 50 $ de bitcoin`
    );
  } else if (rule.min && !crypto) {
    const floorBites =
      each != null && nativeNotional != null && each === rule.min ? `, le plancher mord` : "";
    said.push(
      `plancher ${rule.min} € par jambe, facturé en euro même sur une ligne en dollar${floorBites} ` +
        `— l'aide France imprime 1 € forfaitaire, l'ex-ante MiFID dit max(0,25 %, 1 €) : c'est celui-là`
    );
  } else if (market === "etf") {
    said.push(`aucun plancher sur les ETF : la fiche ne donne qu'un pourcentage`);
  } else if (house.id === "uk") {
    said.push(`pas de plancher £ / € sur Trading Ltd : le 0,25 % court dès la première part`);
  }
  if (crypto && rule.steps) {
    said.push(
      `sous 200 € la crypto paie un palier fixe plutôt que le pourcentage, et sous 2 € la moitié de l'échange ; ` +
        `les paliers de volume à 30 jours se sont arrêtés le 10 août 2026`
    );
  }
  said.push(
    `${picked.free} transaction${picked.free > 1 ? "s" : ""} gratuite${picked.free > 1 ? "s" : ""} par mois hors de ce calcul, ` +
      `qui chiffre l'aller-retour marginal, deux jambes facturées`
  );
  if (american) {
    said.push(
      `SEC ${SEC_RATE} du montant et TAF ${TAF_PER_SHARE} $/part à la vente, plafonnée à ${TAF_CAP} $` +
        (tafCapped ? `, le plafond mord` : "") +
        ` : la fiche imprime encore $27,80 / million et TAF $0,000166 plafonnée à $8,30`
    );
  }
  if (taxTotal > 0) said.push(`taxe de transfert ${(100 * taxTotal).toFixed(2)} % prise dans la carte des taxes`);
  if (market === "etf" && listing.type && listing.type !== "ETF") {
    said.push(
      `${listing.type} compté au tarif ETF : la fiche ne nomme que les parts de fonds, mais les trois produits cotés partent du même rayon`
    );
  }
  said.push(
    `garde 0 depuis le 13 février 2024, où les ${(100 * CUSTODY_UNTIL_2024).toFixed(2)} % annuels ont été supprimés`
  );
  if (picked.fx) {
    said.push(
      `change hors du total : le compte tient l'euro et le dollar, ${(picked.fx * 100).toFixed(2)} % seulement au-delà de 1 000 € convertis par mois`
    );
  } else {
    said.push(`change hors du total : ce plan ne facture pas la conversion`);
  }
  if (!crypto && marketBp == null && marketPerShare == null) {
    said.push(
      `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}`
    );
  } else if (marketBp != null) {
    said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  } else if (marketPerShare != null) {
    said.push(`carnet Rule 605, ${marketPerShare} $ la part`);
  }
  if (crypto && !stablecoin) {
    said.push(
      `marge de cotation ${(CRYPTO_MARKUP_BP / 100).toFixed(2)} % par jambe, mesurée et non publiée (${CRYPTO_MARKUP_READ}), ` +
        `vente supposée symétrique et bitcoin pris pour plancher : les paires moins liquides paient davantage`
    );
  }
  said.push(`un ticket d'achat lu, aucun aller-retour réel dans ce dépôt`);
  if (!leaf && !crypto) said.push(`carnet absent pour cette ligne`);
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
          defaultEntity: DEFAULT_ENTITY,
          plans: PLANS,
          entities: ENTITIES,
          stockMin: STOCK_MIN,
          secRate: SEC_RATE,
          tafPerShare: TAF_PER_SHARE,
          tafCap: TAF_CAP,
          custody: 0,
          custodyUntil2024: CUSTODY_UNTIL_2024,
          cryptoSteps: CRYPTO_STEPS,
          cryptoMarkupBp: CRYPTO_MARKUP_BP,
          cryptoMarkupRead: CRYPTO_MARKUP_READ,
          stablecoins: [...STABLECOINS],
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
      "usage : node revolut_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--amount=usd]\n" +
        "        [--plan=standard|plus|premium|metal|ultra|pro] [--entity=eu|uk] [--json]\n" +
        "        node revolut_cost.mjs --schedule\n" +
        "  ex.   node revolut_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node revolut_cost.mjs AAPL NASDAQ USD --entity=uk --shares=1 --price=230\n" +
        "        node revolut_cost.mjs VWCE TRADEGATE EUR --plan=ultra --shares=10 --price=120\n" +
        "        node revolut_cost.mjs BTC --amount=1000"
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
    plan: flag("plan") || DEFAULT_PLAN,
    entity: flag("entity") || DEFAULT_ENTITY,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que Revolut propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  const picked = planOf(out.plan);
  const house = entityOf(out.entity);
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${picked?.label || out.plan} / ${house?.id || out.entity}, ${out.feeMarket}]\n`
  );

  if (out.trade) {
    const t = out.trade;
    if (t.amount != null) {
      console.log(`${t.amount} ${t.currency} aller-retour\n`);
    } else {
      console.log(
        `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
          (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
          "\n"
      );
    }
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const p = out.parts || {};
    if (p.marché != null) console.log(`  carnet         : ${p.marché} $`);
    if (p.courtage != null) console.log(`  courtage       : ${p.courtage} $`);
    if (p.réglementaire) console.log(`  réglementaire  : ${p.réglementaire} $`);
    if (p.taxes) console.log(`  taxes          : ${p.taxes} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.url) console.log(`\n${out.url}`);
}
