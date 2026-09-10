// What one round trip costs at ChoiceTrade: buy n shares at price p, sell
// them back at once (market, regular hours, online platform).
//
//   coût (USD) = a × p × n + b × n + c
//
// The account holds dollars and the catalogue is American (stocks, ETFs,
// ETNs, a few ETCs). Options are not in the book, so they are not priced.
//
// Default is the online platform, read 2026-09-10 on choicetrade.com/pricing.php.
// NYSE / Nasdaq / AMEX (and CBOE BATS in this catalogue — NMS, filed with the
// listed row) at $1.00 or above: $0 commission. Everything else — OTC, and a
// listed fill under a dollar — is $25 a trade. That $25 is a ticket every
// time, not a minimum of a %, so it lives in `c` (50 $ the round trip).
// Above 10 000 shares the OTC row adds 0.002 $/share; that is `exactCost`,
// not a fourth coefficient. DAY+EXT (0.005 $/share), daytrading (0.002),
// Elite (0.002) and DAS (0.003) are other platforms and are not this trip.
//
// "All Regulatory, Exchange, OCC … surcharges, if applicable, are extra."
// SEC / TAF use the same current figures as the other US files. CAT, NSCC
// and venue fees are not on the card and are left out.
//
// Monthly / inactivity / OTC carrying stay in the remark. No live trip is
// in this deposit yet.
//
//   https://www.choicetrade.com/pricing.php
//
//   node choicetrade/choicetrade_cost.mjs IAU
//   node choicetrade/choicetrade_cost.mjs AAPL NASDAQ USD --shares=1 --price=230
//   node choicetrade/choicetrade_cost.mjs AGSCF OTC USD --shares=1 --price=2
//   node choicetrade/choicetrade_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";

const CATALOGUE = new URL("choicetrade-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.choicetrade.com/pricing.php",
  readOn: "2026-09-10",
  entity: "ChoiceTrade (US)",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const LISTED_MIN_PRICE = 1;
const OTC_TICKET = 25;
const OTC_OVER_SHARES = 10000;
const OTC_OVER_PER_SHARE = 0.002;

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

function remarkOf() {
  return ["Inactivity 55 $/quarter (under 5 trades).", "10 $/month if non-US."].join("\n");
}

export function feeMarketOf(row, mic) {
  const code = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  if (LISTED_MICS.has(m) || LISTED_CODES.test(code)) return "listed";
  if (code === "OTC" || code === "PINK" || /^(OTC|PINK|GREY)/.test(code)) return "otc";
  return "otc";
}

export function ticketEach({ market, price, shares } = {}) {
  const subDollar = price != null && Number(price) < LISTED_MIN_PRICE;
  if (market === "listed" && !subDollar) return 0;
  let each = OTC_TICKET;
  if (shares != null && Number(shares) > OTC_OVER_SHARES) {
    each += (Number(shares) - OTC_OVER_SHARES) * OTC_OVER_PER_SHARE;
  }
  return each;
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
    const market = feeMarketOf(r, book.mic ?? venue?.mic);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function exactCost({ market, price, shares }) {
  const each = ticketEach({ market, price, shares });
  return {
    commission: Number((each * 2).toPrecision(6)),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: "USD" },
    market,
  };
}

export function roundTripCost({ etf, place, currency, bp = null, perShare = null }) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    b: 0,
    c: 0,
    ccy: QUOTE,
    floor: 0.01,
    cap: { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" },
    threshold: null,
    etf,
    place,
    currency,
  };

  if (!catalogue) {
    return { ...answer, why: "le catalogue ChoiceTrade n'existe pas encore : lancer `node choicetrade/choicetrade_scraping.mjs`" };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ChoiceTrade` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ChoiceTrade`,
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
    currency: String(m.row.currency || "USD").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row, listing.mic);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const ticket = ticketEach({ market });
  const a = (marketBp != null ? marketBp / 1e4 : 0) + SEC_RATE;
  const bookUsd = marketPerShare ?? 0;

  return {
    ...answer,
    a: Number(Number(a).toPrecision(4)),
    b: Number((bookUsd + TAF_PER_SHARE).toPrecision(6)),
    c: Number((ticket * 2).toPrecision(6)),
    floor: ticket ? null : 0.01,
    listing,
    feeMarket: market,
    remark: remarkOf(),
    parts: {
      marché: marketBp != null ? Number((marketBp / 1e4).toPrecision(4)) : null,
      réglementaire: { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part` },
      commission: ticket,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème ChoiceTrade online, palier ${market}, lu le ${SCHEDULE.readOn}`,
    commission: {
      each: ticket,
      roundTrip: ticket * 2,
      currency: "USD",
      eachWay: true,
      platform: "online",
    },
    ccy: QUOTE,
    cap: { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" },
    threshold: null,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `commission ${market} selon choicetrade.com/pricing.php, lu le ${SCHEDULE.readOn}. ` +
      `Plateforme online, market aux heures régulières. ` +
      (market === "listed"
        ? `0 $ par jambe au-dessus de ${LISTED_MIN_PRICE} $ ; sous ${LISTED_MIN_PRICE} $ le ticket OTC s'applique. `
        : `Ticket ${OTC_TICKET} $ par jambe dans c. Au-delà de ${OTC_OVER_SHARES} parts, ${OTC_OVER_PER_SHARE} $ / part en plus (exactCost). `) +
      `SEC / TAF aux taux courants. DAY+EXT, daytrading, Elite et DAS ne sont pas cet aller-retour. ` +
      `Aucun aller-retour réel chez ChoiceTrade dans ce dépôt. ` +
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
          listed: { commission: 0, minPrice: LISTED_MIN_PRICE },
          otc: { ticket: OTC_TICKET, overShares: OTC_OVER_SHARES, overPerShare: OTC_OVER_PER_SHARE },
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
      "usage : node choicetrade_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node choicetrade_cost.mjs --schedule\n" +
        "  ex.   node choicetrade_cost.mjs IAU\n" +
        "        node choicetrade_cost.mjs AAPL NASDAQ USD --shares=1 --price=230\n" +
        "        node choicetrade_cost.mjs AGSCF OTC USD --shares=1 --price=2"
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
      console.log(`\nce que ChoiceTrade propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : TAF et/ou spread 605" : " : rien"})`);
  console.log(
    `c = ${out.c} $   (par ordre${out.c ? " : ticket OTC 25 $ × 2" : " : 0 $ online listé"})`
  );
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
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
    const billed = exactCost({ market: out.feeMarket, price: p, shares: n });
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
