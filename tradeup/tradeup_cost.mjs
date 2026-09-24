// What one round trip costs at TradeUP: buy n shares at price p, sell them
// back at once (online, regular hours, market — not algo), in dollars.
//
// The affine triple hid the $0.99 / $2.98 floors and the 5 % OTC cap.
// `roundTrip` is given the size and charges what is charged.
//
// TradeUP Securities, Inc. (US, CRD 18483). Pricing page and the non-US
// detail card re-read 2026-09-17. Three printed grids. Default is the US
// tax-resident card (`--plan=us`). `--plan=nra-us` is a non-US tax resident
// with a US address; `--plan=foreign` is a non-US tax resident with a
// foreign address. Algo ($0.01 / share) is not this trip. The catalogue
// is `tradeup_scraping.mjs` — US listed plus HKEX. Until that file has
// been run, this one answers that the book is missing. HKEX has no printed
// stock ticket, so it stays N/A. Options and Treasuries are not this book.
//
//   US tax resident, listed NMS                         $0
//   US tax resident, OTC                                $0.0002 / share
//     capped at 5 % of the fill
//   non-US, US address, listed or OTC                   $0.0049 / share
//     min $0.99
//   non-US, foreign address, listed or OTC              $0.01186 / share
//     min $2.98
//
// SEC 0.00206 % of the sale, minimum $0.01 — their print. TAF $0.000195 /
// $9.79. CAT is not named and stays out. They do not name a stamp or FTT,
// so taxMap stays out. Cash is USD and every priced listing is USD, so FX
// stays out.
//
// Tickets already in the number stay out of the remark. Wires ($50), ACAT
// ($75 / $50), ACH reversal ($30) and mailing stay out. No inactivity
// fee. Platform and settlement print $0 on the non-US card and stay out.
//
//   https://www.tradeup.com/pricing
//   https://www.tradeup.com/pricing/detail
//   https://www.tradeup.com/pricing/commissions-us
//
//   node tradeup/tradeup_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node tradeup/tradeup_cost.mjs AQLT CBOE USD --shares=10 --price=31.5
//   node tradeup/tradeup_cost.mjs --plan=foreign AAPL NASDAQ USD --shares=10 --price=230
//   node tradeup/tradeup_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";

const CATALOGUE = new URL("tradeup-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.tradeup.com/pricing",
  detail: "https://www.tradeup.com/pricing/detail",
  commissions: "https://www.tradeup.com/pricing/commissions-us",
  readOn: "2026-09-17",
  entity: "TradeUP Securities, Inc. (US)",
  crd: "18483",
};

const PLANS = {
  us: { id: "us", name: "TradeUP", listed: 0, otcPerShare: 0.0002, otcCap: 0.05, min: 0 },
  "nra-us": { id: "nra-us", name: "TradeUP (non-US, US address)", listed: 0.0049, otcPerShare: 0.0049, otcCap: null, min: 0.99 },
  foreign: { id: "foreign", name: "TradeUP (non-US, foreign address)", listed: 0.01186, otcPerShare: 0.01186, otcCap: null, min: 2.98 },
};
const DEFAULT_PLAN = "us";

const SEC_RATE = 0.0000206;
const SEC_MIN = 0.01;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const ALGO = 0.01;
const WIRE = { domestic: 50, foreign: 50, ccy: "USD" };
const ACAT = { full: 75, partial: 50, ccy: "USD" };
const ACH_REVERSAL = 30;

const LISTED_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG"]);
const LISTED_CODES = /^(NASDAQ|NYSE|AMEX|ARCA|NYSEARCA|BATS|BZX|CBOE|IEX)$/;
const HK_CODES = /^(HKEX|SEHK)$/;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const isOverTheCounter = (row) => /^(OTC|PINK|GREY|OTCBB|OTCQX|OTCQB|OTCCE|PINX)$/i.test(String(row?.exchange || ""));

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });

