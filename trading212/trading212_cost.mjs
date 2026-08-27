// What one round trip costs at Trading212: buy n shares at price p, sell them back at
// once, in the form the front end asked for.
//
//   coût = a × p × n + b × n + c
//
// Three terms because fees come in three shapes, and a broker charges in whichever it
// likes: `a` for everything that follows the amount, `b` for what is charged by the share,
// `c` for what is charged by the order. Here only `a` is non-zero, and that is a fact about
// this broker rather than a simplification — see each constant below for how it was
// checked. The other two are carried so that a broker charging by the share or by the
// order fills the same shape rather than a new one.
//
// A fee charged on one leg only needs no fourth term: two affine legs sum to an affine
// round trip, so a sell-side charge just lands in the same coefficient at half the weight a
// two-sided one would have. That is how the American regulatory fees behave, and a stamp
// duty on the buy would behave the same way. What the folding costs is the ability to answer
// a different question — the price of a single leg, or of holding — which these three
// numbers cannot be unpacked into.
//
// Note for whoever reads the old contract: this used to return `a` and `b` with `b` as the
// flat part. The flat part is now `c`, and `b` is per share. Same numbers, both zero.
//
// The account is assumed to be funded in the line's own currency, so nothing is
// converted. That assumption is doing a lot of work and it is the one worth checking
// first: conversion costs 0.15% each way at this broker, so 0.003 of the amount, which
// is thirty basis points against the 1.84 bp a round trip on IUSQ actually costs. Taking a
// fund's dollar line instead of its euro line multiplies the bill by seventeen, and no
// precision on the spread survives that choice.
//
//   node trading212/trading212_cost.mjs IUSQ "Deutsche Börse Xetra" EUR
//   node trading212/trading212_cost.mjs IE00B6R52259 XETR EUR --shares=20 --price=106.90
//   node trading212/trading212_cost.mjs GC40 Xetra EUR --json
//
// Import instead of calling it if the front end is in node: `roundTripCost(...)` returns
// the same object the CLI prints, and reads two files rather than the network, so it
// needs no await.

import fs from "node:fs";
import { listingKey, resolveVenue } from "../venues.mjs";

