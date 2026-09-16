// What one round trip costs at IG: buy n shares at price p, sell them back
// at once (online, EU investments, Tradegate), in dollars.
//
// There was no cliff in the affine triple — commission is 0 € — but the
// page no longer reads `a`, `b` and `c`, so every trip came back N/A.
// `roundTrip` is given the size and charges what is charged.
//
// IG Europe GmbH (DE), deal.ig.com EU investments. Catalogue 6 942 lines
// on 2026-09-16 — 4 246 stocks, 2 696 ETFs — every one Tradegate in EUR
// (AAPL.TG, not Nasdaq). Costs re-read the same day: the February 2026
// IGE charges document still prints 0 € on euro shares and ETFs, venue
// Tradegate; the Ireland share-dealing page still prints 0 € online and
// FX 0.15 %. Phone (€46.15–€57.65), CFDs, knock-outs, options, Smart
// Portfolios, crypto (0.50 % a leg in that PDF, not this book) and the
// UK ISA / IG Markets Ltd card are not this trip. Manual FX (US 3 ¢ /
// share, min 15 $) is an opt-out of the default conversion and is not
// this account: every line here is already euro.
//
//   stocks / ETF    €0
//   FX              0.15 % if the listing is not the account currency
//
// Cash is euro and every catalogue line is euro, so the 0.15 % does not
// hit the fill. Stamp / FTT from the tax map, never invented. The Ireland
// page also prints UK SDRT 0.50 %, PTM £1.50 above £10 000, Irish stamp
// 1 %, ITP €1.25 above €12 500 and a stale Section 31 of 0.00229 % —
// those belong to local-venue dealing (LSE, US tape), not this Tradegate
// book, so they stay out. SEC / TAF stay out for the same reason.
// Custody 0. Standard bank transfer 0. Same-day under €115 is €17.50
// and is funding.
//
//   https://www.ig.com/ie/investments/share-dealing/costs-fees
//   https://www.ig.com/usermanagement/customeragreements?agreementType=costs_and_charges&igCompany=igfr&locale=fr_FR
//
//   node ig/ig_cost.mjs AAPL TRADEGATE EUR --shares=10 --price=230
//   node ig/ig_cost.mjs IE00B4L5Y983 TRADEGATE EUR --shares=10 --price=100
//   node ig/ig_cost.mjs MC TRADEGATE EUR --shares=1 --price=700
//   node ig/ig_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("ig-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.ig.com/ie/investments/share-dealing/costs-fees",
  charges:
    "https://www.ig.com/usermanagement/customeragreements?agreementType=costs_and_charges&igCompany=igfr&locale=fr_FR",
  readOn: "2026-09-16",
  previouslyRead: "2026-09-10",
  chargesAsOf: "2026-02",
  entity: "IG Europe GmbH (DE), EU investments",
};

const FX_IF_CONVERTED = 0.0015;
const PHONE = { uk: 46.15, other: 57.65, ccy: "EUR" };
const SAME_DAY_UNDER = { below: 115, fee: 17.5, ccy: "EUR" };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

export function feeMarketOf() {
  return "investments";
}

function remarkOf() {
  return "FX 0.15% if converted.";
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantUnsourced = resolved.unsourced || null;
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
      if (wantUnsourced && m.unsourced) return m.unsourced.name === wantUnsourced.name;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.query || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
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
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `usd` is the number the page prints; `brokerFees` is the IG ticket (0 €).
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "EUR",
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue IG n'existe pas encore : lancer `node ig/ig_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue IG` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez IG`,
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

  const market = feeMarketOf(m.row, listing.mic);
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
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: FX_IF_CONVERTED,
    remark: remarkOf(),
  };

  const basis = `barème IG Europe investments, palier ${market}, relu le ${SCHEDULE.readOn} : 0 € par jambe`;

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({ market, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, taxPct }),
    };
  }

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const brokerFees = 0;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const usd = plus(bookUsd, brokerFees, taxUsd);

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
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    buy: {
      commission: 0,
      taxes: finite(taxUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
    },
    sell: { commission: 0 },
    parts: {
      marché: finite(bookUsd, 6),
      commission: 0,
      taxes: finite(taxUsd, 6),
    },
    commission: { each: 0, roundTrip: 0, currency: "EUR", eachWay: true, platform: "online" },
    basis,
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

function confidenceOf({ market, listing, leaf, marketBp, marketPerShare, unsourced, taxPct }) {
  const said = [];
  said.push(
    `IG Europe investments, palier ${market}, page lue le ${SCHEDULE.readOn} ` +
      `(inchangée depuis le ${SCHEDULE.previouslyRead}, document IGE ${SCHEDULE.chargesAsOf}) : 0 € par jambe online`
  );
  if (taxPct) said.push(`taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant, depuis taxMap.mjs`);
  if (marketBp != null) said.push(`carnet Tradegate ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) {
    said.push(`carnet ${marketPerShare} $ la part`);
  } else {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. ` +
        `Le total est N/A faute de mesure, pas faute de frais`
    );
  }
  said.push(
    `hors total : SEC / TAF, timbre UK / IE, PTM et ITP — imprimés sur la carte Irlande pour le dealing local ` +
      `(LSE, tape US), pas ce livre Tradegate. Change 0,15 % si la cotation n'est pas l'euro ` +
      `(ici EUR / EUR, donc hors du chiffre). Garde 0, virement standard 0. ` +
      `Téléphone ${PHONE.uk}–${PHONE.other} € hors de ce trajet. ` +
      `Aucun aller-retour réel dans ce dépôt`
  );
  if (leaf == null) said.push(`pas de feuille de carnet pour ${listing.isin}`);
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
          commission: 0,
          fxIfConverted: FX_IF_CONVERTED,
          phone: PHONE,
          sameDayUnder: SAME_DAY_UNDER,
          sec: null,
          taf: null,
          ukStamp: null,
          ptm: null,
          itp: null,
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
      "usage : node ig_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node ig_cost.mjs --schedule\n" +
        "  ex.   node ig_cost.mjs AAPL TRADEGATE EUR --shares=10 --price=230\n" +
        "        node ig_cost.mjs IE00B4L5Y983 TRADEGATE EUR --shares=10 --price=100\n" +
        "        node ig_cost.mjs MC TRADEGATE EUR --shares=1 --price=700"
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

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce qu'IG propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  console.log(`${l.ticker || l.query || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.feeMarket}]\n`
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
