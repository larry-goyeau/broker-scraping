// What one round trip costs at Plum: buy n shares at price p, sell them
// back at once, in dollars.
//
// The affine triple hid the TAF ceiling. A 60 000-share US sell is $9.79,
// not 60 000 × $0.000195, and each of SEC, TAF and CAT is then rounded up
// to the cent — their $1 000 / 10-share Basic example already prints CAT
// and TAF as $0.01 a side. `roundTrip` is given the size and charges that.
//
// Two entities, re-read 2026-09-16 — rates unchanged since the 12th.
// Default is the UK card (Saveable Limited, FCA) on Basic — the en-gb
// legal page, effective 27 February 2026. `--plan=plus|boost|max` stays
// on that card. `--plan=eu` (aliases pro / premium) is Plum Money CY
// Limited (CySEC 407/21), 2026 Costs and Charges.
//
//   UK  Basic / Plus / Boost / Max
//     trade     £0.50 / 0.15 / 0.05 / 0     (2 free lifetime, not this trip)
//     FX        0.60 % / 0.45 % / 0.30 % / 0.15 %   per trade
//     monthly   £0 / 3.99 / 7.99 / 14.99    (remark if > 0; not in the number)
//   EU  Basic / Pro / Boost / Premium / Max
//     trade     €1 / 0.30 / 0.05 / 0 / 0    (2 free lifetime, not this trip)
//     FX stocks 0.25 % / 0.25 % / 0.12 % / 0.10 % / 0.10 %   per trade (EUR/USD)
//     monthly   €0 / 3.99 / 7.99 / 9.99 / 11.99 (FR Max; Boost FR 8.99)
//     ETF       same ticket, Upvest; no FX line (EUR book)
//
// US shares go to Alpaca. UCITS ETFs on the EU card go to Upvest. The UK
// card has no such book — its funds sit in the S&S ISA / GIA with an AUM
// fee, which is a holding cost and not this catalogue — so a UK plan on
// a non-US ETF is not sold. The OCR catalogue has no place or currency:
// a US ISIN is the American tape, anything else typed ETF/ETC is gettex
// EUR unless the csv names another book. The help-centre UK FX (0.25 %
// Basic) disagrees with the FCA page; the legal table and its $1 000
// example (0.60 %) are what is copied. The help-centre ETF AUM
// (0.70 / 0.45 / 0.20 %) is the old card: the 2026 EU PDF has tickets
// only, and an AUM would not be a trip cost anyway.
//
// The FX % × 2 sits in `usd` and in `brokerFees` when the listing is not
// the cash currency (GBP on UK, EUR on EU). SEC / TAF use the same
// current figures as the other files (their printed $8 / $13.80 per $1M
// and the EU TAF cap of $5.95 are stale). CAT is the printed
// ~$0.0000265 per share, both legs. Stamp / FTT come from the tax map.
// The remark only carries the monthly subscription when it is not free.
// A recurring order is free (UK shares, EU ETFs) but only ever buys, so
// it cannot close the round trip and stays out. No live trip: the
// tickets and % are the printed ones.
//
//   https://withplum.com/en-gb/legal/fees
//   https://withplum.com/api/files/file/EU%202026%20Costs%20and%20Charges.pdf
//   https://help.withplum.com/en/articles/12699453-stocks-fees
//   https://help.withplum.com/en/articles/9324666-etfs-fees
//
//   node plum/plum_cost.mjs AAPL --shares=10 --price=230
//   node plum/plum_cost.mjs AAPL --plan=max --shares=10 --price=230
//   node plum/plum_cost.mjs VWCE --plan=eu --shares=10 --price=120
//   node plum/plum_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("plum-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);
const ETFS_CSV = new URL("../etfs.csv", import.meta.url);
const STOCKS_CSV = new URL("../stocks.csv", import.meta.url);

