// What one round trip costs at tastytrade: buy n shares at price p, sell them back at once.
//
//   coût = a × p × n + b × n + c
//
// The same three terms as `trading212_cost.mjs`, and the front end can call either without
// knowing which broker it is asking about. What differs is which term carries the weight.
// At Trading212 everything sits in `a`, the spread being the whole bill. Here `a` is almost
// empty and `b` is the real charge, because this broker takes no commission and the two fees
// that remain are counted by the share.
//
// That is not a detail of presentation. Thirteen real round trips on 25 August 2026, 68 500
// dollars of notional, cost 3.21 dollars in total — 0.47 bp. Of that, 2.68 dollars were fees
// and 0.53 was execution: 84% of what left the account was charged by rule, not paid to the
// market. Trading212's proportions are the exact opposite.
//
// That aggregate is a trap, though, and it took splitting the trips by book width to see it.
// Twelve of the thirteen were on funds quoting a single cent, where the fees do dominate:
// 2.67 dollars of fees against 0.44 of execution, and the execution as often negative as
// positive. The thirteenth was AQLT, quoting nine cents — 28 bp at its price — and it paid
// half of that quoted spread, exactly, which came to 87% of its cost and six times its fees.
// So the market term is negligible only where the book is one tick wide, and on a fund that
// quotes wider it is the whole answer.
//
// Which is why it is now priced rather than omitted. `rule605-monthly.mjs` reads the monthly
// execution-quality reports that Rule 605 obliges the firms executing retail flow to publish,
// and takes their average effective spread: what orders in that security actually paid
// against the midpoint, price improvement included. It arrives in dollars per share, so it
// lands in `b` beside the fees rather than in `a` — an American quote moves by whole cents,
// which makes the cost per share the thing that holds still and the percentage the thing that
// drifts with the price.
//
// It is a monthly average from five firms, Jane Street among them, which matters here because
// it is one of the largest wholesalers in these very funds. Citadel and Virtu, which take much
// of the retail flow in the United States, still publish behind bot protection and are missing.
// The reporters that can be read disagree with each other by more than the figure itself on
// thin funds, so treat those as an order of magnitude. Where it is absent entirely, `basis`
// says `frais seuls` and the answer is a floor.
//
// One boundary is now measured rather than suspected, and it is worth knowing before trusting
// `b` on a wide fund. The reports cover orders of 100 to 499 shares; below a hundred, the
// legacy report does not look, and the improvement it credits does not arrive. Six round trips
// of ten shares on 2026-08-27 put ACWI and IAU within a fraction of a cent of their published
// figures, and AQLT at thirteen cents a share against 3.3 published — its two sales both filled
// at the bid to the ten-thousandth, its purchases at the offer, the quoted spread paid whole.
// So on a book wider than a tick, `b` is a round-lot price: for a smaller order, pass the quoted
// touch as `perShare` and the formula becomes exact again.
//
//   node tastytrade/tastytrade_cost.mjs ACWI NASDAQ USD
//   node tastytrade/tastytrade_cost.mjs US4642882579 NASDAQ USD --shares=50 --price=160.87
//   node tastytrade/tastytrade_cost.mjs IAU AMEX USD --json
//   node tastytrade/tastytrade_cost.mjs --verify        -- rejoue le modèle sur les 23 ventes réelles
//
// `roundTripCost(...)` returns what the CLI prints and reads two files rather than the
// network, so it needs no await. `exactCost(...)` is beside it for the cases where the
// rounding matters, and at these amounts it often does.

import fs from "node:fs";
import { listingKey, resolveVenue } from "../venues.mjs";