export function resolvePlan(plan) {
  const id = String(plan || DEFAULT_PLAN)
    .trim()
    .toLowerCase()
    .replace(/^tradeup:?/, "");
  if (id === "resident" || id === "us-resident" || id === "0") return PLANS.us;
  if (id === "usaddr" || id === "us-address" || id === "nraus" || id === "nra_us") return PLANS["nra-us"];
  if (id === "nra" || id === "intl" || id === "abroad" || id === "overseas") return PLANS.foreign;
  return PLANS[id] || PLANS[DEFAULT_PLAN];
}

export function feeMarketOf(row, mic) {
  const raw = code(row?.exchange);
  const m = code(mic);
  if (isOverTheCounter(row) || raw === "OTC" || /^(OTC|PINK|GREY)/.test(raw)) return "otc";
  if (HK_CODES.test(raw) || m === "XHKG") return "hk";
  if (LISTED_MICS.has(m) || LISTED_CODES.test(raw)) return "listed";
  return null;
}

export function commissionSide({ market, plan, shares, notional }) {
  const n = Number(shares);
  const amt = Number(notional);
  if (!(n > 0) || !(amt > 0)) return null;
  if (market === "hk") return null;
  const resolved = resolvePlan(plan);
  if (market === "otc") {
    const raw = resolved.otcPerShare * n;
    const capped = resolved.otcCap != null ? Math.min(raw, resolved.otcCap * amt) : raw;
    return Math.max(resolved.min, capped);
  }
  if (market === "listed") return Math.max(resolved.min, resolved.listed * n);
  return null;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rowsNamed(rows, asked, 
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const priced = named.filter((r) => feeMarketOf(r) != null && feeMarketOf(r) !== "hk");
  const pool = exactCode.length ? exactCode : priced.length ? priced : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency || "USD") === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "USD"} @ ${r.exchange || "place non dite"}`)
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
    const market = feeMarketOf(r, book.mic ?? venue?.mic) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, otc: 0, hk: 0, byMarket: {} });
    slot.n += 1;
    if (isOverTheCounter(r)) slot.otc += 1;
    if (market === "hk") slot.hk += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

function remarkOf({ market, plan }) {
  const lines = [];
  if (plan?.id === "nra-us") lines.push("If you are a non-US tax resident with a US address.");
  if (plan?.id === "foreign") lines.push("If you are a non-US tax resident with a foreign address.");
  if (market === "otc") lines.push("OTC may be repriced by size or market cap.");
  return lines.join("\n");
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight
 * back. `usd` is the number the page prints; `brokerFees` is TradeUP's
 * commission, twice.
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
  const resolved = resolvePlan(plan);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: resolved.id,
    onlineBuy: true,
    cashCurrency: "USD",
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue TradeUP n'existe pas encore : lancer `node tradeup/tradeup_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue TradeUP` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez TradeUP`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "tradeup",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || "USD",
    brokerExchange: m.row.exchange || null,
    otc: isOverTheCounter(m.row),
  };

  const market = feeMarketOf(m.row, listing.mic);
  if (!market || market === "hk") {
    return {
      ...answer,
      listing,
      cashCurrency: "USD",
      remark: "",
      why: `${listing.brokerExchange || listing.exchange} n'a pas de barème actions imprimé chez TradeUP`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;

  const n = Number(shares);
  const p = Number(price);
  const notional = n > 0 && p > 0 ? n * p : null;
  const ticket = commissionSide({ market, plan: resolved.id, shares: n, notional });

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: "USD",
    remark: remarkOf({ market, plan: resolved }),
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? (resolved.id === "us" ? SCHEDULE.source : SCHEDULE.detail),
    basis: `barème ${resolved.name}, palier ${market}, relu le ${SCHEDULE.readOn}`,
    commission: {
      each: ticket,
      currency: "USD",
      eachWay: true,
      platform: "online",
      hours: "regular",
      order: "market",
    },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    withdraw: { ach: 0, wireDomestic: WIRE.domestic, wireForeign: WIRE.foreign, ccy: "USD" },
  };

  if (notional == null || ticket == null) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        market,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        plan: resolved,
      }),
    };
  }

  const notionalUsd = toUsd(notional, listing.currency);
  const commissionUsd = ticket * 2;
  const bookUsd =
    marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const secUsd = notionalUsd == null ? null : Math.max(SEC_MIN, notionalUsd * SEC_RATE);
  const tafUsd = Math.min(n * TAF_PER_SHARE, TAF_CAP);
  const usd = plus(bookUsd, commissionUsd, secUsd, tafUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
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
      courtage: finite(commissionUsd, 6),
      réglementaire: finite(plus(secUsd, tafUsd), 6),
    },
    sell: {
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
      tafCapped: n * TAF_PER_SHARE >= TAF_CAP,
      secFloored: notionalUsd != null && notionalUsd * SEC_RATE < SEC_MIN,
    },
    confidence: confidenceOf({
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      plan: resolved,
      n,
      ticket,
      tafUsd,
      tafCapped: n * TAF_PER_SHARE >= TAF_CAP,
    }),
  };
}