const SCHEDULE = {
  uk: "https://withplum.com/en-gb/legal/fees",
  eu: "https://withplum.com/api/files/file/EU%202026%20Costs%20and%20Charges.pdf",
  stocksHelp: "https://help.withplum.com/en/articles/12699453-stocks-fees",
  etfHelp: "https://help.withplum.com/en/articles/9324666-etfs-fees",
  readOn: "2026-09-16",
  previouslyRead: "2026-09-12",
  ukRevised: "2026-02-27",
  entityUk: "Saveable Limited (UK), Alpaca / funds",
  entityEu: "Plum Money CY Limited (CY), Alpaca / Upvest",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const CAT_PER_SHARE = 0.0000265;
const CENT = 0.01;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const US_EX = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "BATS", "OTC"]);
const DEFAULT_PLAN = "basic";

const PLANS = {
  basic: {
    id: "basic",
    label: "Plum Basic",
    entity: "uk",
    cash: "GBP",
    ticket: 0.5,
    ticketCcy: "GBP",
    fx: 0.006,
    stockFx: 0.006,
    monthly: 0,
    monthlyCcy: "GBP",
  },
  plus: {
    id: "plus",
    label: "Plum Plus",
    entity: "uk",
    cash: "GBP",
    ticket: 0.15,
    ticketCcy: "GBP",
    fx: 0.0045,
    stockFx: 0.0045,
    monthly: 3.99,
    monthlyCcy: "GBP",
  },
  boost: {
    id: "boost",
    label: "Plum Boost",
    entity: "uk",
    cash: "GBP",
    ticket: 0.05,
    ticketCcy: "GBP",
    fx: 0.003,
    stockFx: 0.003,
    monthly: 7.99,
    monthlyCcy: "GBP",
  },
  max: {
    id: "max",
    label: "Plum Max",
    entity: "uk",
    cash: "GBP",
    ticket: 0,
    ticketCcy: "GBP",
    fx: 0.0015,
    stockFx: 0.0015,
    monthly: 14.99,
    monthlyCcy: "GBP",
  },
  eu: {
    id: "eu",
    label: "Plum Basic (EU)",
    entity: "eu",
    cash: "EUR",
    ticket: 1,
    ticketCcy: "EUR",
    fx: 0,
    stockFx: 0.0025,
    monthly: 0,
    monthlyCcy: "EUR",
  },
  pro: {
    id: "pro",
    label: "Plum Pro",
    entity: "eu",
    cash: "EUR",
    ticket: 0.3,
    ticketCcy: "EUR",
    fx: 0,
    stockFx: 0.0025,
    monthly: 3.99,
    monthlyCcy: "EUR",
  },
  "eu-boost": {
    id: "eu-boost",
    label: "Plum Boost (EU)",
    entity: "eu",
    cash: "EUR",
    ticket: 0.05,
    ticketCcy: "EUR",
    fx: 0,
    stockFx: 0.0012,
    monthly: 7.99,
    monthlyCcy: "EUR",
  },
  premium: {
    id: "premium",
    label: "Plum Premium",
    entity: "eu",
    cash: "EUR",
    ticket: 0,
    ticketCcy: "EUR",
    fx: 0,
    stockFx: 0.001,
    monthly: 9.99,
    monthlyCcy: "EUR",
  },
  "eu-max": {
    id: "eu-max",
    label: "Plum Max (EU)",
    entity: "eu",
    cash: "EUR",
    ticket: 0,
    ticketCcy: "EUR",
    fx: 0,
    stockFx: 0.001,
    monthly: 11.99,
    monthlyCcy: "EUR",
  },
};

