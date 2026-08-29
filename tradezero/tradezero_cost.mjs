// For one ETF, one venue and one currency, the three coefficients of
//
//     coût d'un aller-retour = a × p × n + b × n + c
//
// on TradeZero, with n the number of shares and p the share price, the account funded in the
// currency the fund quotes in — dollars, since the offer is American listings alone.
//
// This is the first broker in the repository where the affine form is not enough on its own, and
// the reason is worth stating before the numbers. Everywhere else the coefficients are a property
// of the fund and the venue. Here they are a property of the *order*: TradeZero charges nothing
// for a limit order that rests, half a cent a share for one that crosses, and a flat 49 cents for
// anything under a hundred shares. Those are not adjustments to one formula, they are three
// formulas, and the cost as n grows is not monotone — a hundred shares can cost less than ten.
// So the file answers with the coefficients of one regime, named, and carries the other two
// alongside so that nothing has to be guessed from a single triple.
//
// Which regime a person lands in is the whole story of what this broker costs:
//
//   repos     limite non exécutable, 100 parts ou plus  →  aucune commission
//   immédiat  au marché ou limite exécutable, 100+      →  0,005 par part et par jambe
//   petit     moins de 100 parts, quel que soit le type  →  0,49 forfaitaire par jambe
//
// A ten-share round trip therefore pays 98 cents of commission before any fee or any spread,
// where Alpaca charges three cents in total. The same broker is close to the cheapest here for
// somebody placing resting orders of a few hundred shares, where the whole bill is a dime of
// clearing minimums. It is the widest spread between regimes of any broker in this repository,
// and it is why `shares` and `order` are arguments rather than presentation.
//
// The entity matters as much as the regime, and was not assumed: the client portal's own API was
// asked on 2026-08-28 and answered `"entity":"TZI"`, TradeZero International, in Nassau. The
// American and European arms publish different schedules — America has made all order types free
// since May 2026 and has no 49-cent line at all — so an answer taken from the wrong one would be
// wrong by a dollar on every small round trip. Nothing below is read off those two documents.
//
// Two checks, both on 2026-08-28, and they found two different kinds of error. The platform
// publishes a pre-trade calculator, `accounts/commissionreturn`, which is the broker doing this
// file's arithmetic on its own schedule: twenty-two quotes from one to five thousand shares agree
// with the model to the cent, but only after correcting the activity fee, which the schedule
// prints stale at 0.000166 while the broker charges FINRA's current 0.000195. Then a real four-
// share round trip on IAU: commission exactly 98 cents as claimed, and the market term wrong by
// six times — a broken lot pays the whole penny touch, not the improved average that Rule 605
// publishes for hundred-share orders. The fee arithmetic is therefore solid and the market term
// is the weak coefficient, which is the reverse of where the effort went.
//
//   node tradezero/tradezero_cost.mjs IAU
//   node tradezero/tradezero_cost.mjs IAU --shares=10               -- régime petit
//   node tradezero/tradezero_cost.mjs IAU --shares=500 --order=repos
//   node tradezero/tradezero_cost.mjs SPY NASDAQ USD --shares=200 --price=650 --json
//   node tradezero/tradezero_cost.mjs --schedule

import fs from "node:fs";
import { listingKey, resolveVenue } from "../venues.mjs";

