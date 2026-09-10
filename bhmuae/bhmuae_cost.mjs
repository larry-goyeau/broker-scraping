// What one round trip costs at BHM Capital: buy n shares at price p, sell
// them back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in.
//
// BHM Capital Financial Services PJSC (AE, SCA). The catalogue is Rubix
// (`trading.bhmuae.ae`, `bhmuae_scraping.mjs`). This login's book is DFM and Nasdaq
// Dubai (AED and USD). ADX is on the same local card and is wired; ADSM /
// TDWL are mapped in the scraper in case a later dump actually has them.
// International executions (US 0.03 $ / share, KSA 0.22 %, …) sit further
// down the same page and are not copied — they are not in this book.
//
// The printed % × 2 sits in `a`. VAT is charged line by line on the card
// (most 5 %, DFM CMA 0 %) and is folded into that rate. DFM and Nasdaq
// Dubai also print a flat ORDER FEE (10 AED / 3 USD / 10 AED), plus VAT;
// that is a ticket every time, not a minimum of the %, so it lives in `c`
// (`cAed` / `cUsd` stay as the source figure). ADX has no order fee.
// `exactCost` adds % and ticket. No live trip is in this deposit yet.
//
//   https://www.bhmuae.ae/pricing/
//
//   node bhmuae/bhmuae_cost.mjs CHAE
//   node bhmuae/bhmuae_cost.mjs AIRARABIA DFM AED --shares=1 --price=3
//   node bhmuae/bhmuae_cost.mjs ABTC NASDAQDUBAI USD --shares=1 --price=20
//   node bhmuae/bhmuae_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("bhmuae-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.bhmuae.ae/pricing/",
  readOn: "2026-09-10",
  entity: "BHM Capital Financial Services PJSC (AE)",
};

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);

// `parts` are of notional per side. `ticket` is charged every order, in
// `ticketCcy`, then VAT if `ticketVat` is set.
const RULE = {
  dfm: {
    parts: [
      { name: "MARKET", rate: 0.001, vat: 0.05 },
      { name: "BROKER", rate: 0.00125, vat: 0.05 },
      { name: "CMA", rate: 0.0005, vat: 0 },
    ],
    ticket: 10,
    ticketCcy: "AED",
    ticketVat: 0.05,
  },
  adx: {
    parts: [
      { name: "MARKET", rate: 0.00025, vat: 0.05 },
      { name: "BROKER", rate: 0.00125, vat: 0.05 },
    ],
  },
  difx_usd: {
    parts: [
      { name: "DIFX", rate: 0.001, vat: 0.05 },
      { name: "BROKER", rate: 0.00125, vat: 0.05 },
    ],
    ticket: 3,
    ticketCcy: "USD",
    ticketVat: 0.05,
  },
  difx_aed: {
    parts: [
      { name: "DIFX", rate: 0.001, vat: 0.05 },
      { name: "BROKER", rate: 0.00125, vat: 0.05 },
    ],
    ticket: 10,
    ticketCcy: "AED",
    ticketVat: 0.05,
  },
};

const TO_VENUES = {
  ADSM: "ADX",
  DIFX: "NASDAQDUBAI",
};

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

const venueRow = (row) => ({
  ...row,
  exchange: TO_VENUES[row.exchange] || row.exchange,
});

export function rateOf(rule) {
  if (!rule?.parts) return 0;
  return rule.parts.reduce((sum, line) => sum + line.rate * (1 + (line.vat || 0)), 0);
}

export function ticketOf(rule) {
  if (!rule?.ticket) return 0;
  return rule.ticket * (1 + (rule.ticketVat || 0));
}

function remarkOf({ market } = {}) {
  const r = RULE[market];
  if (!r?.ticket || r.ticketCcy === "USD") return "";
  const printed = r.ticketCcy === "AED" ? `${r.ticket} AED` : `${r.ticket} ${r.ticketCcy}`;
  return r.ticketVat ? `order ${printed} + VAT.` : `order ${printed}.`;
}

export function feeMarketOf(exchange, mic, currency) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  const ccy = String(currency || "").toUpperCase();
  if (code === "DFM" || m === "XDFM") return "dfm";
  if (code === "ADX" || code === "ADSM" || m === "XADS") return "adx";
  if (code === "DIFX" || code === "NASDAQDUBAI" || code === "NASDAQDXB") {
    return ccy === "AED" ? "difx_aed" : "difx_usd";
  }
  return null;
}


function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(venueRow(r)) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      const ex = loose(m.row.exchange);
      return ex === wantPlace || loose(TO_VENUES[m.row.exchange] || "") === wantPlace || ex.includes(wantPlace);
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
    const { venue, unsourced } = listingKey(venueRow(r));
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const market = feeMarketOf(r.exchange, book.mic ?? venue?.mic, r.currency);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market || "?"] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function commissionEach({ amount, market }) {
  const rule = RULE[market];
  if (!rule) return null;
  const pct = amount != null && Number.isFinite(Number(amount)) ? Number(amount) * rateOf(rule) : 0;
  return pct + ticketOf(rule);
}

