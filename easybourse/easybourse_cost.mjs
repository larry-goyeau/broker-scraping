// What one round trip costs at EasyBourse (La Banque Postale): buy n shares at price p,
// sell them back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the other
// `*_cost.mjs` files answer in. The published ticket is in euros; it is converted at
// the ECB mid and folded into `c`. `cEur` stays as the source figure.
//
// Four formulas, one card per venue family, brochure of 1 June 2026 (TTC):
//
//   Euronext Paris / Brussels / Amsterdam, Equiduct, LOX
//     Découverte / Premium / Start   2 € up to 500 €, then 0.45 %
//     Expert                         9 € up to 5 000 €, then 0.20 %
//     Intense                        10 € up to 10 000 €; 10 k–100 k at 0.10 %
//                                    capped 50 €; then 0.10 % uncapped
//   Other venues (Premium / Start / Expert / Intense; Découverte is sell-only
//   by phone on these):
//     NYSE / Nasdaq                  6 € up to 6 000 €, then 0.12 %
//     Xetra                          11 € up to 4 000 €, then 0.25 %
//     other EU (LSE, Madrid, Lisbon, Zurich, Milan, Frankfurt floor)
//                                    35 € up to 10 000 €, then 0.35 %
//     other                          55 € up to 10 000 €, then 0.55 %
//
// The published % × 2 sits in `a` (linear in the amount). The ticket is a floor
// (`min fees` in the remark, `c` = 0). `exactCost` still applies max(min, rate).
// Default plan is Premium. Pass `--plan=` for Expert or Intense.
//
// Cash is euro only. Conversion is J+1 16:00 fixing + 0.12 % each way and
// always hits a non-EUR line, so 0.24 % the round trip sits in `a`. EUR
// lines have no FX.
//
// Custody is 0 €. Inactivity (3 € / 5 € / 5 € per missing Intense order) is a
// holding cost, not a trip. A published promo zeroes courtage on some listed
// products (crypto ETP, turbos, warrants); there is no list in this repo, so
// ordinary ETFs keep the card. No spot crypto.
//
// One live trip on 2026-09-08, one share of TTE, market both ways, routed to
// Equiduct (best execution). Buy 77.80, sell 77.74. The PRU after the buy was
// 79.80 — the 2 € ticket sitting on the fill — and the sell recap quoted the
// same 2.00 €. `c` stays 4 €. The 6 cents of book (7.71 bp) is not folded into
// `a`: XPAR publishes 1.29 bp on that ISIN, and Equiduct has no leaf here.
// TTF is on the ticket (Oui) but was not in the PRU; it stays in `a` from the
// tax map. Expert / Intense / US / Xetra were not traded.
//
//   node easybourse/easybourse_cost.mjs MC EURONEXT EUR
//   node easybourse/easybourse_cost.mjs AAPL NASDAQ USD
//   node easybourse/easybourse_cost.mjs MC EURONEXT EUR --shares=1 --price=700 --plan=expert
//   node easybourse/easybourse_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("easybourse-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://documents.easybourse.com/formulaires_clients/brochure-tarifaire-bourse_01062026.pdf",
  readOn: "2026-09-08",
  revised: "2026-06-01",
  entity: "EasyBourse (La Banque Postale)",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const PTM = { each: 1.5, currency: "GBP", above: 10000 };
const FX_EACH_WAY = 0.0012;
const PEA_CAP = 0.005;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);

const CHECK = {
  isin: "FR0000120271",
  ticker: "TTE",
  venue: "EQUIDUCT",
  n: 1,
  buy: 77.8,
  sell: 77.74,
  book: 0.06,
  bp: 7.71,
  commissionEach: 2,
  pruAfterBuy: 79.8,
  sellQuoted: 2,
  on: "2026-09-08",
};

const DEFAULT_PLAN = "premium";

// Start is Premium for anyone 18–30. Same numbers, different inactivity line.
const PLANS = {
  decouverte: { id: "decouverte", label: "EasyDécouverte", aliasOf: null },
  premium: { id: "premium", label: "EasyPremium", aliasOf: null },
  start: { id: "start", label: "EasyStart", aliasOf: "premium" },
  expert: { id: "expert", label: "EasyExpert", aliasOf: null },
  intense: { id: "intense", label: "EasyIntense", aliasOf: null },
};

// min / upTo in EUR of notional. Above `upTo` the fee is `rate` of the amount,
// not max(min, rate). Intense adds a 50 € cap between 10 k and 100 k.
const EURONEXT_RULE = {
  decouverte: { min: 2, upTo: 500, rate: 0.0045 },
  premium: { min: 2, upTo: 500, rate: 0.0045 },
  expert: { min: 9, upTo: 5000, rate: 0.002 },
  intense: { min: 10, upTo: 10000, rate: 0.001, cap: 50, capUntil: 100000 },
};