// Anchored to the repository rather than to whatever directory the shell happens to be in, so
// this works both as `node tastytrade/tastytrade_cost.mjs` and from inside the folder.
const CATALOGUE = new URL("../parsed_json/tastytrade-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);
const RULE605 = new URL("../parsed_json/rule605-monthly.json", import.meta.url);

// ------------------------------------------------------------------ the broker's terms

// `c`, charged by the order, is zero: no commission on shares or ETFs, on either leg, and
// no ticket charge. The one place a flat term could hide is the SEC fee's rounding, which
// is upward to the cent and therefore never returns nothing — that is `floor` below, not
// `c`, because it is a minimum on a term rather than a term of its own.
const FLAT = 0;

// tastytrade's own clearing charge, both legs, and the largest of the three fees at every
// size that was tested. Not a regulator's: this one is the broker's own, which is why it is
// the only figure here that a competitor could undercut.
const CLEARING_PER_SHARE = 0.0008;

// FINRA's Trading Activity Fee, on the sell alone, at the rate FINRA published for 2026 and
// capped per execution. The cap is reached at 50 206 shares, and it is assessed per
// execution rather than per order, so an order broken into five fills gets five caps —
// which makes the true bill depend on the slicing, something no function of n and p sees.
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;

// The SEC's Section 31 fee, on the sell alone, proportional to the proceeds. The rate is
// 20.60 dollars per million, set on 27 February 2026 and effective 4 April; before that
// date it stood at zero, so a model of this broker read from a 2025 statement would be
// wrong in a way no arithmetic would reveal.
const SEC_RATE = 0.0000206;

// Both fees are rounded before they are charged, and the two directions differ: the SEC
// line up to the cent, the per-share lines to the tenth of a cent. Reproducing the ledger
// requires getting this right — the difference between rounding the SEC fee up and rounding
// it to the nearest is a cent on every small sell, which is the whole bill on a small sell.
const up = (value, step) => Math.ceil(value / step - 1e-9) * step;
const near = (value, step) => Math.round(value / step) * step;

// `a` and `b`, as the front end wants them. `b` mixes a two-legged charge with a one-legged
// one, which is exactly the folding a round-trip formula performs: clearing counts twice,
// the TAF once.
const PER_SHARE = 2 * CLEARING_PER_SHARE + TAF_PER_SHARE;

// The 23 sell fills in the account's ledger for that day, as tastytrade reported them:
// shares, proceeds, then the two fee lines it charged. Kept because they are what makes the
// figures above more than a reading of a fee schedule — `--verify` recomputes the model
// against them, and it reproduces all 23 to the tenth of a cent. The 18:23 ACWI order
// filled in two pieces, which is why there are 23 sells for 13 round trips.
const LEDGER_SELLS = [
  ["AQLT", 2, 63.96, 0.01, 0.002],
  ["AQLT", 10, 313.6, 0.012, 0.008],
  ["AQLT", 20, 627.218, 0.024, 0.016],
  ["AQLT", 10, 313.5, 0.012, 0.008],
  ["AQLT", 1, 31.225, 0.01, 0.001],
  ["AQLT", 35, 1085.7, 0.037, 0.028],
  ["AQLT", 9, 279.585, 0.012, 0.008],
  ["AQLT", 8, 249.44, 0.012, 0.007],
  ["AQLT", 2, 62.06, 0.01, 0.002],
  ["AQLT", 47, 1458.41, 0.049, 0.038],
  ["CLOI", 2, 105.89, 0.01, 0.002],
  ["CLOI", 10, 529.433, 0.022, 0.008],
  ["IAU", 10, 873.2, 0.022, 0.008],
  ["IAU", 100, 8726.5, 0.2, 0.08],
  ["IAU", 100, 8725.01, 0.2, 0.08],
  ["IAUM", 100, 4626.5, 0.12, 0.08],
  ["IAUM", 100, 4630.5, 0.12, 0.08],
  ["ACWI", 50, 8042.755, 0.18, 0.04],
  ["ACWI", 50, 8043.505, 0.18, 0.04],
  ["ACWI", 50, 8044.25, 0.18, 0.04],
  ["ACWI", 50, 8044.25, 0.18, 0.04],
  ["ACWI", 5, 804.35, 0.021, 0.004],
  ["ACWI", 45, 7239.15, 0.159, 0.036],
];

// ------------------------------------------------------------------------- the listing

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
const rows = Array.isArray(catalogue) ? catalogue : catalogue.rows || [];
const spreads = JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Same search as the Trading212 file. The American venues resolve to MICs like the European
// ones now, so the first branch does the work; the loose comparison on the broker's own
// spelling stays as the fallback for a label no alias list has met yet.
function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => loose(r.isin) === asked || loose(r.ticker) === asked);
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

// ---------------------------------------------------------------------------- the cost

