// What one round trip costs at IG: buy n shares at price p, sell them back
// at once (online, EU investments, Tradegate).
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in. Online stocks / ETFs are €0, so `c`
// is 0. There is no published minimum of a %.
//
// IG Europe GmbH (DE), deal.ig.com EU investments, costs page read
// 2026-09-10. The catalogue is that book: every line is Tradegate in EUR
// (AAPL.TG, not Nasdaq). Default is the online €0 ticket, not the phone
// desk (€46–€58). CFDs, knock-outs, options, Smart Portfolios and the
// UK ISA / share-dealing card (IG Markets Ltd, instant FX £0 + 0.49 %)
// are not this trip. Manual FX (US 3 ¢/share, min 15 $) is an opt-out
// of the default conversion setting and is not this account.
//
//   stocks / ETF    €0
//   FX              0.15 % if the listing is not the account currency
//
// Cash is euro and every catalogue line is euro, so the 0.15 % does not
// hit the fill and stays out of `a`. Stamp / FTT from the tax map. SEC /
// TAF stay out: the print is a euro Tradegate quote, not a US execution.
// Custody 0. No live trip: the coefficients are the printed €0.
//
//   https://www.ig.com/ie/investments/share-dealing/costs-fees
//
//   node ig/ig_cost.mjs AAPL
//   node ig/ig_cost.mjs IE00B4L5Y983 TRADEGATE EUR
//   node ig/ig_cost.mjs MC TRADEGATE EUR --shares=1 --price=700
//   node ig/ig_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("ig-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.ig.com/ie/investments/share-dealing/costs-fees",
  readOn: "2026-09-10",
  entity: "IG Europe GmbH (DE), EU investments",
};

const FX_IF_CONVERTED = 0.0015;

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

export function exactCost() {
  return {
    commission: 0,
    currency: QUOTE,
    native: { each: 0, roundTrip: 0, currency: "EUR" },
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
      why: "le catalogue IG n'existe pas encore : lancer `node ig/ig_scraping.mjs`",
    };
  }
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
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => toUsd(x, listing.currency),
  });
  const a = plus(mkt.a, taxTotal);
  const bookUsd = mkt.b;

  return {
    ...answer,
    a: finite(a, 4),
    b: finite(bookUsd, 6),
    c: 0,
    floor: null,
    listing,
    feeMarket: market,
    remark: "FX 0.15% if converted.",
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(rates).length ? rates : null,
      commission: 0,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème IG Europe investments, palier ${market}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: { each: 0, roundTrip: 0, currency: "EUR", eachWay: true },
    ccy: QUOTE,
    cap: null,
    threshold: null,
    fx: fxNote(listing.currency),
    fxIfConverted: FX_IF_CONVERTED,
    confidence:
      `IG Europe investments, palier ${market}, page lue le ${SCHEDULE.readOn}. ` +
      `0 € par jambe (online). SEC / TAF hors de a (Tradegate EUR, pas une exécution US). ` +
      `Change 0,15 % hors de a (compte EUR, cotation EUR). Custody 0. ` +
      `Pas d'aller-retour réel dans ce dépôt. ` +
      (leaf ? "" : `Pas de feuille de carnet pour cet ISIN / cette place. `),
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
        {
          ...SCHEDULE,
          commission: 0,
          fxIfConverted: FX_IF_CONVERTED,
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
        "  ex.   node ig_cost.mjs AAPL\n" +
        "        node ig_cost.mjs IE00B4L5Y983 TRADEGATE EUR\n" +
        "        node ig_cost.mjs MC TRADEGATE EUR --shares=1 --price=700"
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
      console.log(`\nce qu'IG propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.query || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.feeMarket}]\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : spread" : " : rien"})`);
  console.log(`c = ${out.c} $   (par ordre : 0 € online)`);
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
    const affine = amountUsd != null && out.a != null ? out.a * amountUsd + out.b * n + out.c : null;
    console.log(
      `\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` +
        (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : "")
    );
    if (affine != null) console.log(`  a, b, c        : ${affine.toFixed(4)} $`);
    console.log(`  commission     : 0.0000 $`);
  }
  if (out.url) console.log(`\n${out.url}`);
}