// Anchored to the repository rather than to whatever directory the shell happens to be in, so
// this works both as `node trading212/trading212_cost.mjs` and from inside the folder.
const CATALOGUE = new URL("../parsed_json/trading212-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

// ------------------------------------------------------------------ the broker's terms

// `c`, charged by the order, is zero and measured as such. Trading212's own ex-ante cost
// disclosure returns COMMISSION, CUSTODY_FEE and PLATFORM_FEE at zero, on entry and on
// exit, for the seven instruments that answered and for every quantity asked of EUNL, from
// a hundredth of a share to twenty. No line of the account's own history carries a fee, a
// tax or a commission of any kind — thirty-seven entries, no such field. And a round trip
// on a single share of EUNL cost one cent, which no flat charge could survive.
const FLAT = 0;

// `b`, charged by the share, is zero here — by check, not by assumption. This broker does
// have a per-share charge, and publishes it: FINRA_FEE at 0.000195 per share, which is to
// the digit FINRA's own 2026 rate for the sale of a covered equity security, capped at 9.79
// per execution. Trading212 passes it through without a margin.
//
// What makes it inapplicable is where it is attached. The app carries it not against venue
// names but against seven working-schedule ids — 56, 71, 85, and 107 through 110 — and
// charges it on sells only. Not one of the 6 129 lines in this catalogue sits on one of
// those ids: every ETF sold to a European account here is quoted on Xetra, London, Milan,
// SIX or Euronext. So no line this file can answer about is able to carry it.
//
// On the US lines that do carry it, the whole bill reads off published rates and nothing
// else. Twenty disclosures on AAPL and TSLA, from a hundredth of a share to five hundred,
// are reproduced exactly by three figures: FINRA's 0.000195 per share and the SEC's Section
// 31 rate of 0.0000206 of the amount, both on the sell alone, plus 0.15% of conversion on
// each leg. `probe-t212-perfill.mjs` runs the comparison; it came out at zero discrepancies
// over twenty lines.
//
// Two things in that bill do not fit `a × p × n + b × n + c`, and they are worth carrying
// forward to brokers where they bite. The first is the cap: past about 50 200 shares the
// per-share term stops growing, and FINRA assesses that cap per execution rather than per
// order, so a sell broken into five fills gets five caps — which makes the cost depend on
// how the order was sliced, something no function of n and p can see. The second is
// rounding: every line is rounded to the cent, which is why the per-share fee reads as
// exactly zero below about thirty shares and why a single share of AAPL pays 0.01 where the
// affine form says 0.0057, seventy-five per cent more. The error is bounded by half a cent
// per fee line, so it disappears into nothing on any order worth placing.
const PER_SHARE = 0;

// Twenty-seven real round trips on six funds say what this costs, and the mechanism they
// reveal is simple: Trading212 quotes one price to buy and one to sell, holds both for
// minutes, and the round trip costs the gap between them times the number of shares. On
// GC40 at midday every buy filled at 147.56 and every sell at 147.48, whether the order
// was for one share or for ten, and the ten filled in three pieces all at the same price.
// So the cost is exactly linear in size, there is no fixed part, and every fill is `otc`.
//
// What the same trades also show is where the estimate below can be trusted, which is
// not everywhere:
//
//         XLM   estimate   measured   measured/estimate   turnover
//   EUNL  2.03    1.01       0.99           0.98            816 M€
//   SXR8  2.12    1.06       1.12           1.06            458 M€
//   IUSQ  3.68    1.84       1.87           1.02            308 M€
//   GC40  6.20    3.10       5.42           1.75           10.2 M€
//   IS3N  8.17    4.08       2.10           0.51            372 M€
//   XS5E  8.23    4.12       2.66           0.65            5.1 M€
//
// Below about 4 bp of XLM the estimate is right to within 6%, three funds out of three,
// SXR8 predicted before it was ever traded. Above 6 bp it is wrong by up to a factor of
// two, in either direction. That is the whole of the model: half the XLM, sound on a
// narrow book and indicative on a wide one.
//
// The wide-book error stays unexplained on purpose. Seven published variables were tried
// against it — designated sponsors, the maximum spread they are obliged to quote, the
// volume that obligation holds for, monthly turnover, assets, the TER and the share price
// — and none of them orders it: the two funds that cost half the estimate sit either side
// of the two that match it on every one of those axes. What the broker quotes on its own
// book is its own, and no figure Deutsche Börse publishes reaches it.
//
// Turnover in particular explains nothing, which cost a wrong theory to learn. Two single
// shares of GC40 had paid 2.58 and 2.15 times the estimate late in the day and ten shares
// 1.21, so a broker penalty on thinly traded funds looked like the cause. XS5E refutes
// it: at 5.1 M€ a month it is thinner than GC40's 10.2 and it paid 0.65, while at midday
// GC40 paid a flat 1.75 at both sizes. The size effect was the time of day, and the
// thin-fund penalty was one fund mistaken for a rule.
const NARROW_BP = 2.5;

// Real round trips, kept as a check on the figure above and never as a substitute for it.
// This file answers from published data alone, so that anyone can reproduce it and so that
// six funds out of six thousand do not get a private accuracy the rest cannot have. What
// the trades are worth is the error bar: medians of the readings, with their range, and
// GC40 shows why the range matters — 5.42 bp three times running at midday against 3.74
// to 8.01 the previous afternoon, the same fund on two consecutive days.
const CHECKS = {
  "IE00B4L5Y983|XETR|EUR": { bp: 0.99, trips: 6, range: [0.79, 1.18], on: "2026-08-26" },
  "IE00B6R52259|XETR|EUR": { bp: 1.87, trips: 6, range: [1.87, 1.87], on: "2026-08-26" },
  "IE00B5BMR087|XETR|EUR": { bp: 1.12, trips: 3, range: [1.12, 1.12], on: "2026-08-27" },
  "LU1681046931|XETR|EUR": { bp: 5.42, trips: 6, range: [3.74, 8.01], on: "2026-08-27" },
  "IE00BKM4GZ66|XETR|EUR": { bp: 2.1, trips: 4, range: [1.47, 2.73], on: "2026-08-27" },
  "LU2196472984|XETR|EUR": { bp: 2.66, trips: 2, range: [2.66, 2.66], on: "2026-08-27" },
};

// Applies to conversion only, and only when the account is not funded in the line's
// currency. Left out of `a` on purpose, per the assumption above. Read off the same
// disclosure: on a 126.66 EUR order in a GBX line it returns CURRENCY_CONVERSION_FEE at
// 0.19 EUR on entry and 0.19 again on exit, and puts the round trip at a ratio of 0.003.
const FX_EACH_WAY = 0.0015;

// ------------------------------------------------------------------------- the listing

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
const rows = Array.isArray(catalogue) ? catalogue : catalogue.rows || [];
const spreads = JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {};

// The broker's catalogue is the authority on what it sells, so the search runs through
// it rather than through a list of funds: a line Trading212 does not offer has no cost
// here, however liquid its book is elsewhere.
function findListing({ etf, place, currency }) {
  const asked = String(etf || "").toUpperCase();
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter(
    (r) => String(r.isin || "").toUpperCase() === asked || String(r.ticker || "").toUpperCase() === asked
  );
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => (!wantVenue || m.venue?.mic === wantVenue.mic))
    .filter((m) => (!wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency));

  return { named, matches, wantVenue };
}

// ---------------------------------------------------------------------------- the cost

