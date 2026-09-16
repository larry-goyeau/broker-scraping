// What one round trip costs at Bourse Direct: buy n shares at price p, sell
// them back at once, online, in dollars.
//
// The Euronext ticket is a step, not a floor. 500 € bills 0.99 € and 501 €
// bills 1.90 €; above 4 400 € the 0.09 % runs from the first euro (note 2).
// `roundTrip` is given the size and charges that step.
//
// Conditions tarifaires from 6 January 2026 (TTC), read 2026-09-16.
// Default is the published CTO grid (not TradeBox). Internet only: the
// +9.90 € telephone surcharge stays out. Morgan Stanley warrants / turbos
// at 0 € are not this catalogue.
//
//   Paris / Amsterdam / Brussels (Euronext)
//     ≤ 500 €     0.99 €
//     ≤ 1 000 €   1.90 €
//     ≤ 2 000 €   2.90 €
//     ≤ 4 400 €   3.80 €
//     above       0.09 % of the whole order
//   New York (NYSE and Nasdaq)   8.50 € up to 10 000 €, then 0.09 %
//   London / Xetra               0.15 %, min 15 €
//   Madrid / Switzerland / Lisbon 0.20 %, min 18 €
//   Other markets                0.48 %, min 41.90 €
//
// `--pea` is the PEA / PEA-PME / PEA Jeunes column: same steps, 0.50 % of
// the order when that is cheaper, only on EU / EEA tapes (note *). Up to
// 198 € on Euronext the PEA column already prints 0.50 % instead of 0.99 €.
// The cap does not apply on London, Switzerland or the US. A buy below
// 10 € (CTO) or 80 € (PEA) is refused, not priced.
//
// Cash is euro. Named foreign tapes add 0.08 % each way on a non-euro
// quote (« taux Bourse Direct + 0.08 % »). Other markets print only their
// unpublished rate — that conversion is N/A rather than 0.08 % invented.
// Custody is 0 € on Euronext Paris / Amsterdam / Brussels and 0.036 % / year
// (VAT in) on foreign holdings: a holding cost, in the remark. Transfer
// out (15 € / 25 € a line) is leaving. French / Italian / Spanish FTT and
// stamps come from taxMap, never invented; the card says tariffs exclude
// FTT. SEC and TAF on an American sale are the current local levies the
// card leaves outside the 8.50 €. No PTM on the page.
//
// Catalogue 20 934 lines (8 328 stocks, 12 606 ETFs). No live trip in
// this deposit.
//
//   https://www.boursedirect.fr/pdf/tarifs_bd.pdf
//   https://www.boursedirect.fr/fr/bourse/tarifs
//
//   node boursedirect/boursedirect_cost.mjs TTE EURONEXT EUR --shares=10 --price=60
//   node boursedirect/boursedirect_cost.mjs IWDA EURONEXT EUR --shares=10 --price=100
//   node boursedirect/boursedirect_cost.mjs MC EURONEXT EUR --shares=1 --price=700
//   node boursedirect/boursedirect_cost.mjs AAPL NASDAQ USD --shares=1 --price=230
//   node boursedirect/boursedirect_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("boursedirect-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.boursedirect.fr/pdf/tarifs_bd.pdf",
  page: "https://www.boursedirect.fr/fr/bourse/tarifs",
  readOn: "2026-09-16",
  revised: "2026-01-06",
  entity: "Bourse Direct (FR), internet — grille 0,99 €, pas TradeBox",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const FX_NAMED = 0.0008;
const PEA_CAP = 0.005;
const MIN_BUY = { cto: 10, pea: 80 };
const PEA_EURONEXT_PCT_UNTIL = 198;
const US_MICS = new Set(["XNAS", "XNYS"]);
const US_EX = new Set(["NASDAQ", "NYSE"]);
const EURONEXT_MICS = new Set(["XPAR", "XAMS", "XBRU"]);
const MADRID_MICS = new Set(["XMAD", "XMCE"]);
const SWISS_MICS = new Set(["XSWX", "XVTX"]);
const EEA_OTHER = new Set(["MIL", "VIE", "OSL", "OMXSTO", "OMXHEX"]);

