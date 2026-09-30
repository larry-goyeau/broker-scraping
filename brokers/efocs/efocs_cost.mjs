// What one round trip costs at EFOCS (EuroFinance): buy n shares at price p,
// sell them back at once, platform, retail, in dollars.
//
// The affine triple hid the ticket. Courtage is a % floored at 3 / 4 / 6 €,
// and that floor lived only in `min fees` / `c` = 0. Every Xetra fill under
// 8 000 € was missing 8 €. `roundTrip` is given the size and charges what
// is charged.
//
// EURO-FINANCE AD (BG), Schedule of Fees, Board minutes 479 of 14 August
// 2026, in force 15 September 2026. Re-read 2026-09-15 — the BSE minimum
// dropped from 3.50 € to 3.00 € (the marketing page prints the same 3 €).
// Default is the EFOCS platform card (Chapter I), retail. Professional is
// the same Xetra / Frankfurt % and a cheaper BSE line (0.20 %). Office /
// telephone (Chapter II: 1.50 %–0.40 %, min 5–10 €) and bonds are not
// this trip. Catalogue 5 258 lines — 3 689 ETFs, 1 569 stocks — Xetra
// and Sofia, no Frankfurt floor row.
//
//   BSE (XBUL)     retail 0.30 %, professional 0.20 %, min 3 €
//   Xetra (XETR)   0.05 %, min 4 €          (retail = professional)
//   Frankfurt floor (XFRA)
//                  0.10 %, min 6 €          (retail = professional)
//
// Starred lines include third-party costs, so exchange / clearing stay
// out of the number. No US tape, no SEC / TAF. Stamp / FTT from the tax
// map, never invented. Custody on the BSE / Deutsche Börse pages is none.
// Art. 33 UniCredit safekeeping is their schedule, not a figure here.
//
// Cash is euro (BG joined on 1 January 2026). They take EUR / USD / GBP
// deposits and convert "at the current exchange rate of Euro-Finance" on
// payments — no published fill markup, so FX stays out of the total.
//
//   https://www.eurofinance.bg/wp-content/uploads/documents/legal-documents/Schedule%20of%20fees.pdf
//   https://eurofinance.bg/en/services/trading/deutscheboerse/
//   https://eurofinance.bg/en/services/trading/bse/
//
//   node efocs/efocs_cost.mjs VWCE XETR EUR --shares=1 --price=140
//   node efocs/efocs_cost.mjs APC XETR EUR --shares=1 --price=230
//   node efocs/efocs_cost.mjs ETR BSESOF EUR --shares=10 --price=10
//   node efocs/efocs_cost.mjs ETR BSESOF EUR --plan=professional --shares=10 --price=10
//   node efocs/efocs_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("efocs-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.eurofinance.bg/wp-content/uploads/documents/legal-documents/Schedule%20of%20fees.pdf",
  xetra: "https://eurofinance.bg/en/services/trading/deutscheboerse/",
  bse: "https://eurofinance.bg/en/services/trading/bse/",
  readOn: "2026-09-15",
  previouslyRead: "2026-09-10",
  revised: "2026-09-15",
  board: "2026-08-14",
  entity: "EFOCS (EURO-FINANCE AD, BG)",
};

const DEFAULT_PLAN = "retail";

const PLANS = {
  retail: { id: "retail", label: "Retail" },
  professional: { id: "professional", label: "Professional" },
};

const PLAN_ALIAS = {
  retail: "retail",
  default: "retail",
  nonprofessional: "retail",
  professional: "professional",
  pro: "professional",
};

