// For one ETF, one venue and one currency, the three coefficients of
//
//     coût d'un aller-retour = a × p × n + b × n + c
//
// on Alpaca, with n the number of shares and p the share price, the account funded in the
// currency the fund quotes in — which on this broker is always dollars, since it offers
// American listings alone.
//
// The shape is the same as the tastytrade file's and the terms are not, in three ways worth
// knowing before comparing the two.
//
// The first is what is absent. tastytrade's largest fee at every size tested was its own
// clearing charge, 0.0008 a share on each leg. Alpaca clears for itself and passes nothing on
// for it, which leaves only the regulators' lines: 0.000201 a share against 0.001795, nine
// times less. On a hundred shares of a penny-wide fund that is the whole difference in the
// bill, and it is the one figure here a competitor could undercut, because it is the only one
// that is not a regulator's.
//
// The second is a fee tastytrade does not itemise: FINRA's Consolidated Audit Trail levy, on
// buys as well as sells, 0.000003 a share. Tiny, and in `b` twice rather than once, which is
// what a two-legged charge does to a round-trip formula.
//
// The third is the rounding, and it is the one that changes the arithmetic rather than the
// amount. tastytrade rounds every fee on every leg — up to the cent for the SEC line, to the
// mill for the per-share ones — so a small order pays mostly rounding. Alpaca aggregates each
// fee type across the whole account for the day and rounds that once, up to the cent. The
// floor is therefore a property of the day and not of the order: a lone round trip cannot cost
// less than three cents, three fee types each rounded up, while the tenth round trip of the
// same day may add none. Which means the affine form here is not an approximation that a small
// order breaks — it is exact on the amounts, and only the day's three ceilings sit outside it.
//
//   node alpaca/alpaca_cost.mjs IAU
//   node alpaca/alpaca_cost.mjs ACWI NASDAQ USD --shares=100 --price=161.48
//   node alpaca/alpaca_cost.mjs AQLT --json
//   node alpaca/alpaca_cost.mjs --schedule       -- le barème, avec sa date et sa source

import fs from "node:fs";
import { listingKey, resolveVenue } from "../venues.mjs";

