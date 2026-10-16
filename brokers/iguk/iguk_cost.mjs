// What one round trip costs at IG UK: buy n shares at price p, sell them
// back at once (online share dealing), in dollars.
//
// IG Trading and Investments Ltd. The investing card on the charges page,
// read 2026-10-12: Share Dealing, Stocks and Shares ISA, Junior ISA and
// SIPP. Commission free. Platform fee free. Custody free. The 0.7% is
// the conversion when the listing is not sterling, so it stays in the
// remark. Manual conversion is the other setting (£3 on UK shares, 3¢ a
// share with a $15 minimum on US shares, 0.1% with a €10 minimum on
// European shares, 0.1% with an A$10 minimum on Australian shares) and
// drops the free commission; it is not this trip. Phone, SIPP admin,
// CFDs and spread bets stay out. Stamp and other value taxes come from
// taxMap.
//
//   https://www.ig.com/uk/charges
//
//   node brokers/iguk/iguk_cost.mjs OXIG LSE GBP --shares=10 --price=30
//   node brokers/iguk/iguk_cost.mjs BABA NYSE USD --shares=10 --price=180
//   node brokers/iguk/iguk_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("iguk-parsed.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.ig.com/uk/charges",
  readOn: "2026-10-12",
  entity: "IG Trading and Investments Ltd",
};

const CASH = "GBP";
const FX_PCT = "0.7";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

export function feeMarketOf() {
  return "share-dealing";
}

function remarkOf(currency) {
  if (code(currency) === CASH) return "";
  return fxRemark(FX_PCT, currency);
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantUnsourced = resolved.unsourced || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rowsNamed(
    rows,
    asked,
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
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);

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
      broker: "iguk",
      ticker: r.ticker,
    });
    const slot = (out[type] ||= { n: 0, withBook: 0 });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
  }
  return out;
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: CASH,
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue IG UK n'existe pas encore : lancer `node brokers/iguk/iguk_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue IG UK` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez IG UK`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "iguk",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxPct = Object.values(rates).reduce((sum, rate) => sum + rate, 0);
  const basis = `barème IG UK, relu le ${SCHEDULE.readOn} : commission 0 £ en ligne`;

  const shared = {
    ...answer,
    listing,
    feeMarket: feeMarketOf(),
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis,
    tax,
    fx: fxNote(listing.currency),
    remark: remarkOf(listing.currency),
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs",
    };
  }

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);
  const bookUsd =
    marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
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
    commission: { each: 0, roundTrip: 0, currency: CASH, eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      commission: 0,
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      `IG Trading and Investments, carte Investing lue le ${SCHEDULE.readOn} : commission 0 £, frais de plateforme 0, garde 0`,
      listing.currency === CASH ? "pas de change : la ligne est en sterling" : `change ${FX_PCT} % hors du chiffre, cash en ${CASH}`,
      marketBp != null
        ? `carnet ${Number(marketBp.toPrecision(4))} bp`
        : marketPerShare != null
          ? `carnet ${marketPerShare} $ la part`
          : `aucun carnet : ${m.unsourced?.name || listing.exchange}, ${m.unsourced?.why || "pas de source"}`,
      "hors trajet : conversion manuelle, téléphone, SIPP Options Pensions",
    ].join(" ; "),
  };
}

function calledDirectly() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (calledDirectly()) {
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, commission: 0, fx: FX_PCT, cash: CASH, coverage: coverage() }, null, 2));
    process.exit(0);
  }

  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error(
      "usage : node brokers/iguk/iguk_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]\n" +
        "        node brokers/iguk/iguk_cost.mjs --schedule\n" +
        "  ex.   node brokers/iguk/iguk_cost.mjs OXIG LSE GBP --shares=10 --price=30\n" +
        "        node brokers/iguk/iguk_cost.mjs BABA NYSE USD --shares=10 --price=180"
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

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) console.log(`\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }

  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`);
  if (out.trade?.notional != null) {
    const t = out.trade;
    console.log(
      `${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "")
    );
    console.log();
  }
  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, value] of Object.entries(out.parts)) {
      if (value != null) console.log(`  ${name.padEnd(15)}: ${value} $`);
    }
  }
  console.log();
  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) console.log(`  · ${out.remark}`);
  if (out.url) console.log(`\n${out.url}`);
}
