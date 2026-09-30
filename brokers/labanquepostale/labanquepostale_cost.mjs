// What one round trip costs at La Banque Postale (the bank CTO, not
// EasyBourse): buy n shares at price p, sell them back at once, online, in
// dollars.
//
// The affine triple hid the ticket. 0.55 % sat in `a` and the 8.40 €
// minimum lived in `min fees` / `c` = 0, so a ten-share TTE trip (~600 €)
// was missing 16.80 €. `roundTrip` is given the size and charges what is
// charged: max(8.40 €, 0.55 %) each way.
//
// Brochure particuliers 1 January 2026 (TTC), re-read 2026-09-16 —
// unchanged since the 11th. Internet only (bureau de poste 1.10 % / 11.50 €
// and telephone stay out). Actions et obligations, exclusively euros on the
// domestic market — Euronext Paris, Brussels, Amsterdam:
//
//   0.55 % of the order, same rate ≤ 10 000 € and above
//   minimum 8.40 € per order
//
// `--pea` is the PEA / PEA-PME internet column on the same brochure: 0.50 %
// both sides of 10 000 €, no printed floor (the legal 0.50 % cap would
// swallow 8.40 € under 1 680 € anyway). The rest of that PEA grid (bureau
// 1.10 % / 0.84 %) did not extract as a second invented rate. Front has no
// PEA row: the default trip is the CTO. Foreign venues are not on the card;
// the catalogue is 1 760 Euronext EUR lines (803 stocks, 957 ETFs). Lisbon
// is a Euronext city this card does not name, so XLIS answers N/A.
//
// Cash is euro. Every line here is already euro, so there is no FX.
// Custody (8.50 € account + 5 €/line + 0.210 % / 0.113 % / 0.060 %, min
// 28 €) is a holding cost and stays in the remark. OPC subscription (26 €)
// is not this catalogue. EasyBourse is a separate subsidiary with its own
// file. The brochure names French TTF 0.40 % — tax map when it has the
// ISIN, else that printed rate on a French share, never invented for Italy
// or Spain. Opening is free. Transfer out is 7 €/line (min 65 €) and is
// leaving.
//
// No live trip in this deposit.
//
//   https://www.moneyvox.fr/tarif-bancaire/la-banque-postale/pdf/tarifs-2026-b.pdf
//   https://www.labanquepostale.fr/particulier/epargner/univers-bourse/cto.html
//
//   node labanquepostale/labanquepostale_cost.mjs TTE --shares=10 --price=60
//   node labanquepostale/labanquepostale_cost.mjs IWDA EURONEXT EUR --shares=10 --price=100
//   node labanquepostale/labanquepostale_cost.mjs MC EURONEXT EUR --shares=1 --price=700
//   node labanquepostale/labanquepostale_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("labanquepostale-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.moneyvox.fr/tarif-bancaire/la-banque-postale/pdf/tarifs-2026-b.pdf",
  page: "https://www.labanquepostale.fr/particulier/epargner/univers-bourse/cto.html",
  readOn: "2026-09-16",
  previouslyRead: "2026-09-11",
  revised: "2026-01-01",
  entity: "La Banque Postale (FR), CTO internet — pas EasyBourse",
};

const RATE = 0.0055;
const MIN = 8.4;
const PEA_CAP = 0.005;
const FR_TTF = 0.004;
const DOMESTIC = new Set(["XPAR", "XAMS", "XBRU"]);
const EURONEXT_EX = /^(EURONEXT|EURONEXTPARIS|EURONEXTAMSTERDAM|EURONEXTBRUXELLES|EURONEXTBRUSSELS)$/;

const CUSTODY = {
  account: 8.5,
  perLine: 5,
  bands: [
    { upTo: 50000, rate: 0.0021 },
    { upTo: 100000, rate: 0.00113 },
    { rate: 0.0006 },
  ],
  min: 28,
  ccy: "EUR",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};
const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });
const isStock = (listing) => String(listing?.type || "").toUpperCase() === "STOCK";

export function feeMarketOf(exchange, mic, currency) {
  const ccy = String(currency || "").toUpperCase();
  if (ccy && ccy !== "EUR") return null;
  const m = String(mic || "").toUpperCase();
  if (m === "XLIS") return null;
  if (DOMESTIC.has(m) || EURONEXT_EX.test(loose(exchange))) return "euronext";
  return null;
}

export function taxesFor(isin, listing) {
  const tax = taxesOf(isin);
  const mapped = taxRates(tax);
  if (Object.keys(mapped).length) return { tax, rates: mapped, source: "taxMap" };
  if (isStock(listing) && String(isin || "").toUpperCase().startsWith("FR")) {
    return { tax, rates: { FRENCH_TTF: FR_TTF }, source: "labanquepostale" };
  }
  return { tax, rates: {}, source: null };
}

