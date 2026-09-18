// What one round trip costs at Siebert: buy n shares at price p, sell them
// back at once (online, regular hours, cash account), in dollars.
//
// The affine triple had nowhere to put the OTC ticket. Listed names are 0 $
// a side; an OTC name is 6.95 $ a side, and a 60 000-share sale is 9.79 $ of
// TAF, not 60 000 × 0.000195. `roundTrip` is given the size and charges
// what is charged.
//
// Muriel Siebert & Co., LLC (US), re-read 2026-09-16. The catalogue is
// investor.siebert.com (10 672 lines: 5 541 ETF, 5 107 stocks, 24 ETN, all
// USD). The public rate card at /resources/rate-fees lists wires and a
// $300 maintenance fee and is silent on equity tickets. The only printed
// self-directed schedule is Siebert.Pro (launched 2025-11-17):
//
//   U.S. exchange-listed (NMS, regular hours)   $0
//   non-NMS OTC (OTC Markets, OTCBB, grey, OTC foreign)   $6.95
//
// Extended hours ($0.005 / share), broker-assist (+ $25), options
// ($0.50 / contract on Pro; exercises / assignments + $25), mutual funds
// and bonds are not this trip. Crypto is not in the catalogue. Two ticker
// aliases for GLD filed under NYGIF (NYSE Global Indices) are not an
// execution venue and stay N/A.
//
// A third-party review still prints $14.95 on the old Muriel Siebert card.
// That figure is not on siebert.com, so it is not a plan here.
//
// SEC and FINRA TAF are named on the Pro footnote; current levies, each
// ceil-to-cent; TAF stops at $9.79. No CAT. Stamp / FTT from the tax map
// by ISIN. Cash is USD and every listing is USD, so FX stays out.
//
// The $6.95 ticket is in the number, so it stays out of the remark. Wires
// ($25 domestic / $45 foreign), ACAT out ($75) and the $300 maintenance
// (may be waived) are funding or holding.
//
//   https://www.siebert.com/pro
//   https://blog.siebert.com/siebert-launches-siebert.pro-for-active-self-directed-investors
//   https://www.siebert.com/resources/rate-fees
//
//   node siebert/siebert_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node siebert/siebert_cost.mjs AAPI OTC USD --shares=100 --price=1
//   node siebert/siebert_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("siebert-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.siebert.com/pro",
  launch: "https://blog.siebert.com/siebert-launches-siebert.pro-for-active-self-directed-investors",
  fees: "https://www.siebert.com/resources/rate-fees",
  readOn: "2026-09-16",
  launched: "2025-11-17",
  entity: "Muriel Siebert & Co., LLC (US)",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const CENT = 0.01;
const OTC_TICKET = 6.95;
const EXTENDED_PER_SHARE = 0.005;
const ASSISTED = 25;
const WIRE = { domestic: 25, foreign: 45, ccy: "USD" };
const ACAT = { full: 75, partial: 25, ccy: "USD" };