// Anchored to the repository rather than to whatever directory the shell happens to be in, so
// this works both as `node alpaca/alpaca_cost.mjs` and from inside the folder.
const CATALOGUE = new URL("alpaca-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

// ------------------------------------------------------------------ the broker's terms
//
// Every rate below is read off Alpaca Clearing's brokerage fee schedule, revised 20 July 2026:
// files.alpaca.markets/disclosures/library/BrokFeeSched.pdf. Nothing here is inferred from a
// statement, because no live order has ever gone through this account — which is stated again in
// `confidence`, since it is the difference between this file and its tastytrade twin.
//
// The paper account was tried, and it cannot stand in. Three round trips of ten shares on
// 27 August 2026 moved the simulated cash by exactly what the fills said, to the cent, so not one
// of the three fee lines below was charged; its ledger does not even accept `REG` or `TAF` as
// activity types, which the live API does. See `alpaca-experiment.mjs` for what it does test.
const SCHEDULE = {
  source: "https://files.alpaca.markets/disclosures/library/BrokFeeSched.pdf",
  revised: "2026-07-20",
  readOn: "2026-08-27",
};

// The SEC's Section 31 fee, on the sell alone, proportional to the proceeds. Identical to the
// rate every American broker passes on, because it is not the broker's to set.
const SEC_RATE = 0.0000206;

// FINRA's Trading Activity Fee, on the sell alone, capped per trade. Alpaca states the cap in
// shares as well as in dollars, and the two agree: 9.79 / 0.000195 = 50 205.
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const TAF_CAP_SHARES = 50205;

// FINRA's Consolidated Audit Trail fee, on buys and sells both. One share is one equivalent
// share on an exchange-listed fund; the hundredth-of-a-share conversion in the schedule applies
// to over-the-counter lines, which no ETF here is.
const CAT_PER_SHARE = 0.000003;

// Zero for an account opened directly, as this one was. The schedule reads "Commissions 0%–3%
// per transaction" and names the two cases that leave zero behind: an account established
// through an authorised business partner, and the Elite Smart Router. Checked against the
// account itself on 2026-08-27, through the dashboard's own API — `/api/v1/billing/overview`
// returned an empty `plan`, `/api/v1/accounts/{id}/details` said `is_professional: false` — so
// neither case applies here. It stays a parameter because it is a fact about an account rather
// than about the broker, and someone else's answer is not zero.
//
// The same round of calls is what shows there is nothing to verify the fees against:
// `/activities?activity_types=FEE` and `/orders?status=all` both came back empty, and
// `/trade_account/margin` reported zero equity. It did confirm the pass-through exists, in the
// shape of a `pending_reg_taf_fees` field.
const COMMISSION_RATE = 0;

// `b` is the per-share side of a round trip: the audit-trail fee on both legs, the activity fee
// on the sell alone.
const PER_SHARE = TAF_PER_SHARE + 2 * CAT_PER_SHARE;

// Alpaca rounds up, once a day, per fee type, per account — not per leg and not per order. The
// helper is here for `exactCost`; the point of the comment is that it is applied to a daily
// total, so calling it on one order's share of that total is the isolated case and an upper
// bound on the shared one.
const up = (value, step) => Math.ceil(value / step - 1e-9) * step;

// Three fee types touch an equity round trip, and each carries its own ceiling: the SEC line
// and the activity fee on the sell, the audit-trail fee on both legs. A day holding nothing but
// one round trip therefore pays three cents at least, whatever the size.
const FEE_TYPES = 3;
const DAILY_FLOOR = FEE_TYPES * 0.01;

// ------------------------------------------------------------------------- the listing

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
const rows = Array.isArray(catalogue) ? catalogue : catalogue.rows || [];
const spreads = JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// The same search as the two sibling files. Alpaca names NYSE Arca "ARCA" and Cboe BZX "BATS",
// and its scraper files them as AMEX and CBOE, both of which `venues.mjs` already resolves —
// so the venue branch does the work and the loose comparison is only a fallback.
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

// ---------------------------------------------------------------------------- the cost

export function roundTripCost({
  etf,
  place,
  currency,
  bp = null,
  perShare = null,
  commission = COMMISSION_RATE,
}) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    b: Number(PER_SHARE.toPrecision(6)),
    c: 0,
    // Not a term of the formula but a minimum on the day that contains it: each fee type is
    // totalled per account per day and then rounded up to the cent. Named `per` so a front end
    // cannot mistake it for a per-order charge and add it to every line.
    floor: { amount: Number(DAILY_FLOOR.toFixed(2)), per: "jour et par compte", types: FEE_TYPES },
    // Where `b` stops growing. Per trade, which is the schedule's own word — unlike the
    // tastytrade cap, which is assessed per execution and so multiplies with the slicing.
    cap: {
      term: "b",
      part: "FINRA TAF",
      amount: TAF_CAP,
      fromShares: TAF_CAP_SHARES,
      per: "transaction",
    },
    etf,
    place,
    currency,
  };

  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Alpaca` };
  if (!matches.length)
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Alpaca`,
      alternatives: named
        .map((r) => `${r.ticker || r.isin} ${r.currency || "USD"} @ ${r.exchange || "place non dite"}`)
        .slice(0, 12),
    };

  const m = matches[0];
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    mic: m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "USD").toUpperCase(),
  };

  // A spread is a fact about one book, so the file is only read at this listing's own venue.
  const leaf = (listing.mic && spreads[listing.isin]?.[listing.mic]?.[listing.currency]) || null;
  // Two units can arrive and each folds into the coefficient that shares its shape: a
  // percentage of the amount into `a`, a charge per share into `b`. American books are quoted
  // in cents, so the per-share branch is the one this broker normally takes.
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;

  return {
    ...answer,
    // a = the SEC's rate, plus any commission agreed with a partner, plus a percentage-quoted
    // book if one was given. The commission is proportional to the amount, which is why it
    // belongs here and not in `c`.
    a: Number((SEC_RATE + 2 * commission + (marketBp ?? 0) / 1e4).toPrecision(4)),
    // b = the per-share fees, plus the book when it is quoted per share.
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
    // Which rule each part of the answer comes from, so a rate that changes can be traced to
    // its term rather than hunted through a total.
    fees: {
      secOfAmount: SEC_RATE,
      tafPerShare: TAF_PER_SHARE,
      catPerShareEachWay: CAT_PER_SHARE,
      commissionOfAmountEachWay: commission,
      clearingPerShare: 0,
      schedule: SCHEDULE,
    },
    // One cent a share is the most a book quoted at the minimum increment can cost over a round
    // trip: half a tick on the way in, half on the way out. Above it, the book is wider than a
    // tick, the improvement inside the published figure is doing real work, and it is exactly
    // there that an odd lot stops receiving it. Price-free on purpose — the tick is a cent
    // whether the share costs thirty dollars or five hundred.
    confidence: confidenceOf(marketBp ?? marketPerShare, m, (marketPerShare ?? 0) > 0.01, commission),
    // Alpaca holds dollars and trades American listings, so it converts nothing and charges
    // nothing for conversion. What a euro-funded person pays their bank to get dollars in is
    // outside this formula, and outbound wires — 15 dollars domestic, 35 international — are a
    // cost of the account rather than of the trade.
    fxIfConverted: null,
    // Deliberately not the tastytrade file's `validation`, because there is nothing to
    // validate against: this account has placed no order. Saying so as a field rather than
    // only in prose, so a front end can grey the number rather than present it as measured.
    measured: null,
  };
}