const CATALOGUE = new URL("tradezero-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

// ------------------------------------------------------------------ the broker's terms

const SCHEDULE = {
  entity: "TZI",
  name: "TradeZero International",
  source: "https://tradezero.com/documents/29520a27f77642c7a552cfdc525caa61eb31e649.pdf",
  revised: "2026-06-12",
  readOn: "2026-08-28",
  // Read off `/v1/portaldata/api/account` rather than inferred from where the holder lives.
  entityCheckedOn: "2026-08-28",
  // The platform's own pre-trade estimator, which answers the same question this file answers.
  calculator: "accounts/commissionreturn/{compte}?side&symbol&shares&price",
};

// The two checks behind this file. The calculator settles the fee arithmetic across sizes the
// account could never afford to trade; the round trip settles that money actually leaves at the
// rate claimed. Both were run on 28 August 2026 from `tradezero-experiment.mjs`, and the sizes
// were forced small by a 500-dollar buying power rather than chosen.
const VALIDATION = {
  quotes: 22,
  // Of those, the twenty on regulated listings agree on both the commission and the fees. The two
  // over-the-counter ones agree on the fees and not on the commission, which is the cap argument
  // recorded in `confidence`.
  quotesAgreeing: 20,
  roundTrip: {
    on: "2026-08-28",
    symbol: "IAU",
    shares: 4,
    boughtAt: 83.8499,
    soldAt: 83.8401,
    commission: 0.98,
    feesPending: 0.1,
    // Paid on the round trip, per share: essentially the whole penny touch, on a book that Rule
    // 605 says trades at a sixth of that for a hundred-share order.
    marketPerSharePaid: 0.0098,
  },
};

// Commission. The three rows of the stock table that an exchange-listed ETF above a dollar can
// fall into, and the boundary between them is exactly a hundred shares: below it the flat fee
// applies, at or above it the per-share rate does. The platform's calculator confirms the boundary
// to the cent, quoting 0.49 at ninety-nine shares and 0.50 at a hundred.
//
// The 49 cents is not only the small-order row: the schedule prints it a second time as a minimum
// on the per-share row, and it is applied there too, below. On a complete fill it cannot bind — a
// hundred shares at half a cent is fifty cents, and the per-share row starts at a hundred shares —
// so the two rules coincide and nothing in the coefficients shows the minimum. On a *partial* fill
// it binds, and hard: forty shares printed against a five-hundred-share order is 20 cents of
// per-share commission against a 49-cent minimum. That case is not modelled, because every
// function here prices one execution; see `confidence`.
const PER_SHARE_COMMISSION = 0.005;
const FLAT_UNDER = 0.49;
const FREE_FROM_SHARES = 100;

// The cap belongs to two rows only: over-the-counter lines, and shares priced under a dollar.
// A market order on a listed ETF has no ceiling at all, which is the trap in the per-share rate:
// ten thousand shares is fifty dollars a leg and nothing stops it.
const CAPPED_TRADE = 7.95;
const CAPPED_TO_SHARES = 250000;

// ---- regulatory pass-throughs, all four of them per the schedule's own page

// Section 31, on the sell alone. The rate has a history that matters for reading any broker
// document dated in the last year: 27.80 per million until 13 May 2025, then zero, because the
// Commission had already collected its 2025 appropriation, and back at 20.60 per million on
// 4 April 2026 once the 2026 appropriation was enacted. TradeZero's own schedules straddle the
// change — the European one, dated 1 February 2026, still says the fee is removed — and this
// figure is the one the June document carries, which agrees with the Commission's order.
const SEC_RATE = 0.0000206;

// FINRA's Trading Activity Fee, on the sell alone. The schedule prints 0.000166, which is FINRA's
// *old* rate — it went to 0.000195 a share on 1 January 2026, cap from 8.30 to 9.79, under the
// multi-year adjustment FINRA filed in 2024, and three separate TradeZero documents still show the
// old number six months later. The rate used here is 0.000195 because the platform's own
// calculator charges it: a thousand-share sell is quoted 0.20 of activity fee, and 0.000166 would
// round to 0.17. So the broker passes through the regulator's current rate and only its PDF is
// stale. `--taf` overrides.
const TAF_PER_SHARE = 0.000195;
const TAF_PER_SHARE_SCHEDULE = 0.000166;

// The clearing house's fee, and the one line here with a real minimum: three cents a trade, six
// on a round trip, whatever the size. Nothing in the schedule limits it to the sell, and clearing
// happens on both sides of a trade, so it is counted on both legs — an inference, flagged as one.
const NSCC_PER_SHARE = 0.00015;
const NSCC_MIN = 0.03;

// A fee no other broker in this repository itemises, on every equity order, either side. Its
// shape is the audit-trail levy's — per share, both legs — and its rate is seventeen times what
// Alpaca charges for that: 0.00005 against 0.000003. The schedule spells out the rounding with an
// example, a hundred shares costing a cent, so the penny is a floor per order and not per day.
const REPORTING_PER_SHARE = 0.00005;
const REPORTING_ROUNDING = 0.01;

const up = (value, step) => Math.ceil(value / step - 1e-9) * step;

// Per-share fees on a round trip: the activity fee on the sell, the clearing and reporting fees
// on both legs. Deliberately excluding commission, which is the regime's business.
const feePerShare = (taf) => taf + 2 * NSCC_PER_SHARE + 2 * REPORTING_PER_SHARE;

// What a round trip cannot go below, commission aside: the clearing minimum and the reporting
// penny on each leg, plus the activity fee's own penny on the sell. Measured, not deduced — the
// platform's calculator quotes 0.04 of fees on a one-share buy and 0.05 on a one-share sell, which
// is this sum. Section 31 adds nothing at the floor because it is not rounded up.
const FEE_FLOOR = 2 * NSCC_MIN + 2 * REPORTING_ROUNDING + 0.01;

// ------------------------------------------------------------------------- the listing

const catalogue = (() => {
  try {
    return JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
  } catch {
    return null;
  }
})();
const rows = catalogue == null ? [] : Array.isArray(catalogue) ? catalogue : catalogue.rows || [];
const spreads = JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// The same search as the sibling files. TradeZero's symbology reports NYSE Arca as PACF and Cboe
// BZX as BATS, and its scraper files them as AMEX and CBOE, both of which `venues.mjs` resolves.
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
    .filter((m) => !wantCurrency || String(m.row.currency || "USD").toUpperCase() === wantCurrency);

  return { named, matches };
}