const EURONEXT_STEPS = [
  { upTo: 500, fee: 0.99 },
  { upTo: 1000, fee: 1.9 },
  { upTo: 2000, fee: 2.9 },
  { upTo: 4400, fee: 3.8 },
];
const EURONEXT_RATE = 0.0009;
const US_FLAT = { fee: 8.5, upTo: 10000, rate: 0.0009 };
const LSE_XETRA = { rate: 0.0015, min: 15 };
const MADRID_SWISS_LISBON = { rate: 0.002, min: 18 };
const OTHER = { rate: 0.0048, min: 41.9 };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
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

export function feeMarketOf(exchange, mic) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  if (m === "XLIS" || code === "XLIS") return "portugal";
  if (US_MICS.has(m) || US_EX.has(code)) return "us";
  if (code === "XETR" || m === "XETR") return "xetra";
  if (code === "LSE" || m === "XLON") return "lse";
  if (code === "BME" || MADRID_MICS.has(m)) return "madrid";
  if (code === "SIX" || SWISS_MICS.has(m)) return "swiss";
  if (EURONEXT_MICS.has(m) || code === "EURONEXT") return "euronext";
  if (EEA_OTHER.has(code) || ["XMIL", "ETFP", "XWBO", "XOSL", "XSTO", "XHEL"].includes(m)) {
    return "other_eea";
  }
  if (code === "AMEX" || code === "CBOE" || m === "XASE" || m === "ARCX" || m === "BATS") {
    return "other";
  }
  return "other";
}

export function peaCaps(market) {
  return ["euronext", "xetra", "madrid", "portugal", "other_eea"].includes(market);
}

export function namedFx(market) {
  return ["us", "lse", "xetra", "madrid", "swiss", "portugal"].includes(market);
}

function ruleOf(market) {
  if (market === "euronext") return { kind: "euronext" };
  if (market === "us") return { kind: "us", ...US_FLAT };
  if (market === "lse" || market === "xetra") return { kind: "min", ...LSE_XETRA };
  if (market === "madrid" || market === "swiss" || market === "portugal") {
    return { kind: "min", ...MADRID_SWISS_LISBON };
  }
  if (market === "other" || market === "other_eea") return { kind: "min", ...OTHER };
  return null;
}

/**
 * One side, in euro of notional.
 */
export function commissionSide({ amountEur, market, pea = false }) {
  if (amountEur == null || !Number.isFinite(Number(amountEur))) return null;
  const n = Number(amountEur);
  const rule = ruleOf(market);
  if (!rule) return null;

  let charged;
  let raw = 0;
  let stepped = false;
  if (rule.kind === "euronext") {
    if (pea && n <= PEA_EURONEXT_PCT_UNTIL) {
      charged = n * PEA_CAP;
      raw = charged;
    } else {
      const step = EURONEXT_STEPS.find((s) => n <= s.upTo);
      if (step) {
        charged = step.fee;
        raw = step.fee;
        stepped = true;
      } else {
        raw = n * EURONEXT_RATE;
        charged = raw;
      }
    }
  } else if (rule.kind === "us") {
    raw = n * rule.rate;
    charged = n <= rule.upTo ? rule.fee : raw;
    stepped = n <= rule.upTo;
  } else {
    raw = n * rule.rate;
    charged = Math.max(rule.min, raw);
  }

  const cap = pea && peaCaps(market) ? n * PEA_CAP : null;
  const beforeCap = charged;
  if (cap != null) charged = Math.min(charged, cap);

  return {
    charged,
    raw,
    stepped,
    floored: rule.kind === "min" && raw < rule.min,
    peaCapped: cap != null && charged < beforeCap,
    currency: "EUR",
  };
}

export function taxesFor(isin) {
  const tax = taxesOf(isin);
  const mapped = taxRates(tax);
  if (Object.keys(mapped).length) return { tax, rates: mapped, source: "taxMap" };
  return { tax, rates: {}, source: null };
}

