// The fee lines every BRVM round trip shares, for the cost files of the
// Abidjan SGIs whose only place is the BRVM (societegeneralew, bridge, boa,
// nsia, attijariwestafri). The broker's own courtage stays in its cost file;
// this module adds the exchange's lines and the Ivorian tax on the courtage,
// in francs CFA, so the five files compute them the same way.
//
// Exchange and clearing, https://www.brvm.org/fr/node/312 read on
// 2026-10-26: "Les commissions sur les transactions boursières revenant à la
// BRVM et au Dépositaire Central / Banque de Règlement (DC/BR) sont
// actuellement 0.2 % et 0.1 % du montant de la transaction payables par
// l'Acheteur et par le Vendeur." The same two lines, at the same rates, are
// in the SGIs' own order simulators (BOA Capital Securities, GEK Capital).
//
// Tax: a Côte d'Ivoire SGI's courtage pays the taxe sur les opérations
// bancaires (TOB), "10 % sur une base hors taxes" (Code général des impôts,
// art. 395 and 401, https://a-tla.org/cote-divoire/code-general-des-impots).
// BOA's simulator prints it as "TAF (10% sur comm. BOA CAPITAL SECURITIES)",
// GEK's as "TAF (10% sur commissions GEK CAPITAL)"; NSIA Capital (2026),
// ASWA (2025) and Société Générale CI (July 2026) print their tariffs
// "hors taxes". It is charged on the SGI's commission only, not on the BRVM
// and DC/BR lines (BOA's simulator: TAF = 10 % of its own commission).
//
// Rounding: BOA's simulator rounds every line up to the franc
// (Math.ceil); pass `ceil: true` to copy that. Nothing else here rounds.
//
// Use:
//   import { brvmLegs, BRVM_RATE, DCBR_RATE, CI_TOB, BRVM_PAGE, CI_TAX_PAGE, isBrvmXof, MARKET_BASIS }
//     from "../societegeneralew/brvmCost.mjs";
//   const legs = brvmLegs({ notional, buy: { rate: 0.01 }, sell: { rate: 0.01 } });
//   // legs.courtage   both sides' commission, XOF (brokerFees)
//   // legs.tax        TOB on that commission, XOF
//   // legs.market     BRVM + DC/BR, both sides, XOF
//   // legs.levies     market + tax, XOF (the "réglementaire" part, as in
//   //                 brokers/gekcapital and brokers/macafrican)
//   // legs.buy / legs.sell   { courtage, tax, brvm, dcbr, total } for each side
//
// A side is { rate, min = 0, max = null, flat = 0 }: commission =
// clamp(notional × rate, min, max) + flat, in XOF. `tax` defaults to CI_TOB;
// pass null when the tax is unknown (then legs.tax and legs.levies are null)
// or 0 when the tariff is all taxes included.
//
//   node brokers/societegeneralew/brvmCost.mjs      runs the checks

import { pathToFileURL } from "node:url";

export const BRVM_RATE = 0.002;
export const DCBR_RATE = 0.001;
export const CI_TOB = 0.1;
export const BRVM_PAGE = "https://www.brvm.org/fr/node/312";
export const CI_TAX_PAGE = "https://a-tla.org/cote-divoire/code-general-des-impots";
export const MARKET_BASIS = "Commissions BRVM 0,2 % et DC/BR 0,1 % du montant, à l'achat et à la vente.";
export const TAX_BASIS = "TOB ivoirienne 10 % sur le courtage (CGI art. 395 et 401).";

// A catalogue listing the BRVM tariff covers: XBRV, in francs CFA.
export const isBrvmXof = (listing) => listing?.mic === "XBRV" && String(listing?.currency || "").toUpperCase() === "XOF";

function side(notional, { rate = 0, min = 0, max = null, flat = 0 } = {}, tax, up) {
  const r = up ? Math.ceil : (x) => x;
  let fee = notional * rate;
  if (min > 0 && fee < min) fee = min;
  if (max != null && fee > max) fee = max;
  const courtage = r(fee + flat);
  const brvm = r(notional * BRVM_RATE);
  const dcbr = r(notional * DCBR_RATE);
  const taxed = tax == null ? null : r(courtage * tax);
  return { courtage, tax: taxed, brvm, dcbr, total: taxed == null ? null : courtage + taxed + brvm + dcbr };
}

export function brvmLegs({ notional, buy, sell, tax = CI_TOB, ceil = false }) {
  const amount = Number(notional);
  if (!(amount > 0)) return null;
  const b = side(amount, buy, tax, ceil);
  const s = side(amount, sell ?? buy, tax, ceil);
  const market = b.brvm + b.dcbr + s.brvm + s.dcbr;
  const taxes = b.tax == null || s.tax == null ? null : b.tax + s.tax;
  return {
    notional: amount,
    currency: "XOF",
    buy: b,
    sell: s,
    courtage: b.courtage + s.courtage,
    tax: taxes,
    market,
    levies: taxes == null ? null : market + taxes,
    total: taxes == null ? null : b.courtage + s.courtage + market + taxes,
  };
}

function selfTest() {
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const check = (label, ok) => {
    if (!ok) throw new Error(`brvmCost: ${label}`);
    console.log(`ok  ${label}`);
  };
  // 25 ORAC at 21,500 = 537,500 XOF, 1 % each side (NSIA / BOA).
  const a = brvmLegs({ notional: 537500, buy: { rate: 0.01 } });
  check("1 % each side: courtage 10,750", near(a.courtage, 10750));
  check("1 % each side: TOB 1,075", near(a.tax, 1075));
  check("1 % each side: BRVM + DC/BR 3,225", near(a.market, 3225));
  check("1 % each side: total 15,050", near(a.total, 15050));
  // BOA's simulator, 7 shares at 3,333: brut 23,331, BRVM ceil(46.662)=47,
  // DC/BR ceil(23.331)=24, comm ceil(233.31)=234, TAF ceil(23.4)=24.
  const c = brvmLegs({ notional: 7 * 3333, buy: { rate: 0.01 }, ceil: true });
  check("BOA rounding: one side 47 + 24 + 234 + 24", c.buy.brvm === 47 && c.buy.dcbr === 24 && c.buy.courtage === 234 && c.buy.tax === 24);
  // Société Générale CI: 0.8 % with a 1,000 FCFA minimum. 100,000 XOF → 800 → 1,000.
  const m = brvmLegs({ notional: 100000, buy: { rate: 0.008, min: 1000 } });
  check("minimum 1,000 FCFA applies", m.buy.courtage === 1000 && m.sell.courtage === 1000);
  const m2 = brvmLegs({ notional: 500000, buy: { rate: 0.008, min: 1000 } });
  check("minimum not reached at 500,000", near(m2.buy.courtage, 4000));
  // Different sides, unknown tax.
  const u = brvmLegs({ notional: 1e6, buy: { rate: 0.01 }, sell: { rate: 0.008 }, tax: null });
  check("buy 1 % / sell 0.8 %: courtage 18,000", near(u.courtage, 18000));
  check("unknown tax → tax, levies, total null", u.tax === null && u.levies === null && u.total === null && near(u.market, 6000));
  check("no notional → null", brvmLegs({ notional: 0, buy: { rate: 0.01 } }) === null);
  check("isBrvmXof", isBrvmXof({ mic: "XBRV", currency: "xof" }) && !isBrvmXof({ mic: "XNGS", currency: "XOF" }));
}

let called = false;
try {
  called = import.meta.url === pathToFileURL(process.argv[1]).href;
} catch {
  called = false;
}
if (called) selfTest();