const PLAN_ALIAS = {
  basic: "basic",
  uk: "basic",
  ukbasic: "basic",
  default: "basic",
  plus: "plus",
  ukplus: "plus",
  boost: "boost",
  ukboost: "boost",
  max: "max",
  ukmax: "max",
  eu: "eu",
  eubasic: "eu",
  eea: "eu",
  pro: "pro",
  eupro: "pro",
  euboost: "eu-boost",
  premium: "premium",
  eupremium: "premium",
  eumax: "eu-max",
  "eu-max": "eu-max",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isTracker = (row) => /^(ETF|ETC|ETN)$/i.test(String(row?.type || ""));

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

// Each regulatory line is rounded up to the cent on their worked example
// (10 × $0.0000265 CAT → $0.01). A charge nobody could compute stays missing.
const up = (value) =>
  value == null || Number.isNaN(value) ? null : value > 0 ? Math.ceil(value / CENT - 1e-9) * CENT : 0;

function toIsin(value) {
  const match = String(value || "").toUpperCase().match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function loadCsv(file, index) {
  if (!fs.existsSync(file)) return index;
  const push = (map, key, entry) => {
    if (!key) return;
    const list = map.get(key) || [];
    if (!list.some((row) => row.exchange === entry.exchange)) list.push(entry);
    map.set(key, list);
  };
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const ticker = loose(String(columns[0] || "").split(":").pop());
    const isin = toIsin(columns[2]) || columns.map(toIsin).find(Boolean);
    const exchange = String(columns[1] || "").trim().toUpperCase();
    const entry = { ticker, exchange, isin };
    push(index.byIsin, isin, entry);
    push(index.byTicker, ticker, entry);
  }
  return index;
}

const csvIndex = { byIsin: new Map(), byTicker: new Map() };
loadCsv(ETFS_CSV, csvIndex);
loadCsv(STOCKS_CSV, csvIndex);

function currencyOf(exchange) {
  const ex = loose(exchange);
  if (/NASDAQ|NYSE|AMEX|ARCA|BATS|OTC/.test(ex)) return "USD";
  if (/LSE|LONDON|XLON/.test(ex)) return "GBP";
  return "EUR";
}

function pickCsv(hits, { usTape, europeEtf }) {
  if (!hits?.length) return null;
  if (usTape) {
    return (
      hits.find((h) => US_EX.has(loose(h.exchange)) && loose(h.exchange) !== "OTC") ||
      hits.find((h) => US_EX.has(loose(h.exchange))) ||
      null
    );
  }
  if (europeEtf) {
    return (
      hits.find((h) => /GETTEX|XMUN/.test(loose(h.exchange))) ||
      hits.find((h) => /XETR|XETRA/.test(loose(h.exchange))) ||
      hits.find((h) => currencyOf(h.exchange) === "EUR") ||
      null
    );
  }
  return hits[0];
}

export function venueRow(row) {
  const isin = String(row?.isin || "").toUpperCase();
  const ticker = loose(row?.ticker || row?.query);
  const hits = csvIndex.byIsin.get(isin) || csvIndex.byTicker.get(ticker) || [];
  const tracker = isTracker(row);
  const europeEtf = tracker && !isin.startsWith("US");
  const usTape = !europeEtf;
  const hit = pickCsv(hits, { usTape, europeEtf });
  let exchange = row.exchange || hit?.exchange || "";
  let currency = row.currency || (exchange ? currencyOf(exchange) : "");
  if (!exchange || !currency) {
    if (europeEtf) {
      exchange = exchange || "GETTEX";
      currency = currency || "EUR";
    } else {
      exchange = exchange || "NASDAQ";
      currency = currency || "USD";
    }
  }
  return { ...row, exchange, currency };
}

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

export function feeMarketOf(row, mic) {
  const isin = String(row?.isin || "").toUpperCase();
  if (isTracker(row) && !isin.startsWith("US")) return "etf";
  const ex = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  if (US_MICS.has(m) || US_EX.has(ex) || isin.startsWith("US")) return "us";
  return isTracker(row) ? "etf" : "us";
}

export function commissionEach(_amount, plan) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (!picked) return null;
  return picked.ticket;
}

function fxRate(plan, market, listingCcy) {
  if (listingCcy === plan.cash) return 0;
  if (market === "us") return plan.stockFx;
  return plan.fx;
}

