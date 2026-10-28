// Shared cost helper for the Swiss banks whose one place is "SIX Swiss
// Exchange" and whose catalogue is the SIX book (brokers/migros/sixBook.mjs):
// graubundnerkanto, obwaldnerkantona, regiobanksolothu, dcbank,
// nidwaldnerkanton, saanen, bsu, bbobrienzoberhas.
//
// The engine is brokers/migros/sixCost.mjs (catalogue lookup, SIX book,
// Swiss stamp, official SIX exchange fee with the retail-flow promotions,
// taxMap, deposits/forced FX, answer in dollars); everything it exports is
// re-exported here. This file adds what that engine does not do: a bank
// that PRINTS its own exchange-fee line ("Börsengebühr SIX Swiss Exchange",
// "Börsengebühren Inland (Fremdspesen) pro Abrechnung CHF 3", ...) passes
// that line, not the exchange's list. `cfg.exchangeFee` is that line.
//
//   cfg.exchangeFee   absent  -> the official SIX List of Charges, retail
//                                order, with the promotions (sixCost.mjs);
//                                for a tariff that says only "Börsengebühren
//                                ... werden weiterverrechnet".
//                     false   -> through cfg.exchangeFees: false, the tariff
//                                says its prices include the exchange fee.
//                     (ctx) => { chf, text }   one side, in CHF, from the
//                                bank's own printed table (printedFee below).
//   ctx = { side, amountChf, row, segment, listing }
//
// Tariff shapes on top of sixCost's bandFlat / bandRate / sliced:
//   smallOrder(normalChf, amountChf, { upTo, rate, min })
//     "Bei Kleinstabschlüssen bis CHF 800 werden 10 % des Kurswertes,
//     mindestens CHF 15 berechnet" (BBO), "Kleinstabschlüsse bis Erreichung
//     Minimumgebühr 10 %" (Saanen), "bis CHF 1000 Kurswert 10 %, mindestens
//     CHF 20" (DC Bank): the small-order rate replaces the minimum courtage
//     and never raises the fee, min(normal, max(min, rate x amount)).
//   printedFee({ groups, perOrder, label })
//     a bank's exchange-fee table, one side:
//       clamp(fix + pct x amount, min, max) for the row's group, plus a
//       flat `perOrder` (e.g. NKB "Meldegebühr CHF 1.60 pro Abschluss").
//     groups: { shares, etp, fund?, blueChip? } each { fix, pct, min, max }.
//     A share takes `shares`; ETF/ETN/ETC take `etp`; a FUND row takes
//     `fund` or else `etp`. `blueChip` is not used: the catalogue does not
//     say which share is in the SLI, so every share takes the `shares`
//     line, which is the higher one in the tables seen (NKB: 0.50 +
//     0.0038 % against 0.25 + 0.0037 %).
//
//   node brokers/graubundnerkanto/sixPlaceCost.mjs      (self-test)
//
// `roundTrip(...)` reads files, not the network.

import { pathToFileURL } from "node:url";
import { plus, finite } from "../../na.mjs";
import { makeRoundTrip as baseRoundTrip, dollars, pctFr } from "../migros/sixCost.mjs";

export * from "../migros/sixCost.mjs";

const code = (s) => String(s || "").trim().toUpperCase();

/** Small-order rule: the rate replaces the minimum, never raises the fee. */
export function smallOrder(normalChf, amountChf, { upTo = Infinity, rate, min = 0 } = {}) {
  if (normalChf == null || !(amountChf > 0)) return normalChf;
  if (amountChf > upTo) return normalChf;
  return Math.min(normalChf, Math.max(min, amountChf * rate));
}

/** Fee group of a SIX segment for a bank's printed table. */
export function feeGroup(segment, row) {
  if (segment === "etp") return "etp";
  if (segment === "fund" || segment === "sponsoredFund" || code(row?.type) === "FUND") return "fund";
  return "shares";
}

const chfText = (x) => `CHF ${Number(Number(x).toFixed(2))}`.replace(".", ",");

