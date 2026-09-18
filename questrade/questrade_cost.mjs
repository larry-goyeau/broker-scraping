// What one round trip costs at Questrade: buy n shares at price p, sell them
// back at once. `roundTrip()` answers the bill in dollars rather than an affine
// triple, so a per-share fee and a percentage of the amount can sit in the same
// number without the caller reassembling them.
//
// Questrade charges no commission on a Canadian or US listed stock or ETF
// traded online, buy and sell alike — the page prints "FREE" on all four of buy
// and sell, stock and ETF. What is left is the book the order crosses, one
// American regulator's line, and an ECN fee that the pricing page confines to
// three named cases:
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
// route has to be typed in by hand, and the page charges it on the side that
// ADDS liquidity, which is the reverse of the usual ECN convention it explains
// two paragraphs above. An order filled in the overnight session, 8 pm to 2 am
// ET, costs 0.003 $/share; the catalogue quotes regular sessions.
// `--ecn=<per share>` forces either one in.
//
// The SEC collects 0.0000206 of the amount on every sale of a US security, and
// Questrade prints that rate itself. It is on the sell leg only, so it is
// counted once rather than twice. There is no FINRA TAF next to it: Questrade
// is a Canadian dealer, not a FINRA member passing a levy through, and its fee
// page names the SEC alone.
//
// One divergence from that page is deliberate. Questrade writes that the SEC
// fee is charged "if you sell an American security listed on an American
// exchange", and an OTC line is by definition not listed on one. But section 31
// reaches every covered sale, including the OTC ones reported to FINRA, and no
// broker absorbs it. So the fee is charged on the 7 607 OTC lines too, against
// the letter of the sentence and with the reason written here rather than
// buried.
//
// Conversion stays out of the total. Every account is dual currency and the
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
// One out-of-scope fee is large enough to name. Settling a security the
// Depository Trust Company will not take electronically costs $450, and the
// page gives no list of which lines those are. Nothing in the catalogue says
// it either, so it cannot be charged here — but it is the one number that
// could dwarf an OTC round trip, and it is recorded rather than dropped.
//
// The other tabs of the same page price products this catalogue does not hold:
// warrants and rights at 0.025 % a fill, notes and debentures at $0.10 per
// $1,000 of par, mutual funds at $9.95. The 24 539 lines here are stocks and
// ETFs and nothing else, so none of that applies.
//
//   https://www.questrade.com/pricing/self-directed-commissions-plans-fees/transaction
//   https://www.questrade.com/learning/options-active-trading/ecn-fees-explained
//
//   node questrade/questrade_cost.mjs AAPL
//   node questrade/questrade_cost.mjs AAB.TO TSX CAD --shares=100 --price=0.5
//   node questrade/questrade_cost.mjs AAPL NASDAQ USD --shares=100 --price=230
//   node questrade/questrade_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../fx.mjs";
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
//
// The venues are the six the page names, under the names it uses. An earlier
// reading keyed Nasdaq as INET and added EDGA, which the page does not name:
// `--route=NASDAQ` answered N/A and `--route=EDGA` answered a rate nobody
// published. INET is kept as an alias because the Edge platforms print it.
const ECN_OTC = 0.000005;
const ECN_OVERNIGHT = 0.003;
const ECN_DIRECT = { NASDAQ: 0.003, INET: 0.003, BATS: 0.004, ARCA: 0.004, NYSE: 0.004, EDGX: 0.004, IEX: 0.0012 };

// Named, not charged: the catalogue cannot say which lines the DTC refuses.
const NON_DTC_SETTLEMENT = 450;

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

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `usd` is the number the page prints; `brokerFees` is the part Questrade keeps,
 * which on a plain online trip is nothing at all.
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  bp = null,
  perShare = null,
  ecn = null,
  overnight = false,
  directRoute = null,
}) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
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
  const basis = `barème Questrade (0 commission, palier ${market}), lu le ${SCHEDULE.readOn}`;

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: listing.currency,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.transaction,
    basis,
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
    // What a conversion would cost, not what this trip costs. The account holds
    // both sides of the catalogue, so crossing is the client's choice and stays
    // out of `usd` — the same treatment a Robinhood general account gets.
    fxIfConverted: FX_RATE * 2,
    overnight,
    directRoute: directRoute || null,
    remark: remarkOf(listing.currency),
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

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
    };
  }

  const notional = dollars(n * p, listing.currency);

  // The book is already a round trip — the Rule 605 effective spread per share
  // in America, basis points elsewhere — so it is added once, not per side.
  const bookUsd =
    marketBp != null && notional != null
      ? (notional * marketBp) / 1e4
      : marketPerShare != null
        ? american
          ? marketPerShare * n
          : dollars(marketPerShare * n, listing.currency)
        : null;

  // The SEC takes its cut on the sale alone, the ECN on both legs.
  const secUsd = american && notional != null ? notional * SEC_RATE : 0;
  const ecnUsd = ecnEach == null ? null : ecnEach * n * 2;
  const taxUsd = notional != null ? notional * taxTotal : 0;

  const usd = plus(bookUsd, secUsd, ecnUsd, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    // Nothing on this line is Questrade's. The commission is zero, the SEC fee
    // is the regulator's, the ECN fee is the network's and passed through at
    // cost, and the spread belongs to whoever is on the other side. The only
    // money Questrade makes on this trip is the conversion, and only if the
    // client chooses to convert.
    brokerFees: 0,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille 605"}` }
      : {}),
    trade: { shares: n, price: p, notional: n * p, notionalUsd: finite(notional, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      réglementaire: Number(secUsd.toFixed(6)),
      ecn: ecnUsd == null ? null : Number(ecnUsd.toFixed(6)),
      commission: 0,
      change: 0,
      taxes: Number(taxUsd.toFixed(6)),
    },
    taxRates: Object.keys(rates).length ? rates : null,
    sell: { sec: Number(secUsd.toFixed(6)), taf: TAF_PER_SHARE },
  };
}

