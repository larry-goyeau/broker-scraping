// What one round trip costs at N26: buy n shares at price p, sell them
// back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in.
//
// N26 Bank SE (DE) transmits; Upvest Securities GmbH executes and keeps
// stocks / ETFs / ETCs. Crypto is Bitpanda Asset Management. App only.
// Catalogue from phone photos (`N26_scraping.mjs`); the venue on a row is
// the csv pick, not a printed N26 book.
//
//   Stocks / ETFs / ETCs     0.90 € per order (since 2026-09-02)
//   Savings plans            0  (not this trip)
//   Go / Metal               9.90 € / 16.90 € a month; 3 / 10 free stock
//                            trades (not this trip). Smart 4.90 € has none.
//   Custody                  0
//   Crypto                   1.5 % Bitcoin, 2.5 % other coins
//                            3.5 % "low-liquidity" — no published list, unused
//   Metal crypto             1 % / 2 %, up to 5 000 € / month then the standard
//   Crypto min               1 € per order
//
// The 0.90 € × 2 sits in `c`. `a` is the book plus stamp / FTT from the tax
// map. SEC / TAF stay out: the cash is euro, Upvest, no US pass-through on
// the card. FX is not printed on the invest pages (card FX is another
// product), so it stays out of `a`. Crypto has no tape: the published % × 2
// is `a`, the 1 € min is the floor. Default plan is Standard. `--plan=metal`
// only changes the crypto %.
//
// Hours 08:00–21:00 CET. No live trip in this deposit.
//
//   https://n26.com/en-de/stocks-and-etfs
//   https://support.n26.com/en-eu/app-and-features/savings-and-invest/how-stocks-and-etfs-work-at-n26
//   https://n26.com/en-eu/crypto
//   https://support.n26.com/en-eu/app-and-features/savings-and-invest/how-n26-crypto-works
//
//   node N26/N26_cost.mjs EUNL
//   node N26/N26_cost.mjs VWCE XETR EUR
//   node N26/N26_cost.mjs APC TRADEGATE EUR
//   node N26/N26_cost.mjs BTC
//   node N26/N26_cost.mjs BTC --plan=metal
//   node N26/N26_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("n26-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  stocks: "https://n26.com/en-de/stocks-and-etfs",
  stocksHelp: "https://support.n26.com/en-eu/app-and-features/savings-and-invest/how-stocks-and-etfs-work-at-n26",
  crypto: "https://n26.com/en-eu/crypto",
  cryptoHelp: "https://support.n26.com/en-eu/app-and-features/savings-and-invest/how-n26-crypto-works",
  readOn: "2026-09-12",
  equityFeeFrom: "2026-09-02",
  entity: "N26 Bank SE (DE), Upvest / Bitpanda",
};

const DEFAULT_PLAN = "standard";
const TICKET_EUR = 0.9;
const CRYPTO_MIN_EUR = 1;
const METAL_CRYPTO_CAP_EUR = 5000;

const PLANS = {
  standard: { id: "standard", label: "N26 Standard", crypto: { btc: 0.015, other: 0.025 } },
  go: { id: "go", label: "N26 Go", crypto: { btc: 0.015, other: 0.025 } },
  metal: { id: "metal", label: "N26 Metal", crypto: { btc: 0.01, other: 0.02 } },
};

const PLAN_ALIAS = {
  standard: "standard",
  std: "standard",
  free: "standard",
  smart: "standard",
  go: "go",
  metal: "metal",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));
const isBtc = (row) => /^(BTC|XBT|BITCOIN)$/i.test(String(row?.ticker || "")) || /^bitcoin$/i.test(String(row?.name || ""));

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

export function feeMarketOf(row) {
  if (isCrypto(row)) return isBtc(row) ? "btc" : "crypto";
  return "equity";
}

export function cryptoRate(plan, market) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (!picked) return null;
  return market === "btc" ? picked.crypto.btc : picked.crypto.other;
}

function remarkOf({ market } = {}) {
  if (market === "btc" || market === "crypto") return `min fees ${CRYPTO_MIN_EUR * 2} €.`;
  return "Go 9.90 €/mo: 3 free trades.\nMetal 16.90 €/mo: 10 free trades.";
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter(
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(place))) {
    const row =
      (wantCurrency && crypto.find((r) => String(r.currency).toUpperCase() === wantCurrency)) ||
      crypto.find((r) => String(r.currency).toUpperCase() === "EUR") ||
      crypto[0];
    return { named, matches: [{ row, ...listingKey(row) }] };
  }

  const exactCode = wantPlace ? named.filter((r) => !isCrypto(r) && loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named.filter((r) => !isCrypto(r));
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
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
    const market = feeMarketOf(r);
    const { venue, unsourced } = listingKey(r);
    const book = isCrypto(r)
      ? { leaf: null }
      : spreadLeaf(spreads, {
          isin: r.isin,
          mic: venue?.mic ?? null,
          currency: r.currency,
          unsourced,
        });
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function commissionEach({ amount, market, plan = DEFAULT_PLAN }) {
  if (market === "equity") return TICKET_EUR;
  const rate = cryptoRate(plan, market);
  if (rate == null) return null;
  if (amount == null || !Number.isFinite(Number(amount))) return CRYPTO_MIN_EUR;
  return Math.max(CRYPTO_MIN_EUR, Number(amount) * rate);
}

export function exactCost({ amount, market, plan = DEFAULT_PLAN }) {
  const each = commissionEach({ amount, market, plan });
  if (each == null) return { commission: null, currency: QUOTE };
  const ccy = "EUR";
  return {
    commission: dollars(each * 2, ccy),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: ccy },
    market,
    plan: planOf(plan)?.id ?? plan,
  };
}

