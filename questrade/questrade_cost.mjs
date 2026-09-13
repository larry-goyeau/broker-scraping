// What one round trip costs at Questrade: buy n shares at price p, sell them
// back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in.
//
// Questrade charges no commission on a Canadian or US listed stock or ETF
// traded online, buy and sell alike, so `c` is 0. What is left is the book the
// order crosses, one American regulator's line, and an ECN fee that the
// pricing page confines to three named cases:
//
//   Canadian securities        no ECN fee at all. Published as such, not
//                              merely unlisted, which is why TSX / TSXV / CSE
//                              / NEO lines carry nothing on top of the book.
//   US listed, smart routed    no ECN fee. This is the default: the route is
//                              only chosen by hand on the Edge platforms.
//   US OTC                     0.000005 $/share, always, adding or removing.
//                              7 607 of the 24 539 catalogue lines are OTC,
//                              so this is the one ECN line that matters here,
//                              and it is charged on both legs.
//
// Two published ECN cases are deliberately left out because neither is what
// the front asks about — the cost of a plain online round trip. A direct
// routed order costs 0.0012 to 0.004 $/share depending on the venue, but the
// route has to be typed in by hand. An order filled in the overnight session,
// 20 h to 2 h ET, costs 0.003 $/share; the catalogue quotes regular sessions.
// `--ecn=<per share>` forces either one in.
//
// The SEC collects 0.0000206 of the amount on every sale of a US security, and
// Questrade prints that rate itself. It is on the sell leg only, so it enters
// `a` once rather than twice. There is no FINRA TAF next to it: Questrade is a
// Canadian dealer, not a FINRA member passing a levy through, and its fee page
// names the SEC alone.
//
// Conversion stays out of `a`. Every account is dual currency and the
// catalogue holds nothing but USD and CAD lines, so a trade never forces an
// exchange — the client already holds the side he is trading. The 1.5 % is
// real but it is a funding cost, paid once when cash crosses, not a cost of
// the round trip; it is reported in `fxIfConverted`.
//
// Out of scope rather than free: a trade called into the desk adds $45, an
// international equity (neither US nor Canadian listed, so none of this
// catalogue) costs 1 % with a $195 minimum, and an ADR may carry a custody fee
// that is a holding cost, not a trip.
//
//   https://www.questrade.com/pricing/self-directed-commissions-plans-fees/transaction
//   https://www.questrade.com/learning/options-active-trading/ecn-fees-explained
//
//   node questrade/questrade_cost.mjs AAPL
//   node questrade/questrade_cost.mjs XIU TSX CAD --shares=100 --price=38
//   node questrade/questrade_cost.mjs AAPL NASDAQ USD --shares=100 --price=230
//   node questrade/questrade_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("questrade-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  transaction: "https://www.questrade.com/pricing/self-directed-commissions-plans-fees/transaction",
  ecn: "https://www.questrade.com/learning/options-active-trading/ecn-fees-explained",
  pricing: "https://www.questrade.com/pricing-fees",
  readOn: "2026-09-12",
  entity: "Questrade, Inc.",
};

const COMMISSION_EACH = 0;
const TICKET = 0;
const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0;
const FX_RATE = 0.015;

// Per share, one leg. Only the OTC line is charged on a plain online order.
const ECN_OTC = 0.000005;
const ECN_OVERNIGHT = 0.003;
const ECN_DIRECT = { INET: 0.003, ARCA: 0.004, NYSE: 0.004, EDGX: 0.004, EDGA: 0.004, BATS: 0.004, IEX: 0.0012 };

