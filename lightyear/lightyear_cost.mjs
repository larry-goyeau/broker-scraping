// What one round trip costs at Lightyear: buy n shares at price p, sell them
// back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in.
//
// Two published cards, read 2026-09-11. Default is Lightyear Europe AS
// (`--plan=eu`). `--plan=uk` is Lightyear UK Ltd personal (GIA / ISA): no
// execution fee. UK business uses the Europe stock tickets and is not a
// third plan here.
//
//   Europe AS
//     ETF                         0
//     US stock                    0.10 %, min $0.10, max $1
//     UK stock                    £1
//     EUR stock / ETN / ETC       €1
//     other EU stock              0.10 %
//       HUF min 200 · CHF 1.50 · DKK 10 · SEK 10 · NOK 10 · PLN 5
//     crypto                      0.45 %
//     FX                          0.35 %
//   UK personal
//     stocks and ETFs             0
//     crypto                      not sold
//     FX                          0.10 %
//
// The published % × 2 sits in `a`. A flat ticket sits in `c`. The US / other
// EU minimum is a floor (`min fees`). Cash can be EUR, USD and GBP (HUF too
// on Europe AS); those lines have no FX in `a`. Any other listing currency
// must convert, so the markup × 2 sits in `a`. Stamp / FTT come from the tax
// map; Lightyear also publishes Hungarian FTT 0.45 % (cap 20 000 HUF) on
// Budapest buys. SEC and FINRA TAF are on the US sell, as on their tax page.
// Custody 0. No live trip in this deposit.
//
//   https://lightyear.com/en-eu/pricing
//   https://lightyear.com/en-gb/pricing
//   https://lightyear.com/en-eu/help/deposits-conversions-and-withdrawals/fees-and-taxes
//   https://lightyear.com/en-gb/help/deposits-conversions-and-withdrawals/fees-and-taxes
//
//   node lightyear/lightyear_cost.mjs IWDA
//   node lightyear/lightyear_cost.mjs AAPL NASDAQ USD
//   node lightyear/lightyear_cost.mjs TTE EURONEXT EUR
//   node lightyear/lightyear_cost.mjs HSBA LSE GBP --plan=uk
//   node lightyear/lightyear_cost.mjs BTC
//   node lightyear/lightyear_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("lightyear-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  eu: "https://lightyear.com/en-eu/pricing",
  uk: "https://lightyear.com/en-gb/pricing",
  euFees: "https://lightyear.com/en-eu/help/deposits-conversions-and-withdrawals/fees-and-taxes",
  ukFees: "https://lightyear.com/en-gb/help/deposits-conversions-and-withdrawals/fees-and-taxes",
  readOn: "2026-09-11",
  entity: "Lightyear Europe AS / Lightyear UK Ltd",
};

const DEFAULT_PLAN = "eu";
const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const HFTT = 0.0045;
const HFTT_CAP = 20000;
const CRYPTO_RATE = 0.0045;

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const US_EX = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "CBOE", "BATS", "OTC"]);

const PLANS = {
  eu: {
    id: "eu",
    label: "Lightyear Europe",
    fx: 0.0035,
    hold: new Set(["EUR", "USD", "GBP", "HUF"]),
    crypto: true,
    free: false,
  },
  uk: {
    id: "uk",
    label: "Lightyear UK",
    fx: 0.001,
    hold: new Set(["EUR", "USD", "GBP"]),
    crypto: false,
    free: true,
  },
};

const PLAN_ALIAS = {
  eu: "eu",
  europe: "eu",
  eea: "eu",
  as: "eu",
  uk: "uk",
  gb: "uk",
  gia: "uk",
  isa: "uk",
  personal: "uk",
};

// Native amounts, one way. `flat` is the whole ticket; otherwise max(min, rate × amount)
// then min(cap).
const RULE = {
  etf: { rate: 0, min: 0, currency: "EUR" },
  crypto: { rate: CRYPTO_RATE, min: 0, currency: "EUR" },
  us: { rate: 0.001, min: 0.1, cap: 1, currency: "USD" },
  uk: { flat: 1, currency: "GBP" },
  eur: { flat: 1, currency: "EUR" },
  hu: { rate: 0.001, min: 200, currency: "HUF" },
  ch: { rate: 0.001, min: 1.5, currency: "CHF" },
  dk: { rate: 0.001, min: 10, currency: "DKK" },
  se: { rate: 0.001, min: 10, currency: "SEK" },
  no: { rate: 0.001, min: 10, currency: "NOK" },
  pl: { rate: 0.001, min: 5, currency: "PLN" },
  other_eu: { rate: 0.001, min: 0, currency: "USD" },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
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

export function feeMarketOf(row, mic) {
  const type = String(row?.type || "").toUpperCase();
  const ccy = String(row?.currency || "").toUpperCase();
  const ex = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  if (type === "CRYPTO" || ex === "CRYPTO") return "crypto";
  if (type === "ETF") return "etf";
  if (US_MICS.has(m) || US_EX.has(ex)) return "us";
  if (ccy === "GBP" || ccy === "GBX") return "uk";
  if (ccy === "EUR") return "eur";
  if (ccy === "HUF") return "hu";
  if (ccy === "CHF") return "ch";
  if (ccy === "DKK") return "dk";
  if (ccy === "SEK") return "se";
  if (ccy === "NOK") return "no";
  if (ccy === "PLN") return "pl";
  return "other_eu";
}

export function ruleOf(plan, market) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (!picked || !market) return null;
  if (picked.free && market !== "crypto") return { rate: 0, min: 0, currency: "USD" };
  return RULE[market] || null;
}