// Over-the-counter lines are a different row of the table: no free tier, a cap, and the schedule
// restricts them to the regular session. The catalogue labels them OTC, which is also what
// `venues.mjs` declines to resolve, so the row's own word is what decides.
const isOverTheCounter = (row) => /^(OTC|PINK)/i.test(String(row?.exchange || ""));

// ------------------------------------------------------------------------- the regimes

// Named in French because the name reaches the front end, and defined by the two things a person
// actually chooses: how many shares, and whether the order is willing to wait.
export const REGIMES = ["repos", "immédiat", "petit"];

// Which one applies, given a size and an intent. `order` is the intent: "repos" for a limit order
// placed away from the market, anything else for one that takes the touch now. The free tier has
// two conditions besides resting and size — a listed venue and a price above a dollar — so an
// over-the-counter line or a penny-priced one stays in a paying regime however patient the order.
export function regimeOf({ shares = null, order = "immédiat", otc = false, price = null } = {}) {
  if (shares != null && shares < FREE_FROM_SHARES) {
    return {
      regime: "petit",
      why: `moins de ${FREE_FROM_SHARES} parts : ${FLAT_UNDER} de forfait par jambe`,
    };
  }
  if (order === "repos") {
    return {
      regime: "repos",
      why: freeTierApplies({ otc, price })
        ? `limite non exécutable de ${FREE_FROM_SHARES} parts ou plus : aucune commission`
        : otc
          ? "limite non exécutable, mais ligne de gré à gré : aucun palier gratuit, la commission par part reste due"
          : "limite non exécutable, mais titre sous 1 $ : aucun palier gratuit",
    };
  }
  return { regime: "immédiat", why: "ordre exécutable : 0,005 par part et par jambe" };
}

// The free tier names a listed venue and a dollar floor. A missing price is read as above a
// dollar, which is true of every ETF in the catalogue bar a handful.
const freeTierApplies = ({ otc, price }) => !otc && !(price != null && price < 1);

// The commission side of one regime, as the two coefficients it can occupy. Per-share charges go
// to `b`, per-order charges to `c`, which is what the affine form is for. Resting only escapes
// the per-share rate where the free tier reaches.
const commissionOf = (regime, { otc = false, price = null } = {}) => {
  if (regime === "petit") return { b: 0, c: 2 * FLAT_UNDER };
  if (regime === "repos" && freeTierApplies({ otc, price })) return { b: 0, c: 0 };
  return { b: 2 * PER_SHARE_COMMISSION, c: 0 };
};

// ---------------------------------------------------------------------------- the cost