function remarkOf({ pea } = {}) {
  if (pea) return "PEA online 0.50%. Custody bands differ from the CTO.";
  return "Custody €8.50/year + €5/line + 0.210% ≤ €50k (min €28).";
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
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
  named.map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`).slice(0, 12);

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
    const market = feeMarketOf(r.exchange, book.mic ?? venue?.mic, r.currency) || "?";
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
 * One side's commission, at the floor (CTO) or at the 0.50 % PEA cap.
 */
export function commissionSide({ amount, pea = false }) {
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const n = Number(amount);
  if (pea) {
    const charged = n * PEA_CAP;
    return { raw: charged, charged, floored: false, capped: true, currency: "EUR" };
  }
  const raw = n * RATE;
  const charged = Math.max(MIN, raw);
  return { raw, charged, floored: raw < MIN, capped: false, currency: "EUR" };
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `brokerFees` is the Banque Postale internet ticket.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, pea = false }) {
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true, cashCurrency: "EUR", pea };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue La Banque Postale n'existe pas encore : lancer `node labanquepostale/labanquepostale_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
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
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
    query: m.row.query || null,
  };

  const market = feeMarketOf(m.row.exchange, listing.mic, listing.currency);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const { tax, rates, source: taxSource } = taxesFor(listing.isin, listing);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  const rate = pea ? PEA_CAP : RATE;

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    remark: remarkOf({ pea }),
    pea: pea ? { cap: PEA_CAP } : null,
  };

  if (!market) {
    return {
      ...shared,
      basis: `aucun palier publié pour ${listing.brokerExchange || listing.exchange || "cette place"} chez La Banque Postale`,
      why:
        `${listing.ticker || listing.isin} n'est pas sur le marché domestique Euronext (Paris / Amsterdam / Bruxelles) ` +
        `chez La Banque Postale`,
      confidence: `place hors carte, lue le ${SCHEDULE.readOn} : la commission est N/A plutôt qu'un voisin inventé`,
    };
  }

  const basis =
    `barème La Banque Postale internet ${pea ? "PEA" : "CTO"}, palier ${market}, ` +
    `brochure du ${SCHEDULE.revised} relue le ${SCHEDULE.readOn} : ` +
    (pea ? `${(100 * PEA_CAP).toFixed(2)} % par sens` : `${(100 * RATE).toFixed(2)} % par sens, plancher ${MIN} €`);

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({ pea, rate, listing, marketBp, marketPerShare, unsourced: m.unsourced, taxPct, taxSource }),
    };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const buy = commissionSide({ amount: notional, pea });
  const sell = commissionSide({ amount: notional, pea });
  const buyUsd = buy ? dollars(buy.charged, "EUR") : null;
  const sellUsd = sell ? dollars(sell.charged, "EUR") : null;
  const brokerFees = plus(buyUsd, sellUsd);
  const stampUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const usd = plus(bookUsd, brokerFees, stampUsd);

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
      commission: finite(buyUsd, 6),
      native: buy
        ? { charged: finite(buy.charged, 6), raw: finite(buy.raw, 6), floored: buy.floored, currency: buy.currency }
        : null,
      taxes: finite(stampUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
    },
    sell: {
      commission: finite(sellUsd, 6),
      native: sell
        ? { charged: finite(sell.charged, 6), raw: finite(sell.raw, 6), floored: sell.floored, currency: sell.currency }
        : null,
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(brokerFees, 6),
      taxes: finite(stampUsd, 6),
    },
    commission: { rate, min: pea ? null : MIN, currency: "EUR", eachWay: true, pea },
    basis,
    confidence: confidenceOf({
      pea,
      rate,
      buy,
      listing,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      taxSource,
    }),
  };
}

function confidenceOf({ pea, rate, buy, listing, marketBp, marketPerShare, unsourced, taxPct, taxSource }) {
  const said = [];
  said.push(
    `commission internet La Banque Postale ${pea ? "PEA" : "CTO"}, brochure du ${SCHEDULE.revised} ` +
      `relue le ${SCHEDULE.readOn} (inchangée depuis le ${SCHEDULE.previouslyRead}), ` +
      `facturée par sens et convertie en dollars au mid BCE du ${FX_AS_OF}`
  );
  if (buy) {
    said.push(
      pea
        ? `${(100 * PEA_CAP).toFixed(2)} % : ${Number(buy.charged).toPrecision(4)} € par sens`
        : buy.floored
          ? `au plancher : le ticket de ${MIN} € est toute la commission, ` +
            `le calcul au barème n'en donnerait que ${Number(buy.raw).toPrecision(3)}`
          : `au-dessus du plancher : ${Number(buy.charged).toPrecision(4)} € par sens`
    );
  } else {
    said.push(pea ? `${(100 * rate).toFixed(2)} % par jambe` : `${(100 * rate).toFixed(2)} % par jambe, plancher ${MIN} €`);
  }
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp).toPrecision(4)} bp, aller-retour`);
  else if (marketPerShare != null) said.push(`carnet ${marketPerShare} $ la part`);
  else said.push(`aucun carnet : ${unsourced?.why || "place sans source de spread"} — le total est N/A et non un total sans marché`);
  if (taxPct) {
    said.push(
      `taxe à l'achat ${(100 * taxPct).toFixed(2)} %` +
        (taxSource === "labanquepostale"
          ? `, TTF 0,40 % imprimée sur la brochure (note 1)`
          : `, depuis taxMap.mjs`)
    );
  }
  if (pea) said.push(`plafond PEA 0,50 % appliqué à la commission en ligne, marchés EEE`);
  said.push(
    `hors total : la garde, les OPC à 26 €, le bureau et le téléphone. ` +
      `Pas EasyBourse. Aucun aller-retour réel dans ce dépôt`
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
      JSON.stringify({ ...SCHEDULE, rate: RATE, min: MIN, peaCap: PEA_CAP, custody: CUSTODY, coverage: coverage() }, null, 2)
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node labanquepostale_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--pea] [--json]\n" +
        "        node labanquepostale_cost.mjs --schedule\n" +
        "  ex.   node labanquepostale_cost.mjs TTE --shares=10 --price=60\n" +
        "        node labanquepostale_cost.mjs IWDA EURONEXT EUR --shares=10 --price=100\n" +
        "        node labanquepostale_cost.mjs MC EURONEXT EUR --shares=1 --price=700"
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
    pea: process.argv.includes("--pea"),
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce que La Banque Postale propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  console.log(`${l.ticker || l.query || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.pea ? "pea" : "cto"} / ${out.feeMarket}]\n`
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
      if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
    }
  }
  console.log();
  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