export function commissionEach(amount, rule) {
  if (!rule) return null;
  if (rule.flat != null) return rule.flat;
  if (amount == null || !Number.isFinite(Number(amount))) {
    return rule.min ? rule.min : rule.rate ? null : 0;
  }
  let fee = Number(amount) * (rule.rate || 0);
  if (rule.min) fee = Math.max(rule.min, fee);
  if (rule.cap != null) fee = Math.min(rule.cap, fee);
  return fee;
}

function remarkOf({ plan, market, rule, holdable }) {
  const lines = [];
  if (rule?.min && rule.flat == null) {
    lines.push(`min fees ${rule.min * 2} ${rule.currency}.`);
  }
  if (holdable) lines.push(`FX ${(plan.fx * 100).toFixed(2)}% if converted.`);
  return lines.join("\n");
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked) return true;
    return isCrypto(r) && loose(r.ticker) === asked;
  });

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(place))) {
    const row =
      (wantCurrency && crypto.find((r) => String(r.currency).toUpperCase() === wantCurrency)) ||
      crypto.find((r) => String(r.currency).toUpperCase() === "EUR") ||
      crypto[0];
    const { venue, unsourced } = listingKey(row);
    return { named, matches: [{ row, venue, unsourced }] };
  }

  const matches = named
    .filter((r) => !isCrypto(r))
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      if (wantVenue && ["XPAR", "XAMS", "XBRU", "XLIS"].includes(wantVenue.mic) && loose(m.row.exchange) === "EURONEXT") {
        return true;
      }
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
    const book = isCrypto(r)
      ? { leaf: null, mic: null }
      : spreadLeaf(spreads, {
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

export function exactCost({ amount, market, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const rule = picked ? ruleOf(picked, market) : null;
  const each = commissionEach(amount, rule);
  if (each == null || !rule) return { commission: null, currency: QUOTE };
  return {
    commission: dollars(each * 2, rule.currency),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: rule.currency },
    rule,
    plan: picked.id,
  };
}

function taxParts(isin, market) {
  const tax = taxesOf(isin);
  const rates = taxRates(tax);
  delete rates.PTM_LEVY;
  if (market === "hu" && rates.HFTT == null && rates.HUNGARIAN_FTT == null) rates.HFTT = HFTT;
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  return { tax, rates, taxTotal };
}

export function roundTripCost({
  etf,
  place,
  currency,
  bp = null,
  perShare = null,
  plan = DEFAULT_PLAN,
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

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (eu|uk)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Lightyear n'existe pas encore : lancer `node lightyear/lightyear_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Lightyear` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Lightyear`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const crypto = isCrypto(m.row);
  if (crypto && !picked.crypto) {
    return {
      ...answer,
      onlineBuy: false,
      why: "Lightyear UK ne vend pas de crypto",
    };
  }

  const book = crypto
    ? { leaf: null, mic: null }
    : spreadLeaf(spreads, {
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
  };

  const market = feeMarketOf(m.row, listing.mic);
  const rule = ruleOf(picked, market);
  if (!rule) {
    return { ...answer, listing, why: `pas de barre Lightyear pour ${listing.ticker || listing.isin} (${market})` };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us" || US_MICS.has(listing.mic);
  const { tax, rates, taxTotal } = taxParts(listing.isin, market);
  const holdable = picked.hold.has(listing.currency);
  const fxPct = holdable || crypto ? 0 : picked.fx * 2;
  const rate = rule.flat != null ? 0 : rule.rate || 0;
  const knownPct = taxTotal + (american ? SEC_RATE : 0) + rate * 2 + fxPct;
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: crypto ? { match: ["crypto"], name: "Crypto", why: "gré à gré" } : m.unsourced,
    toUsd: (x) => (american ? x : dollars(x, listing.currency)),
  });
  const a = plus(mkt.a, knownPct);
  const ticketCcy = rule.currency;
  const flatUsd = rule.flat != null ? dollars(rule.flat * 2, ticketCcy) : 0;
  const floorUsd = rule.min && rule.flat == null ? dollars(rule.min * 2, ticketCcy) : null;

  const cap =
    american || rule.cap != null || market === "hu"
      ? {
          ...(american ? { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" } : {}),
          ...(rule.cap != null
            ? { commission: { amount: dollars(rule.cap * 2, ticketCcy), native: rule.cap, currency: ticketCcy } }
            : {}),
          ...(market === "hu"
            ? { tax: { part: "HFTT", amount: dollars(HFTT_CAP, "HUF"), native: HFTT_CAP, currency: "HUF", per: "achat" } }
            : {}),
        }
      : null;

  return {
    ...answer,
    a: finite(a, 4),
    b: finite(plus(mkt.b, american ? TAF_PER_SHARE : 0), 6),
    c: flatUsd || 0,
    floor: floorUsd,
    listing,
    feeMarket: market,
    onlineBuy: !(crypto && !picked.crypto),
    remark: remarkOf({ plan: picked, market, rule, holdable }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : crypto
              ? 0
              : null,
      taxes: Object.keys(rates).length ? rates : null,
      réglementaire: american ? { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part` } : null,
      commission: rate * 2,
      change: fxPct || null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? (picked.id === "uk" ? SCHEDULE.ukFees : SCHEDULE.euFees),
    basis: `barème ${picked.label}, palier ${market}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      rate,
      min: rule.min || 0,
      cap: rule.cap ?? null,
      flat: rule.flat ?? null,
      currency: ticketCcy,
      eachWay: true,
      plan: picked.id,
    },
    ccy: QUOTE,
    cap,
    fx: fxNote(listing.currency),
    fxIfConverted: holdable ? picked.fx * 2 : 0,
    confidence:
      `commission ${picked.label} ${market} selon ${picked.id === "uk" ? "lightyear.com/en-gb" : "lightyear.com/en-eu"}, ` +
      `lue le ${SCHEDULE.readOn}. ` +
      (picked.free && market !== "crypto"
        ? `Exécution 0. `
        : rule.flat != null
          ? `Ticket ${rule.flat} ${ticketCcy} par jambe dans c. `
          : `${((rule.rate || 0) * 100).toFixed(2)} % par jambe` +
            (rule.min ? `, plancher ${rule.min} ${ticketCcy}` : "") +
            (rule.cap != null ? `, plafond ${rule.cap} ${ticketCcy}` : "") +
            `. `) +
      (fxPct ? `Change ${(picked.fx * 100).toFixed(2)} % × 2 dans a (${listing.currency} non détenue). ` : `Change hors a si le cash est déjà en ${listing.currency}. `) +
      (american ? `SEC + TAF à la vente. ` : "") +
      `Aucun aller-retour réel dans ce dépôt.` +
      (leaf || crypto ? "" : ` Pas de feuille de carnet pour cet ISIN / cette place.`),
  };
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
          plans: Object.fromEntries(
            Object.entries(PLANS).map(([k, v]) => [k, { id: v.id, label: v.label, fx: v.fx, crypto: v.crypto, free: v.free }])
          ),
          rules: RULE,
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
      "usage : node lightyear_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=eu|uk] [--json]\n" +
        "        node lightyear_cost.mjs --schedule\n" +
        "  ex.   node lightyear_cost.mjs IWDA\n" +
        "        node lightyear_cost.mjs AAPL NASDAQ USD\n" +
        "        node lightyear_cost.mjs TTE EURONEXT EUR --shares=1 --price=80\n" +
        "        node lightyear_cost.mjs HSBA LSE GBP --plan=uk"
    );
    process.exit(2);
  }

  const plan = flag("plan") || DEFAULT_PLAN;
  const out = roundTripCost({
    etf,
    place,
    currency,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (out.a == null && !out.listing) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce que Lightyear propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
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
  if (out.parts?.commission) detail.push(`courtage ${out.parts.commission}`);
  if (out.parts?.change) detail.push(`change ${out.parts.change}`);
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : FINRA et/ou spread 605" : " : rien"})`);
  console.log(`c = ${out.c} $   (par ordre${out.c ? " : ticket plat" : " : rien"})`);
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
  if (out.onlineBuy === false) console.log(`en ligne : non vendu`);
  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(
    `\ncoût = ${out.a} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ${out.b} × n + ${out.c}   ($ ; p en ${l.currency})`
  );
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency);
    const affine = amountUsd != null && out.a != null ? out.a * amountUsd + out.b * n + out.c : null;
    const billed = exactCost({ amount, market: out.feeMarket, plan: out.plan });
    console.log(
      `\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` +
        (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : "")
    );
    if (affine != null) console.log(`  a, b, c        : ${affine.toFixed(4)} $`);
    if (billed.commission != null) {
      console.log(
        `  commission     : ${Number(billed.commission).toFixed(4)} $` +
          (billed.native?.each != null ? ` (${Number(billed.native.each).toPrecision(4)} ${billed.native.currency} × 2)` : "")
      );
    }
  }
  if (out.url) console.log(`\n${out.url}`);
}