const HOLDABLE = new Set(["USD", "CAD"]);
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "OTCM"]);
const US_EX = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "CBOE", "BATS", "OTC"]);
const CA_EX = new Set(["TSX", "TSXV", "CSE", "NEO", "AEQUITAS"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isOverTheCounter = (row) => /^(OTC|PINK)/i.test(String(row?.exchange || ""));

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

// Which of the three published books a listing falls in. The split is what
// decides the ECN line, so it is named rather than inferred at the call site.
export function feeMarketOf(row, mic) {
  const ex = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  if (isOverTheCounter(row)) return "otc";
  if (CA_EX.has(ex)) return "ca";
  if (US_MICS.has(m) || US_EX.has(ex)) return "us";
  return "autre";
}

export function ecnPerShare(market, { overnight = false, directRoute = null } = {}) {
  if (market === "otc") return ECN_OTC;
  if (market === "ca") return 0;
  if (overnight) return ECN_OVERNIGHT;
  if (directRoute) return ECN_DIRECT[String(directRoute).toUpperCase()] ?? null;
  return 0;
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

function taxParts(isin) {
  const tax = taxesOf(isin);
  const rates = taxRates(tax);
  delete rates.PTM_LEVY;
  const taxTotal = Object.values(rates).reduce((sum, rate) => sum + rate, 0);
  return { tax, rates, taxTotal };
}

export function roundTripCost({
  etf,
  place,
  currency,
  bp = null,
  perShare = null,
  ecn = null,
  overnight = false,
  directRoute = null,
}) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    b: null,
    c: TICKET,
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
      why: "le catalogue Questrade n'existe pas encore : lancer `node questrade/questrade_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Questrade` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Questrade`,
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
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
    otc: isOverTheCounter(m.row),
  };

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const market = feeMarketOf(m.row, listing.mic);
  const american = market === "us" || market === "otc";
  const { tax, rates, taxTotal } = taxParts(listing.isin);

  // A per-share ECN fee is charged on each leg, so the round trip pays twice.
  const ecnEach = ecn ?? ecnPerShare(market, { overnight, directRoute });
  const ecnTrip = ecnEach == null ? null : ecnEach * 2;

  const holdable = HOLDABLE.has(listing.currency);
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => (american ? x : dollars(x, listing.currency)),
  });

  return {
    ...answer,
    a: finite(plus(mkt.a, taxTotal, american ? SEC_RATE : 0, COMMISSION_EACH * 2), 4),
    b: finite(plus(mkt.b, ecnTrip, TAF_PER_SHARE), 6),
    c: TICKET,
    listing,
    feeMarket: market,
    remark: "",
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(rates).length ? rates : null,
      réglementaire: american ? { SEC: SEC_RATE, FINRA: 0 } : null,
      commission: 0,
      ecn: ecnEach == null ? null : { parJambe: ecnEach, allerRetour: ecnTrip, marché: market },
      change: null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.transaction,
    basis: `barème Questrade (0 commission, palier ${market}), lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      rate: COMMISSION_EACH,
      min: 0,
      cap: null,
      flat: null,
      currency: listing.currency,
      eachWay: true,
    },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: holdable ? 0 : FX_RATE * 2,
    overnight,
    directRoute: directRoute || null,
    confidence: confidenceOf({
      market,
      leaf,
      marketBp,
      marketPerShare,
      taxTotal,
      ecnEach,
      holdable,
      american,
      overnight,
      directRoute,
    }),
  };
}

// The only thing Questrade bills on a plain online trip is the ECN line, and
// only on OTC. Kept so the CLI prints the same shape as the brokers that bill.
export function exactCost({ shares, market = "us", overnight = false, directRoute = null, ecn = null }) {
  const each = ecn ?? ecnPerShare(market, { overnight, directRoute });
  return {
    commission: 0,
    ecn: each == null ? null : finite(each * shares * 2, 6),
    currency: QUOTE,
    market,
  };
}

function confidenceOf({ market, leaf, marketBp, marketPerShare, taxTotal, ecnEach, holdable, american, overnight, directRoute }) {
  const lines = [
    `0 commission à l'achat comme à la vente sur les actions et ETF cotés au Canada et aux États-Unis, lu le ${SCHEDULE.readOn}`,
  ];

  if (market === "otc") {
    lines.push(`OTC : frais ECN ${ECN_OTC} $/part sur chaque jambe, quel que soit le routage, donc ${ECN_OTC * 2} $ dans b`);
  } else if (market === "ca") {
    lines.push("place canadienne : aucun frais ECN, la page de tarification l'écrit explicitement plutôt que de l'omettre");
  } else if (ecnEach && overnight) {
    lines.push(`séance de nuit (20 h à 2 h ET) : frais ECN ${ecnEach} $/part par jambe`);
  } else if (ecnEach && directRoute) {
    lines.push(`routage choisi à la main vers ${String(directRoute).toUpperCase()} : frais ECN ${ecnEach} $/part par jambe`);
  } else if (ecnEach) {
    lines.push(`frais ECN imposé à ${ecnEach} $/part par jambe`);
  } else {
    lines.push("US hors OTC en routage automatique : aucun frais ECN, seuls un routage choisi à la main ou la séance de nuit en déclenchent");
  }

  if (american) {
    lines.push(`SEC ${SEC_RATE} du montant à la vente seulement, donc comptée une fois dans a, et pas de TAF puisque Questrade est un courtier canadien`);
  }
  if (taxTotal > 0) lines.push(`taxe de transfert ${(100 * taxTotal).toFixed(2)} % prise dans la carte des taxes`);

  if (marketBp == null && marketPerShare == null) {
    lines.push("pas de feuille de carnet pour cet ISIN / cette place : le spread reste N/A");
  }

  lines.push(
    holdable
      ? `change hors a : le compte est bi-devise et tient déjà les ${HOLDABLE.size} devises du catalogue (1,5 % seulement si le cash doit traverser)`
      : `change ${(FX_RATE * 100).toFixed(2)} % × 2 : cette devise n'est pas tenue par le compte`
  );
  lines.push("aucun aller-retour réel dans ce dépôt");
  if (!leaf) lines.push("carnet absent pour cette ligne");

  return lines.join(" ; ");
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
          commissionEachWay: COMMISSION_EACH,
          ticket: TICKET,
          secRate: SEC_RATE,
          tafPerShare: TAF_PER_SHARE,
          fxRate: FX_RATE,
          ecn: { otc: ECN_OTC, canada: 0, usSmartRouted: 0, overnight: ECN_OVERNIGHT, directRoute: ECN_DIRECT },
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
      "usage : node questrade_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]\n" +
        "        [--ecn=<par part>] [--overnight] [--route=ARCA] [--json]\n" +
        "        node questrade_cost.mjs --schedule\n" +
        "  ex.   node questrade_cost.mjs AAPL\n" +
        "        node questrade_cost.mjs XIU TSX CAD --shares=100 --price=38"
    );
    process.exit(2);
  }

  const out = roundTripCost({
    etf,
    place,
    currency,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    ecn: flag("ecn") ? Number(flag("ecn")) : null,
    overnight: process.argv.includes("--overnight"),
    directRoute: flag("route"),
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (out.a == null && !out.listing) {
    console.log(`a = N/A   b = N/A   c = ${show(out.c)}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce que Questrade propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.feeMarket}]\n`
  );

  const detail = [];
  if (out.bp != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);

  const perShareDetail = [];
  if (out.perShare != null) perShareDetail.push("carnet 605");
  if (out.parts?.ecn?.allerRetour) perShareDetail.push(`ECN ${out.parts.ecn.allerRetour}`);

  console.log(`a = ${show(out.a)}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${show(out.b)} $   (par part${perShareDetail.length ? " : " + perShareDetail.join(" + ") : " : rien"})`);
  console.log(`c = ${show(out.c)} $   (par ordre : aucune commission)`);

  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(
    `\ncoût = ${show(out.a)} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ` +
      `${show(out.b)} × n + ${show(out.c)}   ($ ; p en ${l.currency})`
  );
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency);
    const affine = plus(
      out.a == null || amountUsd == null ? null : out.a * amountUsd,
      out.b == null ? null : out.b * n,
      out.c
    );
    const billed = exactCost({
      shares: n,
      market: out.feeMarket,
      overnight: out.overnight,
      directRoute: out.directRoute,
    });
    console.log(
      `\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` +
        (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : "")
    );
    console.log(`  a, b, c        : ${affine == null ? "N/A" : `${affine.toFixed(4)} $`}`);
    console.log(`  commission     : 0 $`);
    if (billed.ecn != null) console.log(`  ECN            : ${billed.ecn} $`);
  }

  if (out.url) console.log(`\n${out.url}`);
}