export function roundTripCost({
  etf,
  place,
  currency,
  shares = null,
  order = "immédiat",
  bp = null,
  perShare = null,
  taf = TAF_PER_SHARE,
}) {
  const answer = { a: null, b: null, c: null, etf, place, currency };

  if (catalogue == null) {
    return {
      ...answer,
      why:
        "le catalogue TradeZero n'existe pas encore : lancer `node tradezero/tradezero.mjs` " +
        "avec la plateforme ouverte pour le construire",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue TradeZero` };
  if (!matches.length)
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez TradeZero`,
      alternatives: named
        .map((r) => `${r.ticker || r.isin} ${r.currency || "USD"} @ ${r.exchange || "place non dite"}`)
        .slice(0, 12),
    };

  const m = matches[0];
  const otc = isOverTheCounter(m.row);
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    mic: m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "USD").toUpperCase(),
    otc,
  };

  const leaf = (listing.mic && spreads[listing.isin]?.[listing.mic]?.[listing.currency]) || null;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;

  const chosen = regimeOf({ shares, order, otc });
  const fees = feePerShare(taf);
  const free = freeTierApplies({ otc, price: null });

  // A resting order does not cross the spread, so the effective spread is not its cost. What
  // replaces it is not a smaller number, it is a different kind of thing — the order may not
  // fill, and it fills first when the price is about to move against it. That cannot go in `a`
  // or `b`, so it goes in prose and the market term is dropped.
  const build = (regime) => {
    const { b, c } = commissionOf(regime, { otc });
    const takes = regime !== "repos";
    return {
      regime,
      a: Number((SEC_RATE + (takes ? (marketBp ?? 0) / 1e4 : 0)).toPrecision(4)),
      b: Number((fees + b + (takes ? (marketPerShare ?? 0) : 0)).toPrecision(6)),
      c: Number(c.toFixed(2)),
      shares: regime === "petit" ? `< ${FREE_FROM_SHARES}` : `≥ ${FREE_FROM_SHARES}`,
      market: takes ? "spread effectif payé" : "aucun spread payé, mais risque d'exécution",
      // An over-the-counter line keeps the per-share commission even at rest, so the regime that
      // is free elsewhere is only half a saving here.
      commissionWaived: !takes && free,
    };
  };

  const here = build(chosen.regime);
  const crosses = chosen.regime !== "repos";

  return {
    ...answer,
    a: here.a,
    b: here.b,
    c: here.c,
    // Which of the three the coefficients belong to, and why. A front end that ignores this and
    // shows the triple alone will be wrong by a dollar on a ten-share order.
    regime: chosen.regime,
    regimeWhy: chosen.why,
    regimes: REGIMES.map(build),
    // Commission aside, no round trip goes below this: the clearing minimum and the reporting
    // penny, each on both legs. Per round trip, unlike Alpaca's, which is per day.
    floor: {
      amount: Number((FEE_FLOOR + here.c).toFixed(2)),
      per: "aller-retour",
      parts:
        `NSCC ${NSCC_MIN} et déclaration ${REPORTING_ROUNDING} par jambe, TAF ${REPORTING_ROUNDING} à la vente` +
        (here.c ? `, plus ${FLAT_UNDER} de forfait par jambe` : ""),
    },
    // Only the over-the-counter and sub-dollar rows have one. On a listed ETF the per-share
    // commission runs without a ceiling, which is the opposite of what the other two brokers do.
    cap: otc
      ? { term: "commission", amount: CAPPED_TRADE, per: "transaction", toShares: CAPPED_TO_SHARES }
      : null,
    listing,
    bp: crosses ? marketBp : null,
    perShare: crosses ? marketPerShare : null,
    url: leaf?.url ?? null,
    basis:
      bp || perShare
        ? "imposé"
        : marketBp != null || marketPerShare != null
          ? "publié"
          : "frais seuls",
    fees: {
      secOfAmount: SEC_RATE,
      tafPerShare: taf,
      tafPerShareSchedule: TAF_PER_SHARE_SCHEDULE,
      nsccPerShareEachWay: NSCC_PER_SHARE,
      nsccMinPerTrade: NSCC_MIN,
      reportingPerShareEachWay: REPORTING_PER_SHARE,
      commissionPerShareEachWay: chosen.regime === "immédiat" ? PER_SHARE_COMMISSION : 0,
      commissionFlatEachWay: chosen.regime === "petit" ? FLAT_UNDER : 0,
      schedule: SCHEDULE,
    },
    // What was measured, next to what this file would have predicted for it, so the residual is
    // visible rather than asserted. The gap is entirely in the market term.
    validation: {
      ...VALIDATION.roundTrip,
      paidVisible: Number((VALIDATION.roundTrip.commission + 4 * VALIDATION.roundTrip.marketPerSharePaid).toFixed(4)),
      predicted: exactCost({
        shares: VALIDATION.roundTrip.shares,
        price: VALIDATION.roundTrip.boughtAt,
        order: "immédiat",
        perShare: 0.0017,
      }),
      predictedAtTouch: exactCost({
        shares: VALIDATION.roundTrip.shares,
        price: VALIDATION.roundTrip.boughtAt,
        order: "immédiat",
        perShare: VALIDATION.roundTrip.marketPerSharePaid,
      }),
      reading:
        "commission exacte au centime, frais confirmés par le calculateur du courtier mais pas encore " +
        "débités, terme de marché six fois trop bas sur un lot de 4 parts : en remplaçant le spread publié " +
        "par la touche, le total prédit tombe à moins d'un centime du montant payé",
    },
    confidence: confidenceOf({
      market: marketBp ?? marketPerShare,
      match: m,
      touchWide: (marketPerShare ?? 0) > 0.01,
      regime: chosen.regime,
      taf,
      otc,
      mic: listing.mic,
    }),
    // TradeZero International quotes and holds dollars and states no conversion markup of its
    // own; its European arm does, 0.60 % down to 0.20 % by size. What a euro holder pays to get
    // dollars in is their transfer provider's business, plus 15 dollars in and 15 out unless the
    // deposit comes through Equals Money.
    fxIfConverted: null,
    measured: null,
  };
}

