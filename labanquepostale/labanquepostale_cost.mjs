// What one round trip costs at La Banque Postale (the bank CTO, not EasyBourse):
// buy n shares at price p, sell them back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in. The published ticket is in euros; it is
// converted at the ECB mid and folded into the floor (`c` = 0).
//
// Brochure particuliers 1 January 2026 (TTC), read 2026-09-11. Internet only
// (bureau de poste / téléphone stay out). Actions et obligations, exclusively
// euros on the domestic market — Euronext Paris, Brussels, Amsterdam:
//
//   0.55 % of the order, same rate ≤ 10 000 € and above
//   minimum 8.40 € per order
//
// The published % × 2 sits in `a`. The ticket is a floor (`min fees`).
// `exactCost` still applies max(8.40 €, 0.55 %). `--pea` caps that ticket at
// the legal 0.50 % (PEA / PEA-PME, online, EEE). The PEA grid in the same
// brochure did not extract cleanly, so PEA is that ceiling on this card, not
// a second invented rate. Foreign venues are not on the card; the catalogue
// is Euronext EUR only.
//
// Cash is euro. EUR lines have no FX. Custody (8.50 € account + 5 €/line +
// 0.210 % / 0.113 % / 0.060 %, min 28 €) is a holding cost and stays in the
// remark. OPC subscription (26 €) is not this catalogue. EasyBourse is a
// separate subsidiary with its own file.
//
// No live trip in this deposit.
//
//   https://www.moneyvox.fr/tarif-bancaire/la-banque-postale/pdf/tarifs-2026-b.pdf
//   https://www.labanquepostale.fr/particulier/epargner/univers-bourse/cto.html
//
//   node labanquepostale/labanquepostale_cost.mjs TTE
//   node labanquepostale/labanquepostale_cost.mjs IWDA EURONEXT EUR
//   node labanquepostale/labanquepostale_cost.mjs MC EURONEXT EUR --shares=1 --price=700
//   node labanquepostale/labanquepostale_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("labanquepostale-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.moneyvox.fr/tarif-bancaire/la-banque-postale/pdf/tarifs-2026-b.pdf",
  page: "https://www.labanquepostale.fr/particulier/epargner/univers-bourse/cto.html",
  readOn: "2026-09-11",
  revised: "2026-01-01",
  entity: "La Banque Postale (FR), CTO internet — pas EasyBourse",
};

const RATE = 0.0055;
const MIN = 8.4;
const PEA_CAP = 0.005;
const DOMESTIC = new Set(["XPAR", "XAMS", "XBRU"]);

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

export function feeMarketOf(exchange, mic) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  if (DOMESTIC.has(m) || /^(EURONEXT|EURONEXTPARIS|EURONEXTAMSTERDAM|EURONEXTBRUXELLES|EURONEXTBRUSSELS)$/.test(code)) {
    return "euronext";
  }
  return null;
}

export function commissionEach(amount, { pea = false } = {}) {
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const n = Number(amount);
  const rate = pea ? PEA_CAP : RATE;
  let fee = Math.max(MIN, n * rate);
  if (pea) fee = Math.min(fee, n * PEA_CAP);
  return fee;
}

function remarkOf() {
  return "min fees 16.80 €.\nCustody 8.50 €/year + 5 €/line + 0.210 % ≤ 50 k€ (min 28 €).";
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
      if (wantVenue && DOMESTIC.has(wantVenue.mic) && loose(m.row.exchange) === "EURONEXT") return true;
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
    const mk = (out[type].byMarket[market || "?"] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function exactCost({ amount, pea = false }) {
  const each = commissionEach(amount, { pea });
  if (each == null) return { commission: null, currency: QUOTE };
  return {
    commission: dollars(each * 2, "EUR"),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: "EUR" },
    pea,
  };
}

export function roundTripCost({
  etf,
  place,
  currency,
  bp = null,
  perShare = null,
  pea = false,
}) {
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
      why: "le catalogue La Banque Postale n'existe pas encore : lancer `node labanquepostale/labanquepostale_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue La Banque Postale` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez La Banque Postale`,
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
  if (!market) {
    return {
      ...answer,
      listing,
      why: `${listing.ticker || listing.isin} n'est pas sur le marché domestique Euronext (Paris / Amsterdam / Bruxelles) chez La Banque Postale`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const rate = pea ? PEA_CAP : RATE;
  const knownPct = taxTotal + rate * 2;
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const a = plus(mkt.a, knownPct);
  const floorUsd = dollars(MIN * 2, "EUR");

  return {
    ...answer,
    a: finite(a, 4),
    b: finite(mkt.b, 6),
    c: 0,
    floor: floorUsd,
    listing,
    feeMarket: market,
    remark: remarkOf(),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(rates).length ? rates : null,
      commission: rate * 2,
      change: null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème La Banque Postale internet, palier ${market}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      rate,
      min: MIN,
      currency: "EUR",
      eachWay: true,
      pea,
    },
    ccy: QUOTE,
    cap: pea ? { commission: { rate: PEA_CAP, why: "plafond PEA 0,50 % par ordre" } } : null,
    pea: pea ? { cap: PEA_CAP, why: "plafond PEA / PEA-PME 0,5 % du montant, en ligne, marchés EEE" } : null,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `commission internet La Banque Postale selon la brochure particuliers du ${SCHEDULE.revised}, lue le ${SCHEDULE.readOn}. ` +
      `${(rate * 100).toFixed(2)} % par jambe, plancher ${MIN} €. Ticket dans le plancher, b = 0, c = 0. ` +
      `Pas EasyBourse. Aucun aller-retour réel dans ce dépôt.` +
      (pea ? ` Plafond PEA 0,50 % appliqué à la commission.` : "") +
      (leaf ? "" : ` Pas de feuille de carnet pour cet ISIN / cette place.`),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        { ...SCHEDULE, rate: RATE, min: MIN, peaCap: PEA_CAP, coverage: coverage() },
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
      "usage : node labanquepostale_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--pea] [--json]\n" +
        "        node labanquepostale_cost.mjs --schedule\n" +
        "  ex.   node labanquepostale_cost.mjs TTE\n" +
        "        node labanquepostale_cost.mjs IWDA EURONEXT EUR\n" +
        "        node labanquepostale_cost.mjs MC EURONEXT EUR --shares=1 --price=700"
    );
    process.exit(2);
  }

  const pea = process.argv.includes("--pea");
  const out = roundTripCost({
    etf,
    place,
    currency,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    pea,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (out.a == null && !out.listing) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce que La Banque Postale propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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
  console.log(`c = ${out.c} $   (par ordre : ticket dans la remark, pas dans c)`);
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
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
    const billed = exactCost({ amount, pea });
    console.log(
      `\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` +
        (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : "")
    );
    if (affine != null) console.log(`  a, b, c        : ${affine.toFixed(4)} $`);
    if (billed.commission != null) {
      console.log(
        `  commission     : ${Number(billed.commission).toFixed(4)} $` +
          (billed.native?.each != null ? ` (${Number(billed.native.each).toPrecision(4)} € × 2)` : "")
      );
    }
  }
  if (out.url) console.log(`\n${out.url}`);
}