const OTHER_RULE = {
  us: { min: 6, upTo: 6000, rate: 0.0012 },
  xetra: { min: 11, upTo: 4000, rate: 0.0025 },
  other_eu: { min: 35, upTo: 10000, rate: 0.0035 },
  other: { min: 55, upTo: 10000, rate: 0.0055 },
};

const US_MKT = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "CBOE", "BATS"]);
const OTHER_EU = new Set([
  "LSE",
  "AQUIS",
  "BME",
  "SIX",
  "BX",
  "MIL",
  "VIE",
  "OSL",
  "OMXSTO",
  "OMXHEX",
  "FWB",
  "SWB",
  "DUS",
  "MUN",
  "HAM",
  "HAN",
  "BER",
]);

// -------------------------------------------------------------------------- the files

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
const rows = Array.isArray(catalogue) ? catalogue : catalogue.rows || [];
const spreads = JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
  eur: usdPer("EUR"),
});

// ------------------------------------------------------------------------- plans / markets

const PLAN_ALIAS = {
  decouverte: "decouverte",
  découverte: "decouverte",
  decouv: "decouverte",
  premium: "premium",
  start: "start",
  easystart: "start",
  expert: "expert",
  intense: "intense",
};

export function planOf(name = DEFAULT_PLAN) {
  const raw = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^easy/i, "")
    .trim();
  const key = PLAN_ALIAS[loose(raw).toLowerCase()] || PLAN_ALIAS[raw.toLowerCase()];
  const hit = key ? PLANS[key] : null;
  if (!hit) return null;
  return { id: hit.id, label: hit.label, brokerageOf: hit.aliasOf || hit.id };
}

export function feeMarketOf(exchange, mic) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  if (US_MICS.has(m) || US_MKT.has(code)) return "us";
  if (code === "XETR" || m === "XETR") return "xetra";
  // Lisbon is Euronext but sits on the "other EU" row of the card (35 €).
  if (m === "XLIS" || code === "XLIS") return "other_eu";
  if (
    /^(XPAR|XAMS|XBRU|EURONEXT)$/.test(code) ||
    ["XPAR", "XAMS", "XBRU"].includes(m)
  ) {
    return "euronext";
  }
  if (code === "LSE" || code === "AQUIS" || m === "XLON") return "other_eu";
  if (OTHER_EU.has(code) || ["XMAD", "XSWX", "XMIL", "XWBO", "XOSL", "XLIS"].includes(m)) {
    return "other_eu";
  }
  if (m === "XMSM" || /DUBLIN|XMSM/.test(code)) return "other_eu";
  return "other";
}

export function ruleOf(plan, market) {
  const p = planOf(plan);
  if (!p) return null;
  if (market === "euronext") return EURONEXT_RULE[p.brokerageOf];
  return OTHER_RULE[market] || OTHER_RULE.other;
}

export function commissionEach(amount, rule) {
  if (!rule || amount == null || !Number.isFinite(Number(amount))) return null;
  const n = Number(amount);
  if (n <= rule.upTo) return rule.min;
  let fee = n * rule.rate;
  if (rule.cap != null && n <= (rule.capUntil ?? Infinity)) fee = Math.min(fee, rule.cap);
  return fee;
}


function onlineBuy(plan, market) {
  const p = planOf(plan);
  if (!p) return false;
  if (p.brokerageOf === "decouverte" && market !== "euronext") return false;
  return true;
}

function remarkOf({ plan, market, online }) {
  const rule = ruleOf(plan.id, market);
  const lines = [];
  // Premium is cheaper only on Euronext. US / Xetra / other share one card.
  if (rule) lines.push(`min fees ${rule.min * 2} €.`);
  return lines.join("\n");
}

// ------------------------------------------------------------------------- listing

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
    const market = feeMarketOf(r.exchange, book.mic ?? venue?.mic);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------- the cost