// What the broker actually charges, minimums and caps applied, for one size and one price. The
// affine coefficients cannot express the minimums, so this is the function to bill from.
export function exactCost({
  shares,
  price,
  order = "immédiat",
  otc = false,
  bp = null,
  perShare = null,
  taf = TAF_PER_SHARE,
}) {
  const proceeds = shares * price;
  const { regime } = regimeOf({ shares, order, otc, price });

  const perLeg = (() => {
    if (regime === "petit") return FLAT_UNDER;
    if (regime === "repos" && freeTierApplies({ otc, price })) return 0;
    const raw = shares * PER_SHARE_COMMISSION;
    // The ceiling belongs to the over-the-counter and sub-dollar rows alone; a listed ETF taken
    // at the market has none, so ten thousand shares really is fifty dollars a leg.
    return otc || price < 1
      ? Math.min(Math.max(raw, FLAT_UNDER), CAPPED_TRADE)
      : Math.max(raw, FLAT_UNDER);
  })();
  const commission = 2 * perLeg;

  // Rounding fitted to twenty-two quotes from the platform's own calculator, which is the only
  // place this can be read off: Section 31 is passed through unrounded, and the other three lines
  // are each rounded up to the cent on their own. The five-hundred-share sell is what separates
  // the clearing fee's rounding from the total's — 1.0939 rounds to 1.09 and the calculator says
  // 1.10, which only works if the 0.075 of clearing became 0.08 first.
  const sec = proceeds * SEC_RATE;
  const activity = up(shares * taf, 0.01);
  const nscc = 2 * up(Math.max(shares * NSCC_PER_SHARE, NSCC_MIN), 0.01);
  const reporting = 2 * up(shares * REPORTING_PER_SHARE, REPORTING_ROUNDING);
  const market = regime === "repos" ? 0 : ((bp ?? 0) / 1e4) * proceeds + (perShare ?? 0) * shares;

  return {
    regime,
    commission: Number(commission.toFixed(4)),
    sec: Number(sec.toFixed(6)),
    taf: Number(activity.toFixed(6)),
    nscc: Number(nscc.toFixed(4)),
    reporting: Number(reporting.toFixed(4)),
    market: Number(market.toFixed(4)),
    total: Number((commission + sec + activity + nscc + reporting + market).toFixed(4)),
  };
}