function remarkOf({ plan }) {
  const lines = [];
  if (plan.monthly) {
    const unit = plan.monthlyCcy === "GBP" ? "£" : "€";
    lines.push(`${plan.monthly} ${unit}/month.`);
  }
  return lines.join("\n");
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
    .map((r) => {
      const row = venueRow(r);
      return { row, ...listingKey(row) };
    })
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
    .map((r) => {
      const row = venueRow(r);
      return `${row.ticker || row.isin} ${row.currency || "?"} @ ${row.exchange || "place non dite"}`;
    })
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const raw of rows) {
    const r = venueRow(raw);
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
      broker: "plum",
      ticker: r.ticker,
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

function usBook(m, book) {
  if (book.leaf?.perShare != null) return book;
  const tape = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: "XNYS",
    currency: "USD",
    broker: "plum",
    ticker: m.row.ticker,
  });
  return tape.leaf?.perShare != null ? tape : book;
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `usd` is the number the page prints; `brokerFees` is only what Plum bills
 * (ticket + FX). SEC, TAF, CAT, stamp and the book stay in the total.
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
}) {
  const picked = planOf(plan);
  const answer = {
    usd: null,
    brokerFees: null,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: picked?.cash ?? "",
    venueAuthoritative: true,
    plan: picked?.id ?? plan,
  };

  if (!picked) {
    return { ...answer, why: `formule inconnue : ${plan} (basic|plus|boost|max|eu|pro|premium)` };
  }
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Plum n'existe pas encore : lancer `node plum/plum_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Plum` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Plum`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  let book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "plum",
    ticker: m.row.ticker,
  });
  const marketGuess = feeMarketOf(m.row, book.mic ?? m.venue?.mic);
  if (marketGuess === "us") book = usBook(m, book);

  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange:
      (book.mic && book.mic !== m.venue?.mic
        ? resolveVenue({ mic: book.mic, exchange: book.mic }).venue?.name
        : null) ||
      m.venue?.name ||
      m.unsourced?.name ||
      m.row.exchange ||
      null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row, listing.mic);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us" || US_MICS.has(listing.mic);
  const tax = taxesOf(listing.isin);
  const rates = { ...taxRates(tax) };
  delete rates.PTM_LEVY;
  delete rates.PTM;
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const converted = fxRate(picked, market, listing.currency);

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: picked.cash,
    onlineBuy: !(picked.entity === "uk" && market === "etf"),
    venueAuthoritative: market === "us",
    remark: remarkOf({ plan: picked }),
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? (picked.entity === "eu" ? SCHEDULE.eu : SCHEDULE.uk),
    basis: `barème ${picked.label}, palier ${market}, relu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      rate: null,
      min: null,
      flat: picked.ticket || null,
      currency: picked.ticketCcy,
      eachWay: true,
      plan: picked.id,
    },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: converted ? converted * 2 : 0,
  };

  if (picked.entity === "uk" && market === "etf") {
    return {
      ...shared,
      why: "l'entité britannique ne vend pas les UCITS d'Upvest : ses fonds sont l'ISA / le GIA, hors de ce catalogue",
      confidence: confidenceOf({
        picked,
        market,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        converted,
        american: false,
        withheld: "uk-etf",
      }),
    };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        picked,
        market,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        converted,
        american,
      }),
    };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const ticketUsd = picked.ticket ? dollars(picked.ticket * 2, picked.ticketCcy) : 0;
  const fxUsd = converted && notionalUsd != null ? notionalUsd * converted * 2 : 0;
  const bookUsd =
    marketPerShare != null
      ? american
        ? marketPerShare * n
        : dollars(marketPerShare * n, listing.currency)
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const secUsd = american && notionalUsd != null ? up(notionalUsd * SEC_RATE) : american ? null : 0;
  const tafRaw = american && n > 0 ? Math.min(n * TAF_PER_SHARE, TAF_CAP) : 0;
  const tafUsd = american ? up(tafRaw) : 0;
  const catEach = american && n > 0 ? up(n * CAT_PER_SHARE) : 0;
  const catUsd = american ? plus(catEach, catEach) : 0;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;

  const usd = plus(bookUsd, ticketUsd, fxUsd, secUsd, tafUsd, catUsd, taxUsd);
  const brokerFees = plus(ticketUsd, fxUsd);

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
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(ticketUsd, 6),
      réglementaire: american ? finite(plus(secUsd, tafUsd, catUsd), 6) : null,
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
    },
    sell: american
      ? {
          sec: finite(secUsd, 6),
          taf: finite(tafUsd, 6),
          cat: finite(catUsd, 6),
          tafCapped: tafRaw >= TAF_CAP,
        }
      : null,
    confidence: confidenceOf({
      picked,
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      converted,
      american,
      ticketUsd,
      tafCapped: american && tafRaw >= TAF_CAP,
    }),
  };
}

function confidenceOf({
  picked,
  market,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  converted,
  american,
  withheld,
  tafCapped,
}) {
  const said = [];
  said.push(
    `${picked.entity === "eu" ? SCHEDULE.entityEu : SCHEDULE.entityUk}, ${picked.label}, ` +
      `relu le ${SCHEDULE.readOn} (inchangé depuis le ${SCHEDULE.previouslyRead}` +
      (picked.entity === "uk" ? `, brochure du ${SCHEDULE.ukRevised}` : "") +
      `)`
  );
  if (withheld === "uk-etf") {
    said.push(
      `UCITS via Upvest : l'entité britannique ne les vend pas comme un titre ; ` +
        `ses fonds sont l'ISA / le GIA, un frais sur encours hors de cet aller-retour`
    );
    said.push(`aucun aller-retour réel dans ce dépôt`);
    return said.join(" ; ");
  }
  if (picked.ticket) {
    said.push(`ticket ${picked.ticket} ${picked.ticketCcy} par jambe`);
  } else {
    said.push(`ticket 0`);
  }
  if (converted) {
    said.push(
      `change ${(converted * 100).toFixed(2)} % × 2 : ${listing.currency} n'est pas le cash ${picked.cash}, ` +
        `donc dans le total` +
        (picked.entity === "uk"
          ? ` — le centre d'aide inverse les % UK et UE, le barème FCA et son exemple à 1 000 $ sont copiés`
          : "")
    );
  } else {
    said.push(`pas de change (${listing.currency} = cash ${picked.cash})`);
  }
  if (american) {
    said.push(
      `SEC ${SEC_RATE} du montant à la vente (leurs $13,80 / $8 par million sont périmés), ` +
        `TAF ${TAF_PER_SHARE} $/part plafonnée à ${TAF_CAP} $` +
        (tafCapped ? `, le plafond mord` : "") +
        ` (le PDF UE imprime encore $5,95) et CAT ${CAT_PER_SHARE} $/part aux deux jambes, ` +
        `le taux qu'ils publient, chaque ligne arrondie au centime comme sur leur exemple à 10 parts`
    );
  }
  if (picked.id === "eu-boost") {
    said.push(`Boost UE à 7,99 € / mois ; la France est à 8,99 € sur le PDF, non départagée ici`);
  }
  if (picked.id === "eu-max") {
    said.push(`Max UE à 11,99 € : le PDF le réserve à la France`);
  }
  if (marketBp != null) {
    said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  } else if (marketPerShare != null) {
    said.push(`carnet 605 × Q Alpaca, ${marketPerShare} $ la part`);
  } else {
    said.push(`pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}`);
  }
  said.push(`2 trades offerts à vie, hors de ce trajet`);
  said.push(`aucun aller-retour réel dans ce dépôt`);
  if (!leaf) said.push(`carnet absent pour cette ligne`);
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
          plans: Object.fromEntries(
            Object.entries(PLANS).map(([k, v]) => [
              k,
              {
                id: v.id,
                label: v.label,
                entity: v.entity,
                cash: v.cash,
                ticket: v.ticket,
                ticketCcy: v.ticketCcy,
                fx: v.fx,
                stockFx: v.stockFx,
                monthly: v.monthly,
                monthlyCcy: v.monthlyCcy,
                roundTripTicket: v.ticket * 2,
              },
            ])
          ),
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
      "usage : node plum_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=basic|plus|boost|max|eu|pro|premium|eu-max] [--json]\n" +
        "        node plum_cost.mjs --schedule\n" +
        "  ex.   node plum_cost.mjs AAPL --shares=10 --price=230\n" +
        "        node plum_cost.mjs AAPL --plan=max --shares=10 --price=230\n" +
        "        node plum_cost.mjs VWCE --plan=eu --shares=10 --price=120"
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
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que Plum propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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

  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
        "\n"
    );
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const p = out.parts || {};
    if (p.marché != null) console.log(`  carnet         : ${p.marché} $`);
    if (p.courtage != null) console.log(`  courtage       : ${p.courtage} $`);
    if (p.réglementaire) console.log(`  réglementaire  : ${p.réglementaire} $`);
    if (p.taxes) console.log(`  taxes          : ${p.taxes} $`);
    if (p.change) console.log(`  change         : ${p.change} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.url) console.log(`\n${out.url}`);
}