function remarkOf(market, currency) {
  const lines = ["Custody 0.036%/year on foreign holdings (0 on Euronext Paris/Amsterdam/Brussels)."];
  if (namedFx(market) && String(currency || "").toUpperCase() !== "EUR") {
    lines.push("FX +0.08% each way if converted.");
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
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      if (wantVenue && EURONEXT_MICS.has(wantVenue.mic) && loose(m.row.exchange) === "EURONEXT") {
        return true;
      }
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
    const market = feeMarketOf(r.exchange, book.mic ?? venue?.mic) || "?";
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
 * `usd` is the number the page prints; `brokerFees` is the Bourse Direct ticket.
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  bp = null,
  perShare = null,
  pea = false,
}) {
  const answer = {
    usd: null,
    brokerFees: null,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "EUR",
    pea,
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Bourse Direct n'existe pas encore : lancer `node boursedirect/boursedirect_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Bourse Direct` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Bourse Direct`,
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
    query: m.row.query || null,
    nonEuResident: Boolean(m.row.nonEuResident),
  };

  const market = feeMarketOf(m.row.exchange, listing.mic);
  const rule = ruleOf(market);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us";
  const { tax, rates, source: taxSource } = taxesFor(listing.isin);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  const converts = listing.currency !== "EUR";
  const fxKnown = !converts || namedFx(market);
  const fxPct = !converts ? 0 : namedFx(market) ? FX_NAMED : null;

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: fxPct === null ? null : fxPct,
    remark: remarkOf(market, listing.currency),
    pea: pea ? { cap: PEA_CAP } : null,
  };

  const basis =
    `barème Bourse Direct internet ${pea ? "PEA" : "CTO"}, palier ${market}, ` +
    `brochure du ${SCHEDULE.revised} relue le ${SCHEDULE.readOn}` +
    (market === "euronext"
      ? " : 0,99 / 1,90 / 2,90 / 3,80 € puis 0,09 %"
      : rule?.kind === "us"
        ? ` : ${US_FLAT.fee} € jusqu'à ${US_FLAT.upTo} €, puis 0,09 %`
        : rule
          ? ` : ${(rule.rate * 100).toFixed(2)} %, min ${rule.min} €`
          : "");

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        pea,
        market,
        listing,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        taxPct,
        taxSource,
        fxPct,
        american,
      }),
    };
  }

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);
  const notionalEur = toCcy(notional, listing.currency, "EUR");
  const minBuy = pea ? MIN_BUY.pea : MIN_BUY.cto;
  if (notionalEur != null && notionalEur < minBuy) {
    return {
      ...shared,
      basis,
      why: `achat refusé sous ${minBuy} € (${pea ? "PEA" : "CTO"})`,
      trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), notionalEur: finite(notionalEur, 6), currency: listing.currency },
      confidence: `minimum d'achat ${minBuy} € ${pea ? "PEA" : "CTO"}, brochure du ${SCHEDULE.revised}`,
    };
  }

  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const buy = commissionSide({ amountEur: notionalEur, market, pea });
  const sell = commissionSide({ amountEur: notionalEur, market, pea });
  const buyUsd = buy ? dollars(buy.charged, "EUR") : null;
  const sellUsd = sell ? dollars(sell.charged, "EUR") : null;
  const brokerFees = plus(buyUsd, sellUsd);

  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const fxUsd = fxPct == null || notionalUsd == null ? null : notionalUsd * fxPct * 2;
  const secUsd = american ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;
  const tafUsd = american ? Math.min(TAF_CAP, TAF_PER_SHARE * n) : 0;

  const usd = plus(bookUsd, brokerFees, taxUsd, fxUsd, secUsd, tafUsd);

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
      : !fxKnown
        ? { why: "change des autres marchés : taux Bourse Direct non publié" }
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
        ? { ...buy, charged: finite(buy.charged, 6), raw: finite(buy.raw, 6) }
        : null,
      taxes: finite(taxUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
      fx: finite(fxUsd == null ? null : fxUsd / 2, 6),
    },
    sell: {
      commission: finite(sellUsd, 6),
      native: sell
        ? { ...sell, charged: finite(sell.charged, 6), raw: finite(sell.raw, 6) }
        : null,
      fx: finite(fxUsd == null ? null : fxUsd / 2, 6),
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
      réglementaire: finite(plus(secUsd, tafUsd), 6),
    },
    commission: {
      each: buy?.charged ?? null,
      currency: "EUR",
      eachWay: true,
      pea,
      market,
    },
    basis,
    confidence: confidenceOf({
      pea,
      market,
      buy,
      listing,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      taxSource,
      fxPct,
      american,
      n,
      tafUsd,
    }),
  };
}