export function exactCost({ shares, price, market, currency }) {
  const rule = RULE[market];
  if (!rule) return { commission: null, currency: QUOTE };
  const amount = shares != null && price != null ? Number(shares) * Number(price) : null;
  const each = commissionEach({ amount, market });
  if (each == null) return { commission: null, currency: QUOTE, rule };
  const ccy = rule.ticketCcy || currency || "AED";
  return {
    commission: dollars(each * 2, amount != null ? currency || ccy : ccy),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: currency || ccy },
    rule,
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
    return {
      ...answer,
      why: "le catalogue BHM n'existe pas encore : lancer `node bhmuae/bhmuae_scraping.mjs` avec trading.bhmuae.ae ouvert",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue BHM` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez BHM`,
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

  const market = feeMarketOf(m.row.exchange, listing.mic, listing.currency);
  const rule = RULE[market];
  if (!market || !rule) {
    return {
      ...answer,
      listing,
      feeMarket: market,
      remark: "international card, not this file.",
      why: `${listing.exchange || m.row.exchange} n'est pas sur le bloc local BHM (DFM / ADX / Nasdaq Dubai)`,
      tax: taxesOf(listing.isin),
      fx: fxNote(listing.currency),
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = US_MICS.has(listing.mic);
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const commissionPct = rateOf(rule) * 2;
  const knownPct = taxTotal + commissionPct;
  const a = marketBp != null ? marketBp / 1e4 + knownPct : knownPct;
  const bookUsd = american ? (marketPerShare ?? 0) : dollars(marketPerShare ?? 0, listing.currency) ?? 0;
  const ticketEach = ticketOf(rule);
  const ticketCcy = rule.ticketCcy || listing.currency;
  const ticketUsd = ticketEach ? dollars(ticketEach * 2, ticketCcy) ?? 0 : 0;

  return {
    ...answer,
    a: Number(Number(a).toPrecision(4)),
    b: Number(bookUsd.toPrecision(6)),
    c: Number(ticketUsd.toPrecision(6)),
    floor: null,
    listing,
    feeMarket: market,
    remark: remarkOf({ market }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(rates).length ? rates : null,
      commission: commissionPct,
      ticket: ticketEach || null,
      ticketCurrency: ticketEach ? ticketCcy : null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème BHM ${market}, lu le ${SCHEDULE.readOn} (page Pricing)`,
    tax,
    commission: {
      rate: rateOf(rule),
      ticket: ticketEach || null,
      ticketPrinted: rule.ticket ?? null,
      currency: ticketCcy,
      eachWay: true,
      parts: rule.parts,
    },
    cAed: ticketCcy === "AED" ? ticketEach * 2 : null,
    cUsd: ticketCcy === "USD" ? ticketEach * 2 : null,
    ccy: QUOTE,
    cap: null,
    threshold: null,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `commission ${market} selon la carte BHM du ${SCHEDULE.readOn} ` +
      `(bhmuae.ae/pricing). ` +
      `${(rateOf(rule) * 100).toFixed(3)} % par jambe, TVA des lignes pliée dans a` +
      (ticketEach
        ? `, ticket ${rule.ticket} ${rule.ticketCcy} + TVA dans c`
        : ", pas de ticket") +
      `. a = carnet` +
      (taxTotal ? ` + taxes` : "") +
      ` + ${(commissionPct * 100).toFixed(3)} % de courtage` +
      `. b = 0, c = ticket. Aucun aller-retour réel chez BHM dans ce dépôt. ` +
      (leaf ? "" : `Pas de feuille de carnet pour cet ISIN / cette place. `),
  };
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
      "usage : node bhmuae_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node bhmuae_cost.mjs --schedule\n" +
        "  ex.   node bhmuae_cost.mjs CHAE\n" +
        "        node bhmuae_cost.mjs AIRARABIA DFM AED --shares=1 --price=3\n" +
        "        node bhmuae_cost.mjs ABTC NASDAQDUBAI USD --shares=1 --price=20"
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
      console.log(`\nce que BHM propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.commission) detail.push(`courtage ${out.parts.commission}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part : rien)`);
  console.log(
    `c = ${out.c} $   (par ordre` +
      (out.parts?.ticket
        ? ` : ticket ${out.commission?.ticketPrinted} ${out.parts.ticketCurrency} + TVA × 2`
        : " : rien") +
      `)`
  );
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
    const affine = amountUsd != null && out.a != null ? out.a * amountUsd + out.b * n + out.c : null;
    const billed = exactCost({ shares: n, price: p, market: out.feeMarket, currency: l.currency });
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
