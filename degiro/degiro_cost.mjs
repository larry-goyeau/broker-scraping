// What one round trip costs at DEGIRO NL: buy n shares at price p, sell them
// back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in. The published ticket is a flat euro
// amount every order, so it lives in `c`. Crypto is the exception: 0.29 %
// sits in `a`, the €0.01 minimum in the floor (`min fees`, `c` = 0).
//
// flatexDEGIRO Bank Dutch Branch, Basic / Active / Trader, schedule from
// 1 January 2026, read 2026-09-10. Custody prints the same stock / tracker
// tickets; it is not a second coefficient. Options, futures, bonds, funds
// and BNP / SGC OTC warrants are not in this catalogue.
//
//   Stocks   AMS / BRU                         2.00 € + 1.00 € handling
//            US / CA                           1.00 € + 1.00 € handling
//            Europe (Xetra, Tradegate, …)      3.90 € + 1.00 € handling
//            ASX / Frankfurt floor / HK / SG / Tokyo
//                                              5.00 € + 1.00 € handling
//   Trackers Tradegate (Kernselectie)          0.00 € + 1.00 € handling
//            other venues                      2.00 € + 1.00 € handling
//   Crypto   Tradias                           0.29 %, min 0.01 €, no handling
//
// Handling is €1 on every order except Tradegate stocks and crypto. It
// covers third-party fees (clearing, SEC, TAF, execution), so those stay
// out of `a` / `b`. Fair Use on the Kernselectie was withdrawn with the
// October 2025 rewrite: every Tradegate tracker is €0 + €1.
//
// Cash is euro by default. AutoFX 0.25 % is processed in the fill on each
// non-EUR leg, so 0.50 % the round trip sits in `a`. Manual FX
// (€10 + 0.25 %, USD / GBP cash) is not this trip. Stamp / FTT come from
// the tax map. PTM £1.50 above £10 000 on a London STOCK is a threshold.
// Connectivity (€2.50 / year per exchange, max 0.25 % AUM) is a holding
// cost: not AMS, BRU, Tradias, or the Kernselectie. Custody 0, inactivity 0.
//
// One live trip on 2026-09-10, Basic, EUR cash 290 €. Market buy of 1 AAPL
// was refused (pad 324.44 €). Limit buy at 326.29 filled 322.86, market sell
// 322.83. checkOrder 2 € each way. Cash 290.00 → 284.58. After the 4 €
// tickets and 0.03 $ of stock, 1.39 € remains: 0.50 % of the mid notional.
// `a` keeps AutoFX 0.25 % × 2. No SEC / TAF outside the handling.
//
//   https://www.degiro.nl/tarieven
//   https://www.degiro.nl/data/pdf/Tarievenoverzicht.pdf
//   https://www.degiro.nl/tarieven/etf-kernselectie
//
//   node degiro/degiro_cost.mjs AAPL
//   node degiro/degiro_cost.mjs AAPL NDQ USD --shares=1 --price=230
//   node degiro/degiro_cost.mjs EUNL TDG EUR
//   node degiro/degiro_cost.mjs EUNL XET EUR
//   node degiro/degiro_cost.mjs IWDA EAM EUR
//   node degiro/degiro_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("degiro-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.degiro.nl/data/pdf/Tarievenoverzicht.pdf",
  page: "https://www.degiro.nl/tarieven",
  core: "https://www.degiro.nl/tarieven/etf-kernselectie",
  readOn: "2026-09-10",
  revised: "2026-01-01",
  entity: "DEGIRO (flatexDEGIRO Bank Dutch Branch, NL)",
};

const FX_EACH_WAY = 0.0025;
const CHECK = {
  isin: "US0378331005",
  ticker: "AAPL",
  venue: "NDQ",
  n: 1,
  buy: 322.86,
  sell: 322.83,
  commissionEach: 2,
  cash: { start: 290, end: 284.58 },
  fxRoundTrip: 0.00502,
  on: "2026-09-10",
};
const CRYPTO_RATE = 0.0029;
const CRYPTO_MIN = 0.01;
const PTM = { each: 1.5, currency: "GBP", above: 10000 };
const XETRA_GOLD = "DE000A0S9GB0";
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);