const LISTED_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG"]);
const LISTED_CODES = /^(NASDAQ|NYSE|AMEX|ARCA|NYSEARCA|BATS|BZX|CBOE|IEX)$/;
const NO_LINE = new Set(["NYGIF"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const up = (value) =>
  value == null || Number.isNaN(value) ? null : value > 0 ? Math.ceil(value / CENT - 1e-9) * CENT : 0;

const isOverTheCounter = (row) => /^(OTC|PINK|GREY|OTCBB|OTCQX|OTCQB)$/i.test(String(row?.exchange || ""));

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

export function feeMarketOf(row, mic) {
  const raw = code(row?.exchange);
  const m = code(mic);
  if (NO_LINE.has(raw)) return null;
  if (isOverTheCounter(row) || raw === "OTC" || /^(OTC|PINK|GREY)/.test(raw)) return "otc";
  if (LISTED_MICS.has(m) || LISTED_CODES.test(raw)) return "listed";
  return null;
}

export function commissionEach(market) {
  if (market === "listed") return 0;
  if (market === "otc") return OTC_TICKET;
  return null;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rows.filter(
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const priced = named.filter((r) => feeMarketOf(r) != null);
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
    const slot = (out[type] ||= { n: 0, withBook: 0, otc: 0, byMarket: {} });
    slot.n += 1;
    if (isOverTheCounter(r)) slot.otc += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight
 * back. `usd` is the number the page prints; `brokerFees` is only Siebert's
 * ticket (0 $ listed, 6.95 $ OTC, twice).
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "USD",
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Siebert n'existe pas encore : lancer `node siebert/siebert_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Siebert` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Siebert`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "siebert",
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
  if (!market) {
    return {
      ...answer,
      listing,
      cashCurrency: "USD",
      remark: "",
      why: `${listing.brokerExchange || listing.exchange} n'est pas une place tarifée chez Siebert (NMS ou OTC)`,
    };
  }

  const each = commissionEach(market);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: "USD",
    onlineBuy: true,
    remark: "",
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème Siebert.Pro online, palier ${market}, relu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      each,
      currency: "USD",
      eachWay: true,
      platform: "online",
      hours: "regular",
    },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    withdraw: { ach: 0, wireDomestic: WIRE.domestic, wireForeign: WIRE.foreign, ccy: "USD" },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
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
        taxPct,
      }),
    };
  }

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);
  const commissionUsd = each == null || notionalUsd == null ? null : each * 2;
  const bookUsd =
    marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const secUsd = notionalUsd == null ? null : up(notionalUsd * SEC_RATE);
  const tafRaw = Math.min(n * TAF_PER_SHARE, TAF_CAP);
  const tafUsd = up(tafRaw);
  const usd = plus(bookUsd, commissionUsd, taxUsd, secUsd, tafUsd);

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
      taxes: finite(taxUsd, 6),
    },
    sell: {
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
      tafCapped: tafRaw >= TAF_CAP,
    },
    confidence: confidenceOf({
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      n,
      each,
      tafUsd,
      tafCapped: tafRaw >= TAF_CAP,
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
  taxPct,
  n,
  each,
  tafUsd,
  tafCapped,
}) {
  const said = [];
  said.push(
    `Siebert.Pro online, palier ${market}, barème relu le ${SCHEDULE.readOn} ` +
      `(lancé le ${SCHEDULE.launched}, /resources/rate-fees est muet sur le courtage)`
  );
  said.push(
    market === "otc"
      ? `courtage ${OTC_TICKET} $ par jambe (OTC non-NMS)`
      : `courtage 0 $ par jambe, heures régulières`
  );
  said.push(
    `SEC ${SEC_RATE} du montant et TAF ${TAF_PER_SHARE} $/part à la vente, plafonnée à ${TAF_CAP} $` +
      (tafCapped ? `, le plafond mord` : "")
  );
  if (taxPct) {
    said.push(`taxe de transfert ${(100 * taxPct).toFixed(2)} % prise dans la carte des taxes`);
  }
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
    `hors trajet : extended hours ${EXTENDED_PER_SHARE} $/part, assisted +${ASSISTED} $, ` +
      `virement ${WIRE.domestic} $ / ${WIRE.foreign} $, ACAT sortant ${ACAT.full} $, ` +
      `garde 300 $ (peut être levée). Compte en dollars, pas de change. CAT non nommé. ` +
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
          listed: 0,
          otc: OTC_TICKET,
          extendedPerShare: EXTENDED_PER_SHARE,
          assisted: ASSISTED,
          sec: SEC_RATE,
          taf: { perShare: TAF_PER_SHARE, cap: TAF_CAP },
          cash: "USD",
          withdraw: WIRE,
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
      "usage : node siebert/siebert_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]\n" +
        "        node siebert/siebert_cost.mjs --schedule\n" +
        "  ex.   node siebert/siebert_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node siebert/siebert_cost.mjs AAPI OTC USD --shares=100 --price=1"
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
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que Siebert propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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