export function roundTripCost({
  etf,
  place,
  currency,
  bp = null,
  perShare = null,
  plan = DEFAULT_PLAN,
  pea = false,
}) {
  const picked = planOf(plan);
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    b: 0,
    c: 0,
    ccy: QUOTE,
    floor: null,
    cap: null,
    threshold: null,
    plan: picked?.id ?? plan,
    etf,
    place,
    currency,
  };

  if (!picked) {
    return { ...answer, why: `formule inconnue : ${plan} (decouverte|premium|start|expert|intense)` };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue EasyBourse` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez EasyBourse`,
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
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row.exchange, listing.mic);
  const rule = ruleOf(picked.id, market);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = US_MICS.has(listing.mic) || market === "us";
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);

  const fxPct = listing.currency === "EUR" ? 0 : FX_EACH_WAY * 2;
  const knownPct = taxTotal + (american ? SEC_RATE : 0) + (rule.rate ?? 0) * 2 + fxPct;
  const a = marketBp != null ? marketBp / 1e4 + knownPct : knownPct || null;
  const bookUsd = american ? (marketPerShare ?? 0) : dollars(marketPerShare ?? 0, listing.currency) ?? 0;
  const eachEur = rule.min;
  const commUsd = dollars(eachEur * 2, "EUR") ?? 0;

  return {
    ...answer,
    a: a == null ? null : Number(a.toPrecision(4)),
    b: Number((bookUsd + (american ? TAF_PER_SHARE : 0)).toPrecision(6)),
    c: 0,
    floor: commUsd,
    listing,
    feeMarket: market,
    onlineBuy: onlineBuy(picked.id, market),
    remark: remarkOf({ plan: picked, market, online: onlineBuy(picked.id, market) }),
    parts: {
      marché:
        marketBp != null ? Number((marketBp / 1e4).toPrecision(4)) : marketPerShare != null ? `${marketPerShare} par part` : null,
      taxes: Object.keys(rates).length ? rates : null,
      réglementaire: american ? { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part` } : null,
      commission: (rule.rate ?? 0) * 2,
      commissionUsd: commUsd,
      change: fxPct || null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème ${picked.label}, palier ${market}, ticket ${eachEur} € × 2 converti en dollars au mid BCE`,
    tax,
    commission: {
      each: dollars(eachEur, "EUR"),
      roundTrip: commUsd,
      currency: QUOTE,
      native: { each: eachEur, roundTrip: eachEur * 2, currency: "EUR" },
      market,
      plan: picked.id,
      atNotional: `palier le plus bas (ticket ≤ ${rule.upTo} €)`,
      rule,
    },
    cEur: eachEur * 2,
    ccy: QUOTE,
    cap:
      american || rule.cap != null
        ? {
            ...(american ? { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" } : {}),
            ...(rule.cap != null
              ? { commission: { amount: dollars(rule.cap, "EUR"), native: rule.cap, currency: "EUR", until: rule.capUntil } }
              : {}),
          }
        : null,
    threshold:
      listing.mic === "XLON"
        ? {
            c: dollars(2 * PTM.each, "GBP"),
            currency: QUOTE,
            above: PTM.above,
            aboveCurrency: "GBP",
            why: `prélèvement PTM de ${PTM.each} £ par ordre et par sens, au-delà de ${PTM.above} £`,
          }
        : null,
    pea: pea ? { cap: PEA_CAP, why: "plafond PEA / PEA-PME 0,5 % du montant, en ligne, EEE seulement" } : null,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    check: market === "euronext" ? CHECK : null,
    confidence: confidenceOf({
      plan: picked,
      market,
      marketBp,
      marketPerShare,
      taxTotal,
      american,
      leaf,
      type: listing.type,
      unsourced: m.unsourced,
      online: onlineBuy(picked.id, market),
      pea,
    }),
  };
}

export function exactCost({ amount, market, plan = DEFAULT_PLAN, pea = false, currency = "EUR" }) {
  const picked = planOf(plan);
  const rule = picked ? ruleOf(picked.id, market) : null;
  if (!rule) return { commission: null, currency: QUOTE };
  let each = commissionEach(amount, rule);
  if (pea && ["euronext", "xetra", "other_eu"].includes(market)) {
    each = Math.min(each, amount * PEA_CAP);
  }
  return {
    commission: dollars(each * 2, "EUR"),
    currency: QUOTE,
    native: { commission: each * 2, each, currency: "EUR" },
    rule,
    plan: picked.id,
    pea,
  };
}

function confidenceOf({ plan, market, marketBp, marketPerShare, taxTotal, american, leaf, type, unsourced, online, pea }) {
  const said = [];
  said.push(
    `commission ${plan.label}, palier ${market}, lue le ${SCHEDULE.readOn} (carte du ${SCHEDULE.revised}), ` +
      `convertie en dollars au mid BCE du ${FX_AS_OF} et pliée dans c au ticket le plus bas`
  );
  if (!online) {
    said.push(
      `EasyDécouverte n'achète pas ce marché en ligne : vente seule, par téléphone, au tarif de la carte (sans les +11 €)`
    );
  }
  if (taxTotal > 0) said.push(`taxes ${(100 * taxTotal).toFixed(2)} % du montant`);
  if (american) said.push(`frais SEC et FINRA à la vente, comme chez tout courtier américain`);
  if (pea) said.push(`plafond PEA 0,5 % appliqué à la commission en ligne, marchés EEE`);
  if (marketPerShare != null) {
    said.push(
      `carnet Rule 605, moyenne 100–499 parts` +
        (marketPerShare > 0.01 ? ` ; à ${marketPerShare} $/part le bucket est déjà large` : "")
    );
  } else if (marketBp != null) {
    said.push(`carnet publié ${marketBp} bp` + (unsourced ? ` (Euronext sans ville, un seul carnet pour cet ISIN)` : ""));
  } else if (unsourced) {
    said.push(`aucun carnet : ${unsourced.name}, ${unsourced.why} — seules commission, taxes et frais sont comptés`);
  } else if (type) {
    said.push(`aucun carnet relevé sur cette ligne : le spread manque`);
  }
  if (market === "euronext" && ["decouverte", "premium", "start"].includes(plan.brokerageOf)) {
    said.push(
      `un aller-retour réel le ${CHECK.on} sur ${CHECK.ticker} (${CHECK.venue}) : ` +
        `achat ${CHECK.buy} / vente ${CHECK.sell}, carnet ${CHECK.book} € (${CHECK.bp} bp), ` +
        `courtage ${CHECK.commissionEach} € par jambe (PRU après achat ${CHECK.pruAfterBuy} = fill + ticket, ` +
        `récap vente ${CHECK.sellQuoted} €). c reste 4 €, le carnet n'est pas plié dans a`
    );
  } else {
    said.push(
      `courtage ${plan.label} / ${market} non recoupé sur un relevé ; le seul aller-retour réel est ${CHECK.ticker} Equiduct à 2 € le ticket`
    );
  }
  said.push(
    `change 0,12 % par sens sur le fixing J+1 16 h, dans a hors EUR (cash euro seulement)`
  );
  return said.join(" ; ");
}

// ------------------------------------------------------------------------------- entrée

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    const cover = coverage();
    const out = {
      ...SCHEDULE,
      defaultPlan: DEFAULT_PLAN,
      plans: Object.fromEntries(
        Object.entries(PLANS).map(([k, v]) => [
          k,
          {
            ...v,
            euronext: EURONEXT_RULE[v.aliasOf || v.id],
            other: v.id === "decouverte" ? { note: "vente seule, téléphone" } : OTHER_RULE,
          },
        ])
      ),
      fxEachWay: FX_EACH_WAY,
      peaCap: PEA_CAP,
      coverage: cover,
    };
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node easybourse_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=premium|decouverte|start|expert|intense] [--pea] [--json]\n" +
        "        node easybourse_cost.mjs --schedule\n" +
        "  ex.   node easybourse_cost.mjs MC EURONEXT EUR\n" +
        "        node easybourse_cost.mjs AAPL NASDAQ USD --shares=1 --price=230 --plan=premium"
    );
    process.exit(2);
  }

  const plan = flag("plan") || DEFAULT_PLAN;
  const pea = process.argv.includes("--pea");
  const out = roundTripCost({
    etf,
    place,
    currency,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan,
    pea,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (out.a == null) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) console.log(`\nce qu'EasyBourse propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }

  const l = out.listing;
  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${picked?.label || out.plan}]\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);
  if (out.parts?.change) detail.push(`change ${out.parts.change}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : FINRA et/ou spread 605" : " : rien"})`);
  console.log(`c = ${out.c} $   (par ordre : ${out.cEur} € de commission au palier bas, au mid BCE)`);
  console.log(`cEur = ${out.cEur} €   (source, marché ${out.feeMarket}, déjà dans c)`);
  if (!out.onlineBuy) console.log(`en ligne : vente seule (Découverte, marchés hors Euronext)`);
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(`\ncoût = ${out.a} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ${out.b} × n + ${out.c}   ($ ; p en ${l.currency})`);
  console.log(`  ${out.basis}`);
  for (const line of out.confidence.split(" ; ")) console.log(`  ${line}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency);
    const extra = out.threshold && amount >= out.threshold.above ? out.threshold.c : 0;
    const affine = amountUsd != null ? out.a * amountUsd + out.b * n + out.c + extra : null;
    const billed = exactCost({ amount, market: out.feeMarket, plan: out.plan, pea, currency: l.currency });
    console.log(`\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` + (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : ""));
    if (affine != null) console.log(`  a, b, c        : ${affine.toFixed(4)} $`);
    if (billed.commission != null) {
      console.log(
        `  commission     : ${Number(billed.commission).toFixed(4)} $` +
          (billed.native?.commission != null ? ` (${billed.native.each} € × 2)` : "")
      );
    }
  }
  if (out.url) console.log(`\n${out.url}`);
}