export function roundTripCost({ etf, place, currency, bp = null, perShare = null }) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    b: Number(PER_SHARE.toPrecision(6)),
    c: FLAT,
    // Every sell's SEC line is rounded up to the cent, so no round trip is cheaper than
    // that cent however small it is. On one share of a 31-dollar fund it was the entire
    // regulatory charge.
    floor: 0.01,
    // Where `b` stops growing. Per execution, not per order.
    cap: { term: "b", part: "FINRA TAF", amount: TAF_CAP, fromShares: Math.ceil(TAF_CAP / TAF_PER_SHARE), per: "exécution" },
    etf,
    place,
    currency,
  };

  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue tastytrade` };
  if (!matches.length)
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez tastytrade`,
      alternatives: named.map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`).slice(0, 12),
    };

  const m = matches[0];
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    mic: m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
  };

  // A spread is a fact about one book, so the file is only consulted at this listing's own
  // venue. Borrowing a European reading for an American line would be the one error worth
  // preventing here: they are different funds with different books, and a US-listed tracker
  // is not the Dublin one whatever its name says.
  const leaf = (listing.mic && spreads[listing.isin]?.[listing.mic]?.[listing.currency]) || null;
  // Two units can arrive, and each folds into the coefficient that shares its shape: a
  // percentage of the amount into `a`, a charge per share into `b`. American listings come
  // per share, which is why that is the branch this broker normally takes.
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;

  return {
    ...answer,
    // a = the SEC's rate, plus a percentage-quoted book if one was given for this line.
    a: Number((SEC_RATE + (marketBp ?? 0) / 1e4).toPrecision(4)),
    // b = the two per-share fees, plus the book when it is quoted per share.
    b: Number((PER_SHARE + (marketPerShare ?? 0)).toPrecision(6)),
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? null,
    basis:
      bp || perShare
        ? "imposé"
        : marketBp != null || marketPerShare != null
          ? "publié"
          : "frais seuls",
    // Which rule each part of the answer comes from, so a rate that changes can be traced
    // to its term rather than hunted through a total.
    fees: {
      secOfAmount: SEC_RATE,
      tafPerShare: TAF_PER_SHARE,
      clearingPerShareEachWay: CLEARING_PER_SHARE,
      commission: 0,
    },
    // A published effective spread above a cent a share means the touch is wider than the
    // minimum tick, so the improvement inside that figure is doing real work — and it is
    // exactly there that an odd lot stops receiving it. Price-free on purpose: the same test
    // has to hold whatever the share costs.
    confidence: confidenceOf(marketBp ?? marketPerShare, m, (marketPerShare ?? 0) > 0.01),
    // tastytrade holds dollars and nothing else, so no conversion is charged by the broker.
    // What a euro-funded person pays to get dollars in is their bank's business and does not
    // belong to this formula.
    fxIfConverted: null,
    // Named apart from the Trading212 file's `check` on purpose: there it reports what real
    // orders paid on that very line, here it reports that the fee arithmetic reproduces a
    // ledger. A front end that treated the two as the same field would compare a measured
    // cost with a passed test.
    validation: {
      sells: LEDGER_SELLS.length,
      reproduced: verify().ok,
      trips: 13,
      sharesRoundTripped: ledgerFees().shares,
      // Both legs of the fee side, off the ledger. The total the account actually lost on
      // those trips was 3.21 $, execution included, and that one cannot be rebuilt here: the
      // buy prices are not in this file, only the sells are.
      fees: ledgerFees().roundTrip,
      paidRealised: 3.21,
      // The market term compared with what those trips actually paid, fund by fund and in
      // cents per share, read from the table each time rather than written down: the blend
      // changes when a reporter is added, and a number copied here would quietly stop
      // describing the coefficient above. Adding Jane Street halved the figure for IAU,
      // from 0.31 to 0.17, against 0.079 measured.
      //
      // The trips remain a weak test whatever the blend. Execution swung by more than a
      // dollar a trip on the two 100-share IAU round trips alone, and the interval around
      // the IAU measurement, -0.31 to +0.44 cents, contains any of these published values.
      // Reported rather than tuned away: fitting the coefficient to this sample would be
      // fitting it to noise.
      market: perShareAgainstMeasured(),
      on: "2026-08-27",
    },
  };
}

// What the broker will actually charge, rounding included, for whoever needs the cent
// rather than the coefficient. The affine form is the average of this; on a small order the
// two differ by most of the bill.
export function exactCost({ shares, price, bp = null, perShare = null }) {
  const proceeds = shares * price;
  const clearing = up(shares * CLEARING_PER_SHARE, 0.001) * 2;
  const taf = Math.min(near(shares * TAF_PER_SHARE, 0.001), TAF_CAP);
  const sec = up(proceeds * SEC_RATE, 0.01);
  // The market's share of the bill is not rounded: it is not a line on the statement but
  // the price the fills came in at, already inside them.
  const market = ((bp ?? 0) / 1e4) * proceeds + (perShare ?? 0) * shares;
  return {
    clearing: Number(clearing.toFixed(4)),
    taf: Number(taf.toFixed(4)),
    sec: Number(sec.toFixed(4)),
    market: Number(market.toFixed(4)),
    total: Number((clearing + taf + sec + market).toFixed(4)),
  };
}

// Replays the model against the ledger. Kept in the file rather than in a test because the
// three rates expire — the SEC resets its own every year, FINRA has published increases
// through 2029 — and this is what will fail first when one of them moves.
export function verify() {
  const wrong = [];
  for (const [symbol, shares, proceeds, regulatory, clearing] of LEDGER_SELLS) {
    const model = {
      regulatory: near(shares * TAF_PER_SHARE, 0.001) + up(proceeds * SEC_RATE, 0.01),
      clearing: up(shares * CLEARING_PER_SHARE, 0.001),
    };
    if (Math.abs(model.regulatory - regulatory) > 5e-4 || Math.abs(model.clearing - clearing) > 5e-4) {
      wrong.push({ symbol, shares, proceeds, charged: { regulatory, clearing }, model });
    }
  }
  return { ok: LEDGER_SELLS.length - wrong.length, of: LEDGER_SELLS.length, wrong };
}

// What real orders paid the market, in cents a share, beside what the reports say about the
// same funds. The measured side is written down because it is a measurement and will not
// change; the published side is read at every call, because it moves whenever a reporter joins
// the table, and a copy of it here would go on describing a blend that no longer exists.
//
// Two campaigns, and the second is the one that found the limit of the published figure. Six
// round trips of ten shares, each leg measured against the mid standing just before it — the
// Rule 605 definition — say that a penny-wide book behaves as advertised and a wide one does
// not: AQLT quoted 32.05/32.19 and both sales filled at 32.0500 exactly, the bid, while both
// purchases filled at the offer. Thirteen cents a share against 3.3 published. The reports
// average orders of 100 to 499 shares, and an odd lot is not in that sample at all, so on a
// wide book they describe an improvement a ten-share order does not get.
const MEASURED = [
  {
    on: "2026-08-25",
    shares: "1 à 100",
    how: "exécution réalisée sur treize allers-retours",
    cents: { IAU: 0.079, AQLT: 4.5, CLOI: 0.17 },
  },
  {
    on: "2026-08-27",
    shares: 10,
    how: "six allers-retours, chaque jambe contre le mid qui la précédait",
    cents: { ACWI: -0.18, IAU: 0.24, AQLT: 12.99 },
  },
];

const perShareAgainstMeasured = () => {
  let table = {};
  try {
    table = JSON.parse(fs.readFileSync(RULE605, "utf8")).symbols || {};
  } catch {}
  return MEASURED.map((campaign) => ({
    on: campaign.on,
    shares: campaign.shares,
    how: campaign.how,
    funds: Object.entries(campaign.cents).map(([symbol, paid]) => ({
      symbol,
      paidCentsPerShare: paid,
      publishedCentsPerShare: table[symbol]
        ? Number((table[symbol].perShare * 100).toFixed(3))
        : null,
    })),
  }));
};

// The fee side of the same trips, summed off the ledger rather than quoted: both clearing legs
// and the sell-side regulatory lines, over the 816 shares that went round.
const ledgerFees = () => {
  let regulatory = 0;
  let clearing = 0;
  let shares = 0;
  for (const [, n, , r, c] of LEDGER_SELLS) {
    regulatory += r;
    clearing += c;
    shares += n;
  }
  return { shares, roundTrip: Number((regulatory + 2 * clearing).toFixed(2)) };
};

// The fee side is not an estimate — and now not even a reading of a schedule: tastytrade quotes
// the fees of an order before it exists, and on all twelve legs of the six round trips its
// quote and this model agreed to five hundredths of a cent. The residue is one rounding: the
// quote carries the FINRA fee unrounded, 0.00195 $ for ten shares, where the ledger charged it
// to the nearest mill. What the market takes is the estimate, and the funds where both a
// measurement and a published figure exist say how good a one: on IAU and ACWI the reports land
// within a fraction of a cent of what was paid; on AQLT they are a quarter of it at ten shares,
// for the reason given at the top. `validation.market` recomputes those comparisons from the
// current table rather than repeating them.
//
// Two caveats travel with every one of those figures. They average a month of orders of 100
// to 499 shares, and a smaller order is not in the sample at all, the legacy report not
// covering odd lots. And they come from five firms rather than the seven that matter: Citadel
// and Virtu are missing, and on a thin fund the five that can be read disagree by more than
// the number itself, which is the honest width of it.
const confidenceOf = (market, match, touchWide) =>
  market != null
    ? `frais exacts (23 ventes réelles reproduites), plus le spread effectif publié : moyenne ` +
      `mensuelle sur les ordres immédiats de 100 à 499 parts, cinq teneurs, Citadel et Virtu manquants` +
      (touchWide
        ? `. ATTENTION carnet large : sous 100 parts, l'amélioration de prix que ce chiffre contient ` +
          `n'a pas lieu — six allers-retours de 10 parts ont payé 13 c/part sur AQLT contre 3,3 c publiés, ` +
          `soit la touche entière. Pour un ordre en lot rompu, passer la touche cotée en \`perShare\``
        : "")
    : `frais exacts (23 ventes réelles reproduites), mais AUCUN carnet : ${match.unsourced?.name || "cette place"}, ${match.unsourced?.why || "pas de source"}. ` +
      `À lire comme un plancher. Sur un carnet coté au cent l'omission est sans biais (douze allers-retours, exécution moyenne 0,067 c/part, intervalle à 95 % contenant zéro) ; ` +
      `sur le seul fonds mesuré à carnet large, 9 c cotés, elle a fait manquer 14 bp contre 2,2 bp de frais`;