// The trip itself is fully in `usd`, so the remark carries the one real cost
// that is not: the conversion, which prices moving cash between the two sides of
// the account rather than buying and selling.
function remarkOf(currency) {
  return fxRemark((FX_RATE * 100).toFixed(1), currency);
}

function confidenceOf({ market, leaf, marketBp, marketPerShare, taxTotal, ecnEach, holdable, american, overnight, directRoute }) {
  const lines = [
    `0 commission à l'achat comme à la vente sur les actions et ETF cotés au Canada et aux États-Unis, lu le ${SCHEDULE.readOn}`,
  ];

  if (market === "otc") {
    lines.push(
      `OTC : frais ECN ${ECN_OTC} $/part sur chaque jambe, quel que soit le routage, donc ${ECN_OTC * 2} $ la part sur l'aller-retour`
    );
  } else if (market === "ca") {
    lines.push("place canadienne : aucun frais ECN, la page de tarification l'écrit explicitement plutôt que de l'omettre");
  } else if (ecnEach && overnight) {
    lines.push(`séance de nuit (20 h à 2 h ET) : frais ECN ${ecnEach} $/part par jambe`);
  } else if (ecnEach && directRoute) {
    lines.push(
      `routage choisi à la main vers ${String(directRoute).toUpperCase()} : frais ECN ${ecnEach} $/part par jambe, ` +
        `facturés par la page sur la jambe qui APPORTE de la liquidité, à rebours de la convention qu'elle explique elle-même plus haut`
    );
  } else if (ecnEach) {
    lines.push(`frais ECN imposé à ${ecnEach} $/part par jambe`);
  } else {
    lines.push("US hors OTC en routage automatique : aucun frais ECN, seuls un routage choisi à la main ou la séance de nuit en déclenchent");
  }

  if (american) {
    lines.push(
      `SEC ${SEC_RATE} du montant à la vente seulement, donc comptée une fois, ` +
        `et pas de TAF puisque Questrade est un courtier canadien et que sa page ne nomme que la SEC`
    );
  }
  if (market === "otc") {
    lines.push(
      `SEC comptée malgré la lettre de la page, qui la réserve aux titres « cotés sur une bourse américaine » : ` +
        `la section 31 atteint toute vente couverte, y compris hors cote déclarée à la FINRA`
    );
    lines.push(
      `non chiffré : ${NON_DTC_SETTLEMENT} $ de règlement si le titre n'est pas éligible au DTC — ` +
        `la page ne publie aucune liste et le catalogue ne le dit pas, mais c'est le seul montant capable d'écraser un aller-retour hors cote`
    );
  }
  if (taxTotal > 0) lines.push(`taxe de transfert ${(100 * taxTotal).toFixed(2)} % prise dans la carte des taxes`);

  if (marketBp == null && marketPerShare == null) {
    lines.push("pas de feuille de carnet pour cet ISIN / cette place : le spread reste N/A");
  }

  lines.push(
    holdable
      ? `change hors du total : le compte est bi-devise et tient déjà les ${HOLDABLE.size} devises du catalogue ` +
        `(${(FX_RATE * 100).toFixed(1)} % par sens seulement si le cash doit traverser)`
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
          nonDtcSettlement: NON_DTC_SETTLEMENT,
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
        "        node questrade_cost.mjs AAB.TO TSX CAD --shares=100 --price=0.5"
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
    ecn: flag("ecn") ? Number(flag("ecn")) : null,
    overnight: process.argv.includes("--overnight"),
    directRoute: flag("route"),
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
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

  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
        "\n"
    );
    console.log(`aller-retour     : ${show(out.usd)} $`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const p = out.parts || {};
    if (p.marché != null) console.log(`  carnet         : ${p.marché} $`);
    if (p.réglementaire) console.log(`  SEC            : ${p.réglementaire} $   (à la vente seule, aucune TAF)`);
    if (p.ecn) console.log(`  ECN            : ${p.ecn} $   (${out.feeMarket}, les deux jambes)`);
    if (p.taxes) console.log(`  taxes          : ${p.taxes} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.fxIfConverted) {
    console.log(`  change ${out.fxIfConverted} l'aller-retour si le cash doit traverser, hors du total`);
  }

  if (out.url) console.log(`\n${out.url}`);
}
