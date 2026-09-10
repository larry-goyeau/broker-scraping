// What one round trip costs at Firstrade: buy n shares at price p, sell them
// back at once (online, regular hours).
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in. Online stocks / ETFs / ETNs are $0, so
// `c` is 0. There is no published minimum of a %.
//
// Firstrade Securities Inc. (US), pricing page read 2026-09-10. Default is
// the online ticket, not broker-assisted ($19.95). Options, mutual funds,
// bonds, CDs and the halted crypto book are not this catalogue. OTC is $0
// as well (limit only, $0.10 floor, 100 shares if the print is $1 or under).
//
//   listed / OTC    $0
//   SEC             0.0000206 of the sell (their printed April 2026 rate)
//   FINRA TAF       current 0.000195 $/share on the sell (they pass
//                   regulator “FEES” / “TRANS FEE”; TAF is not named)
//
// French FTT on some ADRs comes from the tax map. Cash is USD, so FX stays
// out of `a`. Inactivity 0. CAT and venue fees are not on the card. No live
// trip: the coefficients are the printed $0 plus the current regulators.
//
//   https://www.firstrade.com/trading/pricing
//   https://help.firstrade.info/en/articles/9264069-does-firstrade-assess-regulatory-transaction-fees-to-its-customers
//
//   node firstrade/firstrade_cost.mjs AAPL
//   node firstrade/firstrade_cost.mjs IAU AMEX USD --shares=1 --price=82
//   node firstrade/firstrade_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("firstrade-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.firstrade.com/trading/pricing",
  regulators:
    "https://help.firstrade.info/en/articles/9264069-does-firstrade-assess-regulatory-transaction-fees-to-its-customers",
  readOn: "2026-09-10",
  secAsOf: "2026-04-06",
  entity: "Firstrade Securities Inc. (US)",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const LISTED_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG"]);
const LISTED_CODES = /^(NASDAQ|NYSE|AMEX|ARCA|BATS|CBOE|IEX)$/;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

export function feeMarketOf(row, mic) {
  const code = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  if (LISTED_MICS.has(m) || LISTED_CODES.test(code)) return "listed";
  if (code === "OTC" || /^(OTC|PINK|GREY)/.test(code)) return "otc";
  return null;
}

function remarkOf(market) {
  if (market === "otc") return "OTC: limit only, 0.10 $ min, 100 shares if 1 $ or under.";
  return "";
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
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
    .filter((m) => !wantCurrency || String(m.row.currency || "USD").toUpperCase() === wantCurrency);

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
    native: { each: 0, roundTrip: 0, currency: "USD" },
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
    cap: { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" },
    threshold: null,
    etf,
    place,
    currency,
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Firstrade n'existe pas encore : lancer `node firstrade/firstrade_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Firstrade` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Firstrade`,
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
    currency: String(m.row.currency || "USD").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row, listing.mic);
  if (!market) {
    return {
      ...answer,
      listing,
      why: `${listing.brokerExchange || listing.exchange} n'a pas de palier publié`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const knownPct = SEC_RATE + taxTotal;
  const a = marketBp != null ? marketBp / 1e4 + knownPct : knownPct;
  const bookUsd = marketPerShare ?? 0;

  return {
    ...answer,
    a: Number(Number(a).toPrecision(4)),
    b: Number((bookUsd + TAF_PER_SHARE).toPrecision(6)),
    c: 0,
    floor: null,
    listing,
    feeMarket: market,
    remark: remarkOf(market),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(rates).length ? rates : null,
      réglementaire: { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part` },
      commission: 0,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème Firstrade online, palier ${market}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: { each: 0, roundTrip: 0, currency: "USD", eachWay: true },
    ccy: QUOTE,
    cap: { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" },
    threshold: null,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `Firstrade online, palier ${market}, page lue le ${SCHEDULE.readOn}. ` +
      `0 $ par jambe. SEC ${SEC_RATE} à la vente (taux du ${SCHEDULE.secAsOf}). ` +
      `TAF ${TAF_PER_SHARE} $/share à la vente (pass-through, pas nommé sur la carte). ` +
      `Assisted 19,95 $ hors de ce trajet. Change hors de a (compte USD). ` +
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
          sec: SEC_RATE,
          taf: TAF_PER_SHARE,
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
      "usage : node firstrade_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node firstrade_cost.mjs --schedule\n" +
        "  ex.   node firstrade_cost.mjs AAPL\n" +
        "        node firstrade_cost.mjs IAU AMEX USD --shares=1 --price=82"
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
      console.log(`\nce que Firstrade propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.feeMarket}]\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : TAF et/ou spread 605" : " : rien"})`);
  console.log(`c = ${out.c} $   (par ordre : 0 $ online)`);
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