/** A bank-printed exchange-fee table as an `exchangeFee` function. */
export function printedFee({ groups, perOrder = 0, perOrderLabel = "", label = "frais de bourse du tarif" }) {
  return (ctx) => {
    const name = feeGroup(ctx.segment, ctx.row);
    const g = groups[name] || (name === "fund" ? groups.etp : null) || groups.shares;
    if (!g || !(ctx.amountChf > 0)) return { chf: null, text: `${label} : aucune ligne pour ce titre` };
    let fee = (g.fix || 0) + (g.pct || 0) * ctx.amountChf;
    if (g.min != null) fee = Math.max(g.min, fee);
    if (g.max != null) fee = Math.min(g.max, fee);
    const chf = fee + perOrder;
    const parts = [
      g.fix ? chfText(g.fix) : "",
      g.pct ? `${pctFr(g.pct)} %` : "",
    ].filter(Boolean).join(" + ");
    const bounds = [g.min != null ? `min ${chfText(g.min)}` : "", g.max != null ? `max ${chfText(g.max)}` : ""].filter(Boolean).join(", ");
    const text =
      `${label} (${name === "shares" ? "actions" : name === "etp" ? "ETF/ETP" : "fonds"}) : ${parts}${bounds ? ` (${bounds})` : ""}` +
      (perOrder ? ` + ${perOrderLabel || "frais par ordre"} ${chfText(perOrder)}` : "") +
      ` = ${chfText(chf)} par sens`;
    return { chf, text };
  };
}

const OFFICIAL_CONFIDENCE = /frais SIX de la liste officielle[^;]*?(?=\s*;|$)/;
const INCLUDED_BASIS = "frais de bourse compris dans le tarif";

/**
 * Same cfg as sixCost.makeRoundTrip, plus optional `exchangeFee(ctx)`.
 * Returns roundTrip({ etf, place, currency, shares, price, bp, perShare, plan, on }).
 */
export function makeRoundTrip(cfg) {
  if (typeof cfg.exchangeFee !== "function") {
    return baseRoundTrip(cfg.exchangeFee === false ? { ...cfg, exchangeFees: false } : cfg);
  }
  // The engine hands each commission call its context (row, segment,
  // amount); keep the last one to price the bank's own exchange line.
  let seen = null;
  const wrap = (fn) => (ctx) => {
    seen = ctx;
    return fn(ctx);
  };
  const plans = cfg.plans
    ? Object.fromEntries(Object.entries(cfg.plans).map(([k, p]) => [k, { ...p, commission: wrap(p.commission) }]))
    : undefined;
  const base = baseRoundTrip({
    ...cfg,
    exchangeFees: false,
    ...(plans ? { plans } : { commission: wrap(cfg.commission) }),
  });

  return function roundTrip(args) {
    seen = null;
    const r = base(args);
    if (!r.trade || r.trade.amountChf == null || !seen) return r;
    const ctx = { amountChf: r.trade.amountChf, row: seen.row, segment: seen.segment, listing: r.listing };
    const buy = cfg.exchangeFee({ ...ctx, side: "buy" });
    const sell = cfg.exchangeFee({ ...ctx, side: "sell" });
    const feeChf = buy?.chf == null || sell?.chf == null ? null : buy.chf + sell.chf;
    const feeUsd = feeChf == null ? null : dollars(feeChf, "CHF");
    const why = [r.why, feeChf == null ? `frais de bourse ${cfg.brand} inconnus pour ce titre` : null].filter(Boolean).join(" ; ");
    return {
      ...r,
      usd: finite(plus(r.usd, feeUsd), 6),
      ...(why ? { why } : {}),
      basis: String(r.basis || "").replace(INCLUDED_BASIS, buy?.text || "frais de bourse inconnus"),
      commission: { ...r.commission, sixEach: finite(buy?.chf, 6) },
      parts: {
        ...r.parts,
        taxes: finite(plus(r.parts?.taxes, feeUsd), 6),
        fraisSix: finite(feeUsd, 6),
      },
      confidence: String(r.confidence || "").replace(OFFICIAL_CONFIDENCE, `frais de bourse imprimés au tarif ${cfg.brand}, pas la liste SIX`),
    };
  };
}