const HOME = new Set(["EAM", "EBR"]);
const US_CA = new Set(["NDQ", "NSY", "ASE", "TOR", "TSV", "CSE"]);
const ASIA = new Set(["ASX", "FRA", "HKS", "SGX", "TSE"]);
const EUROPE = new Set([
  "XET",
  "TDG",
  "EPA",
  "MIL",
  "LSE",
  "SWX",
  "MAD",
  "IRL",
  "ELI",
  "OSL",
  "OMX",
  "HSE",
  "OMK",
  "ATH",
  "WSE",
  "WEN",
  "PSE",
]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

const isTracker = (type) => /^(ETF|ETN|ETC)$/i.test(type || "");

export function feeMarketOf(row) {
  const code = loose(row?.exchange);
  const type = String(row?.type || "").toUpperCase();
  if (type === "CRYPTO" || code === "TRD") return "crypto";
  if (isTracker(type)) return code === "TDG" ? "etf_core" : "etf";
  if (HOME.has(code)) return "home";
  if (US_CA.has(code)) return "us_ca";
  if (ASIA.has(code)) return "asia";
  if (EUROPE.has(code)) return "europe";
  return null;
}

// Commission and handling in euros, one way. The Degiro hiq code is the
// source of the band: FRA is the Frankfurt floor (€5), not Xetra, and CSE
// is the Canadian Securities Exchange (€1), not Copenhagen.
export function ticketOf(row) {
  const market = feeMarketOf(row);
  const code = loose(row?.exchange);
  if (!market) return null;
  if (market === "crypto") {
    return { market, comm: 0, handling: 0, rate: CRYPTO_RATE, min: CRYPTO_MIN, each: null };
  }
  if (market === "etf_core") {
    return { market, comm: 0, handling: 1, rate: 0, min: 0, each: 1 };
  }
  if (market === "etf") {
    return { market, comm: 2, handling: 1, rate: 0, min: 0, each: 3 };
  }
  const comm = market === "home" ? 2 : market === "us_ca" ? 1 : market === "asia" ? 5 : 3.9;
  const handling = code === "TDG" ? 0 : 1;
  return { market, comm, handling, rate: 0, min: 0, each: comm + handling };
}

function connectivityOf(row, market) {
  const code = loose(row?.exchange);
  if (HOME.has(code) || market === "crypto" || market === "etf_core") return false;
  return true;
}

function remarkOf({ row, market, isin }) {
  const lines = [];
  if (market === "crypto") lines.push("min fees 0.02 €.");
  if (connectivityOf(row, market)) lines.push("Connectivity 2.50 €/year per exchange.");
  if (String(isin || "").toUpperCase() === XETRA_GOLD) {
    lines.push("Xetra-Gold custody 0.025%/month.");
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
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
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
    const market = feeMarketOf(r) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

function thresholdOf(listing) {
  if (String(listing.type || "").toUpperCase() !== "STOCK") return null;
  if (listing.mic !== "XLON") return null;
  return {
    c: dollars(2 * PTM.each, "GBP"),
    currency: QUOTE,
    above: PTM.above,
    aboveCurrency: "GBP",
    why: `prélèvement PTM de ${PTM.each} £ par ordre et par sens, au-delà de ${PTM.above} £`,
  };
}

export function exactCost({ amount, row, market } = {}) {
  const ticket = ticketOf(row || { type: market === "crypto" ? "CRYPTO" : "STOCK", exchange: "" });
  if (!ticket) return { commission: null, currency: QUOTE };
  if (ticket.rate) {
    const n = Number(amount);
    const each = Number.isFinite(n) ? Math.max(ticket.min, n * ticket.rate) : ticket.min;
    return {
      commission: dollars(each * 2, "EUR"),
      currency: QUOTE,
      native: { each, roundTrip: each * 2, currency: "EUR" },
      market: ticket.market,
    };
  }
  return {
    commission: dollars(ticket.each * 2, "EUR"),
    currency: QUOTE,
    native: { each: ticket.each, roundTrip: ticket.each * 2, currency: "EUR" },
    market: ticket.market,
  };
}

export function roundTripCost({ etf, place, currency, bp = null, perShare = null }) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    b: 0,
    c: 0,
    ccy: QUOTE,
    floor: null,
    cap: null,
    threshold: null,
    etf,
    place,
    currency,
  };

  if (!catalogue) {
    return { ...answer, why: "le catalogue DEGIRO n'existe pas encore : lancer `node degiro/degiro_scraping.mjs`" };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue DEGIRO` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez DEGIRO`,
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
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const ticket = ticketOf(m.row);
  if (!ticket) {
    return {
      ...answer,
      listing,
      why: `${listing.brokerExchange} n'a pas de palier publié pour ce type`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = US_MICS.has(listing.mic);
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const fxPct = listing.currency === "EUR" ? 0 : FX_EACH_WAY * 2;
  const ratePct = ticket.rate ? ticket.rate * 2 : 0;
  const knownPct = taxTotal + fxPct + ratePct;
  // No book and nothing proportional (EUR Tradegate, no tax) is unknown, not 0 %.
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => (american ? x : dollars(x, listing.currency)),
  });
  const a = plus(mkt.a, knownPct);
  const bookUsd = mkt.b;
  const ticketUsd = ticket.each != null ? dollars(ticket.each * 2, "EUR") ?? 0 : 0;
  const floorUsd = ticket.rate ? dollars(ticket.min * 2, "EUR") : null;

  return {
    ...answer,
    a: finite(a, 4),
    b: finite(bookUsd, 6),
    c: Number(ticketUsd.toPrecision(6)),
    floor: floorUsd,
    listing,
    feeMarket: ticket.market,
    remark: remarkOf({ row: m.row, market: ticket.market, isin: listing.isin }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(rates).length ? rates : null,
      change: fxPct || null,
      commission: ratePct || null,
      ticket: ticket.each != null ? { each: ticket.each, comm: ticket.comm, handling: ticket.handling } : null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème DEGIRO NL ${ticket.market}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      each: ticket.each,
      roundTrip: ticket.each != null ? ticket.each * 2 : null,
      comm: ticket.comm,
      handling: ticket.handling,
      rate: ticket.rate || null,
      min: ticket.min || null,
      currency: "EUR",
      eachWay: true,
    },
    ccy: QUOTE,
    cap: null,
    threshold: thresholdOf(listing),
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `DEGIRO NL Basic/Active/Trader, palier ${ticket.market}, barème du ${SCHEDULE.revised} lu le ${SCHEDULE.readOn}. ` +
      (ticket.rate
        ? `Crypto ${(ticket.rate * 100).toFixed(2)} % par jambe, plancher ${ticket.min} €, pas de handling. `
        : `Ticket ${ticket.comm} € + handling ${ticket.handling} € par jambe dans c. `) +
      (fxPct ? `AutoFX ${(FX_EACH_WAY * 100).toFixed(2)} % par jambe dans a. ` : `Cotation EUR : pas de change. `) +
      `SEC / TAF dans le handling, pas dans a ni b. ` +
      `Aller-retour AAPL NDQ le ${CHECK.on} : tickets ${CHECK.commissionEach} €, cash ${CHECK.cash.start} → ${CHECK.cash.end}, AutoFX ${(CHECK.fxRoundTrip * 100).toFixed(2)} % RT. ` +
      (leaf ? "" : `Pas de feuille de carnet pour cet ISIN / cette place. `),
    check: american ? CHECK : null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, coverage: coverage() }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node degiro_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node degiro_cost.mjs --schedule\n" +
        "  ex.   node degiro_cost.mjs AAPL\n" +
        "        node degiro_cost.mjs AAPL NDQ USD --shares=1 --price=230\n" +
        "        node degiro_cost.mjs EUNL TDG EUR\n" +
        "        node degiro_cost.mjs IWDA EAM EUR"
    );
    process.exit(2);
  }

  const out = roundTripCost({
    etf,
    place,
    currency,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (out.a == null && !out.listing) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce que DEGIRO propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.change) detail.push(`change ${out.parts.change}`);
  if (out.parts?.commission) detail.push(`courtage ${out.parts.commission}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : spread 605" : " : rien"})`);
  console.log(
    `c = ${out.c} $   (par ordre : ${
      out.parts?.ticket
        ? `${out.parts.ticket.comm} € + ${out.parts.ticket.handling} € × 2`
        : "ticket dans la remark, pas dans c"
    })`
  );
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
  if (out.remark) console.log(out.remark);
  if (out.why) console.log(out.why);
  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(
    `\ncoût = ${out.a} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ${out.b} × n + ${out.c}   ($ ; p en ${l.currency})`
  );
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency);
    const extra = out.threshold && amount >= out.threshold.above ? out.threshold.c : 0;
    const affine = amountUsd != null && out.a != null ? out.a * amountUsd + out.b * n + out.c + extra : null;
    const billed = exactCost({ amount, row: { type: l.type, exchange: l.brokerExchange } });
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