function confidenceOf({
  pea,
  market,
  buy,
  listing,
  marketBp,
  marketPerShare,
  unsourced,
  taxPct,
  taxSource,
  fxPct,
  american,
  n,
  tafUsd,
}) {
  const said = [];
  said.push(
    `commission internet Bourse Direct ${pea ? "PEA" : "CTO"}, palier ${market}, ` +
      `brochure du ${SCHEDULE.revised} relue le ${SCHEDULE.readOn}`
  );
  if (buy) {
    if (buy.peaCapped) {
      said.push(`plafond PEA 0,50 % : ${Number(buy.charged.toPrecision(4))} € par sens`);
    } else if (buy.stepped) {
      said.push(`palier : ${buy.charged} € par sens`);
    } else if (buy.floored) {
      said.push(`au plancher : ${Number(buy.charged.toPrecision(4))} € par sens`);
    } else {
      said.push(`${Number(buy.charged.toPrecision(4))} € par sens`);
    }
  }
  if (fxPct) said.push(`change + ${(fxPct * 100).toFixed(2)} % par sens`);
  else if (fxPct === 0) said.push(`cotation EUR : pas de change`);
  else if (listing.currency !== "EUR") said.push(`change des autres marchés non publié`);
  if (taxPct) {
    said.push(
      `taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant` +
        (taxSource === "taxMap" ? ", depuis taxMap.mjs" : "")
    );
  }
  if (american) {
    said.push(
      `vente américaine : SEC ${SEC_RATE} du montant et TAF FINRA ${TAF_PER_SHARE} $ la part (plafond ${TAF_CAP} $)` +
        (tafUsd != null && n != null && TAF_PER_SHARE * n > TAF_CAP
          ? ` — le plafond mord : ${Number(tafUsd.toPrecision(4))} $`
          : "")
    );
  }
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) said.push(`carnet ${marketPerShare} $ la part`);
  else {
    said.push(
      `aucun carnet : ${unsourced?.why || "place sans source de spread"} — le total est N/A et non un total sans marché`
    );
  }
  if (pea) said.push(`plafond PEA 0,50 % en ligne, marchés UE / EEE seulement`);
  said.push(
    `hors total : la garde, TradeBox, le téléphone + 9,90 €, TAL + 1 €. Aucun aller-retour réel dans ce dépôt`
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
          euronext: { steps: EURONEXT_STEPS, rate: EURONEXT_RATE },
          us: US_FLAT,
          lseXetra: LSE_XETRA,
          madridSwissLisbon: MADRID_SWISS_LISBON,
          other: OTHER,
          fxNamed: FX_NAMED,
          peaCap: PEA_CAP,
          minBuy: MIN_BUY,
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
      "usage : node boursedirect_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--pea] [--json]\n" +
        "        node boursedirect_cost.mjs --schedule\n" +
        "  ex.   node boursedirect_cost.mjs TTE EURONEXT EUR --shares=10 --price=60\n" +
        "        node boursedirect_cost.mjs IWDA EURONEXT EUR --shares=10 --price=100\n" +
        "        node boursedirect_cost.mjs AAPL NASDAQ USD --shares=1 --price=230"
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
      console.log(`\nce que Bourse Direct propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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