// Self-test: the shapes, then one dummy bank three ways (official SIX
// list, a printed table, fee included) on three real rows of the GKB
// catalogue at about 1,000 USD.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const near = (a, b, eps = 1e-6) => a != null && b != null && Math.abs(a - b) < eps;
  const assert = (ok, what) => {
    if (!ok) throw new Error(`self-test failed: ${what}`);
  };
  assert(smallOrder(40, 300, { upTo: 800, rate: 0.1, min: 15 }) === 30, "small order 10 %");
  assert(smallOrder(40, 100, { upTo: 800, rate: 0.1, min: 15 }) === 15, "small order floor");
  assert(smallOrder(40, 700, { upTo: 800, rate: 0.1, min: 15 }) === 40, "small order never raises");
  assert(smallOrder(40, 900, { upTo: 800, rate: 0.1, min: 15 }) === 40, "small order above threshold");

  const nkb = printedFee({
    groups: {
      shares: { fix: 0.5, pct: 0.000038, min: 0.25, max: 38 },
      etp: { fix: 1.5, pct: 0.00015, min: 0.5, max: 150 },
    },
    perOrder: 1.6,
    perOrderLabel: "Meldegebühr",
  });
  assert(near(nkb({ amountChf: 800, segment: "swiss" }).chf, 0.5 + 0.0304 + 1.6), "printed shares");
  assert(near(nkb({ amountChf: 800, segment: "etp" }).chf, 1.5 + 0.12 + 1.6), "printed etp");
  assert(near(nkb({ amountChf: 2e6, segment: "swiss" }).chf, 38 + 1.6), "printed cap");
  const okb = printedFee({ groups: { shares: { pct: 0.00005, min: 1.5, max: 65 }, etp: { pct: 0.00015, min: 2, max: 150 } } });
  assert(near(okb({ amountChf: 800, segment: "sponsored" }).chf, 1.5), "printed min");
  assert(near(okb({ amountChf: 100000, segment: "swiss" }).chf, 5), "printed pct");

  const common = {
    folder: "sixplace-selftest",
    brand: "Test",
    catalogue: new URL("graubundnerkanto-parsed.json", import.meta.url),
    page: "https://example.invalid/",
    readOn: "2026-10-26",
    deposits: ["CHF", "EUR", "USD"],
    fx: { rate: 0.01, basis: "1 % (test)" },
    commission: ({ amountChf }) => ({ chf: Math.max(40, amountChf * 0.0055), basis: "0,55 %, min CHF 40 (test)." }),
  };
  const official = makeRoundTrip(common);
  const printed = makeRoundTrip({ ...common, exchangeFee: nkb });
  const included = makeRoundTrip({ ...common, exchangeFee: false });
  const oct = new Date("2026-10-26");
  for (const [t, c, n, p] of [["NESN", "CHF", 10, 81], ["VWRL", "CHF", 6, 135], ["ABT", "CHF", 8, 100]]) {
    const a = official({ etf: t, place: "XSWX", currency: c, shares: n, price: p, on: oct });
    const b = printed({ etf: t, place: "XSWX", currency: c, shares: n, price: p, on: oct });
    const z = included({ etf: t, place: "XSWX", currency: c, shares: n, price: p, on: oct });
    console.log(t, c, `${n} x ${p}`, "| official", a.usd, JSON.stringify(a.parts));
    console.log("   printed", b.usd, JSON.stringify(b.parts), "|", b.basis.split(";").pop().trim());
    console.log("   included", z.usd, "| why", a.why || b.why || z.why || "-");
    assert(a.usd != null && b.usd != null && z.usd != null, `${t} totals`);
    // Without any exchange fee, the three differ only by that fee.
    assert(near(a.usd - a.parts.fraisSix, z.usd, 1e-3) && near(b.usd - b.parts.fraisSix, z.usd, 1e-3), `${t} fee isolation`);
    const seg = b.commission.sixSegment;
    const amount = b.trade.amountChf;
    assert(near(b.parts.fraisSix, dollars(2 * nkb({ amountChf: amount, segment: seg }).chf, "CHF"), 1e-4), `${t} printed fee x2`);
  }
  console.log("sixPlaceCost self-test ok");
}