// ------------------------------------------------------------------------------- entrée

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--verify")) {
    const v = verify();
    console.log(`modèle de frais contre le grand livre : ${v.ok} ventes sur ${v.of}`);
    for (const w of v.wrong)
      console.log(
        `  ✗ ${w.symbol} ×${w.shares} : facturé ${w.charged.regulatory}/${w.charged.clearing}, ` +
          `modèle ${w.model.regulatory.toFixed(3)}/${w.model.clearing.toFixed(3)}`
      );
    process.exit(v.wrong.length ? 1 : 0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;

  if (!etf) {
    console.error(
      "usage : node tastytrade_cost.mjs <ETF|ISIN> <place> <devise> [--shares=n] [--price=p] [--bp=x] [--json]\n" +
        "        node tastytrade_cost.mjs --verify\n" +
        "  ex.   node tastytrade_cost.mjs ACWI NASDAQ USD --shares=50 --price=160.87"
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
  } else if (out.a == null) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) console.log(`\nce que tastytrade propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
  } else {
    const l = out.listing;
    console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
    console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}\n`);
    console.log(`a = ${out.a}   (au prorata du montant : frais SEC 0,0000206${out.bp ? ` + ${out.bp} bp de carnet` : ""})`);
    console.log(
      `b = ${out.b}   (par part : compensation 0,0008 aux deux jambes + TAF 0,000195 à la vente` +
        `${out.perShare ? ` + ${out.perShare} de spread effectif` : ""})`
    );
    console.log(`c = ${out.c}   (par ordre : aucune commission)`);
    console.log(`\ncoût = ${out.a} × p × n + ${out.b} × n + ${out.c}   (${out.basis})`);
    console.log(`  plancher ${out.floor} ${l.currency} : les frais SEC s'arrondissent au centime supérieur`);
    console.log(`  ${out.confidence}`);

    const n = Number(flag("shares"));
    const p = Number(flag("price"));
    if (n > 0 && p > 0) {
      const affine = out.a * p * n + out.b * n + out.c;
      const e = exactCost({ shares: n, price: p, bp: out.bp, perShare: out.perShare });
      console.log(`\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${(n * p).toFixed(2)} ${l.currency}`);
      console.log(`  forme affine  : ${affine.toFixed(4)} ${l.currency}   soit ${((affine / (n * p)) * 1e4).toFixed(2)} bp`);
      console.log(`  arrondis pris : ${e.total.toFixed(4)} ${l.currency}   (SEC ${e.sec.toFixed(3)} + TAF ${e.taf.toFixed(3)} + compensation ${e.clearing.toFixed(3)}${e.market ? ` + carnet ${e.market.toFixed(3)}` : ""})`);
      const gap = e.total - affine;
      if (Math.abs(gap) >= 0.0005)
        console.log(`  l'arrondi ajoute ${gap > 0 ? "+" : ""}${gap.toFixed(4)} ${l.currency}, ${((gap / affine) * 100).toFixed(0)} %`);
    }
    if (out.url) console.log(`\n${out.url}`);
  }
}
