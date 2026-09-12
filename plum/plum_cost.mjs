// What one round trip costs at Plum: buy n shares at price p, sell them
// back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in. The trade fee is a flat ticket, so it
// lives in `c`.
//
// Two entities, read 2026-09-12. Default is the UK card (Saveable Limited,
// FCA) on Basic — the en-gb legal page, effective 27 February 2026.
// `--plan=plus|boost|max` stays on that card. `--plan=eu` (aliases pro /
// premium) is Plum Money CY Limited (CySEC 407/21), 2026 Costs and Charges.
//
//   UK  Basic / Plus / Boost / Max
//     trade     £0.50 / 0.15 / 0.05 / 0     (2 free lifetime, not this trip)
//     FX        0.60 % / 0.45 % / 0.30 % / 0.15 %   per trade
//     monthly   £0 / 3.99 / 7.99 / 14.99    (remark if > 0; not in a)
//   EU  Basic / Pro / Boost / Premium / Max
//     trade     €1 / 0.30 / 0.05 / 0 / 0    (2 free lifetime, not this trip)
//     FX stocks 0.25 % / 0.25 % / 0.12 % / 0.10 % / 0.10 %   per trade (EUR/USD)
//     monthly   €0 / 3.99 / 7.99 / 9.99 / 11.99 (FR Max; Boost FR 8.99)
//     ETF       same ticket, Upvest; no FX line (EUR book)
//
// US shares go to Alpaca. UCITS ETFs on the EU card go to Upvest (gettex
// tickers in the catalogue). The OCR catalogue has no place or currency:
// a US ISIN is the American tape, anything else typed ETF/ETC is gettex
// EUR unless the csv names another book. The help-centre UK FX (0.25 %
// Basic) disagrees with the FCA page; the legal table and its $1 000
// example (0.60 %) are what is copied.
//
// The FX % × 2 sits in `a` when the listing is not the cash currency
// (GBP on UK, EUR on EU). SEC / TAF use the same current figures as the
// other files (their printed $8 / $13.80 per $1M are stale). CAT is the
// printed ~$0.0000265 per share, both legs, so twice in `b`. Stamp / FTT
// come from the tax map. The remark only carries what `a`, `b` and `c` do
// not: the monthly subscription when it is not free. A recurring order is
// free (UK shares, EU ETFs) but only ever buys, so it cannot close the round
// trip and stays out. No live trip: the coefficients are the
// printed tickets and %.
//
//   https://withplum.com/en-gb/legal/fees
//   https://withplum.com/api/files/file/EU%202026%20Costs%20and%20Charges.pdf
//   https://help.withplum.com/en/articles/12699453-stocks-fees
//   https://help.withplum.com/en/articles/9324666-etfs-fees
//
//   node plum/plum_cost.mjs AAPL
//   node plum/plum_cost.mjs AAPL --plan=max
//   node plum/plum_cost.mjs VWCE --plan=eu
//   node plum/plum_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
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
  readOn: "2026-09-12",
  ukRevised: "2026-02-27",
  entityUk: "Saveable Limited (UK), Alpaca / funds",
  entityEu: "Plum Money CY Limited (CY), Alpaca / Upvest",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const CAT_PER_SHARE = 0.0000265;
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

  const named = rows.filter(
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

export function exactCost({ amount, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const each = commissionEach(amount, picked);
  if (each == null || !picked) return { commission: null, currency: QUOTE };
  return {
    commission: dollars(each * 2, picked.ticketCcy),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: picked.ticketCcy },
    plan: picked.id,
  };
}

export function roundTripCost({
  etf,
  place,
  currency,
  bp = null,
  perShare = null,
  plan = DEFAULT_PLAN,
}) {
  const picked = planOf(plan);
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    b: 0,
    c: 0,
    ccy: QUOTE,
    floor: null,
    cap: null,
    threshold: null,
    plan: picked?.id ?? plan,
    etf,
    place,
    currency,
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
  });
  const marketGuess = feeMarketOf(m.row, book.mic ?? m.venue?.mic);
  if (marketGuess === "us" && book.leaf?.perShare == null) {
    const tape = spreadLeaf(spreads, {
      isin: m.row.isin,
      mic: "XNYS",
      currency: "USD",
    });
    if (tape.leaf?.perShare != null) book = tape;
  }

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
  const knownPct = taxTotal + (american ? SEC_RATE : 0) + converted * 2;
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => (american ? x : dollars(x, listing.currency)),
  });
  const a = plus(mkt.a, knownPct);
  const cat = american ? CAT_PER_SHARE * 2 : 0;
  const taf = american ? TAF_PER_SHARE : 0;
  const ticketUsd = picked.ticket ? dollars(picked.ticket * 2, picked.ticketCcy) : 0;

  return {
    ...answer,
    a: finite(a, 4),
    b: finite(plus(mkt.b, taf + cat), 6),
    c: ticketUsd || 0,
    listing,
    feeMarket: market,
    remark: remarkOf({ plan: picked }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(rates).length ? rates : null,
      réglementaire: american
        ? { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part`, CAT: `${CAT_PER_SHARE} par part × 2` }
        : null,
      commission: null,
      change: converted ? converted * 2 : null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? (picked.entity === "eu" ? SCHEDULE.eu : SCHEDULE.uk),
    basis: `barème ${picked.label}, palier ${market}, lu le ${SCHEDULE.readOn}`,
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
    cap: american ? { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" } : null,
    fx: fxNote(listing.currency),
    fxIfConverted: converted ? converted * 2 : 0,
    confidence:
      `${picked.entity === "eu" ? SCHEDULE.entityEu : SCHEDULE.entityUk}, ${picked.label}, ` +
      `lu le ${SCHEDULE.readOn}` +
      (picked.entity === "uk" ? ` (brochure du ${SCHEDULE.ukRevised})` : "") +
      `. ` +
      (picked.ticket
        ? `Ticket ${picked.ticket} ${picked.ticketCcy} par jambe dans c. `
        : `Ticket 0. `) +
      (converted
        ? `Change ${(converted * 100).toFixed(2)} % × 2 dans a. `
        : `Pas de change (${listing.currency} = cash ${picked.cash}). `) +
      (american ? `SEC + TAF + CAT (les deux jambes). ` : "") +
      `2 trades offerts hors de a. ` +
      `Aucun aller-retour réel dans ce dépôt.` +
      (leaf ? "" : ` Pas de feuille de carnet pour cet ISIN / cette place.`),
  };
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
        "  ex.   node plum_cost.mjs AAPL\n" +
        "        node plum_cost.mjs AAPL --plan=max\n" +
        "        node plum_cost.mjs VWCE --plan=eu"
    );
    process.exit(2);
  }

  const plan = flag("plan") || DEFAULT_PLAN;
  const out = roundTripCost({
    etf,
    place,
    currency,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (out.a == null && !out.listing) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
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

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.change) detail.push(`change ${out.parts.change}`);
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : 605 / TAF / CAT" : " : rien"})`);
  console.log(`c = ${out.c} $   (par ordre${out.c ? " : ticket plat" : " : rien"})`);
  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(
    `\ncoût = ${out.a} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ${out.b} × n + ${out.c}   ($ ; p en ${l.currency})`
  );
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) console.log(`\n${out.remark}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency);
    const affine = amountUsd != null && out.a != null ? out.a * amountUsd + out.b * n + out.c : null;
    const billed = exactCost({ amount, plan: out.plan });
    console.log(
      `\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` +
        (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : "")
    );
    if (affine != null) console.log(`  a, b, c        : ${affine.toFixed(4)} $`);
    if (billed.commission != null) {
      console.log(
        `  commission     : ${Number(billed.commission).toFixed(4)} $` +
          (billed.native?.each != null
            ? ` (${Number(billed.native.each).toPrecision(4)} ${billed.native.currency} × 2)`
            : "")
      );
    }
  }
  if (out.url) console.log(`\n${out.url}`);
}