// What the broker will actually charge, rounding included. Two answers rather than one, because
// Alpaca's rounding is a property of the day: `alone` is this round trip as the only one of its
// day, which is the worst case, and `marginal` is what it adds to a day that already had
// trading, which is the best. A real bill sits at one of the two ends, not between them.
export function exactCost({ shares, price, bp = null, perShare = null, commission = COMMISSION_RATE }) {
  const proceeds = shares * price;
  const sec = proceeds * SEC_RATE;
  const taf = Math.min(shares * TAF_PER_SHARE, TAF_CAP);
  const cat = 2 * shares * CAT_PER_SHARE;
  const fee = 2 * proceeds * commission;
  // The market's share is not a line on the statement but the price the fills came in at, so it
  // is never rounded.
  const market = ((bp ?? 0) / 1e4) * proceeds + (perShare ?? 0) * shares;
  const exact = sec + taf + cat + fee + market;
  return {
    sec: Number(sec.toFixed(6)),
    taf: Number(taf.toFixed(6)),
    cat: Number(cat.toFixed(6)),
    commission: Number(fee.toFixed(6)),
    market: Number(market.toFixed(4)),
    // Each fee type meets its own ceiling; the market term and the commission do not, the first
    // because it is not a fee and the second because it is charged on the transaction.
    alone: Number((up(sec, 0.01) + up(taf, 0.01) + up(cat, 0.01) + fee + market).toFixed(4)),
    marginal: Number(exact.toFixed(4)),
  };
}

// Two claims of very different strength live in this answer, and the wording keeps them apart.
// The fee side is a reading of a published schedule and nothing more: no live order has gone
// through this account, and the paper account charges nothing, so unlike the tastytrade file —
// which reproduces 23 real sell fills — nothing here has been checked against money that moved.
// The market side is the same Rule 605 estimate the tastytrade file uses, and it carries the same
// measured limit: below a round lot, on a book wider than a tick, the improvement those reports
// credit does not arrive.
const confidenceOf = (market, match, touchWide, commission) => {
  const base =
    `frais lus au barème d'Alpaca Clearing du ${SCHEDULE.revised}, AUCUNE vérification sur ` +
    `relevé : aucun ordre réel sur ce compte, et le compte papier ne prélève rien` +
    (commission ? `, commission de ${(commission * 100).toFixed(2)} % par jambe imposée` : "");
  if (market == null) {
    return (
      `${base}. Et AUCUN carnet : ${match.unsourced?.name || "cette place"}, ` +
      `${match.unsourced?.why || "pas de source"}. À lire comme un plancher`
    );
  }
  return (
    `${base}. Spread effectif publié : moyenne mensuelle sur les ordres immédiats de 100 à 499 ` +
    `parts, cinq teneurs, Citadel et Virtu manquants` +
    (touchWide
      ? `. ATTENTION carnet large : sous 100 parts, l'amélioration de prix que ce chiffre ` +
        `contient n'a pas lieu — mesuré chez tastytrade, six allers-retours de 10 parts ont payé ` +
        `13 c/part sur AQLT contre 3,3 c publiés, soit la touche entière. Pour un lot rompu, ` +
        `passer la touche cotée en \`perShare\``
      : "")
  );
};