function confidenceOf({
  market,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  plan,
  n,
  ticket,
  tafCapped,
}) {
  const said = [];
  if (plan.id === "us") {
    said.push(
      `commission ${plan.name}, page lue le ${SCHEDULE.readOn} : ` +
        `NMS 0 $, OTC ${plan.otcPerShare} $/part plafonné à ${100 * plan.otcCap} % du notionnel`
    );
  } else {
    said.push(
      `commission ${plan.name}, carte non-US lue le ${SCHEDULE.readOn} : ` +
        `${plan.listed} $/part, plancher ${plan.min} $ (listé et OTC)`
    );
  }
  if (ticket != null) said.push(`ticket ${Number(ticket.toPrecision(4))} $ par sens`);
  said.push(
    `SEC ${SEC_RATE} du montant à la vente, minimum ${SEC_MIN} $, TAF ${TAF_PER_SHARE} $/part plafonnée à ${TAF_CAP} $` +
      (tafCapped ? `, le plafond mord` : "") +
      ` ; CAT et FTT non nommés, laissés dehors`
  );
  if (marketBp != null) said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  else if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part`);
  else {
    said.push(
      `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${
        unsourced?.why || "pas de source"
      }`
    );
  }
  if (!leaf) said.push(`carnet absent pour cette ligne`);
  said.push(
    `hors trajet : algo +${ALGO} $/part, virement ${WIRE.domestic} $, ` +
      `ACAT sortant ${ACAT.full} $ / ${ACAT.partial} $, ACH reversal ${ACH_REVERSAL} $. ` +
      `Compte en dollars, pas de change. HKEX sans barème imprimé. ` +
      `Aucun aller-retour réel dans ce dépôt`
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
          plans: PLANS,
          listed: {
            us: 0,
            nraUs: { perShare: PLANS["nra-us"].listed, min: PLANS["nra-us"].min },
            foreign: { perShare: PLANS.foreign.listed, min: PLANS.foreign.min },
          },
          otc: {
            us: { perShare: PLANS.us.otcPerShare, cap: PLANS.us.otcCap },
            nraUs: { perShare: PLANS["nra-us"].otcPerShare, min: PLANS["nra-us"].min },
            foreign: { perShare: PLANS.foreign.otcPerShare, min: PLANS.foreign.min },
          },
          algo: ALGO,
          sec: { rate: SEC_RATE, min: SEC_MIN },
          taf: { perShare: TAF_PER_SHARE, cap: TAF_CAP },
          cat: 0,
          cash: "USD",
          withdraw: { ach: 0, ...WIRE },
          acat: ACAT,
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
      "usage : node tradeup/tradeup_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=us|nra-us|foreign]\n" +
        "        node tradeup/tradeup_cost.mjs --schedule\n" +
        "  ex.   node tradeup/tradeup_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node tradeup/tradeup_cost.mjs AQLT CBOE USD --shares=10 --price=31.5 --plan=foreign"
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
      console.log(`\nce que TradeUP propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.feeMarket}]\n`
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
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.réglementaire) console.log(`  réglementaire  : ${parts.réglementaire} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