// What supports this answer and what still does not, named separately rather than averaged into a
// hedge. Two independent checks now exist and they cover different halves of the formula.
function confidenceOf({ market, match, touchWide, regime, taf, otc, mic }) {
  const parts = [
    `frais et commissions lus au barème ${SCHEDULE.name} du ${SCHEDULE.revised}, entité ${SCHEDULE.entity} ` +
      `confirmée sur le compte le ${SCHEDULE.entityCheckedOn}, puis recoupés de deux façons : ${VALIDATION.quotes} ` +
      `devis du calculateur de la plateforme et un aller-retour réel de ${VALIDATION.roundTrip.shares} parts ` +
      `d'${VALIDATION.roundTrip.symbol} le ${VALIDATION.roundTrip.on}`,
    // The calculator is the broker's own arithmetic on its own schedule, so it settles the shape of
    // the fee lines without settling whether the ledger agrees with them.
    `le calculateur ${SCHEDULE.calculator} donne les mêmes montants que ce modèle au centime sur ` +
      `${VALIDATION.quotesAgreeing} des ${VALIDATION.quotes} devis relevés, de 1 à 5000 parts, aux deux sens ` +
      `— c'est l'arithmétique du courtier sur son propre barème, pas une facture. Les ${VALIDATION.quotes - VALIDATION.quotesAgreeing} ` +
      `devis restants sont de gré à gré et ne divergent que sur le plafond de commission`,
    `la commission est vérifiée sur relevé de position : ${VALIDATION.roundTrip.commission} prélevés pour ` +
      `${VALIDATION.roundTrip.shares} parts, soit ${FLAT_UNDER} par jambe, le régime petit confirmé. Les ` +
      `${VALIDATION.roundTrip.feesPending} de frais réglementaires n'étaient pas encore débités : le solde de ` +
      `séance restait inchangé et la dernière date de séance close était la veille, donc cette part reste ` +
      `prédite et non facturée`,
  ];

  if (taf === TAF_PER_SHARE) {
    parts.push(
      `le taux d'activité retenu est celui de FINRA, ${TAF_PER_SHARE} par part, et non le ${TAF_PER_SHARE_SCHEDULE} ` +
        `imprimé au barème : le calculateur facture 0,20 sur une vente de 1000 parts, ce que seul ${TAF_PER_SHARE} ` +
        `produit. C'est le document du courtier qui est périmé, pas le prélèvement`
    );
  }

  parts.push(
    `le NSCC sur les deux jambes est confirmé : le calculateur facture ${NSCC_MIN} de frais sur un achat, ` +
      `où ni le TAF ni la taxe SEC ne s'appliquent — ce n'est plus une déduction`
  );

  if (regime !== "petit") {
    parts.push(
      `UNE JAMBE, UNE EXÉCUTION : les ${FLAT_UNDER} sont aussi un minimum sur la ligne au prorata, et ce ` +
        `minimum ne mord pas sur une exécution complète (${FREE_FROM_SHARES} parts font ${(
          FREE_FROM_SHARES * PER_SHARE_COMMISSION
        ).toFixed(2)}) mais mord sur une exécution partielle. Si le minimum se compte par exécution et non ` +
        `par ordre, un ordre de 500 parts rempli en cinq fois 20 pourrait coûter cinq fois ${FLAT_UNDER} ` +
        `au lieu de 2,50 — non vérifié, et non modélisé ici`
    );
  }

  if (regime === "repos") {
    parts.push(
      "régime au repos : aucun spread n'est payé, mais l'ordre peut ne pas s'exécuter, et il " +
        "s'exécute d'abord quand le prix s'apprête à bouger contre lui. Ce coût-là n'est pas un " +
        "montant par part et n'apparaît dans aucun coefficient"
    );
    // Anyone comparing this file to the order ticket will see a contradiction, so it is stated
    // before they find it.
    parts.push(
      `le palier gratuit n'est pas vérifié et ne peut pas l'être avant exécution : le calculateur de la ` +
        `plateforme annonce ${PER_SHARE_COMMISSION} par part même sur un ordre limité posé à la moitié du ` +
        `marché, donc franchement non exécutable. Il ne modélise pas la gratuité, qui se juge à l'exécution ` +
        `— l'écran de saisie ne la montrera jamais`
    );
  }

  // Load-bearing enough to state on every Arca and Cboe line, which is nearly every ETF: the
  // schedule's clauses name three exchanges, and this one is not among them by name.
  if (mic === "ARCX" || mic === "BATS") {
    parts.push(
      `place lue sous le parapluie : le barème nomme NYSE, AMEX et NASDAQ, et cette ligne cote sur ` +
        `${mic === "ARCX" ? "NYSE Arca" : "Cboe BZX"} — la lecture retenue est que les trois noms ` +
        `désignent les places réglementées par opposition au gré à gré, ce que soutient la ligne ` +
        `payante, qui dit « all stocks, ETFs and warrants », alors que presque aucun ETF ne cote sur ` +
        `les trois places nommées`
    );
  }

  if (otc) {
    parts.push(
      `ligne de gré à gré : aucun palier gratuit, commission plafonnée à ${CAPPED_TRADE} par ` +
        `transaction, et séance régulière seulement`
    );
    // The one place the calculator and the schedule disagree. The schedule is followed here
    // because a ceiling written in the price list is the harder thing to walk back.
    parts.push(
      `le plafond de ${CAPPED_TRADE} n'est PAS appliqué par le calculateur de la plateforme, qui devise ` +
        `10 dollars sur 2000 parts de gré à gré là où le barème plafonne la ligne. Le barème est suivi ici, ` +
        `mais sur une ligne de gré à gré au-delà de ${CAPPED_TO_SHARES} parts, prévoir que la facture puisse ` +
        `suivre le calculateur`
    );
  }

  if (market == null) {
    parts.push(
      `AUCUN carnet : ${match.unsourced?.name || "cette place"}, ${match.unsourced?.why || "pas de source"}. ` +
        "À lire comme un plancher"
    );
  } else if (regime !== "repos") {
    parts.push(
      "spread effectif publié : moyenne mensuelle sur les ordres immédiats de 100 à 499 parts, cinq " +
        "teneurs, Citadel et Virtu manquants"
    );
    parts.push(
      // Now measured on this broker and not only inferred from the others, which makes it the
      // largest error in the formula rather than a caveat.
      `ATTENTION sous 100 parts, le terme de marché est sous-estimé, ici comme ailleurs : ` +
        `l'aller-retour de ${VALIDATION.roundTrip.shares} parts d'${VALIDATION.roundTrip.symbol} a payé ` +
        `${(VALIDATION.roundTrip.marketPerSharePaid * 100).toFixed(1)} c/part, soit la touche entière du ` +
        `carnet, contre 0,17 c publiés au titre des ordres de 100 à 499 parts — six fois moins. ` +
        `L'amélioration de prix que contient le chiffre publié ne s'obtient pas sur un lot rompu`
    );
    if (touchWide) {
      parts.push(
        "carnet large de surcroît : mesuré chez tastytrade, six allers-retours de 10 parts ont payé " +
          "13 c/part sur AQLT contre 3,3 c publiés — sur un tel carnet l'écart est en cents, pas en " +
          "fractions de cent"
      );
    }
  }

  return parts.join(". ");
}