// ------------------------------------------------------------------------------- entrée

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = argv.filter((a) => !a.startsWith("--"));

  if (argv.includes("--schedule")) {
    console.log(`barème Alpaca Clearing, révisé le ${SCHEDULE.revised}, lu le ${SCHEDULE.readOn}`);
    console.log(`  ${SCHEDULE.source}\n`);
    console.log(`  frais SEC        ${SEC_RATE} du montant, à la vente seule`);
    console.log(`  FINRA TAF        ${TAF_PER_SHARE} par part, à la vente seule, plafond ${TAF_CAP} $ à ${TAF_CAP_SHARES} parts`);
    console.log(`  FINRA CAT        ${CAT_PER_SHARE} par part, aux deux jambes`);
    console.log(`  compensation     0 (Alpaca compense pour son compte)`);
    console.log(`  commission       0 en direct, 0 à 3 % via partenaire ou Elite Smart Router`);
    console.log(`\n  arrondi : par type de frais, agrégé par jour et par compte, au centime supérieur`);
    console.log(`  donc plancher ${DAILY_FLOOR.toFixed(2)} $ pour une journée ne contenant qu'un aller-retour`);
    console.log(`  hors sujet ici : marge à 6,25 %, virement sortant 15 $ (35 $ international)`);
    process.exit(0);
  }

  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node alpaca/alpaca_cost.mjs <ETF|ISIN> [place] [devise] [--shares=n] [--price=p] [--json] [--schedule]");
    process.exit(1);
  }

  const commission = arg("commission") != null ? Number(arg("commission")) : COMMISSION_RATE;
  const answer = roundTripCost({
    etf,
    place,
    currency,
    bp: arg("bp") != null ? Number(arg("bp")) : null,
    perShare: arg("perShare") != null ? Number(arg("perShare")) : null,
    commission,
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
  console.log(`${l.exchange} (${l.mic}), ${l.currency}\n`);
  const marketA = answer.bp != null ? ` + ${answer.bp} bp de carnet` : "";
  const marketB = answer.perShare != null ? ` + ${answer.perShare} de spread effectif` : "";
  console.log(`a = ${answer.a}   (au prorata du montant : frais SEC ${SEC_RATE}${commission ? ` + commission ${commission} aux deux jambes` : ""}${marketA})`);
  console.log(`b = ${answer.b}   (par part : CAT ${CAT_PER_SHARE} aux deux jambes + TAF ${TAF_PER_SHARE} à la vente${marketB})`);
  console.log(`c = ${answer.c}   (par ordre : aucune commission, aucune compensation)`);
  console.log(`\ncoût = ${answer.a} × p × n + ${answer.b} × n + ${answer.c}   (${answer.basis})`);
  console.log(`  plancher ${answer.floor.amount} ${l.currency} par ${answer.floor.per} : ${answer.floor.types} types de frais, chacun arrondi au centime supérieur`);
  console.log(`  ${answer.confidence}`);
  if (answer.url) console.log(`\n${answer.url}`);

  const shares = arg("shares") != null ? Number(arg("shares")) : null;
  const price = arg("price") != null ? Number(arg("price")) : null;
  if (shares && price) {
    const exact = exactCost({ shares, price, bp: answer.bp, perShare: answer.perShare, commission });
    const affine = answer.a * price * shares + answer.b * shares + answer.c;
    console.log(`\n${shares} parts à ${price} ${l.currency} :`);
    console.log(`  formule affine            ${affine.toFixed(4)} ${l.currency}`);
    console.log(`  seul aller-retour du jour ${exact.alone.toFixed(4)} ${l.currency}   (les trois plafonds au centime)`);
    console.log(`  ajouté à une journée déjà chargée ${exact.marginal.toFixed(4)} ${l.currency}`);
    console.log(`  dont marché ${exact.market.toFixed(4)}, SEC ${exact.sec}, TAF ${exact.taf}, CAT ${exact.cat}`);
  }
}