const RULE = {
  bse: { retail: 0.003, professional: 0.002, min: 3 },
  xetr: { retail: 0.0005, professional: 0.0005, min: 4 },
  xfra: { retail: 0.001, professional: 0.001, min: 6 },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const toCcy = (amount, from, to) => {
  if (String(from || "").toUpperCase() === String(to || "").toUpperCase()) return Number(amount);
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

function micFromRaw(raw) {
  const t = String(raw || "").toUpperCase();
  if (/\bXFRA\b/.test(t)) return "XFRA";
  if (/\bXETR\b/.test(t)) return "XETR";
  if (/\bXBUL\b/.test(t)) return "XBUL";
  return null;
}

export function feeMarketOf(row, mic) {
  const fromRaw = micFromRaw(row?.raw);
  const m = String(fromRaw || mic || "").toUpperCase();
  const code = loose(row?.exchange);
  if (m === "XBUL" || /^(BSESOF|XBUL|BSE|SOFIA)$/.test(code)) return "bse";
  if (m === "XFRA" || code === "XFRA") return "xfra";
  if (m === "XETR" || code === "XETR") return "xetr";
  return null;
}

function rateOf(rule, plan) {
  return rule[plan.id] ?? rule.retail;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantUnsourced = resolved.unsourced || null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rowsNamed(rows, asked, 
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      if (wantUnsourced && m.unsourced) return m.unsourced.name === wantUnsourced.name;
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
    const market = feeMarketOf(r, book.mic ?? venue?.mic) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

/**
 * One side, in euro of notional. The printed % is floored at the ticket.
 */
export function commissionSide({ amountEur, market, plan = DEFAULT_PLAN }) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  const rule = RULE[market];
  if (!picked || !rule || amountEur == null || !Number.isFinite(Number(amountEur))) return null;
  const rate = rateOf(rule, picked);
  const raw = Number(amountEur) * rate;
  const charged = Math.max(rule.min, raw);
  return { charged, raw, floored: raw < rule.min, rate, currency: "EUR" };
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `brokerFees` is the EFOCS ticket, third-party costs already inside the %.
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  bp = null,
  perShare = null,
  plan = DEFAULT_PLAN,
}) {
  const picked = planOf(plan);
  const answer = {
    usd: null,
    brokerFees: null,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "EUR",
    plan: picked?.id ?? plan,
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (retail|professional)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue EFOCS n'existe pas encore : lancer `node efocs/efocs_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue EFOCS` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez EFOCS`,
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
    mic: book.mic ?? m.venue?.mic ?? micFromRaw(m.row.raw) ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row, listing.mic);
  const rule = RULE[market];
  if (!rule) {
    return {
      ...answer,
      listing,
      why: `${listing.brokerExchange || listing.exchange} n'a pas de palier publié sur EFOCS`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  const rate = rateOf(rule, picked);

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    remark: "",
  };

  const basis =
    `barème EFOCS ${picked.label}, palier ${market}, brochure du ${SCHEDULE.revised} relue le ${SCHEDULE.readOn}` +
    ` : ${(rate * 100).toFixed(2)} %, plancher ${rule.min} €`;

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        picked,
        market,
        rule,
        rate,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        taxPct,
      }),
    };
  }

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);
  const notionalEur = toCcy(notional, listing.currency, "EUR");
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const buy = commissionSide({ amountEur: notionalEur, market, plan: picked });
  const sell = commissionSide({ amountEur: notionalEur, market, plan: picked });
  const buyUsd = buy ? dollars(buy.charged, "EUR") : null;
  const sellUsd = sell ? dollars(sell.charged, "EUR") : null;
  const brokerFees = plus(buyUsd, sellUsd);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why:
            `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ` +
            `${m.unsourced?.why || "pas de source de spread"}`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      notionalEur: finite(notionalEur, 6),
      currency: listing.currency,
    },
    buy: {
      commission: finite(buyUsd, 6),
      native: buy ? { ...buy, charged: finite(buy.charged, 6), raw: finite(buy.raw, 6) } : null,
      taxes: finite(taxUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
    },
    sell: {
      commission: finite(sellUsd, 6),
      native: sell ? { ...sell, charged: finite(sell.charged, 6), raw: finite(sell.raw, 6) } : null,
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
    },
    commission: {
      rate,
      min: rule.min,
      currency: "EUR",
      eachWay: true,
      plan: picked.id,
      thirdPartyIncluded: true,
    },
    basis,
    confidence: confidenceOf({
      picked,
      market,
      rule,
      rate,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      buy,
    }),
  };
}

function confidenceOf({
  picked,
  market,
  rule,
  rate,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  taxPct,
  buy,
}) {
  const said = [];
  said.push(
    `EFOCS ${picked.label}, palier ${market}, barème du ${SCHEDULE.revised} (CA 479 du ${SCHEDULE.board}) ` +
      `relu le ${SCHEDULE.readOn} — le plancher BSE est passé de 3,50 € à 3 €`
  );
  said.push(
    buy?.floored
      ? `le plancher mord : ${Number(buy.raw.toPrecision(3))} € calculés, ${rule.min} € facturés par sens`
      : `courtage plateforme ${(rate * 100).toFixed(2)} % par sens` +
        (buy ? `, ${Number(buy.charged.toPrecision(4))} €` : "")
  );
  said.push(`tiers inclus dans le % (ligne étoilée). Pas de SEC / TAF : pas de tape US`);
  if (taxPct) said.push(`taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant, depuis taxMap.mjs`);
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part, moyenne 100–499 parts`);
  else {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. ` +
        `Le total est N/A faute de mesure, pas faute de frais`
    );
  }
  said.push(
    `hors total : change « at the current exchange rate of Euro-Finance » sans % publié, ` +
      `garde UniCredit art. 33, virement sortant 1 € / retrait caisse 0,90 %, téléphone chapitre II. ` +
      `Aucun aller-retour réel dans ce dépôt`
  );
  return said.join(" ; ");
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
          defaultPlan: DEFAULT_PLAN,
          plans: PLANS,
          rules: Object.fromEntries(
            Object.entries(RULE).map(([k, v]) => [
              k,
              { ...v, retailRt: v.retail * 2, professionalRt: v.professional * 2, minRt: v.min * 2 },
            ])
          ),
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
      "usage : node efocs_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=retail|professional] [--json]\n" +
        "        node efocs_cost.mjs --schedule\n" +
        "  ex.   node efocs_cost.mjs VWCE XETR EUR --shares=1 --price=140\n" +
        "        node efocs_cost.mjs APC XETR EUR --shares=1 --price=230\n" +
        "        node efocs_cost.mjs ETR BSESOF EUR --plan=professional --shares=10 --price=10"
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
    plan: flag("plan") || DEFAULT_PLAN,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce qu'EFOCS propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${picked?.label || out.plan}]\n`
  );

  if (out.trade?.notional != null) {
    const t = out.trade;
    console.log(
      `${t.shares ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ` : ""}` +
        `${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "")
    );
    console.log();
  }

  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) {
      if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
    }
  }
  console.log();
  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