// ------------------------------------------------------------------------------- entrée

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = argv.filter((a) => !a.startsWith("--"));

  if (argv.includes("--schedule")) {
    console.log(`barème ${SCHEDULE.name} (${SCHEDULE.entity}), révisé le ${SCHEDULE.revised}, lu le ${SCHEDULE.readOn}`);
    console.log(`  ${SCHEDULE.source}\n`);
    console.log("  commission, selon le régime de l'ordre :");
    console.log(`    repos      limite non exécutable, ${FREE_FROM_SHARES} parts ou plus, NYSE/AMEX/NASDAQ, > 1 $   0`);
    console.log(`    immédiat   au marché ou limite exécutable, ${FREE_FROM_SHARES} parts ou plus                    ${PER_SHARE_COMMISSION} par part`);
    console.log(`    petit      moins de ${FREE_FROM_SHARES} parts, quel que soit le type                            ${FLAT_UNDER} forfaitaire`);
    console.log(`    plafond ${CAPPED_TRADE} par transaction jusqu'à ${CAPPED_TO_SHARES} parts, de gré à gré et sous 1 $ seulement`);
    console.log("\n  frais réglementaires, répercutés :");
    console.log(`    SEC            ${SEC_RATE} du montant, à la vente seule, depuis le 4 avril 2026`);
    console.log(
      `    FINRA TAF      ${TAF_PER_SHARE} par part, à la vente seule, arrondi au centime supérieur` +
        `   (le barème imprime ${TAF_PER_SHARE_SCHEDULE}, périmé : le calculateur prélève ${TAF_PER_SHARE})`
    );
    console.log(`    NSCC           ${NSCC_PER_SHARE} par part, minimum ${NSCC_MIN} par transaction, les deux jambes`);
    console.log(`    déclaration    ${REPORTING_PER_SHARE} par part, arrondi au centime supérieur par ordre, les deux jambes`);
    console.log(`\n  donc plancher ${FEE_FLOOR.toFixed(2)} $ par aller-retour hors commission, ${(FEE_FLOOR + 2 * FLAT_UNDER).toFixed(2)} $ sous ${FREE_FROM_SHARES} parts`);
    console.log("  hors sujet ici : ZeroPro 59 $/mois (TZ1 et ZeroFree gratuits), marge 9 %, transfert 15 $ entrant et sortant");
    process.exit(0);
  }

  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node tradezero/tradezero_cost.mjs <ETF|ISIN> [place] [devise] [--shares=n] [--price=p] [--order=repos|immédiat] [--json] [--schedule]"
    );
    process.exit(1);
  }

  const shares = arg("shares") != null ? Number(arg("shares")) : null;
  const price = arg("price") != null ? Number(arg("price")) : null;
  const order = arg("order") || "immédiat";
  const taf = arg("taf") != null ? Number(arg("taf")) : TAF_PER_SHARE;

  const answer = roundTripCost({
    etf,
    place,
    currency,
    shares,
    order,
    bp: arg("bp") != null ? Number(arg("bp")) : null,
    perShare: arg("perShare") != null ? Number(arg("perShare")) : null,
    taf,
  });

  if (argv.includes("--json")) {
    console.log(JSON.stringify(answer, null, 2));
    process.exit(answer.a == null ? 1 : 0);
  }

  if (answer.a == null) {
    console.error(answer.why);
    if (answer.alternatives?.length) console.error(`  ailleurs : ${answer.alternatives.join(", ")}`);
    process.exit(1);
  }

  const l = answer.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || "sans nom"}`);
  console.log(`${l.exchange} (${l.mic || "place non résolue"}), ${l.currency}\n`);

  console.log(`régime ${answer.regime} : ${answer.regimeWhy}\n`);
  console.log(`a = ${answer.a}   (au prorata du montant : frais SEC ${SEC_RATE}${answer.bp != null ? ` + ${answer.bp} bp de carnet` : ""})`);
  console.log(
    `b = ${answer.b}   (par part : TAF ${answer.fees.tafPerShare} à la vente + NSCC ${NSCC_PER_SHARE} et déclaration ${REPORTING_PER_SHARE} aux deux jambes` +
      (answer.fees.commissionPerShareEachWay ? ` + commission ${PER_SHARE_COMMISSION} aux deux jambes` : "") +
      (answer.perShare != null ? ` + ${answer.perShare} de spread effectif` : "") +
      ")"
  );
  console.log(`c = ${answer.c}   (par ordre : ${answer.fees.commissionFlatEachWay ? `${FLAT_UNDER} de forfait aux deux jambes` : "aucune commission forfaitaire"})`);
  console.log(`\ncoût = ${answer.a} × p × n + ${answer.b} × n + ${answer.c}   (${answer.basis})`);
  console.log(`  plancher ${answer.floor.amount} ${l.currency} par ${answer.floor.per} : ${answer.floor.parts}`);
  if (answer.cap)
    console.log(
      `  plafond ${answer.cap.amount} ${l.currency} par ${answer.cap.per}, jusqu'à ${answer.cap.toShares} parts`
    );

  console.log("\nles trois régimes, pour la même ligne :");
  for (const r of answer.regimes) {
    console.log(
      `  ${r.regime.padEnd(9)} ${String(r.shares).padStart(7)} parts   a=${r.a}  b=${r.b}  c=${r.c}   ${r.market}` +
        (r.regime === "repos" && !r.commissionWaived ? ", commission due quand même" : "")
    );
  }

  console.log(`\n  ${answer.confidence}`);
  if (answer.url) console.log(`\n${answer.url}`);

  if (shares && price) {
    const exact = exactCost({ shares, price, order, otc: l.otc, bp: answer.bp, perShare: answer.perShare, taf });
    const affine = answer.a * price * shares + answer.b * shares + answer.c;
    console.log(`\n${shares} parts à ${price} ${l.currency}, régime ${exact.regime} :`);
    console.log(`  formule affine   ${affine.toFixed(4)} ${l.currency}`);
    console.log(`  facturé exact    ${exact.total.toFixed(4)} ${l.currency}`);
    console.log(
      `  dont commission ${exact.commission}, marché ${exact.market}, NSCC ${exact.nscc}, ` +
        `déclaration ${exact.reporting}, SEC ${exact.sec}, TAF ${exact.taf}`
    );
    if (price >= 1 && !l.otc && shares >= FREE_FROM_SHARES && exact.regime !== "repos") {
      const resting = exactCost({ shares, price, order: "repos", otc: l.otc, bp: answer.bp, perShare: answer.perShare, taf });
      console.log(`  la même taille au repos : ${resting.total.toFixed(4)} ${l.currency}, soit ${(exact.total - resting.total).toFixed(4)} de moins`);
    }
  }
}