export function roundTripCost({ etf, place, currency, bp = null }) {
  const { named, matches, wantVenue } = findListing({ etf, place, currency });
  // `b` and `c` are known before the listing is even found, being terms of the account
  // rather than of the fund, so a failed lookup still answers about them honestly: it is
  // `a` alone that goes null when no spread is on file.
  const answer = {
    a: null,
    b: PER_SHARE,
    c: FLAT,
    // The two clamps a linear form cannot express, null when the broker imposes neither.
    // `floor` is the least a round trip can cost whatever its size, which is what a
    // per-order minimum amounts to; `cap` is where a term stops growing, as the per-share
    // regulatory fee does. Trading212 has neither on these lines.
    floor: null,
    cap: null,
    etf,
    place,
    currency,
  };

  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Trading212` };
  if (!wantVenue && place) return { ...answer, why: `place non reconnue : "${place}"`, alternatives: listAlternatives(named) };
  if (!matches.length)
    return { ...answer, why: `${etf} n'est pas coté sur cette place dans cette devise chez Trading212`, alternatives: listAlternatives(named) };

  // One line per (ticker, place, currency) in this catalogue, checked over its 6 129
  // rows, so the first match is the only match.
  const m = matches[0];
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    mic: m.venue.mic,
    exchange: m.venue.name,
    currency: String(m.row.currency || "").toUpperCase(),
  };

  const leaf = spreads[listing.isin]?.[listing.mic]?.[listing.currency] ?? null;
  if (!leaf) {
    return {
      ...answer,
      listing,
      // Null rather than zero, always: a spread nobody has measured must not read as a
      // free trade. `spread.mjs` fills these in, and the venues quoting a touch only
      // answer while their book is open.
      why: `aucun spread relevé pour ${listing.ticker || listing.isin} sur ${listing.exchange} en ${listing.currency}`,
    };
  }

  const used = bp ?? leaf.bp;
  const check = CHECKS[`${listing.isin}|${listing.mic}|${listing.currency}`];

  return {
    ...answer,
    // cost = a × p × n + b × n + c, with `a` dimensionless, `b` and `c` in the line's
    // currency. Both legs are in `a`: the round trip crosses the spread once.
    a: Number((used / 1e4).toPrecision(4)),
    listing,
    bp: used,
    url: leaf.url,
    basis: bp ? "imposé" : "publié",
    confidence: confidenceOf(used),
    // What real orders paid on this very line, when any have been placed. Reported so the
    // figure above can be judged, never folded into it.
    check: check
      ? {
          bp: check.bp,
          trips: check.trips,
          range: check.range,
          on: check.on,
          ratio: Number((check.bp / used).toFixed(2)),
        }
      : null,
    fxIfConverted: FX_EACH_WAY * 2,
  };
}

const listAlternatives = (named) =>
  named.map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`).slice(0, 12);

// Never silently confident. The two regimes are not equally well established and the
// difference is large enough to matter to whoever reads the number.
const confidenceOf = (bp) =>
  bp <= NARROW_BP
    ? `carnet serré : estimation juste à 6 % près sur les trois fonds de ce régime qui ont été tradés`
    : `carnet large (plus de ${NARROW_BP} bp) : dans ce régime l'estimation s'est trompée d'un facteur deux dans les deux sens, compter de ${(bp * 0.5).toFixed(1)} à ${(bp * 1.8).toFixed(1)} bp`;

// ------------------------------------------------------------------------------- entrée

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;

  if (!etf) {
    console.error(
      "usage : node trading212_cost.mjs <ETF|ISIN> <place> <devise> [--shares=n] [--price=p] [--bp=x] [--json]\n" +
        '  ex.  node trading212_cost.mjs IUSQ "Deutsche Börse Xetra" EUR --shares=20 --price=106.90'
    );
    process.exit(2);
  }

  const out = roundTripCost({ etf, place, currency, bp: flag("bp") ? Number(flag("bp")) : null });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
  } else if (out.a == null) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) console.log(`\nce que Trading212 propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
  } else {
    const l = out.listing;
    console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
    console.log(`${l.exchange} (${l.mic}), ${l.currency}\n`);
    console.log(`a = ${out.a}   (au prorata du montant : le spread)`);
    console.log(`b = ${out.b}   (par part : aucun frais réglementaire sur les places européennes)`);
    console.log(`c = ${out.c}   (par ordre : ni commission, ni garde, ni plateforme)`);
    console.log(`\ncoût = ${out.a} × p × n + ${out.b} × n + ${out.c}   (${out.basis})`);
    console.log(`  ${out.bp} bp d'aller-retour, moitié du XLM que publie la place`);
    console.log(`  ${out.confidence}`);
    if (out.check)
      console.log(
        `  vérification : ${out.check.trips} allers-retours réels le ${out.check.on} ont payé ` +
          `${out.check.bp} bp (de ${out.check.range[0]} à ${out.check.range[1]}), soit ×${out.check.ratio}`
      );
    const n = Number(flag("shares"));
    const p = Number(flag("price"));
    if (n > 0 && p > 0) {
      console.log(`\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${(n * p).toFixed(2)} ${l.currency}`);
      console.log(`  aller-retour : ${(out.a * p * n + out.b * n + out.c).toFixed(3)} ${l.currency}`);
      console.log(`  si la devise du compte diffère, ajouter ${(out.fxIfConverted * p * n).toFixed(2)} ${l.currency} de change`);
    }
    if (out.url) console.log(`\n${out.url}`);
  }
}