function cryptoCost({ row, plan, answer }) {
  const market = feeMarketOf(row);
  const rate = cryptoRate(plan, market);
  const listing = {
    isin: row.isin || null,
    ticker: row.ticker || null,
    name: row.name || null,
    type: "CRYPTO",
    mic: null,
    exchange: "N26 Crypto",
    currency: String(row.currency || "EUR").toUpperCase(),
    brokerExchange: row.exchange || "CRYPTO",
  };
  const a = rate * 2;
  return {
    ...answer,
    a: finite(a, 4),
    b: 0,
    c: 0,
    floor: dollars(CRYPTO_MIN_EUR * 2, "EUR"),
    listing,
    feeMarket: market,
    plan: plan.id,
    remark: remarkOf({ market, plan }),
    parts: { commission: a },
    url: SCHEDULE.cryptoHelp,
    basis: `barème N26 Crypto ${plan.label}, lu le ${SCHEDULE.readOn}`,
    commission: {
      rate,
      min: CRYPTO_MIN_EUR,
      currency: "EUR",
      eachWay: true,
      plan: plan.id,
    },
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `N26 Crypto (Bitpanda), ${plan.label}, lu le ${SCHEDULE.readOn}. ` +
      `${(rate * 100).toFixed(1)} % par jambe` +
      (plan.id === "metal" ? ` jusqu'à ${METAL_CRYPTO_CAP_EUR} € / mois, puis 1,5 % / 2,5 %. ` : `. `) +
      `Plancher ${CRYPTO_MIN_EUR} € par ordre. ` +
      `3,5 % « low-liquidity » sans liste : non appliqué. ` +
      `Swap −30 % hors de ce trip. a = ${(a * 100).toFixed(1)} %, b = 0, c = 0. ` +
      `Pas d'aller-retour réel.`,
  };
}

export function roundTripCost({ etf, place, currency, bp = null, perShare = null, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const { named, matches } = findListing({ etf, place, currency });
  const ticketUsd = dollars(TICKET_EUR * 2, "EUR");
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

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (standard|go|metal)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue N26 n'existe pas encore : lancer `node N26/N26_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue N26` };

  const cryptoRow = named.find(isCrypto);
  if (cryptoRow && (!place || /crypto/i.test(place))) {
    return cryptoCost({ row: matches[0]?.row || cryptoRow, plan: picked, answer });
  }

  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez N26`,
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
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "EUR").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => (listing.currency === "USD" ? x : dollars(x, listing.currency)),
  });
  const a = plus(mkt.a, taxTotal);

  return {
    ...answer,
    a: finite(a, 4),
    b: finite(mkt.b, 6),
    c: ticketUsd,
    floor: null,
    listing,
    feeMarket: "equity",
    plan: picked.id,
    remark: remarkOf({ market: "equity", plan: picked }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(rates).length ? rates : null,
      ticket: TICKET_EUR,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.stocks,
    basis: `barème N26 actions / ETF / ETC, ${TICKET_EUR} € par ordre, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      each: TICKET_EUR,
      roundTrip: TICKET_EUR * 2,
      currency: "EUR",
      eachWay: true,
    },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `N26 Bank + Upvest, ticket ${TICKET_EUR} € par ordre depuis le ${SCHEDULE.equityFeeFrom} ` +
      `(lu le ${SCHEDULE.readOn}). Ticket × 2 dans c. a = carnet + taxes. ` +
      `SEC / TAF hors de a et b (carte euro, pas de pass-through imprimé). ` +
      `Plans d'épargne et les ${picked.id === "metal" ? "10" : picked.id === "go" ? "3" : "3 / 10"} ` +
      `ordres gratuits Go / Metal hors de ce trip. ` +
      `Pas d'aller-retour réel. ` +
      (leaf ? "" : `Pas de feuille de carnet pour cet ISIN / cette place. `),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, plans: PLANS, ticket: TICKET_EUR, coverage: coverage() }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node N26_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=standard|go|metal] [--json]\n" +
        "        node N26_cost.mjs --schedule\n" +
        "  ex.   node N26_cost.mjs EUNL\n" +
        "        node N26_cost.mjs VWCE XETR EUR\n" +
        "        node N26_cost.mjs BTC --plan=metal"
    );
    process.exit(2);
  }

  const out = roundTripCost({
    etf,
    place,
    currency,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (out.a == null && !out.listing) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce que N26 propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.commission) detail.push(`courtage ${out.parts.commission}`);
  if (out.parts?.ticket) detail.push(`ticket ${out.parts.ticket} €`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part)`);
  console.log(`c = ${out.c} $   (par ordre${out.parts?.ticket ? ` : ${out.parts.ticket} € × 2` : ""})`);
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
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
